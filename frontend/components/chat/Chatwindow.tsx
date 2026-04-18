"use client"

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, KeyboardEvent, ChangeEvent } from "react"
import toast from "react-hot-toast"
import { Message, ChatWindowProps } from "@/types"
import { getMessages, deleteMessage, markAsRead } from "@/lib/messages"
import { uploadFile, messageTypeFromFile } from "@/lib/uploads"
import { getSmartReply, summarizeConversation, translateMessage } from "@/lib/ai"
import { useWebSocket } from "@/hooks/useWebSocket"
import MessageBubble from "./Messagebubble"
import { convDisplayName } from "@/lib/utils"
import { ConvAvatar } from "./Chatlist"
import GroupInfoModal from "./GroupInfoModal"

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

// function convDisplayAvatar(conv: Conversation) {
//     if (conv.is_group && conv.group_avatar_url) return conv.group_avatar_url;
//     if (!conv.is_group && conv.other_user?.avatar_url) return conv.other_user.avatar_url;
//     return null;
// }


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
    for (const m of msgs) {
        const d = formatDate(m.created_at);
        if (d !== lastDate) {
            result.push({ _divider: d, _key: `div-${d}` })
            lastDate = d;
        }
        result.push(m);
    }
    return result;
}

function mergeUniqueMessages(existing: Message[], incoming: Message[]) {
    const seen = new Set(existing.map((m) => m.id))
    const merged = [...incoming.filter((m) => !seen.has(m.id)), ...existing]
    return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

// typing indicator

function TypingIndicator({ users }: { users: string[] }) {
    if (!users.length) return null;
    const label = users.length === 1 ? `${users[0]} is typing...` : users.length === 2 ? `${users[0]} and ${users[1]} are typing...` : `${users.length} users are typing...`
    return (
        <div className="flex items-center gap-2 px-4 pb-1.5 sm:px-5">
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


    const loadReplies = useCallback(async () => {
        setLoading(true)
        try {
            setReplies(await getSmartReply(conversationId));
        } catch { }
        finally {
            setLoading(false)
        }
    }, [conversationId])

    const loadSummary = useCallback(async () => {
        setLoading(true)
        try {
            setSummary(await summarizeConversation(conversationId))
        } catch { }
        finally {
            setLoading(false)
        }
    }, [conversationId])

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
    }, [loadReplies, loadSummary, replies.length, summary, tab])


    return (
        <>
            <div className="border-t border-[#1e2a35] bg-[#0a0e14]">
                {/* Tab bar */}
                <div className="flex flex-col gap-2 px-4 pt-3 pb-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-1">
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
                            <div className="flex flex-col gap-2 sm:flex-row">
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
                                    className="bg-[#060a0e] border border-[#1e2a35] rounded px-2 py-2 font-mono text-[12px] text-[#c9d8e8] outline-none focus:border-violet-500/40 sm:w-40"
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

        </>


    )
}

// Main component

