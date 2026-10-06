import { describe, expect, it } from "vitest";
import {
  ago,
  notice,
  seriesIndex,
  type NotificationDTO,
} from "./notifications";

const idx = seriesIndex([
  { mint: "MINT1", pda: "PDA1", ticker: "QPNb1" } as never,
]);
const n = (
  kind: string,
  payload: Record<string, unknown>,
): NotificationDTO => ({
  id: 1,
  kind,
  payload,
  createdAt: 0,
  readAt: null,
});

describe("notice", () => {
  it("names the bond by PDA or mint and links where the user acts", () => {
    expect(
      notice(
        n("action_announced", { series: "PDA1", actionKind: "INTR" }),
        idx,
      ),
    ).toMatchObject({
      values: { ticker: "QPNb1", actionKind: "INTR" },
      href: "/bonds/MINT1?tab=actions",
    });
    expect(notice(n("entitlement_paid", { series: "MINT1" }), idx).href).toBe(
      "/investor/statements",
    );
    expect(notice(n("meeting_opened", { series: "PDA1" }), idx).href).toBe(
      "/investor/meetings",
    );
  });
  it("splits KYC decisions and keeps unknown kinds readable", () => {
    expect(
      notice(n("kyc_decision", { status: "rejected", reason: "blurry" }), idx),
    ).toMatchObject({
      kind: "kyc_rejected",
      tone: "danger",
      values: { reason: "blurry" },
    });
    expect(notice(n("kyc_decision", { status: "approved" }), idx).kind).toBe(
      "kyc_approved",
    );
    expect(notice(n("something_new", {}), idx).kind).toBe("other");
  });
});

describe("ago", () => {
  it("formats coarse relative time", () => {
    const now = 1_000_000_000_000;
    expect(ago(now / 1000 - 300, "en", now)).toBe("5 min. ago");
    expect(ago(now / 1000 - 7200, "en", now)).toBe("2 hr. ago");
  });
});
