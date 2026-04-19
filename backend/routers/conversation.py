from collections import defaultdict
from datetime import datetime, timezone
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import aliased

from backend_auth import get_current_user
from database import get_db
from message_crypto import decrypt_message_content_safe
from models import Conversation, Message, Participants, User
from redis_client import get_unread_counts, redis_client
from schemas import (
    ConversationListItem,
    ConversationParticipantResponse,
    ConversationResponse,
    DirectConversationCreate,
    GroupConversationCreate,
    GroupConversationUpdate,
    MessageResponse,
    ParticipantCreate,
    ParticipantResponse,
    UserResponse,
    UserSearch,
)


router = APIRouter(prefix="/conversations", tags=["conversations"])


def build_user_search(user: User) -> UserSearch:
    return UserSearch(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
    )


def build_user_response(user: User, is_online: bool = False) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        last_seen=user.last_seen,
        is_online=is_online,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def build_participant_response(
    participant: Participants,
    user: User,
    online_map: dict[int, bool] | None = None,
) -> ConversationParticipantResponse:
    return ConversationParticipantResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        last_seen=user.last_seen,
        is_online=online_map.get(user.id, False) if online_map else False,
        created_at=user.created_at,
        updated_at=user.updated_at,
        is_admin=participant.is_admin,
        joined_at=participant.joined_at,
    )


def build_message_response(message: Message, sender: User | None) -> MessageResponse:
    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        message_type=message.message_type,
        content=decrypt_message_content_safe(message.content),
        file_url=message.file_url,
        status=message.status,
        language=message.language,
        is_deleted=message.is_deleted,
        created_at=message.created_at,
        updated_at=message.updated_at,
        sender=build_user_search(sender) if sender else UserSearch(
            id=message.sender_id,
            email="",
            full_name=None,
            avatar_url=None,
        ),
    )


async def get_online_map(user_ids: list[int]) -> dict[int, bool]:
    unique_ids = list(dict.fromkeys(user_ids))
    if not unique_ids:
        return {}
    statuses = await redis_client.mget([f"user:{user_id}:online" for user_id in unique_ids])
    return {
        user_id: status is not None
        for user_id, status in zip(unique_ids, statuses)
    }


async def fetch_conversation_participant_rows(
    db: AsyncSession,
    conversation_id: int,
) -> list[tuple[Participants, User]]:
    result = await db.execute(
        select(Participants, User)
        .join(User, User.id == Participants.user_id)
        .where(Participants.conversation_id == conversation_id)
        .order_by(Participants.joined_at.asc(), Participants.id.asc())
    )
    return list(result.all())


async def fetch_participants_for_conversations(
    db: AsyncSession,
    conversation_ids: list[int],
) -> dict[int, list[tuple[Participants, User]]]:
    if not conversation_ids:
        return {}
    result = await db.execute(
        select(Participants, User)
        .join(User, User.id == Participants.user_id)
        .where(Participants.conversation_id.in_(conversation_ids))
        .order_by(Participants.conversation_id.asc(), Participants.joined_at.asc(), Participants.id.asc())
    )
    grouped: dict[int, list[tuple[Participants, User]]] = defaultdict(list)
    for participant, user in result.all():
        grouped[participant.conversation_id].append((participant, user))
    return grouped


async def fetch_last_messages_for_conversations(
    db: AsyncSession,
    conversation_ids: list[int],
) -> dict[int, tuple[Message, User | None]]:
    if not conversation_ids:
        return {}
    ranked_messages = (
        select(
            Message.id.label("message_id"),
            Message.conversation_id.label("conversation_id"),
            func.row_number().over(
                partition_by=Message.conversation_id,
                order_by=(Message.created_at.desc(), Message.id.desc()),
            ).label("row_num"),
        )
        .where(
            and_(
                Message.conversation_id.in_(conversation_ids),
                Message.is_deleted == False,
            )
        )
        .subquery()
    )
    sender_alias = aliased(User)
    result = await db.execute(
        select(Message, sender_alias)
        .join(ranked_messages, Message.id == ranked_messages.c.message_id)
        .join(sender_alias, sender_alias.id == Message.sender_id, isouter=True)
        .where(ranked_messages.c.row_num == 1)
    )
    return {
        message.conversation_id: (message, sender)
        for message, sender in result.all()
    }


async def publish_membership_event(
    conversation_id: int,
    recipient_user_ids: list[int],
    payload: dict,
) -> None:
    encoded = json.dumps(payload)
    await redis_client.publish(f"chat:{conversation_id}", encoded)
    for user_id in set(recipient_user_ids):
        await redis_client.publish(f"user:{user_id}:messages", encoded)


