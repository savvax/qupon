"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/lib/ui/cx";
import type { LastAction } from "./live";

/** The six on-chain steps of a coupon, in order (status.* labels). */
const STEPS = [
  "Announced",
  "RecordStruck",
  "SnapshotComplete",
  "Funded",
  "Settling",
  "Completed",
] as const;
/** Seconds each step takes to play; Settling counts the payout up, Completed holds before the replay. */
const DURATION = [0.9, 0.9, 0.9, 0.9, 2.4, 3.6];
const DONE = STEPS.length - 1;

/**
 * "Last corporate action" card that replays the action's lifecycle: the six segments fill one by one, the status
 * chip follows, the total and the holders count up while it settles. Server HTML and reduced motion show the
 * final state; the loop pauses off-screen.
 */
export function HeroLifecycle({
  last,
  locale,
}: {
  last: LastAction;
  locale: "en" | "ru";
}) {
  const t = useTranslations("landing");
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [step, setStep] = useState<number>(DONE);
  const [paid, setPaid] = useState(1); // share of the total shown (0..1)
  const playing = inView && !reduce;
  const total = BigInt(last.totalMinor);

  useEffect(() => {
    if (!playing) {
      setStep(DONE);
      setPaid(1);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let count: ReturnType<typeof animate> | undefined;
    const run = (i: number) => {
      setStep(i);
      if (i === 0) setPaid(0);
      if (STEPS[i] === "Settling") {
        count = animate(0, 1, {
          duration: DURATION[i],
          ease: [0.4, 0, 0.2, 1],
          onUpdate: setPaid,
        });
      }
      timer = setTimeout(
        () => run(i === DONE ? 0 : i + 1),
        (DURATION[i] ?? 1) * 1000,
      );
    };
    timer = setTimeout(() => run(0), 900); // let the page settle first
    return () => {
      clearTimeout(timer);
      count?.stop();
    };
  }, [playing]);

  const shown = (total * BigInt(Math.round(paid * 1000))) / 1000n;
  // holders are counted as the payout reaches them: the last one only when everything is paid
  const holders = paid >= 1 ? last.holders : Math.floor(last.holders * paid);
  const status = STEPS[step] ?? "Completed";

  return (
    // A plain off-white card with a brand-tinted shadow: the replaying lifecycle inside is the motion.
    <div ref={ref}>
      <div className="rounded-card shadow-[0_24px_64px_-24px_rgba(4,30,22,.7)] ring-1 ring-white/10">
        <div className="rounded-card bg-n50 p-5 text-n900 sm:p-6">
          <div className="truncate text-sm font-semibold text-n600">
            {t("last.title")}
          </div>
          <div className="mt-3 flex h-7 items-center gap-2">
            <span className="text-xl font-extrabold">{last.ticker}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-n500">
              <span className="max-sm:hidden">{last.kind} · </span>
              {t(`kinds.${last.kind}`)}
            </span>
            <m.span
              key={status}
              initial={playing ? { opacity: 0, y: 4 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Badge status={status} />
            </m.span>
          </div>
          <div className="mt-5 text-xs font-semibold text-n500">
            {t("last.total")}
          </div>
          <Amount
            minor={shown}
            currency={last.currency}
            locale={locale}
            className="block h-9 text-3xl font-extrabold"
          />
          <div className="mt-1 h-5 truncate text-sm text-n600">
            {t("last.holders", { count: holders })}
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
