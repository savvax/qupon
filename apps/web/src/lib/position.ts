"use client";

/**
 * Position valuation for the investor portfolio (plan 15 task 1533): clean, accrued and dirty value per holding and
 * yield to maturity, on the shared TS mirrors of the crate math (`accruedSigned`, `ytm`). The chain remains the
 * source of truth for payouts; these are display-side estimates, like `estimateCoupon`.
 */
import {
  DayCount,
  type Ymd,
  addMonths,
  compareYmd,
  ymd,
} from "@qupon/client/src/lib/daycount";
import { accruedSigned } from "@qupon/client/src/lib/accrued";
import { currentYield, dirtyPrice, ytm } from "@qupon/client/src/lib/yield";
import type { SeriesDTO } from "./api";

const DAY_COUNT_CODES: Record<string, DayCount> = {
  THIRTY_360: DayCount.Thirty360,
  ACT_ACT: DayCount.ActAct,
  ACT_365: DayCount.Act365,
};

/** Parse "YYYY-MM-DD" (the API's date fields); undefined when malformed. */
function parseYmd(s: string): Ymd | undefined {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return y && m && d ? ymd(y, m, d) : undefined;
}

/** The coupon date preceding `today` on a schedule walked back from maturity in 12/frequency-month steps. */
export function prevCouponDate(
  maturity: string,
  frequency: number,
  today: string,
): Ymd | undefined {
  const mat = parseYmd(maturity);
  const now = parseYmd(today);
  const step = frequency > 0 ? 12 / frequency : 0;
  if (!mat || !now || !step || !Number.isInteger(step)) return undefined;
  let next = mat;
  while (compareYmd(addMonths(next, -step), now) > 0)
    next = addMonths(next, -step);
  return addMonths(next, -step);
}

export interface PositionValuation {
  /** Clean value of the whole position (units × clean price per unit), minor units. */
  clean: bigint;
  /** Accrued interest of the whole position since the previous coupon date, minor units. */
  accrued: bigint;
  /** Clean + accrued, minor units. */
  dirty: bigint;
  /** Yield to maturity as an annual fraction (street convention), or undefined when not computable. */
  ytm?: number;
  /** Annual coupon cash over the clean price, as a fraction. */
  currentYield?: number;
}

/**
 * Value one position. `cleanPrice` is per unit in minor units — the last traded price, or face when the series has
 * never traded (par: YTM equals the coupon rate). Returns undefined when the inputs do not support the math
 * (unsupported day count, malformed dates, matured series).
 */
export function positionValuation(args: {
  series: Pick<
    SeriesDTO,
    "faceValue" | "couponRateBps" | "frequency" | "dayCount" | "maturityDate"
  >;
  units: string;
  /** per unit, minor units; defaults to face (par) */
  cleanPrice?: bigint;
  /** "YYYY-MM-DD"; defaults to today in Almaty */
  today?: string;
}): PositionValuation | undefined {
  const dc = DAY_COUNT_CODES[args.series.dayCount];
  const face = BigInt(args.series.faceValue.minor);
  const units = BigInt(args.units);
  const cleanPrice = args.cleanPrice ?? face;
  const settle = parseYmd(args.today ?? new Date().toISOString().slice(0, 10));
  const maturity = parseYmd(args.series.maturityDate);
  if (
    dc === undefined ||
    !settle ||
    !maturity ||
    compareYmd(settle, maturity) >= 0
  )
    return undefined; // DayCount.Thirty360 is 0 — never falsy-check the code itself
  const prev = prevCouponDate(
    args.series.maturityDate,
    args.series.frequency,
    args.today ?? new Date().toISOString().slice(0, 10),
  );
  if (!prev) return undefined;
  try {
    const accrued = accruedSigned(
      units,
      face,
      args.series.couponRateBps,
      dc,
      prev,
      settle,
    ).amount;
    const clean = cleanPrice * units;
    return {
      clean,
      accrued,
      dirty: dirtyPrice(clean, accrued),
      ytm: ytm({
        cleanPrice,
        face,
        rateBps: args.series.couponRateBps,
        frequency: args.series.frequency,
        settle,
        maturity,
        dayCount: dc,
      }),
      currentYield: currentYield(args.series.couponRateBps, face, cleanPrice),
    };
  } catch {
    return undefined; // e.g. a price outside the solvable range — show the position without the yield
  }
}
