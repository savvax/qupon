# Plan 2 — Back-office API (auth, roles, audit, write endpoints) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every issuer and registrar operation (and the demo investor's) is an authenticated, role-checked, audited HTTP endpoint on the Go registrar, executed through the existing qupon CLI executor, so the web can drop the terminal.

**Architecture:** New SQLite tables (users, sessions, audit, series_registry); `internal/auth` (bcrypt, hashed session tokens, per-email rate limit, demo sign-in gate); RBAC middleware on write routes; a writable executor config regenerated from base config + registry; new CLI commands `series:create` and `investor:reinstate`. `ADVANCE_TOKEN` is retired in favour of sessions.

**Tech Stack:** Go 1.26, chi, modernc sqlite, golang.org/x/crypto/bcrypt; TypeScript CLI (@solana/kit 8, commander); Docker entrypoint.

**Spec:** `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (sections 4, 6, 7).

## Global Constraints

- Roles exactly: `issuer`, `registrar`, `investor_demo`, `admin`. Reads stay public; every write requires a session with an allowed role.
- bcrypt cost 12; session token = 32 random bytes (base64url), stored only as sha256 hex; TTL 12 h.
- Login rate limit: 5 attempts per email per minute (spoof-proof key; the API is also reachable directly).
- Demo sign-in (`POST /auth/demo`) only when `DEMO_LOGIN=1`.
- Every write appends one audit row (user, role, route, params JSON, ok, detail, signatures).
- Error body `{error, code, onchainError?}`; CLI on-chain failures → 409 with the Anchor name in `onchainError`.
- Program unchanged. Go: `go vet`, `golangci-lint`, table tests, `%w` wrapping, context everywhere.
- `make verify` green after every task; openapi.yaml (both copies) updated in the task that adds a route.

## Review Focus

1. Two operators double-click "Fund escrow": the second call must not move funds twice → CLI `action:fund` is idempotent (fills only the shortfall); test the endpoint called twice returns `skipped: true` the second time (Task 6).
2. An expired or deleted session reused on a write → 401, never a 500 (Task 2 + Task 6 tests).
3. Wrong role (issuer calling a registrar route, demo investor calling issuer routes) → 403 with no CLI execution (Task 3 matrix test).
4. Malformed input (ISIN not 12 chars, rate > 100 %, maturity before issue, unknown kind, non-base58 wallet) → 400 before any CLI run (Tasks 5–7 validation tests).
5. Creating a series whose name already exists → 409 `series_exists`, nothing minted (Task 5 test).

---

## File Structure

```
services/registrar/
  migrations/005_backoffice.sql           # users, sessions, audit, series_registry
  internal/store/users.go, audit.go, registry.go (+ _test.go)
  internal/auth/password.go, token.go, limiter.go, service.go, context.go (+ _test.go)
  internal/execconfig/execconfig.go (+ _test.go)   # writes the CLI config the executor uses
  internal/api/auth.go        # /auth/login, /auth/demo, /auth/logout, /me
  internal/api/rbac.go        # requireRole middleware + audit helper
  internal/api/issuer.go      # /issuer/* writes
  internal/api/registrar.go   # /registrar/* writes (incl. advance; old /actions/{pda}/advance kept for registrar sessions)
  internal/api/demo.go        # /demo/investor/*
  internal/executor/executor.go           # Run sets QUPON_CONFIG for the child
  internal/config/config.go               # DEMO_LOGIN, QUPON_USERS, EXEC_CONFIG_PATH; drop ADVANCE_TOKEN
  cmd/registrar/main.go                   # wiring, demo/user seeding, registry seeding from chain
  entrypoint.sh                           # + KYC provider and demo investor keypairs
clients/ts/
  src/lib/bondMintFlow.ts                 # create-bond-mint core, shared by script + series:create
  src/commands/seriesCreate.ts            # series:create
  src/commands/investor.ts                # + investor:reinstate
  scripts/create-bond-mint.ts             # thin wrapper over bondMintFlow
