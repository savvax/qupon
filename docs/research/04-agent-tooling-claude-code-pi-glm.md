# Continuous, mostly‑unattended multi‑agent coding — Claude Code (Max) + pi (Z.ai GLM‑5.3 / GLM‑5.3‑Flash)

Research date: 2026‑10‑05. **[V]** = verified against the cited official doc; **[UNVERIFIED]** = could not confirm. Claude Code docs: code.claude.com/docs; CLI in the v2.1.28x range.

## Part A — Claude Code

### A1. Headless mode (`claude -p`) [V]
| Flag | Behavior |
|---|---|
| `-p, --print "query"` | run once, print, exit; reads stdin; exit 0 success / non‑zero failure / 143 on SIGTERM |
| `--output-format text\|json\|stream-json` | json → `result`, `session_id`, `total_cost_usd`, `permission_denials`; stream-json → NDJSON (`--verbose`, `--include-partial-messages`) |
| `--json-schema '<schema>'` | structured output in `structured_output` |
| `--max-turns N` | print mode only; errors when the limit is reached |
| `--max-budget-usd 5.00` | volume guard (estimate) |
| `--permission-mode` | `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions` |
| `--dangerously-skip-permissions` | = bypassPermissions; "isolated containers and VMs only"; deny rules still apply; disclaimer must be accepted once interactively |
| `--permission-prompts none` | v2.1.259+: prompts auto‑deny, AskUserQuestion removed |
| `--allowedTools` / `--disallowedTools` | rule syntax `"Bash(git diff *)"`, `Bash(git:*)` accepted at pattern end; `Read(./.env)`, `Edit(src/**)`, `WebFetch(domain:x)`, `mcp__server__tool` |
| `--append-system-prompt "…"` / `--append-system-prompt-file f`; `--system-prompt(-file)` replaces | |
| `--model sonnet\|opus\|haiku\|<id>`; `--fallback-model`; `--effort low..max` | |
| `-c/--continue`, `-r/--resume <id>`, `--session-id`, `--fork-session`, `-n/--name` | `session_id=$(claude -p … --output-format json \| jq -r .session_id)` |
| `--agents '{...}'` (or file path in `-p`, v2.1.281+) | dynamic subagents |
| `--settings <file\|json>`, `--add-dir`, `--mcp-config`, `--strict-mcp-config` | |
| `-w/--worktree <name>` | `.claude/worktrees/<name>` on branch `worktree-<name>`; `-p` doesn't clean up |
| `--bare` | skips hooks/skills/CLAUDE.md **and does not read OAuth credentials** — don't use on a Max‑only setup |
| `--bg`, `claude agents`, `claude logs/attach/stop` | background sessions (research preview); can't combine with `-p` |

**Max subscription without API key:** yes — `/login` OAuth is the default credential; `-p` uses it. For headless boxes: `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` (1‑year token; Pro/Max/Team/Enterprise). Don't ship a product on subscription auth (third‑party restriction) — internal automation is fine.

**Limits:** rolling 5‑hour window shared with claude.ai + weekly limits (since 2025‑08‑28). Messages: `You've hit your session limit · resets …`, `…weekly limit…`, model‑specific. Interactive sessions on v2.1.234+ auto‑wait (`autoContinueAtUsageLimit`), **but `-p` runs do not** → the outer loop must detect and sleep. Hooks: `StopFailure` with matcher `rate_limit`; stream‑json `system/api_retry` with `error: "rate_limit"`. Prompt cache lifetime 1 h on subscription. Practical: ≤ 1–2 concurrent Claude sessions per account; `--model sonnet` for review/chores.

