from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        case_sensitive=False,
        extra='ignore',
    )

    app_name: str = 'Garimpo API'
    environment: str = 'development'
    api_v1_prefix: str = '/api/v1'
    cors_origins: list[str] = Field(
        default_factory=lambda: ['http://localhost:5173', 'http://localhost:5174']
    )

    # Database & Cache
    database_url: str = 'postgresql+asyncpg://garimpo:garimpo_secret@localhost:5432/garimpo'
    redis_url: str = 'redis://localhost:6379/0'
    debounce_seconds: int = 10
    lock_ttl_seconds: int = 30

    # Evolution API
    evolution_api_url: str = 'http://localhost:8080'
    evolution_api_key: str = 'garimpo-evo-key-2026'
    evolution_instance_name: str = 'garimpo_prospeccao'
    evolution_webhook_secret: str = ''

    # Prospecting Providers
    google_places_api_key: str = ''
    serper_api_key: str = ''

    # AI SDR
    openai_api_key: str = ''
    openai_model: str = 'gpt-4o-mini'
    gemini_api_key: str = ''
    gemini_model: str = 'gemini-3.8-flash'
    gemini_fallback_model: str = 'gemini-3.1-flash-lite'

    # Alerts & Locale
    alert_whatsapp_phone: str = ''
    timezone: str = 'America/Sao_Paulo'


@lru_cache
def get_settings() -> Settings:
    return Settings()
