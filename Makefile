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

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-16s %s\n", $$1, $$2}'

doctor: ## print toolchain versions and check pins
	@bash ops/doctor.sh

verify: ## THE GATE: build + tests + lint for every existing component (no network)
	@set -e; \
	if [ -n "$(HAS_CRATE)" ]; then echo "== crates/entitlement"; (cd crates/entitlement && cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test --quiet); fi; \
	if [ -n "$(HAS_PROGRAM)" ]; then echo "== programs/qupon_bonds"; anchor build && cargo fmt --all -- --check && cargo clippy -p qupon_bonds --all-targets -- -D warnings && cargo test -p qupon_bonds --quiet; fi; \
	if [ -n "$(HAS_TS)" ]; then echo "== clients/ts"; (cd clients/ts && pnpm install --frozen-lockfile --silent && pnpm typecheck && pnpm lint && pnpm test); fi; \
	if [ -n "$(HAS_GO)" ]; then echo "== services/registrar"; (cd services/registrar && go build ./... && go vet ./... && go test ./... && (command -v golangci-lint >/dev/null && golangci-lint run ./... || echo "golangci-lint not installed (skipped)")); fi; \
	if [ -n "$(HAS_WEB)" ]; then echo "== apps/web"; (cd apps/web && pnpm install --frozen-lockfile --silent && pnpm typecheck && pnpm lint); fi; \
	echo "VERIFY OK"

build: ## anchor build + ts build + go build
	@[ -n "$(HAS_PROGRAM)" ] && anchor build || true
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

api: ## run the Go registrar locally
	cd services/registrar && go run ./cmd/registrar

web: ## run the web app locally
	cd apps/web && pnpm dev

status: ## task board
	@bash ops/status.sh

.PHONY: help doctor verify build test-program test-go test-ts client deploy demo-coupon demo api web status
