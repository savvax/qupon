"use client";

import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";
import { LocaleSwitch } from "@/components/shell/LocaleSwitch";
import { Logo } from "@/components/shell/Logo";
import { type Locale, toLocale } from "@/i18n/locale";
import en from "../../../messages/en.json";
import enKit from "../../../messages/en/kit.json";
import enProof from "../../../messages/en/proof.json";
import { ProofPicker } from "./ProofPicker";
import { ProofView } from "./ProofView";

type Messages = Record<string, unknown>;
const EN: Messages = { ...en, kit: enKit, proof: enProof };
const KEY = "qupon-proof-locale";

/** The namespaces the proof page uses (base: common, status, landing.simulated; kit; proof). */
async function messagesFor(l: Locale): Promise<Messages> {
  if (l === "en") return EN;
  const [base, kit, proof] = await Promise.all([
    import(`../../../messages/${l}.json`),
    import(`../../../messages/${l}/kit.json`),
    import(`../../../messages/${l}/proof.json`),
  ]);
  return { ...base.default, kit: kit.default, proof: proof.default };
}

/**
 * Shell of the static proof export (`pnpm build:proof`): no server, so the language is chosen in the browser
 * (?lang=, then the last choice, then the browser's language) and the mint comes from the path or ?mint=.
 */
export function ProofStatic({ mint: fixed }: { mint?: string }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [messages, setMessages] = useState<Messages>(EN);
  const [mint, setMint] = useState<string | null>(fixed ?? null);
  const [ready, setReady] = useState(Boolean(fixed));

  const choose = (l: Locale) =>
    void messagesFor(l).then((m) => {
      setMessages(m);
      setLocale(l);
      document.documentElement.lang = l;
      try {
        localStorage.setItem(KEY, l);
      } catch {
        // private mode: the choice just is not remembered
      }
    });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!fixed) setMint(q.get("mint"));
    setReady(true);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      saved = null;
    }
    const wanted = toLocale(q.get("lang") ?? saved ?? navigator.language.slice(0, 2));
    if (wanted !== "en") choose(wanted);
  }, [fixed]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Almaty">
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-n200 bg-n0">
          <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/proof/" className="flex items-center gap-2.5">
              <Logo />
              <span className="text-lg font-extrabold tracking-tight text-n900">Qupon</span>
            </Link>
            <LocaleSwitch onChoose={(l) => choose(toLocale(l))} />
          </div>
        </header>
        <main className="flex-1">
          {mint ? <ProofView mint={mint} /> : ready ? <ProofPicker staticExport /> : null}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
