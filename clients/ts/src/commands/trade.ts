/**
 * `trade:*` — secondary trades settled by the Solana DvP program (docs/03-domain.md §4a).
 * The registrar creates and admits a trade in one transaction, each investor funds its own leg with a plain
 * transfer, and the registrar settles or cancels — always together with `release_trade`, so no command that
 * reports success leaves a trade admitted (an admitted trade blocks the next record date).
 */
import { address, getBase64Encoder, isAddress, type Address, type Instruction, type KeyPairSigner } from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { getTransferCheckedInstruction as getTransferCheckedInstructionSpl } from "@solana-program/token";
import {
	ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
	TOKEN_2022_PROGRAM_ADDRESS,
	findAssociatedTokenPda,
	getCreateAssociatedTokenIdempotentInstruction,
	getTransferCheckedInstruction as getTransferCheckedInstructionT22,
} from "@solana-program/token-2022";
import type { Command } from "commander";
import { getCancelDvpInstruction, getCreateDvpInstruction, getSettleDvpInstruction } from "../dvp/generated/index.js";
import {
	TRADE_ADMISSION_DISCRIMINATOR,
	fetchMaybeTradeAdmission,
	findAdmissionPda,
	getAdmitTradeInstructionAsync,
	getReleaseTradeInstruction,
	getTradeAdmissionDecoder,
	getTradeAdmissionSize,
	type TradeAdmission, findCheckpointPda } from "../generated/index.js";
import {
	MEMO_PROGRAM_ADDRESS,
	cashAmount,
	escrowAta,
	findNonceTombstonePda,
	findSwapDvpPda,
	fundingLeg,
	parseSide,
	readTrade,
	tokenAmount,
	tradeStatus,
	type TradeStatus,
} from "../lib/dvp.js";
import { investorPda } from "../lib/pda.js";
import type { QuponRpc } from "../lib/tx.js";
import {
	initCtx,
	listByKey,
	loadSeries,
	log,
	out,
	parseBigInt,
	parseIntArg,
	sendAndReport,
	signer,
	tokenProgramOfMint,
	withGlobals,
	type GlobalOptions,
	type SeriesInfo,
} from "./common.js";

function addr(s: string, label: string): Address {
	if (!isAddress(s)) throw new Error(`${label} '${s}' is not an address`);
	return address(s);
}

const ata = async (owner: Address, mint: Address, tokenProgram: Address): Promise<Address> =>
	(await findAssociatedTokenPda({ owner, mint, tokenProgram }))[0];

/** Mint decimals (byte 44 of an SPL / Token-2022 mint). */
async function mintDecimals(rpc: QuponRpc, mint: Address): Promise<number> {
	const { value } = await rpc.getAccountInfo(mint, { commitment: "confirmed", encoding: "base64" }).send();
	const decimals = value === null ? undefined : getBase64Encoder().encode(value.data[0])[44];
	if (decimals === undefined) throw new Error(`mint ${mint} not found on chain`);
	return decimals;
}

export interface TradeRow {
	readonly swapDvp: Address;
	readonly escrow: Address;
	readonly seller: Address;
	readonly buyer: Address;
	readonly units: bigint;
	readonly cashAmount: bigint;
	readonly admittedAt: bigint;
	/** `null` once the DvP program closed that escrow. */
	readonly fundedUnits: bigint | null;
	readonly fundedCash: bigint | null;
	readonly status: TradeStatus;
}

