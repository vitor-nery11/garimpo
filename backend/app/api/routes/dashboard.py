from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_evolution_service, get_redis_service
from app.core.config import get_settings
from app.db.session import get_db
from app.models.lead import Lead
from app.schemas.lead import DailyMetricsOut, DashboardOut, WorkerStatusOut
from app.services.defaults import get_or_create_brain_settings, is_within_business_hours
from app.services.evolution_service import EvolutionService
from app.services.redis_service import RedisService

router = APIRouter(tags=['Dashboard & Worker'])


@router.get('/dashboard', response_model=DashboardOut)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    redis_service: RedisService = Depends(get_redis_service),
    evolution_service: EvolutionService = Depends(get_evolution_service),
) -> DashboardOut:
    settings = get_settings()
    brain = await get_or_create_brain_settings(db)

    leads_result = await db.execute(
        select(Lead).options(selectinload(Lead.messages)).order_by(Lead.last_message_at.desc())
    )
    all_leads = list(leads_result.scalars().all())
    hot_leads = [lead for lead in all_leads if lead.stage == 'assumir_conversa']

    stage_counts: dict[str, int] = {
        'na_fila': 0,
        'abordado': 0,
        'em_conversa_ia': 0,
        'assumir_conversa': 0,
        'proposta_fechado': 0,
        'sem_interesse': 0,
    }
    for lead in all_leads:
        stage_counts[lead.stage] = stage_counts.get(lead.stage, 0) + 1

    extracted_today = await redis_service.get_daily_stat('extracted')
    sent_today = await redis_service.get_daily_stat('sent')
    replies_today = await redis_service.get_daily_stat('replies')
    response_rate = round((replies_today / sent_today) * 100) if sent_today > 0 else 0

    wa_status = await evolution_service.get_connection_state()
    within_hours = is_within_business_hours(
        brain.allowed_start_time, brain.allowed_end_time, settings.timezone
    )

    worker = WorkerStatusOut(
        running=await redis_service.is_worker_running(),
        within_business_hours=within_hours,
        whatsapp_connected=wa_status.connected,
        next_dispatch_seconds=await redis_service.get_next_dispatch_seconds(),
        queue_size=await redis_service.queue_size(),
    )

    metrics = DailyMetricsOut(
        leads_extracted_today=extracted_today,
        messages_sent_today=sent_today,
        replies_received_today=replies_today,
        response_rate=response_rate,
        hot_leads_count=len(hot_leads),
    )

    return DashboardOut(
        worker=worker,
        metrics=metrics,
        hot_leads=hot_leads[:5],  # type: ignore[arg-type]
        stage_counts=stage_counts,
    )


@router.post('/worker/toggle', response_model=dict[str, bool])
async def toggle_worker(
    redis_service: RedisService = Depends(get_redis_service),
) -> dict[str, bool]:
    current = await redis_service.is_worker_running()
    next_state = not current
    await redis_service.set_worker_running(next_state)
    return {'running': next_state}
