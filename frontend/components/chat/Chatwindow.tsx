"use client"

import { useState, useEffect, useRef, useCallback, KeyboardEvent, ChangeEvent } from "react"
import { Conversation, Message, User, ChatWindowProps } from "@/types"
import { getMessages, deleteMessage, markAsRead } from "@/lib/messages"
import { uploadFile, messageTypeFromMine } from "@/lib/uploads"
import { getSmartReply, summarizeConversation, translateMessage } from "@/lib/ai"
import { useWebSocket } from "@/hooks/UseWebSocket"
import MessageBubble from "./Messagebubble"

// Helpers

function formatDate(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}


function convDisplayName(conv: Conversation) {
    return conv.is_group ? (conv.group_name ?? "Group") : (conv.other_user?.full_name ?? conv.other_user?.email ?? "Unknown");
}

function convDisplayAvatar(conv: Conversation) {
    if (conv.is_group && conv.group_avatar_url) return conv.group_avatar_url;
    if (!conv.is_group && conv.other_user?.avatar_url) return conv.other_user.avatar_url;
    return null;
}

// Group: same sender + same type + within 3 min
function buildGroups(messages: Message[]) {
    return messages.map((m, i) => {
        const prev = messages[i - 1];
        const grouped = !!prev && prev.sender?.id === m.sender?.id
            && m.message_type === "text" && !m.is_deleted && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 180000
        return { ...m, grouped }
    });
}

/// Inject date dividers

type ListItem = | (Message & { grouped: boolean }) | { _divider: string; _key: string }

function injectDividers(msgs: ReturnType<typeof buildGroups>): ListItem[] {
    const result: ListItem[] = [];
    let lastDate = "";
    for (let m of msgs) {
        const d = formatDate(m.created_at);
        if (d !== lastDate) {
            result.push({ _divider: d, _key: `div-${d}` })
            lastDate = d;
        }
        result.push(m);
    }
    return result;
}

// typing indicator

function TypingIndicator({ users }: { users: string[] }) {
    if (!users.length) return null;
    const label = users.length === 1 ? `{users[0]} is typing...` : users.length === 2 ? `{users[0]} and {users[1]} are typing...` : `{users.length} users are typing...`
    return (
        <div className="flex items-center gap-2 px-5 pb-1.5">
            <div className="wflex gap-[3px]">
                {[0, 1, 2].map((i) =>
                    <span key={i}
                        className="w-1 h-1 rounded-full bg-[#4a6070]"
                        style={{ animation: `typingBounce .9s ${i * 0.15}s ease-in-out infinite` }}
                    />
                )}

            </div>
            <span className="text-[10.5px] text-[#4a6070] font-mono">{label}</span>
        </div>

    )
}

// AI panel

