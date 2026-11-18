from typing import Any

from pydantic import BaseModel, Field


class EvolutionWebhookPayload(BaseModel):
    event: str = ''
    instance: str = ''
    data: dict[str, Any] = Field(default_factory=dict)
