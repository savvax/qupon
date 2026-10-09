
> **For agentic workers:** each `### Task NNNN` below is one queue task. `tasks/backlog/NNNN-*.md` carries the task section verbatim plus frontmatter; the human releases a wave by moving files to `tasks/todo/`. Read the task's **Read first**, implement, run the narrowest tests, then `make verify`. Steps use checkbox (`- [ ]`) syntax. Every GLM/Flash task passes an **Opus review gate** before merge (section "Harness"); answer its feedback if the task file contains `## Review feedback`.


**Architecture:** program changes go into the existing Anchor program as a strict chain (1510 → 1515) that never changes the size of existing accounts (new fields live in `reserved`, new data in new PDAs/events). Off-chain layers (CLI, Go registrar, web) follow; web work starts immediately on mocks. Opus owns design (language v2 + golden screens) and reviews every merged task.

**Tech Stack:** Anchor 1.2 / Token-2022 / LiteSVM · `crates/entitlement` (no_std) · TS `@solana/kit` 8 + Codama · Go 1.26 (chi, SQLite) · Next 15 / Tailwind 4 / next-intl 4 / motion 12 · Playwright · pi + GLM-5.3 workers, Claude Opus reviewer.


## Global Constraints
- Devnet only. Never commit secrets. Toolchain pins unchanged (Agave 4.3.0, Anchor 1.2.0, @solana/kit 8.x, Go 1.26, Node 22, pnpm 9).
- **New series are hooked** (Token-2022 `TransferHook` = this program, `init_hook` after `init_series`); legacy series keep the pause path. Every client that moves bond units adds the hook extras (1516).
- **Account sizes are frozen** (D8): `Series` 389 B, `Investor` 182 B, `CorporateAction` 435 B, `Entitlement` 131 B, `TradeAdmission` 193 B. New fields only by shrinking `reserved` by exactly their byte size; every such task adds a test asserting `8 + INIT_SPACE` is unchanged.
- **Error codes are positional**: append new `QuponError` variants only at the end of the enum (before the closing brace at `error.rs:76`), never reorder.
- **Enums are append-only**: `ActionStatus::Defaulted = 10`; `EntitlementStatus::PaidToAgent = 3`.
- Every program task regenerates the client in the same commit (`cd clients/ts && pnpm codama`; CI has a drift check) and keeps `docs/02-architecture.md` instruction/event tables authoritative.
- Real-clock behaviour must stay byte-identical: every existing program test passes unchanged (no edits to existing asserts in `programs/qupon_bonds/tests/*.rs` except where a task explicitly lists them).
- Tests use the brief's numbers: holders 10 / 25 / 65 units, face 1,000 KZT = 100,000 tiyn, 10 % semi-annual 30E/360 → coupons 50,000 / 125,000 / 325,000 tiyn.
- UI strings exist in **en, ru and kk** (after 1504 merges); `SIMULATED` labels stay on simulated steps (KYC vendor, bank transfer, KASE submission, regulator registration).
- Web uses only design tokens from `apps/web/src/app/globals.css` (no new hard-coded hex outside `@theme`), follows `docs/design/language.md` (after 1530), and every tx has an explorer link.
- Go: new routes go behind their own `mount<Feature>` anchor in `internal/api/api.go`; never touch `corsReadOnly`.

