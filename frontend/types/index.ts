export interface User {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string;
    last_seen: string;
    is_online: boolean;
}

export interface Conversation {
    id: string;
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
    id: string;
    conversation_id: string;
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

