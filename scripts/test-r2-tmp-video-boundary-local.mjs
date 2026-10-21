import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Same network-none PG17/PostgREST fixture as the approved claim tests; no host ports.
assert.equal(process.platform, 'win32');
const docker = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const host = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const pgImage = 'public.ecr.aws/supabase/postgres:17.6.1.165';
const restImage = 'public.ecr.aws/supabase/postgrest:v16.1';
const environment = Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
const prefix = `ogh-r2-p2-${randomUUID().slice(0, 8)}`;
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = uid(1), other = uid(2), staff = uid(3), circle = uid(99);
const permanent = n => `${owner}/${uid(n)}/r2-retained-${mid(n)}.mp4`;
const temporary = n => `tmp/${owner}/${uid(n)}/video.mp4`;
const migration = '20261021062350_post_media_tmp_video_boundary.sql';
const checks = [], baselineHashes = {};
let pgContainer, restContainer, passed = false;
const cleanupErrors = [];

async function run(args, input = '') {
  return await new Promise((resolve, reject) => {
    const child = spawn(docker, ['--host', host, ...args], { env: environment, windowsHide: true, stdio: 'pipe' });
    let stdout = '', stderr = '', settled = false, timer, grace, stopCode;
    function finish(error, code) { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(grace); if (error || stopCode) reject(error ?? Error(stopCode)); else resolve({ code, stdout, stderr }); }
    function stop(code) { stopCode ??= code; child.kill(); if (!grace) grace = setTimeout(() => finish(Error(stopCode)), 2000); }
    timer = setTimeout(() => stop('LOCAL_COMMAND_TIMEOUT'), 15000);
    for (const stream of ['stdout','stderr']) child[stream].on('data', b => {
      if (stdout.length + stderr.length + b.length > 1048576) { stop('LOCAL_OUTPUT_BOUND'); return; }
      if (stream === 'stdout') stdout += b; else stderr += b;
    });
    child.stdin.on('error', () => {}); child.once('error', () => finish(Error('LOCAL_COMMAND_SPAWN_FAILED')));
    child.once('close', (code, signal) => finish(signal ? Error('LOCAL_COMMAND_SIGNAL') : null, code)); child.stdin.end(input);
  });
}
async function command(args, input) { const r = await run(args, input); assert.equal(r.code, 0, `LOCAL_COMMAND_FAILED:${args[0]}`); return r.stdout.trim(); }
const sql = text => run(['exec','-i',pgContainer,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d','postgres'], text);
async function good(text) { const r = await sql(text); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); }
const asUser = (text, user = owner, role = 'authenticated') => `BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claims','${JSON.stringify({ sub:user, role })}',true); ${text}; COMMIT;`;
const last = text => text.split('\n').at(-1);
async function denied(text, label, state = '23514') { const r = await sql(text); assert.notEqual(r.code, 0, label); assert.ok(r.stderr.includes(state), label); checks.push(label); }
async function ready(args) { for (let n = 0; n < 30; n++) { if ((await run(args)).code === 0) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw Error('LOCAL_SERVICE_READINESS_TIMEOUT'); }
const insert = (n, storage = temporary(n), kind = 'video', user = owner) => `INSERT INTO public.post_media(id,post_id,user_id,kind,storage_path) VALUES('${mid(n)}','${uid(n)}','${user}','${kind}','${storage}') RETURNING id`;
async function apply(name) { const bytes = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url)); baselineHashes[name] = createHash('sha256').update(bytes).digest('hex'); await good(bytes.toString('utf8')); }
const securitySnapshot = `SELECT jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'roles',p.polroles::text,'cmd',p.polcmd,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)) FROM pg_class c WHERE c.oid='public.post_media'::regclass`;
async function verifyApprovedSource() {
  const binding = JSON.parse(await readFile(new URL('../docs/ops/reconciliation/r2-retention-final-offline-integration.safe.json', import.meta.url), 'utf8'));
  for (const [file, hash] of Object.entries(binding.sourceSha256)) assert.equal(createHash('sha256').update(await readFile(new URL(`../${file}`, import.meta.url))).digest('hex'), hash, 'APPROVED_P1_SOURCE_CHANGED');
}
try {
  await verifyApprovedSource();
  assert.equal(await command(['version','--format','{{.Server.Os}}']), 'linux');
  for (const image of [pgImage, restImage]) await command(['image','inspect',image,'--format','{{.Id}}']);
  pgContainer = await command(['run','--pull','never','--rm','-d','--name',`${prefix}-pg`,'--network','none','--memory','512m','--cpus','1',
    '--tmpfs','/tmp:rw,size=256m,mode=1777','--user','postgres','--entrypoint','sh',pgImage,'-ceu',
    'initdb -D /tmp/oghpg --no-locale --encoding=UTF8 --auth=trust >/dev/null; exec postgres -D /tmp/oghpg -c listen_addresses=127.0.0.1 -c shared_preload_libraries= -c max_connections=12 -c shared_buffers=16MB']);
  assert.match(pgContainer, /^[a-f0-9]{64}$/);
  await ready(['exec',pgContainer,'pg_isready','-q','-U','postgres']);
  assert.equal(await good("SELECT current_setting('server_version_num')::integer / 10000"), '17');
  // Only platform dependencies are minimal fixtures. Application table, helpers,
  // constraints and post-media RLS below come from the repository migrations.
  await good(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS; CREATE ROLE service_role NOLOGIN;
    CREATE ROLE authenticator LOGIN NOINHERIT; GRANT authenticated,anon TO authenticator;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
  await apply('20260518_forum_phase1_schema.sql');
  await good(`ALTER TABLE public.circles ADD COLUMN status text NOT NULL DEFAULT 'active';
    ALTER TABLE public.posts ADD COLUMN moderation_status text NOT NULL DEFAULT 'published';
    ALTER TABLE public.comments ADD COLUMN moderation_status text NOT NULL DEFAULT 'published';
    GRANT SELECT ON public.profiles,public.posts,public.circles,public.comments TO anon,authenticated;`);
  for (const name of ['20260524_forum_phase3_post_media.sql','20260525_forum_phase4_video_media.sql','20260531_forum_phase6_upload_guardrails.sql','20260603_forum_comments_interactions.sql',
    '20260713_post_bound_media_provenance.sql','20260713_comment_read_circle_visibility_authorization.sql','20260715_post_media_delivery_visibility_authorization.sql','20261020000000_post_media_r2_copy_claims.sql']) await apply(name);
  await good(`INSERT INTO auth.users(id,email) VALUES('${owner}','p2-owner@example.invalid'),('${other}','p2-other@example.invalid'),('${staff}','p2-staff@example.invalid');
    UPDATE public.profiles SET role='admin' WHERE id='${staff}';
    INSERT INTO public.circles(id,slug,name,type) VALUES('${circle}','p2-retention','P2 retention fixture','topic');
    INSERT INTO public.posts(id,author_id,circle_id,type,title,body,status)
    SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n>=24 THEN '${other}'::uuid ELSE '${owner}'::uuid END,'${circle}','experience','P2 retention','Disposable local P2 acceptance.',CASE WHEN n=24 THEN 'hidden'::post_status ELSE 'published'::post_status END FROM generate_series(1,25) n;`);
  for (const n of [1,2,3]) await good(asUser(insert(n)));
  checks.push('PRE_GUARD_AUTHENTICATED_TMP_INSERT_REPRODUCED');
  const legacyBefore = await good('SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.post_media m');
  const securityBefore = await good(securitySnapshot);
  await apply(migration);
  assert.equal(await good('SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.post_media m'), legacyBefore); checks.push('MIGRATION_DOES_NOT_REWRITE_LEGACY_ROWS');
  assert.equal(await good(securitySnapshot), securityBefore); checks.push('EXACT_EXISTING_TABLE_RLS_POLICIES_AND_GRANTS_UNCHANGED');
  await denied(asUser(insert(4)), 'DIRECT_AUTHENTICATED_TMP_INSERT_REJECTED');
  await good(asUser(insert(5, permanent(5)))); checks.push('RETAINED_VIDEO_INSERT_ACCEPTED');
  await denied(asUser(`UPDATE public.post_media SET storage_path='${temporary(5)}' WHERE id='${mid(5)}'`), 'DIRECT_AUTHENTICATED_TMP_UPDATE_REJECTED');
  await good(asUser(`UPDATE public.post_media SET is_cover=true,alt_text='Updated cover',sort_order=2 WHERE id='${mid(1)}'`));
  assert.equal(last(await good(asUser(`SELECT is_cover AND alt_text='Updated cover' AND sort_order=2 FROM public.post_media WHERE id='${mid(1)}'`))), 't'); checks.push('HISTORICAL_COVER_AND_UNRELATED_METADATA_UPDATE_ALLOWED');
  assert.equal(last(await good(asUser(`SELECT count(*) FROM public.post_media WHERE id='${mid(1)}'`, owner, 'anon'))), '1'); checks.push('HISTORICAL_TMP_PUBLIC_READ_PRESERVED');
  for (const [set,label] of [
    [`post_id='${uid(4)}'`,'HISTORICAL_POST_REASSIGNMENT_REJECTED'],
    [`post_id='${uid(4)}',storage_path='${temporary(4)}'`,'CANONICAL_TMP_POST_AND_PATH_REASSIGNMENT_REJECTED'],
    [`id='${mid(30)}'`,'HISTORICAL_ROW_ID_CHANGE_REJECTED'],
    [`storage_path='${temporary(1)}.other'`,'HISTORICAL_TMP_PATH_CHANGE_REJECTED'],
    ["kind='image'",'HISTORICAL_KIND_ESCAPE_REJECTED'],
    [`storage_path='${permanent(1)}'`,'LEGACY_PATH_REPAIR_REQUIRES_SEPARATE_RECONCILIATION'],
  ]) await denied(asUser(`UPDATE public.post_media SET ${set} WHERE id='${mid(1)}'`), label);
  await denied(asUser(`UPDATE public.post_media SET user_id='${other}',storage_path='tmp/${other}/${uid(1)}/video.mp4' WHERE id='${mid(1)}'`, staff), 'STAFF_CANNOT_REASSIGN_LEGACY_OWNER');
  await good(asUser(`UPDATE public.post_media SET is_cover=true WHERE id='${mid(3)}'`, staff)); checks.push('AUTHORIZED_STAFF_LEGACY_METADATA_UPDATE_PRESERVED');
  await good(asUser(`DELETE FROM public.post_media WHERE id='${mid(2)}'`));
  assert.equal(await good(`SELECT count(*) FROM public.post_media WHERE id='${mid(2)}'`), '0'); checks.push('HISTORICAL_TMP_DELETE_PRESERVED');
  const fallback = `${owner}/${uid(6)}/supabase-tus.mp4`;
  await good(asUser(insert(6, fallback))); checks.push('SUPABASE_STORAGE_FALLBACK_INSERT_ACCEPTED');
  await good(asUser(`UPDATE public.post_media SET is_cover=true WHERE id='${mid(6)}'`)); checks.push('SUPABASE_STORAGE_FALLBACK_UPDATE_ACCEPTED');
  await denied(asUser(`UPDATE public.post_media SET storage_path='${temporary(6)}' WHERE id='${mid(6)}'`), 'SUPABASE_TO_TMP_VIDEO_CONVERSION_REJECTED');
  await good(asUser(insert(7, `${owner}/${uid(7)}/image.png`, 'image'))); checks.push('IMAGE_INSERT_ACCEPTED');
  await denied(asUser(`UPDATE public.post_media SET kind='video',storage_path='${temporary(7)}' WHERE id='${mid(7)}'`), 'IMAGE_TO_TMP_VIDEO_CONVERSION_REJECTED');
  await good(asUser(`INSERT INTO public.post_media(id,post_id,user_id,kind,url) VALUES('${mid(8)}','${uid(8)}','${owner}','video_link','https://example.invalid/video')`)); checks.push('VIDEO_LINK_UNCHANGED');
  await denied(asUser(insert(25, permanent(25))), 'FOREIGN_POST_INSERT_STILL_RLS_DENIED', '42501');
  await denied(asUser(insert(9, `${other}/${uid(9)}/fallback.mp4`, 'video', other)), 'FOREIGN_OWNER_INSERT_STILL_RLS_DENIED', '42501');
  const protectedBefore = await good(`SELECT row_to_json(m) FROM public.post_media m WHERE id='${mid(1)}'`);
  assert.equal(last(await good(asUser(`WITH changed AS (UPDATE public.post_media SET is_cover=false WHERE id='${mid(1)}' RETURNING id) SELECT count(*) FROM changed`, other))), '0');
  assert.equal(last(await good(asUser(`WITH removed AS (DELETE FROM public.post_media WHERE id='${mid(1)}' RETURNING id) SELECT count(*) FROM removed`, other))), '0');
  assert.equal(await good(`SELECT row_to_json(m) FROM public.post_media m WHERE id='${mid(1)}'`), protectedBefore); checks.push('OTHER_USER_UPDATE_AND_DELETE_STILL_RLS_FILTERED');
  await denied(asUser(insert(10, permanent(10)), owner, 'anon'), 'ANON_INSERT_STILL_DENIED', '42501');
  assert.equal(await good("SELECT prosecdef FROM pg_proc WHERE oid='public.guard_post_media_tmp_video_binding()'::regprocedure"), 'f'); checks.push('TRIGGER_HAS_NO_DEFINER_PRIVILEGE');

  const secret = 'synthetic-p2-local-only-postgrest-secret-not-production';
  restContainer = await command(['run','--pull','never','--rm','-d','--name',`${prefix}-rest`,'--network',`container:${pgContainer}`,'--memory','128m','--cpus','1',
    '-e','PGRST_DB_URI=postgres://authenticator@127.0.0.1:5432/postgres','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon',
    '-e','PGRST_SERVER_HOST=127.0.0.1','-e','PGRST_DB_POOL=2','-e',`PGRST_JWT_SECRET=${secret}`,restImage]);
  assert.match(restContainer, /^[a-f0-9]{64}$/);
  await ready(['exec',pgContainer,'curl','--silent','--fail','--max-time','2','http://127.0.0.1:3000/']);
  const token = user => { const part = x => Buffer.from(JSON.stringify(x)).toString('base64url'); const data = `${part({alg:'HS256',typ:'JWT'})}.${part({sub:user,role:'authenticated',exp:Math.floor(Date.now()/1000)+300})}`; return `${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`; };
  async function http(method,query,body,user=owner) {
    const args = ['exec','-i',pgContainer,'curl','--silent','--show-error','--max-time','5','-w','\n%{http_code}','-X',method,
      '-H',`Authorization: Bearer ${token(user)}`,'-H','Content-Type: application/json','-H','Prefer: return=representation'];
    if(body!==undefined)args.push('--data-binary','@-');
    args.push(`http://127.0.0.1:3000/post_media${query}`);
    const text = await command(args, body===undefined?'':JSON.stringify(body)); const lines = text.split('\n'); return {status:Number(lines.pop()),body:JSON.parse(lines.join('\n'))};
  }
  let response = await http('POST','',{id:mid(11),post_id:uid(11),user_id:owner,kind:'video',storage_path:temporary(11)});
  assert.equal(response.status,400); assert.equal(response.body.code,'23514'); checks.push('ACTUAL_POSTGREST_DIRECT_TMP_INSERT_REJECTED');
  response = await http('PATCH',`?id=eq.${mid(5)}`,{storage_path:temporary(5)});
  assert.equal(response.status,400); assert.equal(response.body.code,'23514'); checks.push('ACTUAL_POSTGREST_DIRECT_TMP_UPDATE_REJECTED');
  response = await http('PATCH',`?id=eq.${mid(1)}`,{is_cover:false}); assert.equal(response.status,200); assert.equal(response.body[0].is_cover,false); checks.push('ACTUAL_POSTGREST_LEGACY_COVER_UPDATE_ALLOWED');
  response = await http('PATCH',`?id=eq.${mid(1)}`,{post_id:uid(12),storage_path:temporary(12)}); assert.equal(response.status,400); assert.equal(response.body.code,'23514'); checks.push('ACTUAL_POSTGREST_LEGACY_REASSIGNMENT_REJECTED');
  for(const [n,key,label] of [[12,permanent(12),'RETAINED'],[13,`${owner}/${uid(13)}/fallback.mp4`,'SUPABASE_FALLBACK']]){
    response = await http('POST','',{id:mid(n),post_id:uid(n),user_id:owner,kind:'video',storage_path:key}); assert.equal(response.status,201); assert.equal(response.body[0].storage_path,key); checks.push(`ACTUAL_POSTGREST_${label}_INSERT_ACCEPTED`);
  }
  response = await http('PATCH',`?id=eq.${mid(1)}`,{is_cover:true},other); assert.equal(response.status,200); assert.deepEqual(response.body,[]); checks.push('ACTUAL_POSTGREST_FOREIGN_UPDATE_RLS_PRESERVED');
  response = await http('DELETE',`?id=eq.${mid(3)}`); assert.equal(response.status,200); assert.equal(response.body[0].id,mid(3)); checks.push('ACTUAL_POSTGREST_HISTORICAL_DELETE_PRESERVED');
  assert.equal(await good(securitySnapshot), securityBefore); checks.push('RLS_AND_GRANTS_STILL_UNCHANGED_AFTER_ACCEPTANCE');
  await verifyApprovedSource(); checks.push('APPROVED_P1_IMPLEMENTATION_AND_EVIDENCE_BYTES_UNCHANGED');
  passed = true;
} finally {
  for(const container of [restContainer,pgContainer].filter(Boolean))try {
    await command(['rm','-f',container]); const r = await run(['container','inspect',container,'--format','{{.Id}}']); assert.notEqual(r.code,0);
  } catch { cleanupErrors.push('OWNED_CONTAINER_REMOVAL_UNCONFIRMED'); }
  console.log(JSON.stringify({status:passed&&!cleanupErrors.length?'PASS':'FAIL',checks,assertions:checks.length,baselineHashes,
    database:'ACTUAL_PG17_REPOSITORY_POST_MEDIA_SCHEMA_RLS_AND_CONSTRAINTS',platformDependencies:'MINIMAL_AUTH_STORAGE_AND_VISIBILITY_COLUMNS_NOT_FULL_PROJECT',
    postgrest:'ACTUAL_LOCAL_V16_1',network:'NONE_CONTAINER_LOOPBACK_ONLY',cleanup:cleanupErrors.length?'UNCONFIRMED':'CONFIRMED',cleanupErrors,
    fullSchemaAcceptance:'STILL_UNVERIFIED',productionConnections:0,productionWrites:0,realR2Requests:0}));
}
assert.ok(passed&&!cleanupErrors.length,'P2_ACCEPTANCE_OR_CLEANUP_FAILED');
