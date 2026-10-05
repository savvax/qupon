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
