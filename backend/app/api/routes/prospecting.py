from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_evolution_service,
    get_prospecting_service,
    get_redis_service,
)
from app.db.session import get_db
from app.models.lead import Lead
from app.schemas.prospecting import (
    BatchQueueRequest,
    BatchQueueResponse,
    ProspectingCandidateOut,
    ProspectingSearchRequest,
)
from app.services.defaults import get_or_create_connection_settings
from app.services.evolution_service import EvolutionService
from app.services.prospecting_service import ProspectingService, normalize_brazil_phone
from app.services.redis_service import RedisService

router = APIRouter(prefix='/prospecting', tags=['Prospecção'])


@router.post('/search', response_model=list[ProspectingCandidateOut])
async def search_prospects(
    payload: ProspectingSearchRequest,
    db: AsyncSession = Depends(get_db),
    redis_service: RedisService = Depends(get_redis_service),
    prospecting_service: ProspectingService = Depends(get_prospecting_service),
    evolution_service: EvolutionService = Depends(get_evolution_service),
) -> list[ProspectingCandidateOut]:
    conn = await get_or_create_connection_settings(db)
    existing_result = await db.execute(select(Lead.phone))
    existing_phones = {row[0] for row in existing_result.all()}

    candidates = await prospecting_service.search(
        city=payload.city,
        niche=payload.niche,
        limit=payload.limit,
        provider=conn.search_provider,
        api_key=conn.search_api_key,
        existing_phones=existing_phones,
    )

    if candidates:
        wa_map = await evolution_service.check_whatsapp_numbers(
            [c.phone for c in candidates]
        )
        for c in candidates:
            c.has_whatsapp = wa_map.get(c.phone, True)
        await redis_service.increment_daily_stat('extracted', len(candidates))

    return candidates


@router.post('/queue', response_model=BatchQueueResponse)
async def enqueue_prospects(
    payload: BatchQueueRequest,
    db: AsyncSession = Depends(get_db),
    redis_service: RedisService = Depends(get_redis_service),
) -> BatchQueueResponse:
    existing_result = await db.execute(select(Lead.phone))
    existing_phones = {row[0] for row in existing_result.all()}

    created_ids: list[str] = []
    skipped = 0

    for item in payload.candidates:
        phone = normalize_brazil_phone(item.phone)
        if not phone or phone in existing_phones:
            skipped += 1
            continue

        lead = Lead(
            company_name=item.company_name,
            niche=item.niche,
            city=item.city,
            neighborhood=item.neighborhood,
            phone=phone,
            website_url=item.website_url,
            instagram_handle=item.instagram_handle,
            diagnostic=item.diagnostic,
            stage='na_fila',
            ai_active=True,
            rating=item.rating,
            reviews_count=item.reviews_count,
        )
        db.add(lead)
        await db.flush()
        existing_phones.add(phone)
        created_ids.append(lead.id)

    await db.commit()

    for lead_id in created_ids:
        await redis_service.enqueue_lead(lead_id)

    return BatchQueueResponse(
        enqueued_count=len(created_ids),
        skipped_duplicates=skipped,
        lead_ids=created_ids,
    )
