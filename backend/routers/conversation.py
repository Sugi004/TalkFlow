from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, delete
from sqlalchemy.future import select
from database import get_db
from models import User
from schemas import UserResponse, UserSearch
from auth import get_current_user
from limiter import limiter
from models import Conversation, Participants, Message                                              
from schemas import ConversationResponse, MessageResponse, ParticipantResponse, ParticipantCreate, DirectConversationCreate, GroupConversationCreate
from redis_client import get_unread_count, is_user_online


router = APIRouter(prefix="/conversations", tags=["conversations"])

# Get ALL conversations
@router.get("/", response_model=list[ConversationResponse])
async def get_conversations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Conversation).join(Participants).where(Participants.user_id == current_user.id).distinct().order_by(Conversation.updated_at.desc()))
    conversations = result.scalars().all()
    response = []
    for conversation in conversations:
        #  load all participants
        participants_result = await db.execute(select(Participants).where(Participants.conversation_id == conversation.id))
        participants = participants_result.scalars().all()

        #  load participant users
        participant_users = []
        for participant in participants:
            user_result = await db.execute(select(User).where(User.id == participant.user_id))
            user = user_result.scalar_one_or_none()
            if user:
                participant_users.append(user)

        # for 1-1 conversation
        other_user = None
        other_user_online = False
        # if not conversation.is_group:
        #     other_user = next((p for p in participant_users if p.id != current_user.id), None)
        #     if other_user:
        #         other_user_online = await is_user_online(other_user.id)
        
        if not conversation.is_group and len(participant_users) == 2:
            other_user = next((p for p in participant_users if p.id != current_user.id), None)
            if other_user:
                other_user_online = await is_user_online(other_user.id)

        # get last message
        last_message_result = await db.execute(select(Message).where(Message.conversation_id == conversation.id).where(Message.is_deleted == False).order_by(Message.created_at.desc()).limit(1))
        last_message = last_message_result.scalar_one_or_none()

        #  Build last message response
        last_message_response = None
        if last_message:
            sender_result = await db.execute(select(User).where(User.id == last_message.sender_id))
            sender = sender_result.scalar_one_or_none()
            last_message_response = MessageResponse(
                id=last_message.id,
                conversation_id=last_message.conversation_id,
                message_type=last_message.message_type,
                content=last_message.content,
                file_url=last_message.file_url,
                status=last_message.status,
                language=last_message.language,
                expires_at=last_message.expires_at,
                is_deleted=last_message.is_deleted,
                created_at=last_message.created_at,
                updated_at=last_message.updated_at,
                sender=UserSearch(
                    id=sender.id,
                    email=sender.email,
                    full_name=sender.full_name,
                    avatar_url=sender.avatar_url,
                ) if sender else None
            )
        response.append(
            ConversationResponse(
                id=conversation.id,
                is_group=conversation.is_group,
                group_name=conversation.group_name,
                group_avatar_url=conversation.group_avatar_url,
                created_by=conversation.created_by,
                other_user=UserSearch(
                    id=other_user.id,
                    email=other_user.email,
                    full_name=other_user.full_name,
                    avatar_url=other_user.avatar_url,
                    is_online=other_user_online,
                    last_seen=other_user.last_seen,

                    
                    ) if other_user else None,
                    
                last_message=last_message_response,
                last_message_at=last_message.created_at if last_message else None,
                unread_count=get_unread_count(current_user.id, conversation.id),
                participants=[UserSearch(
                    id=u.id,
                    email=u.email,
                    full_name=u.full_name,
                    avatar_url=u.avatar_url
                ) for u in participant_users],
                created_at=conversation.created_at,
                updated_at=conversation.updated_at
            )
        )
    return response

