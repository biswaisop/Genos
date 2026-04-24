from fastapi import APIRouter, HTTPException, status
from schema import SignUp, LoginRequest, TokenResponse, UserInDB
from core.userutils import createuser, getuserbyemail
from core.auth import verify_password, create_access_token, hash_password
from pymongo.errors import DuplicateKeyError

AuthRouter = APIRouter()

@AuthRouter.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(user: SignUp):
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

@AuthRouter.post("/login", response_model=TokenResponse)
async def login(user: LoginRequest):
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