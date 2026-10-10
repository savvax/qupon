import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { StableText } from "@/components/i18n/StableLabel";
import { CountdownClock } from "@/components/ui/CountdownClock";
import { NowBar } from "@/components/ui/NowBar";
import { type FlowAction, nextStep, STEP_ACTOR } from "@/lib/actionFlow";

/**
 * The NowBar of one corporate action, derived from `actionFlow.nextStep`: the next step, who may push it (with the
 * "anyone can push" sentence for permissionless crank steps), a countdown while a time gate is open (record date,
 * payment date, voting window; demo-clock aware with `daySecs`) and the one button the caller passes.
 */
export function StepNowBar({
  action,
  ticker,
  supply,
  openTrades = 0,
  now = Date.now(),
  daySecs,
  button,
  dock = "tabbar",
}: {
  action: FlowAction;
  ticker: string;
  /** series.totalIssued: finalize once the snapshot covers it */
  supply?: bigint;
  openTrades?: number;
  now?: number;
  daySecs?: number;
  button?: ReactNode;
  dock?: "page" | "tabbar" | "none";
}) {
  const t = useTranslations("kit.now");
  const tstep = useTranslations("steps.do");
  const next = nextStep(action, now, supply, openTrades);
  // No chip while no step can be pushed: a waiting vote used to show "Holder" on the issuer's own bar (preflight #29)
  const actor = next.step ? STEP_ACTOR[next.step] : undefined;
  const s = action.status;
  const [key, values]: [string, Record<string, string>] = next.step
    ? ["next", { step: tstep(next.step), ticker }]
    : s === "Announced"
      ? ["trades", { ticker }]
      : s === "VotingOpen"
        ? ["voting", { ticker }]
        : s === "Finalized"
          ? ["notApproved", { ticker }]
          : s === "Cancelled"
            ? ["cancelled", { ticker }]
            : s === "Completed"
              ? ["completed", { ticker }]
              : ["idle", { ticker }];
  // StableText: the bar's height must not move with the language (spec §5.8) — the detail sits above
  // everything on /registrar now that a default leads the board (preflight #10).
  const detail =
    s === "Defaulted" ? (
      <StableText>{t("defaulted")}</StableText>
    ) : actor === "anyone" ? (
      <StableText>{t("anyone")}</StableText>
    ) : (
      action.corpId
    );
  return (
    <NowBar
      dock={dock}
      tone={
        s === "Defaulted"
          ? "danger"
          : s === "Completed"
            ? "done"
            : s === "Cancelled" || key === "trades"
              ? "attention"
              : "default"
      }
      title={
        <StableText template={t.raw(key) as string} values={values}>
          {t(key, values)}
        </StableText>
      }
      detail={detail}
      clock={
        next.gate ? (
          <CountdownClock
            to={next.gate.at}
            label={t(`gate.${next.gate.kind}`)}
            daySecs={daySecs}
          />
        ) : undefined
      }
      actors={actor ? [actor] : []}
      action={button}
    />
  );
}
