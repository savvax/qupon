import { describe, expect, it } from "vitest";
import {
  AccountRole,
  address,
  createNoopSigner,
  type Address,
} from "@solana/kit";
import { getSettleDvpInstruction } from "../dvp/generated/index.js";
import {
  findCheckpointPda,
  findExtraAccountMetaListPda,
  QUPON_BONDS_PROGRAM_ADDRESS,
  type Series,
  type TradeAdmission,
} from "../generated/index.js";
import { findAssociatedTokenPda } from "@solana-program/token-2022";
import { hookExtras } from "../lib/hook.js";
import { entitlementPda, investorPda, seriesPda } from "../lib/pda.js";
import type { QuponSeriesConfig } from "../lib/config.js";
import {
  bondLegExtras,
  recordDateSnapshotIx,
  recordPending,
  tradeAccrued,
  type Admitted,
} from "./trade.js";
import type { SeriesInfo } from "./common.js";

const MINT = address("7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau");
const SELLER = address("6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cve7BxX5M9rdC");
const BUYER = address("DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo");
const SWAP = address("Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97");
const ACTION = address("8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma");

const ata = async (owner: Address, mint: Address) =>
  (
    await findAssociatedTokenPda({
      owner,
      mint,
      tokenProgram: address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
    })
  )[0];

/** SeriesInfo fixture: only the fields the builders read (hook, record_at, open_action). */
async function infoOf(series: Partial<Series>): Promise<SeriesInfo> {
  return {
    name: "T",
    sc: {} as QuponSeriesConfig,
    mint: MINT,
    pda: await seriesPda(MINT),
    account: {
      hook: 0,
      recordAt: 0n,
      openAction: { __option: "None" },
      ...series,
    } as unknown as Series,
  };
}

const hooked: Partial<Series> = {
  hook: 1,
  recordAt: 1_000n,
  openAction: { __option: "Some", value: ACTION },
};

describe("recordPending (hooked series, plan 15 D1')", () => {
  it("is pending only when hooked, a record is armed and now ≥ record_at", async () => {
    expect(recordPending(await infoOf(hooked), 1_000)).toBe(true);
    expect(recordPending(await infoOf(hooked), 999)).toBe(false);
    expect(
      recordPending(await infoOf({ ...hooked, recordAt: 0n }), 9_999),
    ).toBe(false);
    expect(recordPending(await infoOf({ ...hooked, hook: 0 }), 9_999)).toBe(
      false,
    ); // legacy series: pause path
  });
});

describe("bondLegExtras", () => {
  it("hooked series: the 5 read-only hook extras for the bond leg's owners", async () => {
    const info = await infoOf(hooked);
    expect(await bondLegExtras(info, SWAP, BUYER)).toEqual(
      await hookExtras(MINT, SWAP, BUYER),
    );
  });

  it("legacy series (series.hook == 0): no extras", async () => {
    expect(await bondLegExtras(await infoOf({ hook: 0 }), SWAP, BUYER)).toEqual(
      [],
    );
  });
});

describe("recordDateSnapshotIx (settle across the record date)", () => {
  it("appends seller group + escrow group + buyer group in the pinned order", async () => {
    const info = await infoOf(hooked);
    const escrow = await ata(SWAP, MINT);
    const adm: Admitted = {
      admission: ACTION, // any address — the assertion only checks it is passed through read-only
      data: {
        seller: SELLER,
        buyer: BUYER,
        swapDvp: SWAP,
        escrow,
      } as unknown as TradeAdmission,
    };
    const ckpt = async (owner: Address) =>
      (await findCheckpointPda({ series: info.pda, owner }))[0];
    const ro = (a: Address) => ({ address: a, role: AccountRole.READONLY });
    const wr = (a: Address) => ({ address: a, role: AccountRole.WRITABLE });
    const ix = await recordDateSnapshotIx(
      createNoopSigner(SELLER),
      info,
      ACTION,
      adm,
    );
    // 5 fixed accounts (authority, series, action, mint, system) + 4 + 5 + 4 position accounts
    expect(ix.accounts.length).toBe(18);
    expect(ix.accounts.slice(5)).toEqual([
      ro(await investorPda(info.pda, SELLER)),
      ro(await ata(SELLER, MINT)),
      wr(await entitlementPda(ACTION, SELLER)),
      wr(await ckpt(SELLER)),
      ro(ACTION),
      ro(escrow),
      wr(await entitlementPda(ACTION, SELLER)),
      wr(await ckpt(SWAP)),
      ro(await investorPda(info.pda, SELLER)),
      ro(await investorPda(info.pda, BUYER)),
      ro(await ata(BUYER, MINT)),
      wr(await entitlementPda(ACTION, BUYER)),
      wr(await ckpt(BUYER)),
    ]);
  });
});

describe("DvP leg_a_extras_count", () => {
  it("rides in the SettleDvp data byte after the discriminator (extras.length = 5 on a hooked series)", async () => {
    const settle = getSettleDvpInstruction({
      settlementAuthority: createNoopSigner(SELLER),
      swapDvp: SWAP,
      mintA: MINT,
      mintB: BUYER,
      dvpAtaA: SWAP,
      dvpAtaB: BUYER,
      userADestinationAtaB: BUYER,
      userBDestinationAtaA: BUYER,
      userAAtaA: BUYER,
      userBAtaB: BUYER,
      tokenProgramA: MINT,
      tokenProgramB: MINT,
      memoProgram: BUYER,
      legAExtrasCount: 5,
    });
    expect(settle.data![1]).toBe(5); // u8 discriminator, then the extras count
    // the 5 extras the runners append are exactly hookExtras(mint, escrow owner, buyer)
    expect((await hookExtras(MINT, SWAP, BUYER)).length).toBe(5);
    expect(
      (await findExtraAccountMetaListPda({ mint: MINT }))[0],
    ).toBeDefined();
    expect(QUPON_BONDS_PROGRAM_ADDRESS).toBe(
      "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd",
    );
  });
});

describe("tradeAccrued (plan 15, task 1515; fixtures accrued_cases)", () => {
	// 30E/360 series from 2026-10-03, real Almaty clock; 12:00 Almaty = 07:00 UTC.
	const series = {
		periodStart: BigInt(Date.UTC(2026, 9, 2, 19) / 1_000),
		dayCount: 0, // Thirty360
		faceValue: 100_000n,
		couponRateBps: 1_000,
		daySecs: 0,
		issueDate: 0n,
		issueYmd: 20261003,
	};
	const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 7) / 1_000;
	it("trade_5_bonds_30_days", () => {
		expect(tradeAccrued(series, null, 5n, at(2026, 11, 3))).toEqual({ amount: 4_167n, days: 30 });
	});
	it("ex_coupon_negative_1_day: from the open coupon's period end", () => {
		const coupon = { kind: 0, recordAt: BigInt(at(2027, 1, 2) - 60), periodEnd: BigInt(Date.UTC(2027, 0, 2, 19) / 1_000) };
		expect(tradeAccrued(series, coupon, 10n, at(2027, 1, 2))).toEqual({ amount: -278n, days: -1 });
		// Before the record time the bond still trades cum-coupon.
		expect(tradeAccrued(series, { ...coupon, recordAt: BigInt(at(2027, 1, 2) + 60) }, 10n, at(2027, 1, 2)).amount > 0n).toBe(true);
	});
});
