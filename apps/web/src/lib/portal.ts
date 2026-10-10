"use client";

/**
 * Investor portal: registrar-API reads (holdings, schedule, entitlement
 * history) and on-chain instruction builders (cast_vote, subscribe) using the
 * generated Kit client shared with the CLI.
 */
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token-2022";
import {
  type Address,
  AccountRole,
  fetchEncodedAccounts,
  type Instruction,
  type TransactionSigner,
  address,
} from "@solana/kit";
import {
  fetchCorporateAction,
  fetchInvestor,
  fetchSeries,
  getCastVoteInstructionAsync,
  getPayBatchInstruction,
  getSetPayoutRouteInstructionAsync,
  getSubscribeInstructionAsync,
} from "@qupon/client/src/generated";
import {
  entitlementPda,
  investorPda,
  routePda,
  seriesPda,
} from "@qupon/client/src/lib/pda";
import {
  DayCount,
  type Ymd,
  accrualDays,
  ymd,
} from "@qupon/client/src/lib/daycount";
import { Kind, computeEntitlement } from "@qupon/client/src/lib/entitlement";
import {
  type ActionDTO,
  type EntitlementDTO,
  type InvestorDTO,
  type ScheduleItem,
  type SeriesDTO,
  getSchedule,
  listActions,
  listEntitlements,
  listInvestors,
  listSeries,
} from "./api";
import type { PortalRpc } from "./walletSigner";

/** On-chain VoteChoice (programs/qupon_bonds): 1 For, 2 Against, 3 Abstain. */
export const VOTE_CHOICES = { For: 1, Against: 2, Abstain: 3 } as const;
export type VoteChoiceName = keyof typeof VOTE_CHOICES;

const DAY_COUNT_CODES: Record<string, DayCount> = {
  THIRTY_360: DayCount.Thirty360,
  ACT_ACT: DayCount.ActAct,
  ACT_365: DayCount.Act365,
};

/** Everything the portal shows for one series, filtered to the connected wallet. */
export interface SeriesRow {
  series: SeriesDTO;
  /** undefined → wallet not registered in this series. */
  me?: InvestorDTO;
  schedule: ScheduleItem[];
  actions: ActionDTO[];
  /** this wallet's entitlements across all actions of the series */
  entitlements: EntitlementDTO[];
}

/**
 * Load every series with the connected owner's slice. Holder lists come first; schedule, actions and entitlements are
 * fetched only where this wallet is registered — the rest render as "not registered" without N×M extra requests.
 */
export async function loadPortal(owner: string): Promise<SeriesRow[]> {
  const series = await listSeries();
  const holders = await Promise.all(
    series.map((s) => listInvestors(s.mint).catch(() => [] as InvestorDTO[])),
  );
  return Promise.all(
    series.map(async (s, i): Promise<SeriesRow> => {
      const me = holders[i]?.find((h) => h.owner === owner);
      if (!me)
        return { series: s, me, schedule: [], actions: [], entitlements: [] };
      const [schedule, actions] = await Promise.all([
        getSchedule(s.mint),
        listActions(s.mint),
      ]);
      const lists = await Promise.all(
        actions.map((a) =>
          listEntitlements(a.pda).catch(() => [] as EntitlementDTO[]),
        ),
      );
      return {
        series: s,
        me,
        schedule,
        actions,
        entitlements: lists.flat().filter((e) => e.owner === owner),
      };
    }),
  );
}

/** The schedule item of the next upcoming coupon (or the announced one). */
export function nextCoupon(row: SeriesRow): ScheduleItem | undefined {
  const now = Date.now();
  return (
    row.schedule.find(
      (i) =>
        i.status !== "Completed" && new Date(i.paymentDate).getTime() >= now,
    ) ?? row.schedule.find((i) => i.status !== "Completed")
  );
}

function parseYmd(s: string): Ymd {
  const parts = s.split("-").map(Number);
  const [y, m, d] = parts;
  if (
    parts.length !== 3 ||
    y === undefined ||
    m === undefined ||
    d === undefined
  ) {
    throw new Error(`expected YYYY-MM-DD, got '${s}'`);
  }
  return ymd(y, m, d);
}

/**
 * Estimated next-coupon amount for `units`, computed with the shared TS
 * daycount/entitlement libs (gross: the portal does not know the holder's tax
 * rate). Returns undefined when the schedule lacks dates or the day count is
 * unsupported.
 */
