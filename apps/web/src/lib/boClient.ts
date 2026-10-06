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

/** Set while a user-confirmed mainnet write runs: every write of that call carries X-Confirm-Network. */
let confirmedNetwork: string | undefined;

/** Run `call` with the typed mainnet confirmation attached to its writes (see useRunWrite). */
export async function withNetworkConfirm<T>(
  network: string,
  call: () => Promise<T>,
): Promise<T> {
  confirmedNetwork = network;
  try {
    return await call();
  } finally {
    confirmedNetwork = undefined;
  }
}

/** POST a back-office write through the session proxy (/api/bo/<path>); throws BoError. */
export function boPost<T>(path: string, body: unknown = {}): Promise<T> {
  return boSend<T>("POST", path, body);
}

/** Any write verb through the session proxy (PATCH /admin/users/3, DELETE /me/wallets/X); throws BoError. */
export async function boSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body: unknown = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/bo/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(confirmedNetwork ? { "X-Confirm-Network": confirmedNetwork } : {}),
      },
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

/** Upload a document (multipart) through /api/bo-upload/<path>, e.g. "me/documents"; throws BoError. */
export async function boUpload<T>(
  path: string,
  file: File,
  kind: string,
): Promise<T> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file);
  let res: Response;
  try {
    res = await fetch(`/api/bo-upload/${path}`, { method: "POST", body: form });
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
 * Like boUpload, with upload progress (0..1) — fetch cannot report request-body progress, XMLHttpRequest can.
 */
export function boUploadWithProgress<T>(
  path: string,
  file: File,
  kind: string,
  onProgress: (share: number) => void,
): Promise<T> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file);
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/bo-upload/${path}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new BoError(0, "upstream", "network error"));
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(body as T);
        return;
      }
      const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
      reject(
        new BoError(
          xhr.status,
          str(body.code) ?? `http_${xhr.status}`,
          str(body.message) ?? str(body.error) ?? xhr.statusText,
        ),
      );
    };
    xhr.send(form);
  });
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
