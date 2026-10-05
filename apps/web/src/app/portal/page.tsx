"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { type Instruction, type TransactionSigner, address } from "@solana/kit";
import { AmountCell } from "@/components/ui/AmountCell";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { StatusChip } from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/Toast";
import {
  bpsToPercent,
  currencyDecimals,
  formatDateTime,
  formatMinor,
  shortKey,
} from "@/lib/format";
import {
  type SeriesRow,
  type VoteChoiceName,
  VOTE_CHOICES,
  buildSubscribeIx,
  buildVoteIx,
  estimateCoupon,
  loadPortal,
  nextCoupon,
  openMeetings,
} from "@/lib/portal";
import {
  explainError,
  portalRpc,
  signAndSendWithWallet,
  walletTransactionSigner,
} from "@/lib/walletSigner";

const th = "px-3 py-2 text-left font-medium";
const td = "px-3 py-2";
const btn =
  "rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500 hover:text-neutral-100 disabled:opacity-40";
const voteBtn = (base: string) => `${btn} ${base}`;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-neutral-500">
      {children}
    </h2>
  );
}

export default function PortalPage() {
  const { publicKey, wallet } = useWallet();
  const toast = useToast();
  const [rows, setRows] = useState<SeriesRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<{
    label: string;
    signature: string;
  } | null>(null);
  const [subSeries, setSubSeries] = useState<string>("");
  const [subUnits, setSubUnits] = useState("1");

  const owner = publicKey?.toBase58();

  const load = useCallback(async (o: string) => {
    try {
      setRows(await loadPortal(o));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (owner) void load(owner);
    else setRows(null);
  }, [owner, load]);

  const meetings = useMemo(() => (rows ? openMeetings(rows) : []), [rows]);

  const registeredRows = useMemo(
    () => rows?.filter((r) => r.me !== undefined) ?? [],
    [rows],
  );

  useEffect(() => {
    if (registeredRows.length > 0 && !subSeries) {
      setSubSeries(registeredRows[0]!.series.mint);
    }
  }, [registeredRows, subSeries]);

  /** Sign + send one instruction with the connected wallet; toast either way. */
  const run = useCallback(
    async (
      key: string,
      label: string,
      build: (signer: TransactionSigner) => Promise<Instruction>,
    ) => {
      if (!owner || !wallet) return;
      if (!("signTransaction" in wallet.adapter)) {
        toast.push({
          message: `${wallet.adapter.name} cannot sign transactions`,
          kind: "error",
        });
        return;
      }
      // One signer object for fee payer and instruction accounts (Kit rejects two signers with one address).
      const signer = walletTransactionSigner(wallet.adapter, address(owner));
      setBusy(key);
      try {
        const signature = await signAndSendWithWallet(signer, portalRpc(), [
          await build(signer),
        ]);
        setLastTx({ label, signature });
        toast.push({
          message: `${label} confirmed`,
          kind: "success",
          signature,
        });
        await load(owner);
      } catch (e) {
        toast.push({
          message: `${label} failed — ${explainError(e)}`,
          kind: "error",
        });
      } finally {
        setBusy(null);
      }
    },
    [owner, wallet, toast, load],
  );

  if (!owner) {
    return (
      <section className="mx-auto mt-16 max-w-md text-center">
        <h1 className="mb-2 text-lg font-semibold">Investor portal</h1>
        <p className="mb-6 text-xs text-neutral-500">
          connect a wallet to see holdings, entitlements, open meetings and
          subscribe (DvP) · solana devnet
        </p>
        <div className="flex justify-center">
          <WalletMultiButton />
        </div>
      </section>
    );
  }

  const history = (rows ?? []).flatMap((row) =>
    row.entitlements.map((e) => ({
      row,
      e,
      action: row.actions.find((a) => a.pda === e.actionPda),
    })),
  );

  const subRow = rows?.find((r) => r.series.mint === subSeries);
  const subDecimals = subRow
    ? currencyDecimals(subRow.series.faceValue.currency)
    : 2;
  const subUnitsN = Number(subUnits);
  // Placement at par: the program requires price_per_unit == face value (subscribe.rs).
  const subTotal =
    subRow && Number.isFinite(subUnitsN) && subUnitsN > 0
      ? BigInt(subRow.series.faceValue.minor) * BigInt(Math.floor(subUnitsN))
      : null;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Investor portal</h1>
          <p className="text-xs text-neutral-500">
            wallet <span className="font-mono">{shortKey(owner)}</span>{" "}
            <ExplorerLink value={owner} kind="address" label="explorer ↗" />
          </p>
        </div>
        <WalletMultiButton className="!h-8 !rounded !text-xs" />
      </div>

      {lastTx && (
        <div className="mt-4 rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs">
          <span className="text-neutral-400">last tx · {lastTx.label} · </span>
          <ExplorerLink value={lastTx.signature} kind="tx" />
        </div>
      )}

      {loadError && (
        <div className="mt-4 rounded border border-red-900 px-3 py-2 text-xs text-red-300">
          registrar API unreachable: {loadError} — start the Go registrar or set
          API_MOCKING=enabled
        </div>
      )}

      <SectionTitle>Holdings</SectionTitle>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wider text-neutral-500">
              <th className={th}>Series</th>
              <th className={th}>Status</th>
              <th className={`${th} text-right`}>Units</th>
              <th className={`${th} text-right`}>Face total</th>
              <th className={th}>Next coupon</th>
              <th className={`${th} text-right`}>Est. coupon (gross)</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => {
              const units = row.me?.units;
              const next = row.series.nextCouponDate
                ? nextCoupon(row)
                : undefined;
              const est =
                units !== undefined && next
                  ? estimateCoupon(row.series, units, next)
                  : undefined;
              const decimals = currencyDecimals(row.series.faceValue.currency);
              return (
                <tr
                  key={row.series.mint}
                  className="border-b border-neutral-800/60 last:border-0"
                >
                  <td className={td}>
                    <span className="font-medium">{row.series.ticker}</span>{" "}
                    <span className="text-xs text-neutral-500">
                      {bpsToPercent(row.series.couponRateBps)} ·{" "}
                      <ExplorerLink value={row.series.mint} kind="address" />
                    </span>
                  </td>
                  <td className={td}>
                    {row.me ? (
                      <StatusChip status={row.me.status} />
                    ) : (
                      <span className="text-xs text-neutral-500">
                        not registered
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right font-mono tabular-nums`}>
                    {units ?? "—"}
                  </td>
                  <td className={`${td} text-right font-mono tabular-nums`}>
                    {units !== undefined
                      ? `${formatMinor(
                          (
                            BigInt(row.series.faceValue.minor) * BigInt(units)
                          ).toString(),
                          decimals,
                        )} ${row.series.faceValue.currency}`
                      : "—"}
                  </td>
                  <td className={`${td} font-mono text-xs`}>
                    {next ? formatDateTime(next.paymentDate) : "—"}
                    {next && (
                      <div className="text-neutral-500">
                        {next.periodStart} → {next.periodEnd}
                      </div>
                    )}
                  </td>
                  <td className={`${td} text-right font-mono tabular-nums`}>
                    {est !== undefined
                      ? `${formatMinor(est.toString(), decimals)} ${row.series.faceValue.currency}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {rows?.length === 0 && (
              <tr>
                <td className={`${td} text-neutral-600`} colSpan={6}>
                  no series
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SectionTitle>Open meetings</SectionTitle>
      {meetings.length === 0 && (
        <p className="text-xs text-neutral-600">
          no meeting is open for voting
        </p>
      )}
      <div className="space-y-3">
        {meetings.map(({ row, action }) => {
          const mine = row.entitlements.find((e) => e.actionPda === action.pda);
          const proposal =
            action.proposalNewRateBps !== null &&
            action.proposalNewRateBps !== undefined
              ? `coupon ${bpsToPercent(row.series.couponRateBps)} → ${bpsToPercent(action.proposalNewRateBps)}`
              : action.proposalNewMaturity
                ? `maturity → ${action.proposalNewMaturity}`
                : "terms change";
          return (
            <div
              key={action.pda}
              className="rounded border border-neutral-800 bg-neutral-900/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs">{action.corpId}</span>{" "}
                  <StatusChip status={action.status} />
                  <span className="ml-2 text-sm">{proposal}</span>
                </div>
                <span className="text-xs text-neutral-500">
                  voting ends{" "}
                  {action.votingEndsAt
                    ? formatDateTime(action.votingEndsAt)
                    : "—"}{" "}
                  · <ExplorerLink value={action.pda} kind="address" />
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                <span>
                  your weight:{" "}
                  <span className="font-mono">
                    {mine ? `${mine.units} units` : "not snapshotted"}
                  </span>
                  {mine?.vote && mine.vote !== "None" && (
                    <span>
                      {" "}
                      · voted <span className="font-mono">{mine.vote}</span>
                    </span>
                  )}
                </span>
                <span className="grow" />
                {(Object.keys(VOTE_CHOICES) as VoteChoiceName[]).map((name) => (
                  <button
                    key={name}
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `vote-${action.pda}-${name}`,
                        `Vote ${name} · ${action.corpId}`,
                        (s) =>
                          buildVoteIx(
                            row.series.mint,
                            address(action.pda),
                            s,
                            VOTE_CHOICES[name],
                          ),
                      )
                    }
                    className={voteBtn(
                      name === "For"
                        ? "text-emerald-400"
                        : name === "Against"
                          ? "text-red-400"
                          : "text-neutral-400",
                    )}
                  >
                    {busy === `vote-${action.pda}-${name}` ? "signing…" : name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <SectionTitle>Subscribe (primary placement, atomic DvP)</SectionTitle>
      {registeredRows.length === 0 ? (
        <p className="text-xs text-neutral-600">
          this wallet is not registered as an investor in any series — ask the
          registrar to register it first (needs a KYC attestation on the Solana
          Attestation Service; the KYC provider is SIMULATED)
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3 rounded border border-neutral-800 bg-neutral-900/40 px-4 py-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!subRow || !owner) return;
            const units = BigInt(Math.floor(subUnitsN));
            const price = BigInt(subRow.series.faceValue.minor); // at par
            const key = "subscribe";
            void run(key, `Subscribe ${units} × ${subRow.series.ticker}`, (s) =>
              buildSubscribeIx(
                portalRpc(),
                subRow.series.mint,
                s,
                units,
                price,
              ),
            );
          }}
        >
          <label className="text-xs text-neutral-400">
            series
            <select
              value={subSeries}
              onChange={(e) => setSubSeries(e.target.value)}
              className="ml-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
            >
              {registeredRows.map((r) => (
                <option key={r.series.mint} value={r.series.mint}>
                  {r.series.ticker}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-400">
            units
            <input
              type="number"
              min={1}
              step={1}
              value={subUnits}
              onChange={(e) => setSubUnits(e.target.value)}
              className="ml-2 w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-sm text-neutral-200"
            />
          </label>
          <span className="text-xs text-neutral-400">
            price / unit{" "}
            <span className="font-mono text-neutral-200">
              {subRow
                ? `${formatMinor(subRow.series.faceValue.minor, subDecimals)} ${subRow.series.faceValue.currency}`
                : "—"}
            </span>{" "}
            <span className="text-neutral-600">(placement at par)</span>
          </span>
          <span className="text-xs text-neutral-500">
            total{" "}
            <span className="font-mono">
              {subTotal !== null && subRow
                ? `${formatMinor(subTotal.toString(), subDecimals)} ${subRow.series.faceValue.currency}`
                : "—"}
            </span>
          </span>
          <button
            type="submit"
            disabled={
              busy !== null || !Number.isFinite(subUnitsN) || subUnitsN < 1
            }
            className={`${btn} text-sky-300`}
          >
            {busy === "subscribe" ? "signing…" : "subscribe (DvP)"}
          </button>
        </form>
      )}

      <SectionTitle>Entitlement history</SectionTitle>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wider text-neutral-500">
              <th className={th}>Action</th>
              <th className={th}>Kind</th>
              <th className={`${th} text-right`}>Units</th>
              <th className={`${th} text-right`}>Gross</th>
              <th className={`${th} text-right`}>Net</th>
              <th className={th}>Status</th>
              <th className={th}>Vote</th>
              <th className={th}>Record</th>
            </tr>
          </thead>
          <tbody>
            {history.map(({ row, e, action }) => (
              <tr
                key={e.pda}
                className="border-b border-neutral-800/60 last:border-0"
              >
                <td className={`${td} font-mono text-xs`}>
                  {action?.corpId ?? shortKey(e.actionPda)}{" "}
                  <span className="text-neutral-500">
                    ({row.series.ticker})
                  </span>
                </td>
                <td className={`${td} font-mono text-xs`}>
                  {action?.kind ?? "—"}
                </td>
                <td className={`${td} text-right font-mono tabular-nums`}>
                  {e.units}
                </td>
                <td className={`${td} text-right`}>
                  {e.gross ? <AmountCell amount={e.gross} /> : "—"}
                </td>
                <td className={`${td} text-right`}>
                  {e.net ? <AmountCell amount={e.net} /> : "—"}
                </td>
                <td className={td}>
                  <StatusChip status={e.status} />
                </td>
                <td className={`${td} text-xs`}>
                  {e.vote && e.vote !== "None" ? (
                    <span className="font-mono">{e.vote}</span>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </td>
                <td className={`${td} font-mono text-xs`}>
                  {action ? formatDateTime(action.recordAt) : "—"}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td className={`${td} text-neutral-600`} colSpan={8}>
                  no entitlements snapshotted for this wallet yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