export function estimateCoupon(
  series: Pick<SeriesDTO, "faceValue" | "couponRateBps" | "dayCount">,
  units: string,
  period: Pick<ScheduleItem, "periodStart" | "periodEnd">,
): bigint | undefined {
  const dc = DAY_COUNT_CODES[series.dayCount];
  if (dc === undefined || !period.periodStart || !period.periodEnd)
    return undefined;
  try {
    const days = accrualDays(
      dc,
      parseYmd(period.periodStart),
      parseYmd(period.periodEnd),
    );
    return computeEntitlement({
      units: BigInt(units),
      face: BigInt(series.faceValue.minor),
      rateBps: series.couponRateBps,
      dayCount: dc,
      days,
      taxBps: 0,
      kind: Kind.Interest,
    }).gross;
  } catch {
    return undefined; // e.g. ACT_ACT — unsupported day count
  }
}

/** Actions an investor can vote on right now: meetings with voting open. */
export function openMeetings(
  rows: SeriesRow[],
): { row: SeriesRow; action: ActionDTO }[] {
  const now = Date.now();
  return rows.flatMap((row) =>
    row.actions.flatMap((a) => {
      if (a.kind !== "BMET" || a.status !== "VotingOpen" || !a.votingEndsAt) {
        return [];
      }
      return new Date(a.votingEndsAt).getTime() > now
        ? [{ row, action: a }]
        : [];
    }),
  );
}

/** Build `cast_vote` (entitlement PDA auto-derived by the generated client). */
export async function buildVoteIx(
  seriesMint: string,
  actionPda: Address,
  owner: TransactionSigner,
  choice: number,
) {
  return getCastVoteInstructionAsync({
    owner,
    series: await seriesPda(address(seriesMint)),
    action: actionPda,
    choice,
  });
}

/**
 * Build `subscribe` (atomic DvP): mirrors the CLI `subscribe` command — reads
 * the on-chain Series + Investor records, derives ATAs, checks the issuer cash
 * account exists.
 */
export async function buildSubscribeIx(
  rpc: PortalRpc,
  seriesMint: string,
  owner: TransactionSigner,
  units: bigint,
  pricePerUnit: bigint,
) {
  const series = address(seriesMint);
  const pda = await seriesPda(series);
  const account = (await fetchSeries(rpc, pda)).data;
  const investor = await investorPda(pda, owner.address);
  const record = (await fetchInvestor(rpc, investor)).data;
  const { value: cashMintAccount } = await rpc
    .getAccountInfo(account.cashMint, {
      commitment: "confirmed",
      encoding: "base64",
    })
    .send();
  if (cashMintAccount === null) {
    throw new Error(`cash mint ${account.cashMint} not found on chain`);
  }
  const issuerCash = (
    await findAssociatedTokenPda({
      owner: account.issuer,
      tokenProgram: cashMintAccount.owner,
      mint: account.cashMint,
    })
  )[0];
  const { value: issuerCashAccount } = await rpc
    .getAccountInfo(issuerCash, { commitment: "confirmed" })
    .send();
  if (issuerCashAccount === null) {
    throw new Error(
      `issuer cash account ${issuerCash} does not exist — cannot receive the DvP payment`,
    );
  }
  return getSubscribeInstructionAsync({
    owner,
    series: pda,
    mint: series,
    bondAta: record.bondAta,
    cashMint: account.cashMint,
    cashAta: record.cashAta,
    issuerCash,
    cashTokenProgram: cashMintAccount.owner,
    units,
    pricePerUnit,
  });
}

/**
 * Build `pay_batch` for the signer's own entitlement: the holder claims their payout (pay is a permissionless
 * crank, plan 15 D2). Mirrors the CLI `action:claim` account layout [Entitlement (w), Investor, PayoutRoute,
 * cash destination (w), bond ATA (w)] and honours the holder's route: a bank-routed payout goes to the paying
 * agent's cash ATA (the bank transfer itself is SIMULATED off-chain), a wallet-routed one to the holder's cash ATA.
 * A missing destination ATA is created idempotently in the same transaction.
 */
