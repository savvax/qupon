# 05 — Plan: tiers, gates, day-by-day (Asia/Almaty)

Tiers: **T0** must ship (all three required scenarios on devnet via CLI); **T1** needed to win (Go service, ISO 20022, UI, README, videos); **T2** only if T0+T1 are green by Saturday 20:00.

| Day | Agents | Human | End-of-day milestone (checkable) |
|---|---|---|---|
| Mon Oct 5 | 001–009: scaffold, toolchain, entitlement crate + Go mirror (shared vectors), program skeleton, mint script, registry, Codama | registrations, keys, wallets, bootstrap, start `ops/tmux.sh`, name decision | `make verify` green; init/register/subscribe tested in LiteSVM; program deployed to devnet (v0) |
| Tue Oct 6 | 010–016: INTR flow end-to-end, CLI, devnet demo-coupon | review math/legal wording; 1‑min update video | coupon paid on devnet to 3 holders; amounts = 500/1,250/3,250 |
| Wed Oct 7 | 017–022: REDM + retire + close, meeting + terms change, MCAL, `make demo` | watch the demo run; ask organizers questions | **Gate 1**: all 3 scenarios + MCAL on devnet with one command, tx links in `reports/demo-full.md` |
| Thu Oct 8 | 023–031: Go service (reader, reconcile, executor, scheduler, ISO 20022, notice, REST) | Superteam KZ program registration (deadline); pitch draft | API serves actions/entitlements; seev XML downloads; reconcile matches |
| Fri Oct 9 | 032–035: web console + portal, deploy | manual demo walk-through, fix list | **Gate 2**: demo runs through the UI only |
| Sat Oct 10 | 036–040: README, technical overview, hardening, CI, verified build; T2 picks | Demo Day; record draft demo video; slides | **Feature freeze 20:00** |
| Sun Oct 11 | 041–042 texts; bug fixes only | record pitch (2:00) and demo (≤3:00); fill Colosseum form | **Gate 3**: videos uploaded; form 100% filled |
| Mon Oct 12 | agents idle (no merges to main) | submit Colosseum by 20:00, then both Earn listings; tweet; last update video | everything submitted; buffer until Oct 13 09:00 |

## Cut rules
- Gate 1 missed by Wed 22:00 → drop BMET/CHAN to T2, keep MCAL as the third action (same code path as REDM).
- Go service behind by Thu 22:00 → keep only reader + ISO export + notice (skip scheduler); UI calls CLI through a tiny Node API instead.
- Never cut: UI (20% of score), README/technical overview, the implemented-vs-simulated table, videos.

## Definition of done for the whole project
1. `make verify` green on a clean clone (build, LiteSVM tests incl. all fixtures, go test, tsc, lint).
2. `make demo` runs S0–S4 on devnet and writes `reports/demo-full.md` with explorer links for every state transition.
3. Program verified build hash published; program id and mints in `config/devnet.json` and README.
4. Console + portal deployed (public URL) and pointing at devnet.
5. README + `docs/TECHNICAL_OVERVIEW.md` complete; implemented-vs-simulated table present.
6. Submission texts in `docs/07-submission.md` final; videos linked.
