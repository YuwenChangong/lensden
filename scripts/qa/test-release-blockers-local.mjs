import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import pg from 'pg';
import { FILES, HISTORY, LIMITS, assertMigrationInventory, loadReleaseSql, openReleaseConnection, executeReleasePhase, readState } from './release-migration-phases.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const id = randomBytes(6).toString('hex'), name = `ogh-release-${id}`, network = `${name}-local`;
const docker = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const env = Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
env.POSTGRES_PASSWORD = randomBytes(24).toString('hex');
const checks = [];
const check = (value, label) => { assert.ok(value, label); checks.push(label); };
function command(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, args, { env, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    const output = []; let size = 0;
    const timer = setTimeout(() => { child.kill(); reject(Error('LOCAL_DOCKER_DEADLINE')); }, 60000);
    child.stdout.on('data', b => { size += b.length; if (size < 2e6) output.push(b); });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(Error('LOCAL_DOCKER_START')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(output).toString()) : reject(Error('LOCAL_DOCKER_COMMAND')); });
    child.stdin.end(input);
  });
}
let containerCreated = false, networkCreated = false, admin, config, cleanup = 'BLOCKED';
let failure, step = 'INIT';
const quote = s => "'" + s.replaceAll("'", "''") + "'";
const read = f => readFile(path.join(root, f), 'utf8');
const ids = Array.from({ length: 18 }, () => randomUUID());
const [A, B, ADMIN, circle, hiddenCircle, post, hiddenPost, publicComment, ownHidden, otherHidden, postAuthorHidden] = ids;

