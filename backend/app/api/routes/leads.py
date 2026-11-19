from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_evolution_service, get_redis_service
from app.api.routes.webhooks import extract_message_text, extract_phone_from_key
from app.db.session import get_db
from app.models.lead import Lead, Message
from app.schemas.lead import (
    LeadAiToggle,
    LeadOut,
    LeadStageUpdate,
    ManualMessageCreate,
    MessageOut,
)
from app.services.evolution_service import EvolutionService
from app.services.prospecting_service import brazil_phone_variants
from app.services.redis_service import RedisService

router = APIRouter(prefix='/leads', tags=['Funil & Central de Chat'])


async def _get_lead_or_404(db: AsyncSession, lead_id: str) -> Lead:
    result = await db.execute(
        select(Lead).options(selectinload(Lead.messages)).where(Lead.id == lead_id)
    )
    lead = result.scalar_one_or_none()
    if lead is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Lead não encontrado.',
        )
    return lead


@router.post('/sync-whatsapp', response_model=dict[str, int])
async def sync_whatsapp_messages(
    db: AsyncSession = Depends(get_db),
    evolution_service: EvolutionService = Depends(get_evolution_service),
) -> dict[str, int]:
    """Pull recent WhatsApp messages from Evolution API and backfill missing replies for known leads."""
    await evolution_service.ensure_webhook()
    records = await evolution_service.fetch_recent_messages(limit=300)
    if not records:
        return {'synced_messages': 0, 'updated_leads': 0}

    leads_res = await db.execute(select(Lead).options(selectinload(Lead.messages)))
    all_leads = list(leads_res.scalars().all())
    if not all_leads:
        return {'synced_messages': 0, 'updated_leads': 0}

    # Build lookup map covering both 12-digit and 13-digit BR phone variants
    phone_to_lead: dict[str, Lead] = {}
    existing_ext_ids: set[str] = set()
    existing_lead_texts: dict[str, set[str]] = {}

    for lead in all_leads:
        for variant in brazil_phone_variants(lead.phone):
            phone_to_lead[variant] = lead
        existing_lead_texts[lead.id] = {m.text.strip() for m in lead.messages}
        for m in lead.messages:
            if m.external_id:
                existing_ext_ids.add(m.external_id)

    # Sort Evolution records chronologically (oldest first)
    records_sorted = sorted(
        records,
        key=lambda r: int(r.get('messageTimestamp') or 0),
    )

    synced_messages = 0
    updated_lead_ids: set[str] = set()

    for rec in records_sorted:
        key = rec.get('key', {}) or {}
        phone = extract_phone_from_key(key, rec)
        if not phone:
            continue

        lead: Lead | None = None
        for variant in brazil_phone_variants(phone):
            if variant in phone_to_lead:
                lead = phone_to_lead[variant]
                break
        if lead is None:
            continue

        text = extract_message_text(rec).strip()
        if not text:
            continue

        from_me = bool(key.get('fromMe'))
        if from_me and text.startswith('🔥 *LEAD QUENTE NO GARIMPO*'):
            continue

        ext_id = str(key.get('id') or '') or None
        if ext_id and ext_id in existing_ext_ids:
            continue
        if text in existing_lead_texts[lead.id]:
            continue

        ts_raw = rec.get('messageTimestamp')
        try:
            msg_dt = datetime.fromtimestamp(int(ts_raw), tz=timezone.utc)
        except Exception:
            msg_dt = datetime.now(timezone.utc)

        sender = 'user' if from_me else 'lead'
        db.add(
            Message(
                lead_id=lead.id,
                sender=sender,
                text=text,
                external_id=ext_id,
                created_at=msg_dt,
            )
        )
        if ext_id:
            existing_ext_ids.add(ext_id)
        existing_lead_texts[lead.id].add(text)

        lead_last = (
            lead.last_message_at.replace(tzinfo=timezone.utc)
            if lead.last_message_at and lead.last_message_at.tzinfo is None
            else lead.last_message_at
        )
        if lead_last is None or msg_dt > lead_last:
            lead.last_message_at = msg_dt
        if sender == 'lead' and lead.stage in ('na_fila', 'abordado') and lead.ai_active:
            lead.stage = 'em_conversa_ia'

        synced_messages += 1
        updated_lead_ids.add(lead.id)

    if synced_messages > 0:
        await db.commit()

    return {
        'synced_messages': synced_messages,
        'updated_leads': len(updated_lead_ids),
    }


@router.get('', response_model=list[LeadOut])
async def list_leads(
    stage: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[LeadOut]:
    query = select(Lead).options(selectinload(Lead.messages)).order_by(Lead.updated_at.desc())
    if stage:
        query = query.where(Lead.stage == stage)
    result = await db.execute(query)
    return list(result.scalars().all())  # type: ignore[return-value]


@router.get('/{lead_id}', response_model=LeadOut)
async def get_lead(lead_id: str, db: AsyncSession = Depends(get_db)) -> LeadOut:
    return await _get_lead_or_404(db, lead_id)  # type: ignore[return-value]


@router.delete('/{lead_id}', response_model=dict[str, bool])
async def delete_lead(lead_id: str, db: AsyncSession = Depends(get_db)) -> dict[str, bool]:
    lead = await _get_lead_or_404(db, lead_id)
    await db.delete(lead)
    await db.commit()
    return {'deleted': True}


@router.patch('/{lead_id}/stage', response_model=LeadOut)
async def update_lead_stage(
    lead_id: str,
    payload: LeadStageUpdate,
    db: AsyncSession = Depends(get_db),
) -> LeadOut:
    lead = await _get_lead_or_404(db, lead_id)
    lead.stage = payload.stage
    if payload.stage in ('assumir_conversa', 'proposta_fechado', 'sem_interesse'):
        lead.ai_active = False
    await db.commit()
    return await _get_lead_or_404(db, lead_id)  # type: ignore[return-value]


@router.patch('/{lead_id}/ai', response_model=LeadOut)
async def toggle_lead_ai(
    lead_id: str,
    payload: LeadAiToggle,
    db: AsyncSession = Depends(get_db),
) -> LeadOut:
    lead = await _get_lead_or_404(db, lead_id)
    lead.ai_active = payload.ai_active
    await db.commit()
    return await _get_lead_or_404(db, lead_id)  # type: ignore[return-value]


@router.post('/{lead_id}/messages', response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def send_manual_message(
    lead_id: str,
    payload: ManualMessageCreate,
    db: AsyncSession = Depends(get_db),
    evolution_service: EvolutionService = Depends(get_evolution_service),
    redis_service: RedisService = Depends(get_redis_service),
) -> MessageOut:
    lead = await _get_lead_or_404(db, lead_id)

    # Disparo via Evolution API (best-effort; registra histórico mesmo em modo offline)
    await evolution_service.send_text_message(lead.phone, payload.text)

    now = datetime.now(timezone.utc)
    msg = Message(lead_id=lead.id, sender='user', text=payload.text, created_at=now)
    db.add(msg)

    # Regra de negócio: mensagem manual desliga a IA automaticamente para este contato
    lead.ai_active = False
    lead.last_message_at = now
    if lead.stage in ('na_fila', 'abordado'):
        lead.stage = 'assumir_conversa'

    await db.commit()
    await db.refresh(msg)
    await redis_service.increment_daily_stat('sent', 1)

    return msg  # type: ignore[return-value]
