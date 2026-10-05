export type Tone =
  "success" | "warn" | "danger" | "info" | "neutral" | "violet";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: "bg-g50", fg: "text-g700" },
  warn: { bg: "bg-warn-bg", fg: "text-warn-fg" },
  danger: { bg: "bg-err-bg", fg: "text-err-fg" },
  info: { bg: "bg-p50", fg: "text-p700" },
  neutral: { bg: "bg-n100", fg: "text-n600" },
  violet: { bg: "bg-[#f3efff]", fg: "text-[#5b3cc4]" },
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
