from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from database import get_db
from auth import get_current_user
from models import User, Message, Participants
from schemas import MessageResponse, MessageCreate, UserSearch, SummarizeResponse, SummarizeRequest, SmartReplyResponse, SmartReplyRequest
from typing import List
import anthropic
import os
from dotenv import load_dotenv
import json

load_dotenv()

router = APIRouter(prefix="/ai", tags=["ai"])

# Initialize claude client
client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

#  Summarize conversation
@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_conversation(data: SummarizeRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    #  Check conversation exists
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    
    #  Check user is participant
    participant_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation_id, Participants.user_id == current_user.id)))
    if not participant_result.scalars().first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not a participant in this conversation")
    
    #  Get messages
    messages_result = await db.execute(select(Message).where(and_(Message.conversation_id == conversation_id, Message.is_deleted == False).order_by(Message.created_at)).limit(data.last_n_messages))
    messages = messages_result.scalars().all()
    messages = list(reversed(messages))

    if not messages:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No messages found")
    
    #  Build messages for claude
    conversation_text = "\n".join([f"User: {message.sender_id}: {message.content}" for message in messages if message.content])
    
    #  Call claude
    response = await client.messages.create(
        model="claude-3-5-sonnet-20240620",
        max_tokens=1000,
        messages=[
            {"role": "user", 
             "content": f"Summarize the following conversation in 3-5 bullet points. Be concise and highlight key decisions and action items:\n\n{conversation_text}"}
        ]
    )
    
    summary = response.content[0].text
    return SummarizeResponse(summary=summary)

#  Smart reply
@router.post("/smart-reply", response_model=SmartReplyResponse)
async def suggest_replies(
    data: SmartReplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)

):
    #  Check user is participant
    participant_result = await db.execute(
        select(Participants).where(
            and_(Participants.conversation_id == data.conversation_id, 
            Participants.user_id == current_user.id))
        )
    if not participant_result.scalars().first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not a participant in this conversation")
    
    #  Call claude API
    response = await client.messages.create(
        model="claude-3-5-sonnet-20240620",
        max_tokens=200,
        messages=[
            {"role": "user", 
             "content": f"""Generate 3 short reply suggestion for this message. Reply in the same language as the message.{data.message_text}"
             
            Rules:
            - Reply should be short (5-10 words)
            - Natural and conversational
            - Return ONLY a JSON arrat of strings
            - No explanation, no markdown, just the JSON array
            - Reply should be in the same language as the message
            Example format: ["Sure!", "Let me check", "Sounds good to me"]"""
            }
        ]
    )
    
    #  Parse the JSON response
    try:
        raw = response.content[0].text.strip()
        suggestions = json.loads(raw)
        if not isinstance(suggestions, list):
            suggestions = ["Sure!", "Let me check", "Got it!"]
    except Exception:
        suggestions = ["Sure!", "Let me check", "Got it!"]
    
    return SmartReplyResponse(suggestions=suggestions)

    #  Translate message
    @router.post("/translate", response_model=TranslateResponse)
    async def translate_message(
        data: TranslateRequest,
        current_user: User = Depends(get_current_user),
    ):
        #  Call claude API
        response = await client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=1000,
            messages=[
                {"role": "user", 
                 "content": f"Translate the following message to {data.target_language}. Return only the translated text, nothing else:\n\n{data.content}"}
            ]
        )
        
        translated = response.content[0].text.strip()
        return TranslateResponse(translated=translated)
        
        
    