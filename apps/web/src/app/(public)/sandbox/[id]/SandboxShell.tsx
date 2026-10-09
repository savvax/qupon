"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { HelpMenu } from "@/components/shell/HelpMenu";
import { Tour } from "@/components/shell/Tour";
import { ActionFlow } from "@/components/ui/ActionFlow";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { CountdownClock } from "@/components/ui/CountdownClock";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { LifecycleRail } from "@/components/ui/LifecycleRail";
import { MoneyFlow } from "@/components/ui/MoneyFlow";
import { NowBar } from "@/components/ui/NowBar";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { cx } from "@/lib/ui/cx";
import {
  CURRENCY,
  DAY_SECS,
  ESCROW_REQUIRED,
  HISTORY,
  type Role,
  ROLE_CAN,
  ROLES,
  SCENARIOS,
  SERIES,
  STEP_ACTOR,
  STEP_IDS,
  railNodes,
  recipients,
} from "./fixture";

type Scenario = keyof typeof SCENARIOS;
type FeedRow = { key: string; values?: Record<string, string>; sig: string; at: number };

/** Segmented control (role, scenario): one row of buttons, the chosen one filled. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-n600">{label}</span>
      <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-btn border border-n200 bg-n0 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "h-8 rounded-sm px-2.5 text-xs font-bold transition-colors",
              value === o.value ? "bg-p900 text-white" : "text-n600 hover:bg-n50 hover:text-n900",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The judge sandbox, shell only (task 1530): a demo-clock series played frame by frame from a local fixture —
 * role switcher, Now bar, coupon sheet, the coupon's steps and money, a transaction feed and the sandbox tour.
 * Buttons advance the fixture; nothing is sent anywhere (the engine arrives with task 1532).
 */