/** Every admitted trade of a series with the funding of both legs, oldest first. */
export async function listTrades(rpc: QuponRpc, info: SeriesInfo): Promise<TradeRow[]> {
	const cashMint = info.account.cashMint;
	const cashTokenProgram = await tokenProgramOfMint(rpc, cashMint);
	const admissions = await listByKey(rpc, TRADE_ADMISSION_DISCRIMINATOR, getTradeAdmissionSize(), info.pda, getTradeAdmissionDecoder());
	const rows = await Promise.all(
		admissions.map(async ({ data: a }) => {
			const [fundedUnits, fundedCash] = await Promise.all([
				tokenAmount(rpc, a.escrow),
				tokenAmount(rpc, await escrowAta(a.swapDvp, cashMint, cashTokenProgram)),
			]);
			return {
				swapDvp: a.swapDvp,
				escrow: a.escrow,
				seller: a.seller,
				buyer: a.buyer,
				units: a.units,
				cashAmount: a.cashAmount,
				admittedAt: a.admittedAt,
				fundedUnits,
				fundedCash,
				status: tradeStatus(a.units, a.cashAmount, fundedUnits, fundedCash),
			};
		}),
	);
	return rows.sort((x, y) => Number(x.admittedAt - y.admittedAt) || x.swapDvp.localeCompare(y.swapDvp));
}

interface Admitted {
	readonly admission: Address;
	readonly data: TradeAdmission;
}

async function admitted(rpc: QuponRpc, info: SeriesInfo, swapDvp: Address): Promise<Admitted> {
	const [admission] = await findAdmissionPda({ series: info.pda, swapDvp });
	const account = await fetchMaybeTradeAdmission(rpc, admission);
	if (!account.exists) throw new Error(`trade ${swapDvp} is not admitted for series '${info.name}'`);
	return { admission, data: account.data };
}

async function releaseIx(registrar: KeyPairSigner, info: SeriesInfo, adm: Admitted, force: boolean): Promise<Instruction> {
	return getReleaseTradeInstruction({
		authority: registrar,
		series: info.pda,
		mint: info.mint,
		admission: adm.admission,
		escrow: adm.data.escrow,
		seller: await investorPda(info.pda, adm.data.seller),
		sellerBondAta: await ata(adm.data.seller, info.mint, TOKEN_2022_PROGRAM_ADDRESS),
		// Hooked series: the escrow owner's record-date checkpoint is closed with the admission (unused otherwise).
		escrowCheckpoint: (await findCheckpointPda({ series: info.pda, owner: adm.data.swapDvp }))[0],
		force,
	});
}

interface CreateOpts extends GlobalOptions {
	series: string;
	seller: string;
	buyer: string;
	units: string;
	price?: string;
	expiryMin: string;
	ref?: string;
}

async function runCreate(opts: CreateOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const seller = addr(opts.seller, "--seller");
	const buyer = addr(opts.buyer, "--buyer");
	const units = parseBigInt(opts.units, "--units");
	const price = opts.price !== undefined ? parseBigInt(opts.price, "--price") : info.account.faceValue;
	const cash = cashAmount(units, price);
	if (opts.ref !== undefined && new TextEncoder().encode(opts.ref).length > 64) throw new Error("--ref: at most 64 bytes");

	const cashMint = info.account.cashMint;
	const cashTokenProgram = await tokenProgramOfMint(rpc, cashMint);
	// A random nonce: a predictable one lets a third party squat the trade's address (DvP README).
	const nonce = crypto.getRandomValues(new BigUint64Array(1))[0] ?? 0n;
	const swapDvp = await findSwapDvpPda({ settlementAuthority: registrar.address, userA: seller, userB: buyer, mintA: info.mint, mintB: cashMint, nonce });
	const escrowBond = await escrowAta(swapDvp, info.mint, TOKEN_2022_PROGRAM_ADDRESS);
	const escrowCash = await escrowAta(swapDvp, cashMint, cashTokenProgram);
	const create = getCreateDvpInstruction({
		payer: registrar,
		swapDvp,
		nonceTombstone: await findNonceTombstonePda(swapDvp),
		settlementAuthority: registrar.address,
		userA: seller,
		userB: buyer,
		mintA: info.mint,
		mintB: cashMint,
		dvpAtaA: escrowBond,
		dvpAtaB: escrowCash,
		systemProgram: SYSTEM_PROGRAM_ADDRESS,
		tokenProgramA: TOKEN_2022_PROGRAM_ADDRESS,
		tokenProgramB: cashTokenProgram,
		associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
		amountA: units,
		amountB: cash,
		expiryTimestamp: BigInt(Math.floor(Date.now() / 1000)) + BigInt(parseIntArg(opts.expiryMin, "--expiry-min")) * 60n,
		nonce,
		refString: opts.ref ?? null,
		userASettlementDestination: null,
		userBSettlementDestination: null,
		earliestSettlementTimestamp: null,
	});
	const admit = await getAdmitTradeInstructionAsync({
		authority: registrar,
		series: info.pda,
		mint: info.mint,
		swapDvp,
		seller: await investorPda(info.pda, seller),
		buyer: await investorPda(info.pda, buyer),
	});
	log(`trade ${swapDvp}: ${units} bonds for ${cash} minor units of cash; the registrar settles`);
	await sendAndReport(rpc, registrar, [create, admit], "trade:create", { swapDvp, escrowBond, escrowCash, nonce, seller, buyer, units, cashAmount: cash });
}

