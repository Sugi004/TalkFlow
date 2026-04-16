"use client"

import { useState, useEffect, useRef, ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/AuthContext"
import { getMe, updateMe } from "@/lib/users"
import { User } from "@/types/index"
import toast from "react-hot-toast"
import { AVATAR_PALETTES, getAvatarColor, getInitials } from "@/lib/utils"
import { uploadFile } from "@/lib/uploads"

function formatDate(iso?: string) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    })
}

export default function ProfilePage() {
    const router = useRouter()
    const { isAuthenticated, logout, refreshUser } = useAuth()

    const [user, setUser] = useState<User | null>(null)
    const [fullName, setFullName] = useState("")
    const [uploading, setUploading] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploadPct, setUploadPct] = useState(0)
    const [mounted, setMounted] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setMounted(true)
        if (!isAuthenticated) { router.push("/login"); return }
        getMe()
            .then((u) => {
                setUser(u)
                setFullName(u.full_name ?? "")
            })
            .catch(() => {
                logout()
                router.push("/login")
                toast.error("Failed to load profile")
            })
            .finally(() => {
                setLoading(false)
            })
    }, [isAuthenticated])

    async function handleSave() {
        if (!user) return;
        setSaving(true)
        try {
            const updated = await updateMe({ full_name: fullName.trim() || undefined })
            setUser(updated)
            toast.success("Profile updated")
        } catch (e: any) {
            console.log(e.response)

            toast.error("Failed to save");
        } finally {
            setSaving(false)
        }
    }

    async function handleAvatarUpload(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return;
        if (!file.type.startsWith("image/")) { toast.error("Please upload an image"); return; }
        if (file.size > 1024 * 1024 * 5) { toast.error("Image size must be less than 5MB"); return; }
        setUploading(true)
        setUploadPct(0)
        try {

            const url = await uploadFile(file, setUploadPct)
            const updated = await updateMe({ avatar_url: url })
            refreshUser()
            setUser(updated)
            toast.success("Profile picture updated")
            console.log(url)
        } catch (e: any) {
            console.log(e.response)
            toast.error("Failed to upload avatar");
        } finally {
            setUploading(false)
            setUploadPct(0)
            e.target.value = ""
        }
    }

    function handleSignOut() {
        logout()
        router.push("/login")
    }

    const name = user?.full_name ?? user?.email ?? ""

    return (
        <>
            <div className="min-h-screen bg-[#080c10] flex items-center justify-center px-4 py-10 relative overflow-hidden font-mono">
                {/* Grid */}
                <div
                    className="fixed inset-0 pointer-events-none"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(0,204,255,.033) 1px,transparent 1px),linear-gradient(90deg,rgba(0,204,255,.033) 1px,transparent 1px)",
                        backgroundSize: "40px 40px",
                    }}
                />
                {/* Glows */}
                <div className="fixed -top-40 -left-40 w-[480px] h-[480px] rounded-full pointer-events-none"
                    style={{ background: "radial-gradient(circle,rgba(0,204,255,.1) 0%,transparent 70%)" }} />
                <div className="fixed -bottom-48 -right-48 w-[560px] h-[560px] rounded-full pointer-events-none"
                    style={{ background: "radial-gradient(circle,rgba(0,255,157,.07) 0%,transparent 70%)" }} />
                {/* Card */}
                <div
                    className={`relative z-10 w-full max-w-[460px] bg-[#0d1117] border border-[#1e2a35] rounded-md overflow-hidden
          transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
                >
                    {/* Window bar */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e2a35] bg-[#0a0e14]">
                        <span className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
                        <span className="w-[11px] h-[11px] rounded-full bg-[#febc2e]" />
                        <span className="w-[11px] h-[11px] rounded-full bg-[#28c840]" />
                        <span className="mx-auto text-[11px] text-[#4a6070] tracking-widest font-mono">
                            Profile
                        </span>
                    </div>

                    <div className="px-9 py-8">

                        {/* Nav */}
                        <div className="flex items-center justify-between mb-7">
                            <Link href="/chat" className="flex items-center gap-1.5 text-[11px] text-[#4a6070] hover:text-cyan-400 transition-colors font-mono">
                                ← Back to chat
                            </Link>
                            <button
                                onClick={handleSignOut}
                                className="flex items-center gap-1.5 text-[11px] text-[#4a6070] hover:text-[#ff4d6d] transition-colors"
                            >
                                ⏻ Sign out
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center h-40 gap-2">
                                <span className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-[12px] text-[#4a6070]">Loading…</span>
                            </div>
                        ) : user ? (
                            <>
                                {/* Avatar section */}
                                <div className="flex flex-col items-center gap-3 mb-8">
                                    <div className="relative group">
                                        {user.avatar_url ? (
                                            <img
                                                key={user.avatar_url}
                                                src={user.avatar_url}
                                                alt={name}
                                                className="w-20 h-20 rounded-lg object-cover border-2 border-[#1e2a35]"
                                            />
                                        ) : (
                                            <div className={`w-20 h-20 rounded-lg flex items-center justify-center text-2xl font-bold ${getAvatarColor(name)}`}>
                                                {getInitials(name)}
                                            </div>
                                        )}

                                        {/* Upload overlay */}
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading}
                                            className="absolute inset-0 flex items-center justify-center bg-[#080c10]/70 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400 text-xs font-mono disabled:cursor-not-allowed"
                                        >
                                            {uploading ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="w-4 h-4 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                                    <span>{uploadPct}%</span>
                                                </div>
                                            ) : (
                                                <span>edit</span>
                                            )}
                                        </button>
                                    </div>
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

                                    {/* Upload progress bar */}
                                    {uploading && (
                                        <div className="w-24 h-[2px] bg-[#1e2a35] rounded-full overflow-hidden">
                                            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${uploadPct}%` }} />
                                        </div>
                                    )}

                                    <p className="text-[11px] text-[#3a4a55] font-mono">Click avatar to change photo</p>
                                </div>

                                {/* Form */}
                                <div className="space-y-5">

                                    {/* Full name */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070]">
                                            <span className="text-cyan-400 mr-1">01</span>Display Name
                                        </label>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Your full name"
                                            className="w-full bg-[#060a0e] border border-[#1e2a35] rounded px-3.5 py-3 font-mono text-[13px] text-[#c9d8e8] placeholder-[#364a58] outline-none transition-all caret-cyan-400 focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,204,255,.1)]"
                                        />
                                    </div>

                                    {/* Email (read-only) */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070]">
                                            <span className="text-cyan-400 mr-1">02</span>Email
                                        </label>
                                        <div className="flex items-center gap-2 bg-[#060a0e] border border-[#1e2a35] rounded px-3.5 py-3">
                                            <span className="flex-1 text-[13px] text-[#5a7080] font-mono truncate">{user.email}</span>
                                            <span className="text-[9px] text-[#3a4a55] font-mono border border-[#1e2a35] px-1.5 py-0.5 rounded">readonly</span>
                                        </div>
                                    </div>

                                    {/* Member since */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070]">
                                            <span className="text-cyan-400 mr-1">03</span>Member Since
                                        </label>
                                        <div className="bg-[#060a0e] border border-[#1e2a35] rounded px-3.5 py-3 text-[13px] text-[#5a7080] font-mono">
                                            {formatDate((user as any).created_at)}
                                        </div>
                                    </div>

                                    {/* Save button */}
                                    <button
                                        onClick={handleSave}
                                        disabled={saving || fullName.trim() === (user.full_name ?? "")}
                                        className="relative w-full mt-2 py-3 bg-cyan-400 rounded font-mono text-[13px] font-bold tracking-widest uppercase text-[#080c10] overflow-hidden
                    transition-all duration-200 hover:shadow-[0_0_24px_rgba(0,204,255,.4)] hover:-translate-y-px active:translate-y-0
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                    >
                                        <span className="absolute inset-0 bg-linear-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-500 pointer-events-none" />
                                        {saving ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <span className="w-3.5 h-3.5 border-2 border-[#080c10]/30 border-t-[#080c10] rounded-full animate-spin" />
                                                Saving…
                                            </span>
                                        ) : "Save Changes →"}
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>

        </>
    )
}
