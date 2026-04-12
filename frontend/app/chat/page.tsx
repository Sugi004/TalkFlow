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
    const { isAuthenticated, logout, token, currentUser } = useAuth();
    const [activeConv, setActiveConv] = useState<Conversation | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [pendingLeave, setPendingLeave] = useState(false);

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
        deleteDirectConversation,
    } = useConversations();

    // Auth guard

    useEffect(() => {
        if (!isAuthenticated) {
            router.push("/login");
            return
        }
    }, [isAuthenticated]);

    // Protect accidental closure
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            window.history.pushState(null, "", window.location.href);
            setShowLeaveModal(true);
            setPendingLeave(true);
        };
        window.history.pushState(null, "", window.location.href);
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Fetch status
    useEffect(() => {
        if (!activeConv) return;
        const updated = conversations.find((c) => c.id === activeConv.id);
        if (updated) setActiveConv(updated);
    }, [conversations]);

    const handleConfirmLeave = () => {
        setShowLeaveModal(false);
        setPendingLeave(false);
        window.removeEventListener("popstate", () => { });
        router.push("/login");
    };
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
                        onDelete={deleteDirectConversation}
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
                {showLeaveModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-[#0d1117] border border-[#1e2a35] rounded-lg p-6 w-80 shadow-2xl">
                            <h2 className="text-[14px] font-bold text-[#c9d8e8] font-mono mb-2">Leave DevChat?</h2>
                            <p className="text-[12px] text-[#4a6070] font-mono mb-6">
                                You may miss incoming messages while you're away.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowLeaveModal(false)}
                                    className="flex-1 py-2 rounded border border-[#1e2a35] text-[12px] font-mono text-[#c9d8e8] hover:bg-[#1a2530] transition-colors"
                                >
                                    Stay
                                </button>
                                <button
                                    onClick={handleConfirmLeave}
                                    className="flex-1 py-2 rounded bg-[#ff4d6d]/20 border border-[#ff4d6d]/30 text-[12px] font-mono text-[#ff4d6d] hover:bg-[#ff4d6d]/30 transition-colors"
                                >
                                    Leave
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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