```

---

### Task 1: Migration + store (users, sessions, audit, registry)

**Files:**
- Create: `services/registrar/migrations/005_backoffice.sql`, `internal/store/users.go`, `internal/store/audit.go`, `internal/store/registry.go`, `internal/store/backoffice_test.go`

**Interfaces:**
- Produces (package `store`):
  - `type User struct { ID int64; Email, Name, Role string; IsDemo bool }`
  - `var ErrNoUser, ErrNoSession = errors.New("no such user"), errors.New("no valid session")`
  - `func (s *Store) UpsertUser(ctx context.Context, u User, passwordHash string) (int64, error)`
  - `func (s *Store) UserByEmail(ctx context.Context, email string) (User, string, error)` (user, hash)
  - `func (s *Store) DemoUser(ctx context.Context, role string) (User, error)`
  - `func (s *Store) CreateSession(ctx context.Context, tokenHash string, userID, expiresAt int64) error`
  - `func (s *Store) SessionUser(ctx context.Context, tokenHash string, now int64) (User, error)`
  - `func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error`
  - `type AuditEntry struct { ID, Ts, UserID int64; Role, Route string; Params json.RawMessage; OK bool; Detail string; Signatures []string }`
  - `func (s *Store) InsertAudit(ctx context.Context, e AuditEntry) error`; `func (s *Store) ListAudit(ctx context.Context, limit int) ([]AuditEntry, error)` (newest first)
  - `type RegistryRow struct { Name, Mint string; Terms json.RawMessage }`
  - `var ErrSeriesExists = errors.New("series name already registered")`
  - `func (s *Store) InsertRegistry(ctx context.Context, r RegistryRow) error` (ErrSeriesExists on duplicate name), `func (s *Store) UpsertRegistry(...) error`, `func (s *Store) ListRegistry(ctx context.Context) ([]RegistryRow, error)`

- [ ] **Step 1: migration**

```sql
-- 005_backoffice.sql — back-office users, sessions, audit trail, series registry (product spec §4)
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('issuer', 'registrar', 'investor_demo', 'admin')),
    password_hash TEXT NOT NULL,
    is_demo       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS audit (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    role       TEXT NOT NULL,
    route      TEXT NOT NULL,
    params     TEXT NOT NULL,
    ok         INTEGER NOT NULL,
    detail     TEXT NOT NULL,
    signatures TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS series_registry (
    name       TEXT PRIMARY KEY,
    mint       TEXT NOT NULL,
    terms      TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

- [ ] **Step 2: failing tests**

```go
// internal/store/backoffice_test.go
package store

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
)

func openT(t *testing.T) *Store {
	t.Helper()
	st, err := Open(t.Context(), filepath.Join(t.TempDir(), "bo.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st
}

func TestUsersAndSessions(t *testing.T) {
	st := openT(t)
	id, err := st.UpsertUser(t.Context(), User{Email: "i@q.kz", Name: "Issuer", Role: "issuer"}, "hash1")
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	u, hash, err := st.UserByEmail(t.Context(), "i@q.kz")
	if err != nil || u.ID != id || hash != "hash1" || u.Role != "issuer" {
		t.Fatalf("by email = %+v %q %v", u, hash, err)
	}
	if err := st.CreateSession(t.Context(), "th", id, 100); err != nil {
		t.Fatalf("session: %v", err)
	}
	if got, err := st.SessionUser(t.Context(), "th", 99); err != nil || got.ID != id {
		t.Fatalf("session user = %+v %v", got, err)
	}
	if _, err := st.SessionUser(t.Context(), "th", 100); !errors.Is(err, ErrNoSession) {
		t.Fatalf("expired session err = %v, want ErrNoSession", err)
	}
	if err := st.DeleteSession(t.Context(), "th"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, _, err := st.UserByEmail(t.Context(), "nobody@q.kz"); !errors.Is(err, ErrNoUser) {
		t.Fatalf("missing user err = %v", err)
	}
}

func TestAuditAndRegistry(t *testing.T) {
	st := openT(t)
	e := AuditEntry{Ts: 1, UserID: 7, Role: "registrar", Route: "POST /registrar/investors", Params: json.RawMessage(`{"a":1}`), OK: true, Detail: "ok", Signatures: []string{"s1"}}
	if err := st.InsertAudit(t.Context(), e); err != nil {
		t.Fatalf("audit: %v", err)
	}
	got, err := st.ListAudit(t.Context(), 10)
	if err != nil || len(got) != 1 || got[0].Signatures[0] != "s1" || !got[0].OK {
		t.Fatalf("list audit = %+v %v", got, err)
	}
	r := RegistryRow{Name: "QPN2", Mint: "M", Terms: json.RawMessage(`{"isin":"KZ2C0QUPON02"}`)}
	if err := st.InsertRegistry(t.Context(), r); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := st.InsertRegistry(t.Context(), r); !errors.Is(err, ErrSeriesExists) {
		t.Fatalf("duplicate err = %v, want ErrSeriesExists", err)
	}
	rows, err := st.ListRegistry(t.Context())
	if err != nil || len(rows) != 1 || rows[0].Mint != "M" {
		t.Fatalf("list registry = %+v %v", rows, err)
	}
}
```

- [ ] **Step 3: run** `cd services/registrar && go test ./internal/store/ -run 'TestUsersAndSessions|TestAuditAndRegistry'` → FAIL (undefined)
- [ ] **Step 4: implement** the methods with `database/sql` exactly matching the interfaces: `UpsertUser` = `INSERT … ON CONFLICT(email) DO UPDATE SET name, role, password_hash, is_demo` returning id via `SELECT id FROM users WHERE email=?`; `SessionUser` joins users and requires `expires_at > now` (else `ErrNoSession`); `InsertRegistry` maps the SQLite UNIQUE/PK violation (`strings.Contains(err.Error(), "UNIQUE")`) to `ErrSeriesExists`; `UpsertRegistry` = `ON CONFLICT(name) DO UPDATE SET mint, terms`; signatures stored as JSON array text.
- [ ] **Step 5: run** → PASS; `go vet ./... && golangci-lint run ./internal/store/`
- [ ] **Step 6: commit** `feat(registrar): back-office tables — users, sessions, audit, series registry`

---

### Task 2: `internal/auth`

**Files:**
- Create: `internal/auth/{password,token,limiter,service,context}.go`, `internal/auth/auth_test.go`
- Modify: `go.mod` (make `golang.org/x/crypto` direct)

**Interfaces:**
- Consumes: store (Task 1).
- Produces (package `auth`):
  - `func HashPassword(pw string) (string, error)`; `func CheckPassword(hash, pw string) bool`
  - `func NewToken() (raw, hash string, err error)`; `func HashToken(raw string) string`
  - `type Limiter struct{…}`; `func NewLimiter(max int, window time.Duration) *Limiter`; `func (l *Limiter) Allow(key string, now time.Time) bool`
  - `var ErrBadCredentials, ErrRateLimited, ErrDemoDisabled, ErrUnauthenticated = …`
  - `type Service struct { Store *store.Store; Now func() time.Time; TTL time.Duration; DemoLogin bool; Limit *Limiter }`
  - `func (s *Service) Login(ctx context.Context, email, password string) (token string, u store.User, err error)`
  - `func (s *Service) Demo(ctx context.Context, role string) (string, store.User, error)`
  - `func (s *Service) Authenticate(ctx context.Context, token string) (store.User, error)` (ErrUnauthenticated)
  - `func (s *Service) Logout(ctx context.Context, token string) error`
  - `func WithUser(ctx context.Context, u store.User) context.Context`; `func UserFrom(ctx context.Context) (store.User, bool)`

- [ ] **Step 1: failing tests**

```go
// internal/auth/auth_test.go
package auth

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func svc(t *testing.T, demo bool) (*Service, *store.Store, *time.Time) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "a.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	now := time.Unix(1_000_000, 0)
	s := &Service{Store: st, Now: func() time.Time { return now }, TTL: 12 * time.Hour, DemoLogin: demo, Limit: NewLimiter(5, time.Minute)}
	return s, st, &now
}

func TestLoginLogout(t *testing.T) {
	s, st, _ := svc(t, false)
	h, _ := HashPassword("correct horse")
	if _, err := st.UpsertUser(t.Context(), store.User{Email: "r@q.kz", Name: "R", Role: "registrar"}, h); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Login(t.Context(), "r@q.kz", "wrong"); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("wrong password err = %v", err)
	}
	if _, _, err := s.Login(t.Context(), "nobody@q.kz", "x"); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("unknown email must look identical: %v", err)
	}
	tok, u, err := s.Login(t.Context(), "r@q.kz", "correct horse")
	if err != nil || u.Role != "registrar" || len(tok) < 40 {
		t.Fatalf("login = %q %+v %v", tok, u, err)
	}
	if got, err := s.Authenticate(t.Context(), tok); err != nil || got.Email != "r@q.kz" {
		t.Fatalf("authenticate = %+v %v", got, err)
	}
	if err := s.Logout(t.Context(), tok); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(t.Context(), tok); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("after logout err = %v", err)
	}
}

func TestSessionExpires(t *testing.T) {
	s, st, now := svc(t, false)
	h, _ := HashPassword("pw")
	_, _ = st.UpsertUser(t.Context(), store.User{Email: "i@q.kz", Name: "I", Role: "issuer"}, h)
	tok, _, _ := s.Login(t.Context(), "i@q.kz", "pw")
	*now = now.Add(12*time.Hour + time.Second)
	if _, err := s.Authenticate(t.Context(), tok); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("expired err = %v", err)
	}
}

func TestRateLimitPerEmail(t *testing.T) {
	s, st, _ := svc(t, false)
	h, _ := HashPassword("pw")
	_, _ = st.UpsertUser(t.Context(), store.User{Email: "i@q.kz", Name: "I", Role: "issuer"}, h)
	for i := 0; i < 5; i++ {
		_, _, _ = s.Login(t.Context(), "i@q.kz", "bad")
	}
	if _, _, err := s.Login(t.Context(), "i@q.kz", "pw"); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("6th attempt err = %v, want ErrRateLimited", err)
	}
}

func TestDemoGate(t *testing.T) {
	off, _, _ := svc(t, false)
	if _, _, err := off.Demo(t.Context(), "issuer"); !errors.Is(err, ErrDemoDisabled) {
		t.Fatalf("demo off err = %v", err)
	}
	on, st, _ := svc(t, true)
	_, _ = st.UpsertUser(t.Context(), store.User{Email: "demo-issuer@qupon.demo", Name: "Demo issuer", Role: "issuer", IsDemo: true}, "!")
	tok, u, err := on.Demo(t.Context(), "issuer")
	if err != nil || !u.IsDemo || tok == "" {
		t.Fatalf("demo = %q %+v %v", tok, u, err)
	}
}

func TestTokenHashing(t *testing.T) {
	raw, hash, err := NewToken()
	if err != nil || HashToken(raw) != hash || raw == hash || len(hash) != 64 {
		t.Fatalf("token %q hash %q err %v", raw, hash, err)
	}
}
```

- [ ] **Step 2: run** `go test ./internal/auth/` → FAIL
- [ ] **Step 3: implement**

```go
// internal/auth/password.go
package auth

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcryptCost)
	return string(b), err
}

func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}
```

```go
// internal/auth/token.go
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// NewToken returns a random session token and the sha256 hex digest stored server-side (the raw token never is).
func NewToken() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("session token: %w", err)
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	return raw, HashToken(raw), nil
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
```

```go
// internal/auth/limiter.go
package auth

import (
	"sync"
	"time"
)

// Limiter is a per-key sliding window (keys are emails: spoof-proof, unlike client IPs behind the web tier).
type Limiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   map[string][]time.Time
}

func NewLimiter(max int, window time.Duration) *Limiter {
	return &Limiter{max: max, window: window, hits: map[string][]time.Time{}}
}

func (l *Limiter) Allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	kept := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < l.window {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.max {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}
```

```go
// internal/auth/service.go
package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

var (
	ErrBadCredentials  = errors.New("invalid email or password")
	ErrRateLimited     = errors.New("too many sign-in attempts, try again in a minute")
	ErrDemoDisabled    = errors.New("demo sign-in is disabled")
	ErrUnauthenticated = errors.New("not signed in")
)

type Service struct {
	Store     *store.Store
	Now       func() time.Time
	TTL       time.Duration
	DemoLogin bool
	Limit     *Limiter
}

func (s *Service) Login(ctx context.Context, email, password string) (string, store.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !s.Limit.Allow(email, s.Now()) {
		return "", store.User{}, ErrRateLimited
	}
	u, hash, err := s.Store.UserByEmail(ctx, email)
	if errors.Is(err, store.ErrNoUser) || (err == nil && !CheckPassword(hash, password)) {
		return "", store.User{}, ErrBadCredentials
	}
	if err != nil {
		return "", store.User{}, fmt.Errorf("login: %w", err)
	}
	return s.issue(ctx, u)
}

func (s *Service) Demo(ctx context.Context, role string) (string, store.User, error) {
	if !s.DemoLogin {
		return "", store.User{}, ErrDemoDisabled
	}
	u, err := s.Store.DemoUser(ctx, role)
	if err != nil {
		return "", store.User{}, fmt.Errorf("demo %s: %w", role, err)
	}
	return s.issue(ctx, u)
}

func (s *Service) issue(ctx context.Context, u store.User) (string, store.User, error) {
	raw, hash, err := NewToken()
	if err != nil {
		return "", store.User{}, err
	}
	if err := s.Store.CreateSession(ctx, hash, u.ID, s.Now().Add(s.TTL).Unix()); err != nil {
		return "", store.User{}, fmt.Errorf("create session: %w", err)
	}
	return raw, u, nil
}

func (s *Service) Authenticate(ctx context.Context, token string) (store.User, error) {
	if token == "" {
		return store.User{}, ErrUnauthenticated
	}
	u, err := s.Store.SessionUser(ctx, HashToken(token), s.Now().Unix())
	if errors.Is(err, store.ErrNoSession) {
		return store.User{}, ErrUnauthenticated
	}
	return u, err
}

func (s *Service) Logout(ctx context.Context, token string) error {
	return s.Store.DeleteSession(ctx, HashToken(token))
}
```

```go
// internal/auth/context.go
package auth

import (
	"context"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

type ctxKey struct{}

func WithUser(ctx context.Context, u store.User) context.Context { return context.WithValue(ctx, ctxKey{}, u) }

func UserFrom(ctx context.Context) (store.User, bool) {
	u, ok := ctx.Value(ctxKey{}).(store.User)
	return u, ok
}
```

- [ ] **Step 4: run** `go test ./internal/auth/ && go mod tidy && golangci-lint run ./internal/auth/` → PASS
- [ ] **Step 5: commit** `feat(registrar): auth service — bcrypt, hashed session tokens, per-email rate limit, demo gate`

---

### Task 3: Auth routes, RBAC middleware, audit helper; retire ADVANCE_TOKEN

**Files:**
- Create: `internal/api/auth.go`, `internal/api/rbac.go`, `internal/api/auth_test.go`
- Modify: `internal/api/api.go` (`Deps.Auth *auth.Service`, routes, remove `AdvanceToken`), `internal/api/advance.go` (use RBAC instead of the token), `internal/config/config.go` (`DemoLogin`, `Users`, drop `AdvanceToken`), `cmd/registrar/main.go` (build `auth.Service`, seed users), both `openapi.yaml`, `services/registrar/.env.example`, `deploy/vps/compose.yml`, `ops/deploy-vps.sh` (stop writing ADVANCE_TOKEN; write `DEMO_LOGIN=1`)

**Interfaces:**
- Consumes: `auth.Service` (Task 2), `store.AuditEntry` (Task 1).
- Produces:
  - Routes: `POST /auth/login {email,password}` → `200 {token, user:{id,email,name,role,isDemo}}` | 401 `bad_credentials` | 429 `rate_limited`; `POST /auth/demo {role}` → 200 | 403 `demo_disabled` | 400; `POST /auth/logout` (bearer) → 204; `GET /me` (bearer) → `{user}` | 401.
  - `func requireRole(svc *auth.Service, roles ...string) func(http.Handler) http.Handler` — 401 `unauthenticated` / 403 `forbidden`.
  - `func audit(st *store.Store, r *http.Request, params any, ok bool, detail string, sigs []string)` (never fails the request; logs on error).
  - Config: `DemoLogin bool` (`DEMO_LOGIN`), `Users string` (`QUPON_USERS`, JSON `[{"email","name","role","password"}]`).
  - main: on startup, if `DemoLogin`, upsert `demo-issuer@qupon.demo` (issuer), `demo-registrar@qupon.demo` (registrar), `demo-investor@qupon.demo` (investor_demo) with `IsDemo: true` and a random unknowable password hash; upsert every `QUPON_USERS` entry with `HashPassword(password)`.

- [ ] **Step 1: failing tests** (`internal/api/auth_test.go`): login 200 + token; wrong password 401 `{"code":"bad_credentials"}`; `/me` without bearer 401; demo with `DemoLogin:false` 403; RBAC matrix using a test-only route `GET /_test/registrar` wrapped in `requireRole(svc, "registrar")`: no token → 401, issuer token → 403, registrar token → 200; expired session → 401 (advance the service clock).

```go
func TestRBACMatrix(t *testing.T) {
	h, svc, st := newAuthServer(t, false) // helper: store + auth.Service with fake clock + New(...)
	issuer := signIn(t, h, st, svc, "issuer")   // helper: UpsertUser + Login via HTTP, returns bearer token
	registrar := signIn(t, h, st, svc, "registrar")
	for _, tc := range []struct{ token string; want int }{{"", 401}, {issuer, 403}, {registrar, 200}} {
		if got := doGet(t, h, "/_test/registrar", tc.token); got != tc.want {
			t.Errorf("token %q: status %d, want %d", tc.token, got, tc.want)
		}
	}
}
```

Helpers (same file):

```go
func newAuthServer(t *testing.T, demo bool) (http.Handler, *auth.Service, *store.Store) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "auth.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: 12 * time.Hour, DemoLogin: demo, Limit: auth.NewLimiter(5, time.Minute)}
	return New(slog.New(slog.DiscardHandler), st, Deps{Auth: svc, TestRoutes: true}), svc, st
}

func signIn(t *testing.T, h http.Handler, st *store.Store, svc *auth.Service, role string) string {
	t.Helper()
	hash, _ := auth.HashPassword("pw-" + role)
	email := role + "@test.kz"
	if _, err := st.UpsertUser(t.Context(), store.User{Email: email, Name: role, Role: role}, hash); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"email":"`+email+`","password":"pw-`+role+`"}`)))
	var out struct{ Token string `json:"token"` }
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil || out.Token == "" {
		t.Fatalf("sign in %s: %d %v", role, rec.Code, err)
	}
	return out.Token
}

