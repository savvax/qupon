import type { components } from "./api-schema";
/// <reference types="node" /> // process.env reads below need node's ambient types in single-file checks
import { mockGet, mockGetText } from "../mocks/api";
import { BoError, boPost } from "./boClient";
import { type Locale } from "@/i18n/locale";

export type Schemas = components["schemas"];
export type Amount = Schemas["Amount"];
/** `openTrades` (plan 13): admitted secondary trades not yet settled or cancelled; OpenAPI gains it with task 1306. */
export type SeriesDTO = Schemas["SeriesDTO"] & { openTrades?: number };
export type InvestorDTO = Schemas["InvestorDTO"];
export type EntitlementDTO = Schemas["EntitlementDTO"];
export type ScheduleItem = Schemas["ScheduleItem"];
export type ActionDTO = Schemas["ActionDTO"];
export type BankPendingPayout = Schemas["BankPendingPayout"];
export type ReconcileReport = Schemas["ReconcileReport"];
export type AdvanceResponse = Schemas["AdvanceResponse"];
export type ErrorDTO = Schemas["Error"];
export type HolderLookupDTO = Schemas["HolderLookupDTO"];
export type UpcomingPayoutDTO = Schemas["UpcomingPayoutDTO"];

/** Base URL of the Go registrar service. NEXT_PUBLIC_API_URL is inlined for
 * browser callers (postAdvance); server components can also set API_URL. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  "http://localhost:8080";

/** Serve demo fixtures instead of HTTP while the Go registrar does not exist.
 * NEXT_PUBLIC_API_MOCKING mirrors it into the browser bundle (client-side
 * portal loads); the server-only API_MOCKING stays for deploys. */
export const MOCK_ENABLED =
  process.env.API_MOCKING === "enabled" ||
  process.env.NEXT_PUBLIC_API_MOCKING === "enabled";
const MOCK = process.env.NODE_ENV === "development" && MOCK_ENABLED;
/** Whether reads are served by the in-process mock registrar — server components use it to mirror mock-only behaviour. */
export const MOCK_API = MOCK;
let mockWarned = false;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly onchainError?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string): Promise<T> {
  if (MOCK) {
    if (!mockWarned) {
      mockWarned = true;
      console.warn(
        `[qupon] mock registrar API enabled (API_MOCKING=enabled) — set API_MOCKING=disabled and API_URL=<registrar> for the real service`,
      );
    }
    return mockGet(path) as Promise<T>;
  }
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    let code = `http_${res.status}`;
    let message = res.statusText;
    let onchainError: string | undefined;
    try {
      const body = (await res.json()) as ErrorDTO;
      code = body.code;
      message = body.message;
      onchainError = body.onchainError ?? undefined;
    } catch {
      // non-JSON error body — keep http_* code
    }
    throw new ApiError(res.status, code, message, onchainError);
  }
  return (await res.json()) as T;
}

/**
 * Activity feed row. The Go store serializes snake_case (action_pda) while
 * openapi.yaml promises camelCase — accept both so either deployment shape
 * renders; payload is the decoded event (snake_case field names).
 */
export type ActivityLike = {
  id: number;
  ts: number;
  kind: string;
  sig: string;
  slot?: number;
  seq?: number;
  actionPda?: string | null;
  action_pda?: string | null;
  seriesMint?: string | null;
  /** snake_case from the Go store; despite the name it holds the Series account (PDA), not the bond mint */
  series_mint?: string | null;
  payload?: Record<string, unknown> | null;
  explorerUrl?: string;
};

export async function getNoticeText(
  pda: string,
  lang: Locale,
): Promise<string> {
  if (MOCK) return mockGetText(`/actions/${pda}/notice?lang=${lang}`);
  const res = await fetch(
    `${API_BASE_URL}/actions/${pda}/notice?lang=${lang}`,
    {
      cache: "no-store",
    },
  );
  if (res.status === 409) {
    // Not completed yet: show the API's reason instead of a notice that would state a payment not yet made.
    return (
      ((await res.json()) as { error?: string }).error ??
      "notice available after completion"
    );
  }
  if (!res.ok) throw new Error(`notice ${lang}: HTTP ${res.status}`);
  return res.text();
}

export const seev031Url = (pda: string) =>
  `${API_BASE_URL}/actions/${pda}/iso/seev031.xml`;
export const seev036ZipUrl = (pda: string) =>
  `${API_BASE_URL}/actions/${pda}/iso/seev036.zip`;
export const seev036Url = (pda: string) =>
  `${API_BASE_URL}/entitlements/${pda}/iso/seev036.xml`;

