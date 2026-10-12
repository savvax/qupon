"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { toLocale } from "@/i18n/locale";
import { formatDate } from "@/lib/format";
import {
  mergeScenarios,
  planPlayback,
  sandboxStep,
  scenarioPlayAt,
  type ReplayFile,
} from "@/lib/replay";
import { normalizeSandbox, type Sandbox } from "@/lib/sandbox";
import { cx } from "@/lib/ui/cx";
import { SandboxView } from "../[id]/SandboxView";

/** The virtual clock ticks this often: smooth enough for the progress bar, cheap enough for the big view. */
const TICK_MS = 200;

/**
 * The recorded sandbox (task 91587): one real devnet run, played back frame by frame with the live sandbox UI.
 * Nothing here calls the registrar or an RPC — the only fetch is the static /replay/sandbox.json, and every
 * explorer link in the frames is a plain anchor.
 */
export function ReplayClient() {
  const t = useTranslations("sandbox.replay");
  const locale = toLocale(useLocale());
  const [file, setFile] = useState<ReplayFile | null>(null);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    fetch("/replay/sandbox.json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return setMissing(true); // not recorded yet (the lead records the real run)
        const raw = (await res.json()) as ReplayFile;
        setFile({
          ...raw,
          frames: raw.frames.map((f) => ({
            t: f.t,
            sandbox: normalizeSandbox(f.sandbox),
          })),
        });
      })
      .catch(() => setMissing(true));
  }, []);

  const plan = useMemo(() => planPlayback(file?.frames ?? []), [file]);
  const total = plan.at(-1) ?? 0;
  const atEnd = total > 0 && elapsed >= total;

  // the virtual clock: playback time advances at ×speed, compressed by the plan, and stops on the last frame
  useEffect(() => {
    if (!file || !playing || atEnd) return;
    const id = setInterval(
      () => setElapsed((e) => Math.min(total, e + TICK_MS * speed)),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, [file, playing, speed, total, atEnd]);
  useEffect(() => {
    if (atEnd) setPlaying(false);
  }, [atEnd]);

  // the frame to show: the last one whose playback time has come, with the recorded scenarios due by now
  const index = useMemo(() => {
    const i = plan.findIndex((p) => p > elapsed);
    return Math.max(0, (i === -1 ? plan.length : i) - 1);
  }, [plan, elapsed]);
  const shown: Sandbox | null = useMemo(() => {
    if (!file || !file.frames.length) return null;
    const frame = file.frames[index]!;
    return mergeScenarios(
      frame.sandbox,
      file.scenarios,
      (r) => scenarioPlayAt(plan, file.frames, r.t),
      elapsed,
    );
  }, [file, index, plan, elapsed]);

  // the view polls source() on its own; a ref hands it the newest frame without re-creating the callback
  const current = useRef<Sandbox | null>(null);
  current.current = shown;
  const source = useCallback(() => Promise.resolve(current.current), []);

  if (missing) return <NotRecorded />;
  if (!file || !shown)
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
        <p role="status">{t("loading")}</p>
      </div>
    );

  // the progress bar's segments: the run's life steps, as long as they play
  const steps: { key: string; ms: number }[] = [];
  for (let i = 0; i < plan.length; i++) {
    const key = sandboxStep(file.frames[i]!.sandbox);
    const last = steps.at(-1);
    const ms = (plan[i + 1] ?? total) - plan[i]!;
    if (last && last.key === key) last.ms += ms;
    else steps.push({ key, ms });
  }
  const nowKey = sandboxStep(shown);
  const clock = (ms: number) =>
    `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-10 sm:px-6">
      {/* ---------- the sticky REPLAY banner (rule 6: say what is simulated — this says what is recorded) ---------- */}
      <div
        data-tour="replay-banner"
        className="sticky top-16 z-30 -mx-4 mb-6 border-b border-demo-bd bg-demo-bg/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-sm font-semibold text-n900">
            {t.rich("banner", {
              date: formatDate(file.recordedAt, locale),
              replay: (c) => <span key="r">{c}</span>,
            })}
          </p>
          <Button asChild size="sm">
            <Link href="/sandbox/new">{t("liveCta")}</Link>
          </Button>
        </div>
        {/* ---------- playback: play/pause, ×1/×2, restart, progress with the step names ---------- */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              atEnd ? (setElapsed(0), setPlaying(true)) : setPlaying((p) => !p)
            }
          >
            {atEnd ? t("restart") : playing ? t("pause") : t("play")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={speed === 2}
            onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
          >
            {speed === 1 ? "×1" : "×2"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setElapsed(0);
              setPlaying(true);
            }}
          >
            {t("restart")}
          </Button>
          <span className="num text-xs font-semibold text-n600">
            {clock(elapsed)} / {clock(total)}
          </span>
          <div className="flex min-w-40 flex-1 gap-1" role="progressbar">
            {steps.map((s) => (
              <span
                key={s.key}
                title={t(`steps.${s.key}`)}
                style={{ flexGrow: Math.max(0.5, s.ms / 1000) }}
                className={cx(
                  "h-1.5 rounded-full",
                  s.key === nowKey ? "bg-demo-fg" : "bg-n300",
                )}
              />
            ))}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-micro font-semibold text-n600">
          {steps.map((s) => (
            <span key={s.key} className={cx(s.key === nowKey && "text-n900")}>
              {t(`steps.${s.key}`)}
            </span>
          ))}
        </div>
      </div>

      <SandboxView
        initial={file.frames[0]!.sandbox}
        locale={locale}
        mock={false}
        source={source}
        replay
      />
    </div>
  );
}

/** The recording is not there (the lead records the real run): say so and offer the live sandbox. */
function NotRecorded() {
  const t = useTranslations("sandbox.replay");
  const ts = useTranslations("sandbox");
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-xl rounded-card border border-dashed border-n300 bg-n0 p-8 text-center">
        <div className="flex justify-center gap-2">
          <ProvenanceChip kind="demo" />
          <ProvenanceChip kind="onchain">{ts("devnet")}</ProvenanceChip>
        </div>
        <h1 className="mt-3 text-title font-extrabold tracking-tight">
          {t("missingTitle")}
        </h1>
        <p className="mt-2 text-n700">{t("missing")}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button asChild>
            <Link href="/sandbox/new">{t("liveCta")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
