import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Dedicated disposable fixture only: existing images, no network interface,
// no host mounts/ports, no provider clients or inherited database environment.
assert.equal(process.platform, 'win32', 'reviewed local named-pipe boundary');
const host = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const pgImage = 'public.ecr.aws/supabase/postgres:17.6.1.165';
const restImage = 'public.ecr.aws/supabase/postgrest:v16.1';
const environment = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
const prefix = `ogh-r2-claim-${randomUUID().slice(0, 8)}`;
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const post = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const checks = [];
let pgContainer, restContainer;

function run(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['--host', host, ...args], { env: environment, windowsHide: true, stdio: 'pipe' });
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => { child.kill(); finish(Error('LOCAL_COMMAND_TIMEOUT')); }, 30000);
    function finish(error, code) {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve({ code, stdout, stderr });
    }
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 1048576) { child.kill(); finish(Error('LOCAL_OUTPUT_BOUND')); } });
    child.stderr.on('data', data => { stderr += data; if (stderr.length > 1048576) { child.kill(); finish(Error('LOCAL_OUTPUT_BOUND')); } });
    child.stdin.on('error', () => {});
    child.once('error', error => finish(error)); child.once('close', code => finish(null, code));
    child.stdin.end(input);
  });
}
async function command(args, input) {
  const result = await run(args, input); assert.equal(result.code, 0, `local command failed: ${args[0]}`); return result.stdout.trim();
}
const sql = text => run(['exec', '-i', pgContainer, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', 'postgres'], text);
async function good(text) { const result = await sql(text); assert.equal(result.code, 0, result.stderr); return result.stdout.trim(); }
function asUser(text, user = owner, role = 'authenticated') {
  return `BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claims','${JSON.stringify({ sub: user, role })}',true); ${text}; COMMIT;`;
}
const insert = (n, user = owner, extra = '') => `INSERT INTO public.post_media_r2_copy_claims(post_id,user_id,mime_type${extra ? ',claim_id' : ''}) VALUES('${post(n)}','${user}','video/mp4'${extra ? `,'${extra}'` : ''}) RETURNING retained_key`;
async function denied(text, state, label) {
  const result = await sql(text); assert.notEqual(result.code, 0, label); assert.ok(result.stderr.includes(state), label); checks.push(label);
}
async function ready(args) {
  for (let n = 0; n < 30; n++) {
    const result = await run(args); if (result.code === 0) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('LOCAL_SERVICE_READINESS_TIMEOUT');
}
try {
  assert.equal(await command(['version', '--format', '{{.Server.Os}}']), 'linux');
  for (const image of [pgImage, restImage]) await command(['image', 'inspect', image, '--format', '{{.Id}}']);
  pgContainer = await command(['run', '--pull', 'never', '--rm', '-d', '--name', `${prefix}-pg`, '--network', 'none', '--memory', '512m', '--cpus', '1',
    '--tmpfs', '/tmp:rw,size=256m,mode=1777', '--user', 'postgres', '--entrypoint', 'sh', pgImage, '-ceu',
    'initdb -D /tmp/oghpg --no-locale --encoding=UTF8 --auth=trust >/dev/null; exec postgres -D /tmp/oghpg -c listen_addresses=127.0.0.1 -c shared_preload_libraries= -c max_connections=12 -c shared_buffers=16MB']);
  assert.match(pgContainer, /^[a-f0-9]{64}$/);
  await ready(['exec', pgContainer, 'pg_isready', '-q', '-U', 'postgres']);
  assert.equal(await good("SELECT current_setting('server_version_num')::integer / 10000"), '17');
  await good(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS; CREATE ROLE service_role NOLOGIN;
    CREATE ROLE authenticator LOGIN NOINHERIT; GRANT authenticated,anon TO authenticator;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid $$;
    CREATE TABLE public.posts(id uuid PRIMARY KEY,author_id uuid NOT NULL,status text NOT NULL);
    CREATE TABLE public.post_media(id uuid PRIMARY KEY,post_id uuid,kind text);
    CREATE UNIQUE INDEX post_media_one_video_per_post_idx ON public.post_media(post_id) WHERE kind='video';
    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_posts_owner ON public.posts FOR SELECT TO authenticated USING(author_id=auth.uid());
    GRANT SELECT ON public.posts TO authenticated;
    INSERT INTO public.posts SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      '${owner}'::uuid,CASE WHEN n=12 THEN 'hidden' WHEN n=13 THEN 'deleted' WHEN n=2 THEN 'pending' ELSE 'published' END FROM generate_series(2,15) n;
    INSERT INTO public.posts VALUES('${post(16)}','${other}','published');`);
  await good(await readFile(new URL('../supabase/migrations/20261020000000_post_media_r2_copy_claims.sql', import.meta.url), 'utf8'));
  checks.push('EXACT_MIGRATION_PG17_APPLIED');
  await good(asUser(insert(4))); checks.push('AUTHENTICATED_COLUMN_INSERT_AND_RETURNING');
  await denied(asUser(insert(4)), '23505', 'SEQUENTIAL_PRIMARY_KEY_REPLAY_DENIED');
  const concurrent = await Promise.all([sql(asUser(insert(5))), sql(asUser(insert(5)))]);
  assert.deepEqual(concurrent.map(r => r.code === 0).sort(), [false, true]);
  assert.ok(concurrent.find(r => r.code !== 0).stderr.includes('23505')); checks.push('TWO_REAL_SQL_SESSIONS_ONE_WINNER');
  for (const n of [12,13,16]) await denied(asUser(insert(n)), '42501', `RLS_POST_${n}_DENIED`);
  await denied(asUser(insert(6, other)), '42501', 'RLS_FOREIGN_ACTOR_DENIED');
  await denied(asUser(insert(6, owner, other)), '42501', 'CALLER_CANNOT_CHOOSE_CLAIM_UUID');
  for (const operation of ['UPDATE public.post_media_r2_copy_claims SET mime_type=\'video/webm\'', 'DELETE FROM public.post_media_r2_copy_claims', 'TRUNCATE public.post_media_r2_copy_claims']) {
    await denied(asUser(operation), '42501', `${operation.split(' ')[0]}_DENIED`);
  }
  await denied(asUser('SELECT * FROM public.post_media_r2_copy_claims', owner, 'anon'), '42501', 'ANON_NO_CLAIM_READ');
  const invisible = await good(asUser('SELECT count(*) FROM public.post_media_r2_copy_claims', other));
  assert.equal(invisible.split('\n').at(-1), '0'); checks.push('OTHER_USER_CLAIMS_INVISIBLE');
  await good(`DELETE FROM public.posts WHERE id='${post(4)}';
    UPDATE public.post_media_r2_copy_claims SET user_id=NULL,claim_id=NULL,mime_type=NULL WHERE post_id='${post(4)}';
    INSERT INTO public.posts VALUES('${post(4)}','${owner}','published');`);
  await denied(asUser(insert(4)), '23505', 'PRIVACY_MINIMIZED_TOMBSTONE_STILL_CONSUMED');
  assert.equal(await good(`SELECT count(*) FROM public.post_media_r2_copy_claims WHERE post_id='${post(4)}' AND retained_key IS NULL AND user_id IS NULL`), '1');
  checks.push('MINIMIZATION_REMOVES_ACTOR_AND_RETAINED_PATH');

  // Actual PostgREST, not a fake successful transport. It shares only the
  // fixture's network-none namespace; requests run through container loopback.
  const secret = 'synthetic-local-claim-test-key-not-a-real-secret';
  restContainer = await command(['run', '--pull', 'never', '--rm', '-d', '--name', `${prefix}-rest`, '--network', `container:${pgContainer}`, '--memory', '128m', '--cpus', '1',
    '-e', 'PGRST_DB_URI=postgres://authenticator@127.0.0.1:5432/postgres', '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon',
    '-e', 'PGRST_SERVER_HOST=127.0.0.1', '-e', 'PGRST_DB_POOL=2', '-e', `PGRST_JWT_SECRET=${secret}`, restImage]);
  assert.match(restContainer, /^[a-f0-9]{64}$/);
  await ready(['exec', pgContainer, 'curl', '--silent', '--fail', '--max-time', '2', 'http://127.0.0.1:3000/']);
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${part({ alg:'HS256',typ:'JWT' })}.${part({ sub:owner,role:'authenticated',exp:Math.floor(Date.now()/1000)+300 })}`;
  const token = `${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`;
  async function http(n) {
    const output = await command(['exec', pgContainer, 'curl', '--silent', '--show-error', '--max-time', '5', '-w', '\n%{http_code}',
      '-H', `Authorization: Bearer ${token}`, '-H', 'Content-Type: application/json', '-H', 'Prefer: return=representation', '-H', 'Accept: application/vnd.pgrst.object+json',
      '--data', JSON.stringify({ post_id:post(n),user_id:owner,mime_type:'video/mp4' }),
      'http://127.0.0.1:3000/post_media_r2_copy_claims?select=post_id,user_id,claim_id,mime_type,retained_key']);
    const lines = output.split('\n'), status = Number(lines.pop()); return { status, body:JSON.parse(lines.join('\n')) };
  }
  for (const n of [2,3]) {
    const result = await http(n); assert.equal(result.status,201,JSON.stringify(result.body));
    assert.equal(result.body.retained_key, `${owner}/${post(n)}/r2-retained-${result.body.claim_id}.mp4`);
    checks.push(`ACTUAL_POSTGREST_${n===2?'PENDING':'PUBLISHED'}_INSERT_SELECT`);
    assert.equal((await http(n)).status,409); checks.push(`ACTUAL_POSTGREST_${n}_REPLAY_DENIED`);
  }
  const parallelHttp = await Promise.all([http(7), http(7)]);
  assert.deepEqual(parallelHttp.map(r => r.status).sort(), [201,409]);
  assert.equal(await good(`SELECT count(*) FROM public.post_media_r2_copy_claims WHERE post_id='${post(7)}'`), '1');
  checks.push('TWO_ACTUAL_POSTGREST_REQUESTS_ONE_COMMITTED_CLAIM');
  assert.equal((await http(16)).status,403); checks.push('ACTUAL_POSTGREST_FOREIGN_POST_RLS_DENIED');
} finally {
  for (const container of [restContainer,pgContainer].filter(Boolean)) {
    await command(['rm','-f',container]);
    const inspected = await run(['container','inspect',container,'--format','{{.Id}}']);
    assert.notEqual(inspected.code,0,'owned disposable container cleanup unconfirmed');
  }
}
console.log(JSON.stringify({ status:'PASS', checks, assertions:checks.length, database:'ISOLATED_PG17_MINIMAL_SCHEMA_FIXTURE', postgrest:'ACTUAL_LOCAL_V16_1', network:'NONE_CONTAINER_LOOPBACK_ONLY', cleanup:'CONFIRMED', productionConnections:0 }));
