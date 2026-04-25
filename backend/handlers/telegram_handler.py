"""Telegram update handler — command routing and agent dispatch.

Called from routes/telegram/telegram.py as a FastAPI BackgroundTask so the
webhook endpoint can return 200 immediately while we process the update.

Each incoming Telegram message is an independent request; session state
(which server the user is talking to, any pending confirmation) lives in
the TelegramSessions MongoDB collection so it survives process restarts.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from core.access import has_server_access, resolve_user_role
from core.db import telegram_link_tokens_collection, telegram_sessions_collection
from core.serverutils import getaccessibleservers, getserverbyid
from core.userutils import get_user_by_chat_id, updateuser
from services.telegram_service import send_message
from services.vault import get_ssh_key

logger = logging.getLogger(__name__)

# ── Per-chat graph cache (survives within the process lifetime) ───────────────
# Maps chat_id → compiled LangGraph instance (one MemorySaver each so
# confirmation state is isolated per user).
_graph_cache: dict[int, object] = {}


def _get_graph(chat_id: int, hostname: str, username: str, *, port: int, key_material: str):
    """Return or create the compiled agent graph for this chat session."""
    from graph import build_graph
    if chat_id not in _graph_cache:
        checkpointer = MemorySaver()
        _graph_cache[chat_id] = (
            build_graph(hostname, username, port=port, key_material=key_material, checkpointer=checkpointer),
            checkpointer,
        )
    return _graph_cache[chat_id]


def _evict_graph(chat_id: int) -> None:
    _graph_cache.pop(chat_id, None)


# ── Session helpers ───────────────────────────────────────────────────────────

async def _get_session(chat_id: int) -> Optional[dict]:
    return await telegram_sessions_collection.find_one({"chat_id": chat_id})


async def _set_session(chat_id: int, user_id: str, server_id: str, user_role: str) -> None:
    await telegram_sessions_collection.update_one(
        {"chat_id": chat_id},
        {"$set": {
            "chat_id": chat_id,
            "user_id": user_id,
            "server_id": server_id,
            "user_role": user_role,
            "pending_confirm": None,
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )


async def _set_pending_confirm(chat_id: int, interrupt_val: dict) -> None:
    await telegram_sessions_collection.update_one(
        {"chat_id": chat_id},
        {"$set": {"pending_confirm": interrupt_val}},
    )


async def _clear_pending_confirm(chat_id: int) -> None:
    await telegram_sessions_collection.update_one(
        {"chat_id": chat_id},
        {"$set": {"pending_confirm": None}},
    )


async def _delete_session(chat_id: int) -> None:
    await telegram_sessions_collection.delete_one({"chat_id": chat_id})
    _evict_graph(chat_id)


# ── Commands ──────────────────────────────────────────────────────────────────

async def cmd_start(chat_id: int, text: str, tg_username: Optional[str]) -> None:
    """/start <token> — link GenOS account via deep-link token."""
    parts = text.strip().split(maxsplit=1)
    if len(parts) < 2:
        await send_message(chat_id,
            "👋 Welcome to *GenOS Bot*!\n\n"
            "To link your GenOS account, visit your GenOS profile page and click *Connect Telegram*."
        )
        return

    token = parts[1].strip()
    now = datetime.now(timezone.utc)
    token_doc = await telegram_link_tokens_collection.find_one({"token": token})

    if not token_doc:
        await send_message(chat_id,
            "❌ Invalid or expired link.\nGenerate a new one from your GenOS profile."
        )
        return

    if token_doc["expires_at"].replace(tzinfo=timezone.utc) < now:
        await telegram_link_tokens_collection.delete_one({"token": token})
        await send_message(chat_id,
            "❌ This link has expired.\nGenerate a new one from your GenOS profile."
        )
        return

    # Check if already linked
    existing = await get_user_by_chat_id(chat_id)
    if existing:
        await send_message(chat_id, "✅ Already linked! Send /servers to get started.")
        await telegram_link_tokens_collection.delete_one({"token": token})
        return

    user_id = str(token_doc["user_id"])
    update_data: dict = {"telegram_chat_id": chat_id}
    if tg_username:
        update_data["telegram_username"] = f"@{tg_username}"

    await updateuser(user_id, update_data)
    await telegram_link_tokens_collection.delete_one({"token": token})

    await send_message(chat_id,
        "✅ *Your GenOS account is now linked!*\n\n"
        "Send /servers to see your servers.\n"
        "Send /help for all commands."
    )


async def cmd_help(chat_id: int) -> None:
    """/help — show all available commands."""
    await send_message(chat_id,
        "*GenOS Bot Commands*\n\n"
        "/servers           — List your servers\n"
        "/use \\<name\\>       — Select a server to chat with\n"
        "/status            — Show current server metrics\n"
        "/disconnect        — Stop talking to current server\n"
        "/unlink            — Unlink Telegram from GenOS\n"
        "/help              — Show this message\n\n"
        "Send any message in plain English to run a command on the selected server."
    )


async def cmd_servers(chat_id: int) -> None:
    """/servers — list all accessible servers for this chat."""
    user = await get_user_by_chat_id(chat_id)
    if not user:
        await send_message(chat_id,
            "❌ Account not linked.\nVisit GenOS to connect Telegram."
        )
        return

    servers = await getaccessibleservers(str(user.id))
    if not servers:
        await send_message(chat_id,
            "You have no servers yet.\nAdd one from the GenOS dashboard."
        )
        return

    lines = ["🖥 *Your Servers*\n"]
    for i, srv in enumerate(servers, start=1):
        status = srv.connection.status or "unknown"
        dot = "●" if status == "connected" else "○"
        lines.append(f"{i}. {srv.name or srv.server_id} ({dot} {status.title()})")

    lines.append("\nSend `/use <number>` or `/use <name>` to select a server.")
    await send_message(chat_id, "\n".join(lines))


async def cmd_use(chat_id: int, text: str) -> None:
    """/use <name or number> — select a server for this chat session."""
    user = await get_user_by_chat_id(chat_id)
    if not user:
        await send_message(chat_id,
            "❌ Account not linked.\nVisit GenOS to connect Telegram."
        )
        return

    parts = text.strip().split(maxsplit=1)
    if len(parts) < 2:
        await send_message(chat_id, "Usage: /use <server name or number>")
        return

    query = parts[1].strip()
    servers = await getaccessibleservers(str(user.id))

    target = None
    # Try numeric index
    if query.isdigit():
        idx = int(query) - 1
        if 0 <= idx < len(servers):
            target = servers[idx]
    else:
        # Try name match (case-insensitive)
        q_lower = query.lower()
        for srv in servers:
            if (srv.name or "").lower() == q_lower or srv.server_id.lower() == q_lower:
                target = srv
                break

    if not target:
        await send_message(chat_id,
            f"❌ Server *{query}* not found.\nSend /servers to see your list."
        )
        return

    if not await has_server_access(str(user.id), target):
        await send_message(chat_id, "❌ You don't have access to this server.")
        return

    user_role = await resolve_user_role(str(user.id), target) or "viewer"
    await _set_session(chat_id, str(user.id), target.server_id, user_role)
    _evict_graph(chat_id)  # force fresh graph for new server

    await send_message(chat_id,
        f"✅ Now talking to *{target.name or target.server_id}*\n"
        f"Your role: {user_role}\n\n"
        "Send any command in plain English."
    )


async def cmd_status(chat_id: int) -> None:
    """/status — show latest polled metrics for the selected server."""
    session = await _get_session(chat_id)
    if not session or not session.get("server_id"):
        await send_message(chat_id,
            "No server selected.\nSend /servers to pick one."
        )
        return

    from services.poller import fetch_latest_metric
    server_id = session["server_id"]
    server = await getserverbyid(server_id)
    server_name = (server.name if server else None) or server_id

    doc = await fetch_latest_metric(server_id)
    if not doc or not doc.get("success"):
        await send_message(chat_id,
            f"⚠️ No metrics available for *{server_name}*.\n"
            "The server may not have been polled yet."
        )
        return

    polled_at = doc.get("polled_at")
    if isinstance(polled_at, datetime):
        age_secs = (datetime.now(timezone.utc) - polled_at.replace(tzinfo=timezone.utc)).total_seconds()
        age_str = f"{int(age_secs // 60)} min ago" if age_secs >= 60 else f"{int(age_secs)}s ago"
    else:
        age_str = "unknown"

    cpu  = doc.get("cpu_percent")
    mem  = doc.get("memory_percent")
    disk = doc.get("disk_percent")
    load = doc.get("load_average", "—")

    def fmt(v):
        return f"{v:.1f}%" if v is not None else "—"

    await send_message(chat_id,
        f"📊 *{server_name}*\n\n"
        f"CPU:    {fmt(cpu)}\n"
        f"Memory: {fmt(mem)}\n"
        f"Disk:   {fmt(disk)}\n"
        f"Load:   {load or '—'}\n\n"
        f"Last updated: {age_str}"
    )


async def cmd_disconnect(chat_id: int) -> None:
    """/disconnect — deselect current server."""
    await _delete_session(chat_id)
    await send_message(chat_id,
        "✅ Disconnected from server.\nSend /servers to pick another."
    )


async def cmd_unlink(chat_id: int) -> None:
    """/unlink — remove Telegram from GenOS account."""
    user = await get_user_by_chat_id(chat_id)
    if not user:
        await send_message(chat_id, "No linked account found.")
        return

    await updateuser(str(user.id), {"telegram_chat_id": None, "telegram_username": None})
    await _delete_session(chat_id)
    await send_message(chat_id, "✅ Telegram unlinked from GenOS.")


# ── Agent chat ────────────────────────────────────────────────────────────────

async def cmd_agent(chat_id: int, text: str) -> None:
    """Free-text message — run LangGraph agent on the selected server."""
    user = await get_user_by_chat_id(chat_id)
    if not user:
        await send_message(chat_id,
            "❌ Account not linked.\nVisit GenOS to connect Telegram."
        )
        return

    session = await _get_session(chat_id)
    if not session or not session.get("server_id"):
        await send_message(chat_id,
            "No server selected.\nSend /servers to pick one first."
        )
        return

    server_id = session["server_id"]
    user_role  = session.get("user_role", "viewer")
    pending    = session.get("pending_confirm")

    server = await getserverbyid(server_id)
    if not server:
        await send_message(chat_id, "❌ Server not found. Send /servers to pick another.")
        return

    if server.connection.status != "connected":
        await send_message(chat_id, "❌ Server is offline. Cannot execute commands.")
        return

    # ── Confirmation reply flow ───────────────────────────────────────────────
    if pending:
        decision = text.strip().lower()
        if decision not in {"yes", "y", "no", "n"}:
            await send_message(chat_id,
                "⚠️ Pending confirmation:\n"
                f"`{pending.get('proposed_command', '')}`\n\n"
                "Reply *yes* to confirm or *no* to cancel."
            )
            return

        await _clear_pending_confirm(chat_id)

        try:
            vault_data = await asyncio.to_thread(
                get_ssh_key,
                hostname=server.connection.host,
                username=server.connection.username,
            )
            key_material = vault_data["private_key"]
        except Exception as exc:
            await send_message(chat_id, f"❌ Vault key retrieval failed: {exc}")
            return

        graph_tuple = _get_graph(
            chat_id,
            server.connection.host,
            server.connection.username,
            port=server.connection.port,
            key_material=key_material,
        )
        agent_graph, _ = graph_tuple
        thread_config = {"configurable": {"thread_id": f"tg:{chat_id}"}}

        try:
            result = await agent_graph.ainvoke(Command(resume=decision), config=thread_config)
        except Exception as exc:
            logger.error("telegram handler: graph resume error: %s", exc)
            await send_message(chat_id, f"⚠️ Execution error: {exc}")
            return

        snapshot = agent_graph.get_state(thread_config)
        if snapshot.next:
            interrupt_val = snapshot.tasks[0].interrupts[0].value
            await _set_pending_confirm(chat_id, interrupt_val)
            await send_message(chat_id,
                f"⚠️ Confirmation required:\n"
                f"`{interrupt_val.get('proposed_command', '')}`\n\n"
                "Reply *yes* to confirm or *no* to cancel."
            )
        else:
            output = _extract_output(result)
            if decision in {"yes", "y"}:
                await send_message(chat_id, f"✅ Executed.\n```\n{output}\n```")
            else:
                await send_message(chat_id, "🚫 Command cancelled.")
        return

    # ── Fresh agent invocation ────────────────────────────────────────────────
    await send_message(chat_id, "⏳ Running...")

    try:
        vault_data = await asyncio.to_thread(
            get_ssh_key,
            hostname=server.connection.host,
            username=server.connection.username,
        )
        key_material = vault_data["private_key"]
    except Exception as exc:
        await send_message(chat_id, f"❌ Vault key retrieval failed: {exc}")
        return

    graph_tuple = _get_graph(
        chat_id,
        server.connection.host,
        server.connection.username,
        port=server.connection.port,
        key_material=key_material,
    )
    agent_graph, _ = graph_tuple
    thread_config = {"configurable": {"thread_id": f"tg:{chat_id}"}}

    from graph import State
    init_state: State = {
        "messages":         [HumanMessage(content=text)],
        "user_id":          str(user.id),
        "user_role":        user_role,
        "context":          "",
        "proposed_command": "",
        "tool_used":        "",
        "critic_verdict":   {},
        "approved":         False,
        "execution_output": "",
    }

    try:
        result = await agent_graph.ainvoke(init_state, config=thread_config)
    except Exception as exc:
        logger.error("telegram handler: graph invocation error: %s", exc)
        await send_message(chat_id, f"⚠️ Agent error: {exc}")
        return

    snapshot = agent_graph.get_state(thread_config)
    if snapshot.next:
        interrupt_val = snapshot.tasks[0].interrupts[0].value
        await _set_pending_confirm(chat_id, interrupt_val)
        await send_message(chat_id,
            f"⚠️ *Confirmation required:*\n"
            f"`{interrupt_val.get('proposed_command', '')}`\n\n"
            "Reply *yes* to confirm or *no* to cancel."
        )
    else:
        output = _extract_output(result)
        verdict  = result.get("critic_verdict", {})
        decision = verdict.get("decision", "ALLOW").upper()

        if decision == "BLOCK":
            user_msg = verdict.get("user_message", "This command is not permitted.")
            role_label = user_role.title()
            await send_message(chat_id, f"🚫 {user_msg} (role: {role_label})")
        else:
            await send_message(chat_id, f"```\n{output}\n```")


def _extract_output(result: dict) -> str:
    """Pull the most useful output string from a graph result dict."""
    raw = result.get("execution_output")
    if raw:
        return str(raw)
    for msg in reversed(result.get("messages", [])):
        if isinstance(msg, AIMessage) and msg.content:
            return str(msg.content)
    return "Done."


# ── Main dispatcher ───────────────────────────────────────────────────────────

async def handle_update(update: dict) -> None:
    """Entry point — parse the Telegram Update dict and route to handler."""
    message = update.get("message") or update.get("edited_message")
    if not message:
        return

    text = (message.get("text") or "").strip()
    if not text:
        return

    chat_id: int = message["chat"]["id"]
    tg_username: Optional[str] = message.get("from", {}).get("username")

    try:
        if text.startswith("/start"):
            await cmd_start(chat_id, text, tg_username)
        elif text == "/servers" or text.startswith("/servers@"):
            await cmd_servers(chat_id)
        elif text.startswith("/use"):
            await cmd_use(chat_id, text)
        elif text == "/status" or text.startswith("/status@"):
            await cmd_status(chat_id)
        elif text == "/disconnect" or text.startswith("/disconnect@"):
            await cmd_disconnect(chat_id)
        elif text == "/unlink" or text.startswith("/unlink@"):
            await cmd_unlink(chat_id)
        elif text == "/help" or text.startswith("/help@"):
            await cmd_help(chat_id)
        else:
            await cmd_agent(chat_id, text)
    except Exception as exc:
        logger.error("telegram_handler: unhandled error for chat %s: %s", chat_id, exc)
        try:
            await send_message(chat_id, "⚠️ Something went wrong. Please try again.")
        except Exception:
            pass
