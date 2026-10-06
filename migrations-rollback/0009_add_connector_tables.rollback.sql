-- MANUAL ROLLBACK for migrations/0009_add_connector_tables.sql.
-- NOT applied automatically. D1 has no down-migrations; run by hand only, and only
-- after confirming no code reads or writes these tables.
--   npx wrangler d1 execute pq-radar --remote --file=migrations-rollback/0009_add_connector_tables.rollback.sql
--
-- Dependency order: results -> runs -> origins/edges -> connectors.

DROP INDEX IF EXISTS idx_connector_results_run_id;
DROP INDEX IF EXISTS idx_connector_runs_connector_started;
DROP INDEX IF EXISTS idx_origins_edge_id;
DROP INDEX IF EXISTS idx_edges_connector_id;

DROP TABLE IF EXISTS connector_results;
DROP TABLE IF EXISTS connector_runs;
DROP TABLE IF EXISTS origins;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS connectors;

-- Forget the migration record so wrangler will apply 0009 again if it is re-added.
DELETE FROM d1_migrations WHERE name = '0009_add_connector_tables.sql';
