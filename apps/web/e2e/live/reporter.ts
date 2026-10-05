import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

type Row = {
  title: string;
  status: string;
  duration: number;
  error?: string;
};

/**
 * Live-run summary writer: after `E2E_BASE_URL=… pnpm e2e:live` finishes,
 * reports/e2e-live.md holds one row per @live test (plus failure excerpts) so
 * the demo book can reference the latest live run without console output.
 */
class LiveMarkdownReporter implements Reporter {
  private rows: Row[] = [];
  private base = process.env.E2E_BASE_URL ?? "(unknown base URL)";
  private startedAt = new Date();

  onTestEnd(test: TestCase, result: TestResult) {
    this.rows.push({
      // Just the test title ("@live …") — titlePath() also carries the project and file.
      title: test.title,
      status: result.status,
      duration: result.duration,
      error: result.error?.message?.split("\n").slice(0, 6).join("\n"),
    });
  }

  onEnd(result: FullResult) {
    // Tests run with cwd = apps/web; the repo-level reports/ dir is two up (same as sweep screenshots).
    const file = "../../reports/e2e-live.md";
    mkdirSync(dirname(file), { recursive: true });
    const passed = this.rows.filter((r) => r.status === "passed").length;
    const body = [
      `# Live e2e — ${this.base}`,
      "",
      `Run ${this.startedAt.toISOString()} · ${passed}/${this.rows.length} passed · Playwright result: **${result.status}**`,
      "",
      "| Test | Status | Duration |",
      "| --- | --- | --- |",
      ...this.rows.map(
        (r) =>
          `| ${r.title.replaceAll("|", "\\|")} | ${r.status} | ${(r.duration / 1000).toFixed(1)}s |`,
      ),
      "",
      ...this.rows.flatMap((r) =>
        r.error
          ? [`## ${r.title}`, "", "```text", r.error, "```", ""]
          : [],
      ),
    ].join("\n");
    writeFileSync(file, body);
  }
}

export default LiveMarkdownReporter;