interface TradeOpts extends GlobalOptions {
	series: string;
	trade: string;
}

async function runFund(opts: TradeOpts & { side: string }, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const owner = await signer(cmd, "investor");
	const swapDvp = addr(opts.trade, "--trade");
	const side = parseSide(opts.side);
	// Verify before funding: CreateDvp is permissionless, so the on-chain terms are what counts.
	const trade = await readTrade(rpc, swapDvp);
	if (trade === null) throw new Error(`trade ${swapDvp} is closed`);
	if (trade.mintA !== info.mint || trade.mintB !== info.account.cashMint) {
		throw new Error(`trade ${swapDvp} is not ${info.name} bonds against the series' cash asset`);
	}
	const leg = fundingLeg(trade, owner.address, side);
	const escrow = await escrowAta(swapDvp, leg.mint, leg.tokenProgram);
	const funded = await tokenAmount(rpc, escrow);
	if (funded === null) throw new Error(`escrow ${escrow} does not exist`);
	if (funded >= leg.amount) throw new Error(`the ${side} leg is already funded`);
	const transfer = leg.tokenProgram === TOKEN_2022_PROGRAM_ADDRESS ? getTransferCheckedInstructionT22 : getTransferCheckedInstructionSpl;
	const instruction = transfer({
		source: await ata(owner.address, leg.mint, leg.tokenProgram),
		mint: leg.mint,
		destination: escrow,
		authority: owner,
		amount: leg.amount - funded,
		decimals: await mintDecimals(rpc, leg.mint),
	});
	await sendAndReport(rpc, owner, [instruction], "trade:fund", { swapDvp, side, escrow, amount: leg.amount - funded });
}

async function runSettle(opts: TradeOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const swapDvp = addr(opts.trade, "--trade");
	const adm = await admitted(rpc, info, swapDvp);
	const trade = await readTrade(rpc, swapDvp);
	if (trade === null) throw new Error(`trade ${swapDvp} is already closed — run trade:cancel to release its admission`);
	const { seller, buyer } = adm.data;
	const settle = getSettleDvpInstruction({
		settlementAuthority: registrar,
		swapDvp,
		mintA: trade.mintA,
		mintB: trade.mintB,
		dvpAtaA: adm.data.escrow,
		dvpAtaB: await escrowAta(swapDvp, trade.mintB, trade.tokenProgramB),
		userADestinationAtaB: await ata(seller, trade.mintB, trade.tokenProgramB),
		userBDestinationAtaA: await ata(buyer, trade.mintA, trade.tokenProgramA),
		userAAtaA: await ata(seller, trade.mintA, trade.tokenProgramA),
		userBAtaB: await ata(buyer, trade.mintB, trade.tokenProgramB),
		tokenProgramA: trade.tokenProgramA,
		tokenProgramB: trade.tokenProgramB,
		memoProgram: MEMO_PROGRAM_ADDRESS,
		legAExtrasCount: 0,
	});
	await sendAndReport(rpc, registrar, [settle, await releaseIx(registrar, info, adm, false)], "trade:settle", {
		swapDvp,
		seller,
		buyer,
		units: adm.data.units,
		cashAmount: adm.data.cashAmount,
	});
}

