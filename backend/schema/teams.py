"""Team schemas — stored in MongoDB `Teams` collection."""

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


TeamRole = Literal["owner", "admin", "operator", "viewer"]


# ---------------------------------------------------------------------------
# DB models
# ---------------------------------------------------------------------------

class TeamMember(BaseModel):
    user_id: str
    role: TeamRole = "viewer"
    # If empty, the member inherits the full team.server_ids list. Otherwise
    # access is restricted to these server_ids only.
    server_ids: list[str] = Field(default_factory=list)


class TeamInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    owner_id: str                                     # FK → Users._id
    members: list[TeamMember] = Field(default_factory=list)
    server_ids: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class TeamCreateRequest(BaseModel):
    name: str


class TeamInviteRequest(BaseModel):
    email: EmailStr
    role: TeamRole = "viewer"
    server_ids: list[str] = Field(default_factory=list)


class TeamInviteDecisionRequest(BaseModel):
    notification_id: str


class TeamMemberUpdateRequest(BaseModel):
    role: Optional[TeamRole] = None
    server_ids: Optional[list[str]] = None


class TeamServerAddRequest(BaseModel):
    server_id: str


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class TeamMemberResponse(BaseModel):
    user_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    role: TeamRole
    server_ids: list[str] = Field(default_factory=list)


class TeamResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    owner_id: str
    members: list[TeamMemberResponse] = Field(default_factory=list)
    server_ids: list[str] = Field(default_factory=list)
    my_role: Optional[TeamRole] = None


class TeamSummary(BaseModel):
    id: str
    name: str
    member_count: int
    server_count: int
    my_role: TeamRole
    created_at: datetime
