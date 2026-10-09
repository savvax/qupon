/** A stored org website becomes a link href only when it is a plain http(s) URL —
 * anything else (e.g. values that predate the API scheme check) renders as text.
 * The scheme compares case-insensitively: HTTPS:// is valid per RFC 3986 (task 1423). */
export function httpHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}
