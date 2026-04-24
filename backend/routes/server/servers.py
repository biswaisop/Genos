from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from schema.servers import ServerCreateRequest, ServerResponse
from schema.user import UserInDB
from core.serverutils import createserver, getserversbyuser, getserverbyid, deleteserverbyid
from core.auth import get_current_user
from services.vault import store_ssh_key

ServerRouter = APIRouter()

@ServerRouter.get("/", response_model=List[ServerResponse])
async def list_servers(current_user: UserInDB = Depends(get_current_user)):
    """
    List all servers configured by the current user.
    """
    servers_in_db = await getserversbyuser(current_user.id)
    # The DB response has the connection nested property, we want to flatten for safe response 
    safe_servers = []
    for s in servers_in_db:
        # Build the safe response
        safe_server = ServerResponse(
            _id=s.id,
            server_id=s.model_dump().get("server_id"),
            name=s.name,
            host=s.connection.host if s.connection else None,
            status=s.connection.status if s.connection else "disconnected",
            os=s.metadata.os,
            last_connected_at=s.connection.last_connected_at if s.connection else None,
            created_at=s.created_at
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
        server_id=new_server.model_dump().get("server_id"),
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
    """
    server = await getserverbyid(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
        
    if str(server.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this server")
        
    success = await deleteserverbyid(server_id)
    return {"deleted": success, "server_id": server_id}
