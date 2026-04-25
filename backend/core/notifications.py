"""Helpers for the in-site notifications system.

Notifications are written by other modules (teams, anomaly poller) and
consumed via the REST API the navbar bell polls every 30s.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId

from core.db import notifications_collection
from schema.notifications import NotificationInDB, NotificationResponse


def _to_object_id(value: str) -> Optional[ObjectId]:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def _to_response(doc: dict) -> NotificationResponse:
    return NotificationResponse(
        id=str(doc["_id"]),
        type=doc.get("type", "anomaly_alert"),
        read=bool(doc.get("read", False)),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        payload=doc.get("payload", {}),
    )


async def create_notification(
    user_id: str,
    notification_type: str,
    payload: dict[str, Any],
) -> str:
    """Insert a new notification document. Returns the inserted id."""
    doc = NotificationInDB(
        user_id=str(user_id),
        type=notification_type,
        payload=payload,
    ).model_dump(by_alias=True, exclude={"id"})
    result = await notifications_collection.insert_one(doc)
    return str(result.inserted_id)


async def list_for_user(
    user_id: str,
    *,
    only_unread: bool = False,
    limit: int = 50,
) -> list[NotificationResponse]:
    query: dict[str, Any] = {"user_id": str(user_id)}
    if only_unread:
        query["read"] = False
    cursor = (
        notifications_collection
        .find(query)
        .sort("created_at", -1)
        .limit(limit)
    )
    return [_to_response(doc) async for doc in cursor]


async def unread_count(user_id: str) -> int:
    return await notifications_collection.count_documents(
        {"user_id": str(user_id), "read": False}
    )


async def mark_read(user_id: str, notification_id: str) -> bool:
    oid = _to_object_id(notification_id)
    if oid is None:
        return False
    result = await notifications_collection.update_one(
        {"_id": oid, "user_id": str(user_id)},
        {"$set": {"read": True}},
    )
    return result.modified_count > 0 or result.matched_count > 0


async def mark_all_read(user_id: str) -> int:
    result = await notifications_collection.update_many(
        {"user_id": str(user_id), "read": False},
        {"$set": {"read": True}},
    )
    return result.modified_count


async def delete_notification(user_id: str, notification_id: str) -> bool:
    oid = _to_object_id(notification_id)
    if oid is None:
        return False
    result = await notifications_collection.delete_one(
        {"_id": oid, "user_id": str(user_id)}
    )
    return result.deleted_count > 0


async def delete_for_team(team_id: str) -> int:
    """Used when a team is deleted — remove dangling team_invite notifications."""
    result = await notifications_collection.delete_many(
        {"type": "team_invite", "payload.team_id": str(team_id)}
    )
    return result.deleted_count


async def find_team_invite(
    user_id: str, notification_id: str, team_id: str
) -> Optional[dict]:
    """Lookup a specific team_invite notification (for accept/reject flow)."""
    oid = _to_object_id(notification_id)
    if oid is None:
        return None
    return await notifications_collection.find_one({
        "_id": oid,
        "user_id": str(user_id),
        "type": "team_invite",
        "payload.team_id": str(team_id),
    })
