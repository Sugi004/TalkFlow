from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import os
from database import engine
from models import Base
from routers import auth, conversation, messages, users, websocket, uploads, ai
from starlette.middleware.base import BaseHTTPMiddleware
# Load environment variables
load_dotenv()

# Security Middleware

class SecurityHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["X-DNS-Prefetch-Control"] = "off"
        response.headers["X-Download-Options"] = "noopen"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        response.headers["X-RateLimit-Limit"] = "100"
        response.headers["X-RateLimit-Remaining"] = "99"
        response.headers["X-RateLimit-Reset"] = "1234567890"
        return response

# Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occured"},
    )


# App
app = FastAPI(
    title="DevChat API",
    description="API for DevChat",
    version="1.0.0",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        os.getenv("FRONTEND_URL", ""),
        "*"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Include Routers

app.include_router(auth.router)
app.include_router(conversation.router)
app.include_router(messages.router)
app.include_router(users.router)
app.include_router(websocket.router)
app.include_router(uploads.router)
app.include_router(ai.router)


#  Create Tables on Startup

@app.on_event("startup")
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


#  Health Check

@app.get("/")
async def root():
    return {"message": "DevChat API is running"}


