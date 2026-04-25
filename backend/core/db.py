import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING
from dotenv import load_dotenv

load_dotenv()

# Initialize the async motor client
mongo_uri = os.getenv("MONGOURI", "mongodb://localhost:27017")
client = AsyncIOMotorClient(
    mongo_uri,
    maxPoolSize=100,        # max concurrent connections
    minPoolSize=5,          # keep 5 alive even when idle
    serverSelectionTimeoutMS=5000  # fail fast if DB is unreachable
)

db = client[os.getenv("DBNAME", "GenOS")]

# Define collections
users_collection = db["Users"]
servers_collection = db["Servers"]
commands_collection = db["Commands"]
sessions_collection = db["Sessions"]
notifications_collection = db["Notifications"]
teams_collection = db["Teams"]
server_metrics_collection = db["ServerMetrics"]
telegram_link_tokens_collection = db["TelegramLinkTokens"]
telegram_sessions_collection    = db["TelegramSessions"]

async def create_indexes():
    """Create essential asynchronous indexes upon startup."""
    # User indexes
    await users_collection.create_index([("email", ASCENDING)], unique=True)
    
    # Server indexes
    # Using server_id (defined in doc as host@username usually, or unique srv_ id)
    await servers_collection.create_index([("server_id", ASCENDING)], unique=True)
    await servers_collection.create_index([("owner_id", ASCENDING)])
    await servers_collection.create_index([("team_id", ASCENDING)])
    
    # Commands / History indexes
    await commands_collection.create_index([("command_id", ASCENDING)], unique=True)
    await commands_collection.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    await commands_collection.create_index([("server_id", ASCENDING), ("created_at", DESCENDING)])
    await commands_collection.create_index([("session_id", ASCENDING)])
    
    # Session indexes
    await sessions_collection.create_index([("session_id", ASCENDING)], unique=True)

    # Notification indexes
    await notifications_collection.create_index(
        [("user_id", ASCENDING), ("created_at", DESCENDING)]
    )
    await notifications_collection.create_index(
        [("user_id", ASCENDING), ("read", ASCENDING)]
    )

    # Team indexes
    await teams_collection.create_index([("members.user_id", ASCENDING)])
    await teams_collection.create_index([("server_ids", ASCENDING)])

    # Server metrics indexes
    await server_metrics_collection.create_index(
        [("server_id", ASCENDING), ("polled_at", DESCENDING)]
    )

    # Telegram link tokens — unique on token, TTL auto-deletes expired docs
    await telegram_link_tokens_collection.create_index(
        [("token", ASCENDING)], unique=True
    )
    await telegram_link_tokens_collection.create_index(
        [("expires_at", ASCENDING)], expireAfterSeconds=0
    )

    # Telegram sessions — one session per Telegram chat
    await telegram_sessions_collection.create_index(
        [("chat_id", ASCENDING)], unique=True
    )

def getdb():
    return db