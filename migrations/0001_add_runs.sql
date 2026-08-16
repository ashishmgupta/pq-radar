CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  subnet_id INTEGER,
  cidr TEXT,
  label TEXT,
  total_ips INTEGER NOT NULL,
  live_count INTEGER NOT NULL,
  findings_count INTEGER NOT NULL
);
