from typing import Optional, Literal, Any, Annotated
from pydantic import BaseModel, Field
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# LangGraph AgentState — passed through the graph nodes
# ---------------------------------------------------------------------------

class AgentState(BaseModel):
    """
    Full state object carried through the LangGraph StateGraph.
    Not sent over the wire — used internally by agent nodes.
    """
    messages: list[dict[str, Any]] = Field(default_factory=list)  # HumanMessage / AIMessage dicts
    user_id: str
    server_id: str
    session_id: str
    next_agent: Optional[str] = None         # routing decision from orchestrator
    confirmed: bool = False                   # user confirmed a dangerous operation
    server_memory: list[str] = Field(default_factory=list)  # injected from Qdrant
    command_id: Optional[str] = None         # for WebSocket trace updates
    platform: Literal["telegram", "whatsapp", "api", "web"] = "api"


# ---------------------------------------------------------------------------
# API Request / Response schemas
# ---------------------------------------------------------------------------

class AgentRunRequest(BaseModel):
    """POST /api/v1/agent/run — trigger an agent command."""
    message: str
    server_id: str
    session_id: Optional[str] = None         # creates a new session if omitted
    confirmed: bool = False                   # set True when user confirms a dangerous op


class AgentRunResponse(BaseModel):
    """202 Accepted — track progress via WebSocket."""
    command_id: str
    session_id: str
    status: Literal["queued", "running"] = "queued"
    trace_url: Optional[str] = None          # ws://api.genos.dev/ws/trace/{session_id}


class AgentStatusResponse(BaseModel):
    """GET /api/v1/agent/status/{command_id}"""
    command_id: str
    status: Literal["pending", "running", "completed", "failed", "blocked"]
    response: Optional[str] = None
    steps: list[dict[str, Any]] = Field(default_factory=list)
    duration_ms: Optional[int] = None
    tokens_used: Optional[int] = None


# ---------------------------------------------------------------------------
# WebSocket trace event schemas (server → client)
# ---------------------------------------------------------------------------

class TraceAgentStart(BaseModel):
    type: Literal["agent_start"] = "agent_start"
    agent: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TraceToolCall(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    tool: str
    input: dict[str, Any] = Field(default_factory=dict)
    step: int


class TraceToolResult(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    output: str
    step: int


class TraceLLMToken(BaseModel):
    type: Literal["llm_token"] = "llm_token"
    token: str


class TraceConfirmationRequired(BaseModel):
    type: Literal["confirmation_required"] = "confirmation_required"
    action: str
    command_id: str


class TraceComplete(BaseModel):
    type: Literal["complete"] = "complete"
    response: str
    duration_ms: int


class TraceError(BaseModel):
    type: Literal["error"] = "error"
    message: str
    code: Optional[str] = None


# Union type for all trace events — useful when serialising to WebSocket
TraceEvent = (
    TraceAgentStart
    | TraceToolCall
    | TraceToolResult
    | TraceLLMToken
    | TraceConfirmationRequired
    | TraceComplete
    | TraceError
)


# ---------------------------------------------------------------------------
# Messaging webhook payload schemas
# ---------------------------------------------------------------------------

class TelegramMessage(BaseModel):
    """Relevant subset of a Telegram Update object."""
    chat_id: int
    from_user_id: int
    username: Optional[str] = None
    text: str
    date: int


class TwilioWhatsAppPayload(BaseModel):
    """Form-encoded payload sent by Twilio for every WhatsApp message."""
    From: str           # e.g. "whatsapp:+919876543210"
    Body: str
    MessageSid: str
    To: Optional[str] = None