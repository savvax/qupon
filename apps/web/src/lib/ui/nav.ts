/** The deepest nav item whose href prefixes the path (so /issuer/series/x lights "Series", not "Dashboard"). */
export function activeHref(
  pathname: string,
  hrefs: string[],
): string | undefined {
  return hrefs
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];
}
