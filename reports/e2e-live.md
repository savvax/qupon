# Live e2e — https://qupon.85-192-29-7.sslip.io

Run 2026-10-09T01:01:01.930Z · 0/6 passed · Playwright result: **failed**

| Test | Status | Duration |
| --- | --- | --- |
| @live demo sign-in reaches each cabinet | timedOut | 65.0s |
| @live public pages return 200 with no console errors | timedOut | 65.0s |
| @live legacy links redirect to the new pages (307/308) | failed | 10.6s |
| @live issuer creates a series on devnet and sees it in /issuer/series | failed | 76.1s |
| @live v2 public surfaces: platform section, sign-up path, network | timedOut | 65.0s |
| @live v2 back office: KYC queue, notifications bell, issuer organisation | timedOut | 65.0s |

## @live demo sign-in reaches each cabinet

```text
[31mTest timeout of 60000ms exceeded.[39m
```

## @live public pages return 200 with no console errors

```text
[31mTest timeout of 60000ms exceeded.[39m
```

## @live legacy links redirect to the new pages (307/308)

```text
TypeError: fetch failed
```

## @live issuer creates a series on devnet and sees it in /issuer/series

```text
Error: page.goto: net::ERR_CONNECTION_TIMED_OUT at https://qupon.85-192-29-7.sslip.io/login?next=/issuer
Call log:
[2m  - navigating to "https://qupon.85-192-29-7.sslip.io/login?next=/issuer", waiting until "load"[22m

```

## @live v2 public surfaces: platform section, sign-up path, network

```text
[31mTest timeout of 60000ms exceeded.[39m
```

## @live v2 back office: KYC queue, notifications bell, issuer organisation

```text
[31mTest timeout of 60000ms exceeded.[39m
```
