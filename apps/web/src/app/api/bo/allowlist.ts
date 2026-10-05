/** Paths the browser may POST through /api/bo — back-office writes only (sign-in has its own routes). */
export function isAllowedWrite(path: string): boolean {
  return (
    /^(issuer|registrar|demo)\/[A-Za-z0-9/_-]{1,200}$/.test(path) &&
    !path.includes("..") &&
    !path.includes("//")
  );
}
