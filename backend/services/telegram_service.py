"""Telegram Bot API helpers.

Uses raw httpx async calls instead of the full python-telegram-bot Application
object to avoid event-loop conflicts with FastAPI's asyncio.

All functions degrade gracefully (log + return) when TELEGRAM_BOT_TOKEN is
not configured so local dev without a bot token doesn't break startup.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_TOKEN: Optional[str] = os.getenv("TELEGRAM_BOT_TOKEN")
_BASE = "https://api.telegram.org/bot{token}/{method}"


def _url(method: str) -> str:
    return _BASE.format(token=_TOKEN, method=method)


async def send_message(
    chat_id: int,
    text: str,
    parse_mode: str = "Markdown",
) -> bool:
    """Send a text message to a Telegram chat.

    Returns True on success, False on any error (never raises).
    """
    if not _TOKEN:
        logger.warning("telegram_service: TELEGRAM_BOT_TOKEN not set — skipping send_message")
        return False

    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(_url("sendMessage"), json=payload)
            if resp.status_code != 200:
                logger.error(
                    "telegram_service: sendMessage failed %s — %s",
                    resp.status_code, resp.text[:200],
                )
                return False
        return True
    except Exception as exc:
        logger.error("telegram_service: sendMessage exception: %s", exc)
        return False


async def register_webhook(base_url: str) -> bool:
    """Register this server as the Telegram webhook.

    base_url  — e.g. https://abc123.ngrok-free.app (must be HTTPS)
    Returns True on success.
    """
    if not _TOKEN:
        logger.warning("telegram_service: TELEGRAM_BOT_TOKEN not set — skipping webhook registration")
        return False

    webhook_url = f"{base_url.rstrip('/')}/api/v1/telegram/webhook"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _url("setWebhook"),
                json={"url": webhook_url, "drop_pending_updates": True},
            )
            data = resp.json()
            if data.get("ok"):
                logger.info("telegram_service: webhook registered → %s", webhook_url)
                return True
            else:
                logger.error("telegram_service: setWebhook failed: %s", data)
                return False
    except Exception as exc:
        logger.error("telegram_service: setWebhook exception: %s", exc)
        return False


async def send_alert(
    chat_id: int,
    server_name: str,
    metric: str,
    value: float,
    threshold: Optional[float] = None,
) -> bool:
    """Send a formatted anomaly alert to a Telegram user."""
    metric_label = {
        "cpu":    "CPU Usage",
        "memory": "Memory Usage",
        "disk":   "Disk Usage",
    }.get(metric, metric.title())

    threshold_str = f" (limit: {threshold}%)" if threshold is not None else ""
    time_str = datetime.now(timezone.utc).strftime("%H:%M UTC")

    text = (
        f"🚨 *GenOS Alert — {server_name}*\n\n"
        f"Metric:  {metric_label}\n"
        f"Value:   {value:.1f}%{threshold_str}\n"
        f"Time:    {time_str}\n\n"
        f"Send `/use {server_name}` to investigate."
    )
    return await send_message(chat_id, text)
