import type { MockHandler } from "./types";

/**
 * Mock-mode notifications (task 805): a small stateful inbox shared by every mock session, so the bell count,
 * the panel and the full list agree within one dev server run.
 */
const QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const ago = (min: number) => Math.floor(Date.now() / 1000) - min * 60;

type Row = {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: number;
  readAt: number | null;
};

const inbox: Row[] = [
  {
    id: 4,
    kind: "entitlement_paid",
    payload: { series: QPNB1, net: "450000" },
    createdAt: ago(6),
    readAt: null,
  },
  {
    id: 3,
    kind: "meeting_opened",
    payload: { series: QPNB1, actionKind: "BMET" },
    createdAt: ago(55),
    readAt: null,
  },
  {
    id: 2,
    kind: "action_announced",
    payload: { series: QPNB1, actionKind: "INTR" },
    createdAt: ago(60 * 26),
    readAt: null,
  },
  {
    id: 1,
    kind: "kyc_decision",
    payload: { status: "approved" },
    createdAt: ago(60 * 50),
    readAt: ago(60 * 49),
  },
];

export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/me\/notifications\/count$/,
    reply: () => ({ unread: inbox.filter((n) => !n.readAt).length }),
  },
  {
    method: "GET",
    path: /^\/me\/notifications$/,
    reply: (_m, _b, q) => {
      const limit = Number(q.get("limit") ?? 50) || 50;
      const rows =
        q.get("unread") === "1" ? inbox.filter((n) => !n.readAt) : inbox;
      return { notifications: rows.slice(0, limit) };
    },
  },
  {
    method: "POST",
    path: /^\/me\/notifications\/read$/,
    reply: (_m, body) => {
      const b = (body ?? {}) as { ids?: number[]; all?: boolean };
      let marked = 0;
      for (const n of inbox)
        if (!n.readAt && (b.all || b.ids?.includes(n.id))) {
          n.readAt = Math.floor(Date.now() / 1000);
          marked++;
        }
      return { ok: true, marked };
    },
  },
];
