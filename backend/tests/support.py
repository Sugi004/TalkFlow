import os
import sys
from pathlib import Path


def ensure_backend_test_env() -> Path:
    backend_dir = Path(__file__).resolve().parents[1]
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+asyncpg://talkflow:talkflow@localhost:5432/talkflow_test",
    )
    os.environ.setdefault("SECRET_KEY", "talkflow-test-secret")
    os.environ.setdefault("ALGORITHM", "HS256")
    os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
    os.environ.setdefault("MESSAGE_ENCRYPTION_KEY", "talkflow-test-message-key")
    os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
    os.environ.setdefault("REDIS_HOST", "localhost")
    os.environ.setdefault("REDIS_PORT", "6379")
    os.environ.setdefault("S3_BUCKET", "talkflow-test-bucket")
    os.environ.setdefault("AWS_REGION", "us-east-1")
    os.environ.setdefault("GEMINI_API_KEY", "talkflow-test-gemini-key")

    return backend_dir


class FakeScalarResult:
    def __init__(self, value=None, values=None):
        self.value = value
        self.values = values or []

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.values

    def first(self):
        if self.value is not None:
            return self.value
        return self.values[0] if self.values else None

