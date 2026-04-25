from core.db import servers_collection
from schema.servers import ServerInDB, ServerCreateRequest, ConnectionDetails
from bson import ObjectId

async def createserver(owner_id: str, req: ServerCreateRequest) -> str:
    """
    Create an SSH server definition for the given owner.
    Generates a server_id using host@username.
    """
    server_id = f"{req.host}@{req.username}"
    
    connection_details = ConnectionDetails(
        name=req.name,
        server_id=server_id,
        host=req.host,
        port=req.port,
        username=req.username,
        status="connecting"
        # vault_secret_path handled elsewhere
    )

    server = ServerInDB(
        server_id=server_id,
        owner_id=owner_id,
        name=req.name,
        description=req.description,
        connection=connection_details
    )
    
    # We map back the generated strict ID for lookups
    server_dict = server.model_dump(by_alias=True, exclude_none=True)
    server_dict["server_id"] = server_id 
    
    result = await servers_collection.insert_one(server_dict)
    return str(result.inserted_id)

async def getserverbyid(server_id: str) -> ServerInDB | None:
    """Fetch a server by its precise server_id (e.g. host@username)"""
    server_data = await servers_collection.find_one({"server_id": server_id})
    if server_data:
        server_data["_id"] = str(server_data["_id"])
        return ServerInDB(**server_data)
    return None

async def getserverbyobjectid(id: str) -> ServerInDB | None:
    """Fetch a server by MongoDB ObjectId"""
    server_data = await servers_collection.find_one({"_id": ObjectId(id)})
    if server_data:
        server_data["_id"] = str(server_data["_id"])
        return ServerInDB(**server_data)
    return None

async def getserversbyuser(owner_id: str) -> list[ServerInDB]:
    """Fetch all servers associated with an owner"""
    servers = []
    cursor = servers_collection.find({"owner_id": owner_id})
    async for server_data in cursor:
        server_data["_id"] = str(server_data["_id"])
        servers.append(ServerInDB(**server_data))
    return servers


async def getaccessibleservers(user_id: str) -> list[ServerInDB]:
    """Fetch every server the user can access: owned servers plus any team-shared
    servers (team-wide or via per-member server_ids)."""
    # Local import to avoid circular: teams -> access -> servers
    from core.teams import list_teams_for_user

    by_server_id: dict[str, ServerInDB] = {}

    owned_cursor = servers_collection.find({"owner_id": user_id})
    async for server_data in owned_cursor:
        server_data["_id"] = str(server_data["_id"])
        srv = ServerInDB(**server_data)
        by_server_id[srv.server_id] = srv

    teams = await list_teams_for_user(user_id)
    allowed_server_ids: set[str] = set()
    for team in teams:
        member = None
        for m in team.get("members", []):
            if str(m.get("user_id")) == str(user_id):
                member = m
                break
        if member is None:
            continue
        member_server_ids = member.get("server_ids") or []
        if member_server_ids:
            allowed_server_ids.update(member_server_ids)
        else:
            allowed_server_ids.update(team.get("server_ids", []) or [])

    if allowed_server_ids:
        team_cursor = servers_collection.find({"server_id": {"$in": list(allowed_server_ids)}})
        async for server_data in team_cursor:
            server_data["_id"] = str(server_data["_id"])
            srv = ServerInDB(**server_data)
            by_server_id.setdefault(srv.server_id, srv)

    return list(by_server_id.values())

async def deleteserverbyid(server_id: str) -> bool:
    """Delete a server by its server_id"""
    result = await servers_collection.delete_one({"server_id": server_id})
    return result.deleted_count > 0
