"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthBackground } from "@/components/ui/AuthBackground";

const STATUS_COPY: Record<string, { eyebrow: string; title: string; detail: string }> = {
    success: {
        eyebrow: "Verification Complete",
        title: "Email verified",
        detail: "Your account is now active. We’re sending you to the login page so you can sign in.",
    },
    already: {
        eyebrow: "Already Verified",
        title: "This email is already verified",
        detail: "Your account is already active. We’re sending you to login now.",
    },
    invalid: {
        eyebrow: "Verification Failed",
        title: "That link is invalid or expired",
        detail: "Request a fresh verification email from the verification screen, then try again.",
    },
};

function EmailVerifiedContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const status = searchParams.get("status") ?? "success";
    const copy = STATUS_COPY[status] ?? STATUS_COPY.invalid;

    useEffect(() => {
        if (status === "invalid") return;
        const timer = window.setTimeout(() => {
            router.replace("/login");
        }, 2200);
        return () => window.clearTimeout(timer);
    }, [router, status]);

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
                        email-verified
                    </span>
                </div>

                <div className="px-6 py-8 text-center sm:px-10 sm:py-10">
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">
                        {copy.eyebrow}
                    </p>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                        {copy.title}
                    </h1>
                    <p className="mx-auto mt-4 max-w-md font-mono text-[13px] leading-7 text-[#92a9bb]">
                        {copy.detail}
                    </p>

                    {status === "invalid" ? (
                        <div className="mt-8">
                            <Link
                                href="/register"
                                className="inline-flex rounded-xl bg-cyan-400 px-4 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-[#071018] transition hover:shadow-[0_0_24px_rgba(0,204,255,.28)]"
                            >
                                Register Again
                            </Link>
                        </div>
                    ) : (
                        <div className="mt-8 flex items-center justify-center gap-3">
                            <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 animate-[auth-dot_1.2s_ease-in-out_infinite]" />
                            <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 animate-[auth-dot_1.2s_ease-in-out_infinite] [animation-delay:.2s]" />
                            <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 animate-[auth-dot_1.2s_ease-in-out_infinite] [animation-delay:.4s]" />
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}

export default function EmailVerifiedPage() {
    return (
        <Suspense fallback={<main className="min-h-screen bg-[#071018]" />}>
            <EmailVerifiedContent />
        </Suspense>
    );
}
