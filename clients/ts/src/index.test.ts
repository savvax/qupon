import { describe, expect, it } from "vitest";
import { address } from "@solana/kit";
import { QUPON_PROGRAM_ID } from "./index.js";

describe("scaffold", () => {
  it("program id is a valid address", () => {
    expect(address(QUPON_PROGRAM_ID)).toBe(QUPON_PROGRAM_ID);
  });
});
