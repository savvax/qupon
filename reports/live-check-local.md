# Live check on devnet through the product UI (2026-10-06)

Local registrar (`make api`, `DEMO_LOGIN=1`) and web app (no mocks) against Solana devnet, driven in a browser with the
one-click demo identities. Series `QPNb1-tmg46q` (mint `WggU16duePpgouSdoTYhURtK34TFF7oHCWjn8pHxE6g`) from `make demo-seed`.

| Scenario | Steps (each a confirmed devnet transaction, shown as a toast with its explorer link) | Result |
|---|---|---|
| Coupon (issuer + registrar) | announce `5WKf…XdDe` → strike `GhoV…CQur` (3× TooEarly first, explained) → snapshot `4kx5…LB1j` → finalize `4koM…R9EH` → fund `3Fs2…5AQn` → pay `3gHA…mpyV` → complete `311Y…bSgm` | 500 / 1,250 / 3,250 ₸ paid to 10 / 25 / 65 bonds |
| Placement (demo investor) | subscribe 1 bond, DvP `4jWe…1Eem` | holding 65 → 66 |
| Onboarding (registrar) | SAS KYC attestation + registration of a fresh wallet `2DwX…8t7k` | investor listed with its attestation |
| Meeting, no votes | finalize `42Ft…H7j7` → count `oyT3…j3P3` | NoQuorum — "nothing to apply" |
| Meeting, approved | call `5aSS…oKXh` → strike `3TAY…izXY` → snapshot `2hsg…Lap5` → finalize `2Got…BXWk` → vote For (66 of 101 units) `5icr…EsYw` → count `52Gj…Q9ec` → apply `447E…SaRG` | coupon rate 10% → 12% on-chain |

Bugs this found, fixed and merged the same night: default CORP id > 16 bytes for long series names (9301), next-step
label after a full snapshot (9302), investor pages loading every series (9303), 3 s chain reads on every page (9304),
snapshot looping forever when an investor holds no bonds (9305).

Screenshots: `reports/ui/live-local/*.png`.
