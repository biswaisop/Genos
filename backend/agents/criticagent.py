"""
Critic agent node — safety gate before every END in the LangGraph.

Architecture rules (from ARCHITECTURE.md §9 + §15):

  BLOCK   — rm -rf /, dd, mkfs, shutdown, chmod /etc/*, wildcard destroys
  CONFIRM — rm <file>, kill/pkill, systemctl stop, apt remove, sudo state ops
  ALLOW   — reads, lists, stats, installs (-y), /tmp writes, non-destructive

The critic runs on a SEPARATE, more capable llm (Sonnet-level reasoning).
For the current stack this means a separate ChatGroq instance at temperature=0
so the safety check is never traded off for speed or cost.

LangGraph integration:
    graph.add_node("critic", critic_node)

The node returns the updated state dict. Callers should check state["confirmed"]
and route accordingly — CONFIRM pauses the graph and awaits a user "yes".
Pending confirmation data is stored in Redis with a 60-second TTL.
"""
import json
import logging
import re
from typing import Literal
import os
import shlex

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from dotenv import load_dotenv

_PENDING_CONFIRM: dict[str, dict] = {}

# Commands that are always safe — bypass the LLM critic entirely.
# This saves a full LLM call per invocation for read-only operations.
_READ_ONLY_BINS = frozenset({
    "ls", "ll", "pwd", "whoami", "id", "hostname", "uname",
    "cat", "less", "more", "head", "tail", "tac",
    "find", "locate", "grep", "egrep", "fgrep", "awk", "sed",
    "wc", "sort", "uniq", "cut", "tr", "stat", "file",
    "ps", "top", "htop", "uptime", "free", "df", "du",
    "env", "printenv", "date", "echo", "which", "type",
    "ip", "ifconfig", "ss", "netstat", "dig", "nslookup", "host",
    "tree", "history",
})

