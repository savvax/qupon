import { describe, expect, it } from "vitest";
import { isAllowedRead, isAllowedWrite } from "./allowlist";

describe("isAllowedWrite", () => {
  it.each([
    "issuer/series",
    "registrar/actions/9kcu/advance",
    "demo/investor/vote",
    "registrar/investors/M1/O1/suspend",
    "admin/users/3",
    "me/wallets/challenge",
    "org/invites",
  ])("allows %s", (p) => {
    expect(isAllowedWrite(p)).toBe(true);
  });
  it.each([
    "auth/login",
    "issuer/../auth/demo",
    "registrar//x",
    "",
    "issuer",
    "approvals/1/approve",
    "issuer/series?x=1",
    "issuer/%2e%2e/auth",
    "documents/1",
    "kase/bonds/X",
  ])("rejects %s", (p) => {
    expect(isAllowedWrite(p)).toBe(false);
  });
});

describe("isAllowedRead", () => {
  it.each(["admin/audit", "me/reports/statement", "documents/12"])(
    "allows %s",
    (p) => {
      expect(isAllowedRead(p)).toBe(true);
    },
  );
  it.each(["auth/me", "admin/../auth", "series", "me//x", ""])(
    "rejects %s",
    (p) => {
      expect(isAllowedRead(p)).toBe(false);
    },
  );
});
