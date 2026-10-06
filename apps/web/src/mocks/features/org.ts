import type { MockHandler } from "./types";

/**
 * Mock-mode fixtures for the org feature (platform v2 §5.3, task 807): the demo issuer
 * organisation, its team, one-time invite links and the documents attached to the demo bond.
 * Email delivery of invites is not integrated (SIMULATED) — the link is returned to the caller.
 */
const QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

const organization = {
  id: 1,
  name: "Steppe Capital LLP",
  kind: "llp",
  bin: "220840012345",
  website: "https://steppe.qupon.test",
  createdAt: at("2026-10-01T09:00:00+05:00"),
};

const members = [
  {
    id: 1,
    email: "demo-issuer@qupon.demo",
    name: "Demo issuer",
    role: "issuer",
    isDemo: true,
  },
  {
    id: 7,
    email: "mira@steppe.qupon.test",
    name: "Mira Issuer",
    role: "issuer",
    isDemo: false,
  },
  {
    id: 8,
    email: "almas@steppe.qupon.test",
    name: "Almas Issuer",
    role: "issuer",
    isDemo: false,
  },
];

/** Documents already attached to the demo series (public on the bond page). */
const seriesDocs = [
  {
    id: 21,
    kind: "prospectus",
    filename: "prospectus-2026-en.pdf",
    mime: "application/pdf",
    size: 482_304,
    seriesMint: QPNB1,
    createdAt: at("2026-10-05T10:00:00+05:00"),
  },
  {
    id: 22,
    kind: "decision",
    filename: "board-decision-14.pdf",
    mime: "application/pdf",
    size: 96_256,
    seriesMint: QPNB1,
    createdAt: at("2026-10-05T10:05:00+05:00"),
  },
];

export const handlers: MockHandler[] = [
  { method: "GET", path: /^\/org$/, reply: () => ({ organization }) },
  {
    method: "PATCH",
    path: /^\/org$/,
    reply: (_m, body) => {
      Object.assign(organization, body as object);
      return { organization };
    },
  },
  { method: "GET", path: /^\/org\/members$/, reply: () => ({ members }) },
  {
    method: "POST",
    path: /^\/org\/invites$/,
    reply: (_m, body) => ({
      url: `https://qupon.test/invite/Mock1nvalidToken4111111111111111111111`,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      email: (body as { email?: string }).email,
    }),
  },
  {
    method: "DELETE",
    path: /^\/org\/members\/(\d+)$/,
    reply: (m) => {
      const i = members.findIndex((x) => x.id === Number(m[1]));
      if (i >= 0) members.splice(i, 1);
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: /^\/series\/([^/]+)\/documents$/,
    reply: (m) => ({
      documents: m[1] === QPNB1 ? seriesDocs : [],
    }),
  },
  {
    method: "POST",
    path: /^\/issuer\/series\/([^/]+)\/documents$/,
    reply: (m, body) => {
      const b = body as { documentId?: number; kind?: string };
      const mint = m[1] ?? "";
      const d = {
        id: b.documentId ?? 99,
        kind: b.kind ?? "other",
        filename: `document-${b.documentId ?? 99}.pdf`,
        mime: "application/pdf",
        size: 123_456,
        seriesMint: mint,
        createdAt: Math.floor(Date.now() / 1000),
      };
      if (mint === QPNB1) seriesDocs.push(d);
      return { document: d };
    },
  },
];
