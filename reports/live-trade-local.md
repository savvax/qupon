# Secondary trade through the registrar API — local registrar + deployed program (2026-10-07)

Local `make api` (Go registrar, demo sign-in on) against the deployed devnet program, series `QPNb1-tmiavs`
(mint `HoJ58jwtK1hDnbS2xSSh2BsRXV24dzCstxTNy227rXHb`, fresh `make demo-seed`: holders 65 / 25 / 10). The same calls
the registrar console makes, sent as the demo registrar session.

| Step | Call | Result |
|---|---|---|
| Create + admit | `POST /registrar/series/{mint}/trades` {seller investor3, buyer investor1, units 1} | [tx](https://explorer.solana.com/tx/5osSsYx5sRdFhoFFB1Nc8RMMGhiddskSxBf9MEkV1tY8sdUu6jMXQmcakuo6NKjRYcbTd3Edk4rMVKCUb5UfRtuJ?cluster=devnet) · trade `BzhYyRMb…`, `openTrades: 1`, status `awaiting_funding` |
| Fund seller leg (demo) | `POST /demo/investor/series/{mint}/trades/{swapDvp}/fund` {side seller} | [tx](https://explorer.solana.com/tx/WKfmxruuNdMCCuHrWYv4bJ764nSVpNeh4XKDUfVjH7xo2gQFZDkWPKbxc441GVpXqqQNXLJ3ubZvjoFMP4TLZCH?cluster=devnet) |
| Fund buyer leg (demo) | same, {side buyer} | [tx](https://explorer.solana.com/tx/5kfPE47QNt7yvAwDjLy7PHsyoEAS8ur5VosqbN39n2VxfZeV87aeho1WtgttAEBfAKAT9gN9wpVhe3fiqNWHL9MG?cluster=devnet) · status `ready`, funded 1 bond / 1,000.00 tKZT |
| Settle + release | `POST /registrar/series/{mint}/trades/{swapDvp}/settle` | [tx](https://explorer.solana.com/tx/JPmkgFhCvrMf18359GJrEDmgnWSwJf65JHNAyQWhZnacrLyyd9wzpmHKeKQ9g2jcP3bB4nBMoAzt7F7MwmNWgji?cluster=devnet) · trades `[]`, `openTrades: 0`, holders 64 / 25 / 11 |
| Settle again | same | `404 trade_not_found` |
| Investor session creates a trade | `POST /registrar/series/{mint}/trades` as demo investor | `403 forbidden` |
| Ingest | registrar log | `TradeAdmitted` and `TradeReleased` events ingested |

Not covered here: the console pages themselves (Playwright in mock mode, `apps/web/e2e/trades.spec.ts`) and the wallet
path of `trade:fund`; the deployed site was unreachable (ports 22/443 filtered) when this ran.
