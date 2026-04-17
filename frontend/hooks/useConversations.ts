"use client"

import { useState, useEffect, useCallback } from "react";
import { Conversation, ConversationParticipant, Message } from "@/types";
import {useAuth} from "@/context/AuthContext";
import {getConversations, 
    createDirectConversation, 
    createGroupConversation, 
    leaveConversation as apiLeave, 
    addParticipant as apiAddParticipant, 
    deleteConversation as apiDelete} from "@/lib/conversations";
import { getErrorMessage } from "@/lib/auth";

type ConversationApiResponse = Conversation & {
    participants?: ConversationParticipant[];
};

export const useConversations = () =>  {
    const {currentUser} = useAuth();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const normalize = useCallback((conv: ConversationApiResponse): Conversation => {
        const participants = conv.participants ?? [];

        return {
            ...conv,
            // The API already returns a correct other_user with is_online from Redis.
            // Only fall back to participants if other_user is absent (e.g. freshly created conv).
            other_user: conv.is_group
                ? null
                : conv.other_user
                    ?? participants.find((participant) => participant.id !== currentUser?.id)
                    ?? null,
        };
    }, [currentUser?.id]);


    const refresh = useCallback(async () => {
        if(!currentUser?.id) return;
        try {
            setLoading(true);
            const data = await getConversations()
            setConversations(data.map(normalize));
            setError(null);
        } catch (error: unknown) {
            setError(getErrorMessage(error, "Failed to fetch conversations"));
        } finally {
            setLoading(false);
        }
    }, [currentUser?.id, normalize]);

    useEffect(() => {
        refresh();
    }, [refresh]);
    // Called by WS handler when a new message arrived - bumps unread + lastmessage

    const handleIncomingMessage = useCallback((msg: Message, currentConversationId: number | null) => {
       setConversations((prev) =>{
        const exits = prev.find((c)=> c.id === msg.conversation_id);
        if(!exits) {refresh(); return prev;}
        
        return prev.map((c)=>{
            if (c.id !== msg.conversation_id) return c
            return {
                ...c,
                last_message: msg,
                last_message_at: msg.created_at,
                unread_count: c.id === currentConversationId ? 0 : (c.unread_count ?? 0) + 1
            };
        }).sort((a,b)=>{
            const ta = a.last_message?.created_at ?? a.created_at;
            const tb = b.last_message?.created_at ?? b.created_at;
            return new Date(tb).getTime() - new Date(ta).getTime();
        })
    })
},[refresh]);

 const clearUnread = useCallback((conversationId: number)=>{
    setConversations((prev)=>prev.map((c)=>(c.id === conversationId ? {...c, unread_count : 0} : c)));
 },[]);

 const updatePresence = useCallback((user_id: number, fullName: string, isOnline: boolean, lastSeen: string) => {
    setConversations((prev) => prev.map((c) => {
        if (c.other_user && c.other_user.id === user_id) {
            return {
                ...c,
                other_user: {
                    ...c.other_user,
                    is_online: isOnline,
                    // Keep the real ISO timestamp so ChatWindow can display "last seen HH:MM"
                    last_seen: isOnline ? c.other_user.last_seen : (lastSeen || c.other_user.last_seen),
                }
            };
        }
        return c;
    }));
 }, []);
        
 const startDirect = useCallback(async (userId: number): Promise<Conversation>=>{
    if(!currentUser?.id) throw new Error("No user logged in");
    const conv = await createDirectConversation(userId);
    const normalized = normalize(conv);
    setConversations((prev)=>{
        if(prev.find((c)=>c.id === normalized.id)) return prev;
        return [normalized, ...prev];
    });
    return normalized;
},[currentUser?.id, normalize]);


const startGroup = useCallback(async (name: string, participantIds: number[], avatarUrl?: string | null): Promise<Conversation> => {
 const conv = normalize(await createGroupConversation(name, participantIds, avatarUrl ?? ""));
 setConversations((prev)=> [conv, ...prev]);
 return conv;
},[normalize])

const leaveConversation = useCallback(async (conversation_id: number): Promise<void> => {
    await apiLeave(conversation_id);
    setConversations((prev)=> prev.filter((c)=> c.id !== conversation_id));
},[])

const deleteDirectConversation = useCallback(async (conversation_id: number): Promise<void> => {
    await apiDelete(conversation_id);
    setConversations((prev)=> prev.filter((c)=> c.id !== conversation_id));
},[])

const addParticipant = useCallback(async (conversation_id: number, participant_id: number): Promise<void> => {
    await apiAddParticipant(conversation_id, participant_id);
    refresh();
},[refresh])

return{
    conversations,
    loading,
    error,
    refresh,
    handleIncomingMessage,
    clearUnread,
    updatePresence,
    startDirect,
    startGroup,
    leaveConversation,
    deleteDirectConversation,
    addParticipant,
}
}