def build_conversation_response(
    conversation: Conversation,
    participants: list[tuple[Participants, User]],
    current_user_id: int,
    online_map: dict[int, bool] | None = None,
) -> ConversationResponse:
    current_participant = next(
        (participant for participant, _ in participants if participant.user_id == current_user_id),
        None,
    )
    other_user = None
    if not conversation.is_group:
        other_row = next(
            ((participant, user) for participant, user in participants if user.id != current_user_id),
            None,
        )
        if other_row:
            _, other = other_row
            other_user = build_user_response(other, is_online=online_map.get(other.id, False) if online_map else False)

    return ConversationResponse(
        id=conversation.id,
        is_group=conversation.is_group,
        group_name=conversation.group_name,
        group_avatar_url=conversation.group_avatar_url,
        created_by=conversation.created_by,
        current_user_is_admin=current_participant.is_admin if current_participant else False,
        other_user=other_user,
        participants=[
            build_participant_response(participant, user, online_map)
            for participant, user in participants
        ],
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


def build_conversation_list_item(
    conversation: Conversation,
    participants: list[tuple[Participants, User]],
    current_user_id: int,
    unread_count: int,
    last_message: Message | None,
    last_sender: User | None,
    online_map: dict[int, bool] | None = None,
) -> ConversationListItem:
    current_participant = next(
        (participant for participant, _ in participants if participant.user_id == current_user_id),
        None,
    )
    other_user = None
    if not conversation.is_group:
        other_row = next(
            ((participant, user) for participant, user in participants if user.id != current_user_id),
            None,
        )
        if other_row:
            _, other = other_row
            other_user = build_user_response(other, is_online=online_map.get(other.id, False) if online_map else False)

    return ConversationListItem(
        id=conversation.id,
        is_group=conversation.is_group,
        group_name=conversation.group_name,
        group_avatar_url=conversation.group_avatar_url,
        created_by=conversation.created_by,
        current_user_is_admin=current_participant.is_admin if current_participant else False,
        other_user=other_user,
        last_message=build_message_response(last_message, last_sender) if last_message else None,
        last_message_at=last_message.created_at if last_message else None,
        unread_count=unread_count,
        participants=[
            build_participant_response(participant, user, online_map)
            for participant, user in participants
        ],
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )

# Get ALL conversations
@router.get("", response_model=list[ConversationListItem])
async def get_conversations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    current_participant = aliased(Participants)
    result = await db.execute(
        select(Conversation, current_participant)
        .join(
            current_participant,
            and_(
                current_participant.conversation_id == Conversation.id,
                current_participant.user_id == current_user.id,
                current_participant.is_hidden == False,
            ),
        )
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
    )
    conversation_rows = list(result.all())
    if not conversation_rows:
        return []

    conversations = [conversation for conversation, _ in conversation_rows]
    conversation_ids = [conversation.id for conversation in conversations]
    participants_by_conversation = await fetch_participants_for_conversations(db, conversation_ids)
    last_messages_by_conversation = await fetch_last_messages_for_conversations(db, conversation_ids)
    unread_counts = await get_unread_counts(current_user.id)

    participant_user_ids = [
        user.id
        for participant_rows in participants_by_conversation.values()
        for _, user in participant_rows
    ]
    online_map = await get_online_map(participant_user_ids)

    return [
        build_conversation_list_item(
            conversation=conversation,
            participants=participants_by_conversation.get(conversation.id, []),
            current_user_id=current_user.id,
            unread_count=int(unread_counts.get(str(conversation.id), 0) or 0),
            last_message=last_messages_by_conversation.get(conversation.id, (None, None))[0],
            last_sender=last_messages_by_conversation.get(conversation.id, (None, None))[1],
            online_map=online_map,
        )
        for conversation in conversations
    ]

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
            participant_rows = await fetch_conversation_participant_rows(db, conv.id)
            online_map = await get_online_map([user.id for _, user in participant_rows])
            return build_conversation_response(conv, participant_rows, current_user.id, online_map)
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
    
    participant_rows = await fetch_conversation_participant_rows(db, new_conversation.id)
    online_map = await get_online_map([user.id for _, user in participant_rows])
    return build_conversation_response(new_conversation, participant_rows, current_user.id, online_map)

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

    # Add user as participant and admin
    db.add(Participants(conversation_id=new_conversation.id, user_id=current_user.id, is_admin=True))

    # Add other participants
    for user_id in data.participant_ids:
        user_result = await db.execute(select(User).where(User.id == user_id))
        if not user_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User with id {user_id} not found")
        
        db.add(Participants(conversation_id=new_conversation.id, user_id=user_id, is_admin=False))
    await db.commit()
    await db.refresh(new_conversation)
    
    participant_rows = await fetch_conversation_participant_rows(db, new_conversation.id)
    online_map = await get_online_map([user.id for _, user in participant_rows])
    return build_conversation_response(new_conversation, participant_rows, current_user.id, online_map)

# Get Single conversation

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
    
    participant_rows = await fetch_conversation_participant_rows(db, conversation.id)
    online_map = await get_online_map([user.id for _, user in participant_rows])
    return build_conversation_response(conversation, participant_rows, current_user.id, online_map)


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_group_conversation(
    conversation_id: int,
    data: GroupConversationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if not conversation.is_group:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only groups can be updated")

    participant_result = await db.execute(
        select(Participants).where(
            and_(
                Participants.conversation_id == conversation.id,
                Participants.user_id == current_user.id,
            )
        )
    )
    participant = participant_result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")
    if not participant.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can update group settings")

    if "group_name" in data.model_fields_set:
        new_group_name = (data.group_name or "").strip()
        if not new_group_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group name cannot be empty")
        conversation.group_name = new_group_name

    if "group_avatar_url" in data.model_fields_set:
        conversation.group_avatar_url = data.group_avatar_url

    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)

    participant_rows = await fetch_conversation_participant_rows(db, conversation.id)
    online_map = await get_online_map([user.id for _, user in participant_rows])
    return build_conversation_response(conversation, participant_rows, current_user.id, online_map)


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
    conversation.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(new_participant)

    participant_rows = await fetch_conversation_participant_rows(db, conversation.id)
    await publish_membership_event(
        conversation.id,
        [member.id for _, member in participant_rows],
        {
            "type": "membership",
            "action": "participant_added",
            "conversation_id": conversation.id,
            "group_name": conversation.group_name,
            "actor_user_id": current_user.id,
            "actor_full_name": current_user.full_name,
            "target_user_id": user.id,
            "target_full_name": user.full_name,
            "target_avatar_url": user.avatar_url,
        },
    )
    
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


@router.delete("/{conversation_id}/participants/{user_id}")
async def remove_participant(
    conversation_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if not conversation.is_group:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove participants from 1-on-1 chat")
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use leave group to remove yourself")

    admin_result = await db.execute(
        select(Participants).where(
            and_(
                Participants.conversation_id == conversation_id,
                Participants.user_id == current_user.id,
            )
        )
    )
    admin_participant = admin_result.scalar_one_or_none()
    if not admin_participant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a participant in this conversation")
    if not admin_participant.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can remove participants")

    target_result = await db.execute(
        select(Participants).where(
            and_(
                Participants.conversation_id == conversation_id,
                Participants.user_id == user_id,
            )
        )
    )
    target_participant = target_result.scalar_one_or_none()
    if not target_participant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")

    target_user_result = await db.execute(select(User).where(User.id == user_id))
    target_user = target_user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.delete(target_participant)
    await db.flush()

    remaining_result = await db.execute(
        select(Participants)
        .where(Participants.conversation_id == conversation_id)
        .order_by(Participants.joined_at.asc())
    )
    remaining_participants = remaining_result.scalars().all()
    promoted_user = None

    if not remaining_participants:
        await db.delete(conversation)
    elif target_participant.is_admin and not any(participant.is_admin for participant in remaining_participants):
        remaining_participants[0].is_admin = True
        promoted_user_result = await db.execute(select(User).where(User.id == remaining_participants[0].user_id))
        promoted_user = promoted_user_result.scalar_one_or_none()
        conversation.updated_at = datetime.now(timezone.utc)
    elif remaining_participants:
        conversation.updated_at = datetime.now(timezone.utc)
    recipient_user_ids = [participant.user_id for participant in remaining_participants] + [target_user.id]

    await db.commit()
    await publish_membership_event(
        conversation_id,
        recipient_user_ids,
        {
            "type": "membership",
            "action": "participant_removed",
            "conversation_id": conversation_id,
            "group_name": conversation.group_name,
            "actor_user_id": current_user.id,
            "actor_full_name": current_user.full_name,
            "target_user_id": target_user.id,
            "target_full_name": target_user.full_name,
            "target_avatar_url": target_user.avatar_url,
            "new_admin_user_id": promoted_user.id if promoted_user else None,
            "new_admin_full_name": promoted_user.full_name if promoted_user else None,
        },
    )
    return {"message": "Participant removed"}

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
        await db.flush()

        remaining_result = await db.execute(
            select(Participants)
            .where(Participants.conversation_id == conversation_id)
            .order_by(Participants.joined_at.asc())
        )
        remaining_participants = remaining_result.scalars().all()
        promoted_user = None

        if not remaining_participants:
            await db.delete(conversation)
        elif participant.is_admin and not any(existing.is_admin for existing in remaining_participants):
            remaining_participants[0].is_admin = True
            promoted_user_result = await db.execute(select(User).where(User.id == remaining_participants[0].user_id))
            promoted_user = promoted_user_result.scalar_one_or_none()
            conversation.updated_at = datetime.now(timezone.utc)
        elif remaining_participants:
            conversation.updated_at = datetime.now(timezone.utc)
        recipient_user_ids = [existing.user_id for existing in remaining_participants] + [current_user.id]
    else:
        participant.is_hidden = True

    await db.commit()
    if conversation.is_group:
        await publish_membership_event(
            conversation_id,
            recipient_user_ids,
            {
                "type": "membership",
                "action": "participant_left",
                "conversation_id": conversation_id,
                "group_name": conversation.group_name,
                "actor_user_id": current_user.id,
                "actor_full_name": current_user.full_name,
                "target_user_id": current_user.id,
                "target_full_name": current_user.full_name,
                "target_avatar_url": current_user.avatar_url,
                "new_admin_user_id": promoted_user.id if promoted_user else None,
                "new_admin_full_name": promoted_user.full_name if promoted_user else None,
            },
        )
    return {"message": "Left conversation"}    
    
