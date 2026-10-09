import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import {
  type Address,
  address,
  getBase64Decoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Decoder,
  getU64Encoder,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { BoError } from "./boClient";
import {
  DVP_PROGRAM,
  SWAP_DVP_SIZE,
  type ShownTrade,
  type TradeDTO,
  buildFundTradeIx,
  checkSwapDvp,
  legFunded,
  tradeEscrow,
  withTradeErrors,
} from "./trades";
import { type PortalRpc, walletTransactionSigner } from "./walletSigner";

// The brief's reference trade: 5 bonds at par (face 1,000 KZT = 100,000 tiyn) = 500,000 tiyn.
const SELLER = "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo";
const BUYER = "7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau";
const OTHER = "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC";
const BOND = "BYPKzbKvf1up8iJSjx21gS87YwzLKH7gdq5uLJUHZia4";
const CASH = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SWAP = "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97";
const shown: ShownTrade = {
  swapDvp: SWAP,
  seller: SELLER,
  buyer: BUYER,
  bondMint: BOND,
  cashMint: CASH,
  units: 5n,
  cash: 500_000n,
};

/** A SwapDvp record with the documented layout; `over` replaces fields. */
function record(over: Partial<ShownTrade> = {}, size = SWAP_DVP_SIZE) {
  const r = { ...shown, ...over };
  const data = new Uint8Array(size);
  const key = (k: string, at: number) =>
    data.set(getAddressEncoder().encode(address(k)), at);
  key(r.seller, 1);
  key(r.buyer, 33);
  key(r.bondMint, 65);
  key(r.cashMint, 97);
  data.set(getU64Encoder().encode(r.units), 225);
  data.set(getU64Encoder().encode(r.cash), 233);
  return { owner: DVP_PROGRAM, data };
}

describe("checkSwapDvp", () => {
  it("accepts the record that was shown, for either party", () => {
    expect(() => checkSwapDvp(record(), shown, "seller", SELLER)).not.toThrow();
    expect(() => checkSwapDvp(record(), shown, "buyer", BUYER)).not.toThrow();
  });
  it("rejects a record of another program", () => {
    expect(() =>
      checkSwapDvp(
        { ...record(), owner: TOKEN_2022_PROGRAM_ADDRESS },
        shown,
        "seller",
        SELLER,
      ),
    ).toThrow(/not owned by the Solana DvP program/);
  });
  it("rejects a wrong size", () => {
    expect(() =>
      checkSwapDvp(record({}, 459), shown, "seller", SELLER),
    ).toThrow(/unexpected size/);
  });
  it.each([
    ["seller", { seller: OTHER }],
    ["buyer", { buyer: OTHER }],
    ["bond mint", { bondMint: CASH }],
    ["cash mint", { cashMint: BOND }],
    ["bond amount", { units: 6n }],
    ["cash amount", { cash: 500_001n }],
  ] as const)("rejects a different %s", (field, over) => {
    expect(() => checkSwapDvp(record(over), shown, "seller", SELLER)).toThrow(
      `(${field})`,
    );
  });
  it("rejects a wallet that is not the party of that side", () => {
    expect(() => checkSwapDvp(record(), shown, "seller", BUYER)).toThrow(
      /not the seller/,
    );
    expect(() => checkSwapDvp(record(), shown, "buyer", OTHER)).toThrow(
      /not the buyer/,
    );
  });
});

describe("tradeEscrow", () => {
  it("is the associated token account of the record, per mint", async () => {
    const [expected] = await getProgramDerivedAddress({
      programAddress: address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      seeds: [SWAP, TOKEN_2022_PROGRAM_ADDRESS, BOND].map((k) =>
        getAddressEncoder().encode(address(k)),
      ),
    });
    const bond = await tradeEscrow(
      address(SWAP),
      address(BOND),
      TOKEN_2022_PROGRAM_ADDRESS,
    );
    expect(bond).toBe(expected);
    expect(
      await tradeEscrow(
        address(SWAP),
        address(BOND),
        TOKEN_2022_PROGRAM_ADDRESS,
      ),
    ).toBe(bond);
    expect(
      await tradeEscrow(
        address(SWAP),
        address(CASH),
        TOKEN_2022_PROGRAM_ADDRESS,
      ),
    ).not.toBe(bond);
  });
});

describe("legFunded / withTradeErrors", () => {
  const kzt = (minor: string) => ({ minor, display: "", currency: "tKZT" });
  const trade: TradeDTO = {
    swapDvp: SWAP,
    escrow: OTHER,
    seller: SELLER,
    buyer: BUYER,
    units: "5",
    cashAmount: kzt("500000"),
    admittedAt: "2026-10-06T12:00:00+05:00",
    fundedUnits: "5",
    fundedCash: null,
    status: "awaiting_funding",
  };
  it("marks a leg funded only when the escrow holds the full amount", () => {
    expect(legFunded(trade, "seller")).toBe(true);
    expect(legFunded(trade, "buyer")).toBe(false);
    expect(legFunded({ ...trade, fundedCash: kzt("499999") }, "buyer")).toBe(
      false,
    );
    expect(legFunded({ ...trade, fundedCash: kzt("500000") }, "buyer")).toBe(
      true,
    );
  });
  it("replaces a known trade error code with the localized sentence", async () => {
    const t = Object.assign((k: string) => `tr:${k}`, {
      has: (k: string) => k === "errors.not_demo_investor",
    });
    const fail = (code: string) => () =>
      Promise.reject(new BoError(403, code, "raw"));
    await expect(
      withTradeErrors(fail("not_demo_investor"), t),
    ).rejects.toMatchObject({ message: "tr:errors.not_demo_investor" });
    await expect(withTradeErrors(fail("other"), t)).rejects.toMatchObject({
      message: "raw",
    });
  });
});

const B64 = (bytes: Uint8Array) => getBase64Decoder().decode(bytes);
/** Fake rpc serving crafted accounts by address (buildFundTradeIx reads record, mint, escrow). */
function fakeTradeRpc(
  accounts: Record<string, { owner: string; data: string[] }>,
) {
  return {
    getAccountInfo: (a: Address) => ({
      send: async () => ({ value: accounts[a] ?? null }),
    }),
  } as unknown as PortalRpc;
}
describe("buildFundTradeIx (partial funding, task 1417)", () => {
  const signer = walletTransactionSigner(
    { signTransaction: async (t) => t },
    address(BUYER),
  );
  const mintAccount = () => {
    const data = new Uint8Array(82);
    data[44] = 2; // decimals (mint layout: option 36 + supply 8, then decimals)
    return { owner: TOKEN_2022_PROGRAM_ADDRESS, data: [B64(data)] };
  };
  const tokenAccount = (amount: bigint) => {
    const data = new Uint8Array(165);
    data.set(getU64Encoder().encode(amount), 64); // balance offset: mint 32 + owner 32
    return { owner: TOKEN_2022_PROGRAM_ADDRESS, data: [B64(data)] };
  };
  const cashEscrow = () =>
    tradeEscrow(address(SWAP), address(CASH), TOKEN_2022_PROGRAM_ADDRESS);
  it("transfers only the unfunded remainder when the escrow is half funded", async () => {
    const escrow = String(await cashEscrow());
    const rpc = fakeTradeRpc({
      [SWAP]: { owner: DVP_PROGRAM, data: [B64(record().data)] },
      [CASH]: mintAccount(),
      [escrow]: tokenAccount(250_000n), // half of the shown 500,000 cash
    });
    const ix = await buildFundTradeIx(rpc, shown, "buyer", signer);
    expect(ix).not.toBeNull();
    // TransferChecked layout: u8 discriminator, then the u64 amount.
    expect(getU64Decoder().decode(ix!.data!, 1)).toBe(250_000n);
  });
  it("returns null when the leg is already fully funded", async () => {
    const escrow = String(await cashEscrow());
    const rpc = fakeTradeRpc({
      [SWAP]: { owner: DVP_PROGRAM, data: [B64(record().data)] },
      [CASH]: mintAccount(),
      [escrow]: tokenAccount(500_000n),
    });
    expect(await buildFundTradeIx(rpc, shown, "buyer", signer)).toBeNull();
  });
  const seller = walletTransactionSigner(
    { signTransaction: async (t) => t },
    address(SELLER),
  );
  it("sends the whole leg when the escrow does not exist yet", async () => {
    const rpc = fakeTradeRpc({
      [SWAP]: { owner: DVP_PROGRAM, data: [B64(record().data)] },
      [CASH]: mintAccount(),
      [BOND]: mintAccount(), // seller funds the bond leg
      // no escrow account on chain yet → funded 0, full leg transfers
    });
    expect(await buildFundTradeIx(rpc, shown, "seller", seller)).not.toBeNull();
  });
});
