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
        host=req.host,
        port=req.port,
        username=req.username,
        status="connecting"
        # vault_secret_path handled elsewhere
    )

    server = ServerInDB(
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

async def deleteserverbyid(server_id: str) -> bool:
    """Delete a server by its server_id"""
    result = await servers_collection.delete_one({"server_id": server_id})
    return result.deleted_count > 0