export async function buildClaimIx(
  rpc: PortalRpc,
  seriesMint: string,
  actionPda: Address,
  owner: TransactionSigner,
) {
  const mint = address(seriesMint);
  const series = await seriesPda(mint);
  const account = (await fetchSeries(rpc, series)).data;
  const action = (await fetchCorporateAction(rpc, actionPda)).data;
  const investor = await investorPda(series, owner.address);
  const record = (await fetchInvestor(rpc, investor)).data;
  const { value: cashMintAccount } = await rpc
    .getAccountInfo(account.cashMint, {
      commitment: "confirmed",
      encoding: "base64",
    })
    .send();
  if (cashMintAccount === null)
    throw new Error(`cash mint ${account.cashMint} not found on chain`);
  // PayoutRoute ["route", investor]: discriminator (8) + bump (1) + investor (32), then the route byte (1 = bank)
  // — the same layout the CLI reads (clients/ts payoutRouteIsBank).
  const route = await routePda(investor);
  const [routeAcc, walletCash] = await fetchEncodedAccounts(rpc, [
    route,
    record.cashAta,
  ]);
  const routeData =
    routeAcc !== undefined && routeAcc.exists ? routeAcc.data : undefined;
  const bank =
    routeData !== undefined && routeData.length > 41 && routeData[41] === 1;
  let destination = record.cashAta;
  let create: Instruction | undefined;
  if (bank) {
    destination = (
      await findAssociatedTokenPda({
        owner: account.payingAgent,
        tokenProgram: cashMintAccount.owner,
        mint: account.cashMint,
      })
    )[0];
    const [agentCash] = await fetchEncodedAccounts(rpc, [destination]);
    if (agentCash === undefined || !agentCash.exists) {
      create = getCreateAssociatedTokenIdempotentInstruction({
        payer: owner,
        ata: destination,
        owner: account.payingAgent,
        mint: account.cashMint,
        tokenProgram: cashMintAccount.owner,
      });
    }
  } else if (walletCash === undefined || !walletCash.exists) {
    create = getCreateAssociatedTokenIdempotentInstruction({
      payer: owner,
      ata: destination,
      owner: owner.address,
      mint: account.cashMint,
      tokenProgram: cashMintAccount.owner,
    });
  }
  const base = getPayBatchInstruction({
    authority: owner,
    series,
    action: actionPda,
    cashMint: account.cashMint,
    escrow: action.escrow,
    taxVault: account.taxVault,
    cashTokenProgram: cashMintAccount.owner,
    mint,
  });
  const w = AccountRole.WRITABLE;
  const r = AccountRole.READONLY;
  const claim: Instruction = {
    ...base,
    accounts: [
      ...base.accounts,
      { address: await entitlementPda(actionPda, owner.address), role: w },
      { address: investor, role: r },
      { address: route, role: r },
      { address: destination, role: w },
      { address: record.bondAta, role: w },
    ],
  };
  return create ? [create, claim] : [claim];
}

/**
 * Build `set_payout_route` (plan 15 D6): the holder's own signature chooses wallet or bank. The bank reference is
 * already a sha256 when it gets here — only {@link sha256Hex} (WebCrypto, in the browser) ever sees the clear text.
 */
export async function buildSetPayoutRouteIx(
  seriesMint: string,
  owner: TransactionSigner,
  route: "wallet" | "bank",
  bankRefHash: Uint8Array,
) {
  const series = await seriesPda(address(seriesMint));
  const investor = await investorPda(series, owner.address);
  return getSetPayoutRouteInstructionAsync({
    owner,
    series,
    investor,
    routeArg: route === "bank" ? 1 : 0,
    bankRefHash,
  });
}

/** sha256 of a UTF-8 text as hex — WebCrypto in the browser; only this hash ever leaves the page. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** The hash bytes `set_payout_route` stores: sha256(UTF-8 text) as the 32-byte argument. */
export async function sha256Bytes(text: string): Promise<Uint8Array> {
  const hex = await sha256Hex(text);
  return Uint8Array.from({ length: 32 }, (_, i) =>
    parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}

/** An entitlement the holder can claim right now: its action is funded (Funded/Settling) and the payout is unpaid. */
export function claimableEntitlements(
  rows: SeriesRow[],
): { row: SeriesRow; action: ActionDTO; entitlement: EntitlementDTO }[] {
  const paid = new Set(["Paid", "Retired", "PaidToAgent"]);
  return rows.flatMap((row) =>
    row.actions
      .filter((a) => a.status === "Funded" || a.status === "Settling")
      .flatMap((action) =>
        row.entitlements
          .filter((e) => e.actionPda === action.pda && !paid.has(e.status))
          .map((entitlement) => ({ row, action, entitlement })),
      ),
  );
}
