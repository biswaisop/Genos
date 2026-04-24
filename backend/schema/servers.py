from typing import Optional, Literal, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Server DB Models — stored in MongoDB `Servers` collection
# ---------------------------------------------------------------------------

class ConnectionDetails(BaseModel):
    """SSH connection details."""
    host: str
    port: int = 22
    username: str
    vault_secret_path: Optional[str] = None   # SSH key stored in Vault, never in Mongo
    last_connected_at: Optional[datetime] = None
    status: Literal["connected", "disconnected", "error", "connecting"] = "connecting"


class ServerMetadata(BaseModel):
    os: Optional[str] = None
    region: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class ServerInDB(BaseModel):
    """Full server document stored in MongoDB."""
    id: Optional[str] = Field(None, alias="_id")
    owner_id: str                              # FK → users.user_id
    team_id: Optional[str] = None

    name: str
    description: Optional[str] = None

    connection: ConnectionDetails
    metadata: ServerMetadata = Field(default_factory=ServerMetadata)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Command DB Model — stored in MongoDB `Commands` collection (append-only)
# ---------------------------------------------------------------------------

class CommandInput(BaseModel):
    platform: Literal["telegram", "whatsapp", "api", "web"]
    raw_message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CommandRouting(BaseModel):
    agent: str                   # e.g. "process_agent"
    model: str                   # e.g. "claude-haiku-4-5"
    intent_score: Optional[float] = None


class ExecutionStep(BaseModel):
    step: int
    type: Literal["tool_call", "llm_response"]
    tool: Optional[str] = None       # set when type == "tool_call"
    input: Optional[dict[str, Any]] = None
    output: Optional[str] = None
    content: Optional[str] = None    # set when type == "llm_response"
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    duration_ms: Optional[int] = None


class CommandExecution(BaseModel):
    steps: list[ExecutionStep] = Field(default_factory=list)
    required_confirmation: bool = False
    confirmed: bool = False
    duration_ms: Optional[int] = None


class CommandOutput(BaseModel):
    response: Optional[str] = None
    platform_message_id: Optional[str] = None


class CommandBilling(BaseModel):
    tokens_input: int = 0
    tokens_output: int = 0
    model: Optional[str] = None
    cost_usd: float = 0.0


class CommandInDB(BaseModel):
    """Full command/audit log document stored in MongoDB."""
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    server_id: str
    session_id: str

    input: CommandInput
    routing: Optional[CommandRouting] = None
    execution: CommandExecution = Field(default_factory=CommandExecution)
    output: CommandOutput = Field(default_factory=CommandOutput)
    billing: CommandBilling = Field(default_factory=CommandBilling)

    status: Literal["pending", "running", "completed", "failed", "blocked"] = "pending"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Session DB Model — stored in MongoDB `Sessions` collection
# ---------------------------------------------------------------------------

class PendingConfirmation(BaseModel):
    command_id: str
    action: str
    expires_at: datetime


class SessionInDB(BaseModel):
    """Conversation session — groups messages in one context window."""
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    server_id: str
    platform: Literal["telegram", "whatsapp", "api", "web"]
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_active: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: Optional[datetime] = None
    message_count: int = 0
    pending_confirmation: Optional[PendingConfirmation] = None

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# API Request / Response schemas
# ---------------------------------------------------------------------------

class ServerCreateRequest(BaseModel):
    """POST /api/v1/servers — add a new SSH server."""
    name: str
    description: Optional[str] = None
    host: str
    port: int = 22
    username: str
    ssh_private_key: Optional[str] = None     # immediately stored in Vault, never persisted


class ServerResponse(BaseModel):
    """Safe server summary returned to the client."""
    id: Optional[str] = Field(None, alias="_id")
    server_id: Optional[str] = None
    name: str
    status: str
    host: Optional[str] = None
    os: Optional[str] = None
    last_connected_at: Optional[datetime] = None
    created_at: datetime
    # Populated only on POST /api/v1/servers — the user must add this to their server's
    # ~/.ssh/authorized_keys before GenOS can connect via SSH.
    public_key: Optional[str] = None

    model_config = {"populate_by_name": True}


class ServerTestResponse(BaseModel):
    """Response for GET /api/v1/servers/{server_id}/test."""
    server_id: str
    success: bool
    # Human-readable message — describes what happened (connected / auth failed / etc.)
    message: str
    # Output from the test commands run on the remote (whoami + pwd), if successful
    whoami: Optional[str] = None
    cwd: Optional[str] = None
    latency_ms: Optional[float] = None


class CommandHistoryItem(BaseModel):
    """Single item returned in GET /api/v1/agent/history."""
    command_id: str
    input_message: str
    response: Optional[str] = None
    agent: Optional[str] = None
    status: str
    created_at: datetime
    duration_ms: Optional[int] = None


class SystemMetrics(BaseModel):
    """GET /api/v1/servers/{server_id}/metrics response."""
    server_id: str
    timestamp: datetime
    cpu: dict[str, Any]
    memory: dict[str, Any]
    disk: dict[str, Any]
    network: dict[str, Any]
    top_processes: list[dict[str, Any]] = Field(default_factory=list)