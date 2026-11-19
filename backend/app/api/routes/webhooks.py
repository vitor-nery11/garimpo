from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_redis_service
from app.core.config import get_settings
from app.db.session import get_db
from app.models.lead import Lead, Message
from app.schemas.webhook import EvolutionWebhookPayload
from app.services.prospecting_service import (
    brazil_phone_variants,
    normalize_brazil_phone,
)
from app.services.redis_service import RedisService

router = APIRouter(prefix='/webhooks', tags=['Webhooks'])


def _extract_message_text(data: dict) -> str:
    msg = data.get('message', {}) or {}
    if isinstance(msg.get('conversation'), str):
        return msg['conversation']
    ext = msg.get('extendedTextMessage') or {}
    if isinstance(ext.get('text'), str):
        return ext['text']
    return ''


@router.post('/evolution')
async def handle_evolution_webhook(
    payload: EvolutionWebhookPayload,
    db: AsyncSession = Depends(get_db),
    redis_service: RedisService = Depends(get_redis_service),
) -> dict[str, str]:
    event_name = payload.event.lower().replace('_', '.')
    if event_name not in ('messages.upsert', 'messages_upsert'):
        return {'status': 'ignored', 'reason': 'non_message_event'}

    data = payload.data
    key = data.get('key', {}) or {}
    if key.get('fromMe'):
        return {'status': 'ignored', 'reason': 'outgoing_message'}

    remote_jid = str(key.get('remoteJid', ''))
    if not remote_jid or remote_jid.endswith('@g.us'):
        return {'status': 'ignored', 'reason': 'group_or_empty_jid'}

    raw_phone = remote_jid.split('@')[0]
    phone = normalize_brazil_phone(raw_phone)
    text = _extract_message_text(data).strip()
    if not phone or not text:
        return {'status': 'ignored', 'reason': 'empty_phone_or_text'}

    phone_candidates = brazil_phone_variants(phone)
    result = await db.execute(select(Lead).where(Lead.phone.in_(phone_candidates)))
    lead = result.scalar_one_or_none()
    if lead is None:
        return {'status': 'ignored', 'reason': 'unknown_lead'}

    external_id = str(key.get('id', '')) or None
    if external_id:
        dup_check = await db.execute(
            select(Message.id).where(Message.external_id == external_id)
        )
        if dup_check.scalar_one_or_none() is not None:
            return {'status': 'ignored', 'reason': 'duplicate_message'}

    now = datetime.now(timezone.utc)
    db.add(
        Message(
            lead_id=lead.id,
            sender='lead',
            text=text,
            external_id=external_id,
            created_at=now,
        )
    )
    lead.last_message_at = now
    if lead.stage in ('na_fila', 'abordado') and lead.ai_active:
        lead.stage = 'em_conversa_ia'

    await db.commit()
    await redis_service.increment_daily_stat('replies', 1)

    if lead.ai_active:
        settings = get_settings()
        await redis_service.push_debounce_message(
            lead.id, text, debounce_seconds=settings.debounce_seconds
        )
        return {'status': 'buffered_for_ai', 'lead_id': lead.id}

    return {'status': 'stored_ai_paused', 'lead_id': lead.id}