func doGet(t *testing.T, h http.Handler, path, token string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}
```

`Deps` gains `Auth *auth.Service` and `TestRoutes bool`; `TestRoutes` registers `GET /_test/registrar` (`requireRole(Deps.Auth, "registrar")` → 200 `{}`) and is never set in production.

- [ ] **Step 2: run** `go test ./internal/api/ -run 'Auth|RBAC'` → FAIL
- [ ] **Step 3: implement** `auth.go` (decode JSON with `http.MaxBytesReader(w, r.Body, 1<<16)`, map errors to codes `bad_credentials` 401, `rate_limited` 429, `demo_disabled` 403, validation 400), `rbac.go`:

```go
// internal/api/rbac.go
package api

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if t, ok := strings.CutPrefix(h, "Bearer "); ok {
		return strings.TrimSpace(t)
	}
	return ""
}

func requireRole(svc *auth.Service, roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if svc == nil {
				writeErrorCode(w, http.StatusServiceUnavailable, "auth_unavailable", "auth not configured")
				return
			}
			u, err := svc.Authenticate(r.Context(), bearer(r))
			if err != nil {
				writeErrorCode(w, http.StatusUnauthorized, "unauthenticated", "sign in required")
				return
			}
			if !slices.Contains(roles, u.Role) && u.Role != "admin" {
				writeErrorCode(w, http.StatusForbidden, "forbidden", "role "+u.Role+" may not do this")
				return
			}
			next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), u)))
		})
	}
}

