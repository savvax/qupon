-- Initial schema: chain mirrors (reader/reconciler keep them in sync), activity log, run log.
-- Payload columns are JSON blobs so later tasks can evolve fields without new migrations.

CREATE TABLE IF NOT EXISTS series (
    mint       TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS actions (
    pda        TEXT PRIMARY KEY,
    series_mint TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_actions_series ON actions(series_mint);

CREATE TABLE IF NOT EXISTS entitlements (
    pda        TEXT PRIMARY KEY,
    action_pda TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entitlements_action ON entitlements(action_pda);

CREATE TABLE IF NOT EXISTS activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    series_mint TEXT,
    action_pda  TEXT,
    kind        TEXT NOT NULL,
    payload     TEXT
);

CREATE TABLE IF NOT EXISTS runs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         INTEGER NOT NULL,
    action_pda TEXT,
    step       TEXT NOT NULL,
    status     TEXT NOT NULL,
    detail     TEXT
);
