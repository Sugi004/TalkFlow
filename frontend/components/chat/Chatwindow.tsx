"use client"

import { useState, useEffect, useRef, useCallback, KeyboardEvent, ChangeEvent } from "react"
import { Conversation, Message, User, ChatWindowProps } from "@/types"
import { getMessages, deleteMessage, markAsRead } from "@/lib/messages"
import { uploadFile, messageTypeFromMime } from "@/lib/uploads"
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
    return conv.is_group ? (conv.group_name ?? "Group") : (conv.participants[1]?.full_name ?? conv.participants[1]?.email ?? "Unknown");
}

function convDisplayAvatar(conv: Conversation) {
    if (conv.is_group && conv.group_avatar_url) return conv.group_avatar_url;
    if (!conv.is_group && conv.participants[1]?.avatar_url) return conv.participants[1].avatar_url;
    return null;
}

// Group: same sender + same type + within 3 min
function buildGroups(msgs: Message[]) {
    if (!Array.isArray(msgs)) return [];
    return msgs.map((m, i) => {
        const prev = msgs[i - 1];
        const grouped =
            !!prev &&
            prev.sender?.id === m.sender?.id &&
            m.message_type === "text" &&
            !m.is_deleted &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 180_000;
        return { ...m, grouped };
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
    const handleMessage = useCallback((msg: Message) => {
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

    const handleUserJoined = useCallback((_uid: number, fullName: string) => {
        const sys: Message = {
            id: Date.now(),
            conversation_id: convId!,
            content: `${fullName} joined the chat`,
            message_type: "text",
            is_deleted: false,
            status: "sent",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sender: { id: 0, email: "system" }
        } as unknown as Message
        setMessages((prev) => [...prev, sys])
    }, [convId])

    const handleUserLeft = useCallback((_uid: number, fullName: string) => {
        const sys: Message = {
            id: Date.now() + 1,
            conversation_id: convId!,
            content: `${fullName} left the chat`,
            message_type: "text",
            is_deleted: false,
            status: "sent",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sender: { id: 0, email: "system" }
        } as unknown as Message
        setMessages((prev) => [...prev, sys])
    }, [convId])

    const { connected, sendMessage, sendTyping, sendRead } = useWebSocket({
        conversation_id: convId,
        token: token!,
        onMessage: handleMessage,
        onTyping: handleTyping,
        onRead: handleRead,
        onPresence,
        onUserJoined: handleUserJoined,
        onUserLeft: handleUserLeft,
        onPong: () => { },
        onError: (error: string) => { },
    });

    // Mark as read when window is focused
    useEffect(() => {
        if (convId && connected) sendRead()
    }, [convId, connected]);

    // Send text

    async function handleSend() {
        const content = input.trim();
        if (!content || !convId) return;
        setinput("");

        //Auto-resize textarea back
        if (textareaRef.current) textareaRef.current.style.height = "auto";

        const tempId = crypto.randomUUID()
        const isCode = content.startsWith("```")
        const lang = isCode ? content.split("\n")[0].replace("```", "").trim() : undefined;
        const codeContent = isCode ? content.replace(/^```\w*\n/, "").replace(/```$/, "").trim() : content;
        const optimistic: Message = {
            id: Date.now() as unknown as number,
            conversation_id: convId,
            content: codeContent,
            message_type: isCode ? "code" : "text",
            language: isCode ? lang : undefined,
            is_deleted: false,
            status: "sent",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sender: currentUser as unknown as Message["sender"]
        }
        setMessages((prev) => [...prev, optimistic])
        sendMessage(codeContent, isCode ? "code" : "text", { temp_id: tempId, language: lang })

        //Stop typing
        if (typingTimer.current) clearTimeout(typingTimer.current)
        sendTyping(false)
        isTyping.current = false
    }
    // Typing debounce
    function handleInputChange(e: ChangeEvent<HTMLTextAreaElement>) {
        setinput(e.target.value)
        // Auto resize
        e.target.style.height = "auto"
        e.target.style.height = Math.min(e.target.scrollHeight, 144) + "px"

        if (!isTyping.current) {
            isTyping.current = true
            sendTyping(true)
        }
        if (typingTimer.current) clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => {
            isTyping.current = false
            sendTyping(false)
        }, 2000)
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // File upload
    async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file || !convId) return

        setUploading(true)
        setUploadProgress(0)

        try {
            const url = await uploadFile(file, setUploadProgress);
            const type = messageTypeFromMime(file.type);
            sendMessage(file.name, type, { file_url: url })
        }
        catch { }
        finally {
            setUploading(false)
            setUploadProgress(0)
            e.target.value = ""
        }
    }

    // Delete / translate

    async function handleDelete(msgId: number) {
        try {
            await deleteMessage(msgId)
            setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, is_deleted: true } : m))
        }
        catch { }
    }

    async function handleTranslate(msgId: number) {
        const msg = messages.find((m) => m.id === msgId)
        if (!msg?.content) return

        try {
            const translated = await translateMessage(msg.content, "English")
            setTranslatedMap((prev) => ({ ...prev, [msgId]: translated }))
        }
        catch { }
    }

    // Load more (scroll to top)
    async function handleLoadMore() {
        if (!convId || loadingMsgs || !hasMore) return;
        const prevHeight = messagesTopRef.current?.parentElement?.scrollHeight ?? 0;
        await loadMessages(convId)

        // Restore scroll position
        const el = messagesTopRef.current?.parentElement;
        if (el) {
            el.scrollTop = el.scrollHeight - prevHeight;
        }
    }

    // Derived
    const grouped = buildGroups(Array.isArray(messages) ? messages : [])
    const withDivs = injectDividers(grouped)
    const otherTyping = typingUsers.filter((u) => u.id !== currentUser?.id).map((u) => u.name)
    const isCodeBlock = input.trimStart().startsWith("```")

    if (!conversation) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#080c10]">
                <div className="text-center">
                    <div className="text-5xl mb-4">💬</div>
                    <p className="text-[15px] text-[#c9d8e8] font-semibold font-mono mb-1">Select a conversation</p>
                    <p className="text-[12px] text-[#4a6070] font-mono">Choose from the list or start a new one</p>
                </div>
            </div>
        );

    }
    return (
        <>
            <div className="flex-1 flex flex-col min-w-0 bg-[#080c10]">
                {/* Header */}
                <header className="flex items-center gap-3 px-5 py-3 border-b border-[#1e2a35] bg-[#0d1117] shrink-0">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="text-[14px] font-bold text-[#c9d8e8] font-mono truncate">
                                {convDisplayName(conversation)}
                            </h1>
                            {!conversation.is_group && conversation.participants[1]?.is_online && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            )}
                            {conversation.is_group && (
                                <span className="text-[10px] text-[#4a6070] font-mono">
                                    {conversation.participants?.length ?? 0} members
                                </span>
                            )}
                        </div>
                        {!conversation.is_group && conversation.participants[1] && (
                            <p className="text-[11px] font-mono text-[#4a6070]">
                                {conversation.participants[1].is_online
                                    ? "online"
                                    : conversation.participants[1].last_seen
                                        ? `last seen ${new Date(conversation.participants[1].last_seen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                        : "offline"}
                            </p>
                        )}
                    </div>
                    {/* Connection dot */}
                    <div
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? "bg-emerald-400" : "bg-[#ff4d6d] animate-pulse"}`}
                        title={connected ? "Connected" : "Reconnecting…"}
                    />

                    {/* AI button */}
                    <button
                        onClick={() => setShowAiPanel((v) => !v)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-all
            ${showAiPanel ? "bg-violet-500/20 text-violet-400 border border-violet-500/30" : "text-[#4a6070] hover:text-violet-400 hover:bg-violet-500/10 border border-transparent"}`}
                        title="Gemini AI features"
                    >
                        <span>✦</span> AI
                    </button>
                </header>
            </div>
        </>
    )

}


