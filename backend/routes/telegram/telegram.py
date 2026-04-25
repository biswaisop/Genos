"""Telegram routes.

POST  /api/v1/telegram/webhook         — receives Telegram updates (no auth)
POST  /api/v1/telegram/generate-token  — creates a deep-link token (JWT)
DELETE /api/v1/telegram/unlink         — removes Telegram link (JWT)
GET   /api/v1/telegram/status          — returns link status (JWT)
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from core.auth import get_current_user
from core.db import telegram_link_tokens_collection, telegram_sessions_collection
from core.userutils import updateuser
from handlers.telegram_handler import handle_update
from schema.user import UserInDB

router = APIRouter()

TelegramRouter = router

_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "Gen_80085_bot")


# ── Webhook (Telegram → us) ───────────────────────────────────────────────────

@router.post("/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive updates from Telegram and process them in the background.

    Always returns 200 immediately — Telegram will retry if we don't respond
    within a few seconds, so we never block here.
    """
    try:
        update = await request.json()
    except Exception:
        return {"ok": True}

    background_tasks.add_task(handle_update, update)
    return {"ok": True}


# ── Generate deep-link token ──────────────────────────────────────────────────

@router.post("/generate-token")
async def generate_token(current_user: UserInDB = Depends(get_current_user)):
    """Generate a one-time deep-link token valid for 10 minutes.

    The frontend opens `https://t.me/<bot>?start=<token>` in a new tab.
    When the user clicks START, the bot's /start handler links the account.
    """
    token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    await telegram_link_tokens_collection.insert_one({
        "token":      token,
        "user_id":    str(current_user.id),
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
    })

    deep_link = f"https://t.me/{_BOT_USERNAME}?start={token}"
    return {
        "deep_link":  deep_link,
        "token":      token,
        "expires_in": 600,
    }


# ── Unlink Telegram ───────────────────────────────────────────────────────────

@router.delete("/unlink", status_code=status.HTTP_200_OK)
async def unlink_telegram(current_user: UserInDB = Depends(get_current_user)):
    """Remove the Telegram link from the current user's account."""
    updated = await updateuser(
        str(current_user.id),
        {"telegram_chat_id": None, "telegram_username": None},
    )

    # Also drop any active session for this user
    if current_user.telegram_chat_id:
        await telegram_sessions_collection.delete_one(
            {"chat_id": current_user.telegram_chat_id}
        )

    return {"ok": True, "unlinked": updated}


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def telegram_status(current_user: UserInDB = Depends(get_current_user)):
    """Return whether the current user has linked their Telegram account."""
    linked = current_user.telegram_chat_id is not None
    username = getattr(current_user, "telegram_username", None)
    return {
        "linked":   linked,
        "username": username if linked else None,
    }
