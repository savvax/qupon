import { describe, expect, it } from "vitest";
import { defaultCorpId, padAscii } from "./common.js";

describe("defaultCorpId", () => {
	it("keeps short series names as they are", () => {
		expect(defaultCorpId("QPNb1", "INTR", 1)).toBe("QPNb1-INTR-0001");
	});
	it("shortens long names so the id fits the 16-byte field", () => {
		for (const name of ["QPNb1-tmg46q", "E2E-1a2b3c4d5e", "ABCDEFGHIJKLMNOP"]) {
			const id = defaultCorpId(name, "BMET", 12);
			expect(id.length).toBeLessThanOrEqual(16);
			expect(() => padAscii(id, 16)).not.toThrow();
			expect(id.endsWith("-BMET-0012")).toBe(true);
		}
		expect(defaultCorpId("QPNb1-tmg46q", "INTR", 1)).toBe("QPNb1t-INTR-0001");
	});
});
