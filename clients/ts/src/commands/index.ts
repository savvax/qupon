/**
 * Command-group registry. Later tasks add a new `commands/<group>.ts` plus one
 * line here — nothing else in the CLI changes.
 */
import type { Command } from "commander";
import { registerAssetCommands } from "./asset.js";
import { registerDisclosureCommands } from "./disclosure.js";
import { registerKycCommands } from "./kyc.js";
import { registerActionCommands } from "./action.js";
import { registerInvestorCommands } from "./investor.js";
import { registerLifecycleCommands } from "./lifecycle.js";
import { registerPayoutCommands } from "./payout.js";
import { registerSeriesCommands } from "./series.js";
import { registerSeriesCreateCommand } from "./seriesCreate.js";
import { registerProofCommands } from "./proof.js";
import { registerStateCommands } from "./state.js";
import { registerTradeCommands } from "./trade.js";

export function registerCommands(program: Command): void {
	registerAssetCommands(program);
	registerSeriesCommands(program);
	registerSeriesCreateCommand(program);
	registerInvestorCommands(program);
	registerKycCommands(program);
	registerActionCommands(program);
	registerDisclosureCommands(program);
	registerLifecycleCommands(program);
	registerPayoutCommands(program);
	registerTradeCommands(program);
	registerProofCommands(program);
	registerStateCommands(program);
}
