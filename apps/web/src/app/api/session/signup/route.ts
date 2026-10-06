import { startSession } from "../start";

/** Investor self sign-up (task 802): creates the account and starts its session in one step. */
export function POST(req: Request) {
  return startSession(req, "/auth/signup");
}
