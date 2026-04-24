"""Schemas for server metrics collected by the anomaly poller."""

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field


class ServerMetricsInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    server_id: str
    polled_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    disk_percent: Optional[float] = None
    load_average: Optional[str] = None
    raw: dict[str, Any] = Field(default_factory=dict)
    success: bool = True
    error: Optional[str] = None

    model_config = {"populate_by_name": True}


class ServerMetricsResponse(BaseModel):
    server_id: str
    polled_at: datetime
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    disk_percent: Optional[float] = None
    load_average: Optional[str] = None
    success: bool = True
    error: Optional[str] = None


class ServerStatusResponse(BaseModel):
    """Lightweight status payload for the per-server dashboard header."""
    server_id: str
    status: str
    last_seen: Optional[datetime] = None
    host: Optional[str] = None
