"use client";

import Image from "next/image";

type LogoLoaderProps = {
    title?: string;
    detail?: string;
};

export function LogoLoader({
    title = "Opening TalkFlow",
    detail = "Establishing encrypted channels and syncing your workspace",
}: LogoLoaderProps) {
    return (
        <div className="relative mx-auto flex w-full max-w-xl flex-col items-center px-6 text-center">
            <div className="relative mb-10">
                <div className="absolute inset-[-16%] rounded-full bg-[radial-gradient(circle,rgba(0,204,255,.2),transparent_62%)] blur-2xl animate-[auth-pulse_3.2s_ease-in-out_infinite]" />
                <div className="absolute inset-[-8%] rounded-full border border-cyan-300/15 animate-[auth-ring_3.6s_linear_infinite]" />
                <div className="absolute inset-[-18%] rounded-full border border-cyan-300/10 animate-[auth-ring_3.6s_linear_infinite] [animation-delay:1.2s]" />

                <div className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#09131b]/92 px-8 py-7 shadow-[0_0_60px_rgba(0,153,255,.16)] backdrop-blur-sm">
                    <span className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/60 to-transparent" />
                    <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/10 to-transparent animate-[auth-scan_2.2s_ease-in-out_infinite]" />
                    <Image
                        src="/TalkFlow_Chat_Logo.jpg"
                        alt="TalkFlow"
                        width={192}
                        height={192}
                        priority
                        unoptimized
                        className="relative h-auto w-[220px] animate-[auth-float_5s_ease-in-out_infinite] object-contain rounded-2xl"
                    />
                </div>
            </div>

            <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">
                secure handoff
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {title}
            </h1>
            <p className="mt-3 max-w-md font-mono text-[13px] leading-6 text-[#86a1b5]">
                {detail}
            </p>

            <div className="mt-8 flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 animate-[auth-dot_1.2s_ease-in-out_infinite]" />
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 animate-[auth-dot_1.2s_ease-in-out_infinite] [animation-delay:.2s]" />
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 animate-[auth-dot_1.2s_ease-in-out_infinite] [animation-delay:.4s]" />
            </div>
        </div>
    );
}
