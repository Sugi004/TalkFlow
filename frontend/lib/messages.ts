import api from "./axios";
import {Message} from "@/types";

export const getMessages = async (conversation_id: number, skip=0, limit=50): Promise<Message[]> => {
    const {data} = await api.get(`/conversations/${conversation_id}`, {params: {skip, limit}});
    return data;
}

export const sendMessage = async (conversation_id: number, 
    payload: {content: string; message_type: "text" | "image" | "file" | "code" | "video" | "audio";
    file_url?: string; 
    language?: string; 
    expires_at?: string;
    temp_id?: string}): Promise<Message> => {
    const {data} = await api.post(`/conversations/${conversation_id}/messages`, payload);
    return data;
}

export const deleteMessage = async (message_id: number): Promise<void> => {
    await api.delete(`/messages/${message_id}`);
}

export const getUnreadMessages = async (conversation_id: number): Promise<Message[]> => {
    const {data} = await api.get(`/conversations/${conversation_id}/unread`);
    return data;
}

export const markAsRead = async (message_id: number): Promise<void> => {
    await api.post(`/messages/${message_id}/read`);
}