export function SandboxShell({ locale }: { locale: "en" | "ru" }) {
  const t = useTranslations("sandbox");
  const [role, setRole] = useState<Role>("public");
  const [scenario, setScenario] = useState<Scenario>("coupon");
  const [i, setI] = useState(0);
  // Clocks and the feed count from the moment the page opened in the browser (null on the server).
  const [opened, setOpened] = useState<number | null>(null);
  const [frameAt, setFrameAt] = useState<number | null>(null);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t0 = Date.now();
    setOpened(t0);
    setFrameAt(t0);
    setNow(t0);
    setFeed(HISTORY.map((h) => ({ ...h, at: t0 - h.ago * 1000 })));
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const frames = SCENARIOS[scenario];
  const frame = frames[Math.min(i, frames.length - 1)]!;
  const roleName = (r: Role) => t(`roles.${r}`);
  const canAct = frame.actor ? ROLE_CAN[frame.actor].includes(role) : false;
  const firstRoleFor = frame.actor ? ROLE_CAN[frame.actor][0] : undefined;

  const advance = () => {
    const nextI = Math.min(i + 1, frames.length - 1);
    const next = frames[nextI]!;
    const at = Date.now();
    setI(nextI);
    setFrameAt(at);
    setFeed((f) => [...next.tx.map((x, k) => ({ ...x, at: at + k })).reverse(), ...f]);
  };
  const reset = (s: Scenario) => {
    setScenario(s);
    setI(0);
    const at = Date.now();
    setFrameAt(at);
    setFeed(HISTORY.map((h) => ({ ...h, at: (opened ?? at) - h.ago * 1000 })));
  };

  const unitsLabel = (u: string) => t("unitsLabel", { units: u });
  const flow = STEP_IDS.map((id) => ({
    id,
    label: t(`steps.${id}`),
    state: frame.flow[id],
    actor: STEP_ACTOR[id],
    detail:
      id === "snapshot" && frame.flow.snapshot === "done"
        ? t("detail.snapshot")
        : id === "pay" && frame.flow.pay === "done"
          ? t("detail.pay")
          : id === "record" && frame.flow.record !== "done"
            ? t("detail.record")
            : undefined,
    record:
      id === "record"
        ? {
            planned: "2027-08-31T00:00:00+05:00",
            effective: frame.flow.record === "done" ? "2027-08-31T00:00:00+05:00" : null,
          }
        : undefined,
    downloads:
      id === "announce"
        ? [{ label: "seev.031", href: "#seev031" }]
        : id === "complete" && frame.flow.complete === "done"
          ? [{ label: "seev.036", href: "#seev036" }]
          : undefined,
  }));

  const ago = (at: number) => {
    const s = Math.max(0, Math.round(((now ?? at) - at) / 1000));
    return s >= 60 ? t("feed.agoMin", { m: Math.floor(s / 60) }) : t("feed.ago", { s });
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceChip kind="demo" />
        <ProvenanceChip kind="simulated">{t("feed.example")}</ProvenanceChip>
        <span className="num text-sm text-n600">
          {SERIES.ticker} · {SERIES.isin}
        </span>
      </div>
      <h1 className="mt-3 max-w-3xl text-title font-extrabold tracking-tight text-balance">
        {t("title", { name: SERIES.name })}
      </h1>
      <p className="mt-2 max-w-2xl text-n700">
        {t("lead", { s: DAY_SECS })} <GlossaryTerm term="demoClock" />.
      </p>
      <p className="mt-3 max-w-2xl rounded-btn border border-dashed border-warn-bd bg-warn-bg px-3 py-2 text-sm text-warn-fg">
        {t("preview")}
      </p>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div data-tour="roles" className="min-w-0">
          <Segmented
            label={t("viewAs")}
            value={role}
            options={ROLES.map((r) => ({ value: r, label: roleName(r) }))}
            onChange={setRole}
          />
        </div>
        <div data-tour="scenario" className="flex flex-wrap items-center gap-2">
          <Segmented
            label={t("scenario")}
            value={scenario}
            options={(Object.keys(SCENARIOS) as Scenario[]).map((s) => ({
              value: s,
              label: t(`scenarios.${s}`),
            }))}
            onChange={reset}
          />
          <Button size="sm" variant="ghost" onClick={() => reset(scenario)}>
            {t("restart")}
          </Button>
          <HelpMenu role="sandbox" />
        </div>
      </div>

      <div className="mt-5" data-tour="now">
        <NowBar
          tone={frame.tone}
          title={t(`now.${frame.now}`)}
          detail={
            role === "investor" ? (
              <span>
                {t("you", { units: "25" })}{" "}
                <Amount minor="125000" currency={CURRENCY} locale={locale} className="font-semibold text-n900" />
              </span>
            ) : !canAct && frame.actor && firstRoleFor ? (
              t("switchTo", { role: roleName(firstRoleFor) })
            ) : undefined
          }
          clock={
            frame.clock && frameAt !== null ? (
              <CountdownClock
                to={frameAt + frame.clock.in * 1000}
                label={t(`clock.${frame.clock.key}`)}
                daySecs={DAY_SECS}
              />
            ) : undefined
          }
          actors={frame.actor ? [frame.actor] : []}
          action={
            frame.button ? (
              canAct ? (
                <Button onClick={advance}>{t(`btn.${frame.button}`)}</Button>
              ) : (
                firstRoleFor && (
                  <Button variant="secondary" onClick={() => setRole(firstRoleFor)}>
                    {roleName(firstRoleFor)}
                  </Button>
                )
              )
            ) : (
              <Button variant="secondary" onClick={() => reset(scenario === "coupon" ? "default" : "coupon")}>
                {t(`scenarios.${scenario === "coupon" ? "default" : "coupon"}`)}
              </Button>
            )
          }
        />
      </div>

      <div className="mt-6" data-tour="rail">
        <LifecycleRail
          locale={locale}
          nodes={railNodes((k, v) => t(`rail.${k}`, v), frame.rail)}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section data-tour="steps" className="rounded-card border border-n200 bg-n0 p-4 sm:p-5">
            <h2 className="mb-4 text-base font-bold">{t("flowTitle")}</h2>
            <ActionFlow steps={flow} locale={locale} />
          </section>
          <div data-tour="money">
            <MoneyFlow
              currency={CURRENCY}
              locale={locale}
              issuer={{ label: SERIES.issuer }}
              escrow={{ required: ESCROW_REQUIRED, funded: frame.funded, fundTx: Number(frame.funded) > 0 ? "Fund2x7Lm9Q2rT5vY8bN3kC6dF1gH4jWexampleSig" : null }}
              recipients={recipients(frame.legs, unitsLabel)}
              state={frame.moneyState}
              sampleTx
            />
          </div>
        </div>
        <aside data-tour="feed" className="min-w-0 self-start rounded-card border border-n200 bg-n0 p-4 sm:p-5 lg:sticky lg:top-24">
          <h2 className="text-base font-bold">{t("feed.title")}</h2>
          <p className="text-xs text-n500">{t("feed.lead")}</p>
          <ol className="mt-3 divide-y divide-n100">
            {feed.map((row) => (
              <li key={row.sig} className="py-2.5 text-sm">
                <div className="font-semibold text-n900">{t(`tx.${row.key}`, row.values ?? {})}</div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-n500">
                  <span className="num" title={row.sig}>
                    {row.sig.slice(0, 4)}…{row.sig.slice(-4)} · {t("feed.example")}
                  </span>
                  <span className="num shrink-0">{ago(row.at)}</span>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <Tour role="sandbox" />
    </div>
  );
}
