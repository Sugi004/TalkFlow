from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError                           
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from dotenv import load_dotenv
import os
import bcrypt
from database import get_db
import models

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

def hash_password(password: str):
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str):
    return bcrypt.checkpw(plain.encode()[:72], hashed.encode())

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


#  Get current user

async def get_current_user(token: str = Depends(oauth2_scheme),
                           db: AsyncSession = Depends(get_db)) -> models.User:
                           credentials_exception = HTTPException(
                               status_code=status.HTTP_401_UNAUTHORIZED,
                               detail="Could not validate credentials",
                               headers={"WWW-Authenticate": "Bearer"},
                           )
                           try:
                               payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                               email: str = payload.get("sub")
                               if email is None:
                                   raise credentials_exception
                               
                           except JWTError:
                               raise credentials_exception
                            
                           result = await db.execute(select(models.User).where(models.User.email == email))
                           user = result.scalar_one_or_none()
                           if user is None:
                               raise credentials_exception
                           return user
                               
                            