func writeErrorCode(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}
```

Wire `/registrar/actions/{pda}/advance` with `requireRole(svc, "registrar")` around the existing handler, keep `/actions/{pda}/advance` as an alias under the same middleware, delete the `AdvanceToken` check and its test case (replace with the RBAC test). The web proxy `apps/web/src/app/api/advance/[pda]/route.ts` switches to the session in Plan 3 Task 1; nothing from this plan is deployed before that.

- [ ] **Step 4: run** `go test ./... && golangci-lint run ./...` → PASS; update both openapi.yaml copies (security scheme `bearerAuth`, the four auth routes, 401/403 on advance).
- [ ] **Step 5: commit** `feat(registrar): sign-in routes, RBAC middleware and audit helper; sessions replace ADVANCE_TOKEN`

---

### Task 4: Writable executor config from the series registry

**Files:**
- Create: `internal/execconfig/execconfig.go`, `internal/execconfig/execconfig_test.go`
- Modify: `internal/executor/executor.go` (child env `QUPON_CONFIG=<cfgPath>`), `cmd/registrar/main.go` (seed registry from chain, write config, pass path to executor), `internal/config/config.go` (`ExecConfigPath`, default `/data/qupon-config.json`), `deploy/vps/compose.yml` (drop the read-only bind mount), `ops/deploy-vps.sh` (drop `--config`/`push_config`), `clients/ts/scripts/series-config.ts` (delete)

**Interfaces:**
- Consumes: `store.RegistryRow`, `chain.Client.AllSeries`.
- Produces: `func Write(basePath, outPath string, rows []store.RegistryRow) error` — output = base JSON with `series[name] = terms ∪ {"mint": mint}` for every row (base entries kept; a registry row with the same name overrides); atomic write (temp file + rename).

- [ ] **Step 1: failing test**

```go
func TestWriteMergesRegistryIntoBase(t *testing.T) {
	dir := t.TempDir()
	base := filepath.Join(dir, "base.json")
	if err := os.WriteFile(base, []byte(`{"programId":"P","series":{"QPNb1":{"mint":"","isin":"KZ2C0QUPON01"}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "out.json")
	rows := []store.RegistryRow{{Name: "QPN2", Mint: "M2", Terms: json.RawMessage(`{"isin":"KZ2C0QUPON02","faceValue":100000}`)}}
	if err := Write(base, out, rows); err != nil {
		t.Fatal(err)
	}
	var got struct {
		ProgramID string                    `json:"programId"`
		Series    map[string]map[string]any `json:"series"`
	}
	b, _ := os.ReadFile(out)
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if got.ProgramID != "P" || got.Series["QPN2"]["mint"] != "M2" || got.Series["QPN2"]["isin"] != "KZ2C0QUPON02" || got.Series["QPNb1"] == nil {
		t.Fatalf("merged config = %+v", got)
	}
}
```

- [ ] **Step 2: run** → FAIL; **Step 3: implement** (`map[string]any` merge, `os.CreateTemp` in the same dir + `os.Rename`); executor: `cmd.Env = append(os.Environ(), "QUPON_CONFIG="+e.cfgPath)`; main: on start `AllSeries` → `UpsertRegistry(name=trim(ticker), mint, terms={cashMint,isin,faceValue,couponRateBps,frequency,dayCount})` for each on-chain series → `execconfig.Write(QuponConfig, ExecConfigPath, rows)`; executor built with `ExecConfigPath`.
- [ ] **Step 4: run** `go test ./...` → PASS; locally `make api` + `curl -X POST …/registrar/actions/<pda>/advance` with a registrar session → executor resolves a demo series by mint.
- [ ] **Step 5: commit** `feat(registrar): executor config generated from the series registry (writable, no bind mount)`

---

### Task 5: CLI `series:create` + `investor:reinstate`; `POST /issuer/series`

**Files:**
- Create: `clients/ts/src/lib/bondMintFlow.ts`, `clients/ts/src/commands/seriesCreate.ts`, `clients/ts/src/commands/seriesCreate.test.ts`, `internal/api/issuer.go`, `internal/api/issuer_test.go`
- Modify: `clients/ts/scripts/create-bond-mint.ts` (wrapper), `clients/ts/src/commands/index.ts`, `clients/ts/src/commands/investor.ts` (`investor:reinstate`, mirrors `investor:suspend` with `getReinstateInvestorInstruction`)

**Interfaces:**
- Produces:
  - `export async function ensureBondMint(opts: { rpc: QuponRpc; cfgPath: string; name: string }): Promise<{ mint: Address; created: boolean; signatures: string[] }>` (body moved verbatim from the script's `main`, returning instead of printing)
  - CLI `series:create --name <n> --isin <12> --face <minor> --rate-bps <n> --frequency <1|2|4|12> --day-count <THIRTY_360|ACT_365> --issue-date <YYYY-MM-DD> --maturity-date <YYYY-MM-DD> --cash <tkzt|usdc> [--quorum-bps 5000] [--approval-bps 6667]` → writes the entry into `QUPON_CONFIG`, `ensureBondMint`, then the `series:init` flow → stdout `{ok:true, series, mint, signatures:[…]}`
  - `export function parseSeriesCreateArgs(o: Record<string,string>): SeriesTerms` (validation; throws `Error` with a user message) — `SeriesTerms = { name; isin; faceValue: bigint; couponRateBps: number; frequency: 1|2|4|12; dayCount: "THIRTY_360"|"ACT_365"; issueDate: string; maturityDate: string; cash: "tkzt"|"usdc"; quorumBps: number; approvalBps: number }`
  - Go `POST /issuer/series` (issuer) body `{name,isin,faceValue,couponRateBps,frequency,dayCount,issueDate,maturityDate,cash}` → validates (same rules) → `InsertRegistry` placeholder row (409 `series_exists` if taken) → `execconfig.Write` → executor `series:create …` → `UpsertRegistry` with the mint → audit → `201 {series, mint, signatures}`; on CLI failure deletes the placeholder row and returns 409 with `onchainError`.

- [ ] **Step 1: failing TS test**

```ts
// clients/ts/src/commands/seriesCreate.test.ts
import { describe, expect, it } from "vitest";
import { parseSeriesCreateArgs } from "./seriesCreate.js";
const ok = { name: "QPN2", isin: "KZ2C0QUPON02", face: "100000", rateBps: "1000", frequency: "2", dayCount: "THIRTY_360", issueDate: "2026-07-03", maturityDate: "2028-07-03", cash: "tkzt" };
describe("parseSeriesCreateArgs", () => {
  it("accepts valid terms", () => {
    const t = parseSeriesCreateArgs(ok);
    expect(t.faceValue).toBe(100000n);
    expect(t.frequency).toBe(2);
    expect(t.quorumBps).toBe(5000);
  });
  it.each([
    [{ isin: "KZ2C0" }, /ISIN/],
    [{ rateBps: "10001" }, /rate/],
    [{ frequency: "3" }, /frequency/],
    [{ dayCount: "ACT_ACT" }, /day count/],
    [{ maturityDate: "2026-07-03" }, /maturity/],
    [{ name: "has space" }, /name/],
    [{ cash: "eur" }, /cash/],
  ])("rejects %o", (patch, msg) => {
    expect(() => parseSeriesCreateArgs({ ...ok, ...patch })).toThrow(msg);
  });
});
```

Rules: name `^[A-Za-z0-9-]{1,16}$`; ISIN `^[A-Z]{2}[A-Z0-9]{9}[0-9]$`; face > 0; rate 1..10000 bps; frequency ∈ {1,2,4,12}; day count ∈ {THIRTY_360, ACT_365} (ACT_ACT is rejected by the program); dates `YYYY-MM-DD`, maturity > issue; cash ∈ {tkzt, usdc}; quorum/approval 1..10000.

- [ ] **Step 2: run** `pnpm -C clients/ts vitest run src/commands/seriesCreate.test.ts` → FAIL; **Step 3: implement** `parseSeriesCreateArgs`, `bondMintFlow.ts` (move the script body), `series:create` (validate → `updateConfig(cfgPath, {series: {...cfg.series, [name]: {mint:"", cashMint, isin, faceValue, couponRateBps, frequency, dayCount, termYears}}})` → `ensureBondMint` → reuse the `series:init` handler as a function `initSeries(rpc, cfg, name, {issueDate, maturityDate, quorumBps, approvalBps})` exported from `commands/series.ts` → `out({ok:true, series:name, mint, signatures})`), `investor:reinstate`.
- [ ] **Step 4: failing Go test** `TestCreateSeries`: fake CLI (`internal/executor/testdata/fake-cli.sh`, stdout `{"ok":true,"series":"QPN2","mint":"M2","signatures":["s1","s2"]}`) → 201, argv logged equals `--json series:create --name QPN2 --isin KZ2C0QUPON02 --face 100000 --rate-bps 1000 --frequency 2 --day-count THIRTY_360 --issue-date 2026-07-03 --maturity-date 2028-07-03 --cash tkzt`, registry has mint `M2`, one audit row with `ok=1`; second identical call → 409 `series_exists`, fake CLI not invoked again; ISIN `KZ` → 400 `invalid_params`, CLI not invoked; registrar token → 403.
- [ ] **Step 5: implement** `issuer.go` (validation mirrors the TS rules; executor argv built from validated fields only), route under `requireRole(svc, "issuer")`.
- [ ] **Step 6: run** `go test ./... && pnpm -C clients/ts test` → PASS; devnet smoke: `ops/qupon series:create --name QPNt1 …` once by hand → `{ok:true, mint}`.
- [ ] **Step 7: commit** `feat: series:create CLI + POST /issuer/series; investor:reinstate`

---

### Task 6: Issuer action endpoints

**Files:**
- Modify: `internal/api/issuer.go`, `internal/api/issuer_test.go`, openapi copies

**Interfaces:**
- Produces:
  - `POST /issuer/series/{mint}/actions {kind:"INTR"|"REDM"|"MCAL", recordAt:int64, paymentAt:int64, callDate?: "YYYY-MM-DD", corpId?: string}` → CLI `action:announce --series <name> --kind <k> --record-at <recordAt> --payment-at <paymentAt> [--call-date …] [--corp-id …]` → `201 {action, signatures}`
  - `POST /issuer/series/{mint}/meetings {newRateBps:int, recordAt:int64, votingEndsAt:int64}` → CLI `meeting:announce --series <name> --record-at … --voting-ends-at … --new-rate-bps …`
  - `POST /issuer/actions/{pda}/fund` → CLI `action:fund --series <name> --index <i>` → `200 {signatures, skipped}`
  - All: series name resolved via `Executor.SeriesName(mint)`; 404 `unknown_series` if not in registry; audit row; on-chain refusal → 409 `{code:"onchain", onchainError}`.

- [ ] **Step 1: failing tests**: announce INTR argv exact; MCAL without callDate → 400; recordAt ≥ paymentAt → 400; meeting rate 0 → 400; fund twice → second response `skipped:true` (fake CLI second stdout `{"ok":true,"skipped":true}`) and two audit rows; unknown mint → 404; registrar token → 403.
- [ ] **Step 2: run** → FAIL; **Step 3: implement**; **Step 4: run** → PASS
- [ ] **Step 5: commit** `feat(registrar): issuer endpoints — announce, meeting, fund`

---

### Task 7: Registrar endpoints (onboarding, suspend/reinstate, audit feed)

**Files:**
- Create: `internal/api/registrar.go`, `internal/api/registrar_test.go`
- Modify: openapi copies

**Interfaces:**
- Produces:
  - `POST /registrar/investors {series:mint, owner:base58, investorType:"individual"|"legal_entity", residency:"resident"|"nonresident", taxBps:int, expiryDays?:int}` → CLI `kyc:attest --owner … --type … --residency … --tax-bps … --expiry-days …` (skipped when it exists) then `investor:register --series <name> --owner … --type … --residency … --tax-bps …` → `201 {investor, attestation, signatures}`
  - `POST /registrar/investors/{mint}/{owner}/suspend` · `/reinstate` → CLI `investor:suspend|investor:reinstate --series <name> --owner …`
  - `GET /registrar/audit?limit=` (registrar|admin) → `{items: AuditEntry[]}`
- [ ] **Step 1: failing tests**: onboarding runs two CLI calls in order (argv log has `kyc:attest` then `investor:register`); attestation step failing stops before register (409, one CLI line logged); taxBps 10001 → 400; owner `not-base58` → 400; suspend argv; audit list newest first; issuer token on onboarding → 403.
- [ ] **Step 2–4:** run → FAIL; implement; run → PASS
- [ ] **Step 5: commit** `feat(registrar): investor onboarding (SAS attestation + registration), suspend/reinstate, audit feed`

---

### Task 8: Demo investor endpoints + container keys + deploy

**Files:**
- Create: `internal/api/demo.go`, `internal/api/demo_test.go`
- Modify: `services/registrar/entrypoint.sh` (roles `KYC_PROVIDER`, `INVESTOR` → `QUPON_KYC_PROVIDER_KEYPAIR`, `QUPON_INVESTOR_KEYPAIR`), `ops/deploy-vps.sh` (send `QUPON_KYC_PROVIDER_KEYPAIR_JSON` from `~/.config/qupon/kyc-provider.json`, `QUPON_INVESTOR_KEYPAIR_JSON` from `~/.config/qupon/investor3.json`, `DEMO_LOGIN=1`), `deploy/vps/compose.yml`, openapi copies, `README.md` (deploy section: env list)

**Interfaces:**
- Produces: `POST /demo/investor/subscribe {series:mint, units:int}` → CLI `subscribe --series <name> --units <n>`; `POST /demo/investor/vote {action:pda, choice:"for"|"against"|"abstain"}` → CLI `vote --series <name> --index <i> --choice …`; role `investor_demo` only; response marks `demo:true`.
- [ ] **Step 1: failing tests**: subscribe argv; units 0 → 400; vote with unknown choice → 400; registrar token → 403.
- [ ] **Step 2–4:** implement; `go test ./...`; entrypoint loop becomes `for role in REGISTRAR ISSUER PAYING_AGENT KYC_PROVIDER INVESTOR` (file names `kyc-provider.json`, `investor.json`).
- [ ] **Step 5:** local smoke (do NOT deploy yet — the deployed console's advance button needs the Plan 3 sign-in; Plan 3 Task 1 deploys both together): `DEMO_LOGIN=1 make api`; `POST /auth/demo {"role":"issuer"}` → token; `GET /me` → `isDemo:true`; `POST /issuer/series` with a fresh name → 201 and the mint visible at `GET /series`.
- [ ] **Step 6: commit** `feat(registrar): demo investor endpoints; container gets KYC-provider and demo-investor keys`

---

## Self-review

- Spec §4 routes: issuer series/actions/meetings/fund → Tasks 5–6; registrar investors/suspend/reinstate/advance/audit → Tasks 3, 7; demo investor → Task 8; auth/me/logout → Task 3; writable config → Task 4; CLI additions → Task 5. §6 security: bcrypt/token/limit/demo gate → Task 2; RBAC/audit → Task 3; CORS unchanged. §7 Go tests listed per task.
- Review Focus items each have a test in their owning task (fund twice → Task 6; expired session → Tasks 2/3; wrong role → Task 3 + each endpoint task; malformed input → Tasks 5–7; duplicate series → Task 5).
- Names consistent across tasks: `requireRole`, `writeErrorCode`, `audit`, `execconfig.Write`, `ensureBondMint`, `parseSeriesCreateArgs`, `initSeries`, `UpsertRegistry`/`InsertRegistry`.
