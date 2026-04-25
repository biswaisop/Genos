"""Access-control helpers for servers and teams.

Roles:
- owner    → personal creator of a server (pre-teams behaviour)
- personal → alias returned when the server has no team_id (unshared)
- admin    → team member with admin privileges
- operator → team member who can run read/write but not destructive commands
- viewer   → team member restricted to read-only commands

`has_server_access` and `resolve_user_role` are the single source of truth for
authorization. Every route should use them instead of comparing owner_id directly.
"""

from __future__ import annotations

from typing import Optional

from schema.servers import ServerInDB


def _normalize_id(value) -> str:
    try:
        return str(value) if value is not None else ""
    except Exception:
        return ""


async def _get_team(team_id: Optional[str]):
    """Lazy import to avoid circular import at module load time."""
    if not team_id:
        return None
    from core.teams import get_team_by_id
    return await get_team_by_id(team_id)


def _find_member(team, user_id: str):
    if team is None:
        return None
    members = team.get("members", []) if isinstance(team, dict) else getattr(team, "members", [])
    norm = _normalize_id(user_id)
    for member in members:
        member_user = member.get("user_id") if isinstance(member, dict) else getattr(member, "user_id", None)
        if _normalize_id(member_user) == norm:
            return member
    return None


async def has_server_access(user_id: str, server: ServerInDB) -> bool:
    """True if the user owns the server OR is a member of its team with the
    server shared to them (either team-wide or via per-member server_ids)."""
    if server is None:
        return False

    if _normalize_id(server.owner_id) == _normalize_id(user_id):
        return True

    team_id = getattr(server, "team_id", None)
    if not team_id:
        return False

    team = await _get_team(team_id)
    if team is None:
        return False

    member = _find_member(team, user_id)
    if member is None:
        return False

    member_server_ids = (
        member.get("server_ids") if isinstance(member, dict)
        else getattr(member, "server_ids", None)
    ) or []

    if not member_server_ids:
        team_servers = (
            team.get("server_ids") if isinstance(team, dict)
            else getattr(team, "server_ids", None)
        ) or []
        return server.server_id in team_servers

    return server.server_id in member_server_ids


async def resolve_user_role(user_id: str, server: ServerInDB) -> Optional[str]:
    """Returns one of: 'owner', 'personal', 'admin', 'operator', 'viewer', None.

    - 'owner'    if user owns the server AND it's shared to a team
    - 'personal' if user owns the server AND team_id is unset (pre-teams behaviour)
    - role name  if user is a team member with access
    - None       if no access
    """
    if server is None:
        return None

    owner_match = _normalize_id(server.owner_id) == _normalize_id(user_id)
    team_id = getattr(server, "team_id", None)

    if owner_match:
        return "owner" if team_id else "personal"

    if not team_id:
        return None

    team = await _get_team(team_id)
    if team is None:
        return None

    member = _find_member(team, user_id)
    if member is None:
        return None

    member_server_ids = (
        member.get("server_ids") if isinstance(member, dict)
        else getattr(member, "server_ids", None)
    ) or []
    team_servers = (
        team.get("server_ids") if isinstance(team, dict)
        else getattr(team, "server_ids", None)
    ) or []

    if member_server_ids:
        has_share = server.server_id in member_server_ids
    else:
        has_share = server.server_id in team_servers

    if not has_share:
        return None

    role = member.get("role") if isinstance(member, dict) else getattr(member, "role", None)
    return role or "viewer"
