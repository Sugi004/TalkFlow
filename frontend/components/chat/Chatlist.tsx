" use client"

import { useState, useRef } from "react"
import { Conversation, User } from "@/types"
import { searchUsers } from "@/lib/users"

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
