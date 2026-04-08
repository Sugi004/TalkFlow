"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface FormState {
    username: string;
    email: string;
    password: string;
    confirm: string;
}
interface FieldErrors {
    username?: string;
    email?: string;
    password?: string;
    confirm?: string;
    general?: string;
}

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

export default function Register() {
    const [form, setForm] = useState<FormState>({ username: "", email: "", password: "", confirm: "" });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [loading, setLoading] = useState(false);
    const [showPw, setShowPw] = useState(false);
    const [showCf, setShowCf] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [typed, setTyped] = useState("");
    const [cursor, setCursor] = useState(true);

    const usernameRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const HEADER = "create_account()";
    const strength = getStrength(form.password);

    useEffect(() => { setMounted(true); usernameRef.current?.focus(); }, []);

    useEffect(() => {
        if (!mounted) return;
        let i = 0;
        const t = setInterval(() => {
            setTyped(HEADER.slice(0, ++i));
            if (i >= HEADER.length) clearInterval(t);
        }, 55);
        return () => clearInterval(t);
    }, [mounted]);

    useEffect(() => {
        const t = setInterval(() => setCursor((c) => !c), 530);
        return () => clearInterval(t);
    }, []);

    function set(k: keyof FormState) {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            setForm((f) => ({ ...f, [k]: e.target.value }));
            setErrors((er) => ({ ...er, [k]: undefined, general: undefined }));
        };
    }

    function validate(): boolean {
        const e: FieldErrors = {};
        if (!form.username.trim()) e.username = "Username is required";
        else if (form.username.length < 3) e.username = "Min 3 characters";
        else if (!/^[a-zA-Z0-9_]+$/.test(form.username)) e.username = "Letters, numbers, underscores only";

        if (!form.email.trim()) e.email = "Email is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email address";

        if (!form.password) e.password = "Password is required";
        else if (form.password.length < 8) e.password = "Min 8 characters";

        if (!form.confirm) e.confirm = "Please confirm your password";
        else if (form.password !== form.confirm) e.confirm = "Passwords do not match";

        setErrors(e);
        return !Object.keys(e).length;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        setErrors({});
        try {
            const res = await fetch(process.env.NEXT_PUBLIC_API_URL + "/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name: form.username.trim(), email: form.email.trim(), password: form.password }),
            });
            const data = await res.json();
            if (!res.ok) { setErrors({ general: data.detail ?? "Registration failed." }); return; }
            if (data.access_token) {
                localStorage.setItem("access_token", data.access_token);
                router.push("/login");
            } else {
                router.push("/login?registered=1");
            }
        } catch {
            setErrors({ general: "Cannot reach server. Is the backend running?" });
        } finally {
            setLoading(false);
        }
    }

    const inputBase = "w-full bg-[#060a0e] border rounded px-3.5 py-3 font-mono text-[13px] text-[#c9d8e8] placeholder-[#364a58] outline-none transition-all caret-cyan-400 disabled:opacity-50";
    const inputOk = "border-[#1e2a35] focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(0,204,255,.1)]";
    const inputErr = "border-[#ff4d6d] focus:shadow-[0_0_0_3px_rgba(255,77,109,.12)]";

    return (
        <div className="min-h-screen bg-[#080c10] flex items-center justify-center px-4 py-10 relative overflow-hidden">

            {/* Grid */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(0,204,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(0,204,255,.035) 1px,transparent 1px)",
                    backgroundSize: "40px 40px",
                }}
            />
            {/* Glows */}
            <div className="fixed -top-40 -left-40 w-[480px] h-[480px] rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle,rgba(0,204,255,.13) 0%,transparent 70%)" }} />
            <div className="fixed -bottom-48 -right-48 w-[560px] h-[560px] rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle,rgba(0,255,157,.09) 0%,transparent 70%)" }} />

            {/* Card */}
            <div
                className={`relative z-10 w-full max-w-[480px] bg-[#0d1117] border border-[#1e2a35] rounded-md overflow-hidden
          transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
            >
                {/* Window bar */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e2a35] bg-[#0a0e14]">
                    <span className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
                    <span className="w-[11px] h-[11px] rounded-full bg-[#febc2e]" />
                    <span className="w-[11px] h-[11px] rounded-full bg-[#28c840]" />
                    <span className="mx-auto text-[11px] text-[#4a6070] tracking-widest font-mono">
                        devchat — register.tsx
                    </span>
                </div>

                {/* Body */}
                <div className="px-10 py-9">

                    {/* Logo */}
                    <div className="flex items-center gap-2 mb-5">
                        <span className="w-6 h-6 bg-cyan-400 rounded flex items-center justify-center text-[11px] font-bold text-[#080c10]">D</span>
                        <span className="font-bold text-cyan-400 text-xs tracking-[.15em] uppercase font-sans">DevChat</span>
                    </div>

                    {/* Heading */}
                    <div className="font-mono text-xl font-bold text-white mb-1 min-h-7">
                        <span className="text-[#5a7080]">$ </span>
                        {typed}
                        <span className={`text-cyan-400 transition-opacity duration-100 ${cursor ? "opacity-100" : "opacity-0"}`}>▌</span>
                    </div>
                    <p className="text-[11.5px] text-[#5a7080] font-mono mb-7">
                        Join the network. Start building, shipping, shipping.
                    </p>

                    {/* General error */}
                    {errors.general && (
                        <div className="mb-5 flex items-start gap-2 bg-[#ff4d6d]/8 border border-[#ff4d6d]/25 rounded px-3.5 py-2.5 text-[12px] text-[#ff4d6d] font-mono">
                            <span className="mt-px">⚠</span>
                            {errors.general}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

                        {/* Username */}
                        <div className="flex flex-col gap-1.5 opacity-0" style={{ animation: "slideIn .35s .2s ease forwards" }}>
                            <label htmlFor="username" className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070] font-mono">
                                <span className="text-cyan-400 mr-1">01</span>Username
                            </label>
                            <input
                                ref={usernameRef}
                                id="username"
                                type="text"
                                autoComplete="username"
                                placeholder="your_handle"
                                value={form.username}
                                onChange={set("username")}
                                disabled={loading}
                                spellCheck={false}
                                className={`${inputBase} ${errors.username ? inputErr : inputOk}`}
                            />
                            {errors.username && <span className="text-[11px] text-[#ff4d6d] font-mono">✕ {errors.username}</span>}
                        </div>

                        {/* Email */}
                        <div className="flex flex-col gap-1.5 opacity-0" style={{ animation: "slideIn .35s .3s ease forwards" }}>
                            <label htmlFor="email" className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070] font-mono">
                                <span className="text-cyan-400 mr-1">02</span>Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                value={form.email}
                                onChange={set("email")}
                                disabled={loading}
                                spellCheck={false}
                                className={`${inputBase} ${errors.email ? inputErr : inputOk}`}
                            />
                            {errors.email && <span className="text-[11px] text-[#ff4d6d] font-mono">✕ {errors.email}</span>}
                        </div>

                        {/* Password */}
                        <div className="flex flex-col gap-1.5 opacity-0" style={{ animation: "slideIn .35s .4s ease forwards" }}>
                            <label htmlFor="password" className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070] font-mono">
                                <span className="text-cyan-400 mr-1">03</span>Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPw ? "text" : "password"}
                                    autoComplete="new-password"
                                    placeholder="min. 8 characters"
                                    value={form.password}
                                    onChange={set("password")}
                                    disabled={loading}
                                    className={`${inputBase} pr-11 ${errors.password ? inputErr : inputOk}`}
                                />
                                <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)}
                                    className="absolute right-0 inset-y-0 w-11 flex items-center justify-center text-[#4a6070] hover:text-cyan-400 transition-colors font-mono text-sm">
                                    {showPw ? "○" : "●"}
                                </button>
                            </div>
                            {errors.password && <span className="text-[11px] text-[#ff4d6d] font-mono">✕ {errors.password}</span>}
                            {/* Strength meter */}
                            {form.password.length > 0 && !errors.password && (
                                <div className="flex flex-col gap-1.5 mt-0.5">
                                    <div className="h-[3px] bg-[#1e2a35] rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${strength.bar}`}
                                            style={{ width: `${(strength.score / 5) * 100}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[10px] font-mono text-[#4a6070]">
                                        <span>Strength</span>
                                        <span className={`font-semibold ${strength.color}`}>{strength.label}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Confirm */}
                        <div className="flex flex-col gap-1.5 opacity-0" style={{ animation: "slideIn .35s .5s ease forwards" }}>
                            <label htmlFor="confirm" className="text-[10px] font-medium tracking-[.12em] uppercase text-[#4a6070] font-mono">
                                <span className="text-cyan-400 mr-1">04</span>Confirm Password
                            </label>
                            <div className="relative">
                                <input
                                    id="confirm"
                                    type={showCf ? "text" : "password"}
                                    autoComplete="new-password"
                                    placeholder="repeat password"
                                    value={form.confirm}
                                    onChange={set("confirm")}
                                    disabled={loading}
                                    className={`${inputBase} pr-11 ${errors.confirm ? inputErr : inputOk}`}
                                />
                                <button type="button" tabIndex={-1} onClick={() => setShowCf((v) => !v)}
                                    className="absolute right-0 inset-y-0 w-11 flex items-center justify-center text-[#4a6070] hover:text-cyan-400 transition-colors font-mono text-sm">
                                    {showCf ? "○" : "●"}
                                </button>
                            </div>
                            {errors.confirm && <span className="text-[11px] text-[#ff4d6d] font-mono">✕ {errors.confirm}</span>}
                            {form.confirm.length > 0 && form.password === form.confirm && !errors.confirm && (
                                <span className="text-[11px] text-[#00ff9d] font-mono">✓ Passwords match</span>
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
                            style={{ animation: "fadeUp .35s .6s ease forwards" }}
                        >
                            <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-500 pointer-events-none" />
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-3.5 h-3.5 border-2 border-[#080c10]/30 border-t-[#080c10] rounded-full animate-spin" />
                                    Registering...
                                </span>
                            ) : "Create Account →"}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-[12px] text-[#4a6070] font-mono opacity-0"
                        style={{ animation: "fadeUp .35s .7s ease forwards" }}>
                        Already have an account?{" "}
                        <Link href="/login" className="text-cyan-400 hover:underline">Sign in</Link>
                    </p>
                </div>
            </div>

            <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateX(-6px) } to { opacity:1; transform:translateX(0) } }
        @keyframes fadeUp  { from { opacity:0 } to { opacity:1 } }
      `}</style>
        </div>
    );
}