-- 006_platform.sql — platform v2 (spec 2026-10-06 §4): organisations, self-registered investors, wallets, KYC,
-- documents, notifications, cash-asset registry, series settings, kase.kz cache.

CREATE TABLE IF NOT EXISTS organizations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('issuer', 'registrar')),
    bin        TEXT NOT NULL DEFAULT '',
    website    TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);

-- SQLite cannot alter a CHECK: rebuild users to admit role 'investor' and add org_id/status/locale.
-- Dropping the old table cascades to sessions (everyone signs in again once).
CREATE TABLE users_v6 (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('issuer', 'registrar', 'investor_demo', 'investor', 'admin')),
    password_hash TEXT NOT NULL,
    is_demo       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    org_id        INTEGER REFERENCES organizations(id),
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
    locale        TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ru'))
);
INSERT INTO users_v6 (id, email, name, role, password_hash, is_demo, created_at)
    SELECT id, email, name, role, password_hash, is_demo, created_at FROM users;
DROP TABLE users;
ALTER TABLE users_v6 RENAME TO users;
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

CREATE TABLE IF NOT EXISTS invites (
    token_hash TEXT PRIMARY KEY,
    org_id     INTEGER NOT NULL REFERENCES organizations(id),
    role       TEXT NOT NULL,
    email      TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER,
    created_by INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_links (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER,
    created_by INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
    address     TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       TEXT NOT NULL DEFAULT '',
    verified_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

CREATE TABLE IF NOT EXISTS wallet_challenges (
    nonce      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address    TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER
);

CREATE TABLE IF NOT EXISTS documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL REFERENCES users(id),
    org_id        INTEGER REFERENCES organizations(id),
    kind          TEXT NOT NULL CHECK (kind IN ('id_document', 'proof_of_address', 'prospectus', 'decision', 'other')),
    filename      TEXT NOT NULL,
    mime          TEXT NOT NULL,
    size          INTEGER NOT NULL,
    sha256        TEXT NOT NULL,
    path          TEXT NOT NULL,
    series_mint   TEXT,           -- set when an issuer attaches the document to a series (public)
    created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_documents_series ON documents(series_mint);

CREATE TABLE IF NOT EXISTS kyc_applications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    wallet        TEXT NOT NULL,
    investor_type TEXT NOT NULL CHECK (investor_type IN ('individual', 'legal_entity')),
    residency     TEXT NOT NULL CHECK (residency IN ('resident', 'nonresident')),
    tax_bps       INTEGER NOT NULL,
    full_name     TEXT NOT NULL,
    doc_ids       TEXT NOT NULL DEFAULT '[]',   -- JSON array of documents.id
    series_mints  TEXT NOT NULL DEFAULT '[]',   -- JSON array of series mints to join
    status        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
    reason        TEXT NOT NULL DEFAULT '',
    results       TEXT NOT NULL DEFAULT '[]',   -- JSON per-series onboarding results
    decided_by    INTEGER,
    decided_at    INTEGER,
    created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_applications(status);
CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_applications(user_id);

CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    payload    TEXT NOT NULL DEFAULT '{}',
    dedup_key  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at    INTEGER,
    UNIQUE (user_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS cash_assets (
    network          TEXT NOT NULL,
    mint             TEXT NOT NULL,
    symbol           TEXT NOT NULL,
    name             TEXT NOT NULL,
    decimals         INTEGER NOT NULL,
    token_program    TEXT NOT NULL,
    kind             TEXT NOT NULL CHECK (kind IN ('test', 'stablecoin', 'wrapped_cbdc', 'spl')),
    issuer_note      TEXT NOT NULL DEFAULT '',
    mint_authority   TEXT,
    freeze_authority TEXT,
    verified_at      INTEGER,
    enabled          INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL,
    PRIMARY KEY (network, mint)
);

CREATE TABLE IF NOT EXISTS series_settings (
    series_mint TEXT PRIMARY KEY,
    org_id      INTEGER REFERENCES organizations(id),
    hidden      INTEGER NOT NULL DEFAULT 0,
    featured    INTEGER NOT NULL DEFAULT 0,
    kase_ticker TEXT NOT NULL DEFAULT '',
    updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kase_cache (
    key        TEXT PRIMARY KEY,
    body       TEXT NOT NULL,
    status     INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL
);