export default function ChatWindow({
    conversation,
    currentUser,
    token,
    onIncomingMessage,
    onPresence,
    onLeaveConversation,
    onRefreshConversations,
    onExternalRead,
    externalMessage,
}: ChatWindowProps) {
    const PAGE_SIZE = 50
    const [messagesMap, setMessagesMap] = useState<Record<number, Message[]>>({})
    const [loadingMsgs, setLoadingMsgs] = useState(false)
    const [hasMoreMap, setHasMoreMap] = useState<Record<number, boolean>>({})
    const [input, setInput] = useState("")
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [showAiPanel, setShowAiPanel] = useState(false)
    const [showGroupInfo, setShowGroupInfo] = useState(false)
    const [typingUsers, setTypingUsers] = useState<{ id: number; name: string }[]>([])
    const [translatedMap, setTranslatedMap] = useState<Record<number, string>>({})
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesTopRef = useRef<HTMLDivElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isTyping = useRef(false)
    const offsetsCacheRef = useRef<Record<number, number>>({})
    const loadingMoreRef = useRef(false)
    const preserveScrollRef = useRef(false)
    const restoreScrollTopRef = useRef<number | null>(null)
    const initialScrollDoneRef = useRef(false)
    const sendReadRef = useRef<() => void>(() => { })

    const convId = conversation?.id ?? null

    const messages = useMemo(() => (convId ? (messagesMap[convId] ?? []) : []), [convId, messagesMap])
    const hasMore = useMemo(() => (convId ? (hasMoreMap[convId] ?? true) : false), [convId, hasMoreMap])

    const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
        if (!convId) return;
        setMessagesMap(prev => {
            const oldList = prev[convId] || [];
            const newList = typeof updater === "function" ? updater(oldList) : updater;
            return { ...prev, [convId]: newList };
        });
    }, [convId]);

    // load messages
    const loadMessages = useCallback(async (convId: number, reset = false, skipOverride?: number, dontUpdateOffset = false) => {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true
        setLoadingMsgs(true)
        try {
            const currentOffset = offsetsCacheRef.current[convId] ?? 0
            const skip = reset ? 0 : (skipOverride ?? currentOffset)
            const msgs = await getMessages(convId, skip, PAGE_SIZE)
            if (reset) {
                setMessages(msgs)
                if (!dontUpdateOffset) offsetsCacheRef.current[convId] = msgs.length
            } else {
                preserveScrollRef.current = true
                if (!dontUpdateOffset) offsetsCacheRef.current[convId] = skip + msgs.length
                setMessages((prev) => mergeUniqueMessages(prev, msgs))
            }
            setHasMoreMap(prev => ({ ...prev, [convId]: msgs.length === PAGE_SIZE }))
        } catch (err) {
            console.error("Error in loading", err)
        }
        finally {
            loadingMoreRef.current = false
            setLoadingMsgs(false)
        }
    }, [PAGE_SIZE, setMessages])

    useEffect(() => {
        if (!convId) return;
        setTypingUsers([])
        setShowAiPanel(false)
        setShowGroupInfo(false)
        setTranslatedMap({})
        loadingMoreRef.current = false
        initialScrollDoneRef.current = false
    }, [convId, token])

    const handleRead = useCallback(() => {
        setMessages((prev) =>
            prev.map((m) =>
            ((m.status === "sent" || m.status === "delivered")
                ? { ...m, status: "read" as const }
                : m))
        )
    }, [setMessages])

    useEffect(() => {
        // If the signaled conversation ID matches our current view
        if (onExternalRead && onExternalRead === convId) {
            handleRead();
        }
    }, [convId, handleRead, onExternalRead]);

    useEffect(() => {
        if (!convId || !token) return;
        if (messagesMap[convId] !== undefined) {
            return;
        }
        loadMessages(convId, true)
    }, [convId, loadMessages, messagesMap, token])

    useEffect(() => {
        if (!externalMessage || externalMessage.conversation_id !== convId) return
        setMessages((prev) => {
            if (prev.some((message) => message.id === externalMessage.id)) {
                return prev
            }
            return [...prev, externalMessage].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
        })
    }, [convId, externalMessage, setMessages])

    useEffect(() => {
        const fallbackMessage = conversation?.last_message
        if (!convId || !fallbackMessage || fallbackMessage.conversation_id !== convId) return
        setMessages((prev) => {
            if (prev.some((message) => message.id === fallbackMessage.id)) {
                return prev
            }
            return [...prev, fallbackMessage].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
        })
    }, [convId, conversation?.last_message, setMessages])

    useLayoutEffect(() => {
        const container = messagesContainerRef.current
        if (!container) return;
        if (preserveScrollRef.current) {
            if (restoreScrollTopRef.current !== null) {
                container.scrollTop = restoreScrollTopRef.current
                restoreScrollTopRef.current = null
            }
            preserveScrollRef.current = false
            return;
        }
        if (!initialScrollDoneRef.current) {
            container.scrollTop = container.scrollHeight
            initialScrollDoneRef.current = true
            return;
        }
        container.scrollTop = container.scrollHeight
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
                    return updated.sort(
                        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    )
                }
            }
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
        })
        onIncomingMessage(msg)
        if (msg.conversation_id === convId && msg.sender?.id !== currentUser?.id) {
            sendReadRef.current()
            markAsRead(msg.conversation_id).catch(() => { })
            setMessages((prev) => prev.map((m) => (m.status === "delivered" ? { ...m, status: "read" } : m)))
        }
    }, [onIncomingMessage, convId, currentUser?.id, setMessages])

    const handleTyping = useCallback((user_id: number, full_name: string, is_typing: boolean) => {
        setTypingUsers((prev) =>
            is_typing ? prev.find((u) => u.id === user_id) ? prev : [...prev, { id: user_id, name: full_name }] : prev.filter((u) => u.id !== user_id)
        )
    }, [])



    const handleUserJoined = useCallback((userId: number, fullName: string) => {
        if (userId === currentUser?.id) return
        toast.success(`${fullName} joined the group`, { id: `group-join-${convId}-${userId}` })
        onRefreshConversations?.().catch(() => {})
    }, [convId, currentUser?.id, onRefreshConversations])

    const handleUserLeft = useCallback((userId: number, fullName: string) => {
        if (userId === currentUser?.id) return
        toast(`${fullName} left the group`, {
            id: `group-leave-${convId}-${userId}`,
            icon: "👋",
        })
        onRefreshConversations?.().catch(() => {})
    }, [convId, currentUser?.id, onRefreshConversations])

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
        onError: () => { },
    });

    // Store sendRead in ref for use in callbacks
    useEffect(() => { sendReadRef.current = sendRead; }, [sendRead]);

    // Mark as read when window is focused
    useEffect(() => {
        if (convId && connected) {
            sendRead()
            markAsRead(convId).catch(() => { })
        }

    }, [convId, connected, sendRead]);

    // Send text

    async function handleSend() {
        const content = input.trim();
        if (!content || !convId) return;
        setInput("");

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
            temp_id: tempId,
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
        setInput(e.target.value)
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
            const type = messageTypeFromFile(file);
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
            setMessages((prev) => prev.filter((m) => m.id !== msgId))
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
        const container = messagesContainerRef.current
        if (!container) return;
        const prevScrollHeight = container.scrollHeight;
        preserveScrollRef.current = true
        restoreScrollTopRef.current = 0
        await loadMessages(convId, false, offsetsCacheRef.current[convId] ?? 0)

        requestAnimationFrame(() => {
            if (!messagesContainerRef.current) return;
            const added = messagesContainerRef.current.scrollHeight - prevScrollHeight
            messagesContainerRef.current.scrollTop = added > 0 ? added : 0
        })
    }

    // Derived
    const grouped = buildGroups(Array.isArray(messages) ? messages : [])
    const withDivs = injectDividers(grouped)
    const otherTyping = typingUsers.filter((u) => u.id !== currentUser?.id).map((u) => u.name)
    const isCodeBlock = input.trimStart().startsWith("```")
    const isMember = conversation?.is_group ? conversation.participants?.some((p) => p.id === currentUser?.id) : true;
    const composerPlaceholder = conversation
        ? `Message ${convDisplayName(conversation)}`
        : "Type a message";

    if (!conversation) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#080c10]">
                <div className="px-6 text-center">
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
                <header className="flex shrink-0 flex-wrap items-start gap-3 border-b border-[#1e2a35] bg-[#0d1117] px-3 py-3 sm:px-5">
                    <ConvAvatar conv={conversation} />

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-[14px] font-bold text-[#c9d8e8] font-mono truncate">
                                {convDisplayName(conversation)}
                            </h1>
                            {!conversation.is_group && conversation.other_user?.is_online && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            )}
                            {conversation.is_group && (
                                <button
                                    type="button"
                                    onClick={() => setShowGroupInfo(true)}
                                    className="text-[10px] text-[#4a6070] font-mono transition-colors hover:text-cyan-400"
                                >
                                    {conversation.participants?.length ?? 0} members
                                </button>
                            )}
                        </div>
                        {!conversation.is_group && conversation.other_user && (
                            <p className="text-[11px] font-mono text-[#4a6070] break-words">
                                {conversation.other_user.is_online
                                    ? "online"
                                    : conversation.other_user.last_seen
                                        ? `last seen ${new Date(conversation.other_user.last_seen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "2-digit", hour12: true })}`
                                        : "offline"}
                            </p>
                        )}
                    </div>

                    <div className="ml-auto flex items-center gap-1.5 self-start sm:gap-2">
                        <button
                            onClick={() => setShowAiPanel((v) => !v)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono font-semibold transition-all sm:gap-1.5 sm:px-2.5
            ${showAiPanel ? "bg-violet-500/20 text-violet-400 border border-violet-500/30" : "text-[#4a6070] hover:text-violet-400 hover:bg-violet-500/10 border border-transparent"}`}
                            title="Gemini AI features"
                        >
                            <span>✦</span> AI
                        </button>
                        {conversation.is_group && (
                            <button
                                type="button"
                                onClick={() => setShowGroupInfo(true)}
                                className="flex items-center gap-1 rounded border border-transparent px-2 py-1 text-[11px] font-mono font-semibold text-[#4a6070] transition-all hover:border-cyan-400/20 hover:bg-cyan-400/10 hover:text-cyan-400 sm:gap-1.5 sm:px-2.5"
                                title="Open group info"
                            >
                                <span>☰</span> Group
                            </button>
                        )}
                    </div>
                </header>
                {/* Messages */}
                <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto overscroll-contain"
                >
                    <div ref={messagesTopRef} />

                    {loadingMsgs && messages.length === 0 && (
                        <div className="flex items-center justify-center h-32 gap-2">
                            <span className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-[12px] text-[#4a6070] font-mono">Loading…</span>
                        </div>
                    )}

                    {(hasMore || loadingMsgs) && messages.length > 0 && (
                        <div className="sticky top-0 z-10 flex justify-center py-3 bg-[#080c10]">
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMsgs}
                                className="text-[11px] text-[#4a6070] font-mono hover:text-cyan-400 transition-colors disabled:opacity-40"
                            >
                                {loadingMsgs ? "Loading earlier messages…" : "↑ Load earlier messages"}
                            </button>
                        </div>
                    )}

                    <div className="pb-2">
                        {withDivs.map((item) => {
                            if ("_divider" in item) {
                                return (
                                    <div key={item._key} className="my-5 flex items-center gap-3 px-3 sm:px-5">
                                        <div className="flex-1 h-px bg-[#1e2a35]" />
                                        <span className="text-[9.5px] text-[#3a4a55] font-mono tracking-widest uppercase">
                                            {item._divider}
                                        </span>
                                        <div className="flex-1 h-px bg-[#1e2a35]" />
                                    </div>
                                );
                            }
                            const m = item as Message & { grouped: boolean };
                            return (
                                <MessageBubble
                                    key={m.id}
                                    message={m}
                                    isOwn={m.sender?.id === currentUser?.id}
                                    grouped={m.grouped}
                                    onDelete={handleDelete}
                                    onTranslate={handleTranslate}
                                    translatedContent={translatedMap[m.id]}
                                />
                            );
                        })}
                    </div>

                    <div ref={messagesEndRef} />
                </div>

                {/* Typing indicator */}
                <TypingIndicator users={otherTyping} />

                {/* AI Panel */}
                {showAiPanel && (
                    <AiPanel
                        conversationId={conversation.id}
                        onReply={(text) => setInput(text)}
                        onClose={() => setShowAiPanel(false)}
                    />
                )}

                {/* Input */}
                {isMember ? (
                    <div className="shrink-0 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 sm:px-4 sm:pb-4">
                        {/* Upload progress */}
                        {uploading && (
                            <div className="mb-2 flex items-center gap-2">
                                <div className="flex-1 h-1 bg-[#1e2a35] rounded-full overflow-hidden">

                                    <div
                                        className="h-full bg-cyan-400 rounded-full transition-all"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                                <span className="text-[10px] text-cyan-400 font-mono">{uploadProgress}%</span>
                            </div>
                        )}

                        {!connected && (
                            <p className="mb-2 px-1 text-[10px] text-[#ff4d6d] font-mono">
                                Connecting… please wait before sending.
                            </p>
                        )}

                        <div
                            className={`flex items-end gap-2 rounded-md border bg-[#0d1117] px-3 py-2 transition-all sm:gap-2.5 sm:px-3.5 sm:py-2.5
                            ${isCodeBlock
                                    ? "border-amber-500/40 shadow-[0_0_0_3px_rgba(245,158,11,.06)]"
                                    : "border-[#1e2a35] focus-within:border-cyan-400/50 focus-within:shadow-[0_0_0_3px_rgba(0,204,255,.05)]"
                                }`}
                        >
                            {/* Attach */}
                            <button
                                onClick={() => fileRef.current?.click()}
                                disabled={uploading}
                                className="shrink-0 mb-0.5 text-[#4a6070] hover:text-cyan-400 transition-colors disabled:opacity-40 text-lg leading-none"
                                title="Attach file"
                            >
                                ⊕
                            </button>
                            <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />

                            {/* Textarea */}
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder={`${composerPlaceholder} · \`\`\`lang for code`}
                                rows={1}
                                className={`flex-1 bg-transparent resize-none outline-none font-mono text-[12.5px] leading-relaxed sm:text-[13px]
                                placeholder-[#364a58] overflow-y-auto caret-cyan-400
                                ${isCodeBlock ? "text-amber-300" : "text-[#c9d8e8]"}`}
                                style={{ maxHeight: "144px", scrollbarWidth: "none" }}
                            />

                            {/* Code badge */}
                            {isCodeBlock && (
                                <span className="shrink-0 mb-0.5 text-[9px] text-amber-400 font-mono border border-amber-500/30 px-1.5 py-0.5 rounded">
                                    code
                                </span>
                            )}

                            {/* Send */}
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || uploading || !connected}
                                className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded transition-all
                bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20
                disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                title="Send (Enter)"
                            >
                                ↑
                            </button>
                        </div>

                        <p className="mt-1.5 px-1 text-[9.5px] text-[#2e3e4a] font-mono sm:hidden">
                            Enter send · Shift+Enter newline
                        </p>
                        <p className="mt-1.5 hidden px-1 text-[9.5px] text-[#2e3e4a] font-mono sm:block">
                            <span className="text-[#3a4a55]">Enter</span> send ·{" "}
                            <span className="text-[#3a4a55]">Shift+Enter</span> newline ·{" "}
                            <span className="text-amber-600">```lang</span> code block
                        </p>
                    </div>) :
                    (
                        <div className="px-4 pb-4 pt-2 shrink-0">
                            <span className="text-[12px] text-[#4a6070] font-mono">
                                You left this group. You can no longer send messages.
                            </span>
                        </div>
                    )}

                <style>{`
            @keyframes typingBounce {
            0%,100% { transform:translateY(0) }
            50%      { transform:translateY(-4px) }
            }
        `}</style>
            </div>
            {showGroupInfo && conversation.is_group && (
                <GroupInfoModal
                    conversation={conversation}
                    currentUser={currentUser}
                    onClose={() => setShowGroupInfo(false)}
                    onConversationUpdated={onRefreshConversations}
                    onLeaveConversation={onLeaveConversation}
                />
            )}
        </>
    )

}
