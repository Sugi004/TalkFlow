" use client"

import { useState, useEffect, useCallback } from "react";
import { Conversation, Message } from "@/types";
import {useAuth} from "@/context/AuthContext";
import {getConversations, 
    createDirectConversation, 
    createGroupConversation, 
    leaveConversation as apiLeave, 
    addParticipant as apiAddParticipant, 
    deleteConversation as apiDelete} from "@/lib/conversations";



export const useConversations = () =>  {
    const {currentUser} = useAuth();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    function normalize(conv: any): Conversation {
    return {
        ...conv,
        other_user: conv.is_group
            ? null
            : conv.participants?.find((p: any) => p.id !== currentUser?.id) ?? null,
    };
}


    const refresh = useCallback(async () => {
        if(!currentUser?.id) return;
        try {
            setLoading(true);
            const data = await getConversations()
            setConversations(data.map(normalize));
            setError(null);
        } catch (error: any) {
            setError(error?.response?.data?.detail ?? "Failed to fetch conversations");
        } finally {
            setLoading(false);
        }
    }, [currentUser?.id]);

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
                unread_count: c.id === currentConversationId ? 0 : (c.unread_count ?? 0) + 1
            };
        }).sort((a,b)=>{
            let ta = a.last_message?.created_at ?? a.created_at;
            let tb = b.last_message?.created_at ?? b.created_at;
            return new Date(tb).getTime() - new Date(ta).getTime();
        })
    })
},[refresh]);

 const clearUnread = useCallback((conversationId: number)=>{
    setConversations((prev)=>prev.map((c)=>(c.id === conversationId ? {...c, unread_count : 0} : c)));
 },[]);

 const updatePresence = useCallback((user_id: number, fullName: string, isOnline: boolean, lastSeen: string)=>{
    setConversations((prev)=>prev.map((c)=>{
        if(c.other_user && c.other_user.id === user_id){
            return {
                ...c,
                other_user: {...c.other_user, is_online: isOnline, last_seen: isOnline ? "online" : "offline"}
            }
        }
        return c;
    }));
 },[]);
        
 const startDirect = useCallback(async (userId: number): Promise<Conversation>=>{
    if(!currentUser?.id) throw new Error("No user logged in");
    const conv = await createDirectConversation(userId);
    const normalized = normalize(conv);
    setConversations((prev)=>{
        if(prev.find((c)=>c.id === normalized.id)) return prev;
        return [normalized, ...prev];
    });
    return normalized;
},[currentUser?.id]);


const startGroup = useCallback(async (name: string, participantIds: number[], avatarUrl?: string | null): Promise<Conversation> => {
 const conv = await createGroupConversation(name, participantIds, avatarUrl ?? "");
 setConversations((prev)=> [conv, ...prev]);
 return conv;
},[])

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
},[])

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
