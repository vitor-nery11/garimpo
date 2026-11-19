from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_evolution_service
from app.db.session import get_db
from app.models.lead import BrainSettings, Lead, Message
from app.schemas.settings import (
    BrainConfigSchema,
    BrainTestChatRequest,
    BrainTestChatResponse,
    ConnectionConfigSchema,
    TestAlertRequest,
    WhatsAppStatusOut,
)
from app.services.ai_sdr_service import AiSdrService
from app.services.defaults import (
    get_or_create_brain_settings,
    get_or_create_connection_settings,
)
from app.services.evolution_service import EvolutionService
from app.services.prospecting_service import normalize_brazil_phone

router = APIRouter(tags=['Configurações & Conexões'])


@router.get('/settings/brain', response_model=BrainConfigSchema)
async def get_brain_settings(db: AsyncSession = Depends(get_db)) -> BrainConfigSchema:
    brain = await get_or_create_brain_settings(db)
    return BrainConfigSchema(
        persona_prompt=brain.persona_prompt,
        problem_solved=brain.problem_solved,
        common_objections=brain.common_objections,
        handoff_triggers=brain.handoff_triggers,
        templates=brain.templates,  # type: ignore[arg-type]
        allowed_start_time=brain.allowed_start_time,
        allowed_end_time=brain.allowed_end_time,
        max_daily_messages=brain.max_daily_messages,
        min_interval_sec=brain.min_interval_sec,
        max_interval_sec=brain.max_interval_sec,
    )


@router.put('/settings/brain', response_model=BrainConfigSchema)
async def update_brain_settings(
    payload: BrainConfigSchema,
    db: AsyncSession = Depends(get_db),
) -> BrainConfigSchema:
    brain = await get_or_create_brain_settings(db)
    brain.persona_prompt = payload.persona_prompt
    brain.problem_solved = payload.problem_solved
    brain.common_objections = payload.common_objections
    brain.handoff_triggers = payload.handoff_triggers
    brain.templates = [t.model_dump() for t in payload.templates]
    brain.allowed_start_time = payload.allowed_start_time
    brain.allowed_end_time = payload.allowed_end_time
    brain.max_daily_messages = payload.max_daily_messages
    brain.min_interval_sec = payload.min_interval_sec
    brain.max_interval_sec = max(payload.min_interval_sec, payload.max_interval_sec)
    await db.commit()
    return payload


@router.get('/settings/connections', response_model=ConnectionConfigSchema)
async def get_connection_settings(
    db: AsyncSession = Depends(get_db),
) -> ConnectionConfigSchema:
    conn = await get_or_create_connection_settings(db)
    return ConnectionConfigSchema(
        alert_phone=conn.alert_phone,
        search_provider=conn.search_provider,  # type: ignore[arg-type]
        search_api_key=conn.search_api_key,
        ai_provider=conn.ai_provider,  # type: ignore[arg-type]
        ai_api_key=conn.ai_api_key,
    )


@router.put('/settings/connections', response_model=ConnectionConfigSchema)
async def update_connection_settings(
    payload: ConnectionConfigSchema,
    db: AsyncSession = Depends(get_db),
) -> ConnectionConfigSchema:
    conn = await get_or_create_connection_settings(db)
    conn.alert_phone = payload.alert_phone
    conn.search_provider = payload.search_provider
    conn.search_api_key = payload.search_api_key
    conn.ai_provider = payload.ai_provider
    conn.ai_api_key = payload.ai_api_key
    await db.commit()
    return payload


@router.get('/whatsapp/status', response_model=WhatsAppStatusOut)
async def get_whatsapp_status(
    evolution_service: EvolutionService = Depends(get_evolution_service),
) -> WhatsAppStatusOut:
    return await evolution_service.get_connection_state()


@router.post('/whatsapp/connect', response_model=WhatsAppStatusOut)
async def connect_whatsapp(
    evolution_service: EvolutionService = Depends(get_evolution_service),
) -> WhatsAppStatusOut:
    return await evolution_service.connect_qr_code()


@router.post('/whatsapp/logout', response_model=dict[str, bool])
async def logout_whatsapp(
    evolution_service: EvolutionService = Depends(get_evolution_service),
) -> dict[str, bool]:
    ok = await evolution_service.logout_instance()
    return {'logged_out': ok}


@router.post('/whatsapp/test-alert', response_model=dict[str, str | bool])
async def send_test_alert(
    payload: TestAlertRequest,
    evolution_service: EvolutionService = Depends(get_evolution_service),
) -> dict[str, str | bool]:
    clean_phone = normalize_brazil_phone(payload.phone)
    if len(clean_phone) < 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Número inválido. Informe com DDI + DDD (ex: 5573988323477).',
        )

    wa_status = await evolution_service.get_connection_state()
    if not wa_status.connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='WhatsApp de prospecção não está conectado. Pareie via QR Code primeiro.',
        )

    sent = await evolution_service.send_text_message(
        clean_phone,
        (
            '✅ *Teste de Alerta — Garimpo*\n\n'
            'Seu número pessoal está configurado para receber avisos em tempo real '
            'sempre que um lead ficar quente!'
        ),
    )
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='Evolution API não confirmou o envio da mensagem de teste.',
        )

    return {'sent': True, 'phone': clean_phone}


@router.post('/settings/brain/test-chat', response_model=BrainTestChatResponse)
async def test_brain_chat(
    payload: BrainTestChatRequest,
    db: AsyncSession = Depends(get_db),
) -> BrainTestChatResponse:
    conn = await get_or_create_connection_settings(db)

    simulated_lead = Lead(
        id='sim-lead',
        company_name=payload.company_name,
        niche=payload.niche,
        city=payload.city,
        neighborhood=payload.neighborhood,
        phone='5500000000000',
        diagnostic=payload.diagnostic,
        stage='em_conversa_ia',
        ai_active=True,
    )
    simulated_brain = BrainSettings(
        id=1,
        persona_prompt=payload.persona_prompt,
        problem_solved=payload.problem_solved,
        common_objections=payload.common_objections,
        handoff_triggers=payload.handoff_triggers,
        templates=[],
    )
    history = [
        Message(id=f'sim-{idx}', lead_id='sim-lead', sender=m.sender, text=m.text)
        for idx, m in enumerate(payload.messages)
    ]

    ai_service = AiSdrService()
    try:
        decision = await ai_service.evaluate_conversation(
            lead=simulated_lead,
            history=history,
            brain=simulated_brain,
            provider=conn.ai_provider,
            api_key=conn.ai_api_key,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f'Erro ao consultar a IA ({conn.ai_provider}): {exc}',
        ) from exc

    return BrainTestChatResponse(
        action=decision.action,
        reply_text=decision.reply_text,
        handoff_summary=decision.handoff_summary,
        reason=decision.reason,
        provider_used=decision.provider_used,
        model_used=decision.model_used,
    )
