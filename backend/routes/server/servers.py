from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import os
import time
import tempfile
from urllib.parse import unquote
from datetime import datetime, timezone
from schema.servers import ServerCreateRequest, ServerResponse, ServerTestResponse
from schema.metrics import ServerMetricsResponse, ServerStatusResponse
from schema.user import UserInDB
from core.serverutils import (
    createserver,
    getaccessibleservers,
    getserverbyid,
    deleteserverbyid,
)
from core.db import servers_collection
from core.auth import get_current_user
from core.access import has_server_access, resolve_user_role
from services.vault import store_ssh_key, get_ssh_key
from services.poller import (
    fetch_latest_metric,
    fetch_metrics_history,
    fetch_metrics_recent,
    poll_server_now,
)
from core.sshconnector import run_command_ssh
from core.session_manager import get_connector, disconnect_user

ServerRouter = APIRouter()


def normalize_server_id(server_id: str) -> str:
    return unquote(server_id) if server_id else server_id

@ServerRouter.get("/", response_model=List[ServerResponse])
async def list_servers(current_user: UserInDB = Depends(get_current_user)):
    """
    List all servers the current user can access — their own servers plus any
    servers shared with them through a team.
    """
    servers_in_db = await getaccessibleservers(current_user.id)
    safe_servers = []
    for s in servers_in_db:
        role = await resolve_user_role(current_user.id, s)
        safe_server = ServerResponse(
            _id=s.id,
            server_id=s.server_id,
            name=s.name,
            host=s.connection.host if s.connection else None,
            status=s.connection.status if s.connection else "disconnected",
            os=s.metadata.os,
            last_connected_at=s.connection.last_connected_at if s.connection else None,
            created_at=s.created_at,
            role=role,
            team_id=s.team_id,
        )
        safe_servers.append(safe_server)
    return safe_servers

@ServerRouter.post("/", response_model=ServerResponse, status_code=status.HTTP_201_CREATED)
async def create_server(req: ServerCreateRequest, current_user: UserInDB = Depends(get_current_user)):
    """
    Configure a new SSH connection for the current user.

    This endpoint will:
    1. Generate a fresh Ed25519 SSH key pair.
    2. Store the private key in HashiCorp Vault at ssh-keys/<host>@<username>.
    3. Persist the server record in MongoDB (vault path only, never the raw key).
    4. Return the public key in the response — the user must add it to their
       server's ~/.ssh/authorized_keys so GenOS can connect.
    """
    # 1. Generate keys and store private key in Vault; get back the public key
    try:
        public_key = store_ssh_key(hostname=req.host, username=req.username)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate or store SSH keys: {exc}"
        )

    # 2. Persist server record in MongoDB
    await createserver(owner_id=current_user.id, req=req)

    # Server ID is deterministically set to host@username
    server_id = f"{req.host}@{req.username}"

    # 3. Read back the created record to build the response
    new_server = await getserverbyid(server_id)
    if not new_server:
        raise HTTPException(status_code=500, detail="Failed to retrieve created server")

    return ServerResponse(
        _id=new_server.id,
        server_id=server_id,
        name=new_server.name,
        host=new_server.connection.host,
        status=new_server.connection.status,
        os=new_server.metadata.os,
        last_connected_at=new_server.connection.last_connected_at,
        created_at=new_server.created_at,
        # 4. Hand the public key back so the user can add it to authorized_keys
        public_key=public_key,
    )

