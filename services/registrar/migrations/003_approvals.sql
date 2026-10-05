-- Scheduler approvals: the "agent proposes, human approves" gate (task 024).
-- One row per proposed scheduler decision; dedup_key makes re-proposing the
-- same step for the same action idempotent across ticks.

CREATE TABLE IF NOT EXISTS approvals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    dedup_key   TEXT NOT NULL UNIQUE,
    series_mint TEXT NOT NULL,
    action_pda  TEXT,
    step        TEXT NOT NULL,
    args        TEXT NOT NULL,
    status      TEXT NOT NULL,
    detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