function AiPanel({
    conversationId,
    onReply,
    onClose, }: {
        conversationId: number;
        onReply: (text: string) => void;
        onClose: () => void;

    }) {
    const [tab, setTab] = useState<"replies" | "summary" | "translate">("replies");
    const [replies, setReplies] = useState<string[]>([]);
    const [summary, setSummary] = useState<string>("");
    const [loading, setLoading] = useState(false)
    const [targetLang, setTargetLang] = useState("Spanish")
    const [inputText, setInputText] = useState("")
    const [translated, setTranslated] = useState("")


    async function loadReplies() {
        setLoading(true)
        try {
            setReplies(await getSmartReply(conversationId));
        } catch { }
        finally {
            setLoading(false)
        }
    }

    async function loadSummary() {
        setLoading(true)
        try {
            setSummary(await summarizeConversation(conversationId))
        } catch { }
        finally {
            setLoading(false)
        }
    }

    async function handleTranslate() {
        if (!inputText.trim()) return;
        setLoading(true)
        try {
            setTranslated(await translateMessage(inputText, targetLang))
        } catch { }
        finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (tab === "replies" && !replies.length) loadReplies();
        if (tab === "summary" && !summary) loadSummary();
    }, [tab])


    return (
        <>
            <div className="border-t border-[#1e2a35] bg-[#0a0e14]">
                {/* Tab bar */}
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <div className="flex gap-1">
                        {(["replies", "summary", "translate"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-3 py-1 text-[10px] font-mono font-semibold tracking-wider rounded transition-colors uppercase
                ${tab === t ? "bg-violet-500/20 text-violet-400" : "text-[#4a6070] hover:text-[#c9d8e8]"}`}
                            >
                                {t === "replies" ? "💡 Suggest" : t === "summary" ? "📋 Summary" : "🌐 Translate"}
                            </button>
                        ))}
                    </div>
                    <button onClick={onClose} className="text-[#4a6070] hover:text-[#c9d8e8] transition-colors text-sm">✕</button>
                </div>

                <div className="px-4 pb-4">
                    {loading && (
                        <div className="flex items-center gap-2 py-3">
                            <span className="w-3.5 h-3.5 border border-violet-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-[11px] text-violet-400 font-mono">Gemini thinking…</span>
                        </div>
                    )}

                    {/* Suggest replies */}
                    {tab === "replies" && !loading && replies.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {replies.map((r, i) => (
                                <button
                                    key={i}
                                    onClick={() => { onReply(r); onClose(); }}
                                    className="px-3 py-1.5 bg-[#0d1117] border border-[#1e2a35] rounded text-[12px] text-[#c9d8e8] font-mono
                  hover:border-violet-500/40 hover:text-violet-300 transition-colors text-left"
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Summary */}
                    {tab === "summary" && !loading && summary && (
                        <div className="mt-2 bg-[#0d1117] border border-violet-500/20 rounded px-3.5 py-3 text-[12.5px] text-[#c9d8e8] font-mono leading-relaxed">
                            {summary}
                        </div>
                    )}

                    {/* Translate */}
                    {tab === "translate" && (
                        <div className="mt-2 space-y-2">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Text to translate…"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    className="flex-1 bg-[#060a0e] border border-[#1e2a35] rounded px-3 py-2 font-mono text-[12px] text-[#c9d8e8] placeholder-[#364a58] outline-none focus:border-violet-500/40 caret-violet-400"
                                />
                                <select
                                    value={targetLang}
                                    onChange={(e) => setTargetLang(e.target.value)}
                                    className="bg-[#060a0e] border border-[#1e2a35] rounded px-2 py-2 font-mono text-[12px] text-[#c9d8e8] outline-none focus:border-violet-500/40"
                                >
                                    {["Spanish", "French", "German", "Japanese", "Arabic", "Portuguese", "Chinese", "Hindi"].map((l) => (
                                        <option key={l}>{l}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleTranslate}
                                    disabled={loading}
                                    className="px-3 py-2 bg-violet-500/20 text-violet-400 font-mono text-[12px] rounded hover:bg-violet-500/30 transition-colors disabled:opacity-40"
                                >
                                    Go
                                </button>
                            </div>
                            {translated && (
                                <div className="bg-[#0d1117] border border-violet-500/20 rounded px-3 py-2.5 text-[12.5px] text-[#c9d8e8] font-mono">
                                    {translated}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            );
        </>


    )
}

// Main component

export default function ChatWindow({ conversation, currentUser, token, onIncomingMessage, onPresence }: ChatWindowProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [loadingMsgs, setLoadingMsgs] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [input, setinput] = useState("")
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [showAiPanel, setShowAiPanel] = useState(false)
    const [typingUsers, setTypingUsers] = useState<{ id: number; name: string }[]>([])
    const [translatedMap, setTranslatedMap] = useState<Record<number, string>>({})
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesTopRef = useRef<HTMLDivElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isTyping = useRef(false)
    const pageRef = useRef(0)

    const convId = conversation?.id ?? null

    // load messages
    async function loadMessages(convId: number, reset = false) {
        setLoadingMsgs(true)
        try {
            const skip = reset ? 0 : pageRef.current * 50
            const msgs = await getMessages(convId, skip, 50)
            if (reset) {
                setMessages(msgs)
                pageRef.current = 1
            } else {
                setMessages((prev) => [...msgs, ...prev])
                pageRef.current += 1
            }
            setHasMore(msgs.length === 50)
        } catch { }
        finally {
            setLoadingMsgs(false)
        }
    }

    useEffect(() => {
        if (!convId) return;
        setMessages([])
        setTypingUsers([])
        setShowAiPanel(false)
        setTranslatedMap({})
        pageRef.current = 0
        loadMessages(convId, true)
    }, [convId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    // Websocket callbacks
    const handleMessages = useCallback((msg: Message) => {
        setMessages((prev) => {
            // replace optimistic if temp_id matches
            if (msg.temp_id) {
                const idx = prev.findIndex((m) => m.temp_id === msg.temp_id)
                if (idx !== -1) {
                    const updated = [...prev]
                    updated[idx] = msg
                    return updated
                }
            }
            return [...prev, msg]
        })
        onIncomingMessage(msg)
    }, [onIncomingMessage])

    const handleTyping = useCallback((user_id: number, full_name: string, is_typing: boolean) => {
        setTypingUsers((prev) =>
            isTyping ? prev.find((u) => u.id === user_id) ? prev : [...prev, { id: user_id, name: full_name }] : prev.filter((u) => u.id !== user_id)
        )
    }, [])

    const handleRead = useCallback((_convId: number, _readBy: number) => {
        setMessages((prev) => prev.map((m) => (m.status === "delivered" ? { ...m, status: "read" } : m)))
    }, [])







}
