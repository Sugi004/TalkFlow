"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Conversation, User } from "@/types"
import { useAuth } from "@/context/AuthContext"
import { useConversations } from "@/hooks/UseConversations"
import { getMe } from "@/lib/users"
import { markAsRead } from "@/lib/messages"
import Chatlist from "@/components/chat/Chatlist"
import Chatwindow from "@/components/chat/Chatwindow"

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

    // Select conversation

    function selectConversation(conversation: Conversation) {
        setActiveConv(conversation);
        clearUnread(conversation.id);
        markAsRead(conversation.id).catch(() => { });
        // on mobile, close sidebar when selecting
        if (window.innerWidth <= 768) {
            setSidebarOpen(false);
        }
    }

    async function handleNewDirect(userId: number) {
        const conv = await startDirect(userId);
        selectConversation(conv);

    }

    async function handleNewGroup(name: string, ids: number[]) {
        const conv = await startGroup(name, ids);
        selectConversation(conv);
    }

    // Sign out
    function handleSignout() {
        logout();
        router.push("/login");
    }

    return (
        <>
            <div className="flex h-screen bg-[#080c10] overflow-hidden">

                {/* Sidebar toggle for mobile */}
                <button
                    onClick={() => setSidebarOpen((v) => !v)}
                    className="fixed top-3 left-3 z-30 md:hidden w-8 h-8 flex items-center justify-center rounded bg-[#0d1117] border border-[#1e2a35] text-[#4a6070] hover:text-cyan-400 transition-colors"
                >
                    ☰
                </button>

                {/* Sidebar overlay (mobile) */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 z-20 bg-black/50 md:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Chat list sidebar */}
                <div
                    className={`fixed md:relative z-30 md:z-auto h-full transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
                >
                    <Chatlist
                        conversations={conversations}
                        activeId={activeConv?.id ?? null}
                        loading={loading}
                        currentUser={currentUser}
                        onSelect={selectConversation}
                        onNewDirect={handleNewDirect}
                        onNewGroup={handleNewGroup}
                        onLeave={leaveConversation}
                        onSignOut={handleSignout}
                    />
                </div>

                {/* Chat window */}
                <Chatwindow
                    conversation={activeConv}
                    currentUser={currentUser}
                    token={token}
                    onIncomingMessage={(msg: any) => handleIncomingMessage(msg, activeConv?.id ?? null)}
                    onPresence={updatePresence}
                />

                <style>{`
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: #1e2a35; border-radius: 2px }
        ::-webkit-scrollbar-thumb:hover { background: #2e3e4a }
      `}</style>
            </div>
        </>


    )

}

