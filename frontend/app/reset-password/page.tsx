"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthBackground } from "@/components/ui/AuthBackground";
import { getErrorMessage, resetPassword } from "@/lib/auth";

function getStrength(pw: string): { score: number; label: string; color: string; bar: string } {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    const map = [
        { label: "", color: "text-[#ff4444]", bar: "bg-[#ff4444]" },
        { label: "WEAK", color: "text-[#ff4444]", bar: "bg-[#ff4444]" },
        { label: "FAIR", color: "text-[#ffaa00]", bar: "bg-[#ffaa00]" },
        { label: "GOOD", color: "text-cyan-400", bar: "bg-cyan-400" },
        { label: "STRONG", color: "text-[#00ff9d]", bar: "bg-[#00ff9d]" },
        { label: "STRONG", color: "text-[#00ff9d]", bar: "bg-[#00ff9d]" },
    ];
    return { score: s, ...map[s] };
}

function ResetPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token") ?? "";
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const strength = getStrength(password);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (!token) {
            setError("This password reset link is invalid or missing its token.");
            return;
        }
        if (!password) {
            setError("Password is required");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            await resetPassword(token, password);
            router.push("/login?reset=success");
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to reset password"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080c10] px-4 py-8">
            <AuthBackground />
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-[#1e2a35] bg-[#0d1117] shadow-2xl">
                <div className="flex items-center gap-2 border-b border-[#1e2a35] bg-[#0a0e14] px-4 py-3">
                    <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
                    <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
                    <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
                    <span className="mx-auto text-[11px] font-mono tracking-widest text-[#4a6070]">
                        New Password
                    </span>
                </div>

                <div className="space-y-5 px-6 py-7 sm:px-8 sm:py-9">
                    <div>
                        <p className="text-[10px] font-mono uppercase tracking-[.16em] text-cyan-400">
                            Password Reset
                        </p>
                        <h1 className="mt-2 text-[28px] font-bold text-[#f3f7fb]">
                            Choose a new password
                        </h1>
                        <p className="mt-3 text-[13px] leading-6 text-[#7f95a8]">
                            Set a strong new password for your TalkFlow account.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-medium uppercase tracking-[.12em] text-[#4a6070] font-mono">
                                New Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError("");
                                }}
                                disabled={loading}
                                placeholder="min. 8 characters"
                                className="w-full rounded-xl border border-[#1e2a35] bg-[#060a0e] px-4 py-3 font-mono text-[13px] text-[#c9d8e8] outline-none transition-all caret-cyan-400 focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,204,255,.1)]"
                            />
                        </div>

                        <div className="overflow-hidden rounded-full bg-[#111922]">
                            <div className={`h-1.5 ${strength.bar} transition-all duration-300`} style={{ width: `${(strength.score / 5) * 100}%` }} />
                        </div>
                        <p className={`text-[10px] font-mono ${strength.color}`}>{strength.label}</p>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-medium uppercase tracking-[.12em] text-[#4a6070] font-mono">
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                value={confirm}
                                onChange={(e) => {
                                    setConfirm(e.target.value);
                                    setError("");
                                }}
                                disabled={loading}
                                placeholder="retype password"
                                className="w-full rounded-xl border border-[#1e2a35] bg-[#060a0e] px-4 py-3 font-mono text-[13px] text-[#c9d8e8] outline-none transition-all caret-cyan-400 focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,204,255,.1)]"
                            />
                        </div>

                        {error && <p className="text-[11px] font-mono text-[#ff4d6d]">✕ {error}</p>}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-mono text-[13px] font-bold uppercase tracking-[.14em] text-[#071018] transition hover:shadow-[0_0_24px_rgba(0,204,255,.4)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? "Resetting…" : "Reset Password"}
                        </button>
                    </form>

                    <Link
                        href="/login"
                        className="inline-flex text-[12px] font-mono text-cyan-400 transition hover:underline"
                    >
                        ← Back to login
                    </Link>
                </div>
            </div>
        </main>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<main className="min-h-screen bg-[#071018]" />}>
            <ResetPasswordContent />
        </Suspense>
    );
}
