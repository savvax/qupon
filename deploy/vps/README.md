# # VPS deployment notes

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
