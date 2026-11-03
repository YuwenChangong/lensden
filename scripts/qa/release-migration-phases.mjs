import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { ORDERED_MIGRATION_FILENAMES } from '../build-local-supabase-replay-mirror.mjs';
import { createCatalogPostgresAdapter, prepareCatalogConnection } from './lib/catalog-production-migration-postgres-adapter.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
export const LIMITS = Object.freeze({ connection: 10000, statement: 8000, lock: 1000, idle: 15000, query: 10000, phase: 60000 });
export const FILES = Object.freeze([
  ['20261016090712', 'align_comment_reaction_select_scope', '9aa23de3d7ef0f81d235376ca963e7930007455d353a32b6e9ef475a2943bd5b'],
  ['20261015072723', 'restore_comment_reaction_application_privileges', 'df6935f6290345421b86b6917badaa4c1ea969cbb84c8a5d6b5d29ea359ec733'],
  ['20261015074931', 'safe_deleted_comment_placeholders', '74e5d378c2cca962f5ca3ec60f2903404b514bede2644c10e230d41862b68afe'],
  ['20261016061618', 'adopt_existing_forum_rate_limit_baseline', 'f860daa2a07ff1bf0c53a5497894208a6bba8424bd5a17f37d6849cf4d38ad8e'],
].map(([version, name, hash]) => Object.freeze({ version, name, hash, file: `supabase/migrations/${version}_${name}.sql` })));
export const HISTORY = Object.freeze([
  ['20260518','forum_phase1_schema'], ['20260703','moderation_action_notifications'],
  ['20260815010632','admin_circle_lifecycle_and_safe_purge'], ['20260902042807','forward_reconcile_devices'],
  ['20260904101403','forward_reconcile_security_privileges'], ['20260909195640','device_schema_v1_foundation'],
  ['20261004003349','public_device_detail_v1'], ['20261004014637','catalog_editor_presentation_v1'],
].map(([version,name]) => Object.freeze({version,name})));
export function assertMigrationInventory(names) {
  const expected = [...ORDERED_MIGRATION_FILENAMES, '20261001075335_user_preferences.sql',
    '20261004003349_public_device_detail_v1.sql', '20261004014637_catalog_editor_presentation_v1.sql',
    ...FILES.map(m => path.basename(m.file))].sort();
  if (JSON.stringify([...names].sort()) !== JSON.stringify(expected)) fail('RELEASE_UNREVIEWED_MIGRATION_INVENTORY');
}

// No CLI entry point, credential lookup, auto-connect, authorization or GO here.
// The caller must separately bind the whole before-state and this module's hash.
export async function loadReleaseSql(root) {
  assertMigrationInventory((await readdir(path.join(root, 'supabase/migrations'))).filter(f => f.endsWith('.sql')));
  return Promise.all(FILES.map(async file => {
    const sql = (await readFile(path.join(root, file.file), 'utf8')).replaceAll('\r\n', '\n');
    if (sha256(sql) !== file.hash) fail('RELEASE_SQL_HASH_DRIFT');
    const opening = /^(?:(?:--[^\n]*\n)|\s)*begin;/i.exec(sql);
    const closing = /commit;\s*$/i.exec(sql);
    if (!opening || !closing) fail('RELEASE_TRANSACTION_WRAPPER_DRIFT');
    // Only the two outer transaction-control statements are removed. All actual
    // migration statements remain byte-for-byte; the canonical source is retained.
    const body = sql.slice(0, opening[0].length).replace(/begin;$/i, '')
      + sql.slice(opening[0].length, closing.index);
    return Object.freeze({ ...file, sql, body, bodyHash: sha256(body) });
  }));
}

export async function prepareReleaseConnection(environment) {
  const config = await prepareCatalogConnection({ environment });
  return { ...config, connectionTimeoutMillis: LIMITS.connection,
    statement_timeout: LIMITS.statement, lock_timeout: LIMITS.lock,
    idle_in_transaction_session_timeout: LIMITS.idle, query_timeout: LIMITS.query,
    application_name: 'ogh-release-migration-v1' };
}
export function openReleaseConnection(config, { Client = pg.Client, closeMs = 5000 } = {}) {
  if (!Number.isInteger(closeMs) || closeMs < 1 || closeMs > 5000) fail('RELEASE_CLOSE_LIMIT_REJECTED');
  class BoundedClient extends Client {
    async end() {
      let timer;
      try {
        await Promise.race([super.end(), new Promise((_, reject) => {
          timer = setTimeout(() => {
            this.connection?.stream?.destroy();
            reject(Object.assign(new Error('RELEASE_CLOSE_DEADLINE'), { code: 'RELEASE_CLOSE_DEADLINE' }));
          }, closeMs);
        })]);
      } finally { clearTimeout(timer); }
    }
  }
  return createCatalogPostgresAdapter({ config, Client: BoundedClient });
}

