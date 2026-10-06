import type { MockHandler } from "./types";

/**
 * Mock-mode fixtures for the `kyc` feature (platform v2). Task 705 needs only
 * the pending queue count for the admin overview; task 804 fills the rest.
 */

const applications = [
  {
    id: 4,
    userId: 5,
    fullName: "Mira Member",
    status: "pending",
    createdAt: "2026-10-06T09:15:00+05:00",
  },
  {
    id: 5,
    userId: 6,
    fullName: "Demo Investor",
    status: "pending",
    createdAt: "2026-10-06T10:02:00+05:00",
  },
];

export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/registrar\/kyc$/,
    reply: (_m, _body, query) =>
      query.get("status") === "pending"
        ? { applications }
        : { applications: [...applications] },
  },
];
