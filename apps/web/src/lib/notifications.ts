import type { SeriesDTO } from "./api";

/** Window event: something marked notifications read — the bell re-counts at once instead of at its next poll. */
export const NOTIFICATIONS_CHANGED = "qupon:notifications";

/** GET /me/notifications row (task 805). */
export type NotificationDTO = {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: number;
  readAt: number | null;
};

export type SeriesRef = { ticker: string; mint: string };

/** Events name a series by PDA (live) or mint (mocks): index both. */
export function seriesIndex(series: SeriesDTO[]): Map<string, SeriesRef> {
  const out = new Map<string, SeriesRef>();
  for (const s of series) {
    out.set(s.mint, { ticker: s.ticker, mint: s.mint });
    if (s.pda) out.set(s.pda, { ticker: s.ticker, mint: s.mint });
  }
  return out;
}

export type Notice = {
  /** message key under notify.kinds.<kind> (falls back to "other") */
  kind: string;
  values: { ticker: string; actionKind: string; reason: string };
  href: string;
  tone: "info" | "success" | "warn" | "danger";
};

const KNOWN = [
  "action_announced",
  "meeting_opened",
  "meeting_finalized",
  "entitlement_paid",
  "kyc_decision",
];

/** What a notification says and where it leads; texts live in messages/notify.json. */
export function notice(
  n: NotificationDTO,
  idx: Map<string, SeriesRef>,
): Notice {
  const p = n.payload ?? {};
  const ref = idx.get(String(p.series ?? ""));
  const values = {
    ticker: ref?.ticker ?? "—",
    actionKind: String(p.actionKind ?? ""),
    reason: String(p.reason ?? ""),
  };
  const bond = ref ? `/bonds/${ref.mint}?tab=actions` : "/investor";
  switch (n.kind) {
    case "action_announced":
      return { kind: n.kind, values, href: bond, tone: "info" };
    case "meeting_opened":
    case "meeting_finalized":
      return { kind: n.kind, values, href: "/investor/meetings", tone: "info" };
    case "entitlement_paid":
      return {
        kind: n.kind,
        values,
        href: "/investor/statements",
        tone: "success",
      };
    case "kyc_decision":
      return {
        kind: p.status === "approved" ? "kyc_approved" : "kyc_rejected",
        values,
        href: "/investor/kyc",
        tone: p.status === "approved" ? "success" : "danger",
      };
  }
  return {
    kind: KNOWN.includes(n.kind) ? n.kind : "other",
    values,
    href: "/account/notifications",
    tone: "info",
  };
}

/** "5 min ago" / "5 мин. назад" — coarse relative time for lists. */
export function ago(
  unixSeconds: number,
  locale: string,
  now = Date.now(),
): string {
  const s = Math.round(unixSeconds - now / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "short",
  });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
