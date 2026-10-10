import type { TradeDTO } from "../../lib/trades";
import type { MockHandler } from "./types";

/**
 * Mock-mode secondary trades (plan 13): two fixture trades on the demo series QPNb1 (holders 10 / 25 / 65, face
 * 1,000 KZT) — the brief's reference trade, 5 bonds at par = 500,000 tiyn, funded and ready, and one still waiting
 * for both legs. In-memory and mutable: the writes move a trade through awaiting_funding → ready → closed.
 */
const MINT_QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const MINT_BTRK = "BTRKDeM0BondMint1111111111111111111111111111";
const [INV1, INV2, INV3] = [
  "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo",
  "7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau",
  "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC", // the demo investor
] as const;
const SIG =
  "MockTradeSig11111111111111111111111111111111111111111111111111111111111111111111111111";

/** Face value per bond (minor units), display decimals and label per mock series. */
const FACE: Record<
  string,
  { minor: bigint; decimals: number; currency: string; label: string }
> = {
  [MINT_QPNB1]: {
    minor: 100_000n,
    decimals: 2,
    currency: "tKZT",
    label: "KZT",
  },
  [MINT_BTRK]: {
    minor: 1_000_000_000n,
    decimals: 6,
    currency: "USDC",
    label: "USDC",
  },
};

function cash(mint: string, units: bigint) {
  const f = FACE[mint] ?? FACE[MINT_QPNB1]!;
  const minor = f.minor * units;
  const major = Number(minor) / 10 ** f.decimals;
  return {
    minor: minor.toString(),
    // at the asset's own decimals, like the Go API: <Amount> reads them from `decimals` / `display`
    display: `${major.toLocaleString("en-US", { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals })} ${f.label}`,
    currency: f.currency,
    decimals: f.decimals,
  };
}

type MockTrade = TradeDTO & { mint: string };
const trade = (
  n: number,
  mint: string,
  seller: string,
  buyer: string,
  units: bigint,
  funded: boolean,
  admittedAt: string,
): MockTrade => ({
  mint,
  swapDvp: `SwapDvpDem0Pda${n}1111111111111111111111111111`,
  escrow: `TradeEscrowDem0Pda${n}111111111111111111111111`,
  seller,
  buyer,
  units: units.toString(),
  cashAmount: cash(mint, units),
  admittedAt,
  fundedUnits: funded ? units.toString() : null,
  fundedCash: funded ? cash(mint, units) : null,
  status: funded ? "ready" : "awaiting_funding",
});

const trades: MockTrade[] = [
  trade(1, MINT_QPNB1, INV1, INV2, 5n, true, "2026-10-06T10:00:00+05:00"),
  trade(2, MINT_QPNB1, INV3, INV1, 10n, false, "2026-10-06T11:30:00+05:00"),
];

/** Trades of the series that are not closed — `openTrades` of the series DTO and of the list. */
export const openTradesOf = (mint: string) =>
  trades.filter((t) => t.mint === mint && t.status !== "closed").length;

const notFound = { code: "trade_not_found", message: "trade not found" };
const find = (m: RegExpExecArray) =>
  trades.find(
    (t) => t.mint === m[1] && t.swapDvp === m[2] && t.status !== "closed",
  );

export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/series\/([^/]+)\/trades$/,
    reply: (m) => ({
      openTrades: openTradesOf(m[1]!),
      // rows carry the mock's own `mint` field too — harmless extra
      items: trades.filter((t) => t.mint === m[1]),
    }),
  },
  {
    method: "POST",
    path: /^\/registrar\/series\/([^/]+)\/trades$/,
    reply: (m, body) => {
      const b = body as { seller?: string; buyer?: string; units?: number };
      const t = trade(
        trades.length + 1,
        m[1]!,
        String(b.seller),
        String(b.buyer),
        BigInt(b.units ?? 0),
        false,
        "2026-10-06T12:00:00+05:00",
      );
      trades.push(t);
      return { signatures: [SIG], swapDvp: t.swapDvp };
    },
  },
  {
    method: "POST",
    path: /^\/registrar\/series\/([^/]+)\/trades\/([^/]+)\/settle$/,
    reply: (m) => {
      const t = find(m);
      if (!t) return notFound;
      t.status = "closed";
      return { signatures: [SIG] };
    },
  },
  {
    method: "POST",
    path: /^\/registrar\/series\/([^/]+)\/trades\/([^/]+)\/cancel$/,
    reply: (m, body) => {
      const t = find(m);
      if (!t) return notFound;
      t.status = "closed";
      const force = (body as { force?: boolean }).force === true;
      return {
        signatures: [SIG],
        returnedUnits: force ? (t.fundedUnits ?? "0") : "0",
      };
    },
  },
  {
    method: "POST",
    path: /^\/demo\/investor\/series\/([^/]+)\/trades\/([^/]+)\/fund$/,
    reply: (m, body) => {
      const t = find(m);
      if (!t) return notFound;
      if ((body as { side?: string }).side === "seller")
        t.fundedUnits = t.units;
      else t.fundedCash = t.cashAmount;
      if (t.fundedUnits && t.fundedCash) t.status = "ready";
      return {
        demo: true,
        ok: true,
        signature: SIG,
        explorerUrl: `https://explorer.solana.com/tx/${SIG}?cluster=devnet`,
      };
    },
  },
  {
    method: "POST",
    // Plan 15 task 1533: the demo investor's claim — same DemoResponse shape as the Go endpoint.
    // owner is required (the Go handler answers 400 for a missing one); the mock enforces the same contract.
    path: /^\/demo\/investor\/claim$/,
    reply: (_m, body) => {
      const owner = (body as { owner?: string }).owner;
      if (!owner)
        throw Object.assign(new Error("owner must be a base58 pubkey"), {
          status: 400,
          code: "bad_request",
        });
      return {
        demo: true,
        ok: true,
        signature: SIG,
        explorerUrl: `https://explorer.solana.com/tx/${SIG}?cluster=devnet`,
      };
    },
  },
];
