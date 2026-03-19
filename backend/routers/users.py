from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db
from models import User
from schemas import UserResponse, UserSearch, UserUpdate
from auth import get_current_user
from limiter import limiter

router = APIRouter(prefix="/users", tags=["users"])

# Get current user
@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# Update current user
@router.put("/me", response_model=UserResponse)
async def update_me(user_update: UserUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    if user_update.avatar_url is not None:
        current_user.avatar_url = user_update.avatar_url
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user

#  Search User

@router.get("/search", response_model=list[UserSearch])
async def search_users(search_query: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if len(search_query) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Search query must be at least 2 characters long")
    result = await db.execute(select(User).where(User.full_name.ilike(f"%{search_query}%") | User.email.ilike(f"%{search_query}%")).where(User.id != current_user.id).limit(10))
    users = result.scalars().all()
    return users