#  Create Conversation
@router.post("/direct", response_model=ConversationResponse)
async def create_direct_conversation(data:DirectConversationCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    #  Check user exists
    user_result = await db.execute(select(User).where(User.id == data.participant_id))
    other_user = user_result.scalar_one_or_none()
    if not other_user:
        raise HTTPException(status_code = 404, detail="User not found")
    
    #  Check conversation exists
    existing = await db.execute(select(Conversation)
    .join(Participants)
    .where(and_(
        Participants.user_id == current_user.id, 
        Conversation.is_group == False)
    ))
    existing = existing.scalars().all()
    
    for conv in existing:
        participants_result = await db.execute(select(Participants).where(Participants.conversation_id == conv.id))
        part_ids = [p.user_id for p in participants_result.scalars().all()]
        if data.participant_id in part_ids and len(part_ids) == 2:
            participants_result = await db.execute(select(User, Participants).join(Participants).where(Participants.conversation_id == conv.id))
            participants = participants_result.scalars().all()
            
            return ConversationResponse(
                id=conv.id,
                is_group=conv.is_group,
                group_name=conv.group_name,
                group_avatar_url=conv.group_avatar_url,
                created_by=conv.created_by,
                other_user=UserSearch(
                    id=other_user.id,
                    email=other_user.email,
                    full_name=other_user.full_name,
                    avatar_url=other_user.avatar_url,
                    last_seen=other_user.last_seen,
                    created_at=other_user.created_at,
                    updated_at=other_user.updated_at
                )   ,
                participants = [UserSearch(
                    id=u.id,
                    email=u.email,
                    full_name=u.full_name,
                    avatar_url=u.avatar_url,
                    last_seen=u.last_seen,
                    created_at=u.created_at,
                    updated_at=u.updated_at
                ) for u in participants],
                created_at=conv.created_at,
                updated_at=conv.updated_at
            )
    #  Create conversation
    new_conversation = Conversation(
        is_group=False,
        created_by = current_user.id
    )
    db.add(new_conversation)
    await db.flush() # get id without commit

#     Add user as participant and admin
    db.add(Participants(conversation_id=new_conversation.id, user_id=current_user.id, is_admin=True))

    # Add other participants
    db.add(Participants(conversation_id=new_conversation.id, user_id=data.participant_id, is_admin=False))
    await db.commit()
    await db.refresh(new_conversation)
    
    # load participants
    participants_result = await db.execute(select(User).join(Participants).where(Participants.conversation_id == new_conversation.id))
    participants = participants_result.scalars().all()

    # Build response
    response = ConversationResponse(
        id=new_conversation.id,
        is_group=new_conversation.is_group,
        group_name=new_conversation.group_name,
        group_avatar_url=new_conversation.group_avatar_url,
        created_by=new_conversation.created_by,
        other_user=UserSearch(
            id=other_user.id,
            email=other_user.email,
            full_name=other_user.full_name,
            avatar_url=other_user.avatar_url,
            last_seen=other_user.last_seen,
            is_online=is_user_online(other_user.id),
            created_at=other_user.created_at,
            updated_at=other_user.updated_at
        )   ,
        participants=[UserSearch(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            avatar_url=u.avatar_url,
            last_seen=u.last_seen,
            created_at=u.created_at,
            updated_at=u.updated_at
        ) for u in participants],
        created_at=new_conversation.created_at,
        updated_at=new_conversation.updated_at
    )
 
    return response

#  Create Group conversation
@router.post("/group", response_model=ConversationResponse)
async def create_group_conversation(data:GroupConversationCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    
    if not data.participant_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please provide at least one participant")
    
    if len(data.participant_ids) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least 2 participants are required")
    
    #  Create conversation
    new_conversation = Conversation(
        is_group=True,
        group_name=data.group_name,
        group_avatar_url=data.group_avatar_url,
        created_by=current_user.id
    )
    db.add(new_conversation)
    await db.flush() # get id without commit

#     Add user as participant and admin
    db.add(Participants(conversation_id=new_conversation.id, user_id=current_user.id, is_admin=True))

    # Add other participants
    for user_id in data.participant_ids:
        user_result = await db.execute(select(User).where(User.id == user_id))
        if not user_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User with id {user_id} not found")
        
        db.add(Participants(conversation_id=new_conversation.id, user_id=user_id, is_admin=False))
    await db.commit()
    await db.refresh(new_conversation)
    
    # load participants
    participants_result = await db.execute(select(User).join(Participants).where(Participants.conversation_id == new_conversation.id))
    participants = participants_result.scalars().all()

    # Build response
    return ConversationResponse(
        id=new_conversation.id,
        is_group=new_conversation.is_group,
        group_name=new_conversation.group_name,
        group_avatar_url=new_conversation.group_avatar_url,
        created_by=new_conversation.created_by,
        participants=[UserSearch(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            avatar_url=u.avatar_url,
            last_seen=u.last_seen,
            created_at=u.created_at,
            updated_at=u.updated_at
        ) for u in participants],
        created_at=new_conversation.created_at,
        updated_at=new_conversation.updated_at
    )

#  Get Single conversation

@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(conversation_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    
    # check if user is participant
    participant_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation.id, Participants.user_id == current_user.id)))
     
    if not participant_result.scalars().first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")
    
    # load participants
    participant_result = await db.execute(select(Participants).where(Participants.conversation_id == conversation.id))
    participant_rows = participant_result.scalars().all()

    participants = []
    for p in participant_rows:
        user_result = await db.execute(select(User).where(User.id == p.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            participants.append(user)
    # Build response
    response = ConversationResponse(
        id=conversation.id,
        is_group=conversation.is_group,
        group_name=conversation.group_name,
        group_avatar_url=conversation.group_avatar_url,
        created_by=conversation.created_by,
        participants=[UserSearch(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            avatar_url=u.avatar_url,
            last_seen=u.last_seen,
            created_at=u.created_at,
            updated_at=u.updated_at
        ) for u in participants],
        created_at=conversation.created_at,
        updated_at=conversation.updated_at
    )
    return response


#  Add participant to group

@router.post("/{conversation_id}/participants", response_model=ParticipantResponse)
async def add_participant(conversation_id: int, data: ParticipantCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # check if conversation exists
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if not conversation.is_group:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot add participants to 1-on-1 chat")
   
    # check if user is participant
    participant_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation.id, Participants.user_id == current_user.id)))
     
    if not participant_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")
    
    # check if user is admin
    admin_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation.id, Participants.user_id == current_user.id, Participants.is_admin == True)))
    if not admin_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can add participants to a group")

    # check if user is already participant
    existing_participant = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation.id, Participants.user_id == data.user_id)))
    if existing_participant.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a participant in this conversation")
    
    # check if user exists
    user_result = await db.execute(select(User).where(User.id == data.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    # add participant
    new_participant = Participants(
        conversation_id=conversation.id,
        user_id=data.user_id,
        is_admin=False
    )
    db.add(new_participant)
    await db.commit()
    await db.refresh(new_participant)
    
    return ParticipantResponse(
        id=new_participant.id,
        conversation_id=new_participant.conversation_id,
        user_id=new_participant.user_id,
        is_admin=new_participant.is_admin,
        joined_at=new_participant.joined_at,
        user=UserSearch(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            avatar_url=user.avatar_url
        )
    )

#  Leave the comversation

@router.delete("/{conversation_id}/leave")
async def leave_or_delete_conversation(conversation_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    participant_result = await db.execute(
        select(Participants).where(and_(
            Participants.conversation_id == conversation_id,
            Participants.user_id == current_user.id
        ))
    )
    participant = participant_result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=403, detail="You are not a participant in this conversation")

    if conversation.is_group:
        # Anyone can leave a group
        await db.delete(participant)
        await db.commit()
        return {"message": "You have left the group"}
    else:
        # Direct conversation — delete everything for both users
        await db.execute(delete(Message).where(Message.conversation_id == conversation_id))
        await db.execute(delete(Participants).where(Participants.conversation_id == conversation_id))
        await db.execute(delete(Conversation).where(Conversation.id == conversation_id))
        await db.commit()
        return {"message": "Conversation deleted successfully"}
    
    