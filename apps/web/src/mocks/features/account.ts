import type { MockHandler } from "./types";

/** Mock-mode wallets of the `mock:member` account (platform v2 §5.3). */
const wallets = [
  {
    address: "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo",
    label: "",
    verifiedAt: 1_791_000_000,
  },
];

export const handlers: MockHandler[] = [
  { method: "GET", path: /^\/me\/wallets$/, reply: () => ({ wallets }) },
  {
    method: "POST",
    path: /^\/me\/wallets\/challenge$/,
    reply: (_m, body) => ({
      message: `Qupon wallet link\nmember@qupon.test\n${(body as { address: string }).address}\nnonce:mock`,
      expiresAt: "2026-10-06T12:10:00Z",
    }),
  },
  {
    method: "POST",
    path: /^\/me\/wallets$/,
    reply: (_m, body) => {
      const { address } = body as { address: string };
      const wallet = { address, label: "", verifiedAt: 1_791_100_000 };
      if (!wallets.some((w) => w.address === address)) wallets.push(wallet);
      return { wallet };
    },
  },
  {
    method: "DELETE",
    path: /^\/me\/wallets\/([^/]+)$/,
    reply: (m) => {
      const i = wallets.findIndex((w) => w.address === m[1]);
      if (i >= 0) wallets.splice(i, 1);
      return { ok: true };
    },
  },
  {
    method: "PATCH",
    path: /^\/me\/profile$/,
    reply: (_m, body) => ({ user: { ...(body as object) } }),
  },
  {
    method: "POST",
    path: /^\/me\/password$/,
    reply: () => ({ ok: true }),
  },
];
