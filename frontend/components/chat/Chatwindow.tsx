"use client"

import { useState, useEffect, useRef, useCallback, KeyboardEvent, ChangeEvent } from "react"
import { Conversation, Message, User } from "@/types"
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
function buildGroup(messages: Message[]) {
    return messages.map((m, i) => {
        const prev = messages[i - 1];
        const grouped = !!prev && prev.sender?.id === m.sender?.id
            && m.message_type === "text" && !m.is_deleted && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 180000
        return { ...m, grouped }
    });
}