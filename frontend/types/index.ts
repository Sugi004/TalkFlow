
export enum MessageStatus {
    SENT = "sent",
    DELIVERED = "delivered",
    READ = "read",
    FAILED = "failed",
}



export interface User {
    id: number;
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
    last_seen?: string | null;
    is_online: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface ConversationParticipant extends User {
    is_admin: boolean;
    joined_at: string;
}

export interface AuthContextType {
    token: string | null;
    isAuthenticated: boolean;
    login: (token: string) => void;
    logout: () => void;
    currentUser: User | null;
    refreshUser: () => void;
}

export interface Conversation {
    id: number;
    is_group: boolean;
    group_name?: string | null;
    group_avatar_url?: string | null;
    created_by: number;
    current_user_is_admin?: boolean;
    other_user: User | null;
    last_message: Message | null;
    last_message_at?: string | null;
    participants: ConversationParticipant[];
    unread_count: number;
    created_at: string;
    updated_at?: string;
}

export interface Message {
    id: number;
    conversation_id: number;
    content?: string;
    message_type: "text" | "file" | "image" | "video" | "code";
    file_url?: string;
    language?: string;
    is_deleted: boolean;
    status: "sent" | "delivered" | "read" | "failed";
    created_at: string;
    updated_at: string;
    sender: User;
    temp_id?: string;
}

export type MembershipAction = "participant_added" | "participant_removed" | "participant_left";

export interface MembershipEvent {
    type: "membership";
    action: MembershipAction;
    conversation_id: number;
    group_name?: string | null;
    actor_user_id?: number;
    actor_full_name?: string | null;
    target_user_id?: number;
    target_full_name?: string | null;
    target_avatar_url?: string | null;
    new_admin_user_id?: number | null;
    new_admin_full_name?: string | null;
}


export interface Token{
    access_token: string;
    token_type: string;
}

export interface WSMessage{
    type: "message" | "typing" | "read" | "presence" | "pong" | "error" | "welcome" | "user_joined" | "user_left" | "membership";
    id?: number;
    temp_id?: string;
    conversation_id?: number;
    content?: string;
    message_type?: string;
    file_url?: string;
    read_by?: number;
    language?: string;
    is_deleted?: boolean;
    status?: string;
    created_at?: string;
    updated_at?: string;
    sender?: User;
    user_id?: number;
    full_name?: string;
    is_online?: boolean;
    is_typing?: boolean;
    last_seen?: string;
    message?: Message;
    action?: MembershipAction;
    actor_user_id?: number;
    actor_full_name?: string | null;
    target_user_id?: number;
    target_full_name?: string | null;
    target_avatar_url?: string | null;
    group_name?: string | null;
    new_admin_user_id?: number | null;
    new_admin_full_name?: string | null;
    
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
    onMembership?: (event: MembershipEvent) => void;
    onPong: () => void;
    onError: (error: string) => void;
}

// Derived type aliases

export type MessageType   = Message["message_type"];
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
    onDelete: (conversationId: number) => void; 
}

export interface ChatWindowProps{
    conversation: Conversation | null;
    currentUser: User | null;
    token: string | null;
    onPresence:(userId: number, fullName: string, isOnline: boolean, lastSeen: string) => void;
    onIncomingMessage:(message: Message) => void;
    onDelete: (conversationId: number) => void;
    onLeaveConversation?: (conversationId: number) => Promise<void>;
    onRefreshConversations?: () => Promise<void>;
    onExternalRead?: number | null;
    externalMessage?: Message | null;
    
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