### A2. Project configuration [V]
- **CLAUDE.md**: `~/.claude/CLAUDE.md`, `./CLAUDE.md` or `./.claude/CLAUDE.md`, `./CLAUDE.local.md`; parents load at launch; subdirectory CLAUDE.md on demand; `@path` imports (depth 4); `.claude/rules/*.md` with `paths:`; **Claude Code ≥ 2.1.277 reads `AGENTS.md` when no CLAUDE.md exists** — pi also reads `AGENTS.md`/`CLAUDE.md`. Keep < 200 lines.
- **settings.json** precedence: managed > `--settings` > `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json`. Keys: `permissions.{allow,deny,ask,defaultMode,additionalDirectories}`, `env`, `hooks`, `model`, `enableAllProjectMcpServers`, `worktree.baseRef`, `autoContinueAtUsageLimit`. Committed `permissions.allow` waits for workspace trust; run `claude` once interactively in the repo before unattended runs.
- **Subagents** `.claude/agents/*.md`: frontmatter `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `isolation: worktree`, `effort`; body = system prompt.
- **Skills/commands**: `.claude/skills/<name>/SKILL.md` (current), `.claude/commands/*.md` still work; frontmatter `name`, `description`, `argument-hint`, `allowed-tools`, `model`, `context: fork`, `agent`, `background`, `paths`; `$ARGUMENTS`, `${CLAUDE_PROJECT_DIR}`, `` !`cmd` ``. In `-p`, `/skill-name args` in the prompt expands.
- **Hooks**: events `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `StopFailure`, `SubagentStart/Stop`, `TeammateIdle`, `TaskCreated/Completed`, `Notification`, `PreCompact`, `SessionEnd`, …; types `command`, `prompt`, `agent`, `http`. Input JSON on stdin (`session_id`, `transcript_path`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`, `tool_response`, Stop: `stop_hook_active`, `last_assistant_message`). **Exit 0** = parse stdout JSON; **exit 2** = block (stderr = reason; on `Stop` prevents stopping). Stop decision JSON `{"decision":"block","reason":"…"}`. `${CLAUDE_PROJECT_DIR}` stays at launch root even in worktrees — use `cwd` from input. **Stop‑hook block cap: 8 consecutive blocks** → raise via `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`. Default command timeout 600 s.

### A3. Autonomous loop patterns [V]
- **`/goal <condition>`**: prompt‑based Stop hook judged by a small model; works in `-p` (`claude -p "/goal make verify passes and git status is clean; stop after 20 turns"`); pauses on usage limit; condition ≤ 4,000 chars.
- **`/loop [interval] [prompt]`**: cron‑style re‑run inside an open session.
- **ralph‑wiggum plugin** (`anthropics/claude-code/plugins/ralph-wiggum`): `/ralph-loop "<prompt>" --max-iterations N --completion-promise "TEXT"`, `/cancel-ralph`; Stop hook re‑injects the same prompt until `<promise>TEXT</promise>` appears; collides with the 8‑block cap unless raised.
- Huntley's Ralph: `while :; do cat PROMPT.md | claude -p ; done` — one task per loop, git + plan files as memory, tests as back‑pressure.
- Worktrees: `claude -w name`; subagent `isolation: worktree`; `/batch` fan‑out; `.worktreeinclude` copies `.env`.
- Agent Teams (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): **no teammates in `-p` mode**; ~7× tokens — not for an unattended loop on one Max account.
- Agent SDK wraps the binary; `CLAUDE_CODE_OAUTH_TOKEN` documented for automation. GitHub Actions `anthropics/claude-code-action@v1` accepts `claude_code_oauth_token`.

### A4. Best practices [V]
Give Claude a check it can run (tests/build/lint); escalate in‑prompt → `/goal` → deterministic Stop hook → review subagent in fresh context. Explore → plan → implement → commit; specific prompts; `@file` refs; `/clear` between tasks; CLAUDE.md < 200 lines; fan‑out pattern `for f in …; do claude -p "…" --allowedTools "Edit,Bash(git commit *)" --permission-mode dontAsk; done`.

## Part B — pi coding agent

### B1. Package/version [V]
`@mariozechner/pi-coding-agent` (0.73.1) is **deprecated** → **`@earendil-works/pi-coding-agent` 1.0.2** (2026‑10‑04), repo `github.com/earendil-works/pi`, docs `https://pi.dev/docs/latest`, Node ≥ 22.19. Install: `curl -fsSL https://pi.dev/install.sh | sh` or `npm install -g @earendil-works/pi-coding-agent`. Binary `pi`. MIT.

**CLI**: `pi [options] [--] [@files...] [messages...]`
- `-p, --print` — run prompts, print final text, exit; stderr for errors; non‑zero exit on `error`/`aborted`. Piped stdin is prepended; `@path` includes a file.
- `--mode json` — JSONL events (`session`, `agent_start/agent_end`, `turn_*`, `message_*`, `tool_execution_*`, `compaction_*`, `auto_retry_*`); failed response ≠ non‑zero exit in JSON mode — inspect events. `--mode rpc` for control.
- `--provider <name>` (needs `--model`), `--model <pattern>` (`glm-5.3:high`), `--thinking off|minimal|low|medium|high|xhigh|max`, `--list-models [search]`, `--api-key`.
- Sessions: `-c`, `-r`, `--session`, `--session-id`, `--fork`, `--session-dir`, `--no-session`, `-n`.
- Tools: `-t read,bash,edit,write,grep,find,ls` (default `read,bash,edit,write`), `-xt`, `-nbt`, `-nt`; built‑in extensions `codemode`, `tool_search`.
- Prompts: `--system-prompt`, `--append-system-prompt` (repeatable); `-e/--extension <path>`, `--skill <path>`, `--prompt-template`, `-nc` (no AGENTS.md/CLAUDE.md); `-a/--approve` (trust project‑local config for this process), `--offline`, `--verbose`.
- Subcommands: `pi install|remove|update|list|config`, `pi auth check --provider zai` (0 ready / 1 not ready / 2 invalid), `pi mcp add|list|login`.
- **No permission prompts** — tools run with the process's permissions → sandbox it.

### B2. Configuration [V]
`~/.pi/agent/` (`PI_CODING_AGENT_DIR`): `settings.json`, `models.json`, `auth.json`, `mcp.json`, `keybindings.json`, `AGENTS.md|CLAUDE.md`, `SYSTEM.md`, `APPEND_SYSTEM.md`, `extensions/`, `skills/`, `prompts/`. Project: `.pi/settings.json`, `.pi/mcp.json`, `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md`, `.pi/extensions/`, `.pi/skills/`, `.pi/prompts/` — loaded after **project trust** (`defaultProjectTrust: ask|always|never`; `-a` for one process). Context files `AGENTS.md`/`CLAUDE.md` from cwd and parents need no trust. Settings: `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `defaultTools`, `compaction.*`, `retry.*`, `sessionDir`, `quietStartup`, `shellPath`.

**Z.ai support is built in**: provider id **`zai`** ("ZAI Coding Plan (Global)"), env **`ZAI_API_KEY`** (or `/login zai`), baseUrl `https://api.z.ai/api/coding/paas/v4`, api `openai-completions`, compat `{ thinkingFormat: "zai", supportsDeveloperRole: false, zaiToolStream: true }`; China variant `zai-coding-cn`. Model ids from models.dev `zai-coding-plan`; confirm with `pi --list-models zai` (expected `glm-5.3`, `glm-5.3-flash`). Pin via `~/.pi/agent/models.json`:
```json
{ "providers": { "zai-pinned": {
    "baseUrl": "https://api.z.ai/api/coding/paas/v4", "api": "openai-completions", "apiKey": "$ZAI_API_KEY",
    "models": [
      { "id": "glm-5.3", "name": "GLM-5.3", "reasoning": true, "input": ["text"], "contextWindow": 1000000, "maxTokens": 128000,
        "cost": { "input": 1.4, "output": 4.4, "cacheRead": 0.26, "cacheWrite": 0 }, "compat": { "thinkingFormat": "zai", "supportsDeveloperRole": false } },
      { "id": "glm-5.3-flash", "name": "GLM-5.3-Flash", "reasoning": true, "input": ["text","image"], "contextWindow": 1000000, "maxTokens": 128000,
        "cost": { "input": 0.15, "output": 0.5, "cacheRead": 0.03, "cacheWrite": 0 }, "compat": { "thinkingFormat": "zai", "supportsDeveloperRole": false } } ] } } }
```

### B3. Extensions / subagents / scripting [V]
Extension = TS module `export default function (pi: ExtensionAPI)`; loaded via `-e ./x.ts`, `~/.pi/agent/extensions/`, `.pi/extensions/` (jiti). APIs: `pi.on(event)`, `pi.registerTool()`, `pi.registerCommand()`, `pi.sendUserMessage()`, `pi.appendEntry()`, `pi.registerProvider()`. Events: `session_start`, `before_agent_start`, `tool_call` (mutate/block), `tool_result`, `message_end`, `turn_end`, `agent_end`, `agent_before_settle`, `agent_settled`, `context`, `user_bash`. **Loop‑until‑done:** `turn_end`/`agent_before_settle` handlers can return `{ continue: true, entries: [{ type: "custom_message", content: "…" }] }` — guard the condition. Subagents: official example `packages/coding-agent/examples/extensions/subagent/`. SDK: `createAgentSession` from `@earendil-works/pi-coding-agent`. Batch example: `pi --mode json "List files" 2>/dev/null | jq -c 'select(.type=="message_end")'`.

### B4. Z.ai GLM facts (Oct 2026) [V]
- Plans support **GLM‑5.3 and GLM‑5.3‑Flash**; GLM‑5.2/5.1 route to 5.3; `glm-5.3-flashx` not on plans. GLM‑5.3: `glm-5.3`, 1M context, 128K output, tool calling, reasoning always on (`reasoning_effort: low|high|max`), text‑only. GLM‑5.3‑Flash: `glm-5.3-flash`, 1M/128K, multimodal, "3× quota vs GLM‑5.3". List prices: 5.3 $1.4/$0.26 cached/$4.4 per 1M; Flash $0.15/$0.03/$0.50.
- Endpoints: Anthropic‑compatible `https://api.z.ai/api/anthropic` (Claude Code), OpenAI chat `https://api.z.ai/api/coding/paas/v4` (pi etc.). Plan keys cannot call the general API. If ever pointing Claude Code at Z.ai, use a separate `CLAUDE_CONFIG_DIR`.
- Policy: plan limited to officially supported tools — list includes **Pi**, Claude Code, Codex, OpenCode, Cline, Goose, Cursor, Kilo/Roo…
- **Quotas**: new plans credit‑based since 2026‑07‑30 (Lite 2,000 / Pro 12,000 / Max 28,000 credits per 5 h; 10,000 / 60,000 / 140,000 per week; peak Mon–Fri 14:00–18:00 SGT = 11:00–15:00 Astana). **Legacy V2 "Pro (legacy)"**: ~400 prompts / 5 h and ~2,000 / week; a prompt ≈ 15–20 model calls; GLM‑5.3 consumes 1× off‑peak / 3× peak; Flash 0.4× / 1.2×. Prices (third‑party, Jun 2026): Lite $18, Pro $72, Max $160/month. Concurrency limits UNVERIFIED.

## Part C — Recommended design (implemented in this kit's `ops/`)
Roles: Claude Code (Max) = planning, architecture, Anchor/Rust, review gate; GLM‑5.3 via pi = bulk implementation from the queue; GLM‑5.3‑Flash = lint, docs, commit messages. One Claude worker, 2 GLM workers, 1 Flash worker. Queue `tasks/todo/*.md` → `doing/<worker>/` → `done/` | `failed/` (atomic `mv` under `flock`). Each worker in its own git worktree; merge only after the orchestrator re‑runs `make verify`. Shared instructions in `AGENTS.md`; `CLAUDE.md` = `@AGENTS.md` + Claude‑only rules. Escalation: a GLM task failing twice is re‑tagged `agent: claude`. Planner pass every N merges (plan mode + `plan-next` skill, writes task files only). Review pass with a fresh‑context Sonnet subagent and `--json-schema` verdict. Stop hook gate + PostToolUse formatter in `.claude/settings.json`; pi `verify-loop.ts` extension on `agent_before_settle`. Budget: GLM‑5.3 bursts off‑peak; Flash anytime; `--max-turns` on every Claude run; orchestrator sleeps on limits. Safety: non‑root user or container; `.env` excluded; deny `git push --force`; never commit `auth.json`/`.credentials.json`.

Sources: https://code.claude.com/docs/en/cli-reference.md · headless.md · authentication.md · permission-modes.md · permissions.md · settings.md · memory.md · sub-agents.md · skills.md · hooks.md · hooks-guide.md · goal.md · scheduled-tasks.md · agent-teams.md · worktrees.md · best-practices.md · costs.md · errors.md · interactive-mode.md · env-vars.md · github-actions.md · agent-sdk/overview.md · https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum · https://ghuntley.com/ralph/ · https://support.claude.com/en/articles/11014257-about-claude-s-max-plan-usage · https://www.npmjs.com/package/@earendil-works/pi-coding-agent · https://github.com/earendil-works/pi · https://pi.dev/docs/latest · https://docs.z.ai/devpack/overview · https://docs.z.ai/devpack/faq · https://docs.z.ai/devpack/notice/usage-revision · https://docs.z.ai/devpack/tool/claude · https://docs.z.ai/devpack/tool/pi · https://docs.z.ai/guides/llm/glm-5.3 · https://docs.z.ai/guides/vlm/glm-5.3-flash · https://docs.z.ai/guides/overview/pricing
