# Pitch script — Qupon (2:00, EN, ≤ 290 words at 140 wpm)

Team → problem → user → validation → vision. ~275 words.

## 0:00–0:15 Team
We are a Kazakhstan team — backend engineering in fintech and securities law. For the KASE × Superteam track we built Qupon.

## 0:15–0:45 Problem
Tokenization solved issuance. It did not solve servicing. Every coupon, redemption and bondholder meeting is still a manual, multi-party reconciliation. The industry spends about fifty-eight billion dollars a year on corporate actions; forty-six percent of event data is processed by hand; over forty-five percent of brokers have lost at least a million dollars to a single error. On Solana, no RWA issuer emits standardized corporate-action events. [sources: DTCC / ValueExchange figures as cited in docs/07-submission.md]

## 0:45–1:15 User + product
Our user is the registrar — Kazakhstan's Central Securities Depository or KASE as DFA operator #001. Qupon makes the corporate action a first-class on-chain object: pause the mint at record date, snapshot every holder, compute gross, tax and net with Kazakhstan conventions, settle from escrow, emit ISO 20022 confirmations — coupons, redemptions, bondholder voting, early calls.

## 1:15–1:35 Demo frame
In the demo, one hundred bonds across three investors: coupons of 500, 1,250 and 3,250 tenge paid atomically; a meeting raises the coupon from ten to twelve percent; the series redeems and burns. Every step has an explorer link on devnet. [sources: reports/demo-full.md]

## 1:35–1:50 Validation
Validation: this track is sponsored by the exchange itself. KASE launches tokenized debt in December 2026, and the CSD may now keep the register of tokenized holders — one pilot issue is the wedge. [source: docs/01-product.md]

## 1:50–2:00 Vision + ask
Qupon is the servicing layer every tokenized bond market needs. We are asking for a pilot with KASE and the CSD.
