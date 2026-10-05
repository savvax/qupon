import { describe, expect, it } from "vitest";
import { explainBoError, safeNext } from "./boClient";

describe("explainBoError", () => {
  it("names the on-chain error and explains it", () => {
    expect(
      explainBoError({
        status: 409,
        code: "onchain",
        message: "x",
        onchainError: "TooEarly",
      }),
    ).toMatch(/^TooEarly — /);
  });
  it("finds the error name inside raw CLI text", () => {
    expect(
      explainBoError({
        status: 409,
        code: "onchain",
        message: "custom program error: 0x177e (KycAttestationInvalid)",
      }),
    ).toMatch(/^KycAttestationInvalid — /);
  });
  it("maps 401 to session expired", () => {
    expect(
      explainBoError({
        status: 401,
        code: "unauthenticated",
        message: "sign in required",
      }),
    ).toMatch(/session/i);
  });
  it("falls back to the API message", () => {
    expect(
      explainBoError({
        status: 400,
        code: "invalid_params",
        message: "isin must be 12 characters",
      }),
    ).toBe("isin must be 12 characters");
  });
});

describe("safeNext", () => {
  it.each([
    ["/registrar", "/registrar"],
    ["/issuer/series/new", "/issuer/series/new"],
    ["//evil.com", undefined],
    ["/\\evil.com", undefined],
    ["https://evil.com", undefined],
    ["/\t/evil.com", undefined],
    ["/\n/evil.com", undefined],
    ["/ok\\..\\evil", undefined],
    ["/registrar/actions?x=1", "/registrar/actions?x=1"],
    ["", undefined],
    [undefined, undefined],
  ])("%s → %s", (input, want) => {
    expect(safeNext(input)).toBe(want);
  });
});
