import {
  type Blockhash,
  address,
  compileTransactionMessage,
  getPublicKeyFromAddress,
  getSignatureFromTransaction,
  type SignatureBytes,
  signTransactionMessageWithSigners,
  verifySignature,
} from "@solana/kit";
import { Keypair, type VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { buildVoteIx } from "./portal";
import {
  type PortalRpc,
  signAndSendWithWallet,
  walletTransactionMessage,
  walletTransactionSigner,
} from "./walletSigner";

const PROGRAM = "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd";
const MINT = "HQWXGhNN3SUuaauG1z3vTjzfHRshJxdRYLF9gzzhFmsF";
const ACTION = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const lifetime = {
  blockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k" as Blockhash,
  lastValidBlockHeight: 100n,
};

/** Fake wallet: signs the web3.js transaction it receives, like Phantom's signTransaction. */
function fakeWallet(kp: Keypair) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async signTransaction<T>(tx: T): Promise<T> {
      calls++;
      (tx as VersionedTransaction).sign([kp]);
      return tx;
    },
  };
}

describe("wallet transaction signing", () => {
  it("vote message: owner is fee payer and signer, program is qupon_bonds", async () => {
    const kp = Keypair.generate();
    const owner = address(kp.publicKey.toBase58());
    const signer = walletTransactionSigner(fakeWallet(kp), owner);
    const ix = await buildVoteIx(MINT, ACTION, signer, 0);
    const compiled = compileTransactionMessage(
      walletTransactionMessage(signer, lifetime, [ix]),
    );
    expect(compiled.staticAccounts[0]).toBe(owner); // fee payer
    expect(compiled.header.numSignerAccounts).toBe(1);
    expect(compiled.staticAccounts).toContain(PROGRAM);
  });

  it("signs through signTransaction and returns a verifiable wire transaction", async () => {
    const kp = Keypair.generate();
    const owner = address(kp.publicKey.toBase58());
    const wallet = fakeWallet(kp);
    const signer = walletTransactionSigner(wallet, owner);
    const ix = await buildVoteIx(MINT, ACTION, signer, 1);
    const tx = await signTransactionMessageWithSigners(
      walletTransactionMessage(signer, lifetime, [ix]),
    );
    expect(wallet.calls).toBe(1);
    expect(getSignatureFromTransaction(tx)).toBeTruthy();
    const key = await getPublicKeyFromAddress(owner);
    expect(
      await verifySignature(
        key,
        tx.signatures[owner] as SignatureBytes,
        tx.messageBytes,
      ),
    ).toBe(true);
  });

  it("rejects a wallet that returns the transaction unsigned", async () => {
    const kp = Keypair.generate();
    const owner = address(kp.publicKey.toBase58());
    const signer = walletTransactionSigner(
      { signTransaction: async (t) => t },
      owner,
    );
    const ix = await buildVoteIx(MINT, ACTION, signer, 2);
    await expect(
      signTransactionMessageWithSigners(
        walletTransactionMessage(signer, lifetime, [ix]),
      ),
    ).rejects.toThrow(/did not sign/);
  });
});

/** Fake rpc for signAndSendWithWallet: fixed latest blockhash, scripted statuses and block height. */
function fakeRpc(
  status: () => { err?: object; confirmationStatus?: string } | null,
  blockHeight: () => bigint,
): PortalRpc {
  return {
    getLatestBlockhash: () => ({
      send: async () => ({
        value: {
          blockhash: lifetime.blockhash,
          lastValidBlockHeight: lifetime.lastValidBlockHeight,
        },
      }),
    }),
    sendTransaction: () => ({ send: async () => "sig" }),
    getSignatureStatuses: () => ({ send: async () => ({ value: [status()] }) }),
    getBlockHeight: () => ({ send: async () => blockHeight() }),
  } as unknown as PortalRpc;
}

describe("signAndSendWithWallet confirmation", () => {
  async function send(rpc: PortalRpc) {
    const kp = Keypair.generate();
    const owner = address(kp.publicKey.toBase58());
    const signer = walletTransactionSigner(fakeWallet(kp), owner);
    const ix = await buildVoteIx(MINT, ACTION, signer, 3);
    return signAndSendWithWallet(signer, rpc, [ix], {
      confirmTimeoutMs: 40,
      pollMs: 5,
    });
  }

  it("rejects when statuses stay null and the block height passes lastValidBlockHeight (dropped, not executed)", async () => {
    const rpc = fakeRpc(
      () => null,
      () => lifetime.lastValidBlockHeight + 1n,
    );
    await expect(send(rpc)).rejects.toThrow(/expired.*not executed/);
  });

  it("returns pending when the wait budget runs out while the blockhash is still valid", async () => {
    const rpc = fakeRpc(
      () => null,
      () => lifetime.lastValidBlockHeight - 10n,
    );
    const res = await send(rpc);
    expect(res.pending).toBe(true);
    expect(res.signature).toBeTruthy();
  });

  it("returns confirmed when the status reaches confirmed", async () => {
    const rpc = fakeRpc(
      () => ({ confirmationStatus: "confirmed" }),
      () => 0n,
    );
    const res = await send(rpc);
    expect(res.pending).toBe(false);
  });
});
