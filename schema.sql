CREATE TABLE subnets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cidr TEXT NOT NULL,
  sni_hint TEXT,
  label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
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
  raw TEXT
);
