import { describe, expect, it } from "vitest";
import { isAllowedRead, isAllowedUpload, isAllowedWrite } from "./allowlist";

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

describe("isAllowedUpload", () => {
  it.each([
    "me/documents",
    "issuer/series/DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo/documents",
  ])("allows %s", (p) => {
    expect(isAllowedUpload(p)).toBe(true);
  });
  it.each([
    "me/kyc",
    "me/documents/1",
    "issuer/series/../documents",
    "issuer/series/x/documents",
    "admin/documents",
  ])("rejects %s", (p) => {
    expect(isAllowedUpload(p)).toBe(false);
  });
});
