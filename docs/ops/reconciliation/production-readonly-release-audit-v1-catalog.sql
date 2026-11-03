-- Owner-approved Production Read-Only Release Audit v1. Metadata ONLY.
-- One request; do not invoke application functions or read business rows.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '1s';
SELECT jsonb_build_object(
  'transactionReadOnly', current_setting('transaction_read_only'),
  'ledgerExists', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'tables', (
    SELECT jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', c.relname,
      'rlsEnabled', c.relrowsecurity, 'forceRls', c.relforcerowsecurity,
      'owner', pg_get_userbyid(c.relowner),
      'columns', (SELECT jsonb_agg(jsonb_build_object(
        'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
        FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
      'policies', (SELECT jsonb_agg(jsonb_build_object(
        'name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive,
        'roles', (SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END)
          FROM unnest(p.polroles) r),
        'usingHash', md5(COALESCE(pg_get_expr(p.polqual,p.polrelid),'')),
        'checkHash', md5(COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),''))) ORDER BY p.polname)
        FROM pg_policy p WHERE p.polrelid=c.oid)))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('comment_reactions','forum_upload_attempts')
      AND c.relkind IN ('r','p')),
  'reactionPrivileges', (
    SELECT jsonb_agg(jsonb_build_object(
      'role', r.role_name,
      'selectTable', has_table_privilege(r.role_name,c.oid,'SELECT'),
      'insertTable', has_table_privilege(r.role_name,c.oid,'INSERT'),
      'updateTable', has_table_privilege(r.role_name,c.oid,'UPDATE'),
      'deleteTable', has_table_privilege(r.role_name,c.oid,'DELETE'),
      'columns', (SELECT jsonb_agg(jsonb_build_object(
        'name', a.attname,
        'select', has_column_privilege(r.role_name,c.oid,a.attnum,'SELECT'),
        'insert', has_column_privilege(r.role_name,c.oid,a.attnum,'INSERT'),
        'update', has_column_privilege(r.role_name,c.oid,a.attnum,'UPDATE')) ORDER BY a.attnum)
        FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES ('anon'),('authenticated')) r(role_name)
    WHERE n.nspname='public' AND c.relname='comment_reactions'),
  'functions', (
    SELECT jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', p.proname,
      'identityArguments', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid), 'owner', pg_get_userbyid(p.proowner),
      'language', l.lanname, 'securityDefiner', p.prosecdef,
      'volatility', p.provolatile, 'parallel', p.proparallel,
      'settings', (SELECT jsonb_agg(v) FROM unnest(p.proconfig) v
        WHERE split_part(v,'=',1) IN ('search_path','statement_timeout','lock_timeout')),
      'normalizedBodyMd5', md5(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g'))),
      'executeAnon', has_function_privilege('anon',p.oid,'EXECUTE'),
      'executeAuthenticated', has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'executeServiceRole', has_function_privilege('service_role',p.oid,'EXECUTE'),
      'publicExecute', EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) ORDER BY n.nspname,p.proname,p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.prokind='f'
      AND p.proname IN ('deleted_comment_placeholders','consume_forum_rate_limit','can_access_public_circle'))
) AS audit_metadata;
ROLLBACK;
