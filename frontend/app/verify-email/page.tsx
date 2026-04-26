"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { AuthBackground } from "@/components/ui/AuthBackground";
import { resendVerificationEmail, getErrorMessage } from "@/lib/auth";

function VerifyEmailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get("email") ?? "";
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!email) {
            router.replace("/register");
        }
    }, [email, router]);

    async function handleResend() {
        if (!email) return;
        setSending(true);
        try {
            const data = await resendVerificationEmail(email);
            toast.success(data.message);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to resend verification email."));
        } finally {
            setSending(false);
        }
    }

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080c10] px-4 py-8">
            <AuthBackground />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,156,255,.08),transparent_28%),linear-gradient(180deg,transparent_0%,rgba(0,0,0,.18)_100%)]" />

            <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl border border-[#1e2a35] bg-[#0d1117]/95 shadow-[0_0_50px_rgba(0,0,0,.28)] backdrop-blur-sm">
                <div className="flex items-center gap-2 border-b border-[#1e2a35] bg-[#0a0e14] px-5 py-4">
                    <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
                    <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
                    <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
                    <span className="mx-auto font-mono text-[11px] tracking-[0.18em] text-[#4a6070]">
                        verify-email
                    </span>
                </div>

                <div className="px-6 py-8 sm:px-10 sm:py-10">
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">
                        Verification Pending
                    </p>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                        Check your inbox
                    </h1>
                    <p className="mt-4 font-mono text-[13px] leading-7 text-[#92a9bb]">
                        We sent a verification link to{" "}
                        <span className="font-semibold text-cyan-300">{email || "your email"}</span>.
                        Open that link to verify your account. Once verified, you’ll land on a confirmation page and be taken to login automatically.
                    </p>

                    <div className="mt-8 rounded-2xl border border-cyan-300/10 bg-[#09131b] p-5">
                        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#6b8497]">
                            Didn’t receive it?
                        </p>
                        <p className="mt-2 font-mono text-[12px] leading-6 text-[#92a9bb]">
                            Check spam or promotions first. If it still hasn’t arrived, send another verification email.
                        </p>
                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={sending || !email}
                                className="rounded-xl bg-cyan-400 px-4 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-[#071018] transition hover:shadow-[0_0_24px_rgba(0,204,255,.28)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {sending ? "Sending..." : "Resend Email"}
                            </button>
                            <Link
                                href="/login"
                                className="rounded-xl border border-[#243241] px-4 py-3 text-center font-mono text-[12px] uppercase tracking-[0.18em] text-[#9cb3c4] transition hover:border-cyan-300/30 hover:text-cyan-300"
                            >
                                Back To Login
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={<main className="min-h-screen bg-[#071018]" />}>
            <VerifyEmailContent />
        </Suspense>
    );
}
