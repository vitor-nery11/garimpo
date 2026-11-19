import asyncio
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.deps import get_evolution_service, get_redis_service
from app.db.session import Base, get_db
from app.main import create_app
from app.schemas.settings import WhatsAppStatusOut
from app.services.ai_sdr_service import AiSdrService
from app.services.prospecting_service import (
    ProspectingService,
    _extract_neighborhood_from_address,
    classify_website,
    normalize_brazil_phone,
)
from app.services.redis_service import RedisService
from app.worker.main import process_one_dispatch, process_ready_debounces


@pytest_asyncio.fixture
async def test_env() -> AsyncGenerator[dict, None]:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:', echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )

    fake_redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    redis_service = RedisService(fake_redis_client)

    evolution_mock = AsyncMock()
    evolution_mock.get_connection_state.return_value = WhatsAppStatusOut(
        connected=True, state='open', instance_name='test_instance'
    )
    evolution_mock.check_whatsapp_numbers.side_effect = lambda phones: {
        p: True for p in phones
    }
    evolution_mock.send_text_message.return_value = True
    evolution_mock.send_hot_lead_alert.return_value = True

    app = create_app()

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis_service] = lambda: redis_service
    app.dependency_overrides[get_evolution_service] = lambda: evolution_mock
    app.state.redis_service = redis_service

    yield {
        'app': app,
        'session_factory': session_factory,
        'redis_service': redis_service,
        'evolution_mock': evolution_mock,
    }

    await redis_service.close()
    await engine.dispose()


def test_classify_website_variants():
    diag1, web1, ig1 = classify_website(None)
    assert diag1 == 'sem_site'
    assert web1 is None and ig1 is None

    diag2, web2, ig2 = classify_website('https://www.instagram.com/clinicamodelo/')
    assert diag2 == 'so_instagram'
    assert web2 is None and ig2 == '@clinicamodelo'

    diag3, web3, _ = classify_website('https://linktr.ee/oficinatop')
    assert diag3 == 'so_instagram'
    assert web3 is None

    diag4, web4, ig4 = classify_website('odontopaulista.com.br')
    assert diag4 == 'possui_site'
    assert web4 == 'https://odontopaulista.com.br'
    assert ig4 is None


def test_normalize_brazil_phone():
    assert normalize_brazil_phone('(11) 98842-1094') == '5511988421094'
    assert normalize_brazil_phone('+55 19 99123-4478') == '5519991234478'
    assert (
        _extract_neighborhood_from_address(
            'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100'
        )
        == 'Bela Vista'
    )


