import { describe, expect, it } from "vitest";
import { isAllowedWrite } from "./allowlist";

describe("isAllowedWrite", () => {
  it.each([
    "issuer/series",
    "registrar/actions/9kcu/advance",
    "demo/investor/vote",
    "registrar/investors/M1/O1/suspend",
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
  ])("rejects %s", (p) => {
    expect(isAllowedWrite(p)).toBe(false);
  });
});