/** Mints hidden from every list (comma-separated, NEXT_PUBLIC_HIDE_SERIES): leftover devnet test series. */
const HIDDEN = new Set(
  (process.env.NEXT_PUBLIC_HIDE_SERIES ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
);
export const listSeries = () =>
  get<SeriesDTO[]>("/series").then((all) =>
    HIDDEN.size ? all.filter((s) => !HIDDEN.has(s.mint)) : all,
  );
export const getSeries = (mint: string) => get<SeriesDTO>(`/series/${mint}`);
export const listInvestors = (mint: string) =>
  get<InvestorDTO[]>(`/series/${mint}/investors`);
export const getSchedule = (mint: string) =>
  get<ScheduleItem[]>(`/series/${mint}/schedule`);
export const listActions = (mint: string) =>
  get<ActionDTO[]>(`/series/${mint}/actions`);
export const listEntitlements = (actionPda: string) =>
  get<EntitlementDTO[]>(`/actions/${actionPda}/entitlements`);
export const getAction = (pda: string) => get<ActionDTO>(`/actions/${pda}`);
/** The mock-aware public GET used across this module; feature libs reuse it (lib/kase.ts). */
export const apiGet = get;

/** KASE schedule check (platform v2 §5.5): kase.kz fixation vs on-chain record date. */
export type KaseCheck = {
  status: "ok" | "no_ticker" | "no_period" | "no_schedule" | "error";
  actionPda: string;
  ticker?: string;
  recordDate?: string;
  kaseFixation?: string;
  period?: { start: string; end: string } | null;
  kasePeriod?: {
    recordDate: string;
    start: string;
    end: string;
    rate: number;
  } | null;
  match: boolean;
  stale: boolean;
  fetchedAt?: string;
};
export const getKaseCheck = (pda: string) =>
  get<KaseCheck>(`/actions/${pda}/kase-check`);

/** Bank-routed payouts waiting for the paying agent's confirmation (plan 15 D6); the transfer itself is SIMULATED. */
export async function getBankPending(
  pda: string,
): Promise<{ bankPending: number; items: BankPendingPayout[] }> {
  return get(`/actions/${pda}/bank-pending`);
}

/** Confirm one bank-routed payout with the bank transfer reference (paying agent or registrar session). */
export function postConfirmBank(
  pda: string,
  req: { owner: string; reference: string },
): Promise<{ ok: boolean; signature?: string; explorerUrl?: string }> {
  return boPost(`actions/${pda}/confirm-bank`, req);
}

/** Disclosure ZIP (notices RU/EN, seev.031, seev.036 per holder, manifest) — platform v2 §5.5. */
export const disclosureZipUrl = (pda: string) =>
  `${API_BASE_URL}/actions/${pda}/disclosure.zip`;

/** A document attached to a series is public: the registrar serves it without a session (task 807). */
export const seriesDocumentUrl = (id: number) =>
  `${API_BASE_URL}/documents/${id}`;

/** Documents attached to a series (public metadata, task 807); failures never block the page. */
export async function listSeriesDocuments(mint: string): Promise<
  {
    id: number;
    kind: string;
    filename: string;
    size: number;
    createdAt: number;
  }[]
> {
  return get<{
    documents: {
      id: number;
      kind: string;
      filename: string;
      size: number;
      createdAt: number;
    }[];
  }>(`/series/${mint}/documents`)
    .then((b) => b.documents ?? [])
    .catch(() => []);
}

/** "Submit to KASE" is SIMULATED: records an audit row only, nothing is sent. */
export async function postDisclosureSubmit(pda: string): Promise<{
  ok: boolean;
  simulated: boolean;
}> {
  return boPost(`registrar/actions/${pda}/disclosure/submit`, {});
}

/** Public lists also skip the series the live e2e issues on every run (tickers `E2E-…`) and the judge
 *  sandboxes (`SBX-…`, whose own pages link them); cabinets still show them. */
// ponytail: ticker prefix; add a sandbox flag to SeriesDTO if tickers change
export const listPublicSeries = () =>
  listSeries().then((all) =>
    all.filter(
      (s) => !s.ticker.startsWith("E2E-") && !s.ticker.startsWith("SBX-"),
    ),
  );

export async function getReconcile(pda: string): Promise<ReconcileReport> {
  return get<ReconcileReport>(`/actions/${pda}/reconcile`);
}

export async function listActivity(
  limit = 200,
  mint?: string,
): Promise<ActivityLike[]> {
  // mint narrows the feed server-side (the dossier journal: sandbox runs flood the global window)
  const qs = `limit=${limit}${mint ? `&mint=${encodeURIComponent(mint)}` : ""}`;
  if (MOCK) return (await mockGet(`/activity?${qs}`)) as ActivityLike[];
  const res = await fetch(`${API_BASE_URL}/activity?${qs}`);
  if (!res.ok) return []; // the feed is evidence, not a dependency
  const body = (await res.json()) as { events?: ActivityLike[] };
  return body.events ?? [];
}

/** Slot of the newest indexed event (header network chip); undefined when the feed is empty or down. */
export const latestSlot = (): Promise<number | undefined> =>
  listActivity(1)
    .then(
      (evs) => evs.reduce((m, e) => Math.max(m, e.slot ?? 0), 0) || undefined,
    )
    .catch(() => undefined);

/** Advance one lifecycle step through the session proxy (registrar session required). */
export async function postAdvance(
  pda: string,
  req: { confirm: boolean; autofund?: boolean },
): Promise<AdvanceResponse> {
  try {
    return await boPost<AdvanceResponse>(
      `registrar/actions/${pda}/advance`,
      req,
    );
  } catch (e) {
    if (e instanceof BoError)
      throw new ApiError(e.status, e.code, e.message, e.onchainError);
    throw e;
  }
}

/** The series an activity event belongs to: events name it by its Series account (PDA); mocks use the mint. */
export function eventSeries(
  ev: ActivityLike,
  series: SeriesDTO[],
): SeriesDTO | undefined {
  const key =
    ev.seriesMint ??
    ev.series_mint ??
    (ev.payload?.series as string | undefined);
  return key ? series.find((s) => s.pda === key || s.mint === key) : undefined;
}
