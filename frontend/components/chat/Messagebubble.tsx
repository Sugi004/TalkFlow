"use client"

import { useState } from "react"
import { Message, User } from "@/types"
import CodeBlock from "./Codeblock"
import { AVATAR_PALETTES, getAvatarColor } from "../chat/Chatlist"

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






