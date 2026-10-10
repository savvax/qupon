"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { explorerHref, useNetwork } from "@/components/network/NetworkContext";
import { formatDate } from "@/lib/format";
import { cx } from "@/lib/ui/cx";
import type { LastAction } from "./live";
import { type Locale } from "@/i18n/locale";

/** The six on-chain steps of a coupon, in order (status.* labels). */
const STEPS = [
  "Announced",
  "RecordStruck",
  "SnapshotComplete",
  "Funded",
  "Settling",
  "Completed",
] as const;
/** Seconds each step takes to play; Completed holds before the replay. */
const DURATION = [0.9, 0.9, 0.9, 0.9, 2.4, 3.6];
const DONE = STEPS.length - 1;

/**
 * "Last completed payout" card: the amount, the holders paid, the transaction and the status chip are always the
 * final, real values; only the six step segments and the caption under them replay the lifecycle (language §6,
 * so no frame ever reads "Announced" under a "completed" title, nor "0.00 ₸").
 * Server HTML and reduced motion show the completed state; the loop pauses off-screen.
 */
export function HeroLifecycle({
  last,
  locale,
}: {
  last: LastAction;
  locale: Locale;
}) {
  const t = useTranslations("landing");
  const network = useNetwork();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [step, setStep] = useState<number>(DONE);
  const playing = inView && !reduce;

  useEffect(() => {
    if (!playing) {
      setStep(DONE);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const run = (i: number) => {
      setStep(i);
      timer = setTimeout(
        () => run(i === DONE ? 0 : i + 1),
        (DURATION[i] ?? 1) * 1000,
      );
    };
    timer = setTimeout(() => run(0), 900); // let the page settle first
    return () => clearTimeout(timer);
  }, [playing]);

  return (
    // A plain off-white card with a brand-tinted shadow: the replaying lifecycle inside is the motion.
    <div ref={ref}>
      <div className="rounded-card shadow-[0_24px_64px_-24px_rgba(4,30,22,.7)] ring-1 ring-white/10">
        <div className="rounded-card bg-n50 p-5 text-n900 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-sm font-semibold text-n600">
              {t("last.title")}
            </span>
            {last.sig ? (
              <ProvenanceChip
                kind="onchain"
                href={explorerHref("tx", last.sig, network.explorerCluster)}
              />
            ) : (
              <ProvenanceChip kind="simulated">
                {t("last.example")}
              </ProvenanceChip>
            )}
          </div>
          <div className="mt-3 flex h-7 items-center gap-2">
            <span className="text-xl font-extrabold">{last.ticker}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-n500">
              <span className="max-sm:hidden">{last.kind} · </span>
              {t(`kinds.${last.kind}`)}
            </span>
            {/* The chip never replays (§6): the card is titled "completed", so it stays Completed. */}
            <Badge status="Completed" />
          </div>
          <div className="mt-5 text-xs font-semibold text-n500">
            {t("last.total")}
          </div>
          <Amount
            minor={last.totalMinor}
            currency={last.currency}
            locale={locale}
            className="block h-9 text-3xl font-extrabold"
          />
          <div className="mt-1 flex h-5 items-center gap-2 truncate text-sm text-n600">
            <span>{t("last.holders", { count: last.holders })}</span>
            {last.at && (
              <span className="num text-n500">
                · {formatDate(last.at, locale)}
              </span>
            )}
          </div>
          <div className="mt-5 flex gap-1" aria-hidden>
            {STEPS.map((s, i) => {
              const filled = i < step || step === DONE;
              const current = i === step && step !== DONE;
              return (
                <span
                  key={s}
                  className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-n100"
                >
                  <span
                    className={cx(
                      "absolute inset-0 origin-left rounded-full bg-g500",
                      current && "animate-qp-segment",
                    )}
                    style={{
                      scale: filled || current ? undefined : "0 1",
                      animationDuration: current
                        ? `${DURATION[i]}s`
                        : undefined,
                    }}
                  />
                </span>
              );
            })}
          </div>
          <div className="mt-2 flex h-5 items-center justify-between gap-2 text-xs text-n500">
            <span className="truncate" aria-live="off">
              {step === DONE
                ? t("last.steps")
                : t("last.stepOf", { n: step + 1, total: STEPS.length })}
            </span>
            {last.sig ? (
              <Address value={last.sig} kind="tx" />
            ) : (
              <span className="truncate">{t("last.example")}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
