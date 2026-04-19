import asyncio
import json
import os
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend_auth import get_current_user
from database import get_db
from message_crypto import decrypt_message_content_safe
from models import Conversation, Message, Participants, User
from schemas import (
    SmartReplyRequest,
    SmartReplyResponse,
    SummarizeRequest,
    SummarizeResponse,
    TranslateRequest,
    TranslateResponse,
)

load_dotenv()

try:
    import google.generativeai as genai
    from google.api_core import exceptions as google_exceptions
except ImportError:
    genai = None
    google_exceptions = None

router = APIRouter(prefix="/ai", tags=["ai"])

AI_PROVIDER = os.getenv("AI_PROVIDER", "auto").lower()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if GEMINI_API_KEY and genai is not None:
    genai.configure(api_key=GEMINI_API_KEY)


def resolve_sender_label(user: User | None, sender_id: int) -> str:
    if user and user.full_name:
        return user.full_name
    if user and user.email:
        return user.email
    return f"User {sender_id}"


def active_ai_provider() -> str:
    if AI_PROVIDER in {"groq", "gemini"}:
        return AI_PROVIDER
    if GROQ_API_KEY:
        return "groq"
    if GEMINI_API_KEY:
        return "gemini"
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="No AI provider configured. Set GROQ_API_KEY or GEMINI_API_KEY.",
    )


def raise_gemini_http_error(exc: Exception):
    if google_exceptions and isinstance(exc, google_exceptions.ResourceExhausted):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI quota exceeded. Please try again shortly or switch to a fallback provider.",
        ) from exc
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="AI provider request failed",
    ) from exc


async def generate_with_gemini(prompt: str) -> str:
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini is not configured",
        )
    if genai is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini dependencies are not installed",
        )

    model = genai.GenerativeModel(GEMINI_MODEL)
    try:
        response = await asyncio.to_thread(model.generate_content, prompt)
        text = getattr(response, "text", "") or ""
        if not text.strip():
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI provider returned an empty response",
            )
        return text.strip()
    except HTTPException:
        raise
    except Exception as exc:
        raise_gemini_http_error(exc)


async def generate_with_groq(messages: list[dict[str, str]]) -> str:
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Groq is not configured",
        )

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": messages,
                    "temperature": 0.4,
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach the AI provider",
        ) from exc

    if response.status_code == 429:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI quota exceeded. Please try again shortly.",
        )
    if response.is_error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider request failed",
        )

    payload = response.json()
    try:
        return payload["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned an unexpected response",
        ) from exc


async def generate_ai_text(prompt: str, system_prompt: Optional[str] = None) -> str:
    provider = active_ai_provider()
    if provider == "groq":
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        return await generate_with_groq(messages)

    combined_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
    return await generate_with_gemini(combined_prompt)


async def load_participant_conversation(
    conversation_id: int,
    current_user: User,
    db: AsyncSession,
) -> Conversation:
    conversation_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    participant_result = await db.execute(
        select(Participants).where(
            and_(
                Participants.conversation_id == conversation_id,
                Participants.user_id == current_user.id,
            )
        )
    )
    if not participant_result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a participant in this conversation",
        )
    return conversation


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_conversation(
    data: SummarizeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await load_participant_conversation(data.conversation_id, current_user, db)

    messages_result = await db.execute(
        select(Message, User)
        .join(User, User.id == Message.sender_id, isouter=True)
        .where(
            and_(
                Message.conversation_id == data.conversation_id,
                Message.is_deleted == False,
                Message.content != None,
            )
        )
        .order_by(Message.created_at.desc())
        .limit(data.last_n_messages)
    )
    message_rows = list(reversed(messages_result.all()))
    decrypted_messages = [
        (
            resolve_sender_label(sender, message.sender_id),
            decrypt_message_content_safe(message.content),
        )
        for message, sender in message_rows
    ]

    if not decrypted_messages:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No messages found",
        )

    conversation_text = "\n".join(
        f"{sender_label}: {content}"
        for sender_label, content in decrypted_messages
        if content
    )
    summary = await generate_ai_text(
        conversation_text,
        system_prompt="Summarize this conversation in 3-5 concise bullet points.",
    )
    return SummarizeResponse(summary=summary)


@router.post("/smart-reply", response_model=SmartReplyResponse)
async def suggest_replies(
    data: SmartReplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await load_participant_conversation(data.conversation_id, current_user, db)

    last_message_result = await db.execute(
        select(Message)
        .where(
            and_(
                Message.conversation_id == data.conversation_id,
                Message.is_deleted == False,
                Message.sender_id != current_user.id,
            )
        )
        .order_by(Message.created_at.desc())
        .limit(1)
    )

    last_message = last_message_result.scalars().first()
    last_message_content = decrypt_message_content_safe(last_message.content) if last_message else None
    if not last_message or not last_message_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No messages to reply to",
        )

    raw = await generate_ai_text(
        last_message_content,
        system_prompt=(
            "Generate exactly 3 very short casual reply suggestions. "
            "Return only a JSON array of strings. Keep replies natural, short, "
            "and in the same language as the input."
        ),
    )
    try:
        suggestions = json.loads(raw)
        if not isinstance(suggestions, list):
            raise ValueError("Expected list")
    except Exception:
        suggestions = ["Sure!", "Let me check", "Got it!"]

    return SmartReplyResponse(suggestions=suggestions)


@router.post("/translate", response_model=TranslateResponse)
async def translate_message(
    data: TranslateRequest,
    current_user: User = Depends(get_current_user),
):
    translated = await generate_ai_text(
        data.content,
        system_prompt=(
            f"Translate the user's message to {data.target_language}. "
            "Return only the translated text, nothing else."
        ),
    )
    return TranslateResponse(translated=translated)
