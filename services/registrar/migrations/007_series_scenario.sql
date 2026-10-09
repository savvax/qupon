-- Plan 15 (task 1522): per-series autopilot scenario. no_autofund = 1 keeps the scheduler from funding the escrow even
-- when the registrar runs with autofund, so a coupon can default (sandbox "skip funding"); sandbox_id ties a demo series
-- to its sandbox (task 1524).
ALTER TABLE series_settings ADD COLUMN no_autofund INTEGER NOT NULL DEFAULT 0;
ALTER TABLE series_settings ADD COLUMN sandbox_id TEXT;
