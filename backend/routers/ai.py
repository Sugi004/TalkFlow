from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from database import get_db
from auth import get_current_user
from message_crypto import decrypt_message_content
from models import User, Message, Participants, Conversation
from schemas import SummarizeResponse, SummarizeRequest, SmartReplyResponse, SmartReplyRequest, TranslateResponse, TranslateRequest        
import google.generativeai as genai
import os
from dotenv import load_dotenv
import json

load_dotenv()

router = APIRouter(prefix="/ai", tags=["ai"])

# Initialize gemini client
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-2.5-flash')
#  Summarize conversation
@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_conversation(data: SummarizeRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    #  Check conversation exists
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == data.conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    
    #  Check user is participant
    participant_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == data.conversation_id, Participants.user_id == current_user.id)))
    if not participant_result.scalars().first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not a participant in this conversation")
    
    #  Get messages
    messages_result = await db.execute(
        select(Message)
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
    messages = messages_result.scalars().all()
    messages = list(reversed(messages))
    decrypted_messages = [
        (message.sender_id, decrypt_message_content(message.content))
        for message in messages
    ]

    if not decrypted_messages:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No messages found")
    
    #  Build messages for claude
    conversation_text = "\n".join(
        f"User: {sender_id}: {content}"
        for sender_id, content in decrypted_messages
        if content
    )
    
    #  Call claude
    response = model.generate_content(
        f"Summarize this conversation in 3-5 bullet points. Be concise:\n\n{conversation_text}"
    )
    
    summary = response.text
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
    
    #  Get last message
    last_message_result = await db.execute(select(Message).where(
        and_(Message.conversation_id == data.conversation_id, 
        Message.is_deleted == False, 
        Message.sender_id != current_user.id)
        ).order_by(Message.created_at.desc()).limit(1))

    last_message = last_message_result.scalars().first()
    last_message_content = decrypt_message_content(last_message.content) if last_message else None
    if not last_message or not last_message_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No messages to reply to"
        )

    #  Call gemini API
    response = model.generate_content(
       f"""Generate 3 very short casual reply suggestion for this message. {last_message_content}"
             
            Rules:
            - Reply should be short (5-10 words)
            - Natural and conversational
            - Return ONLY a JSON arrat of strings
            - No explanation, no markdown, just the JSON array
            - Reply should be in the same language as the message
            Example for "How are you?": ["I'm fine", "I'm good", "I'm great"]"""
    )
    #  Parse the JSON response
    try:
        raw = response.text.strip()
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
    response = model.generate_content(
        f"Translate the following message to {data.target_language}. Return only the translated text, nothing else:\n\n{data.content}"
    )
    
    translated = response.text.strip()
    return TranslateResponse(translated=translated)
    
    
