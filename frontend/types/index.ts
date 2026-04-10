export interface User {
    id: number;
    email: string;
    full_name: string;
    avatar_url: string;
    last_seen: string;
    is_online: boolean;
}

export interface Conversation {
    id: number;
    is_group: boolean;
    group_name: string;
    group_avatar_url?: string;
    other_user: User;
    last_message: Message;
    last_message_at: string;
    participants: User[];
    unread_count: number;
    created_at: string;
    updated_at: string;
}

export interface Message {
    id: number;
    conversation_id: number;
    content?: string;
    message_type: "text" | "file" | "image" | "video" | "code";
    file_url?: string;
    language?: string;
    expires_at?: string;
    is_deleted: boolean;
    status: "sent" | "delivered" | "read";
    created_at: string;
    updated_at: string;
    sender: User;
    temp_id?: string;
}


export interface Token{
    access_token: string;
    token_type: string;
}

export interface WSMessage{
    type: "message" | "typing" | "read" | "presence" | "pong" | "error" | "welcome" | "user_joined" | "user_left";
    id?: number;
    temp_id?: string;
    conversation_id?: string;
    content?: string;
    message_type?: string;
    file_url?: string;
    language?: string;
    expires_at?: string;
    is_deleted?: boolean;
    status?: string;
    created_at?: string;
    updated_at?: string;
    sender?: User;
    user_id?: string;
    full_name?: string;
    is_online?: boolean;
    is_typing?: boolean;
    last_seen?: string;
    message?: Message;
    
}

export interface PresignedResponse{
    upload_url: string; // url to upload file to S3
    file_url: string; // url to store in messages
    key: string;
}

export interface UseWebSocketOptions {
    conversation_id: number | null;
    token: string | null;
    onMessage: (message: Message) => void;
    onTyping: (user_id: number, full_name: string, is_typing: boolean) => void;
    onPresence: (user_id: number, full_name: string, is_online: boolean, last_seen: string) => void;
    onRead: (message_id: number, read_by: number) => void;
    onUserJoined: (user_id: number, full_name: string) => void;
    onUserLeft: (user_id: number, full_name: string) => void;
    onPong: () => void;
    onError: (error: string) => void;
}

// Derived type aliases

export type MessageType   = Message["message_type"];
export type MessageStatus = Message["status"];
export type WSEventType   = WSMessage["type"];

// Websocket outgoing frames

export interface WSOutgoing {
    type: "message" | "typing" | "read" | "presence" | "ping";
    message_type?: MessageType
    content?: string;
    temp_id?: string;
    file_url?: string;
    language?: string;
    is_typing?: boolean;
}

export interface SummarizeResponse{
    summary: string;
}

export interface SmartReplies{
    replies: string[];
}

export interface TranslateResponse{
    translated: string;
}

export interface ChatListProps{
    conversations: Conversation[];
    loading: boolean;
    activeId: number | null;
    currentUser: User | null;
    onSelect: (conversation: Conversation) => void;
    onNewDirect: (user_id: number) => void;
    onNewGroup: (name: string, participantIds: number[]) => void;
    onLeave: (conversationId: number) => void;
    onSignOut: () => void;

    
}

export interface ChatWindowProps{
    conversation: Conversation | null;
    currentUser: User | null;
    token: string | null;
    onPresence:(userId: number, fullName: string, isOnline: boolean, lastSeen: string) => void;
    onIncomingMessage:(message: Message) => void;
    
}

export interface CodeBlockProps {
    code: string;
    language?: string;
}

export interface MessageBubbleProps {
    message: Message;
    isOwn: boolean;
    grouped?: boolean;
    onDelete?: (id: number) => void;
    onTranslate?: (id: number) => void;
    translatedContent?: string;
}