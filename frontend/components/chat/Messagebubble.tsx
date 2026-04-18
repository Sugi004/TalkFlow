"use client"
/* eslint-disable @next/next/no-img-element */

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

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv"]);

function getFileExtension(value?: string) {
    if (!value) return "";
    const clean = value.split("#", 1)[0].split("?", 1)[0];
    const lastDot = clean.lastIndexOf(".");
    if (lastDot === -1) return "";
    return clean.slice(lastDot + 1).toLowerCase();
}

function attachmentName(msg: Message) {
    if (msg.content?.trim()) return msg.content.trim();
    if (!msg.file_url) return "attachment";
    const cleanUrl = decodeURIComponent(msg.file_url.split("#", 1)[0].split("?", 1)[0]);
    return cleanUrl.split("/").pop() ?? "attachment";
}

function attachmentKind(msg: Message): "image" | "video" | "file" | null {
    if (!msg.file_url) return null;
    if (msg.message_type === "image" || msg.message_type === "video" || msg.message_type === "file") {
        if (msg.message_type !== "file") return msg.message_type;
    }

    const ext = getFileExtension(msg.content) || getFileExtension(msg.file_url);
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
    return "file";
}

// Avatar
type AvatarUser = Pick<User, "full_name" | "email" | "avatar_url">;

function Avatar({ user }: { user: AvatarUser }) {
    const name = user.full_name ?? user.email ?? "?";

    if (user.avatar_url) {
        return (
            <img src={user.avatar_url} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
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
    const kind = attachmentKind(msg);
    const fileName = attachmentName(msg);

    if (kind === "video" && msg.file_url) return (
        <div className="mt-2 overflow-hidden rounded-lg border border-[#1e2a35] bg-[#060a0e]">
            <video
                src={msg.file_url}
                controls
                playsInline
                preload="metadata"
                className="max-h-[240px] max-w-[78vw] rounded object-cover sm:max-w-[320px]"
            />
        </div>
    )
    if (kind === "file" && msg.file_url) {
        return (
            <a
                href={msg.file_url}
                target="_blank"
                rel="noreferrer"
                download={fileName}
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


// Main componenet
export default function MessageBubble({ message, isOwn, grouped, onDelete, onTranslate, translatedContent }: MessageBubbleProps) {
    const [hover, setHover] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const isCodeMessage = message.message_type === "code"
    const mediaKind = attachmentKind(message);
    const fileName = attachmentName(message);
    const shouldRenderTextBubble = Boolean(message.content) && !mediaKind;

    if (message.is_deleted) {
        return (
            <div className={`flex gap-3 px-4 flex-row-reverse ${grouped ? "mt-0.5" : "mt-4"}`} >
                <div className="w-8 shrink-0" />
                <p className="text-[12px] text-[#3a4a55] font-mono italic ">
                    This message was deleted.
                </p>
            </div>
        );
    }

    const senderName = message.sender?.full_name ?? message.sender?.email ?? "Unknown"

    return (
        <>
            <div
                className={`flex gap-3 px-4 ${grouped ? "mt-0.5" : "mt-4"} ${isOwn ? "flex-row-reverse" : ""}`}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => { setHover(false); }}
            >
                {/* Avatar — only show for others, not own messages */}
                <div className="w-8 shrink-0 mt-0.5">
                    {!grouped && !isOwn && message.sender && <Avatar user={message.sender} />}
                </div>

                {/* Content */}
                <div className={`flex min-w-0 flex-col ${isCodeMessage ? "flex-1" : "max-w-[82%] sm:max-w-[70%]"} ${isOwn ? "items-end" : "items-start"}`}>

                    {/* Header row — sender name + time */}
                    {!grouped && (
                        <div className={`flex items-baseline gap-2 mb-1 ${isOwn ? "flex-row-reverse" : ""}`}>
                            <span className={`text-[12.5px] font-semibold font-mono ${isOwn ? "text-cyan-400" : "text-[#c9d8e8]"}`}>
                                {isOwn ? "you" : senderName}
                            </span>
                        </div>
                    )}

                    {/* Bubble */}
                    {message.message_type === "code" ? (
                        <CodeBlock code={message.content ?? ""} language={message.language} />
                    ) : (
                        <>
                            {shouldRenderTextBubble && (
                                <div className={`break-words rounded-2xl px-3 py-2 text-[12.5px] font-mono leading-relaxed whitespace-pre-wrap sm:px-3.5 sm:text-[13px]
                        ${isOwn
                                        ? "bg-cyan-400/20 text-cyan-100 rounded-tr-sm"
                                        : "bg-[#0d1117] border border-[#1e2a35] text-[#c9d8e8] rounded-tl-sm"
                                    }`}>

                                    {translatedContent ?? message.content}
                                    {translatedContent && (
                                        <span className="ml-2 text-[9px] text-amber-400 font-mono">[translated]</span>
                                    )}
                                </div>
                            )}
                            {mediaKind === "image" && message.file_url ? (
                                <button
                                    type="button"
                                    onClick={() => setPreviewOpen(true)}
                                    className="mt-2 block overflow-hidden rounded-lg text-left"
                                    title="View image"
                                >
                                    <img
                                        src={message.file_url}
                                        alt={fileName}
                                        className="max-h-[220px] max-w-[78vw] rounded border border-[#1e2a35] object-cover transition-opacity hover:opacity-90 sm:max-w-[320px]"
                                    />
                                </button>
                            ) : (
                                <MediaContent msg={message} />
                            )}
                        </>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9.5px] text-[#3a4a55] font-mono">
                            {formatTime(message.created_at)}
                        </span>

                        {isOwn && (
                            <span><StatusIcon status={message.status} /></span>
                        )}
                    </div>
                </div>

                {/* Context menu — flip side for own messages */}
                {hover && (
                    <div className="flex items-start gap-0.5 pt-1 self-start">
                        {onTranslate && (
                            <button
                                onClick={() => onTranslate(message.id)}
                                className="w-7 h-7 flex items-center justify-center rounded text-[#4a6070] hover:text-amber-400 hover:bg-[#1a2530] transition-colors text-xs"
                                title="Translate"
                            >🌐</button>
                        )}
                        {onDelete && (
                            <button
                                onClick={() => onDelete(message.id)}
                                className="w-7 h-7 flex items-center justify-center rounded text-[#4a6070] hover:text-[#ff4d6d] hover:bg-[#1a2530] transition-colors text-xs"
                                title="Delete"
                            >🗑</button>
                        )}
                    </div>
                )}
            </div>
            {previewOpen && mediaKind === "image" && message.file_url && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setPreviewOpen(false)}
                >
                    <div
                        className="w-full max-w-5xl rounded-2xl border border-[#1e2a35] bg-[#0d1117] p-3 shadow-2xl sm:p-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="truncate text-[11px] text-[#4a6070] font-mono">{fileName}</p>
                            <button
                                type="button"
                                onClick={() => setPreviewOpen(false)}
                                className="shrink-0 rounded border border-[#1e2a35] px-2.5 py-1 text-[11px] text-[#c9d8e8] font-mono transition-colors hover:bg-[#1a2530]"
                            >
                                Close
                            </button>
                        </div>
                        <div className="flex items-center justify-center">
                            <img
                                src={message.file_url}
                                alt={fileName}
                                className="max-h-[78vh] w-auto max-w-full rounded-xl object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    )


        ;

}
