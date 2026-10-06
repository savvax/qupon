import type { MockHandler } from "./types";

/** Mock-mode fixtures for the `admin` feature (platform v2 §5.2). Task 704 fills
 * series settings + audit (task 701 routes); users/orgs pages (703) extend this. */
const MINT_QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const MINT_BTRK = "BTRKDeM0BondMint1111111111111111111111111111";

const organizations = [
  {
    id: 1,
    name: "Demo Issuer JSC",
    kind: "issuer",
    bin: "990340004196",
    website: "",
    createdAt: 1770000000,
  },
  {
    id: 2,
    name: "Qupon Registrar JSC",
    kind: "registrar",
    bin: "",
    website: "",
    createdAt: 1770000001,
  },
];

type SeriesRow = {
  mint: string;
  pda: string;
  ticker: string;
  isin: string;
  hidden: boolean;
  featured: boolean;
  kaseTicker: string;
  orgId: number | null;
  updatedAt: number;
};

const series: SeriesRow[] = [
  {
    mint: MINT_QPNB1,
    pda: "SeRiesDem0Pda111111111111111111111111111111111",
    ticker: "QPNb1",
    isin: "KZ2C0QUPON01",
    hidden: false,
    featured: true,
    kaseTicker: "QPNB",
    orgId: 1,
    updatedAt: 1770000000,
  },
  {
    mint: MINT_BTRK,
    pda: "SeRiesDem0Pda222222222222222222222222222222222",
    ticker: "BTRKdemo",
    isin: "KZ2C00018703",
    hidden: false,
    featured: false,
    kaseTicker: "",
    orgId: null,
    updatedAt: 0,
  },
];

type AuditRow = {
  id: number;
  ts: number;
  userId: number;
  email: string;
  role: string;
  route: string;
  params: Record<string, unknown>;
  ok: boolean;
  detail: string;
  signatures: string[];
};

const nowSec = () => Math.floor(Date.now() / 1000);

const audit: AuditRow[] = [
  {
    id: 5,
    ts: nowSec() - 900,
    userId: 1,
    email: "admin@qupon.test",
    role: "admin",
    route: "PATCH /admin/series/" + MINT_QPNB1,
    params: { mint: MINT_QPNB1, hidden: true },
    ok: true,
    detail: "series settings updated",
    signatures: [],
  },
  {
    id: 4,
    ts: nowSec() - 3_600,
    userId: 2,
    email: "demo-registrar@qupon.demo",
    role: "registrar",
    route: "POST /registrar/investors",
    params: { owner: "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo" },
    ok: true,
    detail: "onboard",
    signatures: [
      "3Sp4jVLUu8FWeCJiKDA6mruYgRBMhJW9uCJdM2iNPvFrMdKaTrLoVe9nvCGdz9cAoPzVKYtu2",
    ],
  },
  {
    id: 3,
    ts: nowSec() - 86_400,
    userId: 3,
    email: "issuer@bastau.kz",
    role: "issuer",
    route: "POST /issuer/series",
    params: { name: "QPNb2", isin: "KZ2C0QUPON02" },
    ok: false,
    detail: "series_exists",
    signatures: [],
  },
  {
    id: 2,
    ts: nowSec() - 172_800,
    userId: 0,
    email: "",
    role: "reset",
    route: "POST /auth/reset",
    params: {},
    ok: true,
    detail: "password reset via token",
    signatures: [],
  },
];

/** Unix seconds from the audit filter values (unix or YYYY-MM-DD, like the API). */
const unix = (v: string): number | null => {
  if (/^\d+$/.test(v)) return Number(v);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
};

function filterAudit(query: URLSearchParams): AuditRow[] {
  return audit.filter((e) => {
    const user = query.get("user") ?? "";
    if (
      user &&
      !(
        String(e.userId) === user ||
        e.email.toLowerCase().includes(user.toLowerCase())
      )
    )
      return false;
    const role = query.get("role") ?? "";
    if (role && e.role !== role) return false;
    const route = query.get("route") ?? "";
    if (route && !e.route.includes(route)) return false;
    const ok = query.get("ok") ?? "";
    if (ok !== "" && e.ok !== (ok === "true")) return false;
    const from = query.get("from") ?? "";
    const fromTs = from ? unix(from) : null;
    if (fromTs !== null && e.ts < fromTs) return false;
    const to = query.get("to") ?? "";
    const toTs = to ? unix(to) : null;
    if (toTs !== null && e.ts > toTs) return false;
    return true;
  });
}

const csvEsc = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

const auditCsv = (rows: AuditRow[]): string =>
  [
    "id,time,user,role,route,ok,detail,params,signatures",
    ...rows.map((e) =>
      [
        e.id,
        new Date(e.ts * 1000).toISOString(),
        e.email,
        e.role,
        e.route,
        e.ok,
        e.detail,
        JSON.stringify(e.params),
        e.signatures.join(" "),
      ]
        .map((f) => csvEsc(String(f)))
        .join(","),
    ),
  ].join("\n");

export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/admin\/organizations$/,
    reply: () => ({ organizations }),
  },
  {
    method: "GET",
    path: /^\/admin\/series$/,
    reply: () => ({ series }),
  },
  {
    method: "PATCH",
    path: /^\/admin\/series\/([A-Za-z0-9]+)$/,
    reply: (m, body) => {
      const row = series.find((s) => s.mint === m[1]);
      if (!row) return { series: null };
      const b = (body ?? {}) as {
        hidden?: boolean;
        featured?: boolean;
        kaseTicker?: string;
        orgId?: number;
      };
      if (b.hidden !== undefined) row.hidden = b.hidden;
      if (b.featured !== undefined) row.featured = b.featured;
      if (b.kaseTicker !== undefined) row.kaseTicker = b.kaseTicker;
      if (b.orgId !== undefined) row.orgId = b.orgId === 0 ? null : b.orgId;
      row.updatedAt = nowSec();
      return { series: row };
    },
  },
  {
    method: "GET",
    path: /^\/admin\/audit$/,
    reply: (_m, _body, query) => {
      const rows = filterAudit(query);
      return query.get("format") === "csv" ? auditCsv(rows) : { entries: rows };
    },
  },
];
