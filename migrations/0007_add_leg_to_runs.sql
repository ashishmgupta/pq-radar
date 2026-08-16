ALTER TABLE runs ADD COLUMN leg TEXT;

UPDATE runs SET leg = (
  SELECT results.leg FROM results WHERE results.run_id = runs.run_id LIMIT 1
) WHERE leg IS NULL;

CREATE INDEX idx_results_leg_ip_ts ON results(leg, ip, ts);
CREATE INDEX idx_results_run_id ON results(run_id);
CREATE INDEX idx_runs_leg_subnet_status_ts ON runs(leg, subnet_id, status, ts);
