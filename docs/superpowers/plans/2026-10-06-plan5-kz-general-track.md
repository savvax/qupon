# Plan 5 — Superteam Kazakhstan general track submission

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Tasks marked **(human)** cannot be done by an agent — the agent prepares everything, prints the checklist and stops.

**Goal:** Qupon is submitted to the "Colosseum Crypto World's Fair Hackathon | Superteam Kazakhstan Track" ($5,000 USDC) on Superteam Earn with texts and videos that fit that track's own form, limits and judging criteria — reusing the Colosseum and KASE-track work, not duplicating it.

**Spec:** `docs/00-brief.md` §"Superteam Kazakhstan general track" + the listing https://superteam.fun/earn/listing/colosseum-crypto-worlds-fair-hackathon-superteam-kazakhstan-track (fetched 2026-10-06; raw fields via `https://superteam.fun/api/listings/details/colosseum-crypto-worlds-fair-hackathon-superteam-kazakhstan-track`).

## Facts from the listing (2026-10-06)
- Deadline `2026-10-13T06:59Z` = Oct 13 11:59 Almaty; region Kazakhstan; prizes 2,000 / 1,200 / 800 / 500 (best student team) / 300 (best first-time team) / 200 (best idea); winners committed by Nov 11.
- Program dates Sep 15 – Oct 8; **registration deadline Oct 8**; **Demo Day Oct 10**. The listing gives **no registration link** — only the organizer, https://t.me/d1asaur (Dias Turdiyev).
- Hard eligibility: Colosseum application complete (Project Details, Media and Code, Team Profiles); **every** team member's Colosseum profile complete; GitHub link to a specific, accessible repository; **demo video ≤ 3:00** (working product; slides/code walkthrough don't count); **separate pitch video ≤ 2:00** ("introduce your team, explain what you are building, and tell us why your team is suited to build it"); both on YouTube/Loom/Vimeo.
- Judging: problem & user value · product execution · technical quality · ecosystem impact · market potential · innovation · team strength · pitch & demo quality. Priority categories (not restrictions): Gaming, DePIN, Consumer, AI, Payments & Remittance.
- Earn form = standard fields (Link to Your Submission*, Tweet Link) + 9 track questions: Project Name*, Project Description*, Project Github Link*, Project Website, Project X Link, Link to your pitch deck or Loom/video presentation*, "Did you submit this project to the official Crypto World's Fair Hackathon on Colosseum? (Yes/No)"*, Link to Colosseum project, Link to your project's Colosseum profile. **There is no "Anything else" field** — the description must carry the links.
- Multiple side tracks are allowed (Earn hub FAQ: "submit your project to as many Sidetracks as you like"); each needs its own Earn submission.

## Global Constraints
- English everywhere (AGENTS.md §7). Devnet only. No claim without a file, test or tx behind it; simulated parts labelled.
- Pitch video recorded length **≤ 1:59**, demo **≤ 2:59** (one pair of videos for Colosseum, KASE and this track).
- Submission order Oct 12: Colosseum (gives the project link) → Earn KASE → Earn KZ general. Same submitter; Earn profile location = Kazakhstan, unchanged for 21+ days.
- Repository `https://github.com/savvax/qupon` must be **public** before any Earn submission (today it answers 404 to the GitHub API = private).

## Review Focus
1. Pitch video 2:01 → ineligible for this track. Task 7 checks the duration with `ffprobe` before upload.
2. One teammate's Colosseum profile incomplete → "unfinished team profiles will not be eligible". Task 7 verifies every member, not just the leader.
3. Description pasted without links (no "Anything else" field here) → judges never see the technical overview or the demo report. Task 2 puts the three links inside the description.
4. Registration mechanism unknown (no link in the listing) → Task 1 asks the organizer today; default if unanswered by Oct 8 12:00: submit on Earn anyway and say so in the description's last line.
5. "Open source" claimed while the repo is private or has no LICENSE → Task 1 picks a license (default MIT), Task 7 flips visibility, Task 2 words the claim accordingly.

---

### Task 1 (human, **today Oct 6**): Organizer contact + team facts
**Files:** `HUMAN_TODO.md` (append the block below; answer inline).

