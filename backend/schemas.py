from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from models import MessageType, MessageStatus

# Auth Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None

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

    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    last_seen: Optional[datetime] = None
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
    expires_at: Optional[datetime] = None

class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender: UserSearch
    content: Optional[str] = None
    message_type: MessageType
    file_url: Optional[str] = None
    language: Optional[str] = None
    expires_at: Optional[datetime] = None
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

class ConversationResponse(BaseModel):
    id: int
    is_group: bool
    group_name: Optional[str] = None
    group_avatar_url: Optional[str] = None
    created_by: int
    participants: List[UserSearch]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ConversationListItem(BaseModel):
    id: int
    is_group: bool
    group_name: Optional[str] = None
    group_avatar_url: Optional[str] = None
    other_user: Optional[UserResponse] = None
    last_message: Optional[MessageResponse] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
    participants: List[UserResponse]
    created_at: datetime

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
    expires_at: Optional[datetime] = None
    temp_id: Optional[str] = None #client-side temp id for optimistic UI

class WSTyping(BaseModel):
    type: str = "typing"
    is_typing: bool

#  Upload Schemas

class PresignedUrlRequest(BaseModel):
    filename: str
    content_type: str
    
class PresignedUrlResponse(BaseModel):
    upload_url: str
    file_url: str

#  AI Schemas

class SummarizeRequest(BaseModel):
    conv_id: int
    last_n_messages: int = 100

class SummarizeResponse(BaseModel):
    summary: str

class TranslateRequest(BaseModel):
    content: str
    target_language: str

class TranslateResponse(BaseModel):
    translated: str

class SuggestRepliesRequest(BaseModel):
    conv_id:int
    last_message: str

class SuggestRepliesResponse(BaseModel):
    suggestions: List[str]