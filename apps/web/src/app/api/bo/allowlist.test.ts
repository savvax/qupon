import { describe, expect, it } from "vitest";
import {
  isAllowedRead,
  isAllowedUpload,
  isAllowedWrite,
  isPublicRead,
  isPublicWrite,
} from "./allowlist";

describe("isAllowedWrite", () => {
  it.each([
    "issuer/series",
    "registrar/actions/9kcu/advance",
    "demo/investor/vote",
    "registrar/investors/M1/O1/suspend",
    "admin/users/3",
    "me/wallets/challenge",
    "org/invites",
    // plan 15 D6: bank payout confirmation (paying agent / registrar route on the Go side)
    "actions/ActnINTR0001Dem0PDA111111111111111111111111111/confirm-bank",
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
    // only the confirm-bank write is admitted under actions/, nothing else
    "actions/ActnINTR0001Dem0PDA111111111111111111111111111/advance",
    "actions/x/confirm-bank/../confirm-bank",
  ])("rejects %s", (p) => {
    expect(isAllowedWrite(p)).toBe(false);
  });
});

describe("isAllowedRead", () => {
  it.each([
    "admin/audit",
    "me/reports/statement",
    "documents/12",
    // plan 15 D9: the browser-side disclosure hash check fetches the seev.031 through the session proxy
    "actions/ActnINTR0001Dem0PDA111111111111111111111111111/iso/seev031.xml",
  ])("allows %s", (p) => {
    expect(isAllowedRead(p)).toBe(true);
  });
  it.each([
    "auth/me",
    "admin/../auth",
    "series",
    "me//x",
    "",
    // other action reads stay direct API calls, not proxied
    "actions/x/iso/seev036.zip",
    "actions/x/notice",
  ])("rejects %s", (p) => {
    expect(isAllowedRead(p)).toBe(false);
  });
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

describe("isPublicWrite / isPublicRead (sandbox, no session)", () => {
  it("allows only the sandbox create, its scenarios and its read", () => {
    expect(isPublicWrite("demo/sandbox")).toBe(true);
    expect(isPublicWrite("demo/sandbox/ab12-x/scenario")).toBe(true);
    expect(isPublicRead("demo/sandbox/ab12-x")).toBe(true);
    for (const p of [
      "demo/investor/vote",
      "demo/sandbox/a/../../admin",
      "demo/sandbox/a/scenario/x",
      "demo/sandboxes",
    ])
      expect(isPublicWrite(p), p).toBe(false);
    for (const p of ["demo/sandbox", "demo/sandbox/a/scenario", "demo/sandbox/../x"])
      expect(isPublicRead(p), p).toBe(false);
  });
});