- [ ] Send to https://t.me/d1asaur (RU is fine):
  > Привет, Диас! Мы — команда Qupon (корпоративные действия для токенизированных облигаций на Solana), участвуем в треке KASE × Superteam KZ и хотим подать проект также на общий трек Superteam Kazakhstan. Три вопроса: 1) как пройти регистрацию в программу до 8 октября — в листинге нет ссылки; 2) Demo Day 10 октября — формат (онлайн/оффлайн), время, длительность питча, нужны ли слайды; 3) подтвердите, что один проект можно подавать на оба казахстанских трека. Спасибо!
- [ ] Append to `HUMAN_TODO.md` and answer:
  ```
  - [ ] 2026-10-06 (plan5) Registration for the KZ general track: how/where, done? Default: Earn submission only; say so in the description.
  - [ ] 2026-10-06 (plan5) Demo Day Oct 10: format, time, slot length, slides needed? Default: 3-min pitch with docs/pitch.pdf + live site.
  - [ ] 2026-10-06 (plan5) Is any team member a student (4th prize) / is this the team's first Colosseum hackathon (5th prize)? Default: not claimed.
  - [ ] 2026-10-06 (plan5) Project X account? Default: none; the tweet goes into the Tweet Link field only.
  - [ ] 2026-10-06 (plan5) Repository license for going public. Default: MIT (adds LICENSE in Task 7).
  - [ ] 2026-10-06 (plan5) Team bios (one line per member: role, relevant experience) — needed by Task 2 and the pitch.
  ```

### Task 2 (claude): Final texts for the KZ general track
**Files:** `docs/SUBMISSION_FINAL.md` (replace section "Superteam Earn — Superteam Kazakhstan general track"), `docs/00-brief.md:79-81` (add form facts), `docs/07-submission.md:21` (checklist line), `docs/05-plan.md` (one row: "Plan 5 → `docs/superpowers/plans/2026-10-06-plan5-kz-general-track.md`").
**Depends on:** Task 1 answers (use the defaults if still open).

- [ ] Replace the stub ("Same fields as above; additionally…") with a per-field table, 11 rows, in this order: Link to Your Submission = Colosseum project page `<<FILL>>` · Tweet Link `<<FILL>>` · Project Name = `Qupon` · Project Description = block below · Project Github Link = `https://github.com/savvax/qupon` · Project Website = `https://qupon.185-216-25-91.sslip.io` · Project X Link = per Task 1 (default: leave empty) · Link to pitch deck or video = pitch video YouTube link `<<FILL>>` · "Did you submit…" = `Yes — submitted <<FILL: date>>, project page <<FILL: link>>` · Link to Colosseum project `<<FILL>>` · Link to Colosseum profile `<<FILL>>`.
- [ ] Description (≤ 300 words before the Team line; verify with `wc -w`); every number already appears in `docs/SUBMISSION_FINAL.md` or `README.md`:
  ```
  Qupon is the corporate-actions engine for tokenized bonds on Solana: identify holders, calculate entitlements, settle, and record the outcome on-chain.

  Problem. Tokenization solved issuance, not servicing. Every coupon, redemption and bondholder meeting is still a manual reconciliation between issuer, depository and brokers: the industry spends an estimated $58B a year on corporate-action processing and 46% of event data is handled by hand (Chainlink industry initiative; DTCC). On Solana, no RWA issuer emits standard corporate-action events.

  Product. A bond is a Token-2022 mint that only KYC-registered wallets can hold. For each action — coupon, redemption, early call, bondholder meeting with a terms change — the program pauses the mint at the record date, snapshots every holder, computes gross, tax and net per holder with Kazakhstan market conventions, pays from a pre-funded escrow in batches, burns redeemed units and emits an event for every transition. A Go registrar service reconciles the chain against its own calculation and exports ISO 20022 seev.031/seev.036 messages and KASE-style notices. Issuer, registrar and investor each have a cabinet in the browser (EN/RU, works on a phone) with one-click demo sign-in.

  Proof. One command runs the full lifecycle on devnet: 71 transactions, each linked in the repository; 52 program tests; verifiable build of program QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd.

  Ecosystem and market. Qupon is open source and gives Solana RWA issuers a standard event model for yield and redemption instead of ad-hoc distributions. First market: KASE's digital-asset platform (registered operator #001, built on Solana) and the Central Securities Depository — 765 listed corporate bond issues, 16.8 trillion KZT outstanding. Business model: a per-event fee or basis points on coupon flow, white-labelled for depositories and brokers.

  Team. <<FILL: one line per member — role, relevant experience>> <<FILL if true per Task 1: This is our first Colosseum hackathon.>>

  Technical overview: https://github.com/savvax/qupon/blob/main/docs/TECHNICAL_OVERVIEW.md · Demo run with an explorer link per transaction: https://github.com/savvax/qupon/blob/main/reports/demo-full.md · Live: https://qupon.185-216-25-91.sslip.io
  ```
  If Task 1 chose no license, replace "is open source" with "has a public repository". If registration could not be done, append: `We did not find the program registration form; this Earn submission is our registration.`
