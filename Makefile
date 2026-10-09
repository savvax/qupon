# Qupon — single gate for humans, agents and the orchestrator.
# Targets that touch the network/keys are NOT part of `verify`.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
export PATH := $(HOME)/.local/share/mise/shims:$(HOME)/.local/share/solana/install/active_release/bin:$(HOME)/.cargo/bin:$(HOME)/go/bin:$(PATH)

HAS_PROGRAM := $(wildcard programs/qupon_bonds/Cargo.toml)
HAS_CRATE   := $(wildcard crates/entitlement/Cargo.toml)
HAS_GO      := $(wildcard services/registrar/go.mod)
HAS_TS      := $(wildcard clients/ts/package.json)
HAS_WEB     := $(wildcard apps/web/package.json)
# Stable program id across worktrees/clones: the deploy keypair lives outside git (ops/deploy.sh, task 014).
PROGRAM_KEYPAIR ?= $(HOME)/.config/qupon/program-keypair.json
# The avm proxy (`anchor` → avm) takes a global flock for every invocation, so parallel workers' `anchor build`s ran
# strictly one at a time (2026-10-10: 11 queued, verify took 30–50 min). Call the pinned binary directly when present.
ANCHOR ?= $(firstword $(wildcard $(HOME)/.avm/bin/anchor-1.2.0) anchor)

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-16s %s\n", $$1, $$2}'

program-keypair: ## copy the deploy keypair into target/deploy so anchor build keeps the declared program id
	@if [ -f "$(PROGRAM_KEYPAIR)" ] && [ ! -f target/deploy/qupon_bonds-keypair.json ]; then mkdir -p target/deploy && cp "$(PROGRAM_KEYPAIR)" target/deploy/qupon_bonds-keypair.json; fi

fixtures: ## refresh the Token-2022 and Solana DvP binaries in programs/qupon_bonds/tests/fixtures from devnet (committed; LiteSVM loads them)
	solana program dump TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb programs/qupon_bonds/tests/fixtures/spl_token_2022.so -u devnet
	solana program dump dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq programs/qupon_bonds/tests/fixtures/dvp_swap.so -u devnet

doctor: ## print toolchain versions and check pins
	@bash ops/doctor.sh

verify: ## THE GATE: build + tests + lint for every existing component (no network)
	@set -e; \
	if [ -n "$(HAS_CRATE)" ]; then echo "== crates/entitlement"; (cd crates/entitlement && cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test --quiet); fi; \
	if [ -n "$(HAS_PROGRAM)" ]; then echo "== programs/qupon_bonds"; $(MAKE) -s program-keypair; ($(ANCHOR) build && cargo fmt --all -- --check && cargo clippy -p qupon_bonds --all-targets -- -D warnings && cargo test -p qupon_bonds --quiet); fi; \
	if [ -n "$(HAS_TS)" ]; then echo "== clients/ts"; (cd clients/ts && pnpm install --frozen-lockfile --silent && pnpm typecheck && pnpm lint && pnpm test); fi; \
	if [ -n "$(HAS_GO)" ]; then echo "== services/registrar"; (cd services/registrar && go build ./... && go vet ./... && go test ./... && (command -v golangci-lint >/dev/null && golangci-lint run ./... || echo "golangci-lint not installed (skipped)")); fi; \
	if [ -n "$(HAS_WEB)" ]; then echo "== apps/web"; (cd apps/web && pnpm install --frozen-lockfile --silent && pnpm typecheck && pnpm lint); fi; \
	if [ -f services/registrar/openapi.yaml ]; then echo "== openapi"; npx --yes @redocly/cli@2.62.0 lint services/registrar/openapi.yaml >/dev/null; fi; \
	echo "VERIFY OK"

build: ## anchor build + ts build + go build
	@[ -n "$(HAS_PROGRAM)" ] && $(ANCHOR) build || true
	@[ -n "$(HAS_TS)" ] && (cd clients/ts && pnpm build) || true
	@[ -n "$(HAS_GO)" ] && (cd services/registrar && go build ./...) || true

test-program: ## LiteSVM tests only
	cargo test -p qupon_bonds

test-go: ## Go tests only
	cd services/registrar && go test ./...

test-ts: ## TS tests only
	cd clients/ts && pnpm test

client: ## regenerate the Codama client from the IDL
	cd clients/ts && pnpm codama

deploy: ## deploy program to devnet (needs funded registrar keypair; updates config/devnet.json)
	bash ops/deploy.sh

demo-coupon: ## run the coupon scenario on devnet, write reports/demo-coupon.md
	cd clients/ts && pnpm tsx scripts/demo-coupon.ts

demo: ## run the full lifecycle on devnet (S0–S4), write reports/demo-full.md
	cd clients/ts && pnpm tsx scripts/demo-full.ts

demo-plan15: ## devnet: every plan-15 instruction on a DEMO-clock series, write reports/demo-plan15.md
	cd clients/ts && pnpm tsx scripts/demo-plan15.ts

demo-seed: ## devnet: fresh series with 3 KYC'd holders (10/25/65), nothing announced — fresh data for the live demo
	cd clients/ts && DEMO_SEED=1 pnpm tsx scripts/demo-full.ts

demo-ui: ## devnet: fresh series + announced coupon for clicking through the console (prints the API command)
	cd clients/ts && DEMO_UI=1 pnpm tsx scripts/demo-full.ts

demo-trade: ## devnet: fresh series, a secondary trade settled by Solana DvP, the record-date guard, a coupon — writes reports/demo-trade.md
	cd clients/ts && DEMO_TRADE=1 pnpm tsx scripts/demo-full.ts

demo-squads: ## devnet: a 2-of-3 Squads vault is the paying agent and funds a coupon (fund_action via proposal/approve/execute) — writes reports/demo-squads.md
	cd clients/ts && pnpm tsx scripts/demo-squads.ts

api: ## run the Go registrar locally (loads .env, defaults PROGRAM_ID from config/devnet.json)
	@if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
	PROGRAM_ID=$${PROGRAM_ID:-$$(jq -r .programId config/devnet.json)}; \
	QUPON_CLI=$${QUPON_CLI:-$$PWD/ops/qupon}; QUPON_CONFIG=$${QUPON_CONFIG:-$$PWD/config/devnet.json}; \
	EXEC_CONFIG_PATH=$${EXEC_CONFIG_PATH:-/tmp/qupon-exec-config.json}; \
	cd services/registrar && PROGRAM_ID="$$PROGRAM_ID" QUPON_CLI="$$QUPON_CLI" QUPON_CONFIG="$$QUPON_CONFIG" EXEC_CONFIG_PATH="$$EXEC_CONFIG_PATH" go run ./cmd/registrar

openapi-lint: ## lint the registrar OpenAPI spec
	npx --yes @redocly/cli@2.62.0 lint services/registrar/openapi.yaml

web: ## run the web app locally
	cd apps/web && pnpm dev

status: ## task board
	@bash ops/status.sh

secrets-scan: ## gitleaks full-history secret scan (same as the CI secrets job; not part of verify)
	@if command -v gitleaks >/dev/null 2>&1; then \
		gitleaks git --redact --config .gitleaks.toml -v .; \
	else \
		echo "gitleaks not found. Install: brew install gitleaks (macOS),"; \
		echo "or a pinned binary from https://github.com/gitleaks/gitleaks/releases (CI uses v8.24.2)."; \
		exit 1; \
	fi

.PHONY: help program-keypair fixtures doctor verify build test-program test-go test-ts client deploy demo-coupon demo demo-plan15 demo-ui demo-trade demo-squads api web status secrets-scan
