-- Task 1524: one-click judge sandboxes. A sandbox row is the demo series the visitor created: its labelled
-- holders, its scenarios and the visitor-wallet claim window. series_settings.sandbox_id (migration 007) ties
-- the mint to it; GET /demo/sandbox/{id} answers 404 after expires_at (24 h).
CREATE TABLE sandboxes (
  id           TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL DEFAULT '',
  ip           TEXT NOT NULL DEFAULT '',
  ticker       TEXT NOT NULL,
  mint         TEXT NOT NULL,
  wallet       TEXT NOT NULL DEFAULT '',
  holders      TEXT NOT NULL DEFAULT '[]',
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  skip_funding INTEGER NOT NULL DEFAULT 0,
  claim_index  INTEGER NOT NULL DEFAULT 0,
  claim_until  INTEGER NOT NULL DEFAULT 0
);
-- Idempotent creates: one sandbox per requestId (empty = no idempotency, e.g. direct curl).
CREATE UNIQUE INDEX idx_sandboxes_request ON sandboxes(request_id) WHERE request_id != '';
-- Rate limits: 3 per visitor per hour, 30 per day (ip = '' counts everyone).
CREATE INDEX idx_sandboxes_ip ON sandboxes(ip, created_at);

-- Scenarios run against a sandbox, oldest first; detail is the full SandboxScenario JSON (trade included),
-- replayed verbatim in GET /demo/sandbox/{id}.scenarios[].
CREATE TABLE sandbox_scenarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sandbox_id  TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  at          INTEGER NOT NULL,
  detail      TEXT NOT NULL
);