- [ ] `docs/00-brief.md` §general track: add "Earn form has no 'Anything else' field — links go in the description; 'Link to your pitch deck or Loom/video presentation' = pitch video; prizes 4–6 are best student / first-time / idea".
- [ ] `docs/07-submission.md:21`: replace with "General KZ track: registration asked via t.me/d1asaur (Task 1); pitch ≤ 1:59, demo ≤ 2:59; every member's Colosseum profile complete; links inside the description (no 'Anything else' field) — see SUBMISSION_FINAL.md".
- [ ] `reviewer` subagent on the diff: facts vs README/TECHNICAL_OVERVIEW/demo-full.md; no new claims. `make verify`; commit `docs(submission): KZ general track form blocks (plan 5)`.

### Task 3 (claude): Pitch script fits the track's wording and 2:00
**Files:** `docs/PITCH_SCRIPT.md`.
The spoken body is 253 words today (`grep -vE '^(#|$|Team →)' docs/PITCH_SCRIPT.md | sed 's/\[sources\?:[^]]*\]//g' | wc -w`) = 1:48 at 140 wpm. The track asks explicitly "why your team is suited to build it"; the current team line does not answer it.

- [ ] Replace §Team (0:00–0:15) with:
  ```
  We are a Kazakhstan team: <<FILL: N years of>> backend engineering in fintech and securities law — we have shipped the systems and read the regulations that corporate actions run on. For Colosseum's Crypto World's Fair, on the KASE × Superteam Kazakhstan track, we built Qupon.
  ```
- [ ] In §Problem drop the sentence "over forty-five percent of brokers have lost at least a million dollars to a single error." (keeps the net word count ≤ 260).
- [ ] Update the header line to "≤ 260 words at 140 wpm ≈ 1:52"; re-run the word-count command — expected ≤ 260.
- [ ] `make verify`; commit `docs(pitch): team-fit sentence, trim to ≤ 260 words (plan 5)`.

### Task 4 (claude): Demo Day deck as a file
**Files:** create `docs/pitch.pdf` (and `docs/pitch.pptx` if the generator gives one); `docs/PITCH_SLIDES.md` is the content source (10 slides, sources inline).
**Depends on:** Task 3 (same numbers).

- [ ] Generate the deck from `docs/PITCH_SLIDES.md` with the Slides artifact type (Artifact `quickstart`, intent `slides`) or the `anthropic-skills:pptx` skill (`python-pptx` is not installed locally — the skill brings its own tooling); 10 slides, dark-on-light, every number identical to the Markdown; last slide = "Ask: pilot with KASE and the CSD" + repo QR/URL + live URL.
- [ ] Export PDF ≤ 10 MB; open it once (`open docs/pitch.pdf`) and check slide 5 (demo frame) shows the 500 / 1,250 / 3,250 figures.
- [ ] Link the deck from `docs/07-submission.md` checklist ("Demo Day deck: docs/pitch.pdf"). `make verify`; commit `docs(pitch): Demo Day deck (plan 5)`.

### Task 5 (human, **Oct 10**): Demo Day
**Files:** create `reports/demo-day-2026-10-10.md`.

- [ ] Bring: `docs/pitch.pdf`, the live site signed in as demo issuer (`/login`) with a fresh series (`make demo-seed` the evening before; `ops/deploy-vps.sh --reindex`), `reports/demo-full.md` open in a tab.
- [ ] Pitch = `docs/PITCH_SCRIPT.md` spoken live; if the slot allows, announce one coupon with fast timing and show the explorer link.
- [ ] Within the hour, write `reports/demo-day-2026-10-10.md`:
  ```
  # Demo Day 2026-10-10 — judge feedback
  - Who judged / mentors present:
  - Questions asked (verbatim as far as possible):
  - Objections / weaknesses named:
  - What landed well:
  - Changes we commit to before Oct 12 (max 3):
  ```

