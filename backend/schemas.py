from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
from models import MessageType, MessageStatus
import re

# Auth Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None

    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v):
            raise ValueError("Invalid email address")
        return v.lower()

    @field_validator('full_name')
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v.strip()) < 2:
            raise ValueError("Full name must be at least 2 characters long")
        return v
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        special_chars = set("!@#$%^&*()_+-=[]{};'")
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c in special_chars for c in v):
            raise ValueError("Password must contain at least one special character")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

# User Schemas

class UserSearch(BaseModel):
    id: int
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    email: str

    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    last_seen: Optional[datetime] = None
    is_online: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None



# Message Schemas

class MessageCreate(BaseModel):
    content: str
    message_type: MessageType
    file_url: Optional[str] = None
    language: Optional[str] = None

class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender: UserSearch
    content: Optional[str] = None
    message_type: MessageType
    file_url: Optional[str] = None
    language: Optional[str] = None
    is_deleted: bool
    status: MessageStatus 
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
    
class MessageUpdate(BaseModel):
    is_deleted: bool = True

# Conversation Schemas
class DirectConversationCreate(BaseModel):
    participant_id: int

class GroupConversationCreate(BaseModel):
    group_name: str
    group_avatar_url: Optional[str] = None
    participant_ids: List[int]

class GroupConversationUpdate(BaseModel):
    group_name: Optional[str] = None
    group_avatar_url: Optional[str] = None

class ConversationParticipantResponse(UserResponse):
    is_admin: bool = False
    joined_at: datetime

    class Config:
        from_attributes = True

class ConversationResponse(BaseModel):
    id: int
    is_group: bool
    group_name: Optional[str] = None
    group_avatar_url: Optional[str] = None
    created_by: int
    current_user_is_admin: bool = False
    other_user: Optional[UserResponse] = None
    participants: List[ConversationParticipantResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ConversationListItem(BaseModel):
    id: int
    is_group: bool
    group_name: Optional[str] = None
    group_avatar_url: Optional[str] = None
    created_by: int
    current_user_is_admin: bool = False
    other_user: Optional[UserResponse] = None
    last_message: Optional[MessageResponse] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
    participants: List[ConversationParticipantResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Participant Schemas

class ParticipantCreate(BaseModel):
    user_id: int

class ParticipantResponse(BaseModel):
    id: int
    user_id: int
    conversation_id: int
    is_admin: bool
    joined_at: datetime
    user: UserSearch

    class Config:
        from_attributes = True



# WebSocket Schemas

class WSMessage(BaseModel):
    type: str
    content: Optional[str] = None
    message_type: Optional[MessageType] = MessageType.text
    file_url: Optional[str] = None
    language: Optional[str] = None
    temp_id: Optional[str] = None #client-side temp id for optimistic UI

class WSTyping(BaseModel):
    type: str = "typing"
    is_typing: bool

#  Upload Schemas

class PresignedUrlRequest(BaseModel):
    file_name: str
    content_type: str
    file_size: int
    
class PresignedUrlResponse(BaseModel):
    upload_url: str
    file_url: str

#  AI Schemas

class SummarizeRequest(BaseModel):
    conversation_id: int
    last_n_messages: int = 100

class SummarizeResponse(BaseModel):
    summary: str

class TranslateRequest(BaseModel):
    content: str
    target_language: str

class TranslateResponse(BaseModel):
    translated: str

class SmartReplyRequest(BaseModel):
    conversation_id:int

class SmartReplyResponse(BaseModel):
    suggestions: List[str]
