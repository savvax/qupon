import type { components } from "./api-schema";
import { mockGet, mockGetText } from "../mocks/api";
import { BoError, boPost } from "./boClient";

export type Schemas = components["schemas"];
export type Amount = Schemas["Amount"];
export type SeriesDTO = Schemas["SeriesDTO"];
export type InvestorDTO = Schemas["InvestorDTO"];
export type EntitlementDTO = Schemas["EntitlementDTO"];
export type ScheduleItem = Schemas["ScheduleItem"];
export type ActionDTO = Schemas["ActionDTO"];
export type ReconcileReport = Schemas["ReconcileReport"];
export type AdvanceResponse = Schemas["AdvanceResponse"];
export type ErrorDTO = Schemas["Error"];

/** Base URL of the Go registrar service. NEXT_PUBLIC_API_URL is inlined for
 * browser callers (postAdvance); server components can also set API_URL. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  "http://localhost:8080";

/** Serve demo fixtures instead of HTTP while the Go registrar does not exist. */
export const MOCK_ENABLED = process.env.API_MOCKING === "enabled";
const MOCK = process.env.NODE_ENV === "development" && MOCK_ENABLED;
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
  payload?: Record<string, unknown> | null;
  explorerUrl?: string;
};

export async function getNoticeText(
  pda: string,
  lang: "en" | "ru",
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

export const listSeries = () => get<SeriesDTO[]>("/series");
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

export async function getReconcile(pda: string): Promise<ReconcileReport> {
  return get<ReconcileReport>(`/actions/${pda}/reconcile`);
}

export async function listActivity(limit = 200): Promise<ActivityLike[]> {
  if (MOCK)
    return (await mockGet(`/activity?limit=${limit}`)) as ActivityLike[];
  const res = await fetch(`${API_BASE_URL}/activity?limit=${limit}`);
  if (!res.ok) return []; // the feed is evidence, not a dependency
  const body = (await res.json()) as { events?: ActivityLike[] };
  return body.events ?? [];
}

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
