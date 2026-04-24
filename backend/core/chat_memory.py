import json
import os
from datetime import datetime, timedelta, timezone

from core.db import commands_collection, sessions_collection

try:
    from redis.asyncio import Redis
except Exception:  # pragma: no cover
    Redis = None


class ChatMemoryService:
    """Hybrid memory service: Redis for short-term and MongoDB for long-term."""

    def __init__(self):
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self._redis = Redis.from_url(redis_url, decode_responses=True) if Redis else None

    def _messages_key(self, thread_id: str) -> str:
        return f"chat:{thread_id}:messages"

    def _pending_key(self, thread_id: str) -> str:
        return f"chat:{thread_id}:pending"

    async def append_short_message(self, thread_id: str, role: str, content: str) -> None:
        if not self._redis:
            return
        payload = {
            "role": role,
            "content": content,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        await self._redis.rpush(self._messages_key(thread_id), json.dumps(payload))
        await self._redis.expire(self._messages_key(thread_id), 60 * 60 * 24)

    async def get_short_messages(self, thread_id: str, limit: int = 20) -> list[dict]:
        if not self._redis:
            return []
        raw = await self._redis.lrange(self._messages_key(thread_id), -limit, -1)
        messages = []
        for item in raw:
            try:
                messages.append(json.loads(item))
            except Exception:
                continue
        return messages

    async def set_pending_confirm(self, thread_id: str, payload: dict) -> None:
        if not self._redis:
            return
        await self._redis.set(self._pending_key(thread_id), json.dumps(payload), ex=60)

    async def get_pending_confirm(self, thread_id: str) -> dict | None:
        if not self._redis:
            return None
        raw = await self._redis.get(self._pending_key(thread_id))
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None

    async def clear_pending_confirm(self, thread_id: str) -> None:
        if not self._redis:
            return
        await self._redis.delete(self._pending_key(thread_id))

    async def touch_session(self, thread_id: str, user_id: str, server_id: str) -> None:
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=12)
        await sessions_collection.update_one(
            {"session_id": thread_id},
            {
                "$set": {
                    "user_id": user_id,
                    "server_id": server_id,
                    "platform": "web",
                    "last_active": now,
                    "expires_at": expires,
                },
                "$setOnInsert": {"started_at": now, "message_count": 0},
                "$inc": {"message_count": 1},
            },
            upsert=True,
        )

    async def log_command(
        self,
        command_id: str,
        user_id: str,
        server_id: str,
        session_id: str,
        raw_message: str,
        status: str,
        response: str | None = None,
        proposed_command: str | None = None,
        required_confirmation: bool = False,
        confirmed: bool = False,
    ) -> None:
        now = datetime.now(timezone.utc)
        doc = {
            "command_id": command_id,
            "user_id": user_id,
            "server_id": server_id,
            "session_id": session_id,
            "input": {
                "platform": "web",
                "raw_message": raw_message,
                "timestamp": now,
            },
            "execution": {
                "steps": [],
                "required_confirmation": required_confirmation,
                "confirmed": confirmed,
            },
            "output": {"response": response},
            "status": status,
            "created_at": now,
            "completed_at": now if status in {"completed", "failed", "blocked"} else None,
        }
        if proposed_command:
            doc["execution"]["steps"].append(
                {
                    "step": 1,
                    "type": "tool_call",
                    "tool": "planner",
                    "output": proposed_command,
                }
            )
        await commands_collection.update_one({"command_id": command_id}, {"$set": doc}, upsert=True)
