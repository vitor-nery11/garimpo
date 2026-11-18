from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_evolution_service, get_redis_service
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