@ServerRouter.delete("/{server_id}", status_code=status.HTTP_200_OK)
async def delete_server(server_id: str, current_user: UserInDB = Depends(get_current_user)):
    """
    Delete a configured server using its unique ID (host@username).
    Deletion is restricted to the server owner — team members can never delete.
    """
    normalized_server_id = normalize_server_id(server_id)
    server = await getserverbyid(normalized_server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    if str(server.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the server owner can delete this server")

    disconnect_user(
        hostname=server.connection.host,
        username=server.connection.username,
        port=server.connection.port,
    )
        
    success = await deleteserverbyid(normalized_server_id)
    return {"deleted": success, "server_id": normalized_server_id}


@ServerRouter.post("/{server_id}/connect", status_code=status.HTTP_200_OK)
async def connect_server(server_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Create/reuse a persistent SSH session for this server."""
    normalized_server_id = normalize_server_id(server_id)
    server = await getserverbyid(normalized_server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if not await has_server_access(current_user.id, server):
        raise HTTPException(status_code=403, detail="Not authorized to access this server")

    host = server.connection.host
    port = server.connection.port
    username = server.connection.username

    try:
        vault_data = get_ssh_key(hostname=host, username=username)
        private_key_pem = vault_data["private_key"]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not retrieve key from Vault: {exc}")

    try:
        connector = get_connector(
            hostname=host,
            username=username,
            port=port,
            key_material=private_key_pem,
        )
        probe = connector.exec("whoami && pwd", timeout=20)
    except Exception as exc:
        await servers_collection.update_one(
            {"server_id": normalized_server_id},
            {"$set": {"connection.status": "error"}},
        )
        raise HTTPException(status_code=500, detail=f"Connection failed: {exc}")

    await servers_collection.update_one(
        {"server_id": normalized_server_id},
        {
            "$set": {
                "connection.status": "connected",
                "connection.last_connected_at": datetime.now(timezone.utc),
            }
        },
    )

    return {
        "server_id": normalized_server_id,
        "connected": True,
        "message": "Persistent SSH session established",
        "probe": probe,
    }


@ServerRouter.post("/{server_id}/disconnect", status_code=status.HTTP_200_OK)
async def disconnect_server(server_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Close persistent SSH session for this server."""
    normalized_server_id = normalize_server_id(server_id)
    server = await getserverbyid(normalized_server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if not await has_server_access(current_user.id, server):
        raise HTTPException(status_code=403, detail="Not authorized to access this server")

    disconnect_user(
        hostname=server.connection.host,
        username=server.connection.username,
        port=server.connection.port,
    )

    await servers_collection.update_one(
        {"server_id": normalized_server_id},
        {"$set": {"connection.status": "disconnected"}},
    )

    return {
        "server_id": normalized_server_id,
        "connected": False,
        "message": "Persistent SSH session disconnected",
    }


@ServerRouter.get("/{server_id}/test", response_model=ServerTestResponse)
async def test_server_connection(server_id: str, current_user: UserInDB = Depends(get_current_user)):
    """
    Test the SSH connection to a configured server.

    Call this endpoint after adding the public key GenOS gave you to your
    server's ~/.ssh/authorized_keys file.

    Steps performed:
    1. Look up the server record to get host / port / username.
    2. Fetch the private key from HashiCorp Vault.
    3. Write the private key to a secure temporary file.
    4. Attempt an SSH connection and run `whoami` + `pwd`.
    5. Clean up the temporary key file regardless of outcome.
    6. Return the result with latency, remote user, and working directory.
    """
    # 1. Verify server exists and the user has access (owner or team member)
    normalized_server_id = normalize_server_id(server_id)
    server = await getserverbyid(normalized_server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if not await has_server_access(current_user.id, server):
        raise HTTPException(status_code=403, detail="Not authorized to access this server")

    host = server.connection.host
    port = server.connection.port
    username = server.connection.username

    # 2. Fetch the private key from Vault
    try:
        vault_data = get_ssh_key(hostname=host, username=username)
        private_key_pem = vault_data["private_key"]
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not retrieve key from Vault: {exc}"
        )

    # 3. Write private key to a temporary file with restrictive permissions
    key_file = None
    try:
        fd, key_path = tempfile.mkstemp(prefix=f"{host}_{username}_", suffix=".pem")
        try:
            os.write(fd, private_key_pem.encode())
        finally:
            os.close(fd)
        # Restrict file permissions (no-op on Windows, critical on Linux)
        os.chmod(key_path, 0o600)

        # 4. Attempt SSH connection
        start_ts = time.monotonic()
        whoami_result = run_command_ssh(
            host=host,
            port=port,
            username=username,
            key_path=key_path,
            command="whoami && pwd",
        )
        latency_ms = round((time.monotonic() - start_ts) * 1000, 2)

    finally:
        # 5. Always clean up the temp key file
        if key_path and os.path.exists(key_path):
            os.remove(key_path)

    # 6. Build response
    if whoami_result["exit_code"] == 0 and not whoami_result.get("error"):
        output_lines = whoami_result["stdout"].strip().splitlines()
        whoami = output_lines[0].strip() if len(output_lines) > 0 else None
        cwd    = output_lines[1].strip() if len(output_lines) > 1 else None
        return ServerTestResponse(
            server_id=normalized_server_id,
            success=True,
            message="SSH connection successful.",
            whoami=whoami,
            cwd=cwd,
            latency_ms=latency_ms,
        )
    else:
        error_detail = whoami_result.get("error") or whoami_result.get("stderr") or "Unknown error"
        return ServerTestResponse(
            server_id=normalized_server_id,
            success=False,
            message=f"SSH connection failed: {error_detail}",
            latency_ms=latency_ms,
        )


@ServerRouter.get("/{server_id}/metrics", response_model=ServerMetricsResponse | None)
async def get_server_metrics(
    server_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    """Return the latest metrics snapshot for this server (or null if none yet)."""
    normalized_server_id = normalize_server_id(server_id)
    server = await getserverbyid(normalized_server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if not await has_server_access(current_user.id, server):
        raise HTTPException(status_code=403, detail="Not authorized to access this server")

    latest = await fetch_latest_metric(normalized_server_id)
    if not latest:
        return None
    return ServerMetricsResponse(
        server_id=latest.get("server_id"),
        polled_at=latest.get("polled_at"),
        cpu_percent=latest.get("cpu_percent"),
        memory_percent=latest.get("memory_percent"),
        disk_percent=latest.get("disk_percent"),
        load_average=latest.get("load_average"),
        success=latest.get("success", True),
        error=latest.get("error"),
    )


@ServerRouter.get(
    "/{server_id}/metrics/history",
    response_model=list[ServerMetricsResponse],
)
async def get_server_metrics_history(
    server_id: str,
    hours: int | None = None,
    limit: int | None = None,
    current_user: UserInDB = Depends(get_current_user),
):
    """Return metric snapshots for this server.

    Two modes (mutually optional):

    * ``?limit=N``  → newest-first window of N most recent docs, returned in
      oldest → newest order so charts can plot directly. N is clamped to
      ``[1, 100]``.
    * ``?hours=H``  → docs polled within the last H hours, newest first. H is
      clamped to ``[1, 72]``. This is the legacy/default behaviour and is kept
      as the fallback when ``limit`` is not provided.
    """
    normalized_server_id = normalize_server_id(server_id)
    server = await getserverbyid(normalized_server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if not await has_server_access(current_user.id, server):
        raise HTTPException(status_code=403, detail="Not authorized to access this server")

    if limit is not None:
        docs = await fetch_metrics_recent(
            normalized_server_id,
            limit=max(1, min(limit, 100)),
        )
    else:
        docs = await fetch_metrics_history(
            normalized_server_id,
            hours=max(1, min(hours or 24, 72)),
        )
    return [
        ServerMetricsResponse(
            server_id=doc.get("server_id"),
            polled_at=doc.get("polled_at"),
            cpu_percent=doc.get("cpu_percent"),
            memory_percent=doc.get("memory_percent"),
            disk_percent=doc.get("disk_percent"),
            load_average=doc.get("load_average"),
            success=doc.get("success", True),
            error=doc.get("error"),
        )
        for doc in docs
    ]


@ServerRouter.get(
    "/{server_id}/metrics/status",
    response_model=ServerStatusResponse,
)
async def get_server_status(
    server_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    """Return lightweight status info for the per-server dashboard header.

    `last_seen` is the most recent successful metrics poll if available,
    falling back to `connection.last_connected_at`.
    """
    normalized_server_id = normalize_server_id(server_id)
    server = await getserverbyid(normalized_server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if not await has_server_access(current_user.id, server):
        raise HTTPException(status_code=403, detail="Not authorized to access this server")

    last_seen = None
    latest = await fetch_latest_metric(normalized_server_id)
    if latest:
        last_seen = latest.get("polled_at")
    if last_seen is None and server.connection:
        last_seen = server.connection.last_connected_at

    return ServerStatusResponse(
        server_id=normalized_server_id,
        status=server.connection.status if server.connection else "disconnected",
        last_seen=last_seen,
        host=server.connection.host if server.connection else None,
    )


# Minimum age (in seconds) of the latest metric before the refresh endpoint
# will actually SSH to the VPS again. Keeps spam-clicks cheap.
_REFRESH_COOLDOWN_SEC = 5


def _metric_doc_to_response(doc: dict) -> ServerMetricsResponse:
    return ServerMetricsResponse(
        server_id=doc.get("server_id"),
        polled_at=doc.get("polled_at"),
        cpu_percent=doc.get("cpu_percent"),
        memory_percent=doc.get("memory_percent"),
        disk_percent=doc.get("disk_percent"),
        load_average=doc.get("load_average"),
        success=doc.get("success", True),
        error=doc.get("error"),
    )


@ServerRouter.post(
    "/{server_id}/metrics/refresh",
    response_model=ServerMetricsResponse | None,
)
async def refresh_server_metrics(
    server_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    """Trigger an ad-hoc metric poll for this server and return the fresh doc.

    Short-circuits if the most recent snapshot is younger than the cooldown
    window to prevent a user from hammering the VPS with refresh clicks.
    """
    normalized_server_id = normalize_server_id(server_id)
    server = await getserverbyid(normalized_server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if not await has_server_access(current_user.id, server):
        raise HTTPException(status_code=403, detail="Not authorized to access this server")
    if (server.connection.status if server.connection else "") != "connected":
        raise HTTPException(status_code=409, detail="Server is not connected")

    latest = await fetch_latest_metric(normalized_server_id)
    if latest and latest.get("polled_at"):
        polled_at = latest["polled_at"]
        if polled_at.tzinfo is None:
            polled_at = polled_at.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - polled_at).total_seconds()
        if age < _REFRESH_COOLDOWN_SEC:
            return _metric_doc_to_response(latest)

    doc = await poll_server_now(server)
    if not doc:
        return None
    return _metric_doc_to_response(doc)
