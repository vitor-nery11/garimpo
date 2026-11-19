from typing import Literal

from pydantic import BaseModel, Field


class MessageTemplateSchema(BaseModel):
    id: str
    label: str
    content: str = Field(..., min_length=5)


class BrainConfigSchema(BaseModel):
    persona_prompt: str = Field(..., min_length=10)
    problem_solved: str = Field(..., min_length=10)
    common_objections: str = ''
    handoff_triggers: str = ''
    templates: list[MessageTemplateSchema] = Field(..., min_length=1)
    allowed_start_time: str = Field(default='08:30', pattern=r'^\d{2}:\d{2}$')
    allowed_end_time: str = Field(default='18:00', pattern=r'^\d{2}:\d{2}$')
    max_daily_messages: int = Field(default=60, ge=1, le=500)
    min_interval_sec: int = Field(default=60, ge=10, le=3600)
    max_interval_sec: int = Field(default=240, ge=15, le=3600)


class ConnectionConfigSchema(BaseModel):
    alert_phone: str = '5573988323477'
    search_provider: Literal['playwright', 'google_places', 'serper'] = 'playwright'
    search_api_key: str = ''
    ai_provider: Literal['openai', 'gemini'] = 'gemini'
    ai_api_key: str = ''


class WhatsAppStatusOut(BaseModel):
    connected: bool
    state: str
    instance_name: str
    phone: str | None = None
    qr_code_base64: str | None = None


class TestAlertRequest(BaseModel):
    phone: str = Field(..., min_length=8, max_length=32)


class BrainTestMessage(BaseModel):
    sender: Literal['lead', 'ai']
    text: str = Field(..., min_length=1, max_length=4096)


class BrainTestChatRequest(BaseModel):
    company_name: str = Field(default='Clínica Odonto Sorriso Vivo', min_length=1, max_length=255)
    niche: str = Field(default='Clínica Odontológica', min_length=1, max_length=120)
    city: str = Field(default='São Paulo', min_length=1, max_length=120)
    neighborhood: str = Field(default='Centro', max_length=120)
    diagnostic: Literal['sem_site', 'so_instagram', 'possui_site'] = 'so_instagram'
    persona_prompt: str = Field(..., min_length=5)
    problem_solved: str = Field(..., min_length=5)
    common_objections: str = ''
    handoff_triggers: str = ''
    messages: list[BrainTestMessage] = Field(..., min_length=1)


class BrainTestChatResponse(BaseModel):
    action: Literal['reply', 'handoff', 'wrong_channel']
    reply_text: str | None = None
    handoff_summary: str | None = None
    reason: str | None = None
    alternative_channel: str | None = None
    provider_used: str
    model_used: str


class BrainTestWhatsAppRequest(BaseModel):
    phone: str | None = None
    company_name: str = Field(default='Clínica Odonto Sorriso Vivo', min_length=1, max_length=255)
    niche: str = Field(default='Clínica Odontológica', min_length=1, max_length=120)
    city: str = Field(default='São Paulo', min_length=1, max_length=120)
    neighborhood: str = Field(default='Centro', max_length=120)
    diagnostic: Literal['sem_site', 'so_instagram', 'possui_site'] = 'so_instagram'
    persona_prompt: str = Field(..., min_length=5)
    problem_solved: str = Field(..., min_length=5)
    common_objections: str = ''
    handoff_triggers: str = ''
    opening_message: str | None = None


class BrainTestWhatsAppResponse(BaseModel):
    sent: bool
    lead_id: str
    phone: str
    opening_message: str
