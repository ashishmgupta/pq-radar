-- SQLite requires a table rebuild to relax a NOT NULL constraint (origin_content):
-- CNAME records may fail to resolve to an IP, and that must be representable as NULL
-- rather than silently dropping the DNS record.
CREATE TABLE dns_records_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  record_type TEXT NOT NULL,
  origin_content TEXT,
  cname_target TEXT,
  proxied INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT NOT NULL
);

INSERT INTO dns_records_new (id, zone_id, hostname, record_type, origin_content, proxied, last_synced_at)
SELECT id, zone_id, hostname, record_type, origin_content, proxied, last_synced_at FROM dns_records;

DROP TABLE dns_records;
ALTER TABLE dns_records_new RENAME TO dns_records;

CREATE INDEX idx_dns_records_zone_id ON dns_records(zone_id);
CREATE INDEX idx_dns_records_hostname ON dns_records(hostname);
