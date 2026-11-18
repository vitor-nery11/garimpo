from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.services.redis_service import RedisService


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis_service = RedisService.from_settings()
    app.state.redis_service = redis_service
    try:
        yield
    finally:
        await redis_service.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version='0.1.0',
        description='API assíncrona do sistema Garimpo para prospecção B2B, cadência anti-ban e SDR com IA no WhatsApp.',
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    @app.get(f'{settings.api_v1_prefix}/health', tags=['Sistema'])
    async def health() -> dict[str, str]:
        return {'status': 'ok', 'service': settings.app_name}

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
