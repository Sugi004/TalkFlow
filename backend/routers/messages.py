from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, update
from database import get_db
from models import User, Message, Participants, MessageStatus
from schemas import MessageResponse, MessageCreate, UserSearch
from auth import get_current_user
from message_crypto import decrypt_message_content, encrypt_message_content
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
async def get_messages(conversation_id: int,skip: int = 0, limit: int = 50, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    #Check user is participant
    participant_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation_id, Participants.user_id == current_user.id)))

    if not  participant_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")

    # Calculate pagination

    result = await db.execute(
    select(Message, User)
    .join(User, User.id == Message.sender_id)
    .where(Message.conversation_id == conversation_id)
    .where(Message.is_deleted == False)
    .order_by(Message.created_at.desc(), Message.id.desc())
    .offset(skip)
    .limit(limit)
    .execution_options(synchronize_session=False)
    )
    messages = list(reversed(result.all()))

    # Reset unread count
    await reset_unread_count(current_user.id, conversation_id)

    valid_ids = [
        message.id
        for message, sender in messages
        if message.id is not None
        and message.sender_id != current_user.id
    ]

    #  Mark all messages as read in Redis
    if valid_ids:
        await set_bulk_message_status(
            conversation_id, 
            valid_ids,
            "read"
        )

    #  Sync read status to DB
    await db.execute(
        update(Message)
        .where(
            and_(
                Message.conversation_id == conversation_id, 
                Message.sender_id != current_user.id, 
                Message.status != MessageStatus.read, 
                Message.is_deleted == False)
            ).values(status=MessageStatus.read)
             .execution_options(synchronize_session=False)
    )
    
    # Build message response
    message_responses = []
    for message, sender in messages:
        redis_status = await get_message_status(
            message.conversation_id,
            message.id
        )
        is_incoming = message.sender_id != current_user.id
        final_status = redis_status or (MessageStatus.read if is_incoming else message.status)

        message_responses.append(
                MessageResponse(
                    id=message.id,
                    conversation_id=message.conversation_id,
                    message_type=message.message_type,
                    content=decrypt_message_content(message.content),
                    file_url=message.file_url,
                    language=message.language,
                    status=final_status,
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

    await db.commit()
    return message_responses

@router.post("/{conversation_id}", response_model=MessageResponse)
async def send_message(conversation_id: int, message: MessageCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # check user is participant
    participant_result = await db.execute(
        select(Participants)
        .where(
            and_(
                Participants.conversation_id == conversation_id, 
                Participants.user_id == current_user.id
            )
        )
    )
    if not  participant_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")
    
    #  Validate content or file_url is provided
    if not message.content and not message.file_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Content or file_url must be provided")


    # Create message
    new_message = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=encrypt_message_content(message.content),
        message_type=message.message_type,
        file_url=message.file_url,
        language=message.language,
        status=MessageStatus.sent,
        is_deleted=False,
    )
    db.add(new_message)
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
        content=message.content,
        file_url=new_message.file_url,
        language=new_message.language,
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

    
@router.delete("/{message_id}")
async def delete_message(message_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    message_result = await db.execute(select(Message).where(Message.id == message_id))
    message = message_result.scalar_one_or_none()
   
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        
    # check user is participant
    participant_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == message.conversation_id, Participants.user_id == current_user.id)))
    if not participant_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You must be a participant in this conversation to delete messages")
    
    await db.delete(message)
    await db.commit()
    return {"detail": "Message permanently deleted"}

#  Get unread count
@router.get("/{conversation_id}/unread")
async def get_unread_count_api(conversation_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):

    #  Read unread count from redis
    unread_count = await get_unread_count(current_user.id, conversation_id)
    return {"conversation_id": conversation_id, "unread_count": unread_count or 0}
    
#  Mark message as read
@router.post("/{conversation_id}/read")
async def mark_message_as_read(conversation_id: int, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    # check user is participant
    participant_result = await db.execute(select(Participants)
    .where(
        and_(
            Participants.conversation_id == conversation_id, 
            Participants.user_id == current_user.id
        )
    ))

    if not  participant_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")

    #  Get all messages in conversation
    messages = await db.execute(
        select(Message)
        .where(
            and_(
                Message.conversation_id == conversation_id, 
                Message.sender_id != current_user.id, 
                Message.is_deleted == False
        )
    ))
    messages = messages.scalars().all()

    #  Update redis status
    await set_bulk_message_status(conversation_id, [m.id for m in messages if m.id is not None], "read")

    #  Reset unread count
    await reset_unread_count(current_user.id, conversation_id)

    # Mark message as read
    await db.execute(
        update(Message).
        where(
            and_(
                Message.conversation_id == conversation_id, 
                Message.sender_id != current_user.id, 
                Message.is_deleted == False, 
                Message.status != MessageStatus.read
            )
        ).values(status = MessageStatus.read))


    await db.commit()
    return {"message": "Messages marked as read"}

        