async function runCancel(opts: TradeOpts & { force?: boolean }, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const swapDvp = addr(opts.trade, "--trade");
	const adm = await admitted(rpc, info, swapDvp);
	const trade = await readTrade(rpc, swapDvp);
	const { seller, buyer } = adm.data;
	const force = opts.force === true;
	const instructions: Instruction[] = [];
	if (force) {
		// The seller may have closed the bond account: recreate it (frozen by default); release_trade thaws it.
		instructions.push(
			getCreateAssociatedTokenIdempotentInstruction({
				payer: registrar,
				ata: await ata(seller, info.mint, TOKEN_2022_PROGRAM_ADDRESS),
				owner: seller,
				mint: info.mint,
				tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
			}),
		);
	} else if (trade !== null) {
		const buyerCash = await ata(buyer, trade.mintB, trade.tokenProgramB);
		instructions.push(
			getCreateAssociatedTokenIdempotentInstruction({ payer: registrar, ata: buyerCash, owner: buyer, mint: trade.mintB, tokenProgram: trade.tokenProgramB }),
			getCancelDvpInstruction({
				settlementAuthority: registrar,
				swapDvp,
				mintA: trade.mintA,
				mintB: trade.mintB,
				dvpAtaA: adm.data.escrow,
				dvpAtaB: await escrowAta(swapDvp, trade.mintB, trade.tokenProgramB),
				userAAtaA: await ata(seller, trade.mintA, trade.tokenProgramA),
				userBAtaB: buyerCash,
				tokenProgramA: trade.tokenProgramA,
				tokenProgramB: trade.tokenProgramB,
				memoProgram: MEMO_PROGRAM_ADDRESS,
				legAExtrasCount: 0,
			}),
		);
	}
	const returnedUnits = force ? ((await tokenAmount(rpc, adm.data.escrow)) ?? 0n) : 0n;
	instructions.push(await releaseIx(registrar, info, adm, force));
	if (force && trade !== null) log("forced release: the DvP record stays open — the buyer takes the cash back with ReclaimDvp");
	await sendAndReport(rpc, registrar, instructions, "trade:cancel", { swapDvp, seller, buyer, forced: force, returnedUnits });
}

async function runList(opts: GlobalOptions & { series: string }, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	out({ series: info.pda, openTrades: info.account.openTrades, trades: await listTrades(rpc, info) });
}

export function registerTradeCommands(program: Command): void {
	const series = (c: Command): Command => c.requiredOption("--series <name>", "series name in config/devnet.json");
	const trade = (c: Command): Command => series(c).requiredOption("--trade <swapDvp>", "the trade's SwapDvp address (trade:create prints it)");

	series(withGlobals(program.command("trade:create").description("secondary trade: CreateDvp on the Solana DvP program + admit_trade, one transaction (registrar)")))
		.requiredOption("--seller <address>", "registered investor delivering the bonds")
		.requiredOption("--buyer <address>", "registered investor paying the cash")
		.requiredOption("--units <n>", "bonds to trade")
		.option("--price <minor>", "price per bond in minor units of the cash asset (default: face value)")
		.option("--expiry-min <n>", "minutes until the DvP program refuses settlement", "60")
		.option("--ref <text>", "client reference stored on the trade (≤ 64 bytes)")
		.action(runCreate);

	trade(withGlobals(program.command("trade:fund").description("fund your leg of a trade with a plain token transfer (investor signs)")))
		.requiredOption("--side <side>", "seller | buyer")
		.action(runFund);

	trade(withGlobals(program.command("trade:settle").description("SettleDvp (both legs atomically) + release_trade, one transaction (registrar)"))).action(runSettle);

	trade(withGlobals(program.command("trade:cancel").description("CancelDvp (refund both legs) + release_trade, one transaction (registrar)")))
		.option("--force", "skip the DvP program: return escrowed bonds to the seller as permanent delegate (when CancelDvp cannot refund)")
		.action(runCancel);

	series(withGlobals(program.command("trade:list").description("admitted trades of a series with the funding of both legs"))).action(runList);
}
