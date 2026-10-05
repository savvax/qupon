/**
 * Command-group registry. Later tasks add a new `commands/<group>.ts` plus one
 * line here — nothing else in the CLI changes.
 */
import type { Command } from "commander";
import { registerActionCommands } from "./action.js";
import { registerInvestorCommands } from "./investor.js";
import { registerSeriesCommands } from "./series.js";
import { registerStateCommands } from "./state.js";

export function registerCommands(program: Command): void {
	registerSeriesCommands(program);
	registerInvestorCommands(program);
	registerActionCommands(program);
	registerStateCommands(program);
}