export const SNAPSHOT_SQL = `SELECT jsonb_build_object(
'ledger',(SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,
 'hash',encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex')) ORDER BY version),'[]')
 FROM supabase_migrations.schema_migrations),
'policies',(SELECT jsonb_agg(jsonb_build_object('name',polname,'cmd',polcmd,'permissive',polpermissive,
 'roles',(SELECT jsonb_agg(pg_get_userbyid(x) ORDER BY pg_get_userbyid(x)) FROM unnest(polroles) x),
 'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname)
 FROM pg_policy WHERE polrelid='public.comment_reactions'::regclass),
'grants',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'column',a.attname,
 's',has_column_privilege(r.oid,a.attrelid,a.attnum,'SELECT'),
 'i',has_column_privilege(r.oid,a.attrelid,a.attnum,'INSERT'),
 'u',has_column_privilege(r.oid,a.attrelid,a.attnum,'UPDATE'),
 'd',has_table_privilege(r.oid,a.attrelid,'DELETE')) ORDER BY r.rolname,a.attname)
 FROM pg_roles r CROSS JOIN pg_attribute a WHERE r.rolname IN ('anon','authenticated')
 AND a.attrelid='public.comment_reactions'::regclass AND a.attnum>0 AND NOT a.attisdropped),
'rls',(SELECT jsonb_build_object('on',relrowsecurity,'force',relforcerowsecurity,'owner',pg_get_userbyid(relowner))
 FROM pg_class WHERE oid='public.comment_reactions'::regclass),
'helpers',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),
 'definition_hash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
 'acl',p.proacl::text) ORDER BY p.proname,p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('can_access_public_comment_read_target','can_access_comment_reaction_target','can_access_public_circle')),
'dependency_policies',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',p.polname,
 'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid),
 'roles',p.polroles::text,'cmd',p.polcmd,'permissive',p.polpermissive) ORDER BY c.relname,p.polname)
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 WHERE c.oid IN ('public.comments'::regclass,'public.posts'::regclass,'public.circles'::regclass)),
'quota',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',pg_get_userbyid(p.proowner),
 'definition_hash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'acl',p.proacl::text)
 ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='consume_forum_rate_limit'),
'placeholder',(SELECT jsonb_agg(jsonb_build_object('definition_hash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'acl',p.proacl::text,
 'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,
 'language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),'config',p.proconfig,
 'args',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),
 'body_hash',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE'),
 'execute_acl',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 'grantor',pg_get_userbyid(a.grantor),'right',a.privilege_type,'grantable',a.is_grantable))
 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a))
 ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='deleted_comment_placeholders')
) AS state;`;
export const readState = async connection => (await connection.query(SNAPSHOT_SQL)).rows[0].state;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function validateChange(before, after, index, migration) {
  for (const field of ['rls', 'helpers', 'dependency_policies', 'quota']) if (!same(before[field], after[field])) fail('RELEASE_UNEXPECTED_OBJECT_DRIFT');
  if (!before.quota || before.quota.length !== 1) fail('RELEASE_EXISTING_QUOTA_REQUIRED');
  if (index !== 0 && !same(before.policies, after.policies)) fail('RELEASE_POLICY_DRIFT');
  if (index === 0) {
    const expected = structuredClone(before.policies);
    const legacy = expected.find(p => p.name === 'comment_reactions_select_public');
    if (legacy) legacy.using = 'can_access_public_comment_read_target(comment_id)';
    if (!same(expected, after.policies)) fail('RELEASE_ALIGNMENT_POSTCHECK');
  }
  if (index !== 1 && !same(before.grants, after.grants)) fail('RELEASE_GRANT_DRIFT');
  if (index === 1) for (const grant of after.grants) {
    const authenticated = grant.role === 'authenticated';
    if (grant.s !== (authenticated ? ['id','comment_id','user_id','reaction_type'].includes(grant.column) : ['comment_id','user_id'].includes(grant.column))
      || grant.i !== (authenticated && ['comment_id','user_id','reaction_type'].includes(grant.column))
      || grant.u || grant.d !== authenticated) fail('RELEASE_GRANT_POSTCHECK');
  }
  if (index !== 2 && !same(before.placeholder, after.placeholder)) fail('RELEASE_PLACEHOLDER_DRIFT');
  if (index === 2 && (before.placeholder !== null || after.placeholder?.length !== 1)) fail('RELEASE_PLACEHOLDER_POSTCHECK');
  if (index === 2) {
    const p = after.placeholder[0], body = /as \$\$([\s\S]*?)\$\$;/i.exec(migration.sql)?.[1];
    if (p.owner !== 'postgres' || !p.definer || p.volatility !== 's' || p.language !== 'sql'
      || !same(p.config, ['search_path=""']) || !body || p.body_hash !== sha256(body)
      || p.args !== 'target_post_id uuid, visible_comment_ids uuid[]'
      || p.result !== 'TABLE(id uuid, post_id uuid, parent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone)'
      || p.service_execute || p.execute_acl.length !== 3
      || ['anon','authenticated','postgres'].some(role => !p.execute_acl.some(a => a.role === role))
      || p.execute_acl.some(a => a.grantor !== 'postgres' || a.right !== 'EXECUTE' || a.grantable)) fail('RELEASE_PLACEHOLDER_SECURITY_DRIFT');
  }
}

