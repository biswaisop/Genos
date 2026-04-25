"""Notification schemas — in-site delivery for team invites and anomaly alerts."""

from datetime import datetime, timezone
from typing import Literal, Optional, Any

from pydantic import BaseModel, Field


NotificationType = Literal["team_invite", "anomaly_alert"]


# ---------------------------------------------------------------------------
# Payload shapes (one per notification type)
# ---------------------------------------------------------------------------

class TeamInvitePayload(BaseModel):
    team_id: str
    team_name: str
    invited_by: str           # display name / email of the inviter
    role: Literal["owner", "admin", "operator", "viewer"]
    server_ids: list[str] = Field(default_factory=list)


class AnomalyAlertPayload(BaseModel):
    server_id: str
    server_name: str
    metric: Literal["cpu", "memory", "disk"]
    value: float


# ---------------------------------------------------------------------------
# DB model
# ---------------------------------------------------------------------------

class NotificationInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    type: NotificationType
    read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# API response
# ---------------------------------------------------------------------------

class NotificationResponse(BaseModel):
    id: str
    type: NotificationType
    read: bool
    created_at: datetime
    payload: dict[str, Any]


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    unread_count: int
