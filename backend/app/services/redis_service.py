import time
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import redis.asyncio as redis

from app.core.config import get_settings

DISPATCH_QUEUE_KEY = 'garimpo:dispatch_queue'
WORKER_RUNNING_KEY = 'garimpo:worker:running'
NEXT_DISPATCH_AT_KEY = 'garimpo:worker:next_dispatch_at'
DEBOUNCE_PENDING_SET = 'garimpo:debounce:pending_leads'
DEBOUNCE_BUFFER_PREFIX = 'garimpo:debounce:buffer:'
DEBOUNCE_UNTIL_PREFIX = 'garimpo:debounce:until:'
LOCK_PREFIX = 'garimpo:lock:lead:'


class RedisService:
    """Short-term memory for dispatch queue, message debounce, and distributed locks."""

    def __init__(self, client: redis.Redis):
        self.client = client

    @classmethod
    def from_settings(cls) -> 'RedisService':
        settings = get_settings()
        client = redis.from_url(settings.redis_url, decode_responses=True)
        return cls(client)

    async def close(self) -> None:
        await self.client.aclose()

    # ------------------------------------------------------------------
    # 1. Fila de disparos (FIFO via LPUSH / RPOP)
    # ------------------------------------------------------------------
    async def enqueue_lead(self, lead_id: str) -> None:
        await self.client.lpush(DISPATCH_QUEUE_KEY, lead_id)

    async def dequeue_lead(self) -> str | None:
        return await self.client.rpop(DISPATCH_QUEUE_KEY)

    async def queue_size(self) -> int:
        return int(await self.client.llen(DISPATCH_QUEUE_KEY))

    # ------------------------------------------------------------------
    # Worker state & countdown
    # ------------------------------------------------------------------
    async def is_worker_running(self) -> bool:
        val = await self.client.get(WORKER_RUNNING_KEY)
        if val is None:
            return True
        return val == '1'

    async def set_worker_running(self, running: bool) -> None:
        await self.client.set(WORKER_RUNNING_KEY, '1' if running else '0')

    async def set_next_dispatch_at(self, epoch_seconds: float) -> None:
        await self.client.set(NEXT_DISPATCH_AT_KEY, str(epoch_seconds))

    async def get_next_dispatch_seconds(self) -> int:
        val = await self.client.get(NEXT_DISPATCH_AT_KEY)
        if not val:
            return 0
        remaining = int(float(val) - time.time())
        return max(0, remaining)

    # ------------------------------------------------------------------
    # Daily stats counters
    # ------------------------------------------------------------------
    def _today_key(self, metric: str, tz_name: str = 'America/Sao_Paulo') -> str:
        today = datetime.now(ZoneInfo(tz_name)).strftime('%Y-%m-%d')
        return f'garimpo:stats:{metric}:{today}'

    async def increment_daily_stat(self, metric: str, amount: int = 1) -> int:
        key = self._today_key(metric)
        val = await self.client.incrby(key, amount)
        await self.client.expire(key, 60 * 60 * 48)
        return int(val)

    async def get_daily_stat(self, metric: str) -> int:
        val = await self.client.get(self._today_key(metric))
        return int(val) if val else 0

    # ------------------------------------------------------------------
    # 2. Debounce (~10s grouping for fragmented WhatsApp messages)
    # ------------------------------------------------------------------
    async def push_debounce_message(
        self, lead_id: str, text: str, debounce_seconds: int = 10
    ) -> None:
        until = time.time() + debounce_seconds
        pipe = self.client.pipeline()
        pipe.rpush(f'{DEBOUNCE_BUFFER_PREFIX}{lead_id}', text)
        pipe.set(f'{DEBOUNCE_UNTIL_PREFIX}{lead_id}', str(until))
        pipe.sadd(DEBOUNCE_PENDING_SET, lead_id)
        await pipe.execute()

    async def get_ready_debounce_lead_ids(self) -> list[str]:
        lead_ids = await self.client.smembers(DEBOUNCE_PENDING_SET)
        if not lead_ids:
            return []

        now = time.time()
        ready: list[str] = []
        for lead_id in lead_ids:
            until_raw = await self.client.get(f'{DEBOUNCE_UNTIL_PREFIX}{lead_id}')
            if until_raw is None or float(until_raw) <= now:
                ready.append(lead_id)
        return ready

    async def pop_debounce_messages(self, lead_id: str) -> list[str]:
        buffer_key = f'{DEBOUNCE_BUFFER_PREFIX}{lead_id}'
        until_key = f'{DEBOUNCE_UNTIL_PREFIX}{lead_id}'
        pipe = self.client.pipeline()
        pipe.lrange(buffer_key, 0, -1)
        pipe.delete(buffer_key, until_key)
        pipe.srem(DEBOUNCE_PENDING_SET, lead_id)
        results = await pipe.execute()
        messages: list[str] = results[0] or []
        return messages

    # ------------------------------------------------------------------
    # 3. Trava de concorrência (Distributed Lock per lead)
    # ------------------------------------------------------------------
    async def acquire_lead_lock(self, lead_id: str, ttl_seconds: int = 30) -> str | None:
        token = str(uuid.uuid4())
        acquired = await self.client.set(
            f'{LOCK_PREFIX}{lead_id}', token, nx=True, ex=ttl_seconds
        )
        return token if acquired else None

    async def release_lead_lock(self, lead_id: str, token: str) -> None:
        key = f'{LOCK_PREFIX}{lead_id}'
        current = await self.client.get(key)
        if current == token:
            await self.client.delete(key)