export async function executeReleasePhase({ root, index, open, expectedBefore }) {
  if (!Number.isInteger(index) || index < 0 || index >= FILES.length) fail('RELEASE_PHASE_REJECTED');
  const migrations = await loadReleaseSql(root), migration = migrations[index];
  const baseline = structuredClone(expectedBefore);
  if (!baseline?.ledger || !baseline.quota || baseline.quota.length !== 1) fail('RELEASE_BASELINE_REQUIRED');
  const allowedPrior = new Set(FILES.slice(0, index).map(m => m.version));
  const history = baseline.ledger.filter(row => !FILES.some(m => m.version === row.version));
  if (history.length !== HISTORY.length || HISTORY.some(known => !history.some(row => row.version === known.version && row.name === known.name))) fail('RELEASE_UNREVIEWED_HISTORY');
  for (const file of FILES) if (baseline.ledger.some(row => row.version === file.version) !== allowedPrior.has(file.version)) fail('RELEASE_PHASE_ORDER_OR_REENTRY');
  for (const file of migrations.slice(0, index)) {
    const row = baseline.ledger.find(r => r.version === file.version);
    if (row.name !== file.name || row.hash !== sha256(JSON.stringify([file.sql]))) fail('RELEASE_PRIOR_HISTORY_DRIFT');
  }
  const result = { status: 'BLOCKED', phase: migration.version, committed: false, rollback: 'NOT_ATTEMPTED', cleanup: 'NOT_ATTEMPTED', retries: 0, queryDispatches: 0 };
  let connection, commitStarted = false, timer;
  const deadline = Date.now() + LIMITS.phase;
  const query = (text, values = []) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) fail('RELEASE_PHASE_DEADLINE');
    if (result.queryDispatches >= 14) fail('RELEASE_QUERY_BUDGET');
    result.queryDispatches++;
    return connection.query(text, values, Math.min(LIMITS.query, remaining));
  };
  const timeoutSql = "SELECT current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock,current_setting('idle_in_transaction_session_timeout') AS idle;";
  const effectiveLimits = { statement: '8s', lock: '1s', idle: '15s' };
  try {
    connection = await open();
    timer = setTimeout(() => { result.deadline = true; void connection.close().catch(() => {}); }, Math.max(1, deadline-Date.now()));
    if (!same((await query(timeoutSql)).rows[0], effectiveLimits)) fail('RELEASE_STARTUP_TIMEOUT_NOT_EFFECTIVE');
    await query('BEGIN;');
    await query("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='15s'; SET LOCAL search_path=pg_catalog,public;");
    if (!same((await query(timeoutSql)).rows[0], effectiveLimits)) fail('RELEASE_TIMEOUT_NOT_EFFECTIVE');
    await query('LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;');
    const observed = await readState({query});
    if (!same(observed, baseline)) fail('RELEASE_BEFORE_STATE_DRIFT');
    if (index > 0 && observed.policies.some(p => p.cmd === 'r' && p.using !== 'can_access_public_comment_read_target(comment_id)')) fail('RELEASE_ALIGNMENT_REQUIRED');
    await query(migration.body);
    const after = await readState({query});
    validateChange(observed, after, index, migration);
    await query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ($1,$2,$3::text[]);', [migration.version, migration.name, [migration.sql]]);
    const pending = await readState({query});
    if (pending.ledger.length !== baseline.ledger.length + 1 || pending.ledger.some(row => {
      if (row.version === migration.version) return row.name !== migration.name || row.hash !== sha256(JSON.stringify([migration.sql]));
      return !baseline.ledger.some(old => same(old, row));
    })) fail('RELEASE_LEDGER_POSTCHECK');
    commitStarted = true;
    await query('COMMIT;');
    result.committed = true;
    await query('BEGIN READ ONLY;');
    const final = await readState({query});
    await query('ROLLBACK;');
    if (!same(final, pending)) fail('RELEASE_POSTCOMMIT_DRIFT');
    result.status = 'PASS';
    result.state = final;
  } catch (error) {
    result.failure = /^RELEASE_[A-Z_]+$/.test(error.code ?? '') ? error.code : /^[0-9A-Z]{5}$/.test(error.code ?? '') ? error.code : 'RELEASE_TRANSPORT_FAILURE';
    if (commitStarted) result.status = result.committed ? 'COMMITTED_POSTCHECK_UNVERIFIED' : 'UNKNOWN_COMMIT';
    else if (connection) {
      try { result.queryDispatches++; await connection.query('ROLLBACK;'); result.rollback = 'SENT'; }
      catch { result.rollback = 'UNCONFIRMED'; }
    }
  } finally {
    clearTimeout(timer);
    if (connection) try { await connection.close(); result.cleanup = 'PASS'; } catch { result.cleanup = 'BLOCKED'; }
    if (result.cleanup === 'BLOCKED' && result.status === 'PASS') result.status = 'COMMITTED_CLEANUP_FAILED';
  }
  return result;
}
