"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Conversation, User } from "@/types"
import { useAuth } from "@/context/AuthContext"
import { useConversations } from "@/hooks/UseConversations"
import { getMe } from "@/lib/users"
import { markAsRead } from "@/lib/messages"
import Chatlist from "@/components/chat/Chatlist"
import CodeBlock from "@/components/chat/Codeblock"

export default function ChatPage() {
    const router = useRouter();
    const { isAuthenticated, logout } = useAuth();
    const [token, setToken] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [activeConv, setActiveConv] = useState<Conversation | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const {
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
    } = useConversations();

    // Auth guard

    useEffect(() => {
        if (!isAuthenticated) {
            router.push("/login");
            return
        }
        const t = localStorage.getItem("token");
        setToken(t);
        if (t) {
            getMe()
                .then(setCurrentUser)
                .catch(() => { logout(); router.push("/login") }
                );
        }
    }, [isAuthenticated]);


}

