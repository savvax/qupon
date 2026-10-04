-- Event ingestion (task 028): activity rows carry the tx signature/slot and the
-- event's position in the log (seq) so polls are idempotent and the feed is ordered.
-- The ingest cursor is the newest processed signature (getSignaturesForAddress page anchor).

ALTER TABLE activity ADD COLUMN sig TEXT;
ALTER TABLE activity ADD COLUMN slot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activity ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_dedupe ON activity(sig, kind, seq);

CREATE TABLE IF NOT EXISTS ingest_state (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    last_sig   TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
