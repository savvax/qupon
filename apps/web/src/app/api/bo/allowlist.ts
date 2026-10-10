const SAFE = (path: string) => !path.includes("..") && !path.includes("//");

/** Paths the browser may write through /api/bo — signed-in writes only (sign-in has its own routes). */
export function isAllowedWrite(path: string): boolean {
  return (
    (/^(issuer|registrar|demo|admin|me|org)\/[A-Za-z0-9/_-]{1,200}$/.test(
      path,
    ) ||
      // plan 15 D6: the paying agent (or registrar) confirms a bank-routed payout with its reference
      /^actions\/[A-Za-z0-9_-]{1,50}\/confirm-bank$/.test(path)) &&
    SAFE(path)
  );
}

/** Paths the browser may download through /api/bo-get (CSV reports, documents) with its session. */
export function isAllowedRead(path: string): boolean {
  return (
    (/^(admin|me|registrar|issuer|org|documents)\/[A-Za-z0-9/_.-]{1,200}$/.test(
      path,
    ) ||
      // plan 15 D9: the console re-hashes the seev.031 bytes in the browser — same-origin so CORS never bites
      /^actions\/[A-Za-z0-9_-]{1,50}\/iso\/seev031\.xml$/.test(path)) &&
    SAFE(path)
  );
}

/** Paths the browser may upload a document to through /api/bo-upload (multipart). */
export function isAllowedUpload(path: string): boolean {
  return (
    /^(me\/documents|issuer\/series\/[1-9A-HJ-NP-Za-km-z]{32,44}\/documents)$/.test(
      path,
    ) && SAFE(path)
  );
}

/** The judge sandbox (task 1532): the one write and read a visitor may make without signing in. */
export const isPublicWrite = (path: string) =>
  /^demo\/sandbox(\/[\w-]{1,40}\/scenario)?$/.test(path);
export const isPublicRead = (path: string) =>
  /^demo\/sandbox\/[\w-]{1,40}$/.test(path);
