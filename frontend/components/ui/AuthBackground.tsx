"use client";

const ORBS = [
    "left-[6%] top-[10%] h-44 w-44 bg-cyan-400/12",
    "right-[8%] top-[18%] h-56 w-56 bg-blue-500/14",
    "left-[16%] bottom-[8%] h-64 w-64 bg-emerald-400/10",
    "right-[18%] bottom-[12%] h-40 w-40 bg-cyan-300/10",
];

const PARTICLES = [
    { left: "10%", top: "24%", delay: "0s" },
    { left: "22%", top: "72%", delay: "1.3s" },
    { left: "37%", top: "42%", delay: "0.7s" },
    { left: "58%", top: "18%", delay: "1.8s" },
    { left: "72%", top: "68%", delay: "0.3s" },
    { left: "84%", top: "32%", delay: "1.1s" },
    { left: "90%", top: "78%", delay: "2s" },
];

export function AuthBackground() {
    return (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(10,97,140,.26),transparent_38%),radial-gradient(circle_at_80%_20%,rgba(0,255,157,.08),transparent_34%),linear-gradient(180deg,#071018_0%,#04070b_100%)]" />
            <div className="absolute inset-0 opacity-60 bg-image-[linear-gradient(rgba(0,204,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(0,204,255,.045)_1px,transparent_1px)] bg-size-[40px_40px] animate-[auth-grid-shift_18s_linear_infinite]" />
            <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-cyan-300/20 to-transparent" />

            {ORBS.map((orb, index) => (
                <div
                    key={orb}
                    className={`absolute rounded-full blur-3xl animate-[auth-float_12s_ease-in-out_infinite] ${orb}`}
                    style={{ animationDelay: `${index * 1.2}s` }}
                />
            ))}

            <div className="absolute left-[-10%] top-[18%] h-px w-[48%] rotate-16deg bg-linear-to-r from-transparent via-cyan-300/30 to-transparent animate-[auth-drift_14s_linear_infinite]" />
            <div className="absolute right-[-12%] top-[58%] h-px w-[44%] -rotate-14deg bg-linear-to-r from-transparent via-emerald-300/20 to-transparent animate-[auth-drift_18s_linear_infinite_reverse]" />

            {PARTICLES.map((particle) => (
                <span
                    key={`${particle.left}-${particle.top}`}
                    className="absolute h-1.5 w-1.5 rounded-full bg-cyan-300/70 shadow-[0_0_18px_rgba(50,220,255,.45)] animate-[auth-spark_3.2s_ease-in-out_infinite]"
                    style={{
                        left: particle.left,
                        top: particle.top,
                        animationDelay: particle.delay,
                    }}
                />
            ))}
        </div>
    );
}
