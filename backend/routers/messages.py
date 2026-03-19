from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, or_, update, func
from database import get_db
from models import User, Message, Participants, Conversation, MessageStatus, MessageType
from schemas import MessageResponse, MessageCreate, UserSearch
from auth import get_current_user
from typing import List

from redis_client import (
    get_message_status,
    set_message_status,
    set_bulk_message_status, 
    reset_unread_count,
    get_unread_count,
    increment_unread_count
)

router = APIRouter(prefix="/messages", tags=["messages"])

# Get messages in a conversation
@router.get("/{conversation_id}", response_model=List[MessageResponse])
async def get_messages(conversation_id: int,page: int = 1, limit: int = 50, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Message).where(Message.conversation_id == conversation_id).where(Message.is_deleted == False).order_by(Message.created_at.asc()))
    messages = result.scalars().all()

    #Check user is participant
    participant_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation_id, Participants.user_id == current_user.id)))

    if not  participant_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")

    # Calculate pagination
    offset = (page - 1) * limit
    result = await db.execute(select(Message).where(Message.conversation_id == conversation_id).where(Message.is_deleted == False).order_by(Message.created_at.asc()).limit(limit).offset(offset))
    messages = result.scalars().all()

    #  Mark all messages as read in Redis
    await set_bulk_message_status(conversation_id, [message.id for message in messages if message.sender_id != current_user.id], "read")

    # Reset unread count
    await reset_unread_count(current_user.id, conversation_id)

    #  Sync read status to DB
    await db.execute(update(Message).where(and_(Message.conversation_id == conversation_id, Message.sender_id != current_user.id, Message.status != MessageStatus.read, Message.is_deleted == False)).values(status=MessageStatus.read))
    await db.commit()

    # Build message response
    message_responses = []
    for message in messages:
        sender_result = await db.execute(select(User).where(User.id == message.sender_id))
        sender = sender_result.scalar_one_or_none()

        redis_status = await get_message_status(message.conversation_id, message.id)
        final_status = redis_status if redis_status else message.status.value
        message_responses.append(
            MessageResponse(
                id=message.id,
                conversation_id=message.conversation_id,
                message_type=message.message_type,
                content=message.content,
                file_url=message.file_url,
                language=message.language,
                status=final_status,
                expires_at=message.expires_at,
                is_deleted=message.is_deleted,
                created_at=message.created_at,
                updated_at=message.updated_at,
                sender=UserSearch(
                    id=sender.id,
                    email=sender.email,
                    full_name=sender.full_name,
                    avatar_url=sender.avatar_url,
                ) if sender else None
            )
        )
    
    return message_responses

@router.post("/{conversation_id}", response_model=MessageResponse)
async def send_message(conversation_id: int, message: MessageCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # check user is participant
    participant_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation_id, Participants.user_id == current_user.id)))
    if not  participant_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")
    
    #  Validate content or file_url is provided
    if not message.content and not message.file_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Content or file_url must be provided")


    # Create message
    new_message = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=message.content,
        message_type=message.message_type,
        file_url=message.file_url,
        language=message.language,
        expires_at=message.expires_at,
        status=MessageStatus.sent,
        is_deleted=False,
    )
    db.add(new_message)

    # Update conversation last_message_at
    conversation = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation.scalar_one_or_none()
    if conversation:
        conversation.updated_at = func.now()
    await db.commit()
    await db.refresh(new_message)

    # Set message status to sent in Redis
    await set_message_status(conversation_id, new_message.id, "sent")

    # Increment unread count for all participants except sender
    parts_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation_id, Participants.user_id != current_user.id)))
    other_participants = parts_result.scalars().all()
    for p in other_participants:
        await increment_unread_count(conversation_id, p.user_id)
    return MessageResponse(
        id=new_message.id,
        conversation_id=new_message.conversation_id,
        message_type=new_message.message_type,
        content=new_message.content,
        file_url=new_message.file_url,
        language=new_message.language,
        expires_at=new_message.expires_at,
        is_deleted=new_message.is_deleted,
        status="sent",
        created_at=new_message.created_at,
        updated_at=new_message.updated_at,
        sender=UserSearch(
            id=current_user.id,
            email=current_user.email,
            full_name=current_user.full_name,
            avatar_url=current_user.avatar_url,
        )
    )

    
#  delete message
@router.delete("/{message_id}", response_model=MessageResponse)
async def delete_message(message_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # check user is participant
    message = await db.execute(select(Message).where(Message.id == message_id))
    message = message.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to delete this message")
    message.is_deleted = True
    message.content = "Message deleted"
    message.message_type = MessageType.text
    message.file_url = None
    message.language = None
    message.expires_at = None
    await db.commit()
    await db.refresh(message)
    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        message_type=message.message_type,
        content=message.content,
        file_url=message.file_url,
        language=message.language,
        expires_at=message.expires_at,
        is_deleted=message.is_deleted,
        status=message.status,
        created_at=message.created_at,
        updated_at=message.updated_at,
        sender=UserSearch(
            id=current_user.id,
            email=current_user.email,
            full_name=current_user.full_name,
            avatar_url=current_user.avatar_url,
        )
    )

#  Get unread count
@router.get("/{conversation_id}/unread", response_model=int)
async def get_unread_count_api(conversation_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):

    #  Read unread count from redis
    unread_count = await get_unread_count(current_user.id, conversation_id)
    return {"conversation_id": conversation_id, "unread_count": unread_count or 0}
    
#  Mark message as read
@router.post("/{conversation_id}/read")
async def mark_message_as_read(conversation_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # check user is participant
    participant_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation_id, Participants.user_id == current_user.id)))
    if not  participant_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")

    #  Get all messages in conversation
    messages = await db.execute(select(Message).where(and_(Message.conversation_id == conversation_id, Message.sender_id != current_user.id, Message.is_deleted == False)))
    messages = messages.scalars().all()

    #  Update redis status
    await set_bulk_message_status(conversation_id, [m.id for m in messages], "read")

    #  Reset unread count
    await reset_unread_count(current_user.id, conversation_id)

    # Mark message as read
    await db.execute(
        update(Message).
        where(and_(Message.conversation_id == conversation_id, 
        Message.sender_id != current_user.id, Message.is_deleted == False, 
        Message.status != MessageStatus.read
        )).values(status = MessageStatus.read))


    await db.commit()
    return {"message": "Messages marked as read"}

# delete expired messages
async def delete_expired_messages(db: AsyncSession):
    # delete expired messages
    await db.execute(Message.__table__.delete().where(and_(Message.expires_at < func.now(), Message.expires_at.isnot(None))))
    await db.commit()
        

