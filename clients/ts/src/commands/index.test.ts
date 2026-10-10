import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerCommands } from "./index.js";

// Every CLI command must register without option conflicts: a duplicated global flag (sandbox:refuse redeclared
// --keypair on 2026-10-11) makes commander throw at startup, which broke every command — demos, executor, sandbox.
describe("CLI command registry", () => {
	it("registers every command group without conflicts", () => {
		const program = new Command();
		expect(() => registerCommands(program)).not.toThrow();
		expect(program.commands.length).toBeGreaterThan(30);
	});
});
