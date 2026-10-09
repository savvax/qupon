// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VotePanel } from "./VotePanel";

/**
 * Task 1418: vote buttons stay off for holders outside the snapshot, and a vote
 * cast in this session keeps them off while the devnet chain read still lags.
 */

const portal = vi.hoisted(() => {
  // Kit's address() validates base58 (32–44 chars): owner and action PDAs must be realistic.
  const owner = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
  const pdaA = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const pdaB = "11111111111111111111111111111111";
  const ends = new Date(Date.now() + 86_400_000).toISOString();
  const action = (pda: string, corpId: string, units: string) => ({
    pda,
    corpId,
    kind: "BMET",
    status: "VotingOpen",
    votingEndsAt: ends,
    unitsSnapshotted: units,
    votesFor: "0",
    votesAgainst: "0",
    votesAbstain: "0",
    proposalNewRateBps: null,
    proposalNewMaturity: null,
  });
  return {
    owner,
    rows: [
      {
        series: { mint: "MintA", ticker: "KZB26", couponRateBps: 1000 },
        schedule: [],
        actions: [action(pdaA, "CORP-A", "100")],
        entitlements: [{ actionPda: pdaA, owner, units: "10", vote: "None" }],
      },
      {
        series: { mint: "MintB", ticker: "KZB27", couponRateBps: 900 },
        schedule: [],
        actions: [action(pdaB, "CORP-B", "50")],
        entitlements: [], // this wallet is not in the snapshot
      },
    ] as unknown as import("@/lib/portal").SeriesRow[],
  };
});

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${Object.values(values).join(",")}` : key,
      { has: () => true },
    ),
}));
vi.mock("@/components/wallet/WalletUX", () => ({
  useWalletUX: () => ({ connect: () => {} }),
}));
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    wallet: { adapter: { signTransaction: async () => {} } },
  }),
}));
vi.mock("./InvestorIdentity", () => ({
  useInvestor: () => ({ mode: "wallet", owner: portal.owner }),
}));
vi.mock("../_lib/usePortalRows", () => ({
  usePortalRows: () => ({ rows: portal.rows, error: null, reload: () => {} }),
}));
vi.mock("@/lib/walletSigner", () => ({
  walletTransactionSigner: () => ({}),
  signAndSendWithWallet: async () => ({
    signature: "SigVote1",
    pending: false,
  }),
  portalRpc: () => ({}),
}));
vi.mock("@/lib/portal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal")>();
  return { ...actual, buildVoteIx: async () => ({}) };
});
vi.mock("../_lib/useWalletWrite", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../_lib/useWalletWrite")>();
  return {
    ...actual,
    // confirmed send — the real walletLegSent then marks the vote as cast
    useWalletWrite: () => async (o: { call: () => Promise<unknown> }) =>
      await o.call(),
  };
});
vi.mock("@/lib/useRunWrite", () => ({
  useRunWrite:
    () =>
    async <T,>(o: { call: () => Promise<T> }): Promise<T | null> => {
      try {
        return await o.call();
      } catch {
        return null;
      }
    },
}));
vi.mock("@/components/ui/Dialog", () => ({
  Dialog: (p: { open: boolean; footer?: import("react").ReactNode }) =>
    p.open ? <div role="dialog">{p.footer}</div> : null,
}));
vi.mock("@/components/network/NetworkContext", () => ({
  useNetwork: () => ({
    mainnet: false,
    network: "devnet",
    explorerCluster: "?cluster=devnet",
  }),
  explorerHref: (_kind: string, value: string, cluster: string) =>
    `https://explorer.solana.com/address/${value}${cluster}`,
}));

afterEach(cleanup);

const cardOf = (group: HTMLElement) => group.closest("section") as HTMLElement;
const groups = () => screen.getAllByRole("group") as HTMLElement[];
const buttons = (scope: HTMLElement) =>
  within(scope).getAllByRole("button") as HTMLButtonElement[];

describe("VotePanel (task 1418)", () => {
  it("disables the three choices when the holder is not in the snapshot", () => {
    render(<VotePanel />);
    const gs = groups();
    expect(gs).toHaveLength(2);
    for (const b of buttons(gs[0] as HTMLElement))
      expect(b.disabled).toBe(false); // snapshotted → voteable
    const outsider = cardOf(gs[1] as HTMLElement);
    for (const b of buttons(gs[1] as HTMLElement))
      expect(b.disabled).toBe(true); // not snapshotted → disabled
    expect(within(outsider).getByText("notSnapshotted")).toBeTruthy();
  });

  it("keeps the voted state while the reloaded chain read still says None", async () => {
    const user = userEvent.setup();
    render(<VotePanel />);
    const card = cardOf(groups()[0] as HTMLElement);
    const choices = groups()[0] as HTMLElement; // the 3-button group only (the card also has a copy button)
    await user.click(within(card).getByRole("button", { name: "choice.For" }));
    await user.click(screen.getByRole("button", { name: "confirmVote" }));
    // the mocked send confirms instantly; the reload keeps vote: "None" (devnet lag)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    for (const b of buttons(choices)) expect(b.disabled).toBe(true);
    expect(within(card).getByText("alreadyVoted")).toBeTruthy();
  });
});
