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


def extract_message_text(data: dict) -> str:
    """Extract text from standard, extended, ephemeral, button, or captioned WhatsApp messages."""
    msg = data.get('message', {}) or {}
    if not isinstance(msg, dict):
        return ''

    # Unwrap ephemeral / view-once / edited containers
    for wrapper in ('ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2'):
        wrapped = msg.get(wrapper)
        if isinstance(wrapped, dict) and isinstance(wrapped.get('message'), dict):
            msg = wrapped['message']
            break

    if isinstance(msg.get('conversation'), str):
        return msg['conversation']

    ext = msg.get('extendedTextMessage')
    if isinstance(ext, dict) and isinstance(ext.get('text'), str):
        return ext['text']

    for media_key in ('imageMessage', 'videoMessage', 'documentMessage'):
        media = msg.get(media_key)
        if isinstance(media, dict) and isinstance(media.get('caption'), str):
            return media['caption']

    btn = msg.get('buttonsResponseMessage')
    if isinstance(btn, dict) and isinstance(btn.get('selectedDisplayText'), str):
        return btn['selectedDisplayText']

    lst = msg.get('listResponseMessage')
    if isinstance(lst, dict) and isinstance(lst.get('title'), str):
        return lst['title']

    return ''


def extract_phone_from_key(key: dict, data: dict | None = None) -> str:
    """Resolve real phone number from Evolution API v2 key, handling @lid via remoteJidAlt."""
    remote_jid = str(key.get('remoteJid') or '')
    remote_jid_alt = str(key.get('remoteJidAlt') or '')
    participant = str(key.get('participant') or '')
    sender_pn = str((data or {}).get('senderPn') or '')

    if remote_jid.endswith('@g.us') or remote_jid == 'status@broadcast':
        return ''

    # Prefer explicit phone JIDs (@s.whatsapp.net) over @lid identifiers
    candidates = [remote_jid, remote_jid_alt, sender_pn, participant]
    for jid in candidates:
        if jid and '@s.whatsapp.net' in jid:
            return normalize_brazil_phone(jid.split('@')[0])

    for jid in candidates:
        if jid and not jid.endswith('@lid') and not jid.endswith('@g.us'):
            phone = normalize_brazil_phone(jid.split('@')[0])
            if len(phone) >= 10:
                return phone

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
    from_me = bool(key.get('fromMe'))

    phone = extract_phone_from_key(key, data)
    text = extract_message_text(data).strip()
    if not phone or not text:
        return {'status': 'ignored', 'reason': 'empty_phone_or_text'}

    # Ignore internal hot-lead alert messages sent to the owner's alert number
    if from_me and text.startswith('🔥 *LEAD QUENTE NO GARIMPO*'):
        return {'status': 'ignored', 'reason': 'internal_alert_message'}

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

    # If message was sent fromMe (either by our Worker/API or manually on the user's phone),
    # avoid duplicating messages already persisted by the API/Worker, and capture manual phone replies.
    if from_me:
        existing_same_text = await db.execute(
            select(Message.id)
            .where(Message.lead_id == lead.id, Message.text == text)
            .limit(1)
        )
        if existing_same_text.scalar_one_or_none() is not None:
            return {'status': 'ignored', 'reason': 'already_recorded_outgoing'}

        now = datetime.now(timezone.utc)
        db.add(
            Message(
                lead_id=lead.id,
                sender='user',
                text=text,
                external_id=external_id,
                created_at=now,
            )
        )
        lead.ai_active = False
        lead.last_message_at = now
        await db.commit()
        return {'status': 'stored_manual_from_phone', 'lead_id': lead.id}

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
