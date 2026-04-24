from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError

from schema.user import UserProfile, UserInDB, SignUp, LoginRequest, TokenResponse, UpdateUserRequest
from core.auth import get_current_user, verify_password, create_access_token, hash_password
from core.userutils import createuser, getuserbyemail, updateuser


UserRouter = APIRouter()

@UserRouter.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(user: SignUp):
    """Register a new user account."""
    existing_user = await getuserbyemail(user.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    
    hashed_pass = hash_password(user.password)
    try:
        await createuser(
            name=user.name,
            email=user.email,
            hashed_password=hashed_pass,
            phone=user.phone
        )
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    return {"message": "Signup successful"}


@UserRouter.post("/login", response_model=TokenResponse)
async def login(user: LoginRequest):
    """Authenticate a user and return a JWT access token."""
    existing_user = await getuserbyemail(user.email)  
    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
        
    if not verify_password(user.password, existing_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
        
    access_token = create_access_token(existing_user.email)
    return TokenResponse(access_token=access_token, token_type="bearer")


@UserRouter.get("/me", response_model=UserProfile)
async def get_me(current_user: UserInDB = Depends(get_current_user)):
    """
    Returns the public-safe profile of the authenticated user.
    """
    return UserProfile(**current_user.model_dump(by_alias=True))


@UserRouter.patch("/me", response_model=UserProfile)
async def update_me(req: UpdateUserRequest, current_user: UserInDB = Depends(get_current_user)):
    """
    Update the authenticated user's profile information.
    """
    update_data = req.model_dump(exclude_unset=True)
    if not update_data:
        return UserProfile(**current_user.model_dump(by_alias=True))
        
    # If settings are provided, they might be nested. 
    # Mapped natively by motor `$set`, so we just pass the dict over
    success = await updateuser(current_user.id, update_data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update user profile")
        
    # Retrieve the updated user from DB
    updated_user = await getuserbyemail(current_user.email)
    return UserProfile(**updated_user.model_dump(by_alias=True))
