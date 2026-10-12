# Qupon — user scenarios with a real wallet

[Русская версия](USAGE.ru.md) · [Setup guide](SETUP.en.md) · [README](../../README.md)

Every scenario in Qupon, step by step, for each role: public visitor, investor with their own wallet, issuer,
registrar and administrator. The screenshots and GIFs come from **one continuous run on Solana devnet on 2026-10-12**:
the local stack (`make up`, [setup guide](SETUP.en.md)) and the **real Phantom extension** (v26.33, imported devnet
key, Testnet Mode). Every "Confirm" in Phantom below signed a real devnet transaction; their links are in the
[appendix](#appendix-the-devnet-transactions-of-this-walkthrough).

The same screens are live at https://qupon.fun — the only difference is the address bar.

## Contents

1. [Before you start: a devnet wallet](#1-before-you-start-a-devnet-wallet)
2. [Roles and signing in](#2-roles-and-signing-in)
3. [Public pages (no sign-in)](#3-public-pages-no-sign-in)
4. [Connecting a wallet](#4-connecting-a-wallet)
5. [Issuer: issue a bond series](#5-issuer-issue-a-bond-series)
6. [Investor: account, wallet link, KYC application](#6-investor-account-wallet-link-kyc-application)
7. [Registrar: KYC review and on-chain registration](#7-registrar-kyc-review-and-on-chain-registration)
8. [Investor: test cash and subscription with Phantom](#8-investor-test-cash-and-subscription-with-phantom)
9. [Coupon: from announcement to payout](#9-coupon-from-announcement-to-payout)
10. [Bondholder meeting: vote with Phantom, change the terms](#10-bondholder-meeting-vote-with-phantom-change-the-terms)
11. [Investor: payout route (wallet or bank)](#11-investor-payout-route-wallet-or-bank)
12. [Investor: portfolio, statements, reports, notifications](#12-investor-portfolio-statements-reports-notifications)
13. [Redemption, early redemption, default and cure](#13-redemption-early-redemption-default-and-cure)
14. [Secondary trades (Solana DvP)](#14-secondary-trades-solana-dvp)
15. [Registrar back office](#15-registrar-back-office)
16. [Issuer organisation, team, documents](#16-issuer-organisation-team-documents)
17. [Administrator panel](#17-administrator-panel)
18. [The sandbox: a whole bond life in minutes](#18-the-sandbox-a-whole-bond-life-in-minutes)
19. [Language, mobile, help](#19-language-mobile-help)
- [Appendix: the devnet transactions of this walkthrough](#appendix-the-devnet-transactions-of-this-walkthrough)

---

## 1. Before you start: a devnet wallet

You sign as an investor with your own wallet: **Phantom**, **Solflare** or **Backpack** (any Wallet Standard
wallet). Qupon runs on devnet only, so:

1. Install the extension and create or import a wallet.
2. Switch it to devnet. Phantom: **Settings → Developer Settings → Testnet Mode** (network: Solana Devnet). The wallet
   then shows "You are currently in Testnet Mode".
3. Get devnet SOL for fees: https://faucet.solana.com (paste your address). ~0.1 SOL is plenty — the investor only pays
   fees and the rent of their own accounts.

Test tenge (tKZT and the other cash assets) comes from the faucet inside Qupon after KYC ([§8](#8-investor-test-cash-and-subscription-with-phantom)).

> **What you sign and why it is safe.** Qupon builds every transaction itself and sets an explicit compute budget;
> before sending, it compares the bytes your wallet signed with the bytes it built and refuses to send anything the
> wallet (or an extension) changed. Linking a wallet signs a text message only — no transaction, no fee.

## 2. Roles and signing in

Open **Sign in** (`/login`).

![Sign in](img/auth-01-login.png)

| Way in | Who | How |
| --- | --- | --- |
| **Demo → Issuer / Registrar / Investor** | anyone, one click | the demo accounts sign real devnet transactions with the operator keys; demo data is shared by every visitor. The demo investor is a custodial wallet (labelled so) |
| **Sign in with email** | investors who signed up, organisation staff, admins | email + password |
| **New investor? Create an account** | a new investor | `/signup`, see [§6](#6-investor-account-wallet-link-kyc-application) |

Each role lands in its cabinet: `/issuer`, `/registrar`, `/investor`, `/admin`. The header shows the network
(Devnet), the wallet chip, the language switch (EN / RU / KZ), the notification bell, the user and **Sign out**.

## 3. Public pages (no sign-in)

| Page | What it shows |
| --- | --- |
| `/` — landing | what Qupon does, the live devnet slot, "Try it in 3 minutes" (sandbox), "View as" switch: Public / Issuer / Registrar / Investor |
| `/bonds` — bond board | every serviced bond: face value, coupon, next coupon date, life stage (Issued, Voting, …) |
| `/bonds/<mint>` — bond page | terms, schedule, holders, every corporate action with its transactions, public documents, KASE data |
| `/proof/<mint>` — certificate | re-reads devnet **in your browser** and recomputes every check: snapshot fingerprint, per-holder maths, escrow in/out |
| `/holder/<address>` — holder dossier | positions, payouts and payout routes of any address — public lookup, no sign-in |
| `/learn` — how it works | a bond's life in plain language, one coupon in six steps |
| `/sandbox/new` — sandbox | your own bond on a compressed clock, [§18](#18-the-sandbox-a-whole-bond-life-in-minutes) |

![Bond board](img/pub-02-bonds.png)

The bond page of the series issued in this walkthrough (after the coupon and the meeting below):

![Bond page](img/pub-03-bond-page.png)

The proof page re-verifies the same series in the browser:

![Proof certificate](img/pub-05-proof.png)

Holder dossier and the "How it works" page:

![Holder dossier](img/pub-07-holder.png)

![How it works](img/pub-06-learn.png)

## 4. Connecting a wallet

![Connecting Phantom](img/wallet-connect.gif)

1. Click **Connect** in the header. With one wallet installed the button names it (**Connect Phantom**) and connects
   in one click; with several, a dialog lists the detected wallets; with none, it explains how to install one (desktop
   and mobile deep links) or lets you **view any address read-only**.
2. Phantom opens **Connect — localhost:3100 / qupon.fun**: check the site and the account, press **Connect**.

   ![Phantom connect](img/wal-11-phantom-connect.png)
3. The header now shows your address (`65SQ…YeGQ`). Its menu: **Copy address**, **View in Solana Explorer**,
   **Link to my Qupon account**, **Disconnect**.

   ![Wallet menu](img/wal-13-menu.png)

Connecting only shares your address. Signing happens later, per action, and every time Phantom shows you what you
sign.

## 5. Issuer: issue a bond series

Sign in as **Issuer** → **New series** (`/issuer/series/new`). Three steps: **Terms → Schedule → Review**.

![Issuance wizard](img/issue-series.gif)

1. **Terms.** Optionally **Import from KASE** (a listed ticker such as `TEBNb10` prefills ISIN, face value, rate,
   frequency, day count and dates from public kase.kz data) or **Paste a term sheet** (experimental: an LLM parses the
   text; you confirm every field). Then fill or check:
   - *Series name* (1–16 characters: letters, digits, dash) — `GUIDE-01`
   - *ISIN* (12 characters) — `KZ2C0GUIDE01`
   - *Paid in* — the cash asset: tKZT, KZTE-dev, dKZT (test tenge stand-ins) or USDC (Circle devnet)
   - *Face value* `1000` ₸, *Coupon rate* `10` %, *Coupons per year* semi-annual, *Day count* 30E/360
   - *Issue date* `2026-04-13`, *Maturity date* `2028-04-13`

   Meetings use the defaults: quorum 50% of bonds, approval ⅔ of votes cast (series configuration, not law).

   ![Terms](img/iss-03-wizard-terms.png)
2. **Schedule.** The coupon periods and the amount per bond, computed the same way the program will compute them
   (here 4 coupons × 50.00 ₸).

   ![Schedule](img/iss-04-wizard-schedule.png)
3. **Review → Issue on Solana.** Real devnet transactions: the Token-2022 bond mint (frozen-by-default accounts,
   permanent delegate, pausable, close authority, on-chain metadata) and the Series account with these terms.

   ![Issued](img/iss-06-series-issued.png)

**Open the series** shows its page: status, face value, coupon, next coupon, holders, and the tabs
*Corporate actions · Schedule · Holders · Documents*. The **Announce** and **Call a meeting** buttons live here.

![Series page](img/iss-07-series-page.png)

Next the registrar onboards investors; the issuer then announces the first coupon ([§9](#9-coupon-from-announcement-to-payout)).

## 6. Investor: account, wallet link, KYC application

### 6.1 Sign up

`/signup`: full name, email, password (10+ characters). After **Create account** you are signed in and `/investor`
shows the five-step devnet checklist: *Account created → Wallet linked → KYC approved → Test cash received → First
subscription*. The current step is highlighted with its button.

![Sign up](img/inv-01-signup-filled.png)

![Checklist](img/inv-03-checklist.png)

### 6.2 Link your wallet (sign a message)

**Link a wallet** opens **Verification** (`/investor/kyc`), step 1 *Wallet*. Connect Phantom, then
**Sign and link**: Phantom shows **Sign Message** with the text `Qupon wallet link / <email> / <address> / nonce:…`.
**Confirm** — no transaction, no fee. Coupons and redemptions will be paid to this wallet, and you sign subscriptions
and votes with it.

![Linking the wallet](img/wallet-link.gif)

![Sign message in Phantom](img/inv-05-phantom-sign-message.png)

### 6.3 KYC application

![KYC flow](img/kyc.gif)

1. **Documents** — the identity document is required, a proof of address speeds the review up. PDF, PNG or JPEG up to
   10 MB; the upload shows real progress. (Here: a specimen image.)
2. **Details** — full name as in the document, the wallet to register, investor type (individual / legal entity),
   tax residency (resident 0% / non-resident 15% withholding — SIMULATED rules) and the **issues to join**.

   ![Details](img/inv-08-kyc-details.png)
3. **Send for review** → the application is *Under review*; you get a notification with the decision.

   ![Submitted](img/inv-09-kyc-submitted.png)

The review is **SIMULATED** (no KYC vendor): a registrar decides by hand. The attestation and the registration that
follow are real devnet transactions.

## 7. Registrar: KYC review and on-chain registration

Sign in as **Registrar** → **KYC queue** (`/registrar/kyc`). Tabs: Under review / Approved / Rejected.

![KYC queue](img/reg-02-kyc-queue.png)

Open the application: applicant, wallet, type, residency, withholding, the uploaded documents (owner and registrar
access only) and the requested issues.

![Application](img/reg-03-kyc-application.png)

- **Approve** — the KYC provider (SIMULATED firm, real key) attests the wallet on the **Solana Attestation Service**,
  then the registrar registers it in every requested issue: one transaction per step, each shown with its link.
  Safe to retry.
- **Reject** — with a reason the investor sees.

![Approved](img/reg-05-kyc-approved.png)

On-chain this thaws the investor's bond account: bond mints are *frozen by default*, so only registered (KYC'd)
wallets can ever hold the bond. The investor's checklist now shows **KYC approved**.

![KYC done](img/inv-10-checklist-kyc-done.png)

The registrar can also onboard a wallet directly: **Investors → Onboard investor** (series, wallet address, type,
residency, withholding in basis points, attestation validity in days) — [§15](#15-registrar-back-office).

## 8. Investor: test cash and subscription with Phantom

### 8.1 Test cash

On the checklist, **Get tKZT** (or KZTE-dev, dKZT): the devnet faucet sends 100,000 units to your wallet, one request
per asset per hour.

![Faucet](img/inv-11-faucet.png)

### 8.2 Subscribe at par (DvP)

**Placement** (`/investor/placement`): pick the series, the number of units; the page shows the price per unit (at
par) and the total. **Subscribe (DvP)** builds one transaction in which your cash goes to the issuer and the bonds are
minted to you — atomically. Phantom shows **Confirm Transaction**; press **Confirm**.

![Subscription](img/subscribe.gif)

![Phantom confirm](img/inv-14-phantom-sign-subscribe.png)

A toast confirms *Subscribed: 10 × GUIDE-01* with the transaction link. The portfolio now holds the bonds, the next
coupon estimate and the payout calendar.

![Subscribed](img/inv-15-subscribed.png)

![Portfolio](img/inv-16-portfolio.png)

## 9. Coupon: from announcement to payout

The whole cycle in the UI: issuer announces → registrar (or anyone) runs each step → the holder is paid.

![Coupon cycle](img/coupon.gif)

### 9.1 Issuer: announce

Series page → **Announce**. Type: **Coupon** (the next scheduled one), **Redemption at maturity** (principal + final
coupon, bonds burned) or **Early redemption** (call early with accrued interest). Timing: **Fast demo** (record date in
2 minutes, payment in 3) or **Custom dates** (Almaty time, UTC+5). **Announce** sends the transaction; the series now
has one open corporate action (only one at a time).

![Announce](img/iss-08-announce-form.png)

### 9.2 Registrar: step by step

**Actions** → the action (`/registrar/actions/<pda>`). The page always names the **next step**, who may run it, and
when (a countdown to the record date). The timeline lists every step with its transaction; *Facts* show the CA id,
record and payment dates, the accrual period (here Apr 13 – Oct 13, 2026 · 180 days · 10%).

![Announced](img/reg-06-action-announced.png)

1. **Strike record date.** Pressed before the record date, the program refuses it and the page explains the on-chain
   error (*record date not reached*). Nothing is sent.

   ![Too early](img/reg-08-too-early.png)

   After the record date: the register is frozen for this action (transfer-hook gate on new series, the mint paused on
   older ones) and every holder is snapshotted on-chain.
2. **Finalize snapshot** — Σ snapshotted units must equal the mint supply; entitlements per holder appear (units,
   gross, tax, net).
3. **Fund escrow** — the issuer's (or paying agent's) cash goes to an escrow owned by the action; the action becomes
   *Funded* only when it covers net + tax (+ principal).
4. **Pay holders** — batches pay every holder's registered cash account (or route, [§11](#11-investor-payout-route-wallet-or-bank)).
5. **Complete** — reconciliation (everyone paid, totals match), the register resumes, the schedule advances; any
   leftover escrow is swept back to the issuer.

Steps are permissionless where the program allows it ("Who can do it: Anyone") — the program checks every rule.

![Completed](img/reg-15-completed.png)

On the completed action: *Where the money goes* (issuer → escrow → holders), the entitlements table with each
payment, **seev.031** (notification) and **seev.036** (per-holder confirmation) ISO 20022 files, the **KASE notice**
in EN / RU / KK (issued once the action completes), the **disclosure package** ZIP, **Submit to KASE (SIMULATED)**,
**Disclosure hash → Verify in browser** (re-hashes the served seev.031 and compares it with the sha256 anchored
on-chain), **Reconcile → Run** (re-reads the chain, checks the snapshot hash and totals) and the **KASE schedule
check** (kase.kz fixation date vs the on-chain record date, when the series has a KASE ticker).

The investor sees the payment: *Received to date*, *Last payment 500.00 ₸*, a **Statements** row with the seev.036
download.

![Statements](img/inv-21-statements.png)

## 10. Bondholder meeting: vote with Phantom, change the terms

![Meeting](img/meeting.gif)

1. **Issuer → Call a meeting**: the proposed coupon rate (here 10% → **12%**) and timing (Fast demo: record date in 2
   minutes, voting closes in 15; or custom dates).

   ![Call a meeting](img/iss-15-meeting-form.png)
2. **Registrar**: **Strike record date** → **Finalize snapshot**: each holder's voting weight is fixed at the record
   date. The status becomes *Voting open*.
3. **Investor → Meetings** (`/investor/meetings`): the proposal, the deadline, *Your weight: 10 units*, buttons
   **For / Against / Abstain**. Choose, confirm *Vote "For"?* (votes cannot be changed) → **Cast vote** → Phantom
   **Confirm**. The tally updates: *for 10 · against 0 · abstain 0 of 10 units*.

   ![Vote in Phantom](img/inv-18b-phantom-sign-vote.png)

   ![Voted](img/inv-19-voted.png)
4. **Registrar** after the deadline: **Count the votes** (quorum and approval checked on-chain: here turnout 100%,
   approved) → **Apply terms change**: the coupon rate on the series and in the token metadata becomes 12%. The
   registrar's signature stands in for the ARDFM registration (SIMULATED).

   ![Applied](img/mtg-reg2-2-apply-terms-change.png)

The next coupon is computed at the new rate: the portfolio shows *Coupon 12.00%*, *Next coupon 600.00 ₸* for 10 bonds.

## 11. Investor: payout route (wallet or bank)

Each holding card has **Payout route**: *Wallet* (default — coupons go to your wallet) or *Bank*. For Bank enter an
IBAN: it is hashed in your browser and only the sha256 goes on-chain. **Save route** → Phantom **Confirm**
(`set_payout_route`, signed by the holder). Bank-routed payouts go to the paying agent, which confirms the bank transfer
with `confirm_bank_payout` — the transfer itself is SIMULATED.

![Payout route](img/payout-route.gif)

## 12. Investor: portfolio, statements, reports, notifications

- **Portfolio** (`/investor`): KYC status, *Claimable now*, *Next coupon*, *Received to date*, a 12-month payout
  calendar (record and payment dates per series), holdings (units, coupon, maturity, dirty/clean value, accrued, YTM,
  next coupon estimate, last payment, payout route) and the entitlement history with each payment and vote.

  ![Portfolio after the coupon](img/inv-20-portfolio-paid.png)
- **Statements**: one row per payment with the ISO 20022 **seev.036** download and the transaction.
- **Reports** (`/investor/reports`): a payout statement for a period and an annual tax summary (CSV and a print/PDF
  view).
- **Notifications**: the bell in every cabinet and `/account/notifications` — coupon/redemption announced, meeting
  opened/finalised, payment received, KYC decision.
- **Account** (`/account`): profile, interface language, password, linked wallets.

## 13. Redemption, early redemption, default and cure

The same **Announce** dialog ([§9.1](#91-issuer-announce)) offers:

- **Redemption at maturity (REDM)** — principal + final coupon. After payment the next steps retire the units (burned
  via the permanent delegate) and close the series (supply 0 → metadata `REDEEMED`, mint closed).
- **Early redemption (MCAL)** — the bonds are called early with interest accrued so far.

Both follow the steps of [§9.2](#92-registrar-step-by-step). Devnet runs with every transaction linked:
[`reports/demo-full.md`](../../reports/demo-full.md) (S2 redemption, S4 MCAL).

**Default and cure**: if the escrow is not funded, one series day after the payment date anyone can record the
default on-chain (`declare_default`); late funding cures it and the record-date holders are paid. Try it in one click
in the sandbox ([§18](#18-the-sandbox-a-whole-bond-life-in-minutes)): **Skip funding** → **Fund and cure**.

## 14. Secondary trades (Solana DvP)

Full description of how DvP is used (primary placement and secondary trades, checks, record-date guard, accrued interest, a live devnet run): [DvP guide](DVP.en.md).

Trades between two registered investors of a series settle through the Solana Foundation's **DvP** program: bonds
against cash in one transaction.

1. **Registrar → Trades** (`/registrar/trades`) → **New trade**: seller, buyer, number of bonds (up to what the seller
   holds), cash amount at par → **Create trade**. One transaction creates the trade record and admits its bond escrow.
2. **Investors**: each funds their own leg (seller — bonds, buyer — cash) from **Portfolio → Open trades**; Phantom
   signs. The row shows each leg *in escrow* / *not funded*.
3. **Registrar → Settle** (both legs funded): bonds and cash move in one transaction. Or **Cancel**: both legs go back
   to their owners. An open trade **blocks the next record date** (`TradesInFlight`) until it is settled or cancelled,
   so a trade in flight can never cost a holder their coupon. Order matching and a trading venue are not part of Qupon.

![Trades](img/reg-23-trades.png)

Not executed in this walkthrough; a devnet run with every transaction linked: [`reports/demo-trade.md`](../../reports/demo-trade.md)
(`make demo-trade`). The sandbox has a one-click **Trade 5 bonds** with accrued interest.

## 15. Registrar back office

| Page | What it does |
| --- | --- |
| **Dashboard** | active series, open actions, registered investors, paid this month, alerts, the action pipeline |
| **Actions** | every coupon / redemption / meeting (Open · Completed · All); open one to run its next step |
| **Investors** | per series: owner, units, type, residency, tax, KYC attestation, status; **Suspend / Reinstate**; **Onboard investor** |
| **Trades** | secondary trades, [§14](#14-secondary-trades-solana-dvp) |
| **KYC queue** | [§7](#7-registrar-kyc-review-and-on-chain-registration) |
| **Reports** | the holder register of a series (CSV, printable view) |
| **Activity** | every on-chain event and every operator write, newest first |
| **Autopilot** | the scheduler's planned steps waiting for approval (when approval is required) and executed ones |

![Registrar dashboard](img/reg-20-dashboard.png)

![Investors](img/reg-22-investors.png)

![Onboard investor](img/reg-22b-onboard-dialog.png)

![Activity](img/reg-24-activity.png)

![Register report](img/reg-26-reports.png)

## 16. Issuer organisation, team, documents

- **Dashboard** (`/issuer`): active series, next coupon, escrow to fund, actions that need you.
- **Series**: every series of your organisation.
- **Organisation**: the company profile; it scopes which series the team can act on.
- **Team**: one-time invite links for colleagues.
- **Documents**: prospectuses and decisions, attached to a series and public on its bond page.

Demo accounts are shared by every visitor, so their organisation, team and documents are read-only; an organisation
account (created by an admin) can edit them.

![Issuer dashboard](img/iss-10-dashboard.png)

## 17. Administrator panel

Sign in with an admin account ([setup §7](SETUP.en.md#7-an-admin-account)) → `/admin`.

| Page | What it does |
| --- | --- |
| **Overview** | users, pending KYC, series, open actions, low-balance operators |
| **Users** | create, change roles, disable, one-time password-reset links |
| **Organisations** | issuer and registrar companies |
| **Series** | visibility (hide test series), featured on the board, KASE ticker link, owning organisation, autopilot funding |
| **Cash assets** | settlement tokens, each verified on-chain when added (mint, decimals, token program, authority warnings); enable/disable |
| **Digital tenge** | the dKZT custodian (SIMULATED): record deposits (mint) and withdrawals (burn) |
| **System** | RPC, operator wallet balances, executor, scheduler, ingest lag, kase.kz cache |
| **Audit log** | every operator write with filters and CSV export |
| **Network** | which cluster this deployment serves and its mainnet readiness |

![Admin overview](img/adm-01-overview.png)

![Series settings](img/adm-04-series.png)

![Cash assets](img/adm-05-assets.png)

![System health](img/adm-06-system.png)

## 18. The sandbox: a whole bond life in minutes

`/sandbox/new` (**Try it in 3 minutes**) issues **your own bond** on devnet on a demo clock (one bond day = 1 second, a
year ≈ 6 minutes) with three custodial investors. `/sandbox/new?wallet=<your address>` also places 5 bonds to your
wallet, so your Phantom gets real coupons. No sign-in.

![Sandbox](img/sandbox.gif)

The autopilot announces, strikes the record date, snapshots, funds and pays; the page explains each step and who may
push it ("Anyone" steps can be pushed by you). Your coupon can be **claimed with your wallet** before the autopilot pays
it. **Try it yourself** buttons: **Skip funding** (→ default) and **Fund and cure**, **Try the transfer** to a wallet
without KYC (refused by Token-2022 and the transfer hook), **Trade 5 bonds** with accrued interest. **View as**
switches between Issuer, Registrar and Investor views. Sandboxes live 24 hours.

## 19. Language, mobile, help

- **EN / RU / KZ** in the header switches the whole interface; dates and numbers follow the locale.
- Every page works on a phone (390 px) without horizontal scrolling.
- **?** in the header: restart the guided tour of the current cabinet, open *How it works*, open the glossary. Glossary
  terms in the text (DvP, record date, entitlement …) are underlined — click for a definition.

---

## Appendix: the devnet transactions of this walkthrough

| What | Link |
| --- | --- |
| Investor wallet (Phantom) | [`65SQ…YeGQ`](https://explorer.solana.com/address/65SQxyVwWu6ShbK5gRM8juDjHRkKg4RGHVmYQFCkYeGQ?cluster=devnet) |
| Series GUIDE-01 (bond mint) | [`GXP7…b8Sh`](https://explorer.solana.com/address/GXP7VBSvYMBuPinWrj3Z5DdabkdVV8Q4un2emLE7b8Sh?cluster=devnet) |
| Faucet: 100,000 tKZT to the investor | [`4UbZ…UrEj`](https://explorer.solana.com/tx/4UbZUyTroHtdyx8VQX1Yo85povHnUUe2Zs9DNK3KcVhyTLZWzwnwbPQEJCUH6GyTvb2peRXAc6SPTsoFg2gUUrEj?cluster=devnet) |
| Subscribe 10 bonds (signed in Phantom) | [`4RKE…KE9L`](https://explorer.solana.com/tx/4RKEBd9b8EGPhUFjMgSFjv7d7m69TBGbMLh1HqUDF28mt84ugmzDVWUrs3c2NAEqjcrs946Vvus5jVAT4r2KKE9L?cluster=devnet) |
| Coupon INTR #1 (500.00 ₸ paid) | [`CbQL…7LKV`](https://explorer.solana.com/address/CbQL9iQRUap6YiuRKjEGUg6H6CP44VXB8KEsN8Zj7LKV?cluster=devnet) |
| Meeting 10% → 12% | [`5FAi…ggAT`](https://explorer.solana.com/address/5FAivY434SX8cgy1jWo6PUrgG9aKktHiJ8MBY1XbggAT?cluster=devnet) |
| Vote For (signed in Phantom) | [`EdkX…CmH`](https://explorer.solana.com/tx/EdkX1iwJtQmbDCnG4uzy5g3b5N7N6mAsthvkxA8AC2xQHNosjRaQNgqRZSNjtnap1rZu915dpvhpSjZFpFssCmH?cluster=devnet) |
| Payout route → bank (signed in Phantom) | [`XVTk…odR`](https://explorer.solana.com/tx/XVTkqbvk5qipMHn8LvqZCzDqXKKD3ASqG7KMG99aZB35PGY9M18FkrT1y3FLeaHNeMXoCZFcCpgC9E5rEyERodR?cluster=devnet) |
| Sandbox SBX-JSGB5R (bond mint) | [`G4VD…CTq4`](https://explorer.solana.com/address/G4VDHsk6sMVzxJHLT5J7AEzpEAcV7DSyjULsqdt7CTq4?cluster=devnet) |

**Notes on the captures.** The red "Failed to simulate the results of this request" banner in some Phantom windows
appeared while Phantom's own preview service did not answer the capture browser; Phantom then labels the button
*Confirm (unsafe)*. The transactions themselves were fine (each link above is a successful transaction), and later
windows (e.g. the payout route) show Phantom's normal balance preview. Two wallet bugs this run found were fixed before
the captures were final: Phantom prepends its own compute-budget instructions when a transaction has none (Qupon's
byte-compare guard then refused it — wallet transactions now carry an explicit compute budget), and the subscription
read a Token-2022 account with the default base58 encoding that devnet refuses for accounts over 128 bytes.
