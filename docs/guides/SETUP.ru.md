# Qupon — установка и запуск

[English version](SETUP.en.md) · [Гайд по сценариям использования](USAGE.ru.md) · [README](../../README.md)

Этот гайд ведёт от чистой машины до полностью работающего продукта локально на Solana **devnet**:
Go-сервис регистратора (API) и веб-приложение на Next.js с кабинетами эмитента, регистратора, инвестора и
администратора. Все команды ниже выполнены на macOS (Apple Silicon) 12.10.2026 при написании гайда.

![make up — весь стек одной командой](img/setup-terminal.gif)

## Содержание

1. [Выберите режим](#1-выберите-режим)
2. [Что нужно заранее](#2-что-нужно-заранее)
3. [Код и инструменты](#3-код-и-инструменты)
4. [Настройка: `.env` и devnet-ключи](#4-настройка-env-и-devnet-ключи)
5. [Запуск всего одной командой: `make up`](#5-запуск-всего-одной-командой-make-up)
6. [Интерфейс без ключей: `MOCK=1 make up`](#6-интерфейс-без-ключей-mock1-make-up)
7. [Учётная запись администратора](#7-учётная-запись-администратора)
8. [Тесты и общий «гейт» качества](#8-тесты-и-общий-гейт-качества)
9. [Devnet-сценарии из терминала](#9-devnet-сценарии-из-терминала)
10. [Запуск частей по отдельности](#10-запуск-частей-по-отдельности)
11. [Развёртывание на сервере](#11-развёртывание-на-сервере)
12. [Если что-то не работает](#12-если-что-то-не-работает)

## 1. Выберите режим

| Режим | Что получаете | Что нужно |
| --- | --- | --- |
| **Живой сайт** | https://qupon.fun — всё уже развёрнуто на devnet | браузер (и Phantom для своего кошелька) |
| **`MOCK=1 make up`** | весь веб-интерфейс на фикстурах, без блокчейна и ключей | Node 22 + pnpm 9 |
| **`make up`** | настоящий продукт локально: API регистратора + веб, каждая кнопка шлёт реальные devnet-транзакции | полный набор инструментов, `.env`, пополненные devnet-ключи операторов |

Сама программа уже развёрнута на devnet (`QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd`) — разворачивать её
для запуска продукта **не нужно**.

## 2. Что нужно заранее

| Инструмент | Версия | Зачем |
| --- | --- | --- |
| macOS или Debian/Ubuntu | — | `ops/bootstrap.sh` поддерживает обе |
| Homebrew (macOS) | любая | системные пакеты |
| bash | ≥ 4 (`brew install bash` на macOS) | `ops/wallets.sh` |
| Node.js | 22 | веб, TS-клиент, CLI `qupon` |
| pnpm | 9 | установка workspace |
| Go | 1.26 | API регистратора |
| Rust + Agave (Solana CLI) | stable + 4.3.x | ключи, airdrop, сборка/тесты программы |
| Anchor | 1.2.x | только для `make verify` и работы с программой |
| jq | любая | скрипты |
| Phantom / Solflare / Backpack | расширение браузера | подписи от имени инвестора (переключите кошелёк на **devnet**) |

## 3. Код и инструменты

```bash
git clone https://github.com/savvax/qupon.git
cd qupon
bash ops/bootstrap.sh   # идемпотентно: Rust, Agave 4.3.0, Anchor 1.2.0 (avm), Node 22, pnpm 9, Go 1.26 (через mise, если есть)
make doctor             # версии всех инструментов, несоответствия помечены «!!»
pnpm install            # зависимости workspace (apps/web, clients/ts); `make up` сделает это сам при первом запуске
```

Вебу нужны только Node/pnpm; регистратору ещё Go, а исполнителем шагов у него служит TypeScript-CLI `qupon`
(`ops/qupon`), поэтому `clients/ts` тоже должен быть установлен.

`make help` показывает все цели:

```text
  up        ONE COMMAND: registrar API + web app on devnet with demo sign-in (MOCK=1: web on fixtures, no keys)
  verify    THE GATE: build + tests + lint for every existing component (no network)
  api       run the Go registrar locally (loads .env, defaults PROGRAM_ID from config/devnet.json; API_RPC_URL overrides RPC_URL)
  web       run the web app locally
  demo      run the full lifecycle on devnet (S0–S4), write reports/demo-full.md
  ...
```

## 4. Настройка: `.env` и devnet-ключи

### 4.1 `.env`

```bash
cp .env.example .env
```

Переменные, важные для запуска продукта:

| Переменная | Смысл |
| --- | --- |
| `RPC_URL` | devnet RPC для регистратора и CLI. Лучше ключевой (Helius и т. п.); `https://api.devnet.solana.com` работает, но ограничивает частоту |
| `QUPON_REGISTRAR_KEYPAIR`, `QUPON_ISSUER_KEYPAIR`, `QUPON_PAYING_AGENT_KEYPAIR` | пути к ключам операторов, которыми подписывает исполнитель регистратора |
| `QUPON_INVESTOR1..3_KEYPAIR`, `QUPON_OUTSIDER_KEYPAIR` | демо-инвесторы (кнопка «демо-инвестор» — кастодиальный кошелёк) и кошелёк без KYC |
| `QUPON_KYC_PROVIDER_KEYPAIR` | KYC-провайдер (СИМУЛЯЦИЯ), выпускающий аттестации Solana Attestation Service |
| `QUPON_SANDBOX_*` | лимиты публичной песочницы (`/sandbox/new`) и её кастодиальные держатели |

`.env` в `.gitignore`. Никогда не кладите туда mainnet-ключи.

### 4.2 Ключи

Ключи хранятся вне репозитория, в `~/.config/qupon/`.

**A — Вы в команде (или у вас есть devnet-ключи команды).** Скопируйте командные `~/.config/qupon/*.json` туда же.
`config/devnet.json` (в git) уже указывает на выпуски, минт tKZT и эти ключи операторов, поэтому `make up` сразу
работает и показывает те же данные, что https://qupon.fun.

**B — Свои новые ключи.**

```bash
bash ops/wallets.sh            # registrar, issuer, paying-agent, investor1..3, outsider → ~/.config/qupon; airdrop по 2 SOL
solana-keygen new --no-bip39-passphrase -s -o ~/.config/qupon/kyc-provider.json
```

Пополнение: `solana airdrop 2 <адрес> -u devnet` или https://faucet.solana.com (вход через GitHub даёт больше SOL),
USDC — https://faucet.circle.com. Регистратор и эмитент платят комиссии и ренту за каждый шаг оператора — держите
на каждом ≥ 2 SOL.

С новыми ключами существующие выпуски, минт tKZT и KYC-провайдер из `config/devnet.json` вам не принадлежат:
развёрнутая программа принимает KYC-аттестации только от SAS-credential демо-провайдера
(`programs/qupon_bonds/src/constants.rs`, `KYC_PROVIDER` в `clients/ts/src/lib/kyc.ts`). Полностью независимая
установка — это сборка и деплой своей программы (`make deploy`, ~3–5 SOL на регистраторе) с credential вашего
провайдера, `ops/qupon kyc:setup`, свой тестовый тенге (`clients/ts/scripts/create-tkzt.ts`) и новые выпуски через
мастер эмитента. Чтобы запустить и оценить продукт, используйте путь A, живой сайт или `MOCK=1`.

## 5. Запуск всего одной командой: `make up`

```bash
make up
```

Команда запускает [`ops/up.sh`](../../ops/up.sh), который:

1. ставит зависимости workspace, если нет `node_modules`;
2. поднимает **API регистратора** (`make api`) на `:8080`: вход в один клик для демо-ролей (`DEMO_LOGIN=1`),
   автопилот (`SCHEDULER=1`, `AUTOFUND=1` — песочница и витрина двигаются сами), встроенный RPC-шлюз
   (`RPC_GATEWAY=1` — общие, кэшируемые и дозированные вызовы devnet), скрытие старых тестовых выпусков из
   `config/hidden-series.txt`, SQLite-зеркало в `./.data/registrar.db`;
3. поднимает **веб** (`next dev`) на `:3000`, подключённый к этому API (без моков);
4. останавливает оба по `Ctrl-C`.

Откройте **http://localhost:3000** → **Sign in** → выберите **Issuer**, **Registrar** или **Investor**, либо
создайте аккаунт инвестора. Первое открытие страницы компилируется несколько секунд; при первом старте регистратор
индексирует все выпуски из devnet (в логе `indexed series … count`).

Настройки (переменные окружения):

| Переменная | По умолчанию | Пример |
| --- | --- | --- |
| `API_PORT` / `WEB_PORT` | `8080` / `3000` | `API_PORT=8180 WEB_PORT=3100 make up` |
| `API_RPC_URL` | `RPC_URL` из `.env` | `API_RPC_URL=https://api.devnet.solana.com make up` — если лимит ключевого RPC исчерпан |
| `QUPON_USERS` | — | служебные аккаунты, см. [§7](#7-учётная-запись-администратора) |
| `DEMO_LOGIN`, `SCHEDULER`, `AUTOFUND`, `RPC_GATEWAY` | `1` | `0` выключает функцию |
| `MOCK` | `0` | `MOCK=1 make up` — только веб на фикстурах |

Проверка:

```bash
curl -s localhost:8080/healthz          # {"status":"ok"}
curl -s localhost:8080/series | jq length
open http://localhost:3000/login
```

## 6. Интерфейс без ключей: `MOCK=1 make up`

```bash
MOCK=1 make up      # → http://localhost:3000, без регистратора, блокчейна и ключей
```

Все страницы работают на фикстурах (`apps/web/src/mocks`): удобно для работы над UI и первого знакомства. Кнопки
«успешны», но в блокчейн ничего не уходит. В этом же режиме работает набор Playwright-тестов:

```bash
cd apps/web && pnpm exec playwright install chromium && pnpm e2e
```

## 7. Учётная запись администратора

У админ-панели (`/admin`) нет демо-кнопки. Служебные аккаунты создаются при старте регистратора:

```bash
QUPON_USERS='[{"email":"admin@qupon.local","name":"Admin","role":"admin","password":"пароль-от-12-символов"}]' make up
```

Затем войдите на `/login` этой почтой и паролем. Роли: `issuer`, `registrar`, `admin`; пароль от 12 символов.
Аккаунты обновляются при каждом старте.

## 8. Тесты и общий «гейт» качества

```bash
make verify          # Rust-крейт + сборка Anchor + 116 тестов программы + clippy, TS typecheck/lint/tests, Go build/vet/tests, web typecheck/lint, линт OpenAPI
make test-program    # только тесты программы (LiteSVM)
make test-go         # только Go
make test-ts         # только TS
cd apps/web && pnpm test   # юнит-тесты веба (vitest)
```

`make verify` не ходит в сеть. `make secrets-scan` прогоняет gitleaks по истории.

## 9. Devnet-сценарии из терминала

Отправляют реальные devnet-транзакции ключами операторов и пишут отчёт, где каждая транзакция — ссылка:

```bash
make demo-coupon     # S1 купон                  → reports/demo-coupon.md
make demo            # S0–S4 полный жизненный цикл → reports/demo-full.md
make demo-trade      # вторичная сделка через Solana DvP + защита даты фиксации → reports/demo-trade.md
make demo-squads     # Squads 2-из-3 как платёжный агент → reports/demo-squads.md
make demo-seed       # новый выпуск с 3 держателями после KYC (10/25/65), без объявленных действий — свежие данные для UI
make demo-ui         # новый выпуск + объявленный купон, чтобы прокликать его в консоли
make seed-showcase   # четыре витринных выпуска, которые обслуживает автопилот
```

## 10. Запуск частей по отдельности

```bash
make api                                   # регистратор на :8080 (читает .env)
cd apps/web && API_MOCKING=disabled NEXT_PUBLIC_API_MOCKING=disabled \
  NEXT_PUBLIC_API_URL=http://localhost:8080 API_INTERNAL_URL=http://localhost:8080 pnpm dev
```

CLI, который запускает регистратор, можно использовать напрямую: `ops/qupon --help` (JSON в stdout).

## 11. Развёртывание на сервере

```bash
DEPLOY_RPC_URL=https://api.devnet.solana.com bash ops/deploy-vps.sh   # Docker Compose: регистратор + веб за HTTPS
```

Скрипт собирает образы на VPS и пишет серверные секреты (`registrar.env`, права 600). Подробнее:
[`deploy/vps/README.md`](../../deploy/vps/README.md) и раздел *Deployed* в README.

## 12. Если что-то не работает

| Симптом | Причина и решение |
| --- | --- |
| в логе регистратора `status code: 429` / `max usage reached` | лимит ключевого RPC исчерпан → `API_RPC_URL=https://api.devnet.solana.com make up` (или новый ключ в `.env`) |
| сразу после старта страницы пишут «Registrar API unavailable» или «Nothing to subscribe to» | веб даёт каждому чтению из регистратора 8 с; на публичном devnet первые чтения многих выпусков медленнее. Обновите страницу после индексации; скройте ненужные тестовые выпуски (Admin → Series → Hidden) — меньше выпусков, меньше чтений из сети |
| `rpc gateway: listen tcp 127.0.0.1:8899: bind: address already in use` | порт шлюза занят другим регистратором (или `solana-test-validator`) → остановите его или `RPC_GATEWAY_ADDR=127.0.0.1:8897 make up` |
| сайт потерял стили / показывает «голый» HTML | два `next dev` в одной папке делят `apps/web/.next`. Один `make up` на одну копию репозитория; восстановление: остановить, `rm -rf apps/web/.next`, запустить снова |
| порт 3000 или 8080 занят | `WEB_PORT=3100 API_PORT=8180 make up` |
| `needs bash >= 4` от `ops/wallets.sh` | `brew install bash` |
| кошелёк инвестора не подписывает | переключите кошелёк на devnet: Phantom → Settings → Developer Settings → **Testnet Mode** (Solana Devnet) |
| `make doctor` пишет `!! need Agave 4.3.x` | `bash ops/bootstrap.sh` (переключит `active_release`); нужно только для `make verify` и работы с программой |

Дальше: [все пользовательские сценарии с настоящим кошельком →](USAGE.ru.md)
