from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlmodel import func, and_, or_, update
from jose import jwt, JWTError
from database import AsyncSessionLocal
from redis_client import (
    redis_client,
    set_user_online,
    set_user_offline,
    set_message_status,
    set_bulk_message_status,
    increment_unread,
    cache_message
)
from models import User, Message, Participants, Conversation
import json
import os
from datetime import datetime


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
            
        
                    
           

