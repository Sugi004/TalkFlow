"use client"
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { Conversation, User } from "@/types"
import {
    addParticipant,
    getConversation,
    leaveConversation,
    removeParticipant,
    updateGroupConversation,
} from "@/lib/conversations"
import { searchUsers } from "@/lib/users"
import { uploadFile } from "@/lib/uploads"
import { convDisplayName, getAvatarColor, getInitials, validAvatar } from "@/lib/utils"
import { getErrorMessage } from "@/lib/auth"

interface GroupInfoModalProps {
    conversation: Conversation;
    currentUser: User | null;
    onClose: () => void;
    onConversationUpdated?: () => Promise<void>;
    onLeaveConversation?: (conversationId: number) => Promise<void>;
}

export default function GroupInfoModal({
    conversation,
    currentUser,
    onClose,
    onConversationUpdated,
    onLeaveConversation,
}: GroupInfoModalProps) {
    const [detail, setDetail] = useState<Conversation | null>(null)
    const [groupName, setGroupName] = useState(conversation.group_name ?? "")
    const [loading, setLoading] = useState(true)
    const [savingName, setSavingName] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadPct, setUploadPct] = useState(0)
    const [searching, setSearching] = useState(false)
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<User[]>([])
    const [removingUserId, setRemovingUserId] = useState<number | null>(null)
    const [brokenMemberAvatarIds, setBrokenMemberAvatarIds] = useState<number[]>([])

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const refreshDetail = useCallback(async () => {
        setLoading(true)
        try {
            const fresh = await getConversation(conversation.id)
            setDetail(fresh)
            setGroupName(fresh.group_name ?? "")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to load group details"))
            onClose()
        } finally {
            setLoading(false)
        }
    }, [conversation.id, onClose])

    useEffect(() => {
        refreshDetail()
    }, [refreshDetail])

    const activeConversation = detail ?? conversation
    const isAdmin = activeConversation.current_user_is_admin ?? false
    const avatarUrl = validAvatar(activeConversation.group_avatar_url)
    const members = activeConversation.participants ?? []

    async function syncParent() {
        if (onConversationUpdated) {
            await onConversationUpdated()
        }
    }

    async function handleSaveName() {
        const trimmed = groupName.trim()
        if (!trimmed || trimmed === (activeConversation.group_name ?? "")) return

        setSavingName(true)
        try {
            const updated = await updateGroupConversation(conversation.id, { group_name: trimmed })
            setDetail(updated)
            setGroupName(updated.group_name ?? trimmed)
            await syncParent()
            toast.success("Group name updated")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to update group name"))
        } finally {
            setSavingName(false)
        }
    }

    async function handleAvatarUpload(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith("image/")) {
            toast.error("Please choose an image")
            return
        }

        setUploading(true)
        setUploadPct(0)
        try {
            const url = await uploadFile(file, setUploadPct)
            const updated = await updateGroupConversation(conversation.id, { group_avatar_url: url })
            setDetail(updated)
            await syncParent()
            toast.success("Group photo updated")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to update group photo"))
        } finally {
            setUploading(false)
            setUploadPct(0)
            e.target.value = ""
        }
    }

    async function handleRemoveGroupAvatar() {
        setUploading(true)
        try {
            const updated = await updateGroupConversation(conversation.id, { group_avatar_url: null })
            setDetail(updated)
            await syncParent()
            toast.success("Group photo removed")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to remove group photo"))
        } finally {
            setUploading(false)
            setUploadPct(0)
        }
    }

    function handleSearch(value: string) {
        setQuery(value)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (!value.trim()) {
            setResults([])
            setSearching(false)
            return
        }

        debounceRef.current = setTimeout(async () => {
            setSearching(true)
            try {
                const found = await searchUsers(value)
                const existingIds = new Set(members.map((member) => member.id))
                setResults(found.filter((user) => !existingIds.has(user.id)))
            } catch {
                setResults([])
            } finally {
                setSearching(false)
            }
        }, 250)
    }

    async function handleAddParticipant(userId: number) {
        try {
            await addParticipant(conversation.id, userId)
            setQuery("")
            setResults([])
            await refreshDetail()
            await syncParent()
            toast.success("Participant added")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to add participant"))
        }
    }

    async function handleRemoveParticipant(userId: number) {
        setRemovingUserId(userId)
        try {
            await removeParticipant(conversation.id, userId)
            await refreshDetail()
            await syncParent()
            toast.success("Participant removed")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to remove participant"))
        } finally {
            setRemovingUserId(null)
        }
    }

    async function handleLeaveGroup() {
        try {
            if (onLeaveConversation) {
                await onLeaveConversation(conversation.id)
            } else {
                await leaveConversation(conversation.id)
            }
            onClose()
            toast.success("Left group")
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to leave group"))
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0 backdrop-blur-sm sm:items-center sm:px-4">
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[#1e2a35] bg-[#0d1117] shadow-2xl sm:rounded-2xl">
                <div className="flex items-center justify-between border-b border-[#1e2a35] px-4 py-4 sm:px-5">
                    <div>
                        <h2 className="text-[14px] font-bold text-[#c9d8e8] font-mono">Group Info</h2>
                        <p className="text-[11px] text-[#4a6070] font-mono">
                            Manage members, photo, and group details
                        </p>
                    </div>
                    <button onClick={onClose} className="text-[#4a6070] transition-colors hover:text-[#c9d8e8]">
                        ✕
                    </button>
                </div>

                {loading ? (
                    <div className="flex h-48 items-center justify-center gap-2 sm:h-64">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                        <span className="text-[12px] text-[#4a6070] font-mono">Loading group details…</span>
                    </div>
                ) : (
                    <div className="grid gap-4 overflow-y-auto px-4 py-4 sm:gap-6 sm:px-5 sm:py-5 md:grid-cols-[280px_minmax(0,1fr)]">
                        <div className="space-y-4">
                            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#1e2a35] bg-[#0a0e14] p-5">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt={convDisplayName(activeConversation)} className="h-32 w-32 rounded-full object-cover" />
                                ) : (
                                    <div className={`flex h-32 w-32 items-center justify-center rounded-full text-5xl font-bold ${getAvatarColor(convDisplayName(activeConversation))}`}>
                                        {getInitials(convDisplayName(activeConversation))}
                                    </div>
                                )}
                                <div className="text-center">
                                    <p className="text-[15px] font-semibold text-[#c9d8e8]">{convDisplayName(activeConversation)}</p>
                                    <p className="text-[11px] text-[#4a6070] font-mono">{members.length} members</p>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarUpload}
                                />
                                {isAdmin && (
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading}
                                            className="rounded-full border border-cyan-400/30 px-3 py-1 text-[11px] text-cyan-400 font-mono transition-colors hover:bg-cyan-400/10 disabled:opacity-50"
                                        >
                                            Change photo
                                        </button>
                                        {activeConversation.group_avatar_url && (
                                            <button
                                                type="button"
                                                onClick={handleRemoveGroupAvatar}
                                                disabled={uploading}
                                                className="rounded-full border border-[#ff4d6d]/30 px-3 py-1 text-[11px] text-[#ff4d6d] font-mono transition-colors hover:bg-[#ff4d6d]/10 disabled:opacity-50"
                                            >
                                                Remove photo
                                            </button>
                                        )}
                                    </div>
                                )}
                                {uploading && (
                                    <div className="w-full">
                                        <div className="h-1 overflow-hidden rounded-full bg-[#1e2a35]">
                                            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${uploadPct}%` }} />
                                        </div>
                                        <p className="mt-1 text-center text-[10px] text-cyan-400 font-mono">{uploadPct}%</p>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-[#1e2a35] bg-[#0a0e14] p-4">
                                <label className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#4a6070] font-mono">
                                    Group Name
                                </label>
                                <input
                                    type="text"
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    disabled={!isAdmin || savingName}
                                    className="w-full rounded-lg border border-[#1e2a35] bg-[#060a0e] px-3 py-2.5 text-[12px] text-[#c9d8e8] outline-none transition-colors focus:border-cyan-400/40 disabled:opacity-60"
                                />
                                {isAdmin ? (
                                    <button
                                        type="button"
                                        onClick={handleSaveName}
                                        disabled={savingName || !groupName.trim() || groupName.trim() === (activeConversation.group_name ?? "")}
                                        className="mt-3 w-full rounded-lg bg-cyan-400 px-3 py-2 text-[12px] font-bold uppercase tracking-[.12em] text-[#080c10] disabled:opacity-40"
                                    >
                                        {savingName ? "Saving…" : "Save Group"}
                                    </button>
                                ) : (
                                    <p className="mt-3 text-[11px] text-[#4a6070] font-mono">Only admins can update group info.</p>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleLeaveGroup}
                                className="w-full rounded-2xl border border-[#ff4d6d]/30 bg-[#ff4d6d]/10 px-4 py-3 text-[12px] font-mono text-[#ff4d6d] transition-colors hover:bg-[#ff4d6d]/15"
                            >
                                Leave Group
                            </button>
                        </div>

                        <div className="space-y-4">
                            {isAdmin && (
                                <div className="rounded-2xl border border-[#1e2a35] bg-[#0a0e14] p-4">
                                    <div className="mb-3">
                                        <h3 className="text-[12px] font-semibold text-[#c9d8e8] font-mono">Add Participants</h3>
                                        <p className="text-[10px] text-[#4a6070] font-mono">Search users and add them to this group.</p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={query}
                                            onChange={(e) => handleSearch(e.target.value)}
                                            placeholder="Search by name or email…"
                                            className="w-full rounded-lg border border-[#1e2a35] bg-[#060a0e] px-3 py-2.5 text-[12px] text-[#c9d8e8] outline-none transition-colors focus:border-cyan-400/40"
                                        />
                                        {searching && (
                                            <span className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border border-cyan-400 border-t-transparent" />
                                        )}
                                    </div>
                                    {results.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {results.map((result) => (
                                            <div key={result.id} className="flex items-center gap-3 rounded-lg border border-[#1e2a35] bg-[#0d1117] px-3 py-2">
                                                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ${getAvatarColor(result.full_name ?? result.email)}`}>
                                                        {getInitials(result.full_name ?? result.email)}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-[12px] text-[#c9d8e8]">{result.full_name ?? result.email}</p>
                                                        <p className="truncate text-[10px] text-[#4a6070] font-mono">{result.email}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddParticipant(result.id)}
                                                        className="rounded-full bg-cyan-400/10 px-3 py-1 text-[11px] text-cyan-400 font-mono hover:bg-cyan-400/20"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="rounded-2xl border border-[#1e2a35] bg-[#0a0e14] p-4">
                                <div className="mb-3">
                                    <h3 className="text-[12px] font-semibold text-[#c9d8e8] font-mono">Participants</h3>
                                    <p className="text-[10px] text-[#4a6070] font-mono">Members currently in the group.</p>
                                </div>
                                <div className="space-y-2">
                                    {members.map((member) => {
                                        const canRemove = isAdmin && member.id !== currentUser?.id
                                        const isCurrentUser = member.id === currentUser?.id
                                        const memberAvatarUrl = !brokenMemberAvatarIds.includes(member.id)
                                            ? validAvatar(member.avatar_url)
                                            : null
                                        return (
                                            <div key={member.id} className="flex items-start gap-3 rounded-lg border border-[#1e2a35] bg-[#0d1117] px-3 py-2.5 sm:items-center">
                                                {memberAvatarUrl ? (
                                                    <img
                                                        src={memberAvatarUrl}
                                                        alt={member.full_name ?? member.email}
                                                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                                                        onError={() => {
                                                            setBrokenMemberAvatarIds((prev) =>
                                                                prev.includes(member.id) ? prev : [...prev, member.id]
                                                            )
                                                        }}
                                                    />
                                                ) : (
                                                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${getAvatarColor(member.full_name ?? member.email)}`}>
                                                        {getInitials(member.full_name ?? member.email)}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="truncate text-[12px] text-[#c9d8e8]">
                                                            {member.full_name ?? member.email} {isCurrentUser ? "(You)" : ""}
                                                        </p>
                                                        {member.is_admin && (
                                                            <span className="rounded-full border border-amber-400/30 px-1.5 py-0.5 text-[9px] uppercase tracking-[.12em] text-amber-300 font-mono">
                                                                admin
                                                            </span>
                                                        )}
                                                        {member.id === activeConversation.created_by && (
                                                            <span className="rounded-full border border-cyan-400/30 px-1.5 py-0.5 text-[9px] uppercase tracking-[.12em] text-cyan-400 font-mono">
                                                                creator
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="truncate text-[10px] text-[#4a6070] font-mono">{member.email}</p>
                                                </div>
                                                {canRemove && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveParticipant(member.id)}
                                                        disabled={removingUserId === member.id}
                                                        className="self-start rounded-full border border-[#ff4d6d]/30 px-3 py-1 text-[11px] text-[#ff4d6d] font-mono hover:bg-[#ff4d6d]/10 disabled:opacity-50"
                                                    >
                                                        {removingUserId === member.id ? "Removing…" : "Remove"}
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
