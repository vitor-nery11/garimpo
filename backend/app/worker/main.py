import asyncio
import logging
import random
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.lead import Lead, Message
from app.services.ai_sdr_service import AiSdrService
from app.services.defaults import (
    get_or_create_brain_settings,
    get_or_create_connection_settings,
    is_within_business_hours,
)
from app.services.evolution_service import EvolutionService
from app.services.redis_service import RedisService

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)
logger = logging.getLogger('garimpo.worker')


def render_first_message(template_text: str, lead: Lead) -> str:
    return (
        template_text.replace('{nome_empresa}', lead.company_name)
        .replace('{cidade}', lead.city)
        .replace('{nicho}', lead.niche)
    )


async def process_one_dispatch(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    redis_service: RedisService,
    evolution_service: EvolutionService,
    tz_name: str = 'America/Sao_Paulo',
) -> int:
    """Process at most 1 queued lead and return the anti-ban delay in seconds (0 if idle)."""
    if not await redis_service.is_worker_running():
        return 5

    async with session_factory() as db:
        brain = await get_or_create_brain_settings(db)
        if not is_within_business_hours(
            brain.allowed_start_time, brain.allowed_end_time, tz_name
        ):
            return 30

        sent_today = await redis_service.get_daily_stat('sent')
        if sent_today >= brain.max_daily_messages:
            logger.info('Limite diário de disparos atingido (%s).', brain.max_daily_messages)
            return 60

        lead_id = await redis_service.dequeue_lead()
        if not lead_id:
            return 3

        lock_token = await redis_service.acquire_lead_lock(lead_id, ttl_seconds=45)
        if not lock_token:
            await redis_service.enqueue_lead(lead_id)
            return 2

        try:
            result = await db.execute(select(Lead).where(Lead.id == lead_id))
            lead = result.scalar_one_or_none()
            if lead is None or lead.stage != 'na_fila' or not lead.ai_active:
                return 1

            templates = brain.templates or []
            if not templates:
                return 10

            chosen = templates[sent_today % len(templates)]
            text = render_first_message(chosen.get('content', ''), lead)

            sent_ok = await evolution_service.send_text_message(lead.phone, text)
            if not sent_ok:
                logger.warning(
                    'Falha ao enviar via Evolution API para %s (%s). Mantendo histórico.',
                    lead.company_name,
                    lead.phone,
                )

            now = datetime.now(timezone.utc)
            db.add(Message(lead_id=lead.id, sender='ai', text=text, created_at=now))
            lead.stage = 'abordado'
            lead.last_message_at = now
            await db.commit()

            await redis_service.increment_daily_stat('sent', 1)

            min_s = max(10, brain.min_interval_sec)
            max_s = max(min_s, brain.max_interval_sec)
            delay = random.randint(min_s, max_s)
            await redis_service.set_next_dispatch_at(time.time() + delay)
            logger.info(
                '1ª mensagem disparada para %s (%s). Próximo disparo em %ss.',
                lead.company_name,
                lead.phone,
                delay,
            )
            return delay
        finally:
            await redis_service.release_lead_lock(lead_id, lock_token)


async def process_ready_debounces(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    redis_service: RedisService,
    evolution_service: EvolutionService,
    ai_service: AiSdrService,
) -> int:
    """Process all leads whose ~10s inbound message debounce window has expired."""
    ready_ids = await redis_service.get_ready_debounce_lead_ids()
    if not ready_ids:
        return 0

    processed = 0
    for lead_id in ready_ids:
        lock_token = await redis_service.acquire_lead_lock(lead_id, ttl_seconds=45)
        if not lock_token:
            continue

        try:
            buffered = await redis_service.pop_debounce_messages(lead_id)
            if not buffered:
                continue

            async with session_factory() as db:
                result = await db.execute(
                    select(Lead)
                    .options(selectinload(Lead.messages))
                    .where(Lead.id == lead_id)
                )
                lead = result.scalar_one_or_none()
                if lead is None or not lead.ai_active:
                    continue

                brain = await get_or_create_brain_settings(db)
                conn = await get_or_create_connection_settings(db)

                decision = await ai_service.evaluate_conversation(
                    lead=lead,
                    history=list(lead.messages),
                    brain=brain,
                    provider=conn.ai_provider,
                    api_key=conn.ai_api_key,
                )

                now = datetime.now(timezone.utc)
                if decision.action == 'handoff':
                    lead.ai_active = False
                    lead.stage = 'assumir_conversa'
                    lead.handoff_summary = decision.handoff_summary
                    lead.last_message_at = now
                    await db.commit()

                    await evolution_service.send_hot_lead_alert(
                        alert_phone=conn.alert_phone,
                        company_name=lead.company_name,
                        lead_phone=lead.phone,
                        summary=decision.handoff_summary or 'Lead pediu atendimento humano.',
                    )
                    logger.info(
                        'Transbordo acionado pela IA para %s (%s).',
                        lead.company_name,
                        decision.reason,
                    )
                elif decision.reply_text:
                    await evolution_service.send_text_message(
                        lead.phone, decision.reply_text
                    )
                    db.add(
                        Message(
                            lead_id=lead.id,
                            sender='ai',
                            text=decision.reply_text,
                            created_at=now,
                        )
                    )
                    lead.stage = 'em_conversa_ia'
                    lead.last_message_at = now
                    await db.commit()
                    await redis_service.increment_daily_stat('sent', 1)
                    logger.info('IA respondeu para %s.', lead.company_name)

                processed += 1
        finally:
            await redis_service.release_lead_lock(lead_id, lock_token)

    return processed


async def dispatch_loop(
    redis_service: RedisService, evolution_service: EvolutionService
) -> None:
    settings = get_settings()
    while True:
        try:
            wait_seconds = await process_one_dispatch(
                session_factory=AsyncSessionLocal,
                redis_service=redis_service,
                evolution_service=evolution_service,
                tz_name=settings.timezone,
            )
            await asyncio.sleep(max(1, wait_seconds))
        except Exception as exc:
            logger.exception('Erro no loop de disparos: %s', exc)
            await asyncio.sleep(5)


async def debounce_loop(
    redis_service: RedisService,
    evolution_service: EvolutionService,
    ai_service: AiSdrService,
) -> None:
    while True:
        try:
            await process_ready_debounces(
                session_factory=AsyncSessionLocal,
                redis_service=redis_service,
                evolution_service=evolution_service,
                ai_service=ai_service,
            )
        except Exception as exc:
            logger.exception('Erro no loop de debounce IA: %s', exc)
        await asyncio.sleep(1.5)


async def run_worker() -> None:
    redis_service = RedisService.from_settings()
    evolution_service = EvolutionService()
    ai_service = AiSdrService()
    logger.info('Garimpo Worker iniciado (Disparos + Debounce IA).')
    try:
        await asyncio.gather(
            dispatch_loop(redis_service, evolution_service),
            debounce_loop(redis_service, evolution_service, ai_service),
        )
    finally:
        await redis_service.close()


if __name__ == '__main__':
    asyncio.run(run_worker())
