"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AuthBackground } from "@/components/ui/AuthBackground";
import { LogoLoader } from "@/components/ui/LogoLoader";

export default function AuthLoadingPage() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (!isAuthenticated) {
            router.replace("/login");
            return;
        }

        const timer = window.setTimeout(() => {
            router.replace("/chat");
        }, 1900);

        return () => window.clearTimeout(timer);
    }, [isAuthenticated, router]);

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#04070b] px-6 py-10">
            <AuthBackground />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(10,111,170,.12),transparent_30%),linear-gradient(180deg,transparent_0%,rgba(0,0,0,.25)_100%)]" />
            <div className="relative z-10 flex w-full items-center justify-center">
                <LogoLoader />
            </div>
        </main>
    );
}