try {
  const context = JSON.parse(await command(['context','inspect']))[0];
  check(/^npipe:\/\//.test(context.Endpoints.docker.Host), 'LOCAL_DOCKER_ENGINE_ONLY');
  await command(['network','create','--label',`ogh.release.owner=${id}`,network]); networkCreated = true;
  await command(['run','-d','--pull=never','--name',name,'--label',`ogh.release.owner=${id}`,
    '--network',network,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD',
    'public.ecr.aws/supabase/postgres:17.6.1.165','postgres','-D','/var/lib/postgresql/data','-c','listen_addresses=*']); containerCreated = true;
  const inspect = JSON.parse(await command(['inspect',name]))[0];
  check(inspect.Config.Labels['ogh.release.owner'] === id, 'OWNED_EPHEMERAL_CONTAINER');
  check(Object.keys(inspect.NetworkSettings.Networks).join() === network, 'OWNED_DATABASE_NETWORK_NO_SHARED_SUPABASE');
  step = 'DATABASE_START';
  for (let i = 0; i < 40; i++) {
    try { await command(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']); break; }
    catch { if (i === 39) throw Error('LOCAL_DB_START'); await new Promise(r => setTimeout(r, 500)); }
  }
  const running = JSON.parse(await command(['inspect',name]))[0];
  const port = running.NetworkSettings.Ports['5432/tcp']?.[0];
  check(port?.HostIp === '127.0.0.1', 'LOOPBACK_ONLY_DATABASE_PORT');
  config = { host: '127.0.0.1', port: +port.HostPort, user: 'postgres', database: 'postgres',
    password: env.POSTGRES_PASSWORD, ssl: false, connectionTimeoutMillis: LIMITS.connection,
    statement_timeout: LIMITS.statement, lock_timeout: LIMITS.lock,
    idle_in_transaction_session_timeout: LIMITS.idle, query_timeout: LIMITS.query };
  admin = new pg.Client(config); admin.on('error', () => {}); await admin.connect();
  step = 'MINIMAL_SOURCE_DERIVED_FIXTURE';
  await admin.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon,authenticated;
  CREATE TYPE public.comment_status AS ENUM ('published','pending','deleted');
  CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text);
  CREATE TABLE public.circles(id uuid PRIMARY KEY,owner_id uuid,name text,slug text,status text);
  CREATE TABLE public.posts(id uuid PRIMARY KEY,author_id uuid,circle_id uuid,status text,moderation_status text);
  CREATE TABLE public.comments(id uuid PRIMARY KEY,post_id uuid,parent_id uuid,author_id uuid,body text,status public.comment_status,moderation_status text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
  CREATE TABLE public.comment_reactions(id uuid DEFAULT gen_random_uuid(),comment_id uuid,user_id uuid,reaction_type text DEFAULT 'like',created_at timestamptz DEFAULT now());
  CREATE TABLE public.forum_upload_attempts(user_id uuid,ip_hash text,purpose text,bytes bigint,created_at timestamptz);
  CREATE FUNCTION public.current_user_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT role FROM public.profiles WHERE id=auth.uid() $$;
  CREATE FUNCTION public.is_moderator_or_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(public.current_user_role() IN ('moderator','admin'),false) $$;
  ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
  GRANT SELECT ON public.comments,public.posts,public.circles TO anon,authenticated;
  CREATE SCHEMA supabase_migrations;
  CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
  `);
  // Simulated provider-history metadata ONLY in the owned fixture,never exported
  // as Production history or used to reconcile/repair a real migration ledger.
  for (const row of HISTORY) await admin.query('INSERT INTO supabase_migrations.schema_migrations VALUES ($1,$2,$3::text[])', [row.version,row.name,['LOCAL_HISTORY_FIXTURE_ONLY']]);
  // Actual canonical helper/policy SQL, not permissive test substitutes.
  await admin.query(await read('supabase/migrations/20260713_comment_reaction_visibility_authorization.sql'));
  await admin.query(await read('supabase/migrations/20260713_comment_read_circle_visibility_authorization.sql'));
  await admin.query(`INSERT INTO public.profiles VALUES (${quote(A)},'user'),(${quote(B)},'user'),(${quote(ADMIN)},'admin');
  INSERT INTO public.circles VALUES (${quote(circle)},${quote(A)},'Public fixture','public-fixture','active'),(${quote(hiddenCircle)},${quote(A)},'Hidden fixture','hidden-fixture','hidden');
  INSERT INTO public.posts VALUES (${quote(post)},${quote(A)},${quote(circle)},'published','published'),(${quote(hiddenPost)},${quote(A)},${quote(hiddenCircle)},'published','published');
  INSERT INTO public.comments(id,post_id,author_id,body,status,moderation_status) VALUES
  (${quote(publicComment)},${quote(post)},${quote(B)},'public','published','published'),
  (${quote(ownHidden)},${quote(hiddenPost)},${quote(A)},'not public','published','hidden_by_admin'),
  (${quote(otherHidden)},${quote(hiddenPost)},${quote(B)},'not public','published','hidden_by_admin'),
  (${quote(postAuthorHidden)},${quote(post)},${quote(B)},'not public','published','hidden_by_admin');
  INSERT INTO public.comment_reactions(comment_id,user_id) VALUES (${quote(publicComment)},${quote(A)}),(${quote(publicComment)},${quote(B)}),(${quote(ownHidden)},${quote(A)}),(${quote(otherHidden)},${quote(B)}),(${quote(postAuthorHidden)},${quote(B)});
  CREATE POLICY comment_reactions_select_public ON public.comment_reactions FOR SELECT TO anon,authenticated
    USING (EXISTS (SELECT 1 FROM public.comments c WHERE c.id=comment_reactions.comment_id AND c.status='published'::public.comment_status));`);
  const migrations = await loadReleaseSql(root);
  const inventory = (await readdir(path.join(root,'supabase/migrations'))).filter(f=>f.endsWith('.sql'));
  assertMigrationInventory(inventory);
  assert.throws(() => assertMigrationInventory([...inventory,'20990101000000_unreviewed.sql']), {code:'RELEASE_UNREVIEWED_MIGRATION_INVENTORY'});
  check(true, 'UNREVIEWED_SQL_FILE_INVENTORY_REJECTED');
  // The original quota migration creates the exact baseline only in this NEW DB.
  await admin.query(migrations[3].sql);
  // Supabase's image default privileges differ from the captured Production ACL.
  await admin.query('REVOKE ALL ON public.comment_reactions FROM anon,authenticated;');
  const initial = await readState({ query: (...args) => admin.query(...args) });
  async function visible(role, actor) {
    await admin.query('BEGIN;');
    try {
      await admin.query(`SET LOCAL ROLE ${role};`);
      await admin.query("SELECT set_config('request.jwt.claim.sub',$1,true);", [actor ?? '']);
      return (await admin.query('SELECT comment_id,user_id FROM public.comment_reactions ORDER BY comment_id,user_id;')).rows;
    } finally { await admin.query('ROLLBACK;'); }
  }
  for (const [role, actor] of [['anon',null],['authenticated',A],['authenticated',B]]) {
    await assert.rejects(visible(role, actor), { code: '42501' });
    check(true, `${role}_${actor === B ? 'B' : actor ? 'A' : 'ANON'}_PRODUCTION_STYLE_NO_GRANT_DENIES`);
  }
  await admin.query(migrations[1].sql);
  check((await visible('anon')).every(r => r.comment_id === publicComment), 'ANON_WITH_ORIGINAL_GRANTS_PUBLIC_ONLY');
  check((await visible('authenticated',A)).some(r => r.comment_id === ownHidden), 'PROVEN_AUTHOR_HIDDEN_REACTION_EXPANSION');
  check((await visible('authenticated',A)).some(r => r.comment_id === postAuthorHidden), 'PROVEN_POST_AUTHOR_HIDDEN_REACTION_EXPANSION');
  check((await visible('authenticated',B)).some(r => r.comment_id === otherHidden), 'PROVEN_B_HIDDEN_REACTION_EXPANSION');
  check(!(await visible('authenticated',B)).some(r => r.comment_id === ownHidden), 'UNRELATED_USER_STILL_CANNOT_READ_OTHER_HIDDEN_COMMENT');
  await admin.query(migrations[0].sql);
  for (const actor of [A,B,ADMIN]) {
    const rows = await visible('authenticated',actor);
    check(rows.length === 2 && rows.every(r => r.comment_id === publicComment), `ALIGNED_${actor === A ? 'A' : actor === B ? 'B' : 'ADMIN'}_PUBLIC_REACTIONS_ONLY`);
  }
  check((await visible('anon')).length === 2, 'ALIGNED_ANON_LEGITIMATE_PUBLIC_REACTIONS_RETAINED');
  const aligned = await readState({ query: (...args) => admin.query(...args) });
  check(JSON.stringify(initial.dependency_policies) === JSON.stringify(aligned.dependency_policies), 'NO_OTHER_BUSINESS_RLS_CHANGED');
  check(JSON.stringify(initial.policies.filter(p => p.cmd !== 'r')) === JSON.stringify(aligned.policies.filter(p => p.cmd !== 'r')), 'SELF_WRITE_POLICY_IDENTITIES_UNCHANGED');
  await admin.query(migrations[0].sql);
  check(JSON.stringify(aligned) === JSON.stringify(await readState({query:(...a)=>admin.query(...a)})), 'ALREADY_ALIGNED_POLICY_RERUN_IS_NOOP');
  await admin.query('DROP POLICY comment_reactions_select_public ON public.comment_reactions;');
  const canonicalOnly = await readState({query:(...a)=>admin.query(...a)});
  await admin.query(migrations[0].sql);
  check(JSON.stringify(canonicalOnly) === JSON.stringify(await readState({query:(...a)=>admin.query(...a)})), 'CANONICAL_CLEAN_POLICY_SET_NEEDS_NO_NEW_POLICY');
  await admin.query('CREATE POLICY comment_reactions_select_public ON public.comment_reactions FOR SELECT TO anon,authenticated USING (true);');
  await assert.rejects(admin.query(migrations[0].sql), {code:'P0001'}); await admin.query('ROLLBACK;');
  check(true, 'UNREVIEWED_EXISTING_POLICY_DEFINITION_REJECTED_NOT_OVERWRITTEN');
  // Reset only this owned fixture to the captured before-GRANT policy combination.
  await admin.query(`REVOKE ALL ON public.comment_reactions FROM anon,authenticated;
  REVOKE ALL(id,comment_id,user_id,reaction_type,created_at) ON public.comment_reactions FROM anon,authenticated;
  ALTER POLICY comment_reactions_select_public ON public.comment_reactions USING (EXISTS (SELECT 1 FROM public.comments c WHERE c.id=comment_reactions.comment_id AND c.status='published'::public.comment_status));`);
  const baseline = await readState({ query: (...args) => admin.query(...args) });
  const open = fault => {
    const factory = openReleaseConnection(config);
    return async () => {
      const connection = await factory();
      return { close: () => connection.close(), query: async (sql, values, timeout) => {
        await fault?.(sql, connection);
        return connection.query(sql, values, timeout);
      } };
    };
  };
  step = 'ATOMIC_PHASE_FAILURES';
  const ledgerFailure = await executeReleasePhase({root,index:0,expectedBefore:baseline,open:open(async(sql,c) => {
    if (sql.startsWith('INSERT INTO supabase_migrations')) await c.query('SET LOCAL ROLE anon;');
  })});
  check(ledgerFailure.status === 'BLOCKED' && ledgerFailure.failure === '42501', 'REAL_LEDGER_PERMISSION_FAILURE_STOPS');
  check(JSON.stringify(baseline) === JSON.stringify(await readState({query:(...a)=>admin.query(...a)})), 'LEDGER_FAILURE_ROLLS_BACK_POLICY_AND_HISTORY_ATOMICALLY');
  const interrupted = await executeReleasePhase({root,index:0,expectedBefore:baseline,open:open(async(sql,c) => {
    if (sql.startsWith('INSERT INTO supabase_migrations')) { await c.close(); throw Error('LOCAL_SIMULATED_DISCONNECT'); }
  })});
  check(interrupted.status === 'BLOCKED', 'DISCONNECT_BEFORE_COMMIT_STOPS_NO_RETRY');
  check(JSON.stringify(baseline) === JSON.stringify(await readState({query:(...a)=>admin.query(...a)})), 'DISCONNECT_BEFORE_COMMIT_LEAVES_NO_PARTIAL_DDL');
  const blocker = new pg.Client(config); blocker.on('error',()=>{}); await blocker.connect();
  try {
    await blocker.query('BEGIN; LOCK TABLE supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE;');
    const started = Date.now();
    const locked = await executeReleasePhase({root,index:0,expectedBefore:baseline,open:open()});
    check(locked.failure === '55P03' && Date.now()-started < 5000, 'REAL_ONE_SECOND_LOCK_TIMEOUT');
  } finally { await blocker.query('ROLLBACK;'); await blocker.end(); }
  const timed = await executeReleasePhase({root,index:0,expectedBefore:baseline,open:open(async(sql,c) => {
    if (sql === migrations[0].body) await c.query('SELECT pg_sleep(9);');
  })});
  check(timed.failure === '57014', 'REAL_EIGHT_SECOND_STATEMENT_TIMEOUT');
  const invalid = structuredClone(baseline); invalid.ledger.push({version:'20990101000000',name:'unreviewed',hash:'0'.repeat(64)});
  await assert.rejects(executeReleasePhase({root,index:0,expectedBefore:invalid,open:open()}), {code:'RELEASE_UNREVIEWED_HISTORY'});
  check(true, 'UNKNOWN_LEDGER_HISTORY_STOPS_BEFORE_CONNECT');
  const wrongState = structuredClone(baseline); wrongState.rls.on = false;
  const drift = await executeReleasePhase({root,index:0,expectedBefore:wrongState,open:open()});
  check(drift.failure === 'RELEASE_BEFORE_STATE_DRIFT', 'OBJECT_DRIFT_STOPS_BEFORE_DDL');
  await assert.rejects(executeReleasePhase({root,index:4,expectedBefore:baseline,open:open()}), {code:'RELEASE_PHASE_REJECTED'});
  check(true, 'UNREVIEWED_MIGRATION_INDEX_REJECTED');
  step = 'EXACT_FOUR_PHASE_EXECUTION';
  let state = baseline;
  for (let index = 0; index < FILES.length; index++) {
    const result = await executeReleasePhase({root,index,expectedBefore:state,open:open()});
    check(result.status === 'PASS' && result.cleanup === 'PASS' && result.queryDispatches <= 15, `EXACT_PHASE_${index}_SQL_AND_HISTORY_COMMIT`);
    state = result.state;
  }
  check(state.ledger.length === HISTORY.length+4, 'ONLY_FOUR_FROZEN_TARGETS_REGISTERED');
  check(JSON.stringify(baseline.quota) === JSON.stringify(state.quota), 'RATE_LIMIT_OID_BODY_SECURITY_ACL_NOT_OVERWRITTEN');
  await assert.rejects(executeReleasePhase({root,index:3,expectedBefore:state,open:open()}), {code:'RELEASE_PHASE_ORDER_OR_REENTRY'});
  check(true, 'ALREADY_APPLIED_STAGE_IS_NOT_REPLAYED');
  const missingQuota = structuredClone(state); missingQuota.quota = null;
  await assert.rejects(executeReleasePhase({root,index:0,expectedBefore:missingQuota,open:open()}), {code:'RELEASE_BASELINE_REQUIRED'});
  check(true, 'PRODUCTION_STYLE_MISSING_QUOTA_CANNOT_CREATE');
  const fixedRead = await visible('authenticated',A);
  check(fixedRead.length === 2, 'ATOMIC_RELEASE_RETAINS_LEGITIMATE_OLD_COMMENT_READ_SHAPE');
  await admin.query('BEGIN; SET LOCAL ROLE authenticated;');
  await admin.query("SELECT set_config('request.jwt.claim.sub',$1,true);",[A]);
  check((await admin.query('DELETE FROM public.comment_reactions WHERE user_id=$1',[B])).rowCount === 0, 'A_CANNOT_DELETE_B_REACTION');
  await assert.rejects(admin.query('INSERT INTO public.comment_reactions(comment_id,user_id,reaction_type) VALUES ($1,$2,$3)',[publicComment,B,'like']),{code:'42501'});
  await admin.query('ROLLBACK;'); check(true, 'A_CANNOT_INSERT_AS_B_REACTION');
  // Lost COMMIT acknowledgement: real DB COMMIT, but client reports disconnect.
  await admin.query(`DELETE FROM supabase_migrations.schema_migrations WHERE version=${quote(FILES[3].version)};`);
  const beforeLost = await readState({query:(...a)=>admin.query(...a)});
  const lost = await executeReleasePhase({root,index:3,expectedBefore:beforeLost,open:open(async(sql,c)=>{
    if (sql === 'COMMIT;') { await c.query(sql); await c.close(); throw Error('LOCAL_LOST_COMMIT_ACK'); }
  })});
  check(lost.status === 'UNKNOWN_COMMIT' && lost.retries === 0, 'LOST_COMMIT_ACK_IS_UNKNOWN_NOT_RETRIED');
  const reconciled = await readState({query:(...a)=>admin.query(...a)});
  check(reconciled.ledger.length === HISTORY.length+4 && JSON.stringify(reconciled.quota) === JSON.stringify(baseline.quota), 'READONLY_REENTRY_INSPECTION_PROVES_COMMITTED_OBJECT_AND_LEDGER');
  const server = net.createServer(socket => { socket.on('error',()=>{}); setTimeout(()=>socket.destroy(),1000).unref(); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const client = new pg.Client({...config,port:server.address().port,connectionTimeoutMillis:150});
    client.on('error',()=>{}); const start = Date.now();
    await assert.rejects(client.connect()); await client.end().catch(()=>{});
    check(Date.now()-start < 2000, 'SAME_DRIVER_CONNECTION_TIMEOUT_IS_ENFORCED_ON_LOOPBACK');
  } finally { await new Promise(resolve => server.close(resolve)); }
  let destroyed = false;
  class StalledCloseFixture {
    constructor() { this.connection = {stream:{destroy:()=>{destroyed=true;}}}; }
    on() {}
    async connect() {}
    end() { return new Promise(()=>{}); }
  }
  const stalled = await openReleaseConnection(config,{Client:StalledCloseFixture,closeMs:25})();
  await assert.rejects(stalled.close(), {code:'STAGE_B_CONNECTION_CLOSE_FAILED'});
  check(destroyed, 'CLOSE_DEADLINE_DESTROYS_SOCKET_AND_REPORTS_FAILURE');
} catch (error) {
  failure = error instanceof assert.AssertionError ? error.message.slice(0,160) : /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : /^LOCAL_[A-Z_]+$/.test(error.message ?? '') ? error.message : 'LOCAL_REHEARSAL_FAILED';
  process.exitCode = 1;
  if (/^(must be owner of|permission denied for) [a-zA-Z_ .()]+$/.test(error.message ?? '')) checks.push('LOCAL_PERMISSION_DIAGNOSTIC:'+error.message);
  if (step === 'DATABASE_START' && containerCreated) {
    try {
      const settings = await command(['exec',name,'psql','-X','-U','postgres','-d','postgres','-tA','-c',"SELECT current_setting('listen_addresses'),current_setting('port');"]);
      if (/^[*a-z0-9.,:|\s]+$/i.test(settings)) checks.push('LOCAL_BOOT_SETTINGS:'+settings.trim());
      if (['Connection terminated unexpectedly','Connection terminated due to connection timeout'].includes(error.message)) failure = error.message;
    } catch { /* Keep raw database logs private. */ }
  }
} finally {
  await admin?.end().catch(()=>{});
  try {
    if (containerCreated) {
      const owned = JSON.parse(await command(['inspect',name]))[0];
      assert.equal(owned.Config.Labels['ogh.release.owner'],id);
      await command(['rm','-f','-v',name]);
    }
    if (networkCreated) {
      const owned = JSON.parse(await command(['network','inspect',network]))[0];
      assert.equal(owned.Labels['ogh.release.owner'],id);
      await command(['network','rm',network]);
    }
    cleanup = 'PASS';
  } catch { process.exitCode = 1; }
  delete env.POSTGRES_PASSWORD;
}
console.log(JSON.stringify({status:!failure && cleanup === 'PASS'?'PASS':'BLOCKED',step,failure,tests:checks.length,checks,cleanup,
  fixture:'ISOLATED_POSTGRES_WITH_ACTUAL_CANONICAL_RLS_SQL_NOT_AUTH_E2E',productionRequests:0,productionWrites:0}));
