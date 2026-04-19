from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db
from dotenv import load_dotenv
import os
from models import User
from schemas import Token, UserCreate, UserLogin  
from backend_auth import (
    create_access_token,
    decrypt_password_payload,
    get_password_public_key_pem,
    hash_password,
    verify_password,
    validate_password_strength,
)



from limiter import limiter
from fastapi.security import OAuth2PasswordRequestForm


load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

router = APIRouter(prefix="/auth", tags=["auth"])


def resolve_password(password: str, password_encrypted: bool) -> str:
    if not password_encrypted:
        return password

    try:
        return decrypt_password_payload(password)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid encrypted password payload",
        ) from exc


@router.get("/public-key")
async def auth_public_key():
    return {
        "public_key": get_password_public_key_pem(),
        "algorithm": "RSA-OAEP-256",
    }

@router.post("/register", response_model=Token)
@limiter.limit("5/minute")
async def register(request: Request,user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    password = resolve_password(user_data.password, user_data.password_encrypted)
    try:
        validate_password_strength(password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    hashed_password = hash_password(password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        avatar_url=user_data.avatar_url
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)  
    access_token = create_access_token(
        data={"sub": new_user.email},
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, user_data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_data.email))
    user = result.scalar_one_or_none()
    password = resolve_password(user_data.password, user_data.password_encrypted)
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": user.email},
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/token")
async def token(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}
