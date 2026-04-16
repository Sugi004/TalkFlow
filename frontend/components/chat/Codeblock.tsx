"use client"

import { useEffect, useState } from "react"
import { codeToHtml } from "shiki"
import { CodeBlockProps } from "@/types"

const LANG_LABELS: Record<string, string> = {
    js: "JavaScript", javascript: "JavaScript",
    ts: "TypeScript", typescript: "TypeScript",
    tsx: "Typescript JSX", jsx: "Javascript JSX",
    py: "Python", python: "Python",
    go: "Go",
    rs: "Rust", rust: "Rust",
    java: "Java",
    cpp: "C++", c: "C", cs: "C#",
    php: "PHP",
    rb: "Ruby", ruby: "Ruby",
    sh: "Shell", bash: "Bash", sql: "SQL",
    html: "HTML", css: "CSS",
    json: "JSON",
    yaml: "YAML",
    md: "Markdown",
    docker: "Dockerfile", dockerfile: "Dockerfile",
    graphql: "GraphQL",
};

const SHIKI_LANGS = new Set([
    "javascript", "js", "typescript", "ts", "tsx", "jsx",
    "python", "py", "go", "rust", "rs", "java", "c", "cpp", "cs",
    "php", "ruby", "rb", "bash", "sh", "shell", "sql",
    "html", "css", "json", "yaml", "yml", "markdown", "md",
    "dockerfile", "docker", "graphql", "text",
]);

function normalizeLang(lang: string): string {
    const l = lang.trim().toLowerCase();
    if (SHIKI_LANGS.has(l)) return l;
    return "text";
}


export default function CodeBlock({ code, language = "" }: CodeBlockProps) {
    const [highlighted, setHighlighted] = useState<string>("");
    const [copied, setCopied] = useState(false)
    const [loading, setLoading] = useState(true)
    const lang = language.toLocaleLowerCase().trim();
    const label = LANG_LABELS[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
    const shikiLang = normalizeLang(lang);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        codeToHtml(code, {
            lang: shikiLang,
            theme: "one-dark-pro"
        }).then((html) => {
            if (!cancelled) {
                setHighlighted(html);
                setLoading(false);
            }
        })

        return () => {
            cancelled = true;
        }
    }, [code, shikiLang])

    async function copy() {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <>
            <div className="my-1 rounded overflow-hidden border border-[#1e2a35] max-w-[600px]">

                {/* Header bar */}
                <div className="flex items-center justify-between px-3.5 py-2 bg-[#0a0e14] border-b border-[#1e2a35]">
                    <div className="flex items-center gap-2.5">
                        <div className="flex gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                        </div>
                        <span className="text-[10px] text-[#4a6070] font-mono tracking-wider uppercase">
                            {label}
                        </span>
                    </div>
                    <button
                        onClick={copy}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded transition-all
            ${copied
                                ? "text-[#00ff9d] border border-[#00ff9d]/30"
                                : "text-[#4a6070] border border-[#1e2a35] hover:text-cyan-400 hover:border-cyan-400/30"
                            }`}
                    >
                        {copied ? "✓ copied" : "copy"}
                    </button>
                </div>

                {/* Code body */}
                <div className="bg-[#060a0e] overflow-x-auto">
                    {loading ? (
                        <pre className="px-4 py-3.5 text-[12.5px] leading-[1.7] font-mono text-[#4a6070] m-0">
                            {code}
                        </pre>
                    ) : (
                        <div
                            className="shiki-wrapper text-[12.5px] leading-[1.7]"
                            dangerouslySetInnerHTML={{ __html: highlighted }}
                        />
                    )}
                </div>

                {/* Override shiki's inline background to match our theme */}
                <style>{`
        .shiki-wrapper pre {
          margin: 0;
          padding: 14px 16px;
          background: #060a0e !important;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.7;
        }
        .shiki-wrapper code { font-family: inherit; }
      `}</style>
            </div>
        </>

    )

}