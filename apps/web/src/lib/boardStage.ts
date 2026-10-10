/**
 * The public board's life-stage chip (task 1535): a bond's status rendered as where it is in its life —
 * "In default", "Voting", "Paying", "Record date soon", "Redeemed" — not the raw chain enum.
 * Pure: the board passes the series, its open action (fetched only when `openAction` is set) and `now`.
 */
import type { ActionDTO, SeriesDTO } from "./api";

export type BoardStage =
  | "inDefault"
  | "voting"
  | "paying"
  | "recordSoon"
  | "redeemed"
  | "live"
  | "issued";

/** Days before the record date (next coupon − 1 day) that still count as "Record date soon". */
export const RECORD_SOON_DAYS = 10;

export function boardStage(
  s: Pick<SeriesDTO, "status" | "inDefault" | "nextCouponDate">,
  open?: ActionDTO | null,
  now = Date.now(),
): BoardStage {
  if (s.inDefault || open?.status === "Defaulted") return "inDefault";
  if (
    s.status === "Closed" ||
    s.status === "Matured" ||
    s.status === "Retiring"
  )
    return "redeemed";
  if (open) {
    if (open.status === "VotingOpen") return "voting";
    if (open.status === "Funded" || open.status === "Settling") return "paying";
    if (open.status === "Announced" && new Date(open.recordAt).getTime() > now)
      return "recordSoon";
    return "live";
  }
  // No open action: the next coupon's record date (period end − 1 day) is the next life event.
  const record = new Date(s.nextCouponDate).getTime() - 86_400_000;
  return Number.isFinite(record) &&
    record > now &&
    record - now <= RECORD_SOON_DAYS * 86_400_000
    ? "recordSoon"
    : "issued";
}
