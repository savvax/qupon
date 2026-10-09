"use client";

/**
 * Investor portal: registrar-API reads (holdings, schedule, entitlement
 * history) and on-chain instruction builders (cast_vote, subscribe) using the
 * generated Kit client shared with the CLI.
 */
import { findAssociatedTokenPda } from "@solana-program/token-2022";
import {
  type Address,
  AccountRole,
  type TransactionSigner,
  address,
} from "@solana/kit";
import {
  fetchCorporateAction,
  fetchInvestor,
  fetchSeries,
  getCastVoteInstructionAsync,
  getPayBatchInstruction,
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
 * Build `pay_batch` for the signer's own entitlement: the holder claims their coupon (pay is a permissionless
 * crank, plan 15 D2). Mirrors the CLI's per-holder remaining accounts [Entitlement (w), Investor, PayoutRoute,
 * cash destination (w), bond ATA (w)] for a wallet-routed holder (a bank-routed one is paid to the paying agent
 * by the crank instead).
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
    .getAccountInfo(account.cashMint, { commitment: "confirmed", encoding: "base64" })
    .send();
  if (cashMintAccount === null)
    throw new Error(`cash mint ${account.cashMint} not found on chain`);
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
  return {
    ...base,
    accounts: [
      ...base.accounts,
      { address: await entitlementPda(actionPda, owner.address), role: w },
      { address: investor, role: r },
      { address: await routePda(investor), role: r },
      { address: record.cashAta, role: w },
      { address: record.bondAta, role: w },
    ],
  };
}