@pytest.mark.asyncio
async def test_full_prospecting_dispatch_webhook_debounce_and_manual_takeover(
    test_env, monkeypatch
):
    app = test_env['app']
    session_factory = test_env['session_factory']
    redis_service: RedisService = test_env['redis_service']
    evolution_mock = test_env['evolution_mock']

    async def fake_playwright_search(self, *, city, niche, limit, existing_phones):
        return self._fallback_candidates(
            city=city, niche=niche, limit=limit, existing_phones=existing_phones
        )

    monkeypatch.setattr(ProspectingService, '_search_playwright', fake_playwright_search)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        # 1. Health & Default Connection Settings
        r_health = await client.get('/api/v1/health')
        assert r_health.status_code == 200
        assert r_health.json()['status'] == 'ok'

        r_conn = await client.get('/api/v1/settings/connections')
        assert r_conn.status_code == 200
        conn_data = r_conn.json()
        assert conn_data['search_provider'] == 'playwright'
        assert conn_data['ai_provider'] == 'gemini'
        assert conn_data['alert_phone'] == '5573988323477'

        # 2. Prospecting search via Playwright provider
        r_search = await client.post(
            '/api/v1/prospecting/search',
            json={'city': 'São Paulo', 'niche': 'Clínica Odontológica', 'limit': 3},
        )
        assert r_search.status_code == 200
        candidates = r_search.json()
        assert len(candidates) == 3

        # 3. Enqueue eligible candidate
        eligible = [c for c in candidates if c['diagnostic'] != 'possui_site']
        assert len(eligible) >= 1
        r_queue = await client.post(
            '/api/v1/prospecting/queue',
            json={'candidates': [eligible[0]]},
        )
        assert r_queue.status_code == 200
        q_data = r_queue.json()
        assert q_data['enqueued_count'] == 1
        lead_id = q_data['lead_ids'][0]

        # 4. Worker dispatches first message (force business hours check via brain update)
        r_brain = await client.get('/api/v1/settings/brain')
        brain_payload = r_brain.json()
        brain_payload['allowed_start_time'] = '00:00'
        brain_payload['allowed_end_time'] = '23:59'
        await client.put('/api/v1/settings/brain', json=brain_payload)

        delay = await process_one_dispatch(
            session_factory=session_factory,
            redis_service=redis_service,
            evolution_service=evolution_mock,
        )
        assert delay >= 60
        evolution_mock.send_text_message.assert_awaited()

        # Verify lead moved to 'abordado'
        r_lead = await client.get(f'/api/v1/leads/{lead_id}')
        assert r_lead.json()['stage'] == 'abordado'
        assert len(r_lead.json()['messages']) == 1

        # 5. Simulate fragmented WhatsApp messages via Evolution Webhook (debounce)
        phone = eligible[0]['phone']
        for idx, txt in enumerate(['Oi!', 'Tudo bem?', 'Quanto custa o orçamento?']):
            r_wh = await client.post(
                '/api/v1/webhooks/evolution',
                json={
                    'event': 'messages.upsert',
                    'instance': 'test_instance',
                    'data': {
                        'key': {
                            'id': f'msg-ext-{idx}',
                            'fromMe': False,
                            'remoteJid': f'{phone}@s.whatsapp.net',
                        },
                        'message': {'conversation': txt},
                    },
                },
            )
            assert r_wh.status_code == 200
            assert r_wh.json()['status'] == 'buffered_for_ai'

        # Force debounce expiry in FakeRedis so worker processes immediately
        await redis_service.client.set(f'garimpo:debounce:until:{lead_id}', '0')

        processed = await process_ready_debounces(
            session_factory=session_factory,
            redis_service=redis_service,
            evolution_service=evolution_mock,
            ai_service=AiSdrService(),
        )
        assert processed == 1

        # Offline heuristic detects "orçamento" -> triggers handoff ('assumir_conversa') + pauses AI
        r_lead_after_ai = await client.get(f'/api/v1/leads/{lead_id}')
        lead_after = r_lead_after_ai.json()
        assert lead_after['stage'] == 'assumir_conversa'
        assert lead_after['ai_active'] is False
        assert lead_after['handoff_summary'] is not None

        # 6. Manual message from human disables AI and records sender='user'
        await client.patch(f'/api/v1/leads/{lead_id}/ai', json={'ai_active': True})
        r_manual = await client.post(
            f'/api/v1/leads/{lead_id}/messages',
            json={'text': 'Olá! Aqui é o Vitor, vou te enviar os valores.'},
        )
        assert r_manual.status_code == 201
        assert r_manual.json()['sender'] == 'user'

        r_lead_final = await client.get(f'/api/v1/leads/{lead_id}')
        assert r_lead_final.json()['ai_active'] is False

        # 7. Dashboard reflects metrics and hot lead
        r_dash = await client.get('/api/v1/dashboard')
        assert r_dash.status_code == 200
        dash = r_dash.json()
        assert dash['metrics']['hot_leads_count'] == 1
        assert dash['metrics']['replies_received_today'] == 3


@pytest.mark.asyncio
async def test_redis_concurrency_lock(test_env):
    redis_service: RedisService = test_env['redis_service']
    token1 = await redis_service.acquire_lead_lock('lead-xyz', ttl_seconds=10)
    assert token1 is not None
    token2 = await redis_service.acquire_lead_lock('lead-xyz', ttl_seconds=10)
    assert token2 is None  # Second concurrent worker is blocked
    await redis_service.release_lead_lock('lead-xyz', token1)
    token3 = await redis_service.acquire_lead_lock('lead-xyz', ttl_seconds=10)
    assert token3 is not None
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_send_test_alert_endpoint(test_env):
    app = test_env['app']
    evolution_mock = test_env['evolution_mock']
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url='http://test') as client:
        r = await client.post(
            '/api/v1/whatsapp/test-alert',
            json={'phone': '5573988323477'},
        )
        assert r.status_code == 200
        assert r.json() == {'sent': True, 'phone': '5573988323477'}
        evolution_mock.send_text_message.assert_awaited()
