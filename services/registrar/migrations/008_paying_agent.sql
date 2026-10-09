-- 008_paying_agent.sql — plan 15 D6 (task 91522): the paying agent confirms bank-routed payouts from the
-- console, so the back-office admits the role; the kk locale (task 1504) is admitted too — account.go already accepted it
-- and the old CHECK refused the write. SQLite cannot alter a CHECK: rebuild users as 006 did
-- (dropping the old table cascades to sessions — everyone signs in again once).

CREATE TABLE users_v8 (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('issuer', 'registrar', 'paying_agent', 'investor_demo', 'investor', 'admin')),
    password_hash TEXT NOT NULL,
    is_demo       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    org_id        INTEGER REFERENCES organizations(id),
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
    locale        TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ru', 'kk'))
);
INSERT INTO users_v8 (id, email, name, role, password_hash, is_demo, created_at, org_id, status, locale)
    SELECT id, email, name, role, password_hash, is_demo, created_at, org_id, status, locale FROM users;
DROP TABLE users;
ALTER TABLE users_v8 RENAME TO users;
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
