from fastapi import Request

from app.services.evolution_service import EvolutionService
from app.services.prospecting_service import ProspectingService
from app.services.redis_service import RedisService


def get_redis_service(request: Request) -> RedisService:
    return request.app.state.redis_service


def get_evolution_service() -> EvolutionService:
    return EvolutionService()


def get_prospecting_service() -> ProspectingService:
    return ProspectingService()
