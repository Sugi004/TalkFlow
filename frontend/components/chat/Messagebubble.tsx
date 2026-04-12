"use client"

import { useState } from "react"
import { Message, User, MessageBubbleProps } from "@/types"
import CodeBlock from "./Codeblock"
import { getAvatarColor } from "@/lib/utils"

function initials(name: string) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
}


function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Avatar
function Avatar({ user }: { user: User | { full_name?: string; email?: string } }) {
    const name = (user as any).full_name ?? (user as any).email ?? "?";
    if ((user as User).avatar_url) {
        return (
            <img src={(user as User).avatar_url} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
        )
    }
    return (
        <div className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${getAvatarColor(name)}`}>
            {initials(name)}
        </div>
    )
}

// Status icon

function StatusIcon({ status }: { status?: string }) {
    if (status === "read")
        return <span className="text-[9px] text-cyan-400 font-mono">✓✓</span>;
    if (status === "delivered")
        return <span className="text-[9px] text-[#4a6070] font-mono">✓✓</span>;
    return <span className="text-[9px] text-[#3a4a55] font-mono">✓</span>;
}

// Image /video / file preview

function MediaContent({ msg }: { msg: Message }) {
    if (msg.message_type === "image" && msg.file_url) return (
        <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="block mt-2 rounded-lg overflow-hidden">
            <img src={msg.file_url} alt="attachment" className="max-w-[280px] max-h-[200px] rounded border border-[#1e2a35] object-cover hover:opacity-90 transition-opacity" />
        </a>
    )
    if (msg.message_type === "video" && msg.file_url) return (
        <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="block mt-2 rounded-lg overflow-hidden">
            <video src={msg.file_url} className="max-w-[280px] max-h-[200px] rounded border border-[#1e2a35] object-cover hover:opacity-90 transition-opacity" />
        </a>
    )
    if (msg.message_type === "file" && msg.file_url) {
        const fileName = msg.file_url.split("/").pop() ?? "attachment";
        return (
            <a
                href={msg.file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 mt-1 bg-[#0d1117] border border-[#1e2a35] rounded px-3 py-2
          text-[12px] text-cyan-400 font-mono hover:border-cyan-400/30 transition-colors"
            >
                <span className="text-base">📎</span>
                <span className="truncate max-w-[220px]">{fileName}</span>
                <span className="text-[#4a6070] text-[10px] ml-1">↓</span>
            </a>
        );
    }
    return null

}

// Disappearing message countdown

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    const mins = Math.max(0, Math.floor(ms / 60000));
    const secs = Math.max(0, Math.floor((ms % 60000) / 1000));
    if (ms <= 0) return (
        <span className="text-[10px] text-red-400 font-mono ml-1">⏳ EXPIRED</span>
    );
    return (
        <span className="text-[10px] text-orange-400 font-mono ml-1">
            ⏳  {mins > 0 ? `${mins}m` : `${secs}s`}
        </span>
    );

}

// Main componenet
export default function MessageBubble({ message, isOwn, grouped, onDelete, onTranslate, translatedContent }: MessageBubbleProps) {
    const [hover, setHover] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    if (message.is_deleted) {
        return (
            <div className={`flex gap-3 px-4 ${grouped ? "mt-0.5" : "mt-4"}`}>
                <div className="w-8 shrink-0" />
                <p className="text-[12px] text-[#3a4a55] font-mono italic">
                    This message was deleted.
                </p>
            </div>
        );
    }

    const senderName = message.sender?.full_name ?? message.sender?.email ?? "Unknown"

    return (
        <>
            <div className={`flex gap-3 px-4 ${grouped ? "mt-0.5" : "mt-4"}`}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => {
                    setHover(false)
                    setShowMenu(false)
                }}
            >
                {/* Avatar */}
                <div className="w-8 shrink-0 mt-0.5">
                    {!grouped && message.sender && <Avatar user={message.sender} />}
                </div>

                {/* Message content */}
                <div className="flex-1 min-w-0">
                    {/* Header row */}
                    {!grouped && (
                        <div className="flex items-baseline gap-2 mb-1">
                            <span className={`text-[12.5px] font-semibold font-mono ${isOwn ? "text-cyan-400" : "text-[#c9d8e8]"}`}>
                                {isOwn ? "you" : senderName}
                            </span>
                            <span className="text-[10px] text-[#3a4a55] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                                {formatTime(message.created_at)}
                            </span>
                            {message.expires_at && <ExpiryBadge expiresAt={message.expires_at} />}
                            {isOwn && <StatusIcon status={message.status} />}
                        </div>
                    )}

                    {/* Content */}
                    {message.message_type === "code" ? (
                        <CodeBlock code={message.content ?? ""} language={message.language} />
                    ) : (
                        <>
                            {message.content && (
                                <p className="text-[13px] text-[#c9d8e8] font-mono leading-relaxed whitespace-pre-wrap wrap-break-words">
                                    {translatedContent ?? message.content}
                                    {translatedContent && (
                                        <span className="ml-2 text-[9px] text-amber-400 font-mono">[translated]</span>
                                    )}
                                </p>
                            )}
                            <MediaContent msg={message} />
                        </>
                    )}

                    {/* Timestamp for grouped messages (on hover) */}
                    {grouped && (
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9.5px] text-[#2e3e4a] font-mono opacity-0 group-hover:opacity-100 transition-opacity w-8 text-center leading-none">
                            {formatTime(message.created_at).split(":")[1]}
                        </span>
                    )}
                </div>

                {/* Context menu */}
                {hover && (
                    <div className="absolute right-4 top-0 flex items-center gap-0.5 z-10">
                        {onTranslate && (
                            <button
                                onClick={() => onTranslate(message.id)}
                                className="w-7 h-7 flex items-center justify-center rounded text-[#4a6070] hover:text-amber-400 hover:bg-[#1a2530] transition-colors text-xs"
                                title="Translate"
                            >
                                🌐
                            </button>
                        )}
                        {isOwn && onDelete && (
                            <button
                                onClick={() => onDelete(message.id)}
                                className="w-7 h-7 flex items-center justify-center rounded text-[#4a6070] hover:text-[#ff4d6d] hover:bg-[#1a2530] transition-colors text-xs"
                                title="Delete"
                            >
                                🗑
                            </button>
                        )}
                    </div>
                )}


            </div>
        </>
    )


        ;

}

