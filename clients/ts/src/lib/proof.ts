/**
 * Machine-readable proof manifest types + offline verification of one step
 * against a recorded `getTransaction` response (fixtures/proof.schema.json is
 * the contract; `qupon proof:verify` is the network-facing caller).
 */
import type { ReadonlyUint8Array } from "@solana/kit";
import { parseActionAnnouncedEvent, ACTION_ANNOUNCED_EVENT_DISCRIMINATOR } from "../generated/events/actionAnnounced.js";
import { parseActionCancelledEvent, ACTION_CANCELLED_EVENT_DISCRIMINATOR } from "../generated/events/actionCancelled.js";
import { parseActionCompletedEvent, ACTION_COMPLETED_EVENT_DISCRIMINATOR } from "../generated/events/actionCompleted.js";
import { parseActionDefaultedEvent, ACTION_DEFAULTED_EVENT_DISCRIMINATOR } from "../generated/events/actionDefaulted.js";
import { parseActionFundedEvent, ACTION_FUNDED_EVENT_DISCRIMINATOR } from "../generated/events/actionFunded.js";
import { parseBankPayoutConfirmedEvent, BANK_PAYOUT_CONFIRMED_EVENT_DISCRIMINATOR } from "../generated/events/bankPayoutConfirmed.js";
import { parseDefaultCuredEvent, DEFAULT_CURED_EVENT_DISCRIMINATOR } from "../generated/events/defaultCured.js";
import { parseDisclosureAttachedEvent, DISCLOSURE_ATTACHED_EVENT_DISCRIMINATOR } from "../generated/events/disclosureAttached.js";
import { parseEntitlementPaidEvent, ENTITLEMENT_PAID_EVENT_DISCRIMINATOR } from "../generated/events/entitlementPaid.js";
import { parseEscrowSweptEvent, ESCROW_SWEPT_EVENT_DISCRIMINATOR } from "../generated/events/escrowSwept.js";
import { parseHolderSnapshottedEvent, HOLDER_SNAPSHOTTED_EVENT_DISCRIMINATOR } from "../generated/events/holderSnapshotted.js";
import { parseInvestorRegisteredEvent, INVESTOR_REGISTERED_EVENT_DISCRIMINATOR } from "../generated/events/investorRegistered.js";
import { parseInvestorStatusChangedEvent, INVESTOR_STATUS_CHANGED_EVENT_DISCRIMINATOR } from "../generated/events/investorStatusChanged.js";
import { parseMeetingFinalizedEvent, MEETING_FINALIZED_EVENT_DISCRIMINATOR } from "../generated/events/meetingFinalized.js";
import { parsePaidToAgentEvent, PAID_TO_AGENT_EVENT_DISCRIMINATOR } from "../generated/events/paidToAgent.js";
import { parsePayoutRouteSetEvent, PAYOUT_ROUTE_SET_EVENT_DISCRIMINATOR } from "../generated/events/payoutRouteSet.js";
import { parseRecordStruckEvent, RECORD_STRUCK_EVENT_DISCRIMINATOR } from "../generated/events/recordStruck.js";
import { parseSeriesClosedEvent, SERIES_CLOSED_EVENT_DISCRIMINATOR } from "../generated/events/seriesClosed.js";
import { parseSeriesInitializedEvent, SERIES_INITIALIZED_EVENT_DISCRIMINATOR } from "../generated/events/seriesInitialized.js";
import { parseSnapshotFinalizedEvent, SNAPSHOT_FINALIZED_EVENT_DISCRIMINATOR } from "../generated/events/snapshotFinalized.js";
import { parseSubscribedEvent, SUBSCRIBED_EVENT_DISCRIMINATOR } from "../generated/events/subscribed.js";
import { parseTermsChangedEvent, TERMS_CHANGED_EVENT_DISCRIMINATOR } from "../generated/events/termsChanged.js";
import { parseTradeAccruedEvent, TRADE_ACCRUED_EVENT_DISCRIMINATOR } from "../generated/events/tradeAccrued.js";
import { parseTradeAdmittedEvent, TRADE_ADMITTED_EVENT_DISCRIMINATOR } from "../generated/events/tradeAdmitted.js";
import { parseTradeReleasedEvent, TRADE_RELEASED_EVENT_DISCRIMINATOR } from "../generated/events/tradeReleased.js";
import { parseUnitsIssuedEvent, UNITS_ISSUED_EVENT_DISCRIMINATOR } from "../generated/events/unitsIssued.js";
import { parseUnitsRetiredEvent, UNITS_RETIRED_EVENT_DISCRIMINATOR } from "../generated/events/unitsRetired.js";
import { parseVoteCastEvent, VOTE_CAST_EVENT_DISCRIMINATOR } from "../generated/events/voteCast.js";