## Review Focus
- An outsider calls a permissionless step (strike/snapshot/finalize/pay/complete/retire/declare_default) at the wrong time or with substituted accounts (other investor's ATA, foreign entitlement, wrong destination) → the instruction fails and no token moves. Pinned in 1510, 1512, 1513, 1514.
- A transfer is attempted after `record_at` before the sender's or receiver's snapshot → `HolderNotSnapshotted`; snapshot-then-transfer in one tx passes and the entitlement equals the balance at `record_at`; a direct `execute` call is rejected. Pinned in 1509/1510.
- An INTR coupon defaults, a holder sells the bond, the issuer cures → the coupon goes to the record-date holder, not the buyer. Pinned in 1512.
- A full redemption where one holder is suspended (frozen ATA) and one holder chose bank payout → pay+burn succeeds for all, supply reaches 0, `close_series` works after the agent confirms. Pinned in 1513/1514.
- A demo-clock series on the mainnet profile, and the real clock after the refactor → registrar refuses the former; every pre-existing program test passes unchanged for the latter. Pinned in 1511 and 1524.

---

## Harness (H1–H2 done 2026-10-09, commit 337dd88; not queue tasks)

Existing loop (`ops/orchestrate.sh`): claim → worktree → `ops/run_task.sh` (pi GLM-5.3) → orchestrator's own `make verify` → rebase + ff-merge. **New:** an Opus gate between verify and merge, with feedback → resume.

```
todo/ ──claim──▶ doing/<worker> ──pi glm-5.3──▶ DONE + clean + make verify ✓
                                                      │
                                       ops/review_task.sh (claude -p --model opus, fresh context,
                                       ≤ REVIEW_SLOTS concurrent, read-only + tests + screenshots)
                                     pass │                       │ fail
                                          ▼                       ▼
                          lock git → rebase → ff-merge     feedback appended to the task file,
                          → done/                          branch saved as logs/<task>.<ts>.wip.patch,
                                                          requeue (round+1); 3rd reject → agent: claude
```

### H1: per-task Opus review gate

**Files:**
- Create: `ops/review_task.sh`, `prompts/task-reviewer.md`
- Modify: `ops/lib.sh` (append helpers), `ops/orchestrate.sh` (gate inside the merge branch), `prompts/worker-preamble.md` (one paragraph), `docs/06-workflow.md` (Reviewer row + lifecycle step 4a)

- [ ] **Step 1: helpers in `ops/lib.sh`** (append at the end)

```bash
# --- N concurrent slots (Opus reviews): acquire_slot <name> <n> -> prints the slot number; release_slot <name> <i> ---
acquire_slot() {
  local i d owner
  while :; do
    for ((i=1; i<=$2; i++)); do
      d="$TASKS/.lock-$1-$i"
      if mkdir "$d" 2>/dev/null; then echo $$ > "$d/pid"; echo "$i"; return 0; fi
      owner=$(cat "$d/pid" 2>/dev/null || true)
      [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null && rm -rf "$d"
    done
    sleep 5
  done
}
release_slot() { rm -rf "$TASKS/.lock-$1-$2"; }

review_gate() { [ "${REVIEW_GATE:-1}" = "1" ] && [[ " ${REVIEW_AGENTS:-glm flash} " == *" $1 "* ]]; }
review_rounds() { cat "$TASKS/.review-$1" 2>/dev/null || echo 0; }
bump_review_rounds() { echo $(( $(review_rounds "$1") + 1 )) > "$TASKS/.review-$1"; }

# append_review <task-file> <feedback.md> <round>: the next attempt reads it as part of the task
append_review() {
  { printf '\n## Review feedback (round %s, %s) — fix every blocking item first; your previous work is already committed on this branch\n\n' "$3" "$(TZ=Asia/Almaty date '+%F %H:%M')"; cat "$2"; } >> "$1"
}

# save_branch_patch <worktree> <log-prefix>: keep the agent's work for the resume path of run_task.sh
save_branch_patch() {
  local base; base=$(git -C "$1" merge-base HEAD main 2>/dev/null) || return 0
  git -C "$1" diff --binary "$base" HEAD -- . ':(exclude)tasks' > "$2.wip.patch" 2>/dev/null || true
  [ -s "$2.wip.patch" ] || rm -f "$2.wip.patch"
}
```

- [ ] **Step 2: `ops/review_task.sh`**

```bash
#!/usr/bin/env bash
# Per-task Opus gate: a fresh-context Claude judges ONE task branch (in its worktree) against the task's acceptance
# criteria, the plan/spec it cites, AGENTS.md and — for web tasks — screenshots, before the orchestrator merges.
# usage: ops/review_task.sh <task-file> <worktree> <log-prefix>
# exit: 0 pass · 1 fail (feedback in <log-prefix>.review.md) · 2 reviewer unavailable (limit, crash, no verdict)
set -uo pipefail
TASK="$1"; WT="$2"; LOGP="$3"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/ops/lib.sh"
NAME=$(basename "$TASK" .md)
BASE=$(git -C "$WT" merge-base HEAD main)
SHOTS="$LOGS/shots/$NAME"; rm -rf "$SHOTS"; mkdir -p "$SHOTS"
SCHEMA='{"type":"object","properties":{"verdict":{"type":"string","enum":["pass","fail"]},"blocking":{"type":"array","items":{"type":"object","properties":{"file":{"type":"string"},"line":{"type":"integer"},"issue":{"type":"string"},"fix":{"type":"string"}},"required":["issue","fix"]}},"criteria":{"type":"array","items":{"type":"object","properties":{"criterion":{"type":"string"},"met":{"type":"boolean"},"evidence":{"type":"string"}},"required":["criterion","met"]}},"design_score":{"type":"integer"},"nits":{"type":"array","items":{"type":"string"}},"summary":{"type":"string"}},"required":["verdict","blocking","criteria","summary"]}'
PROMPT="$(cat "$ROOT/prompts/task-reviewer.md")

Task file: $TASK
Branch diff to judge: git diff $BASE..HEAD (your current directory is the task's worktree).
Screenshot folder: $SHOTS (use: bash $ROOT/ops/shots.sh $SHOTS <route>... ; then Read the PNGs).
Output the JSON verdict only."
TMO=$(command -v timeout || command -v gtimeout || true)
SLOT=$(acquire_slot review "${REVIEW_SLOTS:-2}")
log "[review] $NAME slot=$SLOT model=${TASK_REVIEW_MODEL:-opus}"
( cd "$WT" && export E2E_PORT=$((3300 + SLOT)) && ${TMO:+$TMO 40m} claude -p "$PROMPT" \
    --model "${TASK_REVIEW_MODEL:-opus}" --max-turns "${REVIEW_MAX_TURNS:-70}" \
    --permission-mode dontAsk --permission-prompts none \
    --allowedTools "Read" "Grep" "Glob" "Bash(git diff *)" "Bash(git log *)" "Bash(git show *)" "Bash(rg *)" "Bash(ls *)" \
      "Bash(cargo test *)" "Bash(go test *)" "Bash(make test-*)" "Bash(pnpm --filter * test*)" "Bash(pnpm --filter * typecheck*)" \
      "Bash(bash $ROOT/ops/shots.sh *)" \
    --json-schema "$SCHEMA" --output-format json ) > "$LOGP.review.json" 2> "$LOGP.review.err"
rc=$?
release_slot review "$SLOT"
# tests and screenshots may have written files: leave the worktree exactly at the reviewed commit
git -C "$WT" reset -q --hard HEAD; git -C "$WT" clean -qfd
if [ $rc -ne 0 ] || hit_limit "$LOGP.review.err"; then log "[review] $NAME reviewer unavailable (rc=$rc)"; exit 2; fi
V=$(jq -r '.structured_output.verdict // empty' "$LOGP.review.json" 2>/dev/null)
jq -r '"### Summary\n" + .structured_output.summary + "\n\n### Blocking\n" +
  ([.structured_output.blocking[] | "- " + ((.file // "") + (if .line then ":" + (.line|tostring) else "" end)) + " — " + .issue + "\n  **Fix:** " + .fix] | join("\n")) +
  "\n\n### Acceptance criteria not met\n" + ([.structured_output.criteria[] | select(.met == false) | "- " + .criterion + " — " + (.evidence // "")] | join("\n")) +
  (if .structured_output.design_score then "\n\nDesign score: " + (.structured_output.design_score|tostring) + "/10" else "" end)' \
  "$LOGP.review.json" > "$LOGP.review.md" 2>/dev/null
log "[review] $NAME verdict=${V:-none}"
case "$V" in pass) exit 0;; fail) exit 1;; *) exit 2;; esac
```

- [ ] **Step 3: gate in `ops/orchestrate.sh`** — replace the line `    # ---- critical section: rebase onto the current main and fast-forward, nobody else touches main meanwhile ----` with:

```bash
    # ---- Opus review gate (outside the git lock): reject → feedback into the task, work kept as a resume patch ----
    if review_gate "$AGENT"; then
      bash "$ROOT/ops/review_task.sh" "$TASK" "$WT" "$LOGP"; rv=$?
      if [ $rv -ne 0 ]; then
        save_branch_patch "$WT" "$LOGP"
        if [ $rv -eq 1 ]; then
          r=$(review_rounds "$ID"); bump_review_rounds "$ID"
          append_review "$TASK" "$LOGP.review.md" $((r+1))
          if [ "$r" -ge 2 ] && [ "$AGENT" != "claude" ]; then
            log "[$WORKER] $NAME rejected 3× by review; escalating to claude"; set_agent "$TASK" claude
          fi
          log "[$WORKER] $NAME REJECTED by review (round $((r+1))); requeue"
        else
          log "[$WORKER] $NAME review unavailable; requeue and back off ${backoff}s"
        fi
        requeue "$TASK"
        lock git; git worktree remove --force "$WT" >/dev/null 2>&1 || true; git branch -D "$BR" >/dev/null 2>&1 || true; unlock git
        [ $rv -eq 2 ] && { sleep "$backoff"; backoff=$(( backoff < 3600 ? backoff * 2 : 3600 )); }
        continue
      fi
    fi
    # ---- critical section: rebase onto the current main and fast-forward, nobody else touches main meanwhile ----
```

- [ ] **Step 4: `prompts/task-reviewer.md`**

```markdown
You are the Opus review gate for ONE task branch of Qupon (corporate actions for tokenized bonds on Solana devnet).
A GLM worker implemented the task; the orchestrator's `make verify` already passed. Decide whether it may merge.

Read, in order: the task file (its plan section is embedded; open the plan/spec it cites only where needed), `AGENTS.md`,
`git diff <base>..HEAD --stat`, then every changed file that matters. Judge ONLY against: the task's acceptance criteria,
plan 15 Global Constraints, spec decisions D1–D11, AGENTS.md. Run the narrowest tests the task names
(`cargo test -p qupon_bonds <name>`, `go test ./internal/<pkg>/...`, `pnpm --filter <pkg> test`), not the whole gate.

Blocking = any of: an acceptance criterion unmet; a test weakened, deleted or `#[ignore]`d; a test that does not assert the
behaviour it claims (e.g. asserts only `is_ok()` where amounts matter); program: missing signer/role/status check vs D2,
unchecked arithmetic, account size change (D8), error enum reordered, event missing on a state transition, a token move to
an account not derived from the investor/route/series; money/rounding drift from `fixtures/entitlement.json`;
Go/TS/Rust parity broken; secrets; SIMULATED labels missing; generated client hand-edited or stale.

Web tasks (any change under apps/web): run `bash <shots.sh> <folder> <routes the task touches>` (it shoots each route in
en/ru/kk at 1440 and 390 px in mock mode) and Read the PNGs. Check against `docs/design/language.md` and the golden screens:
hierarchy, spacing rhythm, token use (no stray hex), states (loading/empty/error), i18n completeness (no raw keys, no
English left in ru/kk), no horizontal scroll or clipped text at 390 px, accessible names, explorer link for every tx.
Set design_score 1–10; below 8 is blocking — say exactly what to change (element, property, target value).

Do not block on style preferences or nits — put them in `nits`. Every blocking item needs a concrete fix a worker can apply.
Be economical: read what matters, run at most 3 test commands and one screenshot pass.
```

- [ ] **Step 5: worker preamble** — append to `prompts/worker-preamble.md` (replace atomically: write `prompts/worker-preamble.md.new`, then `mv`):

```
If the task file ends with `## Review feedback (round N …)`, your previous attempt is already applied and committed on this branch: read the feedback, fix every blocking item (and only then anything else), re-run the tests the feedback names, `make verify`, commit, DONE.
```

- [ ] **Step 6: dry run on a throwaway task** — create `tasks/todo/9999-review-gate-smoke.md` (`agent: flash`, goal: add one sentence to `docs/06-workflow.md` describing the review gate; acceptance: the sentence exists and mentions `ops/review_task.sh`). Expected in `logs/orchestrator.log`: `[review] 9999-review-gate-smoke verdict=pass` then `MERGED`. Then `git commit` H1 as `chore(ops): per-task Opus review gate`.

- [ ] **Step 7: restart the loops (human)** — `touch tasks/.stop`, wait for idle, then `REVIEW_GATE=1 REVIEW_SLOTS=2 AUTO_PASSES=0 CLAUDE_WORKERS=0 GLM_WORKERS=6 FLASH_WORKERS=2 bash ops/tmux.sh` (orchestrate.sh is read once per loop start; run_task.sh/preamble are re-read per task).

### H2: screenshot helper for visual review

**Files:**
- Create: `apps/web/e2e/shots.spec.ts`, `ops/shots.sh`
- Modify: `apps/web/playwright.config.ts` (port from `E2E_PORT`, default 3210)

- [ ] **Step 1: `ops/shots.sh`**

```bash
#!/usr/bin/env bash
# Screenshots of the given routes in mock mode: en/ru/kk × 1440/390, full page PNG → <out>/<slug>-<locale>-<width>.png
# usage: bash ops/shots.sh <out-dir> /route [/route …]     (run from a worktree root or the repo root)
set -uo pipefail
OUT="$(cd "$1" && pwd)"; shift
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/apps/web" && SHOT_OUT="$OUT" SHOT_ROUTES="$*" SHOT_LOCALES="${SHOT_LOCALES:-en ru kk}" \
  pnpm exec playwright test e2e/shots.spec.ts --reporter=line 2>&1 | tail -n 20
ls "$OUT" | head -n 60
```

- [ ] **Step 2: `apps/web/e2e/shots.spec.ts`**

```ts
import { test } from "@playwright/test";
import path from "node:path";

const routes = (process.env.SHOT_ROUTES ?? "").split(/\s+/).filter(Boolean);
const locales = (process.env.SHOT_LOCALES ?? "en ru").split(/\s+/).filter(Boolean);
const out = process.env.SHOT_OUT ?? "test-results/shots";
const role = (r: string) =>
  r.startsWith("/registrar") ? "registrar" : r.startsWith("/issuer") ? "issuer" : r.startsWith("/admin") ? "admin" :
  r.startsWith("/investor") || r.startsWith("/account") ? "investor" : null;
const slug = (r: string) => r.replace(/^\//, "").replace(/[^\w-]+/g, "_") || "home";

test.skip(!process.env.SHOT_ROUTES, "set SHOT_ROUTES");
for (const r of routes)
  for (const locale of locales)
    for (const width of [1440, 390])
      test(`${r} ${locale} ${width}`, async ({ page, context, baseURL }) => {
        const cookies = [{ name: "NEXT_LOCALE", value: locale, url: baseURL! }];
        const ro = role(r);
        if (ro) cookies.push({ name: "qupon_session", value: `mock:${ro}`, url: baseURL! });
        await context.addCookies(cookies);
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(r, { waitUntil: "networkidle" });
        await page.screenshot({ path: path.join(out, `${slug(r)}-${locale}-${width}.png`), fullPage: true });
      });
```

- [ ] **Step 3: port** — in `playwright.config.ts` replace the literal `3210` with `const PORT = Number(process.env.E2E_PORT ?? 3210)` and use it in `webServer.command`/`url`/`use.baseURL`.
- [ ] **Step 4: check** — `bash ops/shots.sh /tmp/shots / /bonds` → 8 PNGs (2 locales until kk exists). Commit `chore(ops): screenshot helper for review`.

### Waves and timing (Asia/Almaty)

| Wave | Release | Tasks | Ends |
|---|---|---|---|
| A — foundations | Oct 9 (H1/H2 done, 1509 spike GO) | 1501, 1503, 1504, 1530 (Opus), 1510 (Opus) | Oct 10 morning |
| B — program chain | each after its predecessor merges | 1511 → 1512 → 1513 → 1514 → 1515 → 1519 (Opus deploy) | Oct 10 18:00 |
| C — services | after 1515 (1502, 1505, 1516, 1531 earlier) | 1502, 1505, 1516, 1520, 1521, 1522, 1523, 1524, 1525, 1526, 1541 | Oct 11 12:00 |
| D — product UI | after 1530 golden screens | 1531, 1532, 1533, 1534, 1535, 1536 | Oct 11 22:00 |
| E — finish | — | 1537 (Opus pre-flight), 1540 (Opus redeploy + live e2e) | Oct 12 12:00 (code freeze) |
| T2 stretch | only if A–D are merged by Oct 11 18:00 | 1550, 1551 | — |

Agent tags: `glm` unless stated. Opus (`agent: claude`): 1510, 1530, 1537, 1519, 1540. Lead budget: ≤ 2 concurrent Opus reviews.

---

## Wave A

### Task 1501: crate — civil clock and signed accrued interest

**Agent:** glm · **Depends on:** — · **Role:** anchor (entitlement crate)

**Files:**
- Modify: `crates/entitlement/src/lib.rs` (append; nothing existing changes)
- Modify: `fixtures/entitlement.json` (add `clock_cases`, `accrued_cases`)
- Test: `crates/entitlement/tests/fixtures.rs` (two new test fns)

**Interfaces — Produces:**
- `pub struct CivilClock { pub day_secs: i64, pub anchor_ts: i64, pub anchor_days: i64 }`
- `CivilClock::real(utc_offset_secs: i64) -> CivilClock` · `CivilClock::demo(day_secs: u32, issue_ts: i64, issue: Ymd) -> Result<CivilClock>`
- `fn is_midnight(&self, ts: i64) -> bool` · `fn civil(&self, ts: i64) -> Result<Ymd>` · `fn floor_civil(&self, ts: i64) -> Result<Ymd>` · `fn ts(&self, d: Ymd) -> Result<i64>` · `fn add_months(&self, ts: i64, months: u32) -> Result<i64>` · `fn is_demo(&self) -> bool`
- `Ymd::from_days(days: i64) -> Result<Ymd>`
- `pub fn accrued_signed(units: u64, face: u64, rate_bps: u32, dc: DayCount, start: Ymd, settle: Ymd) -> Result<(i64 /*amount*/, i32 /*days*/)>`

- [ ] **Step 1: failing tests** in `crates/entitlement/tests/fixtures.rs`:

```rust
#[test]
fn clock_cases_match() {
    let f = load(); // existing helper that parses fixtures/entitlement.json
    for c in f["clock_cases"].as_array().unwrap() {
        let clock = if c["day_secs"].as_u64().unwrap() == 0 {
            CivilClock::real(5 * 3600)
        } else {
            CivilClock::demo(c["day_secs"].as_u64().unwrap() as u32, c["issue_ts"].as_i64().unwrap(),
                             Ymd::from_packed(c["issue_ymd"].as_u64().unwrap() as u32).unwrap()).unwrap()
        };
        let d = Ymd::from_packed(c["ymd"].as_u64().unwrap() as u32).unwrap();
        assert_eq!(clock.ts(d).unwrap(), c["ts"].as_i64().unwrap(), "{}", c["id"]);
        assert_eq!(clock.civil(c["ts"].as_i64().unwrap()).unwrap(), d, "{}", c["id"]);
        let m = c["plus_months"].as_u64().unwrap() as u32;
        assert_eq!(clock.add_months(c["ts"].as_i64().unwrap(), m).unwrap(), c["plus_months_ts"].as_i64().unwrap(), "{}", c["id"]);
    }
}

#[test]
fn accrued_cases_match() {
    let f = load();
    for c in f["accrued_cases"].as_array().unwrap() {
        let dc = day_count(&c["day_count"]); // existing helper mapping "THIRTY_360" etc.
        let (amount, days) = accrued_signed(
            c["units"].as_u64().unwrap(), c["face"].as_u64().unwrap(), c["rate_bps"].as_u64().unwrap() as u32, dc,
            ymd(&c["start"]), ymd(&c["settle"])).unwrap();
        assert_eq!((amount, days), (c["accrued"].as_i64().unwrap(), c["days"].as_i64().unwrap() as i32), "{}", c["id"]);
    }
}
```

- [ ] **Step 2: vectors** — add to `fixtures/entitlement.json` (values below were computed independently: real = `days_from_epoch(ymd) × 86400 − 18000`, demo = `issue_ts + (days(ymd) − days(issue_ymd)) × day_secs`):

```json
"clock_cases": [
  {"id":"real_coupon_date","day_secs":0,"ymd":20270103,"ts":1798916400,"plus_months":6,"plus_months_ts":1814554800},
  {"id":"real_eom_clamp","day_secs":0,"ymd":20260831,"ts":1788116400,"plus_months":6,"plus_months_ts":1803754800},
  {"id":"demo_1s_issue","day_secs":1,"issue_ts":1791000000,"issue_ymd":20261009,"ymd":20261009,"ts":1791000000,"plus_months":6,"plus_months_ts":1791000182},
  {"id":"demo_1s_maturity","day_secs":1,"issue_ts":1791000000,"issue_ymd":20261009,"ymd":20271009,"ts":1791000365,"plus_months":0,"plus_months_ts":1791000365},
  {"id":"demo_2s_eom","day_secs":2,"issue_ts":1791000000,"issue_ymd":20260831,"ymd":20260831,"ts":1791000000,"plus_months":6,"plus_months_ts":1791000362}
],
"accrued_cases": [
  {"id":"trade_5_bonds_30_days","units":5,"face":100000,"rate_bps":1000,"day_count":"THIRTY_360","start":"2026-10-03","settle":"2026-11-03","days":30,"accrued":4167},
  {"id":"ex_coupon_negative_1_day","units":10,"face":100000,"rate_bps":1000,"day_count":"THIRTY_360","start":"2027-01-03","settle":"2027-01-02","days":-1,"accrued":-278},
  {"id":"settle_on_period_start","units":65,"face":100000,"rate_bps":1000,"day_count":"THIRTY_360","start":"2027-01-03","settle":"2027-01-03","days":0,"accrued":0},
  {"id":"act365_btrk_47_days","units":1000,"face":1000000,"rate_bps":1595,"day_count":"ACT_365","start":"2026-08-23","settle":"2026-10-09","days":47,"accrued":20538356}
]
```

(`ex_coupon_negative_1_day`: 10 × 100,000 × 1,000 × 1 / 3,600,000 = 277.78 → −278 by half-up on the magnitude. `act365_btrk_47_days`: 1000 × 1,000,000 × 1,595 × 47 / 3,650,000 = 20,538,356.16 → 20,538,356. If a hand check disagrees with your implementation, the implementation is wrong — vectors are the contract; ask in `reports/questions/1501-*.md` only if a vector itself is arithmetically wrong.)

- [ ] **Step 3: run** `cargo test -p entitlement` → the two new tests fail to compile.
- [ ] **Step 4: implement** (append to `crates/entitlement/src/lib.rs`):

```rust
impl Ymd {
    /// Civil date from days since 1970-01-01.
    pub fn from_days(days: i64) -> Result<Ymd, Error> {
        Ymd::from_unix_utc(days.checked_mul(86_400).ok_or(Error::Overflow)?)
    }
}

/// Maps civil dates to timestamps. Real: Almaty midnights (day = 86 400 s, offset from UTC). Demo: day = `day_secs`
/// seconds counted from the issue timestamp, so a whole bond life fits in minutes with the same civil-day math.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CivilClock { pub day_secs: i64, pub anchor_ts: i64, pub anchor_days: i64 }

impl CivilClock {
    pub fn real(utc_offset_secs: i64) -> CivilClock { CivilClock { day_secs: 86_400, anchor_ts: -utc_offset_secs, anchor_days: 0 } }
    pub fn demo(day_secs: u32, issue_ts: i64, issue: Ymd) -> Result<CivilClock, Error> {
        if day_secs == 0 || day_secs >= 86_400 { return Err(Error::InvalidPeriod); }
        Ok(CivilClock { day_secs: i64::from(day_secs), anchor_ts: issue_ts, anchor_days: issue.days_from_epoch() })
    }
    pub fn is_demo(&self) -> bool { self.day_secs != 86_400 }
    pub fn is_midnight(&self, ts: i64) -> bool { ts.checked_sub(self.anchor_ts).is_some_and(|d| d.rem_euclid(self.day_secs) == 0) }
    /// Civil date of a midnight timestamp (error if `ts` is not a midnight of this clock).
    pub fn civil(&self, ts: i64) -> Result<Ymd, Error> {
        if !self.is_midnight(ts) { return Err(Error::InvalidDate); }
        self.floor_civil(ts)
    }
    /// Civil date containing `ts` (any time of day).
    pub fn floor_civil(&self, ts: i64) -> Result<Ymd, Error> {
        let d = ts.checked_sub(self.anchor_ts).ok_or(Error::Overflow)?.div_euclid(self.day_secs);
        Ymd::from_days(self.anchor_days.checked_add(d).ok_or(Error::Overflow)?)
    }
    pub fn ts(&self, d: Ymd) -> Result<i64, Error> {
        d.days_from_epoch().checked_sub(self.anchor_days)
            .and_then(|n| n.checked_mul(self.day_secs))
            .and_then(|x| x.checked_add(self.anchor_ts))
            .ok_or(Error::Overflow)
    }
    pub fn add_months(&self, ts: i64, months: u32) -> Result<i64, Error> { self.ts(self.civil(ts)?.add_months(months)?) }
}

/// Accrued interest for `units` from `start` to `settle` (negative when `settle` precedes `start`: ex-coupon window).
/// Half-up on the magnitude, once per position — the same convention as coupons (03-domain §2).
pub fn accrued_signed(units: u64, face: u64, rate_bps: u32, dc: DayCount, start: Ymd, settle: Ymd) -> Result<(i64, i32), Error> {
    let (a, b, sign) = if settle >= start { (start, settle, 1i64) } else { (settle, start, -1i64) };
    let days = if a == b { 0 } else { accrual_days(dc, a, b)? };
    let num = u128::from(units).checked_mul(u128::from(face)).and_then(|x| x.checked_mul(u128::from(rate_bps)))
        .and_then(|x| x.checked_mul(u128::from(days))).ok_or(Error::Overflow)?;
    let amount = round_half_up(num, BPS * u128::from(dc.basis()?));
    let amount = i64::try_from(amount).map_err(|_| Error::Overflow)?;
    Ok((sign * amount, (sign as i32) * i32::try_from(days).map_err(|_| Error::Overflow)?))
}
```

(`Ymd` must derive `PartialOrd, Ord` for `settle >= start`; add the derive if missing — field order y, m, d makes it chronological.)
- [ ] **Step 5: run** `cargo test -p entitlement` → all pass; `cargo clippy -p entitlement -- -D warnings`.
- [ ] **Step 6: commit** `feat(entitlement): civil clock (real/demo) and signed accrued interest` with `task: 1501`; worklog.

**Acceptance:** both new tests pass on every vector; no existing crate test changed; `make verify` green.

### Task 1503: CI secret scan (gitleaks)

**Agent:** flash · **Depends on:** —

**Files:** Modify `.github/workflows/ci.yml` (new job `secrets`), Create `.gitleaks.toml`, Modify `Makefile` (target `secrets-scan`, not part of `verify`).

- [ ] **Step 1:** job:

```yaml
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: gitleaks (full history)
        run: |
          curl -sSfL -o gl.tgz https://github.com/gitleaks/gitleaks/releases/download/v8.24.2/gitleaks_8.24.2_linux_x64.tar.gz
          echo "<sha256 from the release checksums.txt>  gl.tgz" | sha256sum -c -
          tar xzf gl.tgz gitleaks && ./gitleaks git --redact --config .gitleaks.toml -v .
```

Fill the checksum from `https://github.com/gitleaks/gitleaks/releases/download/v8.24.2/gitleaks_8.24.2_checksums.txt` (download and copy the line for `linux_x64`; never leave the placeholder).
- [ ] **Step 2:** `.gitleaks.toml` extends the default rules and allowlists public devnet addresses (`config/devnet.json`, `fixtures/accounts/*.b64`, `reports/*.md` explorer links) by path.
- [ ] **Step 3:** `make secrets-scan` runs the same locally if `gitleaks` is on PATH (else prints how to install). Run it; if it reports a real secret, STOP: print `BLOCKED:1503 secret found in history <file>` (do not try to rewrite history).

**Acceptance:** CI job present with pinned checksum; local run clean or BLOCKED with the finding; `make verify` green.

### Task 1504: Kazakh locale — infrastructure + base messages

**Agent:** glm · **Depends on:** — · **Role:** frontend

**Files:**
- Modify: `apps/web/src/i18n/request.ts` (LOCALES `["en","ru","kk"]`, cookie accepts kk), `apps/web/src/app/api/locale/route.ts`, `apps/web/src/components/shell/LocaleSwitch.tsx` (3-way: EN · RU · KZ, accessible radio group), `apps/web/src/components/account/ProfileForms.tsx`, `apps/web/src/lib/session.ts` (`locale: "en" | "ru" | "kk"`), `apps/web/src/app/global-error.tsx`, `apps/web/src/i18n/altLabels.ts` + `apps/web/src/components/i18n/StableLabel.tsx` (reserve the max width of **all** other locales), `apps/web/src/lib/format.ts` + `apps/web/src/lib/ui/amount.ts` (kk → `kk-KZ`, same separators as ru), every `=== "ru" ? "ru" : "en"` / `as "en"|"ru"` site (≈30 files: `rg -n '"ru" \? "ru" : "en"|as "en" \| "ru"|"en" \| "ru"' apps/web/src`) → a shared `type Locale = "en" | "ru" | "kk"` and `toLocale()` helper in `apps/web/src/i18n/locale.ts`.
- Create: `apps/web/messages/kk.json` (full translation of `messages/en.json`).
- Modify: `AGENTS.md` rule 7 → "(RU/KK notice templates and `apps/web/messages/{ru,kk}` are the exceptions)".
- Modify: `apps/web/src/i18n/messages.test.ts` (iterate over all LOCALES; namespace files may be missing for kk until 1505 → test falls back to en for namespaces listed in `KK_PENDING` and fails when the list is non-empty after 1505).
- Modify: `services/registrar` API enums `lang`/`locale` accept `kk` (falls back to `en` for notices until 1523); `apps/web/src/lib/api-schema.d.ts` regenerated from `services/registrar/openapi.yaml`.

- [ ] **Step 1:** failing test — `messages.test.ts` expects `kk.json` keys == `en.json` keys and no empty values.
- [ ] **Step 2:** implement infra + `kk.json`. Translation rules: Kazakh Cyrillic; financial terms per KASE usage — облигация = «облигация», купон = «купон», өтеу (redemption), тіркеу күні (record date), ұстаушы (holder), эмитент, тіркеуші (registrar), төлем агенті (paying agent), құқық (entitlement → «төлемге құқық»), ерте өтеу (early redemption), ішінара өтеу (partial redemption), облигация ұстаушылар жиналысы (bondholder meeting), жинақталған купондық сыйақы / ЖКС (accrued interest), дефолт, «SIMULATED» stays in English as a badge. Keep placeholders `{…}` and ICU plurals intact (kk has `other` only).
- [ ] **Step 3:** `pnpm --filter @qupon/web test` and `pnpm --filter @qupon/web typecheck` pass; `e2e/locale-stability.spec.ts` extended to kk (control boxes identical across en/ru/kk).
- [ ] **Step 4:** commit `feat(web): Kazakh locale (kk) infrastructure and base messages`.

**Acceptance:** switching to KZ persists via cookie and profile; every base page renders in kk with no raw keys (sweep in kk shows no console errors for base namespaces); amounts/dates formatted `kk-KZ`; `make verify` green.

### Task 1509: spike — transfer-hook gate (DONE, GO)

**Agent:** claude (Opus, lead) · merged. Evidence: `programs/qupon_bonds/tests/hook.rs` (6 tests), `reports/worklog/1509.md`. The program is the bond mint's transfer hook (`execute`, SPL discriminator); `init_hook` writes the validation account (extra metas: series PDA, checkpoint of the source owner, checkpoint of the destination owner — owners read from bytes 32..64 of the token accounts); `announce_action` arms `Series.{record_kind, record_seq, record_at}` (carved from `reserved`, now 46 B); `Checkpoint ["ckpt", series, owner] {bump, series, owner, last_seq}`; `mark_snapshotted` is a stand-in removed by 1510. CU: hooked transfer 30k; 2 marks + transfer 41k; 2 marks + SettleDvp 73k.

### Task 1510: program — hook-gated record date in the product flow, trustless crank, set hash

**Agent:** claude (Opus) · **Depends on:** 1509 · **Role:** anchor

**Files:**
- Modify: `programs/qupon_bonds/src/instructions/hook.rs` (remove `mark_snapshotted`; keep `init_hook`, `init_checkpoint`, `execute`; export `fn create_checkpoint(payer, series, owner, last_seq)` used below)
- Modify: `register_investor.rs` (hooked series: create the owner's checkpoint; `last_seq = series.record_seq` if a record is pending and `now ≥ record_at`, else 0 — a new investor held nothing at `record_at` because their ATA was frozen until now), `trade.rs` (`admit_trade` on a hooked series creates the escrow owner's (`swap_dvp`) checkpoint with the same rule), `subscribe.rs` (`subscribe`/`issue_units`: hooked series with `record_at != 0 && now ≥ record_at` → `RecordPending`), `announce_action.rs` (`hash_scheme = 1`; `cancel_action` clears `series.record_at` when hooked)
- Modify: `snapshot.rs`:
  - legacy series: unchanged flow (strike → pause → snapshot → finalize), but **no role check** on strike/snapshot/finalize (anyone);
  - hooked series: `strike_record` is not used (`WrongStatus`); `snapshot_batch(escrow_counts: Vec<u8>)` runs from `now ≥ series.record_at` while the action is Announced or RecordStruck (first batch: status → RecordStruck, `snapshot_slot = slot`, emit `RecordStruck`); per holder the group is `[Investor, bond ATA, Entitlement PDA, Checkpoint]` followed by `escrow_counts[i] × [TradeAdmission, escrow ATA, escrow Checkpoint]` (each admission's `seller == investor.owner` and `escrow` matches); units = own ATA + those escrows; zero units → only advance checkpoints (no Entitlement); every checkpoint touched gets `last_seq = record_seq`; already-advanced checkpoint + existing Entitlement → skip (idempotent);
  - set hash for `hash_scheme == 1` (both paths): `snapshot_hash ^= sha256("qupon:snap:v1" ‖ action ‖ owner ‖ units_le)`;
  - `finalize_snapshot`: Σ units == supply (both paths); hooked: INTR/PCAL/BMET → `series.record_at = 0` (gate off, ex-date trading); REDM/MCAL keep it (register locked); legacy: INTR/PCAL resume right after finalize like BMET; REDM/MCAL stay paused.
- Modify: `settle.rs` (`pay_batch`, `complete_action` no role check; `complete_action` resumes only if the mint is paused), `retire.rs` (`retire_batch` no role check)
- Modify: `error.rs` (append `RecordPending`), `state.rs` (CorporateAction `hash_scheme: u8`, `reserved: [u8; 63]`)
- Modify: `clients/ts/src/commands/action.ts` (`action:snapshot` builds the hooked groups incl. open admissions of each seller, `escrow_counts`; legacy unchanged), `clients/ts/src/lib/batch.ts` if needed; `pnpm codama`
- Modify: Go `internal/chain` (CorporateAction `HashScheme`; Series hook fields; `DecodeCheckpoint`), `internal/reconcile` (scheme 1 set hash; hooked actions count escrowed units to the seller)
- Tests: `tests/hook.rs` (rewrite the spike tests on the product flow), `tests/snapshot.rs`, `tests/trade.rs`, `tests/registry.rs` (new cases only); Go reconcile test
- Docs: `docs/02-architecture.md` rows 7–9, 22–25 and the record-date section; `docs/03-domain.md` §4 (D1' text from the spec)

**Tests (all on a hooked series unless stated):**
- `intr_full_cycle_hooked_outsider_crank`: announce → `record_at` → outsider snapshot (3 groups) → finalize (Σ == 100) → a plain hooked transfer with no snapshot passes (gate off) → issuer funds → outsider pays → complete; cash 50,000 / 125,000 / 325,000.
- `transfer_after_record_needs_snapshot_and_entitlement_is_balance_at_record_at`: 10-unit holder sends 4 in a `[snapshot(both), transfer]` tx → entitlement units 10 (not 6), receiver's entitlement unchanged by the 4.
- `open_trade_across_record_date_is_attributed_to_seller`: 5 units escrowed at `record_at` → seller's entitlement = own + 5; settlement after `record_at` needs the seller group snapshotted (escrow checkpoint advanced) and the buyer's; Σ == supply.
- `mint_blocked_while_record_pending`: `issue_units` after `record_at` → `RecordPending`; after finalize → ok.
- `investor_registered_after_record_can_receive`: new investor's checkpoint starts at `record_seq`; a snapshotted holder can send to them.
- `redemption_record_locks_register`: REDM announced; after `record_at` every transfer → `RecordLocked`, even after snapshot.
- `legacy_series_unchanged_but_permissionless`: non-hooked series, outsider runs strike→snapshot→finalize→pay→complete; INTR resumes after finalize; REDM stays paused.
- `set_hash_independent_of_batch_order` (hooked and legacy), `account_sizes_unchanged`.

**Acceptance:** all tests above pass; all pre-existing tests pass unedited except helper signature updates for `snapshot_batch` (listed in the worklog); CLI `action:snapshot` works for both paths (unit test of the builder); Go reconcile scheme-1 test; `make verify` green.

### Task 1516: clients for hooked series (mint, init_hook, transfer extras)

**Agent:** glm · **Depends on:** 1510 · **Role:** ts-client

**Files:** `clients/ts/src/lib/bondMint.ts` / `bondMintFlow.ts` (new series: add `TransferHook` extension with program id = Qupon and authority = series PDA; after `init_series` send `init_hook`), `clients/ts/src/lib/hook.ts` (new: `hookExtras(series, srcOwner, dstOwner): AccountMeta[]` = [series, checkpoint(src), checkpoint(dst), program id, extra-metas PDA] read-only; `withHookExtras(ix, …)`), `clients/ts/src/commands/trade.ts` (fund: seller → escrow transfer with extras; settle/cancel/reclaim: append the bond leg's extras and set `leg_a_extras_count`; before settle after a record date prepend `snapshot_batch` for the seller group and the buyer), any demo transfer in `scripts/demo-full.ts`, `apps/web/src/app/(cabinet)/investor/_components/OpenTrades.tsx` + `src/lib/portal.ts` (wallet-signed funding transfer with extras), tests `hook.test.ts` (extras derivation vs fixtures: the PDAs for a known mint/owners), `trade.test.ts` updates.
- [ ] Legacy (non-hooked) series: no extras (detect `series.hook == 0`).
- [ ] Commit `feat(cli,web): hooked bond mints and transfer-hook extras on every bond transfer`.

**Acceptance:** unit tests derive the same PDAs as the program tests; `qupon series:create` on LiteSVM-free arg tests shows the TransferHook extension and the `init_hook` call; `make verify` green.

### Task 1530: design language v2 + golden screens (Opus)

**Agent:** claude (Opus) · **Depends on:** — (mock mode) · use skills `taste` / `frontend-design`


- Scroll-reveal must never hide content: animate transform only, never start at opacity 0. Full-page screenshot, print and slow devices all show the whole page.
- Hero card shows the last **completed** payout: amount, number of holders, tx link. It never shows "0.00 ₸ · Not paid yet".
- Header has a single primary CTA "Try it in 3 minutes", plus a "View as: Public · Issuer · Registrar · Investor" switch that goes to the demo roles in one click. Connect-wallet is secondary.
- Trust layer appears everywhere: a network chip "Devnet · slot N · updated 3 s ago", Implemented/Simulated/Demo-clock provenance chips next to features, and "Export issue audit (CSV)" on the bond dossier.

**Deliverables:**
- `docs/design/language.md` — principles (institutional, calm, data-dense, provable), type scale, spacing rhythm, color roles (brand green kept, a data-viz palette, status semantics incl. **Defaulted**/**Cured**/**Demo clock**/**Simulated**/**Verified on-chain**), density modes (operator vs public), motion rules, iconography, empty/loading/error patterns, copy tone, provenance chips ("On-chain ✓" / "Simulated" / "Demo clock").
- Tokens v2 in `globals.css` (`@theme`), no breaking renames without codemods.
- New primitives in `apps/web/src/components/ui/`: `LifecycleRail` (a bond's life: issue → coupons → calls/meeting → maturity, each node = action with status, tx count, link), `ActionFlow` (record → snapshot → fund → pay → complete with live state, permissionless badges, planned vs effective record time), `MoneyFlow` (escrow → holders/tax vault/bank agent, amounts), `ProvenanceChip`, `NowBar` (next step, who can do it, one primary button), `GlossaryTerm` (dotted underline + popover), `TourStep`, `CountdownClock` (demo-clock aware).
- **Golden screens** (fully built, en/ru, kk strings via keys): landing hero + "Try it in 3 minutes" CTA; bond dossier `/bonds/[mint]`; action console `/registrar/actions/[pda]`; sandbox shell `/sandbox/[id]` (mock data).
- Gallery `/ui` updated with every primitive in every state.


---

## Wave B — program chain (strict order)

### Task 1511: program — demo clock per series

**Agent:** glm · **Depends on:** 1501, 1510 · **Role:** anchor

**Files:**
- Modify: `state.rs` Series: before `reserved` add `pub day_secs: u32, pub issue_ymd: u32,`; `reserved: [u8; 38]` (46 after 1509, minus 8)
- Create: `programs/qupon_bonds/src/clock.rs` (wrapper over `entitlement::CivilClock`)
- Modify: `init_series.rs` (params `day_secs: u32`, `issue_ymd: u32`; validation via clock), `announce_action.rs` (`civil_matches` → clock), `settle.rs` (`next_coupon_after` → clock), `meeting.rs` (`is_almaty_midnight` → clock)
- Modify TS: `clients/ts/src/lib/clock.ts` (mirror of CivilClock, tested against `fixtures/entitlement.json` `clock_cases`), `src/commands/common.ts` (`almatyMidnight` callers → clock), `series.ts`/`seriesCreate.ts` (`--demo-day-secs <n>`: issue_date = now rounded down to the second, maturity/next dates through the clock), `action.ts`/`lifecycle.ts` (record_at = period_end − 1 series-day; payment_at = period_end; meeting dates through the clock)
- Modify Go: `chain/types.go`/`decode.go` (Series `DaySecs`, `IssueYmd`), `scheduler/scheduler.go` (lead/payment delay in series-days for demo series; tick 2 s when any demo series is open)
- Test: `programs/qupon_bonds/tests/init_series.rs`, new `tests/demo_clock.rs`; `clients/ts/src/lib/clock.test.ts`; Go decode test

**Interfaces — Produces:** `pub struct SeriesClock(CivilClock)` with `SeriesClock::of(&Series) -> Result<Self>`, `::from_params(day_secs, issue_date, issue_ymd) -> Result<Self>`, `.civil(ts)`, `.ts(ymd)`, `.add_months(ts, m)`, `.is_midnight(ts)`, `.grace() -> i64` (one series day), `.is_demo()`. TS `seriesClock(series)` with the same methods. CLI flag `--demo-day-secs`.

- [ ] **Step 1: failing test** `tests/demo_clock.rs`:

```rust
#[test]
fn whole_bond_life_on_a_1s_demo_clock() {
    let mut env = Env::new();
    let issue = env.now();
    // 1-year, semi-annual, 1 civil day = 1 s: coupon 1 at issue+182 s, maturity at issue+365 s
    let b = setup_bond_with(&mut env, BondParams { day_secs: 1, issue_date: issue, issue_ymd: 2026_10_09,
        maturity_date: issue + 365, ..BondParams::brief() });
    let h = holders(&mut env, &b, &[10, 25, 65]);
    let s = fetch_series(&env, &b);
    assert_eq!(s.next_coupon_date, issue + 182);
    let a = announce_intr_demo(&mut env, &b); // period 2026-10-09 → 2027-04-09 = 180 days (30E/360)
    env.set_clock(a.record_at);
    crank_coupon(&mut env, &b, &a, &h);
    assert_eq!(cash_balances(&env, &h), vec![50_000, 125_000, 325_000]);
    let r = announce_redm_demo(&mut env, &b);
    env.set_clock(r.record_at);
    crank_redemption(&mut env, &b, &r, &h);
    assert_eq!(mint_supply(&env, &b), 0);
}

#[test]
fn demo_clock_rejects_non_midnight_maturity() {
    let mut env = Env::new();
    let issue = env.now();
    let err = try_setup_bond(&mut env, BondParams { day_secs: 2, issue_date: issue, issue_ymd: 2026_10_09,
        maturity_date: issue + 731, ..BondParams::brief() }).unwrap_err();
    assert_err(err, "InvalidDates");
}

#[test]
fn real_clock_series_unchanged() {
    // existing brief: day_secs = 0 → identical next_coupon_date to before the refactor
    let mut env = Env::new();
    let b = setup_bond(&mut env);
    assert_eq!(fetch_series(&env, &b).day_secs, 0);
    assert_eq!(fetch_series(&env, &b).next_coupon_date, ALMATY_2027_01_03); // constant already used by brief tests
}
```

- [ ] **Step 2: implement** `clock.rs`:

```rust
//! Civil dates ↔ timestamps for a series: real = Almaty midnights; demo = `day_secs` per civil day (spec D7).
use anchor_lang::prelude::*;
use entitlement::{CivilClock, Ymd};
use crate::{constants::ALMATY_UTC_OFFSET_SECS, error::{math_err, QuponError}, state::Series};

pub struct SeriesClock(pub CivilClock);

impl SeriesClock {
    pub fn from_params(day_secs: u32, issue_date: i64, issue_ymd: u32) -> Result<Self> {
        if day_secs == 0 { return Ok(Self(CivilClock::real(ALMATY_UTC_OFFSET_SECS))); }
        let issue = Ymd::from_packed(issue_ymd).map_err(math_err)?;
        Ok(Self(CivilClock::demo(day_secs, issue_date, issue).map_err(|_| error!(QuponError::InvalidParams))?))
    }
    pub fn of(s: &Series) -> Result<Self> { Self::from_params(s.day_secs, s.issue_date, s.issue_ymd) }
    pub fn civil(&self, ts: i64) -> Result<Ymd> { self.0.civil(ts).map_err(|_| error!(QuponError::InvalidDates)) }
    pub fn ts(&self, d: Ymd) -> Result<i64> { self.0.ts(d).map_err(math_err) }
    pub fn add_months(&self, ts: i64, m: u32) -> Result<i64> { self.0.add_months(ts, m).map_err(math_err) }
    pub fn is_midnight(&self, ts: i64) -> bool { self.0.is_midnight(ts) }
    pub fn grace(&self) -> i64 { self.0.day_secs }
}
```

  `init_series`: build `SeriesClock::from_params(p.day_secs, p.issue_date, p.issue_ymd)`; real mode: require `is_midnight(issue_date)` and store `issue_ymd = civil(issue_date)` (ignore the arg unless non-zero, then require equality); demo: store args; both: require `is_midnight(maturity_date)`, `next_coupon_date = clock.add_months(issue_date, 12 / frequency)`. `civil_matches(ymd, ts)` → `require!(clock.civil(ts)? == Ymd::from_packed(ymd)?, InvalidDates)`. `next_coupon_after` uses `clock.civil` and `clock.add_months`. `meeting.rs` new maturity uses `clock.is_midnight`. Delete `is_almaty_midnight`/`add_months_almaty` only if no caller remains; keep their unit test by moving its cases to `clock.rs` tests (real clock).
- [ ] **Step 3: TS + CLI + Go** as listed; `clock.test.ts` runs `clock_cases`.
- [ ] **Step 4:** `cargo test -p qupon_bonds`, `pnpm --filter @qupon/client test`, `go test ./services/registrar/...`, codama, fixtures export, `make verify`.
- [ ] **Step 5: commit** `feat(program): demo clock per series (day_secs), same civil math` (`task: 1511`).

**Acceptance:** new tests pass; all pre-existing tests unedited and green; `qupon series:create --demo-day-secs 1 …` works against LiteSVM-free unit tests of arg building; account sizes unchanged (size test); `make verify` green.

### Task 1512: program — default and cure

**Agent:** glm · **Depends on:** 1511 · **Role:** anchor

**Files:** `state.rs` (ActionStatus `Defaulted = 10`; CorporateAction `defaulted_at: i64, cured_at: i64` → `reserved: [u8; 47]`; Series `in_default: u8, defaults_count: u16` → `reserved: [u8; 35]`), new `instructions/default.rs`, `settle.rs` (`fund_action`), `lib.rs`, `events.rs` (`ActionDefaulted`, `DefaultCured`), `error.rs` (append `NotOverdue`), CLI `action:default` in `clients/ts/src/commands/action.ts`, tests `tests/default.rs`, docs 02/03 (§ "Default and cure").

**Interfaces — Produces:** `declare_default()` accounts `{ payer: Signer, series (mut), action (mut, has_one series, has_one escrow), escrow }`; events `ActionDefaulted { series, action, index, kind, required, escrow_balance, shortfall, payment_at, defaulted_at, slot, timestamp }`, `DefaultCured { series, action, index, late_secs, slot, timestamp }`.

- [ ] **Step 1: failing tests** `tests/default.rs`:

```rust
#[test] fn default_needs_payment_date_plus_grace() {
    let (mut env, b, _h, a) = intr_snapshotted_unfunded();
    env.set_clock(a.payment_at + grace(&b) - 1);
    assert_err(env.send_as_outsider(declare_default_ix(&b, &a)).unwrap_err(), "NotOverdue");
}
#[test] fn outsider_declares_default_and_bond_keeps_trading() {
    let (mut env, b, h, a) = intr_snapshotted_unfunded();
    fund_partial(&mut env, &b, &a, 100_000);
    env.set_clock(a.payment_at + grace(&b));
    env.send_as_outsider(declare_default_ix(&b, &a)).unwrap();
    let (act, s) = (fetch_action(&env, &a), fetch_series(&env, &b));
    assert_eq!(act.status, ActionStatus::Defaulted as u8);
    assert_eq!((s.in_default, s.defaults_count), (1, 1));
    let ev = env.last_event::<ActionDefaulted>();
    assert_eq!((ev.required, ev.escrow_balance, ev.shortfall), (500_000, 100_000, 400_000));
    env.send(&[transfer_ix(&b, &h[2], &h[0], 65)], &[&h[2].kp]).expect("trades while in default");
}
#[test] fn funded_action_cannot_default() {
    let (mut env, b, _h, a) = intr_snapshotted_unfunded();
    fund_full(&mut env, &b, &a);
    env.set_clock(a.payment_at + grace(&b));
    assert_err(env.send_as_outsider(declare_default_ix(&b, &a)).unwrap_err(), "WrongStatus");
}
#[test] fn cure_pays_record_date_holders_not_buyers() {
    let (mut env, b, h, a) = intr_defaulted();
    env.send(&[transfer_ix(&b, &h[2], &h[0], 65)], &[&h[2].kp]).unwrap(); // holder 3 sells after the default
    fund_full(&mut env, &b, &a);
    let ev = env.last_event::<DefaultCured>();
    assert!(ev.late_secs > 0);
    assert_eq!(fetch_series(&env, &b).in_default, 0);
    pay_all_as_outsider(&mut env, &b, &a, &h);
    assert_eq!(cash_balances(&env, &h), vec![50_000, 125_000, 325_000]);
}
#[test] fn redemption_default_keeps_register_frozen() {
    let (mut env, b, _h, r) = redm_snapshotted_unfunded();
    env.set_clock(r.payment_at + grace(&b));
    env.send_as_outsider(declare_default_ix(&b, &r)).unwrap();
    assert!(mint_paused(&env, &b.mint));
}
#[test] fn no_new_action_while_defaulted() {
    let (mut env, b, _h, _a) = intr_defaulted();
    assert_err(announce_next(&mut env, &b).unwrap_err(), "ActionAlreadyOpen");
}
```

- [ ] **Step 2: implement** `instructions/default.rs`:

```rust
pub fn handle_declare_default(ctx: Context<DeclareDefault>) -> Result<()> {
    let clock = Clock::get()?;
    let required = required_funding(&ctx.accounts.action)?;
    let a = &ctx.accounts.action;
    require!(a.status == ActionStatus::SnapshotComplete as u8, QuponError::WrongStatus);
    let due = a.payment_at.checked_add(SeriesClock::of(&ctx.accounts.series)?.grace()).ok_or(QuponError::MathOverflow)?;
    require!(clock.unix_timestamp >= due, QuponError::NotOverdue);
    let balance = ctx.accounts.escrow.amount;
    require!(balance < required, QuponError::WrongStatus);
    let a = &mut ctx.accounts.action;
    a.status = ActionStatus::Defaulted as u8;
    a.defaulted_at = clock.unix_timestamp;
    let s = &mut ctx.accounts.series;
    s.in_default = 1;
    s.defaults_count = s.defaults_count.checked_add(1).ok_or(QuponError::MathOverflow)?;
    emit!(ActionDefaulted { series: s.key(), action: a.key(), index: a.index, kind: a.kind, required,
        escrow_balance: balance, shortfall: required - balance, payment_at: a.payment_at,
        defaulted_at: clock.unix_timestamp, slot: clock.slot, timestamp: clock.unix_timestamp });
    Ok(())
}
```

  `fund_action`: accept `Defaulted`; when the balance reaches `required` and the prior status was `Defaulted`: `cured_at = now`, `series.in_default = 0`, emit `DefaultCured { late_secs: now − payment_at }`, status `Funded` (FundAction gets `series` as `mut`).
- [ ] **Step 3:** CLI `action:default --series --index` (any keypair; `--keypair` optional) → `{ok, signature}`; codama; docs; `make verify`.
- [ ] **Step 4: commit** `feat(program): permissionless declare_default and cure by funding` (`task: 1512`).

**Acceptance:** 6 tests pass; size test unchanged; `NotOverdue` appended last; `make verify` green.

### Task 1513: program — atomic pay + burn at redemption; 5-account pay layout

**Agent:** glm · **Depends on:** 1512 · **Role:** anchor

**Files:** `settle.rs` (`PayBatch` gains `mint` (mut), `bond_token_program: Program<Token2022>`; remaining accounts per holder = `[Entitlement (w), Investor, PayoutRoute PDA (read; may be uninitialised), destination cash ATA (w), bond ATA (w)]`; `PAY_BATCH_MAX = 5`), `state.rs` (no layout change; add `PAYOUT_ROUTE_SEED = b"route"` to constants), `retire.rs` unchanged (strays only), `clients/ts/src/commands/action.ts` (pay builder, batch size 4, CU limit 400k), Go `executor` unaffected (CLI builds accounts), tests `tests/redemption.rs`, `tests/cu_benchmarks.rs`, docs.

- [ ] **Step 1: failing tests** in `tests/redemption.rs`:

```rust
#[test] fn redemption_pays_and_burns_in_one_instruction() {
    let (mut env, b, h, r) = redm_funded();
    pay_all_as_outsider(&mut env, &b, &r, &h);
    assert_eq!(cash_balances(&env, &h), vec![1_050_000, 2_625_000, 6_825_000]); // principal + final coupon
    assert_eq!(mint_supply(&env, &b), 0);
    for e in fetch_entitlements(&env, &r) { assert_eq!(e.status, EntitlementStatus::Retired as u8); }
    // hooked: register stays locked by the gate; legacy variant of this test asserts the mint is paused again
    complete_as_outsider(&mut env, &b, &r);
    close_series(&mut env, &b, &r).expect("supply already 0");
}
#[test] fn suspended_holder_is_thawed_burned_and_paid() {
    let (mut env, b, h, r) = redm_funded();
    suspend(&mut env, &b, &h[1]);
    pay_all_as_outsider(&mut env, &b, &r, &h);
    assert_eq!(token_balance(&env, &h[1].bond_ata), 0);
    assert_eq!(cash_balance(&env, &h[1]), 2_625_000);
}
#[test] fn pay_rejects_wrong_route_pda() {
    let (mut env, b, h, a) = intr_funded();
    let err = env.send_as_outsider(pay_ix_with_route(&b, &a, &h[0], &Pubkey::new_unique())).unwrap_err();
    assert_err(err, "InvalidParams");
}
#[test] fn coupon_does_not_burn() {
    let (mut env, b, h, a) = intr_funded();
    pay_all_as_outsider(&mut env, &b, &a, &h);
    assert_eq!(mint_supply(&env, &b), 100);
}
```

- [ ] **Step 2: implement** — in `handle_pay_batch`: `require!(rem.len().is_multiple_of(5))`; per holder verify `t[2].key() == find_program_address([PAYOUT_ROUTE_SEED, investor.key()])`, `t[3] == investor.cash_ata` (1514 adds the bank branch), `t[4] == investor.bond_ata`; for `Redemption | EarlyRedemption` — hooked series: the register is already locked by the gate and a permanent-delegate burn does not invoke the hook, so no pause dance; legacy series: once per batch `pausable_resume` (series PDA signer) — then per holder after the cash transfer: if the bond ATA is frozen `thaw_account` (series PDA = freeze authority), `burn_checked(ent.units)` with the series PDA as permanent delegate, `ent.status = Retired`, `action.total_retired += units`, `action.holders_retired += 1`, emit `UnitsRetired`; legacy only: at the end of the batch `pausable_pause`. `complete_action` reconciliation unchanged; for REDM/MCAL → `Retiring` (supply already 0) — `close_series` requirement `holders_retired == holders_snapshotted` holds.
- [ ] **Step 3:** CLI pay builder passes 5 accounts/holder and the new fixed accounts; `cu_benchmarks` asserts ≤ 400k CU for a 5-holder REDM batch; codama; docs; `make verify`.
- [ ] **Step 4: commit** `feat(program): atomic pay+burn for redemptions; payout-route slot in pay_batch` (`task: 1513`).

**Acceptance:** 4 tests pass; existing redemption/retire/close tests adjusted ONLY where they built the 3-account layout (list them in the worklog); `make verify` green.

### Task 1514: program — holder payout route and bank confirmation

**Agent:** glm · **Depends on:** 1513 · **Role:** anchor

**Files:** `state.rs` (new account `PayoutRoute { bump: u8, investor: Pubkey, route: u8, bank_ref_hash: [u8; 32], updated_at: i64 }`, `PayoutRouteKind { Wallet = 0, Bank = 1 }`, `EntitlementStatus::PaidToAgent = 3`, CorporateAction `bank_pending: u32` → `reserved: [u8; 43]`), new `instructions/payout_route.rs` (`set_payout_route`, `confirm_bank_payout`), `settle.rs` (bank branch; `complete_action` requires `bank_pending == 0`), `events.rs` (`PayoutRouteSet`, `PaidToAgent`, `BankPayoutConfirmed`), `error.rs` (append `BankPayoutsPending`), CLI `payout:route`, `payout:confirm-bank`, tests `tests/payout_route.rs`, docs (bank transfer = SIMULATED, reference hash only).

- [ ] **Step 1: failing tests**:

```rust
#[test] fn only_the_holder_can_set_route() {
    let (mut env, b, h) = registered();
    assert_err(env.send_as(&b.registrar, set_route_ix(&b, &h[0], Bank, [7; 32])).unwrap_err(), "Unauthorized");
    env.send(&[set_route_ix(&b, &h[0], Bank, [7; 32])], &[&h[0].kp]).unwrap();
}
#[test] fn bank_route_pays_agent_and_needs_confirmation_before_complete() {
    let (mut env, b, h, a) = intr_funded_with_route(1 /*holder index*/, Bank);
    pay_all_as_outsider(&mut env, &b, &a, &h); // holder 1's net goes to the paying agent's cash ATA
    assert_eq!(cash_balance_of(&env, &b.paying_agent_cash_ata), 125_000);
    assert_err(complete_as_outsider(&mut env, &b, &a).unwrap_err(), "BankPayoutsPending");
    env.send(&[confirm_bank_ix(&b, &a, &h[1], [9; 32])], &[&b.paying_agent]).unwrap();
    complete_as_outsider(&mut env, &b, &a).unwrap();
    assert_eq!(env.last_event::<BankPayoutConfirmed>().reference_hash, [9; 32]);
}
#[test] fn bank_route_cannot_point_elsewhere() {
    let (mut env, b, h, a) = intr_funded_with_route(0, Bank);
    let err = env.send_as_outsider(pay_ix_with_dest(&b, &a, &h[0], &h[0].cash_ata)).unwrap_err();
    assert_err(err, "AccountOwnerMismatch");
}
#[test] fn only_paying_agent_confirms() {
    let (mut env, b, h, a) = intr_paid_to_agent(0);
    assert_err(env.send_as(&b.registrar, confirm_bank_ix(&b, &a, &h[0], [1; 32])).unwrap_err(), "Unauthorized");
}
```

- [ ] **Step 2: implement** — `set_payout_route(route: u8, bank_ref_hash: [u8;32])`: signer `owner` == `investor.owner`; create the PDA with `create_pda_account` if empty (payer = owner) else update; `route == Wallet` requires `bank_ref_hash == [0;32]`. `pay_batch`: if the route PDA is initialised and `route == Bank` → destination must equal `get_associated_token_address_with_program_id(series.paying_agent, cash_mint, cash_token_program)` → status `PaidToAgent`, `bank_pending += 1`, emit `PaidToAgent`; `holders_paid`/`total_paid` count it (money left the escrow). `confirm_bank_payout(reference_hash)`: signer == `series.paying_agent`; `PaidToAgent → Paid`, `bank_pending -= 1`, emit. `complete_action`: `require!(action.bank_pending == 0, BankPayoutsPending)`.
- [ ] **Step 3:** CLI + codama + Go decoder for `PayoutRoute` (new decoder, own discriminator) + docs; `make verify`.
- [ ] **Step 4: commit** `feat(program): holder-signed payout route and bank payout confirmation` (`task: 1514`).

**Acceptance:** 4 tests pass; nobody but the holder can choose bank; nothing but the agent's own cash ATA can receive a bank-routed payout; `make verify` green.

### Task 1515: program — disclosure anchoring and accrued interest on DvP trades

**Agent:** glm · **Depends on:** 1514 · **Role:** anchor

**Files:** `state.rs` (CorporateAction `disclosure_hash: [u8; 32]` → `reserved: [u8; 11]`), new `instructions/disclosure.rs` (`attach_disclosure(hash)`, registrar, once per action, any status except Cancelled), `trade.rs` (`admit_trade` emits `TradeAccrued`), `events.rs` (`DisclosureAttached { series, action, index, hash, … }`, `TradeAccrued { series, swap_dvp, units, cash_amount, settle_ymd: u32, accrued_days: i32, accrued: i64, clean: i64, slot, timestamp }`), `error.rs` (append `AlreadyAttached`), CLI `disclosure:attach`, tests `tests/disclosure.rs`, `tests/trade.rs` (new cases only).

- [ ] **Step 1: failing tests**:

```rust
#[test] fn disclosure_attaches_once() {
    let (mut env, b, _h, a) = intr_announced();
    env.send(&[attach_ix(&b, &a, [5; 32])], &[&b.registrar]).unwrap();
    assert_eq!(fetch_action(&env, &a).disclosure_hash, [5; 32]);
    assert_err(env.send(&[attach_ix(&b, &a, [6; 32])], &[&b.registrar]).unwrap_err(), "AlreadyAttached");
}
#[test] fn trade_30_days_into_period_carries_accrued() {
    let (mut env, b, h) = registered_with_units();
    env.set_clock(period_start_plus_one_month(&b) + 3600); // 2026-07-03 → 2026-08-03 = 30 days in 30E/360 (not +30 calendar days, which is 29)
    admit_trade_for(&mut env, &b, &h[2], &h[0], 5, 504_167);
    let ev = env.last_event::<TradeAccrued>();
    assert_eq!((ev.accrued_days, ev.accrued, ev.clean), (30, 4_167, 500_000));
}
#[test] fn trade_in_ex_coupon_window_has_negative_accrued() {
    let (mut env, b, h, a) = intr_snapshotted(); // resumed after finalize, record date = last day of the period
    admit_trade_for(&mut env, &b, &h[2], &h[0], 10, 999_722);
    let ev = env.last_event::<TradeAccrued>();
    assert_eq!((ev.accrued_days, ev.accrued, ev.clean), (-1, -278, 1_000_000));
}
```

- [ ] **Step 2: implement** — accrual start: if `series.open_action` is an INTR action with status in `{RecordStruck, SnapshotComplete, Funded, Settling, Defaulted}` → that action's `period_end` (ex-coupon), else `series.period_start`; `settle = clock.floor_civil(now)`; `(accrued, days) = entitlement::accrued_signed(units, face, rate, dc, start, settle)`; `clean = cash_amount as i64 − accrued`. Pass the open action as an optional account to `admit_trade` (CLI passes `series.open_action` when set; program requires it to match `series.open_action`).
- [ ] **Step 3:** CLI (`trade:create` prints `accrued`, `clean`), codama, docs; `make verify`.
- [ ] **Step 4: commit** `feat(program): anchor disclosure hash; accrued interest on admitted trades` (`task: 1515`).

**Acceptance:** 3 tests pass; values equal `fixtures/entitlement.json` `accrued_cases`; size test unchanged; `make verify` green.

### Task 1519: program wave integration and devnet deploy (Opus)

**Agent:** claude (Opus) · **Depends on:** 1515

- [ ] Opus security pass over `git diff <pre-1510>..HEAD -- programs/` with the `anchor-expert` subagent: signer/role table vs D2, every token CPI destination derivation, pause/resume pairing per batch, overflow, reserved-byte arithmetic. Fix or file `9519-*` tasks.
- [ ] `make build`; extend the program account if the binary grew (`solana program extend QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd <bytes> -u devnet`), top up the registrar from `funder1`; `make deploy`; IDL publish (Helius `RPC_URL`); `pnpm codama`; `QUPON_EXPORT_FIXTURE=1 cargo test -p qupon_bonds --test init_series export_series_fixture`; verified docker build + redeploy + hash update per the end of `reports/verified-build.md`.
- [ ] `make demo` on devnet (S0–S4 still green) and a quick manual demo-clock series: `qupon series:create --demo-day-secs 1 …` → coupon + default + cure + redemption, links into `reports/demo-plan15.md`.
- [ ] Hide pre-plan-15 demo series in `series_settings.hidden` (keep `QPNb1` and `BTRKdemo` visible).

**Acceptance:** devnet program = verified build of `main`; `reports/demo-full.md` regenerated; `reports/demo-plan15.md` shows every new instruction with explorer links.

---

## Wave C — services

### Task 1502: TS + Go mirrors of the clock and accrued math; yield math

**Agent:** glm · **Depends on:** 1501 · **Role:** ts-client

**Files:** `clients/ts/src/lib/clock.ts` (if 1511 already added it, extend), `clients/ts/src/lib/accrued.ts`, `clients/ts/src/lib/yield.ts`, tests `*.test.ts` reading `fixtures/entitlement.json`; Go `services/registrar/internal/entitlement/accrued.go` (+ `CivilClock`) with table tests over the same JSON; `fixtures/entitlement.json` gains `yield_cases`.

**Interfaces — Produces:** TS `accruedSigned(units, face, rateBps, dayCount, start: Ymd, settle: Ymd): { amount: bigint; days: number }`; `dirtyPrice(cleanPerUnit: bigint, accruedPerUnit: bigint): bigint`; `ytm({ cleanPrice, face, rateBps, frequency, settle, maturity, dayCount }): number` (Newton–Raphson on the street-convention price, tolerance 1e-10, ≤ 100 iterations, returns annual rate as a fraction); `currentYield(rateBps, face, cleanPrice): number`. Go `entitlement.AccruedSigned(...) (int64, int32, error)`, `entitlement.CivilClock`.

- [ ] Vectors (add to fixtures): `{"id":"par_bond_ytm_equals_coupon","clean":100000,"face":100000,"rate_bps":1000,"frequency":2,"settle":"2026-10-03","maturity":"2027-10-03","ytm":0.10}`, `{"id":"discount_95","clean":95000,"face":100000,"rate_bps":1000,"frequency":2,"settle":"2026-10-03","maturity":"2027-10-03","ytm":0.15592}` (two whole periods, settle on a coupon date: 95 = 5/x + 105/x², x = 1 + y/2 → y = 0.155920; tolerance 1e-5).
- [ ] Tests first, then implementation, then `pnpm --filter @qupon/client test`, `go test ./services/registrar/internal/entitlement/...`, `make verify`, commit `feat(math): accrued/clock mirrors in TS and Go; yield to maturity`.

**Acceptance:** all fixture vectors pass in TS and Go; `make verify` green.

### Task 1505: Kazakh locale — namespace files

**Agent:** glm · **Depends on:** 1504 · **Role:** frontend

Translate every `apps/web/messages/en/<ns>.json` into `messages/kk/<ns>.json` (admin, account, kyc, notify, org, reports, kase, assets, network, wallet, onboarding, trades, termsheet + any namespace added since); empty `KK_PENDING`; same terminology table as 1504. **Acceptance:** `messages.test.ts` passes with `KK_PENDING = []`; `bash ops/shots.sh <dir> /investor /registrar /admin /account` in kk shows no English strings except brand names and `SIMULATED`; `make verify` green.

### Task 1520: CLI — crank as anyone, claim, routes, sandbox helpers, proof hooks

**Agent:** glm · **Depends on:** 1515, 1516 · **Role:** ts-client

**Files:** `clients/ts/src/commands/action.ts`, `lifecycle.ts`, `payout.ts` (new group; register in `commands/index.ts`), `common.ts` (`signer(cmd, "any")` = `--keypair` or `QUPON_CRANK_KEYPAIR` or registrar), tests next to each.

- [ ] `action:strike|snapshot|finalize|pay|complete|retire|default` accept any keypair (role `any`); `action:claim --series --index --owner <pubkey>` = `pay_batch` for one holder signed by the holder (`QUPON_INVESTOR_KEYPAIR`) with optional `--fee-payer` keypair; `payout:route --series --route wallet|bank --bank-ref <text>` (hashes `sha256(text)`; prints the hash, never the text); `payout:confirm-bank --series --index --owner --reference <text>`; `disclosure:attach --series --index --file <path>` (sha256 of file bytes).
- [ ] `action:announce` on a demo-clock series: record_at = period_end − 1 series-day; payment_at = period_end + `--payment-delay-days` (default 0) series-days.
- [ ] JSON contract unchanged (`{ok, signature, slot, …}`); unit tests for argument → instruction building (no network).
- [ ] Commit `feat(cli): permissionless crank, claim, payout routes, disclosure`.

**Acceptance:** `pnpm --filter @qupon/client test` covers each new command's builder; `make verify` green.

### Task 1521: Go chain layer for plan 15

**Agent:** glm · **Depends on:** 1515 · **Role:** go-backend

**Files:** `internal/chain/types.go`, `decode.go` (Series `DaySecs`, `IssueYmd`, `InDefault`, `DefaultsCount`; CorporateAction `HashScheme`, `DefaultedAt`, `CuredAt`, `BankPending`, `DisclosureHash`; Entitlement status 3; new `DecodePayoutRoute`), `client.go` (`FetchPayoutRoutesBySeries`), `ingest/events.go` `layouts` (StrikeTiming, ActionDefaulted, DefaultCured, PayoutRouteSet, PaidToAgent, BankPayoutConfirmed, DisclosureAttached, TradeAccrued), `reconcile` (Defaulted actions report shortfall; bank pending), `notify` (fan-out: default declared, cured, paid to bank agent, bank payout confirmed), `fixtures/accounts/*.b64` regenerated by 1519 → `decode_real_test.go` covers new fields; `api/rest.go` JSON adds `inDefault`, `defaultsCount`, `demoClock: {daySecs}`, action `defaultedAt`, `curedAt`, `disclosureHash`, `bankPending`, entitlement `paidToAgent`.
- [ ] `events_idl_test.go` passes against the new IDL; every decoder keeps the "reject trailing bytes" rule.
- [ ] Commit `feat(registrar): decode and ingest plan-15 accounts and events`.

**Acceptance:** `go test ./services/registrar/...` green incl. real-fixture decode; `/series` and `/actions/{pda}` expose the new fields (openapi updated in both files, `apps/web/src/lib/api-schema.d.ts` regenerated); `make verify` green.

### Task 1522: Go executor + scheduler for plan 15

**Agent:** glm · **Depends on:** 1521 · **Role:** go-backend

**Files:** `internal/executor/executor.go` (`NextStep`: status 10 → `fund` only with autofund else none; `PaidToAgent` pending → step `confirm_bank` for registrar/paying-agent operator UI, never automatic; `cliCommand` entries for `default`, `confirm-bank`, `claim`), `internal/scheduler/scheduler.go` (hooked series: snapshot from `record_at` (no strike); legacy: strike at `record_at`; when SnapshotComplete and `now ≥ payment_at + grace` and not autofund → `default`; demo-clock series ticks every 2 s; scenario flag per series `no_autofund` read from `series_settings`), migrations `007_series_scenario.sql` (`series_settings.no_autofund INTEGER NOT NULL DEFAULT 0`, `series_settings.sandbox_id TEXT`), tests with the fake CLI.
- [ ] Table tests: every status × (autofund on/off) × (real/demo) → expected step and time gate.
- [ ] Commit `feat(registrar): autopilot for default/cure, early strike, demo-clock ticks`.

**Acceptance:** tests green; a dry-run tick log for a demo series shows strike → snapshot → finalize → (default) → fund → pay → complete; `make verify` green.

### Task 1523: Go notices + ISO for plan 15 (incl. kk)

**Agent:** glm · **Depends on:** 1521 · **Role:** go-backend

**Files:** `internal/notice/notice.go` (+ `renderPCAL`, `renderBMET`, `renderDefault`, `renderCure`; language `kk` for all), golden files `fixtures/notices/{intr,redm,mcal,pcal,bmet,chan,default,cure}.{en,ru,kk}.golden.txt`, `internal/iso20022/seev031.go` (deterministic: every timestamp from chain — `CreDtTm` = action `announced_at`; no `time.Now()`), `api/disclosure.go` (`GET /actions/{pda}/disclosure-hash` → `{hash, onchain, match}`; after `announce` the registrar runs `disclosure:attach` with the seev031 bytes — hook in the announce handlers and the scheduler), seev.036 for bank-routed payouts (`PaidToAgent`) with the agent as account servicer, tests.
- [ ] Commit `feat(registrar): notices for PCAL/BMET/default/cure in en/ru/kk; anchored deterministic seev.031`.

**Acceptance:** goldens pass; generating seev031 twice for the same action yields identical bytes; `make verify` green.

### Task 1524: sandbox API — a judge's own bond on a demo clock

**Agent:** glm · **Depends on:** 1522 · **Role:** go-backend

**Files:** `internal/api/sandbox.go` (mount anchor `// mount: sandbox`), `internal/sandbox/sandbox.go` (+ tests), migrations `008_sandboxes.sql`, `openapi.yaml` (both copies), `network.go` (`mainnetGuard` also refuses `/demo/sandbox*` and any series create with `daySecs ≠ 0`).

**Endpoints:**
- `POST /demo/sandbox` `{ wallet?: base58 }` → creates a demo-clock series (`--demo-day-secs 1`, 1-year, semi-annual, face 1,000 tKZT, 10 %, ticker `SBX-<6>`), registers the three custodial demo investors (+ `wallet` if given: SAS attest + register + faucet), places 10 / 25 / 65, attaches the sandbox to the visitor (`qupon_sandbox` httpOnly cookie, 24 h) and returns `{ id, mint, ticker, clock: {daySecs, issueTs}, schedule: [...], links }`. Limits: 3 per IP per hour, 30 per day total (configurable); executes via the executor with a 120 s budget, idempotent per request id.
- `GET /demo/sandbox/{id}` → series + actions + next step + countdowns (server time).
- `POST /demo/sandbox/{id}/scenario` `{ kind: "skip_funding" | "cure" | "non_kyc_transfer" | "dvp_trade" }`: skip_funding sets `no_autofund=1` so the coupon defaults; cure funds the shortfall; non_kyc_transfer attempts a transfer to the outsider and returns the on-chain refusal (error name + tx/simulation logs); dvp_trade creates+admits+funds+settles a 5-bond trade at dirty price (clean 100 % + accrued) and returns `TradeAccrued`.
- `/series` public listing excludes sandboxes except the caller's own (by cookie).
- [ ] Tests with the fake CLI; rate-limit tests; mainnet-guard test.
- [ ] Commit `feat(registrar): one-click judge sandbox on a demo clock`.

**Acceptance:** tests green; on devnet (by 1540) a sandbox reaches maturity within 7 minutes with autopilot; `make verify` green.

### Task 1525: public holder lookup + featured series

**Agent:** glm · **Depends on:** 1521 · **Role:** go-backend

`GET /holders/{owner}` (public, cached 15 s): positions per series (units, KYC status, payout route), entitlements with status/amounts/paid tx, upcoming payouts (next record/payment dates per series via the clock); `GET /series?featured=1`; featured ordering in `/series`. Tests + openapi. Commit `feat(registrar): holder lookup by address; featured series`. **Acceptance:** tests green; `make verify` green.

### Task 1526: machine-readable proof manifest + verifier

**Agent:** glm · **Depends on:** 1520 · **Role:** ts-client

**Files:** `clients/ts/scripts/lib/proof.ts` (shared writer), use in `demo-full.ts`, `demo-coupon.ts`, `demo-squads.ts`, trade scenario; `clients/ts/src/commands/proof.ts` (`proof:verify <file>`); schema `fixtures/proof.schema.json`.

Manifest: `{ version: 1, cluster, programId, generatedAt, steps: [{ id, label, signature, slot, instruction, expect: { event?: string, fields?: Record<string,string|number> } }] }` → `reports/devnet-proof.json` (+ per-script `reports/devnet-proof-<kind>.json`). `proof:verify` fetches each tx (`getTransaction` maxSupportedTransactionVersion 0), checks success, that the Qupon program was invoked, decodes Anchor events from logs with the Codama event decoders and compares `expect.fields`; prints `{ok, checked, failed: [...]}`; exit 1 on any failure.
- [ ] Unit test with a recorded tx JSON fixture (no network). Commit `feat(proof): devnet proof manifest and verifier`.

**Acceptance:** test green; `make verify` green; 1540 regenerates real manifests.

### Task 1541: uptime watchdog

**Agent:** flash · **Depends on:** —

`ops/watchdog.sh` (cron-able): checks `PUBLIC_URL`, `/healthz`, `/admin/system` RPC/operator balances (token from env), posts to Telegram if `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are set, otherwise prints; exits non-zero on failure; README line in `deploy/vps/README.md`. **Acceptance:** `bash ops/watchdog.sh --dry-run` prints the checks; shellcheck clean.

---

## Wave D — product UI (after 1530 golden screens; mock first, live after Wave C)

Every web task: implement against `docs/design/language.md` and the golden screens; extend mocks in `apps/web/src/mocks/features/*`; add/extend Playwright specs; strings in en/ru/kk; run `bash ops/shots.sh` on the touched routes before DONE.

### Task 1531: guidance system — NowBar, tours, glossary, /learn

**Agent:** glm · **Depends on:** 1530, 1504 · **Role:** frontend

- [ ] `NowBar` in `CabinetShell` and the sandbox: derives the next step from `src/lib/actionFlow.ts` (+ new statuses Defaulted/PaidToAgent), shows who may do it ("anyone can push this step" for permissionless steps), one primary button, countdown for time gates (demo-clock aware).
- [ ] Tours per role (issuer, registrar, investor, sandbox): 6–9 steps each, built on Radix Popover + `TourStep` (no new dependency), remembered per user in localStorage (try/catch), restart from the help menu.
- [ ] Glossary: `apps/web/src/lib/glossary.ts` (≥ 20 terms: record date, entitlement, ex-date, accrued interest/ЖКС/НКД, coupon, redemption, early/partial call, bondholder meeting, quorum, escrow, paying agent, registrar, default, cure, permissionless, snapshot hash, Token-2022 pause, DvP, SAS attestation, demo clock) with en/ru/kk plain-language definitions; `GlossaryTerm` wraps first occurrences on landing, bond, console, investor pages.
- [ ] `/learn` page: "How a bond lives on Qupon" plain-language walkthrough with the LifecycleRail and MoneyFlow primitives (en/ru/kk).
- [ ] Specs: `e2e/guidance.spec.ts` (NowBar shows the right step for each status fixture; tour opens/closes; glossary popover keyboard accessible).

**Acceptance:** spec green; Opus design score ≥ 8; `make verify` green.

### Task 1532: sandbox UI

**Agent:** glm · **Depends on:** 1530, 1531, 1524 (mock until merged) · **Role:** frontend

- [ ] Landing CTA "Try it in 3 minutes" → `POST /api/bo/demo/sandbox` (allowlist) → `/sandbox/[id]`.
- [ ] `/sandbox/[id]`: golden layout from 1530 — demo-clock badge + live countdowns, LifecycleRail with the bond's whole life, NowBar, role switcher (issuer / registrar / investor / "anyone"), live tx feed (every tx with explorer link), entitlement table that fills as snapshot runs, MoneyFlow during payment, scenario buttons (Skip funding → default; Cure; Try sending to a non-KYC wallet; Trade 5 bonds with accrued) each explaining the on-chain result in one line + link.
- [ ] Optional "Use my wallet": connect → included as a fourth holder (via `POST /demo/sandbox {wallet}`), Claim button works with the real wallet.
- [ ] Spec `e2e/sandbox.spec.ts` on mocks (state machine fixtures for every status).

**Acceptance:** spec green; shots at 1440/390 en/ru/kk; Opus design score ≥ 8.

### Task 1533: investor — claim, payout route, calendar, yield, holder lookup, signing guard

**Agent:** glm · **Depends on:** 1530, 1502, 1525 · **Role:** frontend

- [ ] Claim button per unpaid funded entitlement (wallet-signed `pay_batch` for one holder via a new builder in `src/lib/portal.ts`; demo investor via the session proxy).
- [ ] Payout route card (wallet / bank: IBAN-like text hashed client-side with WebCrypto, only the hash leaves the browser; SIMULATED bank badge), signed by the wallet.
- [ ] Portfolio header: "Claimable now · Next coupon in N days · Received to date", plus a "Claim all" button.
- [ ] Payout calendar for the next 12 months of record/payment dates (from `/holders/{owner}`).
- [ ] Positions with clean, accrued and dirty value and YTM (`yield.ts`), plus default/cure badges.
- [ ] Public `/holder/[address]` page (no login) rendering `/holders/{owner}`.
- [ ] `walletSigner.ts`: before sending, compare the signed transaction's message bytes with the bytes we built; mismatch → abort with a clear error (unit test with a tampering mock wallet).

**Acceptance:** specs + unit tests green; Opus design score ≥ 8; `make verify` green.

### Task 1534: registrar console v2

**Agent:** glm · **Depends on:** 1530, 1522, 1523 · **Role:** frontend

- [ ] Console per golden screen: an ActionFlow stepper (Announced → Record → Snapshot → Funded → Paid N/N → Reported). Each step shows its time and tx, and the seev.031/seev.036 download buttons sit on the step they belong to. The stepper also shows planned vs effective record time (from `StrikeTiming`), permissionless badges, Defaulted state (shortfall, overdue timer, "declare default" button for anyone, cure by funding), bank confirmations panel (PaidToAgent rows → confirm with reference), disclosure hash panel (fetch seev031, sha256 in the browser, compare with `disclosureHash` → ✓/✗), reconcile panel showing scheme 0/1.
- [ ] Registrar dashboard: replace the empty pipeline with a dense board (status columns that never truncate tickers at 1440/390) + alerts for overdue funding and pending bank confirmations.

**Acceptance:** specs green; Opus design score ≥ 8.

### Task 1535: bond dossier v2 + board

**Agent:** glm · **Depends on:** 1530, 1502, 1525 · **Role:** frontend

- [ ] `/bonds/[mint]` per golden screen: header with status incl. IN DEFAULT / DEMO CLOCK, yield block (clean, accrued, dirty, YTM, current yield), LifecycleRail of all actions, schedule, terms, KASE panel and documents moved below the life story, trade ticket preview showing accrued split for N bonds.
- [ ] Register "as of record date": one tab per action, with share bars and a per-holder calculation drawer (30E/360 days, gross, tax, net, principal, formula line `units × per-unit = amount`). Journal of every operation with explorer links. "Export issue audit (CSV)" builds the CSV client-side from the API data.
- [ ] `/bonds`: featured first, sandboxes hidden, human titles, empty/error states. Statuses show the life stage ("Record date soon", "Paying", "Voting", "Redeemed", "In default").
- [ ] Curated showcase: `services/registrar` admin seeds 4 featured demo series, one per scenario (coupon, redemption, meeting, early call), each with a distinct ticker, a human name and an ISIN of the form `KZ2C0QPN000N`. The data is created by 1540 on devnet; this task only ships the config/seed code and the board ordering.

**Acceptance:** specs green; Opus design score ≥ 8.

### Task 1536: proof page — verify every action in the browser

**Agent:** glm · **Depends on:** 1530, 1521, 1502 · **Role:** frontend

- [ ] `/proof/[mint]` (public, also built as a static export: `pnpm --filter @qupon/web build:proof` → `apps/web/out-proof/` deployable to any static host): reads devnet **directly over RPC** (`NEXT_PUBLIC_RPC_URL`, default public devnet) with `@solana/kit` + Codama decoders — no registrar dependency.
- [ ] For each action: recompute every entitlement with `entitlement.ts`, Σunits vs supply at snapshot, set hash (scheme 1) or rolling hash (scheme 0), totals vs escrow movements; show ✓/✗ per check; list every signature with explorer link; disclosure hash check.
- [ ] Implemented-vs-simulated table (shared copy with landing).
- [ ] Unit tests for the verifier (fixtures from `fixtures/accounts`); spec on mocked RPC responses.

**Acceptance:** tests green; static export builds; Opus design score ≥ 8.

---

## Wave E — finish

### Task 1537: design pre-flight (Opus)

**Agent:** claude (Opus) · **Depends on:** 1531–1536


### Task 1540: final devnet run, live e2e, deploy (Opus)

**Agent:** claude (Opus) · **Depends on:** 1519, 1520–1537

`make deploy` if the program changed since 1519 (+ verified build + IDL); `make demo`, `make demo-trade`, a sandbox run end-to-end on devnet; `proof:verify reports/devnet-proof*.json` all ✓; `ops/deploy-vps.sh` (+ `REINDEX=1`); live e2e (`E2E_BASE_URL=…`) incl. a new `e2e/live/sandbox.spec.ts`; static proof export built. **Code freeze Oct 12 12:00.**

---

## Stretch (T2: only if Waves A–D merged by Oct 11 18:00)

### Task 1550: PCAL by quantity (KASE methodology) with verifiable largest remainder
Pro-rata units redeemed per holder `floor(units × q / supply)`, leftover `k` assigned to the `k` largest remainders (ties by owner key) — the registrar supplies the threshold remainder and tie key; the program verifies during snapshot that counts above/at the threshold bracket `k` and that Σ redeemed == target. Tests with 10/25/65 and a 7-unit call.

### Task 1551: KYB via НУЦ РК e-signature (spike)
Go `internal/eds`: verify a CMS signature over a server challenge with a GOST 34.10-2015 certificate chained to the NCA RK test root; extract БИН/ИИН and signer role OIDs (1.2.398.3.3.4.1.2.1/.2); on success issue the SAS attestation with `method = NCA_EDS`. Exit with `BLOCKED:1551` if no pure-Go GOST implementation verifies the NCA test vectors within 3 hours.
