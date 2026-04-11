from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_, or_, update
from jose import jwt, JWTError
from database import AsyncSessionLocal
from redis_client import (
    redis_client,
    set_message_status,
    set_bulk_message_status,
    increment_unread_count,
    cache_message,
    set_online_status,
    set_offline_status
)
from models import User, Message, Participants, Conversation, MessageStatus
import json
import os
from datetime import datetime, timezone


router = APIRouter(tags=["Websocket"])

# Connection Manager

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
    
    async def connect(self,converation_id:int, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if converation_id not in self.active_connections:
            self.active_connections[converation_id] = {}
        self.active_connections[converation_id][user_id] = websocket
    def disconnect(self, converation_id:int, user_id: str):
        if converation_id in self.active_connections:
            self.active_connections[converation_id].pop(user_id, None)
            if not self.active_connections[converation_id]:
                del self.active_connections[converation_id]
    async def broadcast(self, converation_id:int, message: dict, exclude_user_id: int = None):
        if converation_id not in self.active_connections:
            return
        for user_id, ws in self.active_connections[converation_id].items():
            if user_id != exclude_user_id:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass
    async def send_personal_message(self, user_id: str, message: dict, converation_id: int = None):
        if converation_id in self.active_connections and user_id in self.active_connections[converation_id]:
            try:
                await self.active_connections[converation_id][user_id].send_json(message)
            except Exception:
                pass
    
    def is_online(self, user_id: str, converation_id: int) -> bool:
        return (
            converation_id in self.active_connections and 
            user_id in self.active_connections[converation_id]
        )

manager = ConnectionManager()

# Auth helper
async def get_user_from_token(token: str, db: AsyncSession):
    try:
        payload = jwt.decode(token, os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM", "HS256")])
        email = payload.get("sub")
        if not email:
            return None
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()
    except JWTError:
        return None

#  Websocket endpoint
@router.websocket("/ws/{conversation_id}")
async def websocket_endpoint(websocket: WebSocket, conversation_id: int, token: str = Query(...)):
    async with AsyncSessionLocal() as db:
        #  1. Authenticate
        user = await get_user_from_token(token, db)
        if not user:
            await websocket.close(code=4001)
            return
        #  Check participant
        part_result = await db.execute(
            select(Participants).where(
                and_(
                    Participants.conversation_id == conversation_id,
                    Participants.user_id == user.id
                )
            )
        )
        participant = part_result.scalar_one_or_none()
        if not participant:
            await websocket.close(code=4003)
            return
        conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conversation = conversation_result.scalar_one_or_none()
        
        #  Connect
        await manager.connect(conversation_id, user.id, websocket)
        #  Mark online
        await set_online_status(user.id)
        if conversation.is_group:
            await manager.broadcast(conversation_id, {"type": "user_joined",
             "user_id": user.id,
             "full_name": user.full_name,
             "avatar_url": user.avatar_url,
             "conversation_id": conversation_id,
             "message": f"{user.full_name} joined the chat"}, exclude_user_id=user.id)
        else:
            await manager.broadcast(conversation_id, {
            "type": "presence",
            "full_name": user.full_name, 
            "user_id": user.id, 
            "is_online": True}, exclude_user_id=user.id)
        #  Send welcome
        await websocket.send_json({
                "type": "welcome",
                "message": "Connected to chat",
                "conversation_id": conversation_id,
                "user_id": user.id
        })
        #  Mark message as delivered
        unread_result = await db.execute(select(Message).where(Message.conversation_id == conversation_id, Message.sender_id != user.id, Message.status == MessageStatus.sent))
        unread_messages = unread_result.scalars().all()
        if unread_messages:
            await set_bulk_message_status(conversation_id, [m.id for m in unread_messages], "delivered")
            await db.execute(update(Message).where(and_(Message.conversation_id == conversation_id, Message.sender_id != user.id, Message.status == MessageStatus.sent)).values(status= MessageStatus.delivered))
            await db.commit()

        #  Notify other user is online 
        await manager.broadcast(conversation_id, {"type": "presence","full_name": user.full_name, "user_id": user.id, "is_online": True})       
                    
        #  Subscribe to redis Pub/Sub

        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"chat:{conversation_id}")

        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")
                if msg_type == "ping":
                    await set_online_status(user.id)
                    await websocket.send_json({"type": "pong"})
                #  Typing indicator
                elif msg_type == "typing":
                    await redis_client.set(f"typing:{conversation_id}:{user.id}", "1", ex=3)
                    await manager.broadcast(conversation_id, {"type": "typing", "user_id": user.id, "full_name": user.full_name, "is_typing": data.get("is_typing", True)}, exclude_user_id=user.id)

                #  Read receipts
                elif msg_type == "read":
                    await db.execute(update(Message).where(and_(Message.conversation_id == conversation_id, Message.sender_id != user.id, Message.status != MessageStatus.read)).values(status=MessageStatus.read))
                    await db.commit()
                    await manager.broadcast(conversation_id, {"type": "read", "conversation_id": conversation_id, "read_by": user.id, "read_by_name": user.full_name }, exclude_user_id=user.id)
                #  Message sent
                elif msg_type == "message":
                    content = data.get("content")
                    message_type = data.get("message_type", "text")
                    file_url = data.get("file_url")
                    language = data.get("language")
                    expires_at = data.get("expires_at")
                    temp_id = data.get("temp_id")
                    
                    #  validate
                    if not content and not file_url:
                        await websocket.send_json({"type": "error", "message": "Message must have content or file"})
                        continue
                    #  Rate limit - max 20 messages per 10 seconds
                    rate_key = f"ws_rate:{user.id}"
                    count = await redis_client.incr(rate_key)
                    if count == 1:
                        await redis_client.expire(rate_key, 10)
                    if count > 20:
                        await websocket.send_json({"type": "error", "message": "Limit exceeded - slow down!!"})
                        continue
                    
                    #  Parse expired at
                    parsed_expires = None
                    if expires_at:
                        try:
                            parsed_expires = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                        except ValueError:
                            pass
                    
                    #  Save to DB
                    new_message = Message(
                        conversation_id = conversation_id, 
                        sender_id = user.id,
                        content = content,
                        message_type = message_type,
                        file_url = file_url,
                        language = language,
                        expires_at = parsed_expires,
                        status = MessageStatus.sent
                    )
                    db.add(new_message)
                    await db.commit()
                    await db.refresh(new_message)
                    
                    #  Update conversation updated_at
                    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
                    conversation = conv_result.scalar_one_or_none()
                    if conversation:
                        conversation.updated_at = datetime.now(timezone.utc)
                        await db.commit()
                        await db.refresh(new_message)

                    #  Save status to redis
                    await set_message_status(conversation_id, new_message.id, "sent")
                    
                    #     Cache message in redis
                    await cache_message(conversation_id, {
                        "id": new_message.id,
                        "content": content,
                        "sender_id": user.id,
                        "created_at": new_message.created_at.isoformat(),

                    })

                    #  Increment unread for other participants
                    parts_result = await db.execute(select(Participants).where(and_(Participants.conversation_id == conversation_id, Participants.user_id != user.id)))
                    other_participants = parts_result.scalars().all()
                    for p in other_participants:
                        await increment_unread_count(conversation_id, p.user_id)

                    #  Build payload
                    payload = {
                        "type": "message",
                        "temp_id": temp_id,
                        "id": new_message.id,
                        "conversation_id": conversation_id,
                        "content": content,
                        "message_type": message_type,
                        "file_url": file_url,
                        "language": language,
                        "expires_at": expires_at,
                        "is_deleted": False,
                        "status": "sent",
                        "created_at": new_message.created_at.isoformat(),
                        "sender": {
                            "id": user.id,
                            "email": user.email,
                            "full_name": user.full_name,
                            "avatar_url": user.avatar_url,
                        },
                        "updated_at": new_message.updated_at.isoformat(),
                    }
                    #  Confirm to sender
                    await websocket.send_json(payload)
                    #  Broadcast to conversation
                    await manager.broadcast(conversation_id, {
                        **payload,
                        "status": "delivered" if manager.is_online(conversation_id, user.id) else "sent"
                    }, exclude_user_id=user.id)

                    #  Publish to Redis pub/sub
                    await redis_client.publish(f"chat:{conversation_id}", json.dumps(payload))
    
        except WebSocketDisconnect:
            pass
        finally:
            #  Cleanup
            manager.disconnect(conversation_id, user.id)
            #  Update last seen
            user.last_seen = datetime.now(timezone.utc)
            await db.commit()
            #  Remove online status from redis
            await set_offline_status(user.id, False)

            #  Notify other user went offline
            if conversation.is_group:
                await manager.broadcast(conversation_id, {
                    "type": "user_left",
                    "user_id": user.id,
                    "full_name": user.full_name,
                    "avatar_url": user.avatar_url,
                    "conversation_id": conversation_id,
                    "message": f"{user.full_name} left the chat"
                }, exclude_user_id=user.id)
            else:
                await manager.broadcast(conversation_id, {
                    "type": "presence",
                    "user_id": user.id,
                    "is_online": False,
                    "last_seen": datetime.now(timezone.utc).isoformat()
            })
            #  Remove typing status
            await redis_client.delete(f"typing:{conversation_id}:{user.id}")

            #  Unsubscribe from Redis pub/sub
            await pubsub.unsubscribe(f"chat:{conversation_id}")
            await pubsub.close()

 