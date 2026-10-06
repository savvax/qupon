const SAFE = (path: string) => !path.includes("..") && !path.includes("//");

/** Paths the browser may write through /api/bo — signed-in writes only (sign-in has its own routes). */
export function isAllowedWrite(path: string): boolean {
  return (
    /^(issuer|registrar|demo|admin|me|org)\/[A-Za-z0-9/_-]{1,200}$/.test(
      path,
    ) && SAFE(path)
  );
}

/** Paths the browser may download through /api/bo-get (CSV reports, documents) with its session. */
export function isAllowedRead(path: string): boolean {
  return (
    /^(admin|me|registrar|issuer|org|documents)\/[A-Za-z0-9/_.-]{1,200}$/.test(
      path,
    ) && SAFE(path)
  );
}
