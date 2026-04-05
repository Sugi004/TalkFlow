" use client"

import { useState, useRef } from "react"
import { Conversation, User } from "@/types"
import { searchUsers } from "@/lib/users"
import { ChatListProps } from "@/types"

const AVATAR_PALETTES = [
    "bg-cyan-500/20 text-cyan-400",
    "bg-emerald-500/20 text-emerald-400",
    "bg-violet-500/20 text-violet-400",
    "bg-amber-500/20 text-amber-400",
    "bg-rose-500/20 text-rose-400",
    "bg-sky-500/20 text-sky-400",
];

function getAvatarColor(name: string): string {
    let h = 0;
    for (let c of name) h = (h * 31 + c.charCodeAt(0)) & 0xFFFFFF;
    return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function lastMsgPreview(conv: Conversation): string {
    const msg = conv.last_message
    if (!msg) return "No Messages yet"
    if (msg.is_deleted) return "Message deleted"
    if (msg.message_type === "image") return "📷 Image"
    if (msg.message_type === "file") return "📄 File"
    if (msg.message_type === "code") return "💻 Code snippet"
    if (msg.message_type === "video") return "🎥 Video"
    return msg.content || ""
}

function conversationTitle(conv: Conversation) {
    return conv.is_group ? conv.group_name : (conv.other_user?.full_name ?? "Unknown")
}

function conversationAvatar(conv: Conversation) {
    const name = conversationTitle(conv);
    const avatarUrl = conv.is_group ? conv.group_avatar_url : conv.other_user?.avatar_url;
    if (avatarUrl) {
        return (
            <div className="relative shrink-0">
                <img src={avatarUrl} alt={name} className="w-9 h-9 rounded object-cover" />
                {!conv.is_group && conv.other_user?.is_online && (
                    <span className="absolute -bottom-px -right-px w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0a0e14]" />
                )}
            </div>
        );

    }
    return (
        <div className="relative shrink-0">
            <div className={`w-9 h-9 rounded flex items-center justify-center text-[11px] font-bold font-mono ${getAvatarColor(name)}`}>
                {conv.is_group ? "G" : getInitials(name)}
            </div>
            {!conv.is_group && conv.other_user?.is_online && (
                <span className="absolute -bottom-px -right-px w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0a0e14]" />
            )}
        </div>
    );
}

function NewChatModel({
    onDirect,
    onGroup,
    onClose
}: {
    onDirect: (userId: number) => void;
    onGroup: (name: string, ids: number[]) => void;
    onClose: () => void;
}) {
    const [mode, setMode] = useState<"direct" | "group">("direct");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<User[]>([]);
    const [selected, setSelected] = useState<User[]>([]);
    const [groupName, setGroupName] = useState("");
    const [searching, setSearching] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);


    function handleSearch(q: string) {
        setQuery(q);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!q.trim()) {
            setResults([]);
            setSearching(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                setResults(await searchUsers(q));
            }
            catch { }
            finally { setSearching(false) }
        }, 300);
    }

    function toggleSelect(u: User) {
        setSelected((s) =>
            s.find((x) => x.id === u.id)
                ? s.filter((x) => x.id !== u.id)
                : [...s, u]
        )
    }

    function submit() {
        if (mode === "direct" && selected.length === 1) {
            onDirect(selected[0].id);
            onClose();
        } else if (
            mode === "group" && selected.length >= 1 && groupName.trim()
        ) {
            onGroup(groupName.trim(), selected.map((u) => u.id));
            onClose();
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-[#0d1117] border border-[#1e2a35] rounded-md overflow-hidden shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2a35]">
                    <h2 className="text-[13px] font-bold text-[#c9d8e8] font-mono">New Conversation</h2>
                    <button onClick={onClose} className="text-[#4a6070] hover:text-[#c9d8e8] transition-colors text-lg leading-none">✕</button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Mode toggle */}
                    <div className="flex gap-1 bg-[#060a0e] rounded p-1">
                        {(["direct", "group"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`flex-1 py-1.5 text-[11px] font-mono font-semibold tracking-wider rounded transition-all
                  ${mode === m ? "bg-cyan-400/10 text-cyan-400" : "text-[#4a6070] hover:text-[#c9d8e8]"}`}
                            >
                                {m === "direct" ? "Direct" : "Group"}
                            </button>
                        ))}
                    </div>

                    {/* Group name (only in group mode) */}
                    {mode === "group" && (
                        <input
                            type="text"
                            placeholder="Group name…"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="w-full bg-[#060a0e] border border-[#1e2a35] rounded px-3 py-2.5 font-mono text-[12.5px] text-[#c9d8e8] placeholder-[#364a58] outline-none focus:border-cyan-400/50 caret-cyan-400"
                        />
                    )}

                    {/* Search */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search users…"
                            value={query}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="w-full bg-[#060a0e] border border-[#1e2a35] rounded px-3 py-2.5 font-mono text-[12.5px] text-[#c9d8e8] placeholder-[#364a58] outline-none focus:border-cyan-400/50 caret-cyan-400"
                        />
                        {searching && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        )}
                    </div>

                    {/* Selected chips */}
                    {selected.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {selected.map((u) => (
                                <span
                                    key={u.id}
                                    className="flex items-center gap-1.5 bg-cyan-400/10 text-cyan-400 text-[11px] font-mono px-2 py-0.5 rounded-full"
                                >
                                    {u.full_name ?? u.email}
                                    <button onClick={() => toggleSelect(u)} className="hover:text-[#ff4d6d] transition-colors">✕</button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Results */}
                    {results.length > 0 && (
                        <div className="space-y-0.5 max-h-40 overflow-y-auto">
                            {results.map((u) => {
                                const sel = !!selected.find((x) => x.id === u.id);
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => mode === "direct" ? setSelected([u]) : toggleSelect(u)}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition-colors
                      ${sel ? "bg-cyan-400/10" : "hover:bg-[#1a2530]"}`}
                                    >
                                        <div className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${getAvatarColor(u.full_name ?? u.email)}`}>
                                            {getInitials(u.full_name ?? u.email)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[12.5px] text-[#c9d8e8] font-mono truncate">{u.full_name ?? u.email}</p>
                                            {u.full_name && <p className="text-[10px] text-[#4a6070] font-mono truncate">{u.email}</p>}
                                        </div>
                                        {sel && <span className="ml-auto text-cyan-400 text-xs">✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        onClick={submit}
                        disabled={mode === "direct" ? selected.length !== 1 : !groupName.trim() || selected.length < 1}
                        className="w-full py-2.5 bg-cyan-400 rounded font-mono text-[12.5px] font-bold tracking-wider uppercase text-[#080c10]
              hover:shadow-[0_0_20px_rgba(0,204,255,.35)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {mode === "direct" ? "Start Chat" : "Create Group"}
                    </button>
                </div>
            </div>
        </div>
    );


}


