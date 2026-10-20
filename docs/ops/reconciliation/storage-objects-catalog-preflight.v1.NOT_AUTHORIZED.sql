-- OFFLINE PROPOSAL: independent SQL review and exact owner approval still required.
-- Project xcbnxzjlsvtgzixurcof; Session Pooler host is independently pinned by client.
-- Login postgres.xcbnxzjlsvtgzixurcof; expected session/effective role postgres.
-- Catalog metadata only. No storage/application/Auth rows, role secrets or SQL bodies.
-- Policy expressions are sensitive: private review only, never ordinary output.
-- No assertion here establishes the privileges of the uncreated inventory role.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SET LOCAL search_path = pg_catalog;

WITH gate AS MATERIALIZED (
  SELECT session_user = 'postgres' AND current_user = 'postgres'
    AND pg_catalog.current_database() = 'postgres'
    AND pg_catalog.current_setting('transaction_read_only') = 'on'
    AND pg_catalog.current_setting('server_version_num')::integer >= 170000
    AND pg_catalog.current_setting('server_version_num')::integer < 180000 AS matched
), target AS MATERIALIZED (
  SELECT c.oid, c.relname, c.relkind, c.relowner, c.relacl,
         c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN gate g
  WHERE g.matched AND n.nspname = 'storage' AND c.relname = 'objects'
  ORDER BY c.oid LIMIT 2
), schemas AS MATERIALIZED (
  SELECT n.oid, n.nspname, n.nspowner,
         pg_catalog.has_schema_privilege('public', n.oid, 'USAGE') AS public_usage,
         pg_catalog.has_schema_privilege('public', n.oid, 'CREATE') AS public_create,
         COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantor', a.grantor, 'privilege', a.privilege_type,
           'grantable', a.is_grantable) ORDER BY a.grantor, a.privilege_type)
           FROM (SELECT x.grantor, x.privilege_type, x.is_grantable
             FROM pg_catalog.aclexplode(COALESCE(n.nspacl,
               pg_catalog.acldefault('n', n.nspowner))) x WHERE x.grantee = 0
             ORDER BY x.grantor, x.privilege_type LIMIT 65) a),
           '[]'::jsonb) AS public_acl
  FROM pg_catalog.pg_namespace n CROSS JOIN gate g
  WHERE g.matched AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  ORDER BY n.oid LIMIT 33
), relations AS MATERIALIZED (
  SELECT c.oid, s.nspname, c.relname, c.relkind, c.relowner,
         s.public_usage AS schema_public_usage,
         s.nspname = 'storage' AS schema_usage_proposed,
         c.oid IN (SELECT t.oid FROM target t) AS is_target,
         COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantor', a.grantor, 'privilege', a.privilege_type,
           'grantable', a.is_grantable) ORDER BY a.grantor, a.privilege_type)
           FROM (SELECT x.grantor, x.privilege_type, x.is_grantable
             FROM pg_catalog.aclexplode(COALESCE(c.relacl,
               pg_catalog.acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char"
                 ELSE 'r'::"char" END, c.relowner))) x WHERE x.grantee = 0
             ORDER BY x.grantor, x.privilege_type LIMIT 65) a),
           '[]'::jsonb) AS public_acl
  FROM pg_catalog.pg_class c JOIN schemas s ON s.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND (
    c.oid IN (SELECT t.oid FROM target t)
    OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(c.relacl,
      pg_catalog.acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char"
        ELSE 'r'::"char" END, c.relowner))) a WHERE a.grantee = 0)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute ca,
      LATERAL pg_catalog.aclexplode(ca.attacl) a
      WHERE ca.attrelid = c.oid AND ca.attnum > 0 AND NOT ca.attisdropped
        AND a.grantee = 0))
  ORDER BY c.oid LIMIT 129
), public_columns AS MATERIALIZED (
  SELECT a.attrelid, a.attnum, a.attname,
         pg_catalog.has_column_privilege('public', a.attrelid, a.attnum, 'SELECT')
           AS public_effective_select,
         COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantor', x.grantor, 'privilege', x.privilege_type,
           'grantable', x.is_grantable) ORDER BY x.grantor, x.privilege_type)
           FROM (SELECT y.grantor, y.privilege_type, y.is_grantable
             FROM pg_catalog.aclexplode(a.attacl) y WHERE y.grantee = 0
             ORDER BY y.grantor, y.privilege_type LIMIT 65) x),
           '[]'::jsonb) AS public_column_acl
  FROM pg_catalog.pg_attribute a JOIN relations r ON r.oid = a.attrelid
  WHERE r.relkind <> 'S' AND a.attnum > 0 AND NOT a.attisdropped
    AND EXISTS (SELECT 1 FROM pg_catalog.aclexplode(a.attacl) x WHERE x.grantee = 0)
  ORDER BY a.attrelid, a.attnum LIMIT 257
), required_columns AS MATERIALIZED (
  SELECT v.column_name, t.oid AS relation_oid, a.attnum, a.atttypid, a.atttypmod,
         a.attnum IS NOT NULL AS column_exists,
         pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
         CASE WHEN a.attnum IS NULL THEN NULL ELSE
           pg_catalog.has_column_privilege(current_user, t.oid, a.attnum, 'SELECT')
           END AS operator_select,
         CASE WHEN a.attnum IS NULL THEN NULL ELSE
           pg_catalog.has_column_privilege(current_user, t.oid, a.attnum,
             'SELECT WITH GRANT OPTION') END AS operator_select_grant_option,
         CASE WHEN a.attnum IS NULL THEN NULL ELSE
           pg_catalog.has_column_privilege('public', t.oid, a.attnum, 'SELECT')
           END AS public_effective_select,
         COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantor', x.grantor, 'grantee', x.grantee,
           'privilege', x.privilege_type, 'grantable', x.is_grantable)
           ORDER BY x.grantee, x.grantor, x.privilege_type)
           FROM (SELECT y.grantor, y.grantee, y.privilege_type, y.is_grantable
             FROM pg_catalog.aclexplode(a.attacl) y
             ORDER BY y.grantee, y.grantor, y.privilege_type LIMIT 65) x),
           '[]'::jsonb) AS column_acl
  FROM (VALUES ('id'), ('bucket_id'), ('metadata')) v(column_name)
  LEFT JOIN target t ON true
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid
    AND a.attname = v.column_name AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN gate g WHERE g.matched
  ORDER BY v.column_name LIMIT 4
), defaults AS MATERIALIZED (
  SELECT d.oid, d.defaclrole, d.defaclnamespace, d.defaclobjtype,
         COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantor', a.grantor, 'privilege', a.privilege_type,
           'grantable', a.is_grantable) ORDER BY a.grantor, a.privilege_type)
           FROM (SELECT x.grantor, x.privilege_type, x.is_grantable
             FROM pg_catalog.aclexplode(d.defaclacl) x WHERE x.grantee = 0
             ORDER BY x.grantor, x.privilege_type LIMIT 65) a),
           '[]'::jsonb) AS public_acl
  FROM pg_catalog.pg_default_acl d CROSS JOIN gate g
  WHERE g.matched AND (d.defaclnamespace = 0
    OR d.defaclnamespace IN (SELECT s.oid FROM schemas s))
  ORDER BY d.oid LIMIT 65
), policies AS MATERIALIZED (
  SELECT p.oid, p.polname, p.polrelid, p.polcmd, p.polpermissive,
         p.polroles[1:65] AS role_oids,
         pg_catalog.cardinality(p.polroles) > 64 AS roles_truncated,
         0::oid = ANY(p.polroles) AS public_applies,
         EXISTS (SELECT 1 FROM pg_catalog.unnest(p.polroles) pr(role_oid)
           WHERE CASE WHEN pr.role_oid = 0 THEN true ELSE
             pg_catalog.pg_has_role(current_user, pr.role_oid, 'USAGE') END)
           AS operator_role_applies_only,
         CASE WHEN 0::oid = ANY(p.polroles) THEN 'PUBLIC_APPLIES_IF_RLS'
           ELSE 'NOT_APPLICABLE_TO_PROPOSED_FRESH_MEMBERSHIP_FREE_ROLE' END
           AS planned_role_policy_classification,
         p.polqual IS NULL AS using_defaults_true,
         pg_catalog.left(pg_catalog.pg_get_expr(p.polqual, p.polrelid), 2048)
           AS using_definition_private,
         pg_catalog.left(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), 2048)
           AS check_definition_private,
         pg_catalog.length(COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''))
           > 2048 OR pg_catalog.length(COALESCE(
             pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')) > 2048
           AS definition_truncated
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid IN (SELECT t.oid FROM target t) AND p.polcmd IN ('r', '*')
  ORDER BY p.oid LIMIT 65
), policy_dependencies AS MATERIALIZED (
  SELECT d.classid, d.objid, d.objsubid, d.refclassid, d.refobjid,
         d.refobjsubid, d.deptype
  FROM pg_catalog.pg_depend d
  WHERE d.classid = 'pg_catalog.pg_policy'::regclass
    AND d.objid IN (SELECT p.oid FROM policies p)
  ORDER BY d.objid, d.refclassid, d.refobjid, d.refobjsubid LIMIT 129
), routines AS MATERIALIZED (
  SELECT p.oid, n.nspname, p.proname, p.proowner, p.prokind,
         p.prosecdef, p.provolatile, p.proleakproof,
         l.lanname, l.lanpltrusted,
         pg_catalog.left(pg_catalog.pg_get_function_identity_arguments(p.oid), 1024)
           AS identity_arguments,
         pg_catalog.length(pg_catalog.pg_get_function_identity_arguments(p.oid))
           > 1024 AS arguments_truncated,
         pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
         p.proconfig IS NOT NULL AS has_local_configuration,
         COALESCE(pg_catalog.cardinality(p.proconfig), 0) AS configuration_entry_count,
         EXISTS (SELECT 1 FROM pg_catalog.unnest(p.proconfig) cfg(value)
           WHERE cfg.value LIKE 'search_path=%') AS search_path_configured,
         COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantor', a.grantor, 'privilege', a.privilege_type,
           'grantable', a.is_grantable) ORDER BY a.grantor, a.privilege_type)
           FROM (SELECT x.grantor, x.privilege_type, x.is_grantable
             FROM pg_catalog.aclexplode(COALESCE(p.proacl,
               pg_catalog.acldefault('f', p.proowner))) x WHERE x.grantee = 0
             ORDER BY x.grantor, x.privilege_type LIMIT 65) a),
           '[]'::jsonb) AS public_acl
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  CROSS JOIN gate g
  WHERE g.matched AND (
    (p.pronamespace IN (SELECT s.oid FROM schemas s)
      AND pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))
    OR p.oid IN (SELECT d.refobjid FROM policy_dependencies d
      WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass))
  ORDER BY p.oid LIMIT 129
), routine_dependencies AS MATERIALIZED (
  SELECT d.classid, d.objid, d.objsubid, d.refclassid, d.refobjid,
         d.refobjsubid, d.deptype
  FROM pg_catalog.pg_depend d
  WHERE d.classid = 'pg_catalog.pg_proc'::regclass
    AND d.objid IN (SELECT p.oid FROM routines p)
  ORDER BY d.objid, d.refclassid, d.refobjid, d.refobjsubid LIMIT 129
), roles AS MATERIALIZED (
  SELECT r.oid, r.rolname, r.rolsuper, r.rolinherit, r.rolbypassrls,
         r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolcanlogin,
         r.rolconnlimit,
         pg_catalog.pg_has_role(current_user, r.oid, 'MEMBER') AS operator_member,
         pg_catalog.pg_has_role(current_user, r.oid, 'USAGE') AS operator_inherits,
         pg_catalog.pg_has_role(session_user, r.oid, 'SET') AS operator_can_set
  FROM pg_catalog.pg_roles r CROSS JOIN gate g
  WHERE g.matched AND (
    r.rolname IN (session_user, current_user, 'anon', 'authenticated',
      'authenticator', 'service_role', 'ogh_media_inventory_reader_v1')
    OR pg_catalog.pg_has_role(current_user, r.oid, 'MEMBER')
    OR r.oid IN (SELECT t.relowner FROM target t)
    OR r.oid IN (SELECT s.nspowner FROM schemas s)
    OR r.oid IN (SELECT d.defaclrole FROM defaults d)
    OR r.oid IN (SELECT p.proowner FROM routines p)
    OR r.oid IN (SELECT d.datdba FROM pg_catalog.pg_database d
      WHERE d.datname = pg_catalog.current_database())
    OR EXISTS (SELECT 1 FROM policies p WHERE r.oid = ANY(p.role_oids)))
  ORDER BY r.oid LIMIT 65
), memberships AS MATERIALIZED (
  SELECT m.roleid, m.member, m.grantor, m.admin_option,
         m.inherit_option, m.set_option,
         m.roleid IN (SELECT r.oid FROM roles r)
           AND m.member IN (SELECT r.oid FROM roles r) AS both_endpoints_covered
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid IN (SELECT r.oid FROM roles r)
    OR m.member IN (SELECT r.oid FROM roles r)
  ORDER BY m.member, m.roleid LIMIT 129
), database_acl AS MATERIALIZED (
  SELECT d.oid, d.datname, d.datdba,
         pg_catalog.has_database_privilege('public', d.oid, 'CONNECT') AS public_connect,
         pg_catalog.has_database_privilege('public', d.oid, 'CREATE') AS public_create,
         pg_catalog.has_database_privilege('public', d.oid, 'TEMP') AS public_temp,
         COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantor', a.grantor, 'privilege', a.privilege_type,
           'grantable', a.is_grantable) ORDER BY a.grantor, a.privilege_type)
           FROM (SELECT x.grantor, x.privilege_type, x.is_grantable
             FROM pg_catalog.aclexplode(COALESCE(d.datacl,
               pg_catalog.acldefault('d', d.datdba))) x WHERE x.grantee = 0
             ORDER BY x.grantor, x.privilege_type LIMIT 65) a),
           '[]'::jsonb) AS public_acl
  FROM pg_catalog.pg_database d CROSS JOIN gate g
  WHERE g.matched AND d.datname = pg_catalog.current_database() LIMIT 2
), target_facts AS MATERIALIZED (
  SELECT t.oid, t.relname, t.relkind, t.relowner,
         t.relrowsecurity, t.relforcerowsecurity,
         pg_catalog.row_security_active(t.oid) AS operator_rls_active_only,
         pg_catalog.pg_has_role(current_user, t.relowner, 'USAGE') AS operator_inherits_owner,
         pg_catalog.pg_has_role(session_user, t.relowner, 'SET') AS operator_can_set_owner,
         pg_catalog.has_schema_privilege(current_user, 'storage',
           'USAGE WITH GRANT OPTION') AS operator_schema_usage_grant_option,
         COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantor', a.grantor, 'grantee', a.grantee,
           'privilege', a.privilege_type, 'grantable', a.is_grantable)
           ORDER BY a.grantee, a.grantor, a.privilege_type)
           FROM (SELECT x.grantor, x.grantee, x.privilege_type, x.is_grantable
             FROM pg_catalog.aclexplode(COALESCE(t.relacl,
               pg_catalog.acldefault('r', t.relowner))) x
             ORDER BY x.grantee, x.grantor, x.privilege_type LIMIT 65) a),
           '[]'::jsonb) AS table_acl
  FROM target t
), records(section, cap, row_data) AS (
  SELECT 'database', 1, pg_catalog.to_jsonb(d) FROM database_acl d
  UNION ALL SELECT 'schemas', 32, pg_catalog.to_jsonb(s) FROM schemas s
  UNION ALL SELECT 'relations', 128, pg_catalog.to_jsonb(r) FROM relations r
  UNION ALL SELECT 'public_columns', 256, pg_catalog.to_jsonb(c) FROM public_columns c
  UNION ALL SELECT 'required_columns', 3, pg_catalog.to_jsonb(c) FROM required_columns c
  UNION ALL SELECT 'defaults', 64, pg_catalog.to_jsonb(d) FROM defaults d
  UNION ALL SELECT 'policies', 64, pg_catalog.to_jsonb(p) FROM policies p
  UNION ALL SELECT 'policy_dependencies', 128, pg_catalog.to_jsonb(d) FROM policy_dependencies d
  UNION ALL SELECT 'routines', 128, pg_catalog.to_jsonb(p) FROM routines p
  UNION ALL SELECT 'routine_dependencies', 128, pg_catalog.to_jsonb(d) FROM routine_dependencies d
  UNION ALL SELECT 'roles', 64, pg_catalog.to_jsonb(r) FROM roles r
  UNION ALL SELECT 'memberships', 128, pg_catalog.to_jsonb(m) FROM memberships m
  UNION ALL SELECT 'target', 1, pg_catalog.to_jsonb(t) FROM target_facts t
), section_limits(section, cap) AS (
  VALUES ('database', 1), ('schemas', 32), ('relations', 128),
    ('public_columns', 256), ('required_columns', 3), ('defaults', 64),
    ('policies', 64), ('policy_dependencies', 128), ('routines', 128),
    ('routine_dependencies', 128), ('roles', 64), ('memberships', 128), ('target', 1)
), section_data AS MATERIALIZED (
  SELECT l.section, l.cap, pg_catalog.count(r.section) AS observed,
         pg_catalog.count(r.section) > l.cap AS truncated,
         COALESCE(pg_catalog.bool_or(pg_catalog.octet_length(r.row_data::text) > 8192),
           false) AS oversized_row,
         COALESCE(pg_catalog.bool_or(EXISTS (
           SELECT 1 FROM pg_catalog.jsonb_each(r.row_data) field(key, value)
           WHERE CASE WHEN field.key IN ('public_acl', 'public_column_acl',
             'column_acl', 'table_acl')
             THEN pg_catalog.jsonb_array_length(field.value) > 64 ELSE false END)),
           false) AS acl_truncated,
         COALESCE(pg_catalog.jsonb_agg(CASE
           WHEN pg_catalog.octet_length(r.row_data::text) > 8192
           THEN pg_catalog.jsonb_build_object('omitted_oversized_row', true)
           ELSE r.row_data END ORDER BY r.row_data::text)
           FILTER (WHERE r.section IS NOT NULL), '[]'::jsonb) AS rows
  FROM section_limits l LEFT JOIN records r ON r.section = l.section
  GROUP BY l.section, l.cap
), envelope AS MATERIALIZED (
  SELECT pg_catalog.jsonb_build_object(
    'schema', 'STORAGE_OBJECTS_CATALOG_PREFLIGHT_V1',
    'collected_at', pg_catalog.statement_timestamp(),
    'identity', pg_catalog.jsonb_build_object(
      'session_user', session_user, 'current_user', current_user,
      'database', pg_catalog.current_database(),
      'server_version_num', pg_catalog.current_setting('server_version_num'),
      'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
      'transaction_isolation', pg_catalog.current_setting('transaction_isolation'),
      'search_path', pg_catalog.current_setting('search_path'),
      'row_security', pg_catalog.current_setting('row_security'),
      'statement_timeout', pg_catalog.current_setting('statement_timeout'),
      'lock_timeout', pg_catalog.current_setting('lock_timeout'),
      'idle_transaction_timeout', pg_catalog.current_setting('idle_in_transaction_session_timeout'),
      'backend_server_port', pg_catalog.inet_server_port(),
      'sql_identity_gate', (SELECT g.matched FROM gate g)),
    'candidate_role_exists', EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname = 'ogh_media_inventory_reader_v1'),
    'policy_name_collision', EXISTS (SELECT 1 FROM pg_catalog.pg_policy p
      WHERE p.polrelid IN (SELECT t.oid FROM target t)
        AND p.polname IN ('ogh_inventory_v1_objects_allow', 'ogh_inventory_v1_objects_bound')),
    'target_count', (SELECT pg_catalog.count(*) FROM target),
    'unresolved_membership_endpoints', EXISTS (SELECT 1 FROM memberships m
      WHERE NOT m.both_endpoints_covered),
    'field_truncation', EXISTS (SELECT 1 FROM policies p
      WHERE p.roles_truncated OR p.definition_truncated)
      OR EXISTS (SELECT 1 FROM routines p WHERE p.arguments_truncated)
      OR EXISTS (SELECT 1 FROM section_data s WHERE s.acl_truncated),
    'section_cap_or_size_failure', EXISTS (SELECT 1 FROM section_data s
      WHERE s.truncated OR s.oversized_row),
    'sections', COALESCE((SELECT pg_catalog.jsonb_object_agg(s.section,
      pg_catalog.jsonb_build_object('cap', s.cap, 'observed', s.observed,
        'truncated', s.truncated, 'oversized_row', s.oversized_row,
        'acl_truncated', s.acl_truncated, 'rows', s.rows))
      FROM section_data s), '{}'::jsonb),
    'candidate_live_effective_privileges', 'NOT_ESTABLISHED_UNCREATED_ROLE',
    'routine_transitive_semantics', 'NOT_PROVEN_BY_DIRECT_DEPENDENCIES',
    'managed_service_support', 'NOT_PROVEN_BY_CATALOGS',
    'authorization', 'NO_DDL_OR_INVENTORY_AUTHORITY') AS document
), measured AS MATERIALIZED (
  SELECT e.document, pg_catalog.octet_length(e.document::text) AS document_bytes
  FROM envelope e
)
SELECT CASE WHEN m.document_bytes <= 262144 THEN m.document
  ELSE pg_catalog.jsonb_build_object(
    'schema', 'STORAGE_OBJECTS_CATALOG_PREFLIGHT_V1',
    'result_size_failure', true, 'document_bytes', m.document_bytes,
    'evidence_omitted', true, 'decision', 'BLOCKED_RESULT_SIZE')
  END AS catalog_evidence_private
FROM measured m;
ROLLBACK;
