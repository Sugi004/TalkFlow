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
