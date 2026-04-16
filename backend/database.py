from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
IS_PRODUCTION = os.getenv("IS_PRODUCTION", "false").lower() == "true"
# SSL only needed for AWS RDS in production
connect_args = {"ssl": False} if not IS_PRODUCTION else {}

engine = create_async_engine(
    DATABASE_URL,
    echo=True,
    connect_args=connect_args,
    pool_size=20,
    max_overflow=40,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True,
    
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
        