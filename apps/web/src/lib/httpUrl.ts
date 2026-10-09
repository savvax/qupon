/** A stored org website becomes a link href only when it is a plain http(s) URL —
 * anything else (e.g. values that predate the API scheme check) renders as text. */
export function httpHref(url: string): string | null {
  return /^https?:\/\//.test(url) ? url : null;
}
