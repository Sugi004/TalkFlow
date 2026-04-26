import re

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db
from models import User
from schemas import UserResponse, UserSearch, UserUpdate, UsernameAvailabilityResponse
from backend_auth import get_current_user
from limiter import limiter


router = APIRouter(prefix="/users", tags=["users"])
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


def get_username_availability_message(username: str) -> tuple[bool, str]:
    normalized = username.strip()
    if not normalized:
        return False, "Username is required"
    if len(normalized) < 3:
        return False, "Username must be at least 3 characters long"
    if not USERNAME_PATTERN.match(normalized):
        return False, "Letters, numbers, and underscores only"
    return True, normalized

# Get current user
@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/check-username", response_model=UsernameAvailabilityResponse)
async def check_username(username: str = Query(...), db: AsyncSession = Depends(get_db)):
    is_valid, message = get_username_availability_message(username)
    if not is_valid:
        return {"available": False, "message": message}

    result = await db.execute(
        select(User).where(func.lower(User.full_name) == message.lower())
    )
    user = result.scalar_one_or_none()
    if user is not None:
        return {"available": False, "message": "Username is already taken"}

    return {"available": True, "message": "Username is available"}

# Update current user
@router.put("/me", response_model=UserResponse)
async def update_me(user_update: UserUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user_update.full_name is not None:
        existing_user = await db.execute(
            select(User).where(
                func.lower(User.full_name) == user_update.full_name.lower(),
                User.id != current_user.id,
            )
        )
        if existing_user.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username is already taken",
            )
        current_user.full_name = user_update.full_name
    if user_update.avatar_url is not None:
        current_user.avatar_url = user_update.avatar_url
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user

@router.delete("/me/avatar", response_model=UserResponse)
async def delete_my_avatar(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    current_user.avatar_url = None
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user

#  Search User

@router.get("/search", response_model=list[UserSearch])
async def search_users(q: str = Query(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if len(q) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Search query must be at least 2 characters long")
    result = await db.execute(select(User).where(User.full_name.ilike(f"%{q}%") | User.email.ilike(f"%{q}%")).where(User.id != current_user.id).limit(10))
    users = result.scalars().all()
    return users
