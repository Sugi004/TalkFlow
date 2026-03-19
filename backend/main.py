from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import os
from database import engine
from models import Base
from routers import auth, conversation, messages, users, websocket, uploads
from limiter import limiter
# Load environment variables
load_dotenv()

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
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers

app.include_router(auth.router)
app.include_router(conversation.router)
app.include_router(messages.router)
app.include_router(users.router)
app.include_router(websocket.router)
app.include_router(uploads.router)


#  Create Tables on Startup

@app.on_event("startup")
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


#  Health Check

@app.get("/")
async def root():
    return {"message": "DevChat API is running"}


