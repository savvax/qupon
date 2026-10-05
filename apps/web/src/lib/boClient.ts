import { ERROR_EXPLANATIONS, findOnchainError } from "@/lib/actionFlow";

/** A failed back-office call: HTTP status + the API's {code, message, onchainError?}. Status 0 = network. */
export class BoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly onchainError?: string,
  ) {
    super(message);
    this.name = "BoError";
  }
}

export type BoErrorLike = {
  status: number;
  code: string;
  message: string;
  onchainError?: string;
};

/** Parse an error response ({code, message | error, onchainError?}; anything else → http_<status>). */
export async function boErrorFrom(res: Response): Promise<BoError> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return new BoError(
    res.status,
    str(body.code) ?? `http_${res.status}`,
    str(body.message) ?? str(body.error) ?? res.statusText,
    str(body.onchainError),
  );
}

/** next-intl's `t` for the `errors` namespace (or the English defaults below). */
export type ErrorText = ((key: string) => string) & {
  has?: (key: string) => boolean;
};

const EN: Record<string, string> = {
  sessionExpired: "Your session expired — sign in again.",
  forbidden: "Your role can't do this.",
  throttled: "Demo limit reached — try again in a few minutes.",
  unreachable: "The registrar service is unreachable — try again in a moment.",
};
const english: ErrorText = (key) => EN[key] ?? key;

/** One sentence for a failed call. On-chain refusals lead with the program's error name. */
export function explainBoError(e: BoErrorLike, t: ErrorText = english): string {
  if (e.status === 401) return t("sessionExpired");
  if (e.status === 403 && e.code === "forbidden") return t("forbidden");
  if (e.code === "demo_throttled") return t("throttled");
  if (e.status === 0 || e.status === 502 || e.code === "upstream")
    return t("unreachable");
  const name = findOnchainError(`${e.onchainError ?? ""} ${e.message}`);
  if (name) {
    const key = `onchain.${name}`;
    return `${name} — ${t.has?.(key) ? t(key) : ERROR_EXPLANATIONS[name]}`;
  }
  return e.message;
}

/** POST a back-office write through the session proxy (/api/bo/<path>); throws BoError. */
export async function boPost<T>(path: string, body: unknown = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/bo/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new BoError(
      0,
      "upstream",
      e instanceof Error ? e.message : String(e),
    );
  }
  if (!res.ok) throw await boErrorFrom(res);
  return (await res.json()) as T;
}

/**
 * Only same-site paths survive as ?next=: one leading slash, then no slash/backslash, and no control characters
 * anywhere (browsers strip tab/newline, so "/\t/evil.com" would become "//evil.com").
 */
export function safeNext(next: string | null | undefined): string | undefined {
  return next && /^\/(?![/\\])[^\\\u0000-\u001f\u007f]*$/.test(next)
    ? next
    : undefined;
}
