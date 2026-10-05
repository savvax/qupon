import type { components } from "./api-schema";
import { mockGet } from "../mocks/api";

export type Schemas = components["schemas"];
export type Amount = Schemas["Amount"];
export type SeriesDTO = Schemas["SeriesDTO"];
export type InvestorDTO = Schemas["InvestorDTO"];
export type ScheduleItem = Schemas["ScheduleItem"];
export type ActionDTO = Schemas["ActionDTO"];
export type ErrorDTO = Schemas["Error"];

/** Base URL of the Go registrar service (server-side env). */
export const API_BASE_URL = process.env.API_URL ?? "http://localhost:8080";

/** Serve demo fixtures instead of HTTP while the Go registrar does not exist. */
const MOCK =
  process.env.NODE_ENV === "development" && process.env.API_MOCKING !== "disabled";
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
        `[qupon] mock registrar API enabled — set API_MOCKING=disabled and API_URL=<registrar> for the real service`,
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

export const listSeries = () => get<SeriesDTO[]>("/series");
export const getSeries = (mint: string) => get<SeriesDTO>(`/series/${mint}`);
export const listInvestors = (mint: string) =>
  get<InvestorDTO[]>(`/series/${mint}/investors`);
export const getSchedule = (mint: string) =>
  get<ScheduleItem[]>(`/series/${mint}/schedule`);
export const listActions = (mint: string) =>
  get<ActionDTO[]>(`/series/${mint}/actions`);
