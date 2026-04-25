"""Team + clearance REST routes.

Endpoints (all authed via `get_current_user`):
  GET    /teams/                          → list teams the user belongs to
  POST   /teams/                          → create a new team (caller = owner)
  GET    /teams/{team_id}                 → team detail (member-only)
  DELETE /teams/{team_id}                 → delete team (owner-only)
  POST   /teams/{team_id}/invite          → invite a user by email (writes notification)
  PATCH  /teams/{team_id}/invite/accept   → accept a pending invite (invitee)
  PATCH  /teams/{team_id}/invite/reject   → reject a pending invite (invitee)
  PATCH  /teams/{team_id}/members/{uid}   → change role / per-member server_ids
  DELETE /teams/{team_id}/members/{uid}   → remove member
  POST   /teams/{team_id}/servers         → share a server with the team
  DELETE /teams/{team_id}/servers/{sid}   → unshare a server from the team
"""

from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, status

from core.auth import get_current_user
from core.db import servers_collection
from core.notifications import (
    create_notification,
    delete_for_team,
    find_team_invite,
    mark_read,
)
from core.serverutils import getserverbyid
from core.teams import (
    add_member,
    add_server_to_team,
    create_team,
    delete_team,
    find_member_entry,
    get_team_by_id,
    list_teams_for_user,
    remove_member,
    remove_server_from_team,
    update_member,
)
from core.userutils import getuserbyemail, getuserbyid
from schema.teams import (
    TeamCreateRequest,
    TeamInviteDecisionRequest,
    TeamInviteRequest,
    TeamMemberResponse,
    TeamMemberUpdateRequest,
    TeamResponse,
    TeamServerAddRequest,
    TeamSummary,
)
from schema.user import UserInDB


TeamRouter = APIRouter()


def _require_member(team: dict, user_id: str) -> dict:
    member = find_member_entry(team, user_id)
    if member is None:
        raise HTTPException(status_code=403, detail="You are not a member of this team")
    return member


def _require_role(team: dict, user_id: str, allowed: set[str]) -> dict:
    member = _require_member(team, user_id)
    role = member.get("role")
    if role not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Requires one of: {', '.join(sorted(allowed))}",
        )
    return member


async def _build_team_response(team: dict, requester_id: str) -> TeamResponse:
    members: list[TeamMemberResponse] = []
    for m in team.get("members", []) or []:
        user_obj = None
        try:
            user_obj = await getuserbyid(str(m.get("user_id")))
        except Exception:
            user_obj = None
        members.append(TeamMemberResponse(
            user_id=str(m.get("user_id")),
            name=getattr(user_obj, "name", None) if user_obj else None,
            email=getattr(user_obj, "email", None) if user_obj else None,
            role=m.get("role", "viewer"),
            server_ids=list(m.get("server_ids") or []),
        ))

    my_role = None
    my = find_member_entry(team, requester_id)
    if my:
        my_role = my.get("role")

    return TeamResponse(
        id=str(team["_id"]),
        name=team.get("name", ""),
        created_at=team.get("created_at"),
        owner_id=str(team.get("owner_id", "")),
        members=members,
        server_ids=list(team.get("server_ids") or []),
        my_role=my_role,
    )


@TeamRouter.get("/", response_model=list[TeamSummary])
async def list_my_teams(current_user: UserInDB = Depends(get_current_user)):
    teams = await list_teams_for_user(current_user.id)
    summaries: list[TeamSummary] = []
    for team in teams:
        member = find_member_entry(team, current_user.id)
        if member is None:
            continue
        summaries.append(TeamSummary(
            id=str(team["_id"]),
            name=team.get("name", ""),
            member_count=len(team.get("members", []) or []),
            server_count=len(team.get("server_ids", []) or []),
            my_role=member.get("role", "viewer"),
            created_at=team.get("created_at"),
        ))
    return summaries


