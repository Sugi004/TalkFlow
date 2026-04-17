import api from "./axios";
import { Conversation } from "@/types";

export const getConversations = async (): Promise<Conversation[]> => {
    const {data} = await api.get("/conversations");
    return data;
};

export const getConversation = async (id: number): Promise<Conversation> => {
    const {data} = await api.get(`/conversations/${id}`);
    return data;
};

export const createDirectConversation = async (user_id: number): Promise<Conversation> => {
    const {data} = await api.post("/conversations/direct", {participant_id: user_id});
    return data;
}

export const createGroupConversation = async (name: string, participants: number[], avatar_url: string) => {
    const {data} = await api.post("/conversations/group", {group_name: name,group_avatar_url: avatar_url, participant_ids: participants});
    return data;
}

export const updateGroupConversation = async (
    conversation_id: number,
    payload: { group_name?: string; group_avatar_url?: string | null }
): Promise<Conversation> => {
    const {data} = await api.patch(`/conversations/${conversation_id}`, payload);
    return data;
}

export const addParticipant = async(conversation_id: number, user_id: number): Promise<void> => {
    await api.post(`/conversations/${conversation_id}/participants`, {user_id: user_id});
}

export const removeParticipant = async(conversation_id: number, user_id: number): Promise<void> => {
    await api.delete(`/conversations/${conversation_id}/participants/${user_id}`);
}

export const leaveConversation = async(conversation_id: number): Promise<void> => {
    await api.delete(`/conversations/${conversation_id}/leave`);
}

export const deleteConversation = async(conversation_id: number): Promise<void> => {
    await api.delete(`/conversations/${conversation_id}/leave`);
}
    
