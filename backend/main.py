from contextlib import asynccontextmanager, suppress
import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from core.db import create_indexes
from routes.user.user import UserRouter
from routes.server.servers import ServerRouter
from routes.agents.agents import router as AgentsRouter
from routes.notifications.notifications import NotificationRouter
from routes.teams.teams import TeamRouter
from routes.telegram.telegram import TelegramRouter
import services.telegram_service as telegram_service


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup, we ensure all the database indexes are configured and (optionally)
    spawn the anomaly poller in the background.
    """
    await create_indexes()

    poller_task = None
    if os.getenv("ANOMALY_POLLER_ENABLED", "false").lower() in {"1", "true", "yes"}:
        try:
            from services.poller import poll_loop
            poller_task = asyncio.create_task(poll_loop())
            logger.info("anomaly poller background task started")
        except Exception as exc:
            logger.error("failed to start anomaly poller: %s", exc)

    # Register Telegram webhook if configured
    public_url = os.getenv("PUBLIC_URL")
    if public_url and os.getenv("TELEGRAM_BOT_TOKEN"):
        try:
            await telegram_service.register_webhook(public_url)
        except Exception as exc:
            logger.warning("Telegram webhook registration failed: %s", exc)
    else:
        logger.info("Telegram webhook skipped (PUBLIC_URL or TELEGRAM_BOT_TOKEN not set)")

    try:
        yield
    finally:
        if poller_task is not None:
            poller_task.cancel()
            with suppress(asyncio.CancelledError):
                await poller_task


app = FastAPI(
    title="GenOS Application API",
    description="Backend API powering the GenOS Natural Language OS",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS dynamically based on ENV or default local
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:5173,http://localhost:8000,https://doorman-stencil-dime.ngrok-free.dev",
    ).split(",")
    if origin.strip()
]
print("CORS origins:", allowed_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# API Routes Integration
# ---------------------------------------------------------------------------

app.include_router(UserRouter, prefix="/api/v1/users", tags=["Users & Authentication"])
app.include_router(ServerRouter, prefix="/api/v1/servers", tags=["Servers (BYOS)"])
app.include_router(AgentsRouter, prefix="/api/v1/agents", tags=["Agents"])
app.include_router(NotificationRouter, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(TeamRouter, prefix="/api/v1/teams", tags=["Teams"])
app.include_router(TelegramRouter, prefix="/api/v1/telegram", tags=["Telegram"])


@app.get("/")
def health_check():
    return {"status": "ok", "service": "GenOS API is running."}


