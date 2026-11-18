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
    alert_phone: str = ''
    search_provider: Literal['google_places', 'serper'] = 'google_places'
    search_api_key: str = ''
    ai_provider: Literal['openai', 'gemini'] = 'openai'
    ai_api_key: str = ''


class WhatsAppStatusOut(BaseModel):
    connected: bool
    state: str
    instance_name: str
    phone: str | None = None
    qr_code_base64: str | None = None
