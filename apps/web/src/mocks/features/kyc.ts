import type { MockHandler } from "./types";

/**
 * Mock-mode fixtures for KYC (platform v2 §5.3, tasks 803/804): a review queue for the registrar and an empty
 * application for the `mock:member` investor (one linked wallet in mocks/features/account.ts).
 */
const QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const BTRK = "BTRKDeM0BondMint1111111111111111111111111111";
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

const doc = (
  id: number,
  kind: "id_document" | "proof_of_address",
  filename: string,
) => ({
  id,
  kind,
  filename,
  mime: "application/pdf",
  size: 184_320,
  createdAt: at("2026-10-06T09:10:00+05:00"),
});

const applications = [
  {
    id: 4,
    userId: 5,
    userEmail: "aigerim@example.kz",
    userName: "Aigerim",
    wallet: "7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau",
    investorType: "individual",
    residency: "resident",
    taxBps: 0,
    fullName: "Aigerim Seitkali",
    documentIds: [11, 12],
    seriesMints: [QPNB1],
    status: "submitted",
    reason: "",
    results: [],
    decidedAt: null,
    createdAt: at("2026-10-06T09:15:00+05:00"),
    documents: [
      doc(11, "id_document", "passport.pdf"),
      doc(12, "proof_of_address", "utility-bill.pdf"),
    ],
  },
  {
    id: 5,
    userId: 6,
    userEmail: "daniel@example.com",
    userName: "Daniel",
    wallet: "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC",
    investorType: "individual",
    residency: "nonresident",
    taxBps: 1500,
    fullName: "Daniel Novak",
    documentIds: [13],
    seriesMints: [QPNB1, BTRK],
    status: "submitted",
    reason: "",
    results: [],
    decidedAt: null,
    createdAt: at("2026-10-06T10:02:00+05:00"),
    documents: [doc(13, "id_document", "id-card.pdf")],
  },
  {
    id: 3,
    userId: 4,
    userEmail: "timur@example.kz",
    userName: "Timur",
    wallet: "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo",
    investorType: "legal_entity",
    residency: "resident",
    taxBps: 0,
    fullName: "Steppe Capital LLP",
    documentIds: [10],
    seriesMints: [QPNB1],
    status: "approved",
    reason: "",
    results: [
      {
        series: QPNB1,
        investor: "Inv1Dem0",
        attestation: "Att1Dem0",
        signatures: [
          "MockKycSig11111111111111111111111111111111111111111111111111111111111111111111111111111",
        ],
      },
    ],
    decidedAt: at("2026-10-05T16:40:00+05:00"),
    createdAt: at("2026-10-05T15:00:00+05:00"),
    documents: [doc(10, "id_document", "registration-certificate.pdf")],
  },
  {
    id: 2,
    userId: 3,
    userEmail: "alex@example.com",
    userName: "Alex",
    wallet: "EiAZ7r9tVciGeibwdFmjbhhZVeSGXxY2CMuqP71MaN6g",
    investorType: "individual",
    residency: "nonresident",
    taxBps: 1500,
    fullName: "Alex Ivanov",
    documentIds: [9],
    seriesMints: [BTRK],
    status: "rejected",
    reason: "The passport scan is unreadable — upload a clearer copy.",
    results: [],
    decidedAt: at("2026-10-05T12:00:00+05:00"),
    createdAt: at("2026-10-05T11:30:00+05:00"),
    documents: [doc(9, "id_document", "scan.pdf")],
  },
];

export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/registrar\/kyc$/,
    reply: (_m, _body, query) => {
      const s = query.get("status");
      return { applications: applications.filter((a) => !s || a.status === s) };
    },
  },
  {
    method: "GET",
    path: /^\/registrar\/kyc\/(\d+)$/,
    reply: (m) => {
      const a =
        applications.find((x) => x.id === Number(m[1])) ?? applications[0];
      return { application: a };
    },
  },
  {
    method: "POST",
    path: /^\/registrar\/kyc\/(\d+)\/approve$/,
    reply: (m) => {
      const a =
        applications.find((x) => x.id === Number(m[1])) ?? applications[0]!;
      const results = a.seriesMints.map((series, i) => ({
        series,
        investor: `InvDem0${i}`,
        attestation: "AttDem0",
        signatures: [
          `MockKycApprove${i}11111111111111111111111111111111111111111111111111111111111111111111111`.slice(
            0,
            88,
          ),
        ],
      }));
      return {
        ok: true,
        status: "approved",
        results,
        signatures: results.flatMap((r) => r.signatures),
      };
    },
  },
  {
    method: "POST",
    path: /^\/registrar\/kyc\/(\d+)\/reject$/,
    reply: () => ({ ok: true, status: "rejected" }),
  },
  { method: "GET", path: /^\/me\/kyc$/, reply: () => ({ application: null }) },
  {
    method: "GET",
    path: /^\/me\/documents$/,
    reply: () => ({ documents: [] }),
  },
  {
    method: "POST",
    path: /^\/me\/kyc$/,
    reply: (_m, body) => {
      const b = body as Record<string, unknown>;
      return {
        application: {
          ...b,
          id: 9,
          userId: 2,
          userEmail: "member@qupon.test",
          userName: "Mira Member",
          status: "submitted",
          reason: "",
          results: [],
          decidedAt: null,
          createdAt: Math.floor(Date.now() / 1000),
        },
      };
    },
  },
];
