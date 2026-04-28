"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { login, getErrorMessage } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import { AuthBackground } from "@/components/ui/AuthBackground";

function LoginContent() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPw, setShowPw] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
    const [mounted, setMounted] = useState(false);
    const [typed, setTyped] = useState("");
    const [cursor, setCursor] = useState(true);

    const emailRef = useRef<HTMLInputElement>(null);
    const handledToastKeyRef = useRef<string | null>(null);
    const { login: authLogin } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const HEADER = "authenticate()";

    useEffect(() => {
        setMounted(true);
        emailRef.current?.focus();
        router.prefetch("/auth-loading");
    }, [router]);

    useEffect(() => {
        if (!mounted) return;
        let i = 0;
        const t = setInterval(() => {
            setTyped(HEADER.slice(0, ++i));
            if (i >= HEADER.length) clearInterval(t);
        }, 60);
        return () => clearInterval(t);
    }, [mounted]);

    useEffect(() => {
        const t = setInterval(() => setCursor((c) => !c), 530);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const verification = searchParams.get("verification");
        const verified = searchParams.get("verified");
        const reset = searchParams.get("reset");
        const toastKey = verification
            ? `verification:${verification}`
            : verified
              ? `verified:${verified}`
              : reset
                ? `reset:${reset}`
                : null;

        if (!toastKey) return;
        if (handledToastKeyRef.current === toastKey) return;
        handledToastKeyRef.current = toastKey;

        if (verification === "sent") {
            toast.success("Check your inbox and verify your email before logging in.");
        } else if (verified === "1") {
            toast.success("Email verified. You can sign in now.");
        } else if (verified === "already") {
            toast("Email already verified. You can sign in.", { icon: "i" });
        } else if (verified === "invalid") {
            toast.error("That verification link is invalid or expired.");
        } else if (reset === "success") {
            toast.success("Password reset complete. You can sign in now.");
        }

        if (typeof window !== "undefined") {
            const next = new URL(window.location.href);
            next.searchParams.delete("verification");
            next.searchParams.delete("verified");
            next.searchParams.delete("reset");
            window.history.replaceState({}, "", next.toString());
        }
    }, [searchParams]);

    function validate() {
        const e: typeof errors = {};
        if (!email.trim()) e.email = "Email is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Invalid email address";
        if (!password) e.password = "Password is required";
        setErrors(e);
        return !Object.keys(e).length;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        try {
            const data = await login(email, password);
            authLogin(data.access_token);
            router.push("/auth-loading");

        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Invalid email or password"));
        } finally {
            setLoading(false);
        }
    }

    const clearErr = (f: keyof typeof errors) => setErrors((p) => ({ ...p, [f]: undefined }));

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080c10] px-4 py-6 sm:min-h-screen sm:py-10">
            <AuthBackground />

            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,156,255,.08),transparent_28%),linear-gradient(180deg,transparent_0%,rgba(0,0,0,.18)_100%)]" />

            {/* Card */}
            <div
                className={`relative z-10 w-full max-w-[440px] overflow-hidden rounded-md border border-[#1e2a35] bg-[#0d1117]
          transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
            >
                {/* Window bar */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e2a35] bg-[#0a0e14]">
                    <span className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
                    <span className="w-[11px] h-[11px] rounded-full bg-[#febc2e]" />
                    <span className="w-[11px] h-[11px] rounded-full bg-[#28c840]" />
                    <span className="mx-auto text-[11px] text-[#4a6070] tracking-widest font-mono">
                        Welcome to TalkFlow
                    </span>
                </div>

                {/* Body */}
                <div className="px-5 py-6 sm:px-10 sm:py-9">

                    {/* Logo */}
                    <div className="mb-8 flex items-center gap-5">
                        <div className="grid h-[100px] w-[100px] shrink-0 place-items-center rounded-[30px] border border-cyan-300/15 bg-[#0a1520] p-3 shadow-[0_0_32px_rgba(0,204,255,.1)]">
                            <div className="grid h-full w-full place-items-center rounded-[22px] bg-white/98 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,.35)]">
                                <Image
                                    src="/android-chrome-192x192.png"
                                    alt="TalkFlow"
                                    unoptimized
                                    width={120}
                                    height={120}
                                    priority
                                    className="block h-auto w-auto object-contain object-center"
                                />
                            </div>
                        </div>
                        <div className="flex min-w-0 flex-col">
                            <span className="font-bold text-cyan-400 text-[15px] tracking-[.24em] uppercase font-sans">
                                TalkFlow
                            </span>
                            <span className="mt-2 font-mono text-[11px] uppercase tracking-[0.38em] text-[#6f8aa1]">
                                Connect & chat
                            </span>
                        </div>
                    </div>

                    {/* Heading */}
                    <div className="mb-1 min-h-7 font-mono text-lg font-bold text-white sm:text-xl">
                        <span className="text-[#5a7080]">$ </span>
                        {typed}
                        <span className={`text-cyan-400 transition-opacity duration-100 ${cursor ? "opacity-100" : "opacity-0"}`}>
                            ▌
                        </span>
                    </div>
                    <p className="text-[11.5px] text-[#5a7080] font-mono mb-7">
                        Welcome back. Pick up where you left off.
                    </p>

                    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

                        {/* Email */}
                        <div
                            className="flex flex-col gap-1.5 opacity-0"
                            style={{ animation: "slideIn .35s .2s ease forwards" }}
                        >
                            <label htmlFor="email" className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070] font-mono">
                                <span className="text-cyan-400 mr-1">01</span>Email
                            </label>
                            <input
                                ref={emailRef}
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); clearErr("email"); }}
                                disabled={loading}
                                spellCheck={false}
                                className={`w-full bg-[#060a0e] border rounded px-3.5 py-3 font-mono text-[13px] text-[#c9d8e8]
                  placeholder-[#364a58] outline-none transition-all caret-cyan-400 disabled:opacity-50
                  ${errors.email
                                        ? "border-[#ff4d6d] focus:shadow-[0_0_0_3px_rgba(255,77,109,.12)]"
                                        : "border-[#1e2a35] focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,204,255,.1)]"
                                    }`}
                            />
                            {errors.email && (
                                <span className="text-[11px] text-[#ff4d6d] font-mono">✕ {errors.email}</span>
                            )}
                        </div>

                        {/* Password */}
                        <div
                            className="flex flex-col gap-1.5 opacity-0"
                            style={{ animation: "slideIn .35s .32s ease forwards" }}
                        >
                            <div className="flex items-center justify-between">
                                <label htmlFor="password" className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070] font-mono">
                                    <span className="text-cyan-400 mr-1">02</span>Password
                                </label>
                                <Link
                                    href="/forgot-password"
                                    className="text-[10px] text-cyan-400 font-mono opacity-70 hover:opacity-100 hover:underline transition-opacity"
                                >
                                    forgot?
                                </Link>
                            </div>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPw ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); clearErr("password"); }}
                                    disabled={loading}
                                    className={`w-full bg-[#060a0e] border rounded px-3.5 py-3 pr-11 font-mono text-[13px] text-[#c9d8e8]
                    placeholder-[#364a58] outline-none transition-all caret-cyan-400 disabled:opacity-50
                    ${errors.password
                                            ? "border-[#ff4d6d] focus:shadow-[0_0_0_3px_rgba(255,77,109,.12)]"
                                            : "border-[#1e2a35] focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,204,255,.1)]"
                                        }`}
                                />
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => setShowPw((v) => !v)}
                                    className="absolute right-0 inset-y-0 w-11 flex items-center justify-center text-[#4a6070] hover:text-cyan-400 transition-colors font-mono text-sm"
                                >
                                    {showPw ? "○" : "●"}
                                </button>
                            </div>
                            {errors.password && (
                                <span className="text-[11px] text-[#ff4d6d] font-mono">✕ {errors.password}</span>
                            )}
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="relative w-full mt-1 py-3 bg-cyan-400 rounded font-mono text-[13px] font-bold tracking-widest
                uppercase text-[#080c10] overflow-hidden transition-all duration-200 opacity-0
                hover:shadow-[0_0_24px_rgba(0,204,255,.4)] hover:-translate-y-px active:translate-y-0
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                            style={{ animation: "fadeUp .35s .44s ease forwards" }}
                        >
                            {/* shimmer */}
                            <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-500 pointer-events-none" />
                            {loading ? (
                                <span className="flex items-center justify-center font-mono text-[11px] tracking-[0.18em]">
                                    Verifying access...
                                </span>
                            ) : (
                                "Sign In →"
                            )}
                        </button>
                    </form>

                    <p
                        className="mt-6 text-center text-[12px] text-[#4a6070] font-mono opacity-0"
                        style={{ animation: "fadeUp .35s .54s ease forwards" }}
                    >
                        No account?{" "}
                        <Link href="/register" className="text-cyan-400 hover:underline">
                            Create one
                        </Link>
                    </p>
                </div>
            </div>

            <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateX(-6px) } to { opacity:1; transform:translateX(0) } }
        @keyframes fadeUp  { from { opacity:0 } to   { opacity:1 } }
      `}</style>
        </div>
    );
}

export default function Login() {
    return (
        <Suspense fallback={<main className="min-h-screen bg-[#071018]" />}>
            <LoginContent />
        </Suspense>
    );
}
