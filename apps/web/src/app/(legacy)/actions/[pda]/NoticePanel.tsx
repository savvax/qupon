"use client";

import { useState } from "react";

/** KASE-style notice, EN/RU toggle + copy. Publication on kase.kz: SIMULATED. */
export function NoticePanel({ en, ru }: { en: string; ru: string }) {
  const [lang, setLang] = useState<"en" | "ru">("en");
  const [copied, setCopied] = useState(false);
  const text = lang === "en" ? en : ru;

  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">KASE notice</h3>
        <div className="flex items-center gap-2">
          {(["en", "ru"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded border px-2 py-0.5 text-xs uppercase ${
                lang === l
                  ? "border-sky-600 bg-sky-950/60 text-sky-300"
                  : "border-neutral-700 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {l}
            </button>
          ))}
          <button
            type="button"
            onClick={copy}
            className="rounded border border-neutral-600 px-2 py-0.5 text-xs text-neutral-300 hover:border-neutral-400 hover:text-neutral-100"
          >
            {copied ? "copied ✓" : "copy"}
          </button>
        </div>
      </div>
      <pre className="mt-3 max-h-72 overflow-auto rounded bg-neutral-900/60 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-neutral-300">
        {text}
      </pre>
    </div>
  );
}
