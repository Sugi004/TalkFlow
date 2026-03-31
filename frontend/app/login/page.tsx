"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { login } from "@/lib/auth"
import { useAuth } from "@/context/AuthContext"
import toast from "react-hot-toast"

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const { login: authLogin } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            toast.error("Please fill in all fields");
            return;
        }
        setLoading(true);
        try {
            const data = await login(email, password);
            authLogin(data.access_token);
            router.push("/");
        } catch (error: any) {
            toast.error(error.response?.data?.detail || "Invalid email or password")
        } finally {
            setLoading(false);
        }
    };
    return (
        <>
            <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="text-center mb-4 mt-4">
                        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-1">
                            💬
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900">DevChat</h1>
                        <p className="text-gray-500 mt-1">Welcome back</p>
                    </div>
                    {/* Login Form */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                        <div>
                            <label className="block text-sm font-semibold text-gray-900 mb-2">Email Address</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900" placeholder="you@example.com" required />
                        </div>
                        <div className="mt-6">
                            <label className="block text-sm font-semibold text-gray-900 mb-2">Password</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900" placeholder="••••••••" required />
                        </div>
                        <button type="submit" disabled={loading} className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" onClick={handleSubmit}>
                            {loading ? "Signing in..." : "Sign In"}</button>
                    </div>
                    {/* Register link */}
                    <p className="text-center text-sm mt-6 text-gray-500">
                        Don't have an account?{" "}
                        <Link href="/register" className="text-blue-600 font-semibold hover:underline">
                            Create one
                        </Link>
                    </p>
                </div>

            </div>

        </>


    )
}

