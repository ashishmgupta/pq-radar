-- Provider-neutral connector tables. Additive only and dormant: nothing reads or
-- writes these yet. Timestamps are ISO 8601 UTC TEXT (matches new Date().toISOString()
-- used elsewhere). run_id is TEXT from crypto.randomUUID() (matches runs.run_id).
-- Leg values match the Leg type in src/scan.ts; outcome matches results.outcome.

CREATE TABLE IF NOT EXISTS connectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  last_sync_at TEXT
);

CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connector_id INTEGER NOT NULL REFERENCES connectors(id),
  native_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  UNIQUE (connector_id, native_type, name)
);

CREATE TABLE IF NOT EXISTS origins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edge_id INTEGER NOT NULL REFERENCES edges(id),
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  UNIQUE (edge_id, target)
);

CREATE TABLE IF NOT EXISTS connector_runs (
  run_id TEXT PRIMARY KEY,
  connector_id INTEGER NOT NULL REFERENCES connectors(id),
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS connector_results (
  run_id TEXT NOT NULL REFERENCES connector_runs(run_id),
  edge_id INTEGER REFERENCES edges(id),
  origin_id INTEGER REFERENCES origins(id),
  leg TEXT NOT NULL,
  outcome TEXT NOT NULL,
  negotiated_group TEXT,
  scanned_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edges_connector_id ON edges(connector_id);
CREATE INDEX IF NOT EXISTS idx_origins_edge_id ON origins(edge_id);
CREATE INDEX IF NOT EXISTS idx_connector_runs_connector_started ON connector_runs(connector_id, started_at);
CREATE INDEX IF NOT EXISTS idx_connector_results_run_id ON connector_results(run_id);
