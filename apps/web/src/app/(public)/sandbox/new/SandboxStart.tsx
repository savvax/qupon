"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { BoError } from "@/lib/boClient";
import { createSandbox, sandboxFailureKind } from "@/lib/sandbox";
import { cx } from "@/lib/ui/cx";

const REQUEST_KEY = "qupon.sandbox.request";
const STEPS = ["series", "investors", "place", "wallet", "autopilot"] as const;

function storage(fn: () => string | null | void) {
  try {
    return fn() ?? null;
  } catch {
    return null; // storage blocked: the request id just is not reused
  }
}

/**
 * Creates the visitor's sandbox (POST /demo/sandbox through the proxy) and moves on to it. The request id lives in
 * sessionStorage until the sandbox exists, so a reload or a double effect returns the same sandbox (idempotent).
 */
export function SandboxStart({
  fresh,
  wallet,
}: {
  fresh: boolean;
  wallet: string | null;
}) {
  const t = useTranslations("sandbox.start");
  const router = useRouter();
  const started = useRef(false);
  const [failure, setFailure] = useState<BoError | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (startedAt === null || failure) return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [startedAt, failure]);

  useEffect(() => {
    if (started.current && attempt === 0) return;
    started.current = true;
    const reuse =
      fresh && attempt === 0
        ? null
        : storage(() => sessionStorage.getItem(REQUEST_KEY));
    const requestId =
      reuse ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    storage(() => sessionStorage.setItem(REQUEST_KEY, requestId));
    setFailure(null);
    setStartedAt(Date.now());
    createSandbox({ requestId, ...(wallet ? { wallet } : {}) })
      .then((c) => {
        storage(() => sessionStorage.removeItem(REQUEST_KEY));
        router.replace(`/sandbox/${c.id}`);
      })
      .catch((e: unknown) =>
        setFailure(
          e instanceof BoError ? e : new BoError(0, "upstream", String(e)),
        ),
      );
  }, [attempt, fresh, wallet, router]);

  const steps = STEPS.filter((s) => s !== "wallet" || wallet);
  const throttled = failure
    ? sandboxFailureKind(failure) === "throttled"
    : false;
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceChip kind="demo" />
          <ProvenanceChip kind="onchain">{t("devnet")}</ProvenanceChip>
        </div>
        <h1 className="mt-3 text-title font-extrabold tracking-tight text-balance">
          {failure
            ? throttled
              ? t("throttledTitle")
              : t("failedTitle")
            : t("title")}
        </h1>
        <p className="mt-2 max-w-[62ch] text-n700">
          {failure ? (throttled ? t("throttled") : t("failed")) : t("lead")}
        </p>
        {failure && !throttled && (
          <details className="mt-3 text-sm text-n600">
            <summary className="cursor-pointer select-none">
              {t("technical")}
            </summary>
            <p className="mt-1 font-mono text-xs break-words text-n500">
              {failure.message}
            </p>
          </details>
        )}

        {failure ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {!throttled && (
              <Button onClick={() => setAttempt((n) => n + 1)}>
                {t("retry")}
              </Button>
            )}
            {/* task 91587: devnet busy or throttled — the recorded run always plays */}
            <Button asChild variant={throttled ? "primary" : "secondary"}>
              <Link href="/sandbox/replay">{t("replay")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/learn">{t("learn")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/bonds">{t("bonds")}</Link>
            </Button>
          </div>
        ) : (
          <section
            aria-label={t("title")}
            className="mt-6 rounded-card border border-n200 bg-n0 p-4 sm:p-6"
          >
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={s} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={cx(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-micro font-bold",
                      i === 0
                        ? "qp-live border-2 border-g600 bg-n0 text-g700"
                        : "border-2 border-dashed border-n300 text-n500",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-n900">
                      {t(`steps.${s}.title`)}
                    </div>
                    <div className="text-sm text-n600">
                      {t(`steps.${s}.body`)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-n100 pt-4 text-sm text-n600">
              <span role="status" aria-live="polite">
                {t("working")}
              </span>
              <span className="num font-semibold text-n900">
                {t("elapsed", { s: elapsed })}
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
