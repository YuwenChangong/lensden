import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { createServer } from 'vite';
import { bindModeratorOwner, verifyModeratorAcceptance, moderatorOwnerContract } from './qa/admin-mfa-activation/moderator-owner-contract.v1.mjs';

// Same owned PG17 + repository migrations/Auth facade as the existing closure
// fixture. New cases only: not a full Supabase replay or Production privilege proof.
const migrationName = '20261024103015_staff_user_safety_target_boundary.sql';
const source = name => readFile(path.join(process.cwd(), 'supabase/migrations', name), 'utf8');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)));
const temp = await mkdtemp(path.join(os.tmpdir(), 'ogh-safety-boundary-'));
const data = path.join(temp, 'data');
const listener = net.createServer();
await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const ids = Object.fromEntries(['user', 'otherUser', 'moderator', 'otherModerator', 'admin', 'otherAdmin'].map((name, index) => [name, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]));
let tests = 0, db, initialized = false, started = false, failure;
async function test(label, run) { await run(); tests++; console.log(`PASS ${label}`); }
async function command(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, 20000);
    const collect = chunk => { output += chunk; if (output.length > 1048576) { expired = true; child.kill(); } };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); child.stdout.destroy(); child.stderr.destroy(); resolve({ code, output, expired }); });
  });
}
const sql = text => db.query(text);
async function transaction(work) {
  await sql('BEGIN');
  try { return await work(); } finally { await sql('ROLLBACK'); }
}
async function actor(name, work, aal = 'aal2', role = 'authenticated', extra = {}) {
  return transaction(async () => {
    await sql(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids[name], role, aal, ...extra })]);
    return work();
  });
}
const insert = (target, by) => `INSERT INTO public.user_safety_states(user_id,status,updated_by) VALUES ('${ids[target]}','banned','${ids[by]}') RETURNING user_id`;
const update = (target, by) => `UPDATE public.user_safety_states SET status='banned',updated_by='${ids[by]}' WHERE user_id='${ids[target]}' RETURNING user_id`;
const event = (target, by) => `INSERT INTO public.user_safety_events(user_id,actor_id,event_type) VALUES ('${ids[target]}','${ids[by]}','ban') RETURNING id`;
const upsert = (target, by) => `INSERT INTO public.user_safety_states(user_id,status,updated_by) VALUES ('${ids[target]}','banned','${ids[by]}') ON CONFLICT(user_id) DO UPDATE SET status='banned',updated_by='${ids[by]}' RETURNING user_id`;
async function denied(run) { await assert.rejects(run, error => error.code === '42501'); }

