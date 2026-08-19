-- Consolidated schema — represents the app's current, full table structure
-- (baseline + every migration in migrations/ applied on top), for a FRESH
-- install only. Run this once against a brand-new, empty D1 database:
--   npx wrangler d1 execute pq-radar --remote --file=schema.sql
--
-- NEVER run this against a database that already has these tables — every
-- CREATE TABLE below will fail loudly ("table already exists") rather than
-- silently touching existing data, which is intentional: an existing
-- deployment upgrades via `wrangler d1 migrations apply`, not this file.
--
-- This file also seeds d1_migrations (wrangler's own migration-tracking
-- table) with every migration that already exists, so a fresh install looks
-- — to wrangler's own tooling — like it already ran them. Without this, the
-- next time a NEW migration is added and `wrangler d1 migrations apply` runs
-- against a consolidated-schema install, wrangler would see none of the
-- existing migrations as applied and try to replay them from scratch,
-- immediately colliding with tables this file already created.

CREATE TABLE subnets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cidr TEXT NOT NULL,
  sni_hint TEXT,
  label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  schedule_enabled INTEGER DEFAULT 0,
  schedule_hour_utc INTEGER,
  cron_run_started_at TEXT
);

CREATE TABLE scan_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  port INTEGER NOT NULL DEFAULT 443,
  liveness_timeout_ms INTEGER NOT NULL DEFAULT 1500,
  handshake_timeout_ms INTEGER NOT NULL DEFAULT 4000,
  concurrency INTEGER NOT NULL DEFAULT 100
);

-- /trigger requires a row here to exist at all (see index.ts) — without this,
-- a fresh database has an empty table and every scan fails immediately with
-- "no scan_config row". Relies on the column defaults above.
INSERT INTO scan_config (id) VALUES (1);

CREATE TABLE zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id TEXT NOT NULL UNIQUE,
  zone_name TEXT NOT NULL,
  last_synced_at TEXT,
  account_label TEXT NOT NULL DEFAULT 'dev'
);

CREATE TABLE dns_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  record_type TEXT NOT NULL,
  origin_content TEXT,
  cname_target TEXT,
  proxied INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT NOT NULL
);

CREATE INDEX idx_dns_records_zone_id ON dns_records(zone_id);
CREATE INDEX idx_dns_records_hostname ON dns_records(hostname);

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  subnet_id INTEGER,
  cidr TEXT,
  label TEXT,
  total_ips INTEGER NOT NULL,
  live_count INTEGER NOT NULL,
  findings_count INTEGER NOT NULL,
  trigger_type TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'success',
  error_detail TEXT,
  leg TEXT
);

CREATE INDEX idx_runs_leg_subnet_status_ts ON runs(leg, subnet_id, status, ts);

CREATE TABLE results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  ip TEXT NOT NULL,
  leg TEXT NOT NULL,
  protocol TEXT,
  negotiated_group TEXT,
  cipher TEXT,
  outcome TEXT NOT NULL,
  raw TEXT,
  command TEXT,
  hostnames TEXT
);

CREATE INDEX idx_results_leg_ip_ts ON results(leg, ip, ts);
CREATE INDEX idx_results_run_id ON results(run_id);

-- Wrangler's own migration-tracking table — see the file header comment.
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT INTO d1_migrations (name) VALUES
  ('0001_add_runs.sql'),
  ('0002_add_command_column.sql'),
  ('0003_add_hostnames_column.sql'),
  ('0004_add_scheduling.sql'),
  ('0005_add_zones.sql'),
  ('0006_add_account_label.sql'),
  ('0007_add_leg_to_runs.sql'),
  ('0008_cname_support.sql');
