import { mockGet } from "../mocks/api";
import { BoError, boErrorFrom } from "./boClient";
import { MOCK_SESSIONS, apiBase, sessionToken } from "./session";

/** Server-side read of a back-office route with the session bearer (e.g. GET /registrar/audit). */
export async function boFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (MOCK_SESSIONS) return (await mockGet(path)) as T;
  const token = await sessionToken();
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.headers as Record<string, string>),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).catch(() => null);
  if (!res) throw new BoError(502, "upstream", "registrar API unreachable");
  if (!res.ok) throw await boErrorFrom(res);
  return (await res.json()) as T;
}
