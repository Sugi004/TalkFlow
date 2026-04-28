from datetime import datetime, timezone
from urllib.parse import urlencode
import re

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db
from dotenv import load_dotenv
import os
from models import User
from schemas import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    RegisterResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    ResendVerificationRequest,
    ResendVerificationResponse,
    Token,
    UserCreate,
    UserLogin,
)
from backend_auth import (
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    decode_password_reset_token,
    decode_email_verification_token,
    decrypt_password_payload,
    get_password_public_key_pem,
    hash_password,
    verify_password,
    validate_password_strength,
)
from email_utils import send_password_reset_email, send_verification_email



from limiter import limiter
from fastapi.security import OAuth2PasswordRequestForm


load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

router = APIRouter(prefix="/auth", tags=["auth"])

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


async def get_existing_user_by_username(db: AsyncSession, username: str):
    result = await db.execute(
        select(User)
        .where(func.lower(User.full_name) == username.strip().lower())
        .limit(1)
    )
    return result.scalars().first()


def validate_registration_username(username: str | None) -> str | None:
    if username is None:
        return None

    username = username.strip()
    if not username:
        return None
    if len(username) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username must be at least 3 characters long",
        )
    if not USERNAME_PATTERN.match(username):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username can only contain letters, numbers, and underscores",
        )
    return username


def get_frontend_url(path: str, **params: str) -> str:
    frontend_base_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    query = urlencode(params)
    suffix = f"?{query}" if query else ""
    return f"{frontend_base_url}{path}{suffix}"


def build_verification_url(request: Request, token: str) -> str:
    backend_base_url = os.getenv("BACKEND_PUBLIC_URL", "").strip().rstrip("/")
    if not backend_base_url:
        backend_base_url = str(request.base_url).rstrip("/")
    return f"{backend_base_url}/auth/verify-email?token={token}"


def build_password_reset_url(token: str) -> str:
    return get_frontend_url("/reset-password", token=token)


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

@router.post("/register", response_model=RegisterResponse)
@limiter.limit("5/minute")
async def register(request: Request,user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    normalized_username = validate_registration_username(user_data.full_name)
    if normalized_username:
        existing_username = await get_existing_user_by_username(db, normalized_username)
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username is already taken"
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
        is_email_verified=False,
        full_name=normalized_username,
        avatar_url=user_data.avatar_url
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    verification_token = create_email_verification_token(new_user.email)
    verification_url = build_verification_url(request, verification_token)
    await send_verification_email(
        recipient_email=new_user.email,
        recipient_name=new_user.full_name,
        verification_url=verification_url,
    )
    return {
        "message": "Verification email sent. Please verify your email before logging in.",
        "requires_email_verification": True,
    }


@router.post("/resend-verification", response_model=ResendVerificationResponse)
@limiter.limit("3/minute")
async def resend_verification_email(
    request: Request,
    payload: ResendVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found for that email.",
        )
    if user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email is already verified.",
        )

    verification_token = create_email_verification_token(user.email)
    verification_url = build_verification_url(request, verification_token)
    await send_verification_email(
        recipient_email=user.email,
        recipient_name=user.full_name,
        verification_url=verification_url,
    )
    return {"message": "Verification email sent again. Please check your inbox."}


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found or not registered",
        )

    reset_token = create_password_reset_token(user.email)
    reset_url = build_password_reset_url(reset_token)
    await send_password_reset_email(
        recipient_email=user.email,
        recipient_name=user.full_name,
        reset_url=reset_url,
    )

    return {
        "message": "Password reset link sent. Please check your inbox.",
    }


@router.post("/reset-password", response_model=ResetPasswordResponse)
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        email = decode_password_reset_token(payload.token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset link",
        )

    password = resolve_password(payload.password, payload.password_encrypted)
    try:
        validate_password_strength(password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    user.hashed_password = hash_password(password)
    await db.commit()

    return {"message": "Your password has been reset. You can sign in now."}

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
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in.",
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
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in.",
        )
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    try:
        email = decode_email_verification_token(token)
    except ValueError:
        return RedirectResponse(
            get_frontend_url("/email-verified", status="invalid"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        return RedirectResponse(
            get_frontend_url("/email-verified", status="invalid"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    if user.is_email_verified:
        return RedirectResponse(
            get_frontend_url("/email-verified", status="already"),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    user.is_email_verified = True
    user.email_verified_at = datetime.now(timezone.utc)
    await db.commit()

    return RedirectResponse(
        get_frontend_url("/email-verified", status="success"),
        status_code=status.HTTP_303_SEE_OTHER,
    )
