// pi extension: when the agent is about to finish, run `make verify`; if red, feed the tail back and continue (max 3 rounds).
// Loaded automatically from .pi/extensions/ after project trust (`pi -a` for one process). Event names per pi docs (extensions.md).
import { execSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let rounds = 0;
  pi.on("agent_before_settle", async (event: any) => {
    const last: string = String(event?.lastAssistantText ?? event?.text ?? "");
    if (/BLOCKED:/.test(last)) return;                 // let a BLOCKED turn through
    if (rounds >= 3) return;
    let out = "";
    try {
      execSync("make verify", { stdio: ["ignore", "pipe", "pipe"], timeout: 15 * 60 * 1000, encoding: "utf8" });
      return;                                          // green → settle
    } catch (e: any) {
      out = String(e?.stdout ?? "") + "\n" + String(e?.stderr ?? "");
    }
    rounds += 1;
    const tail = out.split("\n").slice(-60).join("\n");
    return {
      continue: true,
      entries: [{ type: "custom_message", content: `make verify failed (round ${rounds}/3). Fix the root cause — never weaken tests — re-run make verify, then finish with DONE:<id>. If the failure is outside your task, finish with BLOCKED:<id> <reason>.\n\n${tail}` }],
    };
  });
}
