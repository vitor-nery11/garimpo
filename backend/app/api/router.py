from fastapi import APIRouter

from app.api.routes import dashboard, leads, prospecting, settings, webhooks

api_router = APIRouter()
api_router.include_router(dashboard.router)
api_router.include_router(prospecting.router)
api_router.include_router(leads.router)
api_router.include_router(settings.router)
api_router.include_router(webhooks.router)
