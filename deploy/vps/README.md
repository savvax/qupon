# # VPS deployment notes

## Deploy

```bash
ops/deploy-vps.sh                                                              # primary: user@185.216.25.91 (compose.shared.yml, /home/user/qupon)
COMPOSE=compose.yml QUPON_DIR=/opt/qupon ops/deploy-vps.sh root@85.192.29.7   # old box, kept as fallback
```

`QUPON_HOST` overrides the `<ip-dashes>.sslip.io` hostname derivation on either box.

## Watchdog

`ops/watchdog.sh` is a cron-able uptime check: PUBLIC_URL (web app), registrar API_URL
`/healthz`, `/admin/system` (needs `ADMIN_TOKEN`; checks RPC ok and flags any config
wallet reported `low`), and RPC `getHealth`. Set `PUBLIC_URL` (e.g. `https://qupon.<host>`),
`API_URL` (e.g. `https://api.<host>`), `ADMIN_TOKEN`, `RPC_URL` in `.env`; on failure it posts to Telegram if `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`
are set, otherwise prints. Exit code 1 on any failed check. Example cron:

```
*/5 * * * * cd /srv/qupon && bash ops/watchdog.sh >> /var/log/qupon-watchdog.log 2>&1
```

Test without alerting: `bash ops/watchdog.sh --dry-run`.
