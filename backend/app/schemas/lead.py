from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SiteDiagnostic = Literal['sem_site', 'so_instagram', 'possui_site']
FunnelStage = Literal[
    'na_fila',
    'abordado',
    'em_conversa_ia',
    'assumir_conversa',
    'proposta_fechado',
    'sem_interesse',
]
MessageSender = Literal['lead', 'ai', 'user']


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sender: MessageSender
    text: str
    created_at: datetime


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_name: str
    niche: str
    city: str
    neighborhood: str
    phone: str
    website_url: str | None = None
    instagram_handle: str | None = None
    diagnostic: SiteDiagnostic
    stage: FunnelStage
    ai_active: bool
    handoff_summary: str | None = None
    rating: float | None = None
    reviews_count: int | None = None
    last_message_at: datetime | None = None
    created_at: datetime
    messages: list[MessageOut] = Field(default_factory=list)


class LeadStageUpdate(BaseModel):
    stage: FunnelStage


class LeadAiToggle(BaseModel):
    ai_active: bool


class ManualMessageCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096)


class WorkerStatusOut(BaseModel):
    running: bool
    within_business_hours: bool
    whatsapp_connected: bool
    next_dispatch_seconds: int
    queue_size: int


class DailyMetricsOut(BaseModel):
    leads_extracted_today: int
    messages_sent_today: int
    replies_received_today: int
    response_rate: int
    hot_leads_count: int


class DashboardOut(BaseModel):
    worker: WorkerStatusOut
    metrics: DailyMetricsOut
    hot_leads: list[LeadOut]
    stage_counts: dict[str, int]
