import { startSession } from "../start";

export function POST(req: Request) {
  return startSession(req, "/auth/demo");
}
