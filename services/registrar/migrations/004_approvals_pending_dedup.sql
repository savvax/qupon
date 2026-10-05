-- 024 review: dedup only while a proposal is pending. Batch steps (snapshot/pay/retire) repeat on one action; a
-- table-wide UNIQUE made INSERT OR IGNORE drop every proposal after the first executed one and stalled approval mode.
CREATE TABLE approvals_v2 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    dedup_key   TEXT NOT NULL,
    series_mint TEXT NOT NULL,
    action_pda  TEXT,
    step        TEXT NOT NULL,
    args        TEXT NOT NULL,
    status      TEXT NOT NULL,
    detail      TEXT
);
INSERT INTO approvals_v2 (id, ts, dedup_key, series_mint, action_pda, step, args, status, detail)
    SELECT id, ts, dedup_key, series_mint, action_pda, step, args, status, detail FROM approvals;
DROP TABLE approvals;
ALTER TABLE approvals_v2 RENAME TO approvals;
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE UNIQUE INDEX idx_approvals_pending_dedup ON approvals(dedup_key) WHERE status = 'pending';
