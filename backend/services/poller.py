"""Anomaly detection poller.

Runs as a background asyncio task spawned from `main.lifespan`. Every POLL_INTERVAL_SEC
it walks every server with `connection.status == "connected"`, runs four quick metric
commands over SSH, parses them, writes a doc into `server_metrics`, and (for each
metric) fires a notification the first time it crosses its threshold after being OK
(OK → BREACH). Recurring breaches do not re-notify.

Guarded by the `ANOMALY_POLLER_ENABLED` env var (defaults to false) so local dev runs
that don't have real SSH targets don't hammer Vault or throw SSH errors on boot.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from core.db import server_metrics_collection, servers_collection
from core.notifications import create_notification
from core.session_manager import get_connector
from core.teams import get_team_by_id
from schema.servers import ServerInDB
from services.vault import get_ssh_key


logger = logging.getLogger(__name__)


# ── Config ───────────────────────────────────────────────────────────────────
POLL_INTERVAL_SEC = int(os.getenv("ANOMALY_POLL_INTERVAL_SEC", "300"))   # 5 min
CPU_THRESHOLD = float(os.getenv("ANOMALY_CPU_THRESHOLD", "85"))
MEM_THRESHOLD = float(os.getenv("ANOMALY_MEM_THRESHOLD", "85"))
DISK_THRESHOLD = float(os.getenv("ANOMALY_DISK_THRESHOLD", "85"))


# ── Cooldown state ───────────────────────────────────────────────────────────
# Maps (server_id, metric) → current breach state. True means we have already
# fired a notification and are still above threshold; we only re-fire on
# OK → BREACH transitions.
_last_breach_state: dict[tuple[str, str], bool] = {}


# ── Metric parsing helpers ───────────────────────────────────────────────────

def _parse_top_cpu(output: str) -> Optional[float]:
    """Parse CPU% from `top -bn1 | head -n 5`.
    Looks for the %Cpu(s): line and returns 100 - idle."""
    if not output:
        return None
    for line in output.splitlines():
        if "Cpu(s)" in line or "%Cpu" in line:
            # e.g. "%Cpu(s):  1.2 us,  0.3 sy,  0.0 ni, 98.5 id, ..."
            match = re.search(r"([\d.]+)\s*id", line)
            if match:
                try:
                    idle = float(match.group(1))
                    return round(max(0.0, 100.0 - idle), 2)
                except ValueError:
                    continue
    return None


def _parse_free_mem(output: str) -> Optional[float]:
    """Parse memory% used from `free -m`."""
    if not output:
        return None
    for line in output.splitlines():
        stripped = line.strip()
        if stripped.startswith("Mem:"):
            parts = stripped.split()
            try:
                total = float(parts[1])
                used = float(parts[2])
                if total <= 0:
                    return None
                return round((used / total) * 100.0, 2)
            except (IndexError, ValueError):
                return None
    return None


def _parse_df(output: str) -> Optional[float]:
    """Parse disk% used from `df -hP /`."""
    if not output:
        return None
    lines = [l for l in output.splitlines() if l.strip()]
    if len(lines) < 2:
        return None
    # Expect header + one row. Some distros wrap — find row containing a %.
    for line in lines[1:]:
        match = re.search(r"(\d+)%", line)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                continue
    return None


def _parse_uptime(output: str) -> Optional[str]:
    """Extract the load average string from `uptime`."""
    if not output:
        return None
    match = re.search(r"load averages?:\s*(.+)$", output.strip())
    if match:
        return match.group(1).strip()
    return None


# ── Notification helpers ─────────────────────────────────────────────────────

def _threshold_for(metric: str) -> float:
    return {
        "cpu": CPU_THRESHOLD,
        "memory": MEM_THRESHOLD,
        "disk": DISK_THRESHOLD,
    }.get(metric, 100.0)


async def _collect_recipients(server: ServerInDB) -> list[str]:
    """Who gets notified for this server: the owner, plus every team member if
    the server is team-shared (but only members with access to it)."""
    recipients: set[str] = {str(server.owner_id)} if server.owner_id else set()

    team_id = getattr(server, "team_id", None)
    if not team_id:
        return list(recipients)

    team = await get_team_by_id(team_id)
    if not team:
        return list(recipients)

    team_servers = set(team.get("server_ids") or [])
    team_has_server = server.server_id in team_servers

    for member in team.get("members", []) or []:
        member_ids = member.get("server_ids") or []
        if not member_ids:
            if team_has_server:
                recipients.add(str(member.get("user_id")))
        else:
            if server.server_id in member_ids:
                recipients.add(str(member.get("user_id")))

    return list(recipients)


async def _fire_anomaly(server: ServerInDB, metric: str, value: float) -> None:
    recipients = await _collect_recipients(server)
    if not recipients:
        return
    payload = {
        "server_id": server.server_id,
        "server_name": server.name or server.server_id,
        "metric": metric,
        "value": round(value, 2),
        "threshold": _threshold_for(metric),
    }
    for user_id in recipients:
        try:
            await create_notification(user_id, "anomaly_alert", payload)
        except Exception as exc:
            logger.error("failed to create anomaly notification for %s: %s", user_id, exc)


async def _evaluate_metric(
    server: ServerInDB,
    metric: str,
    value: Optional[float],
) -> None:
    if value is None:
        return
    threshold = _threshold_for(metric)
    is_breach = value >= threshold
    key = (server.server_id, metric)
    previously = _last_breach_state.get(key, False)

    if is_breach and not previously:
        # OK → BREACH transition: notify once.
        await _fire_anomaly(server, metric, value)
    _last_breach_state[key] = is_breach


# ── Poll implementation ──────────────────────────────────────────────────────

async def _poll_server(server: ServerInDB) -> None:
    host = server.connection.host
    username = server.connection.username
    port = server.connection.port

    try:
        vault_data = await asyncio.to_thread(get_ssh_key, hostname=host, username=username)
        private_key_pem = vault_data.get("private_key")
    except Exception as exc:
        logger.warning("poller: vault miss for %s: %s", server.server_id, exc)
        await server_metrics_collection.insert_one({
            "server_id": server.server_id,
            "polled_at": datetime.now(timezone.utc),
            "success": False,
            "error": f"vault: {exc}",
            "raw": {},
        })
        return

    try:
        connector = await asyncio.to_thread(
            get_connector,
            host,
            username,
            port=port,
            key_material=private_key_pem,
        )
    except Exception as exc:
        logger.warning("poller: connector failed for %s: %s", server.server_id, exc)
        await server_metrics_collection.insert_one({
            "server_id": server.server_id,
            "polled_at": datetime.now(timezone.utc),
            "success": False,
            "error": f"ssh: {exc}",
            "raw": {},
        })
        return

    commands = [
        ("cpu", "top -bn1 | head -n 5"),
        ("memory", "free -m"),
        ("disk", "df -hP /"),
        ("uptime", "uptime"),
    ]
    raw: dict[str, str] = {}
    for label, cmd in commands:
        try:
            raw[label] = await asyncio.to_thread(connector.exec, cmd)
        except Exception as exc:
            logger.warning("poller: %s %s failed: %s", server.server_id, label, exc)
            raw[label] = ""

    doc: dict[str, Any] = {
        "server_id": server.server_id,
        "polled_at": datetime.now(timezone.utc),
        "cpu_percent": _parse_top_cpu(raw.get("cpu", "")),
        "memory_percent": _parse_free_mem(raw.get("memory", "")),
        "disk_percent": _parse_df(raw.get("disk", "")),
        "load_average": _parse_uptime(raw.get("uptime", "")),
        "raw": raw,
        "success": True,
    }

    try:
        await server_metrics_collection.insert_one(doc)
    except Exception as exc:
        logger.error("poller: failed to persist metrics for %s: %s", server.server_id, exc)

    await _evaluate_metric(server, "cpu", doc["cpu_percent"])
    await _evaluate_metric(server, "memory", doc["memory_percent"])
    await _evaluate_metric(server, "disk", doc["disk_percent"])


async def _iter_connected_servers():
    cursor = servers_collection.find({"connection.status": "connected"})
    async for server_data in cursor:
        try:
            server_data["_id"] = str(server_data["_id"])
            yield ServerInDB(**server_data)
        except Exception as exc:
            logger.warning("poller: skipping malformed server doc: %s", exc)


async def poll_once() -> int:
    """Run one full pass over every connected server. Returns number polled."""
    count = 0
    async for server in _iter_connected_servers():
        try:
            await _poll_server(server)
        except Exception as exc:
            logger.error("poller: unhandled error on %s: %s", server.server_id, exc)
        count += 1
    return count


async def poll_loop() -> None:
    """Outer loop. Sleeps POLL_INTERVAL_SEC between passes."""
    logger.info(
        "anomaly poller: enabled, interval=%ss thresholds cpu=%s mem=%s disk=%s",
        POLL_INTERVAL_SEC, CPU_THRESHOLD, MEM_THRESHOLD, DISK_THRESHOLD,
    )
    # Initial stagger so the poller doesn't slam startup.
    await asyncio.sleep(5)
    while True:
        started = datetime.now(timezone.utc)
        try:
            count = await poll_once()
            logger.info("anomaly poller: polled %d server(s)", count)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("anomaly poller: pass failed: %s", exc)

        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        sleep_for = max(5.0, POLL_INTERVAL_SEC - elapsed)
        await asyncio.sleep(sleep_for)


# ── History trimming (optional helper used by routes) ────────────────────────

async def fetch_metrics_history(server_id: str, hours: int = 24) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    cursor = (
        server_metrics_collection
        .find({"server_id": server_id, "polled_at": {"$gte": cutoff}})
        .sort("polled_at", -1)
        .limit(500)
    )
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)
    return results


async def fetch_latest_metric(server_id: str) -> Optional[dict]:
    doc = await server_metrics_collection.find_one(
        {"server_id": server_id},
        sort=[("polled_at", -1)],
    )
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc
