/**
 * Mock-mode handler for one platform v2 route. `path` matches the registrar path without the query string
 * (e.g. /^\/admin\/users\/(\d+)$/); `reply` gets the match, the parsed JSON body (writes) and the query.
 * Throw `new Api404(...)` from ../api for a 404.
 */
export type MockHandler = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: RegExp;
  reply: (
    match: RegExpExecArray,
    body: unknown,
    query: URLSearchParams,
  ) => unknown;
};
