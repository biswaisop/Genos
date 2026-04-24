from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import uvicorn

from core.db import create_indexes
from routes.user.user import UserRouter
from routes.server.servers import ServerRouter


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup, we ensure all the database indexes are configured.
    """
    await create_indexes()
    yield
    # Shutdown sequence if required later


app = FastAPI(
    title="GenOS Application API",
    description="Backend API powering the GenOS Natural Language OS",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS dynamically based on ENV or default local
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8000").split(",")

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


@app.get("/")
def health_check():
    return {"status": "ok", "service": "GenOS API is running."}


