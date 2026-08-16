CREATE TABLE zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id TEXT NOT NULL UNIQUE,
  zone_name TEXT NOT NULL,
  last_synced_at TEXT
);

CREATE TABLE dns_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  record_type TEXT NOT NULL,
  origin_content TEXT NOT NULL,
  proxied INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT NOT NULL
);

CREATE INDEX idx_dns_records_zone_id ON dns_records(zone_id);
CREATE INDEX idx_dns_records_hostname ON dns_records(hostname);