/** Manifest step (fixtures/proof.schema.json). */
export interface ProofStep {
	readonly id: string;
	readonly label: string;
	readonly signature: string;
	readonly slot?: number | null;
	readonly instruction: string;
	readonly expect?: { readonly event?: string; readonly fields?: Record<string, string | number> };
}

export interface ProofManifest {
	readonly version: 1;
	readonly cluster: string;
	readonly programId: string;
	readonly generatedAt: string;
	readonly steps: ProofStep[];
}

/** Minimal structural slice of an RPC `getTransaction` response the verifier needs. */
export interface RecordedTransaction {
	readonly slot?: number | bigint;
	readonly meta: { readonly err: unknown; readonly logMessages: readonly string[] | null } | null;
}

interface EventParser {
	readonly name: string;
	readonly discriminator: ReadonlyUint8Array;
	readonly parse: (data: ReadonlyUint8Array | Uint8Array) => Record<string, unknown>;
}

const hex = (bytes: ReadonlyUint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

/** One map entry keyed by the event discriminator's hex string. */
function parser(name: string, discriminator: ReadonlyUint8Array, parse: EventParser["parse"]): [string, EventParser] {
	return [hex(discriminator), { name, discriminator, parse }];
}

/** Every Anchor event of the program, routed by its 8-byte discriminator (Codama decoders). */
const EVENT_PARSERS: ReadonlyMap<string, EventParser> = new Map([
	parser("ActionAnnounced", ACTION_ANNOUNCED_EVENT_DISCRIMINATOR, parseActionAnnouncedEvent),
	parser("ActionCancelled", ACTION_CANCELLED_EVENT_DISCRIMINATOR, parseActionCancelledEvent),
	parser("ActionCompleted", ACTION_COMPLETED_EVENT_DISCRIMINATOR, parseActionCompletedEvent),
	parser("ActionDefaulted", ACTION_DEFAULTED_EVENT_DISCRIMINATOR, parseActionDefaultedEvent),
	parser("ActionFunded", ACTION_FUNDED_EVENT_DISCRIMINATOR, parseActionFundedEvent),
	parser("BankPayoutConfirmed", BANK_PAYOUT_CONFIRMED_EVENT_DISCRIMINATOR, parseBankPayoutConfirmedEvent),
	parser("DefaultCured", DEFAULT_CURED_EVENT_DISCRIMINATOR, parseDefaultCuredEvent),
	parser("DisclosureAttached", DISCLOSURE_ATTACHED_EVENT_DISCRIMINATOR, parseDisclosureAttachedEvent),
	parser("EntitlementPaid", ENTITLEMENT_PAID_EVENT_DISCRIMINATOR, parseEntitlementPaidEvent),
	parser("EscrowSwept", ESCROW_SWEPT_EVENT_DISCRIMINATOR, parseEscrowSweptEvent),
	parser("HolderSnapshotted", HOLDER_SNAPSHOTTED_EVENT_DISCRIMINATOR, parseHolderSnapshottedEvent),
	parser("InvestorRegistered", INVESTOR_REGISTERED_EVENT_DISCRIMINATOR, parseInvestorRegisteredEvent),
	parser("InvestorStatusChanged", INVESTOR_STATUS_CHANGED_EVENT_DISCRIMINATOR, parseInvestorStatusChangedEvent),
	parser("MeetingFinalized", MEETING_FINALIZED_EVENT_DISCRIMINATOR, parseMeetingFinalizedEvent),
	parser("PaidToAgent", PAID_TO_AGENT_EVENT_DISCRIMINATOR, parsePaidToAgentEvent),
	parser("PayoutRouteSet", PAYOUT_ROUTE_SET_EVENT_DISCRIMINATOR, parsePayoutRouteSetEvent),
	parser("RecordStruck", RECORD_STRUCK_EVENT_DISCRIMINATOR, parseRecordStruckEvent),
	parser("SeriesClosed", SERIES_CLOSED_EVENT_DISCRIMINATOR, parseSeriesClosedEvent),
	parser("SeriesInitialized", SERIES_INITIALIZED_EVENT_DISCRIMINATOR, parseSeriesInitializedEvent),
	parser("SnapshotFinalized", SNAPSHOT_FINALIZED_EVENT_DISCRIMINATOR, parseSnapshotFinalizedEvent),
	parser("Subscribed", SUBSCRIBED_EVENT_DISCRIMINATOR, parseSubscribedEvent),
	parser("TermsChanged", TERMS_CHANGED_EVENT_DISCRIMINATOR, parseTermsChangedEvent),
	parser("TradeAccrued", TRADE_ACCRUED_EVENT_DISCRIMINATOR, parseTradeAccruedEvent),
	parser("TradeAdmitted", TRADE_ADMITTED_EVENT_DISCRIMINATOR, parseTradeAdmittedEvent),
	parser("TradeReleased", TRADE_RELEASED_EVENT_DISCRIMINATOR, parseTradeReleasedEvent),
	parser("UnitsIssued", UNITS_ISSUED_EVENT_DISCRIMINATOR, parseUnitsIssuedEvent),
	parser("UnitsRetired", UNITS_RETIRED_EVENT_DISCRIMINATOR, parseUnitsRetiredEvent),
	parser("VoteCast", VOTE_CAST_EVENT_DISCRIMINATOR, parseVoteCastEvent),
]);

export interface DecodedEvent {
	readonly name: string;
	readonly data: Record<string, unknown>;
}

/** Decode every Anchor `Program data: <base64>` cpi/log line through the Codama event decoders. */
export function decodeEventsFromLogs(logs: readonly string[] | null): DecodedEvent[] {
	const events: DecodedEvent[] = [];
	for (const line of logs ?? []) {
		if (!line.startsWith("Program data: ")) continue;
		const bytes = Buffer.from(line.slice("Program data: ".length), "base64");
		const parser = EVENT_PARSERS.get(hex(bytes.subarray(0, 8)));
		if (parser === undefined) continue; // some other program's event
		try {
			events.push({ name: parser.name, data: parser.parse(bytes) });
		} catch {
			// a decode failure must not hide the other events; the expectation check reports the gap
		}
	}
	return events;
}

/** Normalize a decoded value for comparison with the manifest's string|number expectation. */
function comparable(v: unknown): string | number {
	if (typeof v === "bigint") return v.toString();
	if (typeof v === "number" || typeof v === "string") return v;
	if (v instanceof Uint8Array) return new TextDecoder().decode(v).replace(/\0+$/, "");
	return String(v);
}

/**
 * Verify one manifest step against its fetched transaction. Returns `undefined` when every
 * check passes, else a human-readable error naming the first failed check.
 */
export function verifyProofStep(step: ProofStep, tx: RecordedTransaction | null, programId: string): string | undefined {
	if (tx === null) return "transaction not found (not indexed / wrong cluster)";
	if (tx.meta === null) return "no meta in response";
	if (tx.meta.err !== null) return `transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`;
	const logs = tx.meta.logMessages ?? [];
	if (!logs.some(l => l.startsWith(`Program ${programId} invoke`))) return `program ${programId} was not invoked`;
	if (step.expect?.event === undefined) return undefined;
	const matching = decodeEventsFromLogs(logs).filter(e => e.name === step.expect?.event);
	if (matching.length === 0) return `expected event ${step.expect.event} was not emitted`;
	const fields = step.expect?.fields;
	if (fields === undefined) return undefined;
	const matchesAll = (e: DecodedEvent): boolean => Object.entries(fields).every(([k, want]) => String(comparable(e.data[k])) === String(want));
	// one event of the expected name must match every field (e.g. one EntitlementPaid per holder)
	if (!matching.some(matchesAll)) {
		const got = matching.map(e => Object.fromEntries(Object.entries(e.data).map(([k, v]) => [k, comparable(v)])));
		return `event ${step.expect.event}: no emitted instance matches ${JSON.stringify(fields)} (got ${JSON.stringify(got)})`;
	}
	return undefined;
}