@TeamRouter.post("/", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_new_team(
    req: TeamCreateRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    team_id = await create_team(name=req.name, owner_id=current_user.id)
    team = await get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=500, detail="Failed to create team")
    return await _build_team_response(team, current_user.id)


@TeamRouter.get("/{team_id}", response_model=TeamResponse)
async def get_team_detail(
    team_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    team = await get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _require_member(team, current_user.id)
    return await _build_team_response(team, current_user.id)


@TeamRouter.delete("/{team_id}")
async def delete_team_endpoint(
    team_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    team = await get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if str(team.get("owner_id")) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the team owner can delete the team")

    # Clear team_id on any servers still pointing here.
    await servers_collection.update_many(
        {"team_id": team_id},
        {"$set": {"team_id": None}},
    )
    # Remove dangling invite notifications.
    await delete_for_team(team_id)

    success = await delete_team(team_id)
    return {"deleted": success, "team_id": team_id}


@TeamRouter.post("/{team_id}/invite")
async def invite_member(
    team_id: str,
    req: TeamInviteRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    team = await get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _require_role(team, current_user.id, {"owner", "admin"})

    target_user = await getuserbyemail(req.email)
    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="No GenOS account found for this email",
        )

    if str(target_user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="You cannot invite yourself")

    if find_member_entry(team, target_user.id):
        raise HTTPException(status_code=400, detail="User is already a member of this team")

    if req.role == "owner":
        raise HTTPException(status_code=400, detail="Cannot assign the owner role via invite")

    # Validate requested server_ids — only ones already shared with the team count.
    team_servers = set(team.get("server_ids") or [])
    requested = [sid for sid in (req.server_ids or []) if sid]
    invalid = [sid for sid in requested if sid not in team_servers]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Servers must be shared with the team before inviting: {invalid}",
        )

    payload = {
        "team_id": str(team["_id"]),
        "team_name": team.get("name"),
        "invited_by": current_user.name or current_user.email,
        "role": req.role,
        "server_ids": requested,
    }
    notification_id = await create_notification(
        target_user.id, "team_invite", payload,
    )
    return {"invited": True, "notification_id": notification_id}


@TeamRouter.patch("/{team_id}/invite/accept")
async def accept_invite(
    team_id: str,
    req: TeamInviteDecisionRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    notification = await find_team_invite(current_user.id, req.notification_id, team_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Invite not found or no longer valid")

    team = await get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    payload = notification.get("payload", {})
    role = payload.get("role", "viewer")
    server_ids = payload.get("server_ids", []) or []

    await add_member(
        team_id,
        user_id=current_user.id,
        role=role,
        server_ids=server_ids,
    )
    await mark_read(current_user.id, req.notification_id)

    team = await get_team_by_id(team_id)
    return await _build_team_response(team, current_user.id)


@TeamRouter.patch("/{team_id}/invite/reject")
async def reject_invite(
    team_id: str,
    req: TeamInviteDecisionRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    notification = await find_team_invite(current_user.id, req.notification_id, team_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Invite not found or no longer valid")
    # Drop the invite by marking it as read; a dedicated delete would work too.
    await mark_read(current_user.id, req.notification_id)
    return {"rejected": True}


@TeamRouter.patch("/{team_id}/members/{user_id}")
async def update_team_member(
    team_id: str,
    user_id: str,
    req: TeamMemberUpdateRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    team = await get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _require_role(team, current_user.id, {"owner", "admin"})

    if not find_member_entry(team, user_id):
        raise HTTPException(status_code=404, detail="Member not found")

    if str(team.get("owner_id")) == str(user_id) and req.role and req.role != "owner":
        raise HTTPException(status_code=400, detail="Cannot change the team owner's role")

    if req.role == "owner" and str(current_user.id) != str(team.get("owner_id")):
        raise HTTPException(status_code=403, detail="Only the current owner can assign owner role")

    if req.server_ids is not None:
        team_servers = set(team.get("server_ids") or [])
        invalid = [sid for sid in req.server_ids if sid not in team_servers]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Servers must be shared with the team first: {invalid}",
            )

    await update_member(
        team_id,
        user_id,
        role=req.role,
        server_ids=req.server_ids,
    )
    team = await get_team_by_id(team_id)
    return await _build_team_response(team, current_user.id)


@TeamRouter.delete("/{team_id}/members/{user_id}")
async def remove_team_member(
    team_id: str,
    user_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    team = await get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    is_self = str(user_id) == str(current_user.id)
    if not is_self:
        _require_role(team, current_user.id, {"owner", "admin"})

    if str(team.get("owner_id")) == str(user_id):
        raise HTTPException(status_code=400, detail="Cannot remove the team owner")

    await remove_member(team_id, user_id)
    return {"removed": True}


@TeamRouter.post("/{team_id}/servers")
async def share_server_with_team(
    team_id: str,
    req: TeamServerAddRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    team = await get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _require_role(team, current_user.id, {"owner", "admin"})

    server = await getserverbyid(req.server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if str(server.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the server owner can share it with a team")

    # Bind the server to the team (replacing any prior team assignment).
    await servers_collection.update_one(
        {"server_id": req.server_id},
        {"$set": {"team_id": team_id}},
    )
    await add_server_to_team(team_id, req.server_id)

    team = await get_team_by_id(team_id)
    return await _build_team_response(team, current_user.id)


@TeamRouter.delete("/{team_id}/servers/{server_id}")
async def unshare_server_from_team(
    team_id: str,
    server_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    normalized_server_id = unquote(server_id) if server_id else server_id

    team = await get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _require_role(team, current_user.id, {"owner", "admin"})

    await remove_server_from_team(team_id, normalized_server_id)
    await servers_collection.update_one(
        {"server_id": normalized_server_id, "team_id": team_id},
        {"$set": {"team_id": None}},
    )

    team = await get_team_by_id(team_id)
    return await _build_team_response(team, current_user.id)