try {
  let result = await command('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale']);
  assert.equal(result.code, 0, result.output); assert.equal(result.expired, false); initialized = true;
  result = await command('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c max_connections=8`, '-w', '-t', '15', 'start']);
  assert.equal(result.code, 0, result.output); assert.equal(result.expired, false); started = true;
  db = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
  await db.connect();
  assert.match((await sql('SHOW server_version')).rows[0].server_version, /^17\./);
  await sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;`);
  for (const name of ['20260518_forum_phase1_schema.sql', '20260626_user_safety_states_and_bans.sql', '20260620_lock_profile_role_updates.sql']) await sql(await source(name));
  // Profile reads are part of the actual user-client path; no profile role UPDATE.
  await sql('GRANT SELECT ON public.profiles TO authenticated;');
  for (const [name, id] of Object.entries(ids)) {
    await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)', [id, `${name}@example.invalid`]);
    await db.query('UPDATE public.profiles SET role=$1 WHERE id=$2', [/admin/i.test(name) ? 'admin' : /moderator/i.test(name) ? 'moderator' : 'user', id]);
    await db.query('INSERT INTO public.user_safety_states(user_id) VALUES ($1)', [id]);
  }
  const aal2 = await source('20261024043314_admin_staff_aal2_capabilities.sql');
  const delta = await source(migrationName);
  await test('new guard requires the staff AAL2 migration first', async () => {
    await assert.rejects(() => transaction(() => sql(delta)), /USER_SAFETY_AAL2_BASELINE_REQUIRED/);
  });
  await test('original AAL2 and new boundary apply atomically; deliberate failure rolls both back', async () => {
    const before = (await sql("SELECT pg_get_functiondef('public.is_moderator_or_admin()'::regprocedure) AS body")).rows[0].body;
    await assert.rejects(() => transaction(() => sql(`${aal2}\n${delta}\nSELECT 1/0;`)), error => error.code === '22012');
    assert.equal((await sql("SELECT pg_get_functiondef('public.is_moderator_or_admin()'::regprocedure) AS body")).rows[0].body, before);
    assert.equal((await sql("SELECT to_regprocedure('public.enforce_user_safety_target_boundary()') AS guard")).rows[0].guard, null);
    await sql(`BEGIN; ${aal2}\n${delta} COMMIT;`);
  });
  await test('replay is rejected', async () => {
    await assert.rejects(() => transaction(() => sql(delta)), /USER_SAFETY_BOUNDARY_ALREADY_PRESENT/);
  });

  for (const [by, target, allowed] of [
    ['moderator', 'user', true], ['moderator', 'moderator', false], ['moderator', 'otherModerator', false], ['moderator', 'admin', false],
    ['admin', 'user', true], ['admin', 'moderator', true], ['admin', 'admin', false], ['admin', 'otherAdmin', false], ['user', 'otherUser', false],
  ]) {
    await test(`${by} -> ${target}: INSERT/UPDATE/UPSERT/audit ${allowed ? 'allowed' : 'denied'}`, async () => {
      // INSERT needs a fresh target row; every case rolls back its fixture deletion.
      for (const [kind, statement] of [['insert', insert(target, by)], ['update', update(target, by)], ['upsert', upsert(target, by)], ['event', event(target, by)]]) {
        const run = () => actor(by, async () => {
          const result = await sql(statement);
          assert.equal(result.rowCount, allowed ? 1 : 0);
        });
        if (kind === 'insert') {
          await transaction(async () => {
            // Owner-only fixture setup, before switching to the actual actor.
            await sql('ALTER TABLE public.user_safety_states DISABLE TRIGGER trg_user_safety_states_target_boundary');
            await sql(`DELETE FROM public.user_safety_states WHERE user_id='${ids[target]}'`);
            await sql('ALTER TABLE public.user_safety_states ENABLE TRIGGER trg_user_safety_states_target_boundary');
            await sql(`SET LOCAL ROLE authenticated`);
            await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids[by], role: 'authenticated', aal: 'aal2' })]);
            if (allowed) assert.equal((await sql(statement)).rowCount, 1);
            else await denied(() => sql(statement));
          });
        } else if (allowed) await run();
        else if (by === 'user' && kind === 'update') await run(); // RLS hides the target row.
        else await denied(run);
      }
    });
  }
  await test('AAL1, unknown assurance and role metadata cannot grant staff writes', async () => {
    for (const by of ['moderator', 'admin']) for (const aal of ['aal1', null, 'aal3']) {
      await denied(() => actor(by, () => sql(upsert('user', by)), aal));
      await actor(by, async () => assert.equal((await sql(update('user', by))).rowCount, 0), aal);
      await denied(() => actor(by, () => sql(event('user', by)), aal));
    }
    await denied(() => actor('user', () => sql(upsert('otherUser', 'user')), 'aal2', 'authenticated', { user_metadata: { role: 'admin', aal: 'aal2' } }));
  });
  await test('UPDATE cannot move a permitted record to another identity or rewrite creation time', async () => {
    for (const set of [`user_id='${ids.otherUser}'`, `user_id='${ids.admin}'`, "created_at=created_at-interval '1 day'"]) {
      await denied(() => actor('moderator', () => sql(`UPDATE public.user_safety_states SET ${set},updated_by='${ids.moderator}' WHERE user_id='${ids.user}' RETURNING user_id`)));
    }
  });
  await test('actor attribution cannot be forged, omitted or reused from another staff member', async () => {
    await denied(() => actor('moderator', () => sql(update('user', 'admin'))));
    await denied(() => actor('moderator', () => sql(event('user', 'admin'))));
    await denied(() => actor('moderator', () => sql(`UPDATE public.user_safety_states SET updated_by=null WHERE user_id='${ids.user}'`)));
    await denied(() => actor('moderator', () => sql(`UPDATE public.profiles SET role='admin' WHERE id='${ids.moderator}'`)));
  });
  await test('anonymous/service-role direct writes and user deletes/truncates remain forbidden', async () => {
    for (const role of ['anon', 'service_role']) await denied(() => actor('moderator', () => sql(upsert('user', 'moderator')), 'aal2', role));
    for (const statement of ['DELETE FROM public.user_safety_states', 'TRUNCATE public.user_safety_states', 'UPDATE public.user_safety_events SET reason=reason', 'DELETE FROM public.user_safety_events']) {
      await denied(() => actor('admin', () => sql(statement)));
    }
  });
  await test('extra permissive policies or definer RPC cannot bypass the trigger', async () => {
    await sql(`CREATE POLICY local_drift ON public.user_safety_states FOR ALL TO authenticated USING(true) WITH CHECK(true);
      CREATE FUNCTION public.local_safety_proxy(target uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
        UPDATE public.user_safety_states SET status='banned',updated_by=auth.uid() WHERE user_id=target;
      $$; GRANT EXECUTE ON FUNCTION public.local_safety_proxy(uuid) TO authenticated;`);
    await denied(() => actor('moderator', () => sql(`SELECT public.local_safety_proxy('${ids.admin}')`)));
    await denied(() => actor('user', () => sql(`SELECT public.local_safety_proxy('${ids.otherUser}')`)));
    await denied(() => actor('moderator', () => sql(`SELECT public.local_safety_proxy('${ids.user}')`), 'aal1'));
    await actor('moderator', () => sql(`SELECT public.local_safety_proxy('${ids.user}')`));
    await sql('DROP FUNCTION public.local_safety_proxy(uuid); DROP POLICY local_drift ON public.user_safety_states;');
  });
  await test('unguarded definer delete/audit rewrite still fails even if grants drift', async () => {
    await transaction(async () => {
      await sql('CREATE FUNCTION public.local_safety_delete() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ DELETE FROM public.user_safety_states; $$;');
      // Empty UPDATE would not fire a row trigger; test deletion on the seeded states.
      await sql('SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids.admin, role: 'authenticated', aal: 'aal2' })]);
      await denied(() => sql('SELECT public.local_safety_delete()'));
    });
    await transaction(async () => {
      await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids.moderator, role: 'authenticated', aal: 'aal2' })]);
      await sql(event('user', 'moderator'));
      await sql("CREATE FUNCTION public.local_audit_update() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.user_safety_events SET reason='forged'; $$;");
      await sql('SET LOCAL ROLE authenticated');
      await denied(() => sql('SELECT public.local_audit_update()'));
    });
  });
  await test('existing self-state reads and staff queries remain available', async () => {
    await actor('user', async () => assert.equal((await sql(`SELECT status FROM public.user_safety_states WHERE user_id='${ids.user}'`)).rowCount, 1), 'aal1');
    await actor('moderator', async () => assert.equal((await sql(`SELECT status FROM public.user_safety_states WHERE user_id='${ids.user}'`)).rowCount, 1));
    assert.equal((await sql("SELECT has_function_privilege('authenticated','public.enforce_user_safety_target_boundary()','EXECUTE') AS allowed")).rows[0].allowed, false);
  });
  await test('trusted profile changes, not metadata, immediately control target authorization', async () => {
    await transaction(async () => {
      await sql(`UPDATE public.profiles SET role='moderator' WHERE id='${ids.user}'`);
      await sql('SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids.moderator, role: 'authenticated', aal: 'aal2' })]);
      await denied(() => sql(update('user', 'moderator')));
    });
  });
  await test('direct column grants are revoked; inherited grants/membership fail closed', async () => {
    const reset = `DROP TRIGGER trg_user_safety_states_target_boundary ON public.user_safety_states;
      DROP TRIGGER trg_user_safety_events_target_boundary ON public.user_safety_events;
      DROP FUNCTION public.enforce_user_safety_target_boundary();`;
    await transaction(async () => {
      await sql(`${reset} GRANT UPDATE(status) ON public.user_safety_states TO service_role;
        GRANT UPDATE(reason) ON public.user_safety_events TO authenticated; ${delta}`);
      assert.equal((await sql("SELECT has_column_privilege('service_role','public.user_safety_states','status','UPDATE') AS allowed")).rows[0].allowed, false);
      assert.equal((await sql("SELECT has_column_privilege('authenticated','public.user_safety_events','reason','UPDATE') AS allowed")).rows[0].allowed, false);
    });
    for (const grant of [
      'CREATE ROLE local_safety_writer; GRANT UPDATE(status) ON public.user_safety_states TO local_safety_writer; GRANT local_safety_writer TO service_role',
      'CREATE ROLE local_audit_writer; GRANT UPDATE(reason) ON public.user_safety_events TO local_audit_writer; GRANT local_audit_writer TO authenticated',
      'GRANT service_role TO authenticated',
    ]) {
      await assert.rejects(() => transaction(async () => {
        await sql(`${reset} ${grant};`);
        await sql(delta);
      }), /USER_SAFETY_(EFFECTIVE_WRITE_GRANT_DRIFT|UNSAFE_ROLE_MEMBERSHIP)/, grant);
    }
  });
} catch (error) { failure = error; }
finally {
  try {
    if (db) await db.end();
    if (initialized) {
      const stopped = await command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '10', 'stop']);
      if (started) assert.equal(stopped.code, 0, 'LOCAL_PG_SHUTDOWN_FAILED');
    }
    const relative = path.relative(os.tmpdir(), temp);
    assert(relative && !relative.startsWith('..') && path.basename(temp).startsWith('ogh-safety-boundary-'));
    await rm(temp, { recursive: true, force: true });
    console.log('LOCAL_DATABASE_CLEANUP=CONFIRMED');
  } catch (error) { failure ??= error; console.log('LOCAL_DATABASE_CLEANUP=UNCONFIRMED'); }
}
if (failure) throw failure;

await test('moderator identity amendment binds independent UUID equality and unchanged protected role', async () => {
  const evidence = { authUserId: ids.moderator, workerUserId: ids.moderator, profileUserId: ids.moderator, protectedRole: 'moderator' };
  const owner = bindModeratorOwner(evidence);
  for (const changed of [{ authUserId: ids.admin }, { workerUserId: ids.admin }, { profileUserId: ids.admin }, { protectedRole: 'admin' }, { protectedRole: 'user' }]) {
    assert.throws(() => bindModeratorOwner({ ...evidence, ...changed }, owner.userId));
  }
  const pass = { userId: owner.userId, protectedRole: 'moderator', serverAal: 'aal2', adminOnlyStatus: 403 };
  verifyModeratorAcceptance(pass, owner);
  for (const changed of [{ userId: ids.admin }, { protectedRole: 'admin' }, { serverAal: 'aal1' }, { adminOnlyStatus: 200 }, { adminOnlyStatus: 503 }]) {
    assert.throws(() => verifyModeratorAcceptance({ ...pass, ...changed }, owner));
  }
  assert.equal(moderatorOwnerContract.productionAuthority, false);
  for (const pin of moderatorOwnerContract.databaseOrder) {
    assert.equal(createHash('sha256').update(await source(pin.file)).digest('hex'), pin.sha256);
  }
});
const vite = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const originalFetch = globalThis.fetch;
try {
  await test('actual admin-only purge/capability gates reject moderator before service-role creation', async () => {
    // Existing enrollment artifact has the same role guard; no new MFA tests.
    globalThis.fetch = async input => {
      const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
      assert.equal(url.origin, 'http://127.0.0.1:54321');
      const body = url.pathname === '/auth/v1/user' ? { id: ids.moderator } : { role: 'moderator' };
      assert(['/auth/v1/user', '/rest/v1/profiles'].includes(url.pathname));
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    };
    const { handleAdminCirclePurge } = await vite.ssrLoadModule('/src/lib/server/admin-circle-purge.server.ts');
    const { handleTrustedAdminRuntimeCapability } = await vite.ssrLoadModule('/src/lib/server/supabase-admin.server.ts');
    const request = new Request('http://127.0.0.1/api/admin/forum/circles/purge', { method: 'POST', headers: { authorization: 'Bearer nonsecret-local-fixture' }, body: JSON.stringify({ id: ids.user, action: 'preview' }) });
    const environment = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'nonsecret-local-fixture' };
    const dependencies = { createAdminClient() { throw new Error('SERVICE_ROLE_MUST_NOT_BE_USED'); } };
    assert.equal((await handleAdminCirclePurge(request, environment, dependencies)).status, 403);
    assert.equal((await handleTrustedAdminRuntimeCapability(request, environment, dependencies)).status, 403);
  });
} finally { globalThis.fetch = originalFetch; await vite.close(); }
console.log(`TARGETED_TESTS=${tests}/${tests}`);
console.log('PRODUCTION_REQUESTS=0\nPRODUCTION_DATABASE_CONNECTIONS=0');
