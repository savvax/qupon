import { startSession } from "../start";

/** One-time invite link (task 807): creates the account in the inviting organisation. */
export function POST(req: Request) {
  return startSession(req, "/auth/invite/accept");
}
