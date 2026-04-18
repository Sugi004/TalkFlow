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
    set_offline_status,
    reset_unread_count
)
from message_crypto import encrypt_message_content
from models import User, Message, Participants, Conversation, MessageStatus
import json
import os
import uuid
from datetime import datetime, timezone
import asyncio


router = APIRouter(tags=["Websocket"])

# Connection Manager

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, dict[int, WebSocket]] = {}
    
    async def connect(self, converation_id: int, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if converation_id not in self.active_connections:
            self.active_connections[converation_id] = {}
        self.active_connections[converation_id][user_id] = websocket
    
    def disconnect(self, converation_id: int, user_id: int):
        if converation_id in self.active_connections:
            self.active_connections[converation_id].pop(user_id, None)
            if not self.active_connections[converation_id]:
                del self.active_connections[converation_id]
    
    async def broadcast(self, converation_id: int, message: dict, exclude_user_id: int = None):
        if converation_id not in self.active_connections:
            return
        for user_id, ws in self.active_connections[converation_id].items():
            if user_id != exclude_user_id:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass
    
    async def send_personal_message(self, user_id: int, message: dict, converation_id: int = None):
        if converation_id in self.active_connections and user_id in self.active_connections[converation_id]:
            try:
                await self.active_connections[converation_id][user_id].send_json(message)
            except Exception:
                pass
    
    def is_online(self, user_id: int, converation_id: int) -> bool:
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
    except JWTError as e:
        print(f"JWT Error: {e}")
        return None
    except Exception as e:
        print(f"Auth error: {e}")
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

        # Fetch all conversation members so we can push presence to their global sockets
        all_parts_result = await db.execute(
            select(Participants).where(Participants.conversation_id == conversation_id)
        )
        all_participants = all_parts_result.scalars().all()

        presence_online = {
            "type": "presence",
            "full_name": user.full_name,
            "user_id": user.id,
            "is_online": True,
            "last_seen": ""
        }

        if conversation.is_group:
            await manager.broadcast(conversation_id, {"type": "user_joined",
             "user_id": user.id,
             "full_name": user.full_name,
             "avatar_url": user.avatar_url,
             "conversation_id": conversation_id,
             "message": f"{user.full_name} joined the chat"}, exclude_user_id=user.id)
        else:
            # Broadcast inside the conversation room
            await manager.broadcast(conversation_id, presence_online, exclude_user_id=user.id)

        # Push presence to every partner's global channel (so they update even if not in this room)
        for p in all_participants:
            if p.user_id != user.id:
                await redis_client.publish(f"user:{p.user_id}:presence", json.dumps(presence_online))

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
                    
        #  Subscribe to redis Pub/Sub

        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"chat:{conversation_id}")
        async def _redis_listener():
            while True:
                try:
                    msg = await pubsub.get_message(ignore_subscribe_messages=True)
                    if msg and msg["type"] == "message":
                        data = json.loads(msg["data"])
                        if data.get("read_by") != user.id:
                            await websocket.send_json(data)
                except Exception:
                    return
                await asyncio.sleep(0.1)
        redis_task = asyncio.create_task(_redis_listener())
        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")
                try:
                    if msg_type == "ping":
                        await set_online_status(user.id)
                        await websocket.send_json({"type": "pong"})
                    #  Typing indicator
                    elif msg_type == "typing":
                        await redis_client.set(f"typing:{conversation_id}:{user.id}", "1", ex=3)
                        await manager.broadcast(conversation_id, {"type": "typing", "user_id": user.id, "full_name": user.full_name, "is_typing": data.get("is_typing", True)}, exclude_user_id=user.id)

                    #  Read receipts
                    elif msg_type == "read":
                        # Reset unread count for the person reading
                        await reset_unread_count(user.id, conversation_id)
                        
                        # Get unread messages to sync Redis status cache
                        unread_result = await db.execute(
                            select(Message).where(and_(
                                Message.conversation_id == conversation_id,
                                Message.sender_id != user.id,
                                Message.status != MessageStatus.read
                            ))
                        )
                        unread_msgs = unread_result.scalars().all()

                        await db.execute(update(Message).where(and_(Message.conversation_id == conversation_id, Message.sender_id != user.id, Message.status != MessageStatus.read)).values(status=MessageStatus.read))
                        await db.commit()
                        
                        # Sync Redis so REST API fetches return "read" instead of stale "sent"
                        if unread_msgs:
                            await set_bulk_message_status(conversation_id, [m.id for m in unread_msgs], "read")

                        read_event = {
                            "type": "read",
                            "conversation_id": conversation_id,
                            "read_by": user.id,
                            "read_by_name": user.full_name
                        }
                        await manager.broadcast(conversation_id, read_event, exclude_user_id=user.id)
                        await redis_client.publish(f"chat:{conversation_id}", json.dumps(read_event))
                        
                        # Also publish to other participants' global channels
                        # so they see read receipts even if they navigated away
                        parts_result = await db.execute(
                            select(Participants).where(and_(
                                Participants.conversation_id == conversation_id,
                                Participants.user_id != user.id
                            ))
                        )
                        for p in parts_result.scalars().all():
                            await redis_client.publish(f"user:{p.user_id}:messages", json.dumps(read_event))
                    #  Message sent
                    elif msg_type == "message":
                        content = data.get("content")
                        message_type = data.get("message_type", "text")
                        file_url = data.get("file_url")
                        language = data.get("language")
                        temp_id = data.get("temp_id")
                        
                        #  validate
                        if not content and not file_url:
                            await websocket.send_json({"type": "error", "message": "Message must have content or file"})
                            continue
                        #  Rate limit - max 20 messages per 10 seconds (using atomic operation)
                        rate_key = f"ws_rate:{user.id}"
                        pipe = redis_client.pipeline()
                        await pipe.incr(rate_key)
                        await pipe.expire(rate_key, 10)
                        results = await pipe.execute()
                        count = results[0]
                        if count > 20:
                            await websocket.send_json({"type": "error", "message": "Limit exceeded - slow down!!"})
                            continue
                        # Get participants before saving
                        parts_result = await db.execute(
                            select(Participants).where(and_(
                                Participants.conversation_id == conversation_id,
                                Participants.user_id != user.id
                            ))
                        )
                        other_participants = parts_result.scalars().all()

                        # Check if any recipient is actively in this conversation
                        auto_read = any(
                            manager.is_online(p.user_id, conversation_id)
                            for p in other_participants
                        )

                        #  Set message status
                        if auto_read:
                            status = MessageStatus.read
                        else:
                            status = MessageStatus.sent

                        #  Save to DB
                        new_message = Message(
                            conversation_id = conversation_id, 
                            sender_id = user.id,
                            content = encrypt_message_content(content),
                            message_type = message_type,
                            file_url = file_url,
                            language = language,
                            status = status
                        )
                        db.add(new_message)
                        await db.flush()
                        await db.refresh(new_message)
                        
                        #  Set is_hidden to false to view all conversation
                        await db.execute(
                            update(Participants)
                            .where(Participants.conversation_id == conversation_id)
                            .values(is_hidden=False)
                        )

                        #  Update unread count for other participants
                        for p in other_participants:
                            if not manager.is_online(p.user_id, conversation_id):
                                await increment_unread_count(conversation_id, p.user_id)

                        #  Update conversation updated_at
                        conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
                        conversation = conv_result.scalar_one_or_none()
                        if conversation:
                            conversation.updated_at = datetime.now(timezone.utc)
                        
                        await db.commit()
                
                        await db.refresh(new_message)
        
                        msg_id         = new_message.id
                        msg_created_at = new_message.created_at.isoformat() if hasattr(new_message.created_at, 'isoformat') else datetime.now(timezone.utc).isoformat()
                        msg_updated_at = new_message.updated_at.isoformat() if hasattr(new_message.updated_at, 'isoformat') else datetime.now(timezone.utc).isoformat()
                        msg_status     = new_message.status.value
                        #  Save status to redis
                        await set_message_status(conversation_id, msg_id, msg_status)
                        
                        #     Cache message in redis
                        await cache_message(conversation_id, {
                            "id": msg_id,
                            "content": content,
                            "sender_id": user.id,
                            "created_at": msg_created_at,

                        })
                     

                        read_at = datetime.now(timezone.utc).isoformat()
                      

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
                            "is_deleted": False,
                            "status": msg_status,
                            "created_at": msg_created_at,
                            "sender": {
                                "id": user.id,
                                "email": user.email,
                                "full_name": user.full_name,
                                "avatar_url": user.avatar_url,
                            },
                            "updated_at": msg_updated_at,
                        }
                        #  Confirm to sender
                        await websocket.send_json(payload)
                        #  Broadcast to conversation
                        await manager.broadcast(conversation_id, {
                            **payload,
                            "status": "delivered" if manager.is_online(user.id, conversation_id) else "sent"
                        }, exclude_user_id=user.id)
                        if auto_read:
                            read_event = {
                                "type": "read",
                                "conversation_id": conversation_id,
                                "read_by": next(
                                    (p.user_id for p in other_participants
                                    if manager.is_online(p.user_id, conversation_id)),
                                    None
                                ),
                                "read_by_name": user.full_name,
                                "read_at": read_at,
                            }
                            if read_event["read_by"]:
                                await websocket.send_json(read_event)
                            await redis_client.publish(f"chat:{conversation_id}", json.dumps(read_event))

                        
                        #  Publish to user-level channel for offline clients
                        #  This will be picked up by the user_websocket handler
                        for p in other_participants:
                            channel = f"user:{p.user_id}:messages"
                            print(f"Publishing to channel: {channel}")
                            await redis_client.publish(channel, json.dumps({**payload, "status": "delivered"}))
                        print("Message published to user-level channel")
                except Exception as e:
                    print(f"Error handling {msg_type}: {e}")
                    try:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Something went wrong, please try again"
                        })
                    except Exception:
                        pass
        except WebSocketDisconnect:
            pass
        finally:
            #  Cleanup — per-conv WS NEVER handles offline status.
            #  The global socket (/ws/user/{id}) is the sole authority for that.
            redis_task.cancel()
            manager.disconnect(conversation_id, user.id)
            await redis_client.delete(f"typing:{conversation_id}:{user.id}")
            await pubsub.unsubscribe(f"chat:{conversation_id}")
            await pubsub.close()

