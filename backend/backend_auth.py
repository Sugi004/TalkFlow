import base64
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
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.exceptions import UnsupportedAlgorithm

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
EMAIL_VERIFICATION_EXPIRE_HOURS = int(os.getenv("EMAIL_VERIFICATION_EXPIRE_HOURS", 24))
RESET_PASSWORD_EXPIRE_MINUTES = int(os.getenv("RESET_PASSWORD_EXPIRE_MINUTES", 10))

PASSWORD_ENCRYPTION_PUBLIC_KEY = os.getenv("PASSWORD_ENCRYPTION_PUBLIC_KEY")
PASSWORD_ENCRYPTION_PRIVATE_KEY = os.getenv("PASSWORD_ENCRYPTION_PRIVATE_KEY")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
_password_private_key = None
_password_public_pem = None


def _normalize_pem_env(value: Optional[str]) -> Optional[bytes]:
    if value is None:
        return None

    cleaned = value.strip()
    if not cleaned:
        return None

    if (cleaned.startswith('"') and cleaned.endswith('"')) or (
        cleaned.startswith("'") and cleaned.endswith("'")
    ):
        cleaned = cleaned[1:-1].strip()

    cleaned = cleaned.replace("\\n", "\n")
    return cleaned.encode("utf-8")


def validate_password_strength(password: str):
    special_chars = set("!@#$%^&*()_+-=[]{};'")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one number")
    if not any(c.isupper() for c in password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not any(c.islower() for c in password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not any(c in special_chars for c in password):
        raise ValueError("Password must contain at least one special character")


def _load_password_encryption_keys():
    global _password_private_key, _password_public_pem
    if _password_private_key is not None and _password_public_pem is not None:
        return _password_private_key, _password_public_pem

    private_key_pem = _normalize_pem_env(PASSWORD_ENCRYPTION_PRIVATE_KEY)
    public_key_pem = _normalize_pem_env(PASSWORD_ENCRYPTION_PUBLIC_KEY)

    if private_key_pem:
        try:
            private_key = serialization.load_pem_private_key(
                private_key_pem,
                password=None,
            )
        except (TypeError, ValueError, UnsupportedAlgorithm):
            private_key = None
        else:
            if public_key_pem:
                public_pem = public_key_pem
            else:
                public_pem = private_key.public_key().public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo,
                )

    if not private_key_pem or private_key is None:
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

    _password_private_key = private_key
    _password_public_pem = public_pem
    return _password_private_key, _password_public_pem


def get_password_public_key_pem() -> str:
    _, public_pem = _load_password_encryption_keys()
    return public_pem.decode("utf-8")


def decrypt_password_payload(ciphertext_b64: str) -> str:
    private_key, _ = _load_password_encryption_keys()
    raw = base64.b64decode(ciphertext_b64.encode("ascii"))
    plaintext = private_key.decrypt(
        raw,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return plaintext.decode("utf-8")

def hash_password(password: str):
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str):
    return bcrypt.checkpw(plain.encode()[:72], hashed.encode())

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_email_verification_token(email: str, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = {
        "sub": email,
        "purpose": "verify_email",
        "exp": datetime.utcnow() + (expires_delta or timedelta(hours=EMAIL_VERIFICATION_EXPIRE_HOURS)),
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_email_verification_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid or expired verification link") from exc

    if payload.get("purpose") != "verify_email":
        raise ValueError("Invalid or expired verification link")

    email = payload.get("sub")
    if not email:
        raise ValueError("Invalid or expired verification link")

    return email


def create_password_reset_token(email: str, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = {
        "sub": email,
        "purpose": "reset_password",
        "exp": datetime.utcnow() + (expires_delta or timedelta(minutes=RESET_PASSWORD_EXPIRE_MINUTES)),
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_password_reset_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid or expired password reset link") from exc

    if payload.get("purpose") != "reset_password":
        raise ValueError("Invalid or expired password reset link")

    email = payload.get("sub")
    if not email:
        raise ValueError("Invalid or expired password reset link")

    return email


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
                               
                            
