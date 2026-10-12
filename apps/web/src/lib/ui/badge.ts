export type Tone =
  "success" | "warn" | "danger" | "info" | "neutral" | "violet" | "bank";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: "bg-g50", fg: "text-g700" },
  warn: { bg: "bg-warn-bg", fg: "text-warn-fg" },
  danger: { bg: "bg-err-bg", fg: "text-err-fg" },
  info: { bg: "bg-p50", fg: "text-p700" },
  neutral: { bg: "bg-n100", fg: "text-n600" },
  violet: { bg: "bg-[#f3efff]", fg: "text-[#5b3cc4]" },
  bank: { bg: "bg-bank-bg", fg: "text-bank-fg" }, // paid to the paying agent (design language §4)
};

/** Every status the registrar API emits → tone. Unknown values fall back to neutral (never throw). */
export const STATUS_TONE: Record<string, Tone> = {
  Active: "success",
  Paid: "success",
  Completed: "success",
  Finalized: "success",
  Retired: "success",
  For: "success",
  Approved: "success",
  Announced: "info",
  RecordStruck: "info",
  SnapshotComplete: "info",
  Snapshotted: "info",
  Funded: "warn",
  Settling: "warn",
  InProgress: "warn",
  Matured: "warn",
  Suspended: "danger",
  Against: "danger",
  Rejected: "danger",
  Defaulted: "danger", // plan 15 D4: the loudest state in the system
  PaidToAgent: "bank", // plan 15 D6: with the paying agent, awaiting confirmation
  VotingOpen: "violet",
  Retiring: "violet",
  Closed: "neutral",
  Cancelled: "neutral",
  Abstain: "neutral",
  Draft: "neutral",
  Projected: "neutral",
};

export function badgeTone(statusOrTone: string): { bg: string; fg: string } {
  const tone = (
    statusOrTone in TONES ? statusOrTone : STATUS_TONE[statusOrTone]
  ) as Tone | undefined;
  return TONES[tone ?? "neutral"];
}

/** "RecordStruck" → "Record struck". */
export function prettifyStatus(status: string): string {
  const s = status.replace(/([a-z])([A-Z])/g, "$1 $2");
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/** A root-scoped next-intl translator (t("ns.key"), t.has("ns.key")) — useTranslations() / getTranslations(). */
export type RootT = ((key: string) => string) & {
  has: (key: string) => boolean;
};

/** Activity-feed step names (Go executor Step*, openapi AdvanceResponse.step) → steps.done.* ids. */
const FEED_STEP: Record<string, string> = {
  strike_record: "strike",
  snapshot_batch: "snapshot",
  finalize_snapshot: "finalize",
  fund_action: "fund",
  pay_batch: "pay",
  complete_action: "complete",
  retire_batch: "retire",
  close_series: "close",
  meeting_finalize: "meet_finalize",
  apply_terms_change: "apply",
  sweep_escrow: "sweep",
  declare_default: "declare_default",
  confirm_bank_payout: "confirm_bank",
  announce: "announce",
};

/** One activity row's kind as a sentence (live-sweep A91567-5): bare event kinds via status.*;
 * `advance:x` / `scheduler:x` / `approval:step:x` audit rows via the actor (registrar.activity.actor.*)
 * and steps.done.* (INTR/REDM/… announce rows via landing.kinds.*). Unknown parts fall back
 * prettified — a RU/KK page never shows a raw instruction enum. */
export function activityKindLabel(kind: string, t: RootT): string {
  if (t.has(`status.${kind}`)) return t(`status.${kind}`);
  const m = /^(advance|scheduler|approval):(?:step:)?([A-Za-z_]+)$/.exec(kind);
  const [, actor = "", step = ""] = m ?? [];
  if (!actor || !step) return prettifyStatus(kind);
  const id = FEED_STEP[step] ?? step;
  const what = t.has(`steps.done.${id}`)
    ? t(`steps.done.${id}`)
    : t.has(`landing.kinds.${step}`)
      ? t(`landing.kinds.${step}`)
      : prettifyStatus(step).replaceAll("_", " ");
  const who = t.has(`registrar.activity.actor.${actor}`)
    ? t(`registrar.activity.actor.${actor}`)
    : actor;
  return `${who}: ${what}`;
}

/** ISO 20022 corporate-action kind → badge tone. */
export const KIND_TONE: Record<string, Tone> = {
  INTR: "success",
  REDM: "info",
  MCAL: "warn",
  PCAL: "warn",
  BMET: "violet",
  CHAN: "neutral",
};