@router.websocket("/ws/user/{user_id}")
async def user_websocket(websocket: WebSocket, user_id: int, token: str = Query(...)):
    async with AsyncSessionLocal() as db:
        user = await get_user_from_token(token, db)
        if not user or user.id != user_id:
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Invalid token"})
            await websocket.close(code=1008, reason="Invalid token")
            return

        await websocket.accept()

        # ----- Mark online -----
        # Give this specific connection a unique token so the finally block
        # can skip the offline broadcast if a NEWER connection has taken over.
        ws_token = str(uuid.uuid4())
        await redis_client.set(f"user:{user_id}:ws_token", ws_token)
        await set_online_status(user.id)

        # Fetch all conversation partners so we can push the initial online event
        convs_result = await db.execute(
            select(Participants.conversation_id)
            .where(Participants.user_id == user_id)
        )
        conv_ids = [row[0] for row in convs_result.fetchall()]

        partner_ids: set[int] = set()
        for cid in conv_ids:
            parts_result = await db.execute(
                select(Participants.user_id)
                .where(Participants.conversation_id == cid, Participants.user_id != user_id)
            )
            for row in parts_result.fetchall():
                partner_ids.add(row[0])

        presence_online = {
            "type": "presence",
            "full_name": user.full_name,
            "user_id": user.id,
            "is_online": True,
            "last_seen": ""
        }
        for pid in partner_ids:
            await redis_client.publish(f"user:{pid}:presence", json.dumps(presence_online))

        # ----- Pub/Sub -----
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(
            f"user:{user_id}:messages",
            f"user:{user_id}:presence"
        )

        listen_task = None
        client_task = None
        try:
            async def _listen_pubsub():
                """Forward Redis pub/sub messages to the WebSocket client."""
                while True:
                    try:
                        msg = await pubsub.get_message(ignore_subscribe_messages=True)
                        if msg and msg['type'] == 'message':
                            await websocket.send_json(json.loads(msg['data']))
                    except Exception:
                        return
                    await asyncio.sleep(0.01)

            async def _listen_client():
                """Handle incoming messages from the client (pings, etc.)."""
                while True:
                    try:
                        data = await websocket.receive_json()
                        if data.get("type") == "ping":
                            await set_online_status(user.id)
                            await websocket.send_json({"type": "pong"})
                    except Exception:
                        return

            listen_task = asyncio.create_task(_listen_pubsub())
            client_task = asyncio.create_task(_listen_client())

            # Block until either side closes
            done, pending = await asyncio.wait(
                [listen_task, client_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            for t in pending:
                t.cancel()

        except Exception:
            pass
        finally:
            if listen_task and not listen_task.done():
                listen_task.cancel()
            if client_task and not client_task.done():
                client_task.cancel()

            # ----- Mark offline ONLY if this is still the latest connection -----
            # Wait 2 seconds before checking. If this was just a page refresh,
            # the new connection will arrive during this window and replace the token.
            await asyncio.sleep(2)
            stored_token = await redis_client.get(f"user:{user_id}:ws_token")
            if stored_token == ws_token:
                last_seen_ts = datetime.now(timezone.utc)
                user.last_seen = last_seen_ts
                await db.commit()
                await set_offline_status(user.id)
                await redis_client.delete(f"user:{user_id}:ws_token")

                presence_offline = {
                    "type": "presence",
                    "user_id": user.id,
                    "full_name": user.full_name,
                    "is_online": False,
                    "last_seen": last_seen_ts.isoformat()
                }
                for pid in partner_ids:
                    await redis_client.publish(f"user:{pid}:presence", json.dumps(presence_offline))
            # else: a newer connection is alive — skip offline, user is still online

            await pubsub.unsubscribe(
                f"user:{user_id}:messages",
                f"user:{user_id}:presence"
            )
            await pubsub.close()
        

        
    


 