# Blockers — never allow, don't even ask the LLM.
_HARD_BLOCK_PATTERNS = [
    re.compile(r"\brm\s+-rf\s+/(\s|$)"),
    re.compile(r"\brm\s+-rf\s+~(\s|$|/)"),
    re.compile(r"\brm\s+-rf\s+/\*"),
    re.compile(r"\bmkfs\.[a-z0-9]+\s"),
    re.compile(r"\bdd\s+.*\bif=/dev/"),
    re.compile(r"\b(shutdown|poweroff|reboot|halt)\b"),
    re.compile(r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:"),
]


def _fast_path_verdict(command: str) -> dict | None:
    """Return a verdict without calling the LLM when the command is
    obviously safe or obviously blocked. Returns None if LLM should decide."""
    if not command:
        return None

    for pattern in _HARD_BLOCK_PATTERNS:
        if pattern.search(command):
            return {
                "decision": "BLOCK",
                "risk_level": "high",
                "reason": "matches hard-block pattern",
                "user_message": "This action is permanently blocked for safety reasons.",
            }

    try:
        tokens = shlex.split(command)
    except ValueError:
        return None

    if not tokens:
        return None

    head = tokens[0].lstrip("/").split("/")[-1]

    # Whole command has no sudo / no redirection / only read-only binaries
    has_mutator = any(
        tok in {"sudo", ">", ">>", "rm", "mv", "cp", "kill", "pkill",
                "systemctl", "apt", "apt-get", "pip", "chmod", "chown",
                "dd", "mkfs"}
        for tok in tokens
    )
    if not has_mutator and head in _READ_ONLY_BINS:
        return {
            "decision": "ALLOW",
            "risk_level": "low",
            "reason": "read-only command (fast-path)",
            "user_message": "",
        }

    return None


class SessionMemoryService:
    """Minimal in-memory fallback for pending confirmations."""

    async def store_pending_confirm(self, user_id: str, pending_data: dict) -> None:
        _PENDING_CONFIRM[user_id] = pending_data

load_dotenv()

logger = logging.getLogger(__name__)

# ── Critic LLM — runs on Groq, temperature=0, small/cheap model by default ───
_critic_llm = None


def _get_critic_llm() -> ChatGroq:
    global _critic_llm
    if _critic_llm is None:
        api_key = os.getenv("GROQ")
        if not api_key:
            raise RuntimeError("GROQ environment variable is required for critic checks.")
        # Default to a small fast Groq model to save TPD budget.
        # Override with CRITIC_MODEL in .env if you want tighter reasoning.
        _critic_llm = ChatGroq(
            model=os.getenv("CRITIC_MODEL", "llama-3.1-8b-instant"),
            temperature=0,
            api_key=api_key,
        )
    return _critic_llm

# Slim critic prompt — rules compressed, examples dropped (fast-path covers them).
CRITIC_SYSTEM_PROMPT = (
    "You judge the safety of a single bash command. "
    "Reply with ONE JSON object only, no prose:\n"
    '{"decision":"ALLOW|CONFIRM|BLOCK","risk_level":"low|medium|high",'
    '"reason":"…","user_message":"…"}\n'
    "ALLOW: read-only, additive, /tmp writes, scripts.\n"
    "CONFIRM: specific rm/kill/pkill, systemctl stop|restart, apt remove, "
    "pip uninstall, overwriting configs, any sudo changing state.\n"
    "BLOCK: rm -rf / | rm -rf ~ | rm -rf /*, dd if=/dev/*, mkfs.*, "
    "shutdown|reboot|poweroff|halt, chmod/chown on /etc/passwd|shadow|sudoers, "
    "fork bombs, clearly destructive or exfiltration commands.\n"
    "Ambiguous → CONFIRM. user_message empty for ALLOW; for CONFIRM state what "
    "will happen and ask reply YES."
)


# ── JSON extraction — handles LLM wrapping output in ```json ... ``` ──────────
def _parse_verdict(raw: str) -> dict:
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    # Try to extract first {...} object
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    # Fail-safe: block on any parse failure
    logger.warning("Critic failed to parse LLM response: %s", raw[:200])
    return {
        "decision": "BLOCK",
        "risk_level": "high",
        "reason": "critic response could not be parsed — blocking for safety",
        "user_message": "Action blocked: internal safety check failed. Please try again.",
    }


# ── Public evaluate function (sync, reusable outside LangGraph) ───────────────

def evaluate_command(user_intent: str, proposed_command: str) -> dict:
    """
    Synchronously evaluate a proposed bash command.

    Used by the critic node in graph.py before any command is executed.
    Returns a verdict dict:
      {decision, risk_level, reason, user_message}
    Fail-safe: any exception → BLOCK.
    """
    # Fast path — skip LLM for obvious read-only / obvious block commands.
    fast = _fast_path_verdict(proposed_command)
    if fast is not None:
        logger.info("critic fast-path: %s", fast["decision"])
        return fast

    try:
        response = _get_critic_llm().invoke([
            SystemMessage(content=CRITIC_SYSTEM_PROMPT),
            HumanMessage(content=f"command: {proposed_command}"),
        ])
        return _parse_verdict(response.content)
    except Exception as exc:
        logger.error("evaluate_command failed: %s", exc)
        return {
            "decision":     "BLOCK",
            "risk_level":   "high",
            "reason":       f"critic unavailable: {exc}",
            "user_message": "Action blocked: safety check unavailable. Please try again.",
        }


# ── LangGraph node ─────────────────────────────────────────────────────────────
async def critic_node(state: dict) -> dict:
    """
    LangGraph node — runs after the agent finishes (no more tool calls).

    Reads the agent's last message, calls the critic LLM, and handles:
      ALLOW   → pass through, graph proceeds to END
      CONFIRM → store pending in Redis (60s TTL), append confirmation request
      BLOCK   → append blocked message
    """
    # ── 1. Extract last agent message ─────────────────────────────────────────
    last = state["messages"][-1]
    agent_response = str(getattr(last, "content", ""))

    # Also capture any tool calls in the message for full context
    tool_calls = getattr(last, "tool_calls", [])
    if tool_calls:
        commands = [tc.get("args", {}).get("command", "") for tc in tool_calls]
        agent_response += "\n\nCommands executed: " + " | ".join(filter(None, commands))

    # ── 2. Get original user intent (first HumanMessage) ──────────────────────
    user_intent = ""
    for msg in state["messages"]:
        if isinstance(msg, HumanMessage):
            user_intent = str(msg.content)
            break

    # ── 3. Skip check if user already confirmed ────────────────────────────────
    if state.get("confirmed"):
        logger.info("critic_node: confirmed=True, skipping safety check")
        return state

    # ── 4. Call critic LLM ─────────────────────────────────────────────────────
    try:
        response = _get_critic_llm().invoke([
            SystemMessage(content=CRITIC_SYSTEM_PROMPT),
            HumanMessage(content=(
                f"user_intent: {user_intent}\n\n"
                f"agent_response: {agent_response}"
            )),
        ])
        verdict = _parse_verdict(response.content)
    except Exception as exc:
        logger.error("Critic LLM call failed: %s", exc)
        verdict = {
            "decision": "BLOCK",
            "risk_level": "high",
            "reason": f"critic unavailable: {exc}",
            "user_message": "Action blocked: safety check unavailable. Please try again.",
        }

    decision = verdict.get("decision", "BLOCK").upper()
    logger.info(
        "critic verdict: %s | risk: %s | reason: %s",
        decision, verdict.get("risk_level"), verdict.get("reason"),
    )

    # ── 5. Handle verdict ──────────────────────────────────────────────────────
    if decision == "ALLOW":
        # Nothing to do — graph proceeds to END normally
        pass

    elif decision == "CONFIRM":
        user_id = state.get("user_id", "unknown")
        pending_data = {
            "user_intent": user_intent,
            "agent_response": agent_response,
            "verdict": verdict,
        }
        # Store in Redis with 60s TTL (per architecture §15)
        try:
            svc = SessionMemoryService()
            await svc.store_pending_confirm(user_id, pending_data)
        except Exception as exc:
            logger.error("Failed to store pending confirmation in Redis: %s", exc)

        confirm_msg = verdict.get(
            "user_message",
            "⚠️ This is a potentially destructive operation. Reply YES to confirm."
        )
        state["messages"].append(AIMessage(content=f"⚠️ {confirm_msg}"))

    elif decision == "BLOCK":
        block_msg = verdict.get(
            "user_message",
            "This action has been permanently blocked for safety reasons."
        )
        state["messages"].append(
            AIMessage(content=f"🚫 Blocked: {block_msg}")
        )

    return state