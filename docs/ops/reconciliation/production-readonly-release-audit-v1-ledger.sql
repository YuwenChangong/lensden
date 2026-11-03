-- Dispatch only after the catalog query confirms this ledger exists.
-- No migration statement bodies, user data or application RPC invocation.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '1s';
SELECT current_setting('transaction_read_only') AS transaction_read_only,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version)
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261015072723','20261015074931')), '[]'::jsonb) AS migrations;
ROLLBACK;
