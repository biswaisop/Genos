from typing import Optional, Literal
from pydantic import EmailStr, BaseModel, Field
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# DB Model — stored in MongoDB `Users` collection
# ---------------------------------------------------------------------------

class SubscriptionInfo(BaseModel):
    tier: Literal["free", "pro", "team"] = "free"
    status: Literal["active", "cancelled", "past_due"] = "active"
    stripe_customer_id: Optional[str] = None
    razorpay_customer_id: Optional[str] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False


class UsageInfo(BaseModel):
    commands_this_month: int = 0
    commands_limit: int = 50          # 50 for free, -1 for unlimited
    reset_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserSettings(BaseModel):
    default_server_id: Optional[str] = None
    confirm_destructive: bool = True
    response_verbosity: Literal["brief", "normal", "verbose"] = "normal"


class UserInDB(BaseModel):
    """Full user document stored in MongoDB."""
    id: Optional[str] = Field(None, alias="_id")
    name: str
    email: EmailStr
    phone: Optional[str] = None
    hashed_password: str
    telegram_chat_id: Optional[int] = None
    whatsapp_number: Optional[str] = None
    subscription: SubscriptionInfo = Field(default_factory=SubscriptionInfo)
    usage: UsageInfo = Field(default_factory=UsageInfo)
    settings: UserSettings = Field(default_factory=UserSettings)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Auth Request / Response schemas
# ---------------------------------------------------------------------------

class SignUp(BaseModel):
    """POST /auth/signup"""
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None


class UpdateUserRequest(BaseModel):
    """PATCH /api/v1/users/me"""
    name: Optional[str] = None
    phone: Optional[str] = None
    settings: Optional[UserSettings] = None


class LoginRequest(BaseModel):
    """POST /auth/login"""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Returned on successful login/signup."""
    access_token: str
    token_type: str = "bearer"


# ---------------------------------------------------------------------------
# API Response schemas (safe — no password hash exposed)
# ---------------------------------------------------------------------------

class UserProfile(BaseModel):
    """GET /api/v1/users/me — public-safe user profile."""
    id: Optional[str] = Field(None, alias="_id")
    name: str
    email: EmailStr
    phone: Optional[str] = None
    subscription: SubscriptionInfo
    usage: UsageInfo
    settings: UserSettings
    created_at: datetime

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Backwards-compat aliases (keep old names working during migration)
# ---------------------------------------------------------------------------
userInDB = UserInDB
loginRequest = LoginRequest
tokenResponse = TokenResponse