### Task 6 (claude, Oct 10 evening): Fold Demo Day feedback into the texts
**Files:** `docs/SUBMISSION_FINAL.md`, `docs/PITCH_SCRIPT.md`, `README.md` (only if a judge's question exposes a missing fact).
**Depends on:** Task 5 report exists.

- [ ] For each line under "Changes we commit to": edit wording only where a file/test/tx backs the new statement; otherwise write the item into `tasks/todo/9NN-<slug>.md` for the product instead of claiming it.
- [ ] Re-run the pitch word count (≤ 260); `reviewer` on the diff; `make verify`; commit `docs(submission): Demo Day feedback (plan 5)`.

### Task 7 (human, **Oct 11**): Record, upload, make eligible
**Files:** `LICENSE` (if Task 1 chose one), `docs/SUBMISSION_FINAL.md` (`<<FILL>>` video links).

- [ ] Record the pitch from `docs/PITCH_SCRIPT.md` and the demo from `docs/VIDEO_SCRIPT.md` (+ `docs/demo.srt`). Check durations before upload:
  ```bash
  ffprobe -v error -show_entries format=duration -of csv=p=0 pitch.mp4   # must print < 119.5
  ffprobe -v error -show_entries format=duration -of csv=p=0 demo.mp4    # must print < 179.5
  ```
  Over the limit → cut, do not re-upload a long file.
- [ ] Upload both to YouTube as **unlisted**; titles "Qupon — pitch (2 min)" / "Qupon — demo (3 min)"; paste links into `docs/SUBMISSION_FINAL.md` (both Colosseum and Earn blocks).
- [ ] Colosseum: every member's profile complete (name, bio, location Kazakhstan, GitHub/X), leader has added all members to the project; Project Details, Media and Code, Team Profiles sections show complete.
- [ ] Repository public: add `LICENSE` (default MIT, copyright "Qupon team"), commit; then GitHub → Settings → Danger Zone → Change visibility → Public (or `gh repo edit savvax/qupon --visibility public --accept-visibility-change-consequences`). Verify: `curl -s -o /dev/null -w '%{http_code}\n' https://api.github.com/repos/savvax/qupon` prints `200`. Open https://github.com/savvax/qupon/blob/main/docs/TECHNICAL_OVERVIEW.md and `reports/demo-full.md` in a logged-out browser.
- [ ] Earn: submitter's profile location = Kazakhstan, wallet attached; log in and open the KZ track listing — the Submit button must be enabled (if disabled, the location rule bites; switch to another team member whose profile already says Kazakhstan).

### Task 8 (human, **Oct 12, 20:00–21:30 Almaty**): Submit
**Files:** `docs/SUBMISSION_FINAL.md` (replace every `<<FILL>>` with the real value), create `reports/submissions/` (screenshots).

- [ ] 20:00 Colosseum submitted → copy the project page URL and the profile URL into `docs/SUBMISSION_FINAL.md`.
- [ ] Post the tweet from `docs/SUBMISSION_FINAL.md` §Tweet; copy its link.
- [ ] Earn KASE track submitted (existing plan) → screenshot `reports/submissions/earn-kase.png`.
- [ ] Earn KZ general track: paste the 11 fields from the Task 2 table verbatim; the "Yes/No" answer includes the Colosseum link; submit → screenshot `reports/submissions/earn-kz.png`. Re-open the listing: the submission shows as yours and is still editable until the deadline.
- [ ] `git add docs/SUBMISSION_FINAL.md reports/submissions && git commit -m "docs(submission): final links and Earn confirmations"`.
- [ ] Buffer: anything wrong → edit the Earn submission before Oct 13 11:59 Almaty (editable until the deadline).

## Self-review
- Listing eligibility → Task 7 (videos, profiles, public repo) + Task 8 (Earn location). Registration/Demo Day → Tasks 1, 5. Form shape (no "Anything else", 11 fields) → Task 2. "Why your team" → Task 3. Judging criteria order → Task 2 description structure. Prize categories 4–6 → Task 1 question + Task 2 conditional line.
- Review Focus 1 → Task 7 ffprobe; 2 → Task 7 profiles; 3 → Task 2 links; 4 → Task 1 default + Task 2 last line; 5 → Tasks 1, 2, 7.
- Not in this plan (already in `docs/05-plan.md` / `docs/07-submission.md`): weekly update videos, Colosseum form content, KASE Earn block, logo.
