# KASE-style notice golden texts

Target outputs for the notice generator (`internal/notice`, task 026). Format per `docs/03-domain.md` §7, modeled on real KASE headlines.

Files: `{intr,redm,mcal,pcal,bmet,chan,default,cure}.{en,ru,kk}.golden.txt` — interest payment (INTR), redemption at maturity (REDM), full early redemption (MCAL), partial early redemption / amortization (PCAL), bondholder meeting result (BMET), terms change (CHAN), default declaration (plan 15 D4) and cure. en/ru since task 026; pcal/bmet/default/cure and the Kazakh (kk) set since task 1523.

## Template variables

| Variable | Example used | Notes |
|---|---|---|
| `{payment_date}` | 2027-01-03 | settlement date, ISO 8601 |
| `{issuer_name}` | Qupon Issuer Demo | from series terms |
| `{n}{suffix}` / `{n}-й` | 1st / 1-й | coupon sequence number (ordinal with EN suffix) |
| `{isin}` | KZT0000000000 | placeholder |
| `{ticker}` | QPON | |
| `{total_net}` | 5,000 | total net paid, minor units formatted with thousands separators |
| `{ccy}` | KZT | currency code |
| `{holders}` | 3 | holder count at snapshot |
| `{record_date}` | 2026-12-27 | start of day, Almaty |
| `{tx_links}` | https://explorer.solana.com/tx/\<TX_SIGNATURE\>?cluster=devnet | placeholder; one or more space-separated explorer links |
| `{next_coupon_date}` | 2027-07-03 | INTR only |
| `{old}% → {new}%` | 10.00% → 12.00% | CHAN only |
| `{days}` | 47 | MCAL accrued period, 30/360 |
| `{accrued_net}` | 1,874.20 | MCAL, net of tax (10% withholding per vector mcal_accrued_47d: 20,824 gross/10 units → 2,082.4 gross per unit, 1,874.2 net per unit) |
| `{meeting_date}` / `{approved}` | 2027-01-15 / true | BMET: when the meeting concluded and whether the proposal passed (approved ⇒ `{effective_date}` follows) |
| `{due_date}` / `{default_date}` / `{cure_date}` | 2027-01-05 / 2027-01-10 / 2027-01-12 | DEFAULT/CURE: the missed payment, the declaration and the cure (on-chain `defaulted_at`/`cured_at`) |

Numbers follow the brief: 10/25/65 units × 1,000 KZT face, 10% semi-annual → per-unit coupons of 500/1,250/3,250 KZT (totals 5,000/31,250/32,500) and 10,000 KZT principal per unit (100,000 for 10 units). XSD validation of ISO messages is out of scope; these are plain-text notices.
