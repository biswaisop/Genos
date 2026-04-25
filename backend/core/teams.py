"""MongoDB helpers for Teams."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId

from core.db import teams_collection


def _to_object_id(value: str) -> Optional[ObjectId]:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


async def create_team(*, name: str, owner_id: str) -> str:
    """Create a new team owned by the given user. Owner is added to members."""
    doc = {
        "name": name,
        "owner_id": str(owner_id),
        "created_at": datetime.now(timezone.utc),
        "members": [
            {"user_id": str(owner_id), "role": "owner", "server_ids": []},
        ],
        "server_ids": [],
    }
    result = await teams_collection.insert_one(doc)
    return str(result.inserted_id)


async def get_team_by_id(team_id: str) -> Optional[dict]:
    oid = _to_object_id(team_id)
    if oid is None:
        return None
    doc = await teams_collection.find_one({"_id": oid})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def list_teams_for_user(user_id: str) -> list[dict]:
    cursor = teams_collection.find({"members.user_id": str(user_id)})
    teams = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        teams.append(doc)
    return teams


async def delete_team(team_id: str) -> bool:
    oid = _to_object_id(team_id)
    if oid is None:
        return False
    result = await teams_collection.delete_one({"_id": oid})
    return result.deleted_count > 0


async def add_member(
    team_id: str,
    *,
    user_id: str,
    role: str,
    server_ids: list[str],
) -> bool:
    oid = _to_object_id(team_id)
    if oid is None:
        return False
    # Remove any existing entry for this user_id, then push a fresh one.
    await teams_collection.update_one(
        {"_id": oid},
        {"$pull": {"members": {"user_id": str(user_id)}}},
    )
    result = await teams_collection.update_one(
        {"_id": oid},
        {
            "$push": {
                "members": {
                    "user_id": str(user_id),
                    "role": role,
                    "server_ids": list(server_ids or []),
                }
            }
        },
    )
    return result.modified_count > 0


async def remove_member(team_id: str, user_id: str) -> bool:
    oid = _to_object_id(team_id)
    if oid is None:
        return False
    result = await teams_collection.update_one(
        {"_id": oid},
        {"$pull": {"members": {"user_id": str(user_id)}}},
    )
    return result.modified_count > 0


async def update_member(
    team_id: str,
    user_id: str,
    *,
    role: Optional[str] = None,
    server_ids: Optional[list[str]] = None,
) -> bool:
    oid = _to_object_id(team_id)
    if oid is None:
        return False
    set_fields: dict = {}
    if role is not None:
        set_fields["members.$.role"] = role
    if server_ids is not None:
        set_fields["members.$.server_ids"] = list(server_ids)
    if not set_fields:
        return True
    result = await teams_collection.update_one(
        {"_id": oid, "members.user_id": str(user_id)},
        {"$set": set_fields},
    )
    return result.matched_count > 0


async def add_server_to_team(team_id: str, server_id: str) -> bool:
    oid = _to_object_id(team_id)
    if oid is None:
        return False
    result = await teams_collection.update_one(
        {"_id": oid},
        {"$addToSet": {"server_ids": server_id}},
    )
    return result.matched_count > 0


async def remove_server_from_team(team_id: str, server_id: str) -> bool:
    oid = _to_object_id(team_id)
    if oid is None:
        return False
    result = await teams_collection.update_one(
        {"_id": oid},
        {
            "$pull": {
                "server_ids": server_id,
                "members.$[].server_ids": server_id,
            }
        },
    )
    return result.matched_count > 0


def find_member_entry(team: dict, user_id: str) -> Optional[dict]:
    for member in team.get("members", []) or []:
        if str(member.get("user_id")) == str(user_id):
            return member
    return None
