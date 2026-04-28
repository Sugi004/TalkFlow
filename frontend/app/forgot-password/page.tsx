"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AuthBackground } from "@/components/ui/AuthBackground";
import { forgotPassword, getErrorMessage } from "@/lib/auth";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (!email.trim()) {
            setError("Email is required");
            return;
        }

        setLoading(true);
        try {
            const response = await forgotPassword(email.trim());
            setSent(true);
            toast.success(response.message);
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to send password reset email"));
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
                        Reset Access
                    </span>
                </div>

                <div className="space-y-5 px-6 py-7 sm:px-8 sm:py-9">
                    <div>
                        <p className="text-[10px] font-mono uppercase tracking-[.16em] text-cyan-400">
                            Password Recovery
                        </p>
                        <h1 className="mt-2 text-[28px] font-bold text-[#f3f7fb]">
                            Forgot your password?
                        </h1>
                        <p className="mt-3 text-[13px] leading-6 text-[#7f95a8]">
                            Enter your registered email address and we’ll send you a reset link.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-medium uppercase tracking-[.12em] text-[#4a6070] font-mono">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setError("");
                                }}
                                disabled={loading || sent}
                                placeholder="you@example.com"
                                className="w-full rounded-xl border border-[#1e2a35] bg-[#060a0e] px-4 py-3 font-mono text-[13px] text-[#c9d8e8] outline-none transition-all caret-cyan-400 focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,204,255,.1)]"
                            />
                            {error && <p className="text-[11px] font-mono text-[#ff4d6d]">✕ {error}</p>}
                            {!error && sent && (
                                <p className="text-[11px] font-mono text-[#00ff9d]">
                                    ✓ Check your inbox for the reset link.
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || sent}
                            className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-mono text-[13px] font-bold uppercase tracking-[.14em] text-[#071018] transition hover:shadow-[0_0_24px_rgba(0,204,255,.4)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? "Sending…" : sent ? "Email Sent" : "Send Reset Link"}
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
