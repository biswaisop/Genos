from core.db import users_collection
from schema.user import UserInDB
from bson import ObjectId

async def createuser(name: str, email: str, hashed_password: str, phone: str = None) -> str:
    user = UserInDB(
        name=name,
        email=email,
        hashed_password=hashed_password,
        phone=phone
    )
    # Convert Pydantic model to dict, using alias for `_id` 
    user_dict = user.model_dump(by_alias=True, exclude_none=True)
    
    # Motor's insert_one is async
    result = await users_collection.insert_one(user_dict)
    return str(result.inserted_id)

async def getuserbyemail(email: str) -> UserInDB | None:
    # Motor's find_one is async
    user_data = await users_collection.find_one({"email": email})
    if user_data:
        user_data["_id"] = str(user_data["_id"])
        return UserInDB(**user_data)
    return None

async def getuserbyid(id: str) -> UserInDB | None:
    # Motor's find_one is async
    user_data = await users_collection.find_one({"_id": ObjectId(id)})
    if user_data:
        user_data["_id"] = str(user_data["_id"])
        return UserInDB(**user_data)
    return None