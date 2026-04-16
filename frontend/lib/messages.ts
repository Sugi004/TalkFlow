import api from "./axios";
import {Message} from "@/types";

export const getMessages = async (conversation_id: number, skip=0, limit=50): Promise<Message[]> => {
    const {data} = await api.get(`/messages/${conversation_id}`, {params: {skip, limit}});
    console.log("getMessages called →", { conversation_id, skip, limit })
    return Array.isArray(data) ? data : data?.items ?? data?.messages ?? [];
}

export const sendMessage = async (conversation_id: number, 
    payload: {content: string; message_type: "text" | "image" | "file" | "code" | "video" | "audio";
    file_url?: string; 
    language?: string; 
    expires_at?: string;
    temp_id?: string}): Promise<Message> => {
    const {data} = await api.post(`/messages/${conversation_id}`, payload);
    return data;
}

export const deleteMessage = async (message_id: number): Promise<void> => {
    await api.delete(`/messages/${message_id}`);
}

export const getUnreadMessages = async (conversation_id: number): Promise<Message[]> => {
    const {data} = await api.get(`/messages/${conversation_id}/unread`);
    return data;
}

export const markAsRead = async (conversation_id: number): Promise<void> => {
    await api.post(`/messages/${conversation_id}/read`);
}