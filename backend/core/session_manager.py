from __future__ import annotations

import hashlib
import os
import tempfile
import threading
import time
from dataclasses import dataclass
from typing import Optional

from .sshconnector import PersistentSSHConnector


@dataclass
class _SessionEntry:
    connector: PersistentSSHConnector
    last_used: float
    managed_key_path: Optional[str] = None
    key_fingerprint: Optional[str] = None


_connections: dict[str, _SessionEntry] = {}
_connections_lock = threading.RLock()


def _connection_id(hostname: str, username: str, port: int) -> str:
    return f"{username}@{hostname}:{port}"


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _write_managed_key(private_key_pem: str) -> str:
    fd, key_path = tempfile.mkstemp(prefix="genos_", suffix=".pem")
    try:
        os.write(fd, private_key_pem.encode("utf-8"))
    finally:
        os.close(fd)
    try:
        os.chmod(key_path, 0o600)
    except Exception:
        pass
    return key_path


def _cleanup_entry(entry: _SessionEntry) -> None:
    try:
        entry.connector.disconnect()
    except Exception:
        pass

    if entry.managed_key_path:
        try:
            if os.path.exists(entry.managed_key_path):
                os.remove(entry.managed_key_path)
        except Exception:
            pass


def get_connector(
    hostname: str,
    username: str,
    *,
    port: Optional[int] = None,
    password: Optional[str] = None,
    key_path: Optional[str] = None,
    key_material: Optional[str] = None,
) -> PersistentSSHConnector:
    """
    Get or create a persistent SSH connector for a user@host.
    Reuses a live connector when available.
    """
    resolved_port = port if port is not None else int(os.environ.get("SSH_PORT", 22))
    resolved_password = password if password is not None else os.environ.get("SSH_PASSWORD")
    resolved_key_path = key_path if key_path is not None else os.environ.get("KEY_PATH")
    key_fp = _fingerprint(key_material) if key_material else None

    cid = _connection_id(hostname, username, resolved_port)

    with _connections_lock:
        existing = _connections.get(cid)
        if existing and existing.connector.is_connected:
            if key_fp is None or key_fp == existing.key_fingerprint:
                existing.last_used = time.time()
                return existing.connector
            _connections.pop(cid, None)
            _cleanup_entry(existing)

        if existing:
            _connections.pop(cid, None)
            _cleanup_entry(existing)

        managed_key_path = None
        if key_material and not resolved_key_path:
            managed_key_path = _write_managed_key(key_material)
            resolved_key_path = managed_key_path

        connector = PersistentSSHConnector(
            host=hostname,
            port=resolved_port,
            username=username,
            password=resolved_password,
            key_path=resolved_key_path,
        )

    connector.connect()

    with _connections_lock:
        _connections[cid] = _SessionEntry(
            connector=connector,
            last_used=time.time(),
            managed_key_path=managed_key_path,
            key_fingerprint=key_fp,
        )

    return connector


def disconnect_user(hostname: str, username: str, *, port: Optional[int] = None) -> None:
    resolved_port = port if port is not None else int(os.environ.get("SSH_PORT", 22))
    cid = _connection_id(hostname, username, resolved_port)

    with _connections_lock:
        entry = _connections.pop(cid, None)

    if entry:
        _cleanup_entry(entry)


def disconnect_all() -> int:
    with _connections_lock:
        items = list(_connections.items())
        _connections.clear()

    disconnected = 0
    for _, entry in items:
        _cleanup_entry(entry)
        disconnected += 1
    return disconnected


def prune_idle(max_idle_seconds: int = 900) -> int:
    now = time.time()

    with _connections_lock:
        stale_ids = [
            cid
            for cid, entry in _connections.items()
            if (now - entry.last_used) > max_idle_seconds or not entry.connector.is_connected
        ]
        stale_entries = [_connections.pop(cid) for cid in stale_ids]

    closed = 0
    for entry in stale_entries:
        _cleanup_entry(entry)
        closed += 1
    return closed


def active_connection_ids() -> list[str]:
    with _connections_lock:
        return sorted(_connections.keys())