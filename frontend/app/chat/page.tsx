"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Conversation, MembershipEvent, Message } from "@/types"
import { useAuth } from "@/context/AuthContext"
import { useConversations } from "@/hooks/useConversations"
import { markAsRead } from "@/lib/messages"
import Chatlist from "@/components/chat/Chatlist"
import Chatwindow from "@/components/chat/Chatwindow"
import { useGlobalSocket } from "@/hooks/useGlobalSocket"

export default function ChatPage() {
    const router = useRouter();
    const { isAuthenticated, logout, token, currentUser } = useAuth();
    const [activeConvId, setActiveConvId] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [lastReadConvId, setLastReadConvId] = useState<number | null>(null);
    const [externalMessage, setExternalMessage] = useState<Message | null>(null);

    const {
        conversations,
        loading,
        refresh,
        handleIncomingMessage,
        clearUnread,
        updatePresence,
        startDirect,
        startGroup,
        leaveConversation,
        deleteDirectConversation,
    } = useConversations();
    const activeConv = conversations.find((conversation) => conversation.id === activeConvId) ?? null;

    // Auth guard

    useEffect(() => {
        if (!isAuthenticated) {
            router.push("/login");
            return
        }
    }, [isAuthenticated, router]);

    useEffect(() => {
        const syncViewport = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            setSidebarOpen((prev) => (mobile ? (activeConvId === null ? true : prev) : true));
        };

        syncViewport();
        window.addEventListener("resize", syncViewport);
        return () => window.removeEventListener("resize", syncViewport);
    }, [activeConvId]);

    // Protect accidental closure
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            e.preventDefault();
            window.history.pushState(null, "", window.location.href);
            setShowLeaveModal(true);
        };
        window.history.pushState(null, "", window.location.href);
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Global socket for real-time updates
    useGlobalSocket({

        user_id: currentUser?.id ?? null,
        token,
        onMessage: (msg) => {
            if (msg.sender?.id === currentUser?.id) {
                return;
            }
            handleIncomingMessage(msg, activeConvId);
            if (msg.conversation_id === activeConvId) {
                setExternalMessage(msg);
            }
        },
        onPresence: updatePresence,
        onRead: (conversation_id) => {
            // Update unread count in Sidebar/Chatlist
            clearUnread(conversation_id);
            // If it's the active conversation, signal ChatWindow to update ticks
            if (conversation_id === activeConvId) {
                setLastReadConvId(conversation_id);
                // Reset signal after a short delay to allow re-triggering
                setTimeout(() => setLastReadConvId(null), 100);
            }
        },
        onMembership: (event: MembershipEvent) => {
            refresh().catch(() => { });
            if (
                event.conversation_id === activeConvId
                && event.target_user_id === currentUser?.id
                && (event.action === "participant_removed" || event.action === "participant_left")
            ) {
                setActiveConvId(null);
                setExternalMessage(null);
                if (isMobile) {
                    setSidebarOpen(true);
                }
            }
        },
    })

    const handleConfirmLeave = () => {
        setShowLeaveModal(false);
        router.push("/login");
    };
    // Select conversation

    function selectConversation(conversation: Conversation) {
        setActiveConvId(conversation.id);
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

    async function handleDeleteConversation(conversationId: number) {
        await deleteDirectConversation(conversationId);
        if (activeConv?.id === conversationId) {
            setActiveConvId(null);
            if (isMobile) {
                setSidebarOpen(true);
            }
        }
    }

    async function handleLeaveConversation(conversationId: number) {
        await leaveConversation(conversationId);
        refresh()

    }
    // Sign out
    function handleSignout() {
        logout();
        router.push("/login");
    }

    return (
        <>
            <div className="flex h-dvh min-h-[100dvh] bg-[#080c10] overflow-hidden">

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
                    className={`fixed md:relative z-30 md:z-auto h-full w-[min(22rem,100vw)] md:w-auto transition-transform duration-300
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
                        onLeave={handleLeaveConversation}
                        onDelete={handleDeleteConversation}
                        onSignOut={handleSignout}
                    />
                </div>

                {/* Chat window */}
                <Chatwindow
                    conversation={activeConv}
                    currentUser={currentUser}
                    token={token}
                    onIncomingMessage={(msg: Message) => handleIncomingMessage(msg, activeConv?.id ?? null)}
                    onPresence={updatePresence}
                    onDelete={handleDeleteConversation}
                    onLeaveConversation={handleLeaveConversation}
                    onRefreshConversations={refresh}
                    onExternalRead={lastReadConvId}
                    externalMessage={externalMessage}
                />
                {showLeaveModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="w-full max-w-sm rounded-lg border border-[#1e2a35] bg-[#0d1117] p-5 shadow-2xl sm:p-6">
                            <h2 className="text-[14px] font-bold text-[#c9d8e8] font-mono mb-2">Leave TalkFlow?</h2>
                            <p className="text-[12px] text-[#4a6070] font-mono mb-6">
                                You may miss incoming messages while you&apos;re away.
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
