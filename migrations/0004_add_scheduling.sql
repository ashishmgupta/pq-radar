ALTER TABLE subnets ADD COLUMN schedule_enabled INTEGER DEFAULT 0;
ALTER TABLE subnets ADD COLUMN schedule_hour_utc INTEGER;
ALTER TABLE subnets ADD COLUMN cron_run_started_at TEXT;

ALTER TABLE runs ADD COLUMN trigger_type TEXT DEFAULT 'manual';
ALTER TABLE runs ADD COLUMN status TEXT DEFAULT 'success';
ALTER TABLE runs ADD COLUMN error_detail TEXT;
