import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parse, stringify } from 'smol-toml';
import { createClient } from '@supabase/supabase-js';
import { buildLocalSupabaseReplayMirror } from '../build-local-supabase-replay-mirror.mjs';
import { assertLocalReplayTarget, withCanonicalBaselineDirectory, sanitizeSupabaseStartDiagnosticText } from './local-disposable-supabase-replay.mjs';
import { ORDERED_MIGRATION_FILENAMES } from '../build-local-supabase-replay-mirror.mjs';
import { protectedOperation } from '../../tools/e-verify-group1-remaining-assets/private-evidence.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const cli = path.join(root, 'node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
const docker = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const stateRoot = path.join(root, '.local-e2e');
const pointer = path.join(stateRoot, 'active.json');
const environment = Object.fromEntries(['PATH','SystemRoot','SystemDrive','WINDIR','ProgramData','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','HOME','COMSPEC'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(environment, { PATH: path.dirname(docker) + path.delimiter + environment.PATH, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false', ASTRO_TELEMETRY_DISABLED: '1', ASTRO_DISABLE_UPDATE_CHECK: 'true' });
export function command(binary, args, { input, timeout = 180000, env = environment, cwd = root } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, cwd, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(Object.assign(Error('LOCAL_COMMAND_TIMEOUT'), { stdout, stderr })); }, timeout);
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', () => { clearTimeout(timer); reject(Error('LOCAL_COMMAND_START_FAILED')); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve({ stdout, stderr }) : reject(Object.assign(Error('LOCAL_COMMAND_FAILED'), { stdout, stderr, exitCode: code })); });
    child.stdin.end(input);
  });
}
const sb = (s, action, extra = []) => command(cli, [action, '--workdir', s.runtime, ...extra]);
export function sql(s, input) {
  return command(docker, ['exec','-i',s.container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-tA'], { input });
}
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
async function save(s) {
  const cipher = protectedOperation('Protect', s.namespace, { input: Buffer.from(JSON.stringify(s)) });
  await fs.writeFile(path.join(s.privateDir, 'state.dpapi'), Buffer.from(cipher, 'base64'));
}
async function load() {
  const locator = JSON.parse(await fs.readFile(pointer, 'utf8'));
  if (!/^[a-f0-9]{12}$/.test(locator.runId)) throw Error('LOCAL_STATE_SCOPE');
  const privateDir = path.join(stateRoot, locator.runId);
  return JSON.parse(Buffer.from(protectedOperation('Unprotect', `e-verify-group1-local-user-e2e-${locator.runId}`, { input: await fs.readFile(path.join(privateDir,'state.dpapi')) }), 'base64'));
}
async function cleanup(s) {
  const temp = await fs.realpath(os.tmpdir()), runtime = await fs.realpath(s.runtime);
  const marker = JSON.parse(await fs.readFile(path.join(runtime, 'owner.json'), 'utf8'));
  if (path.dirname(runtime) !== temp || !path.basename(runtime).startsWith('ogh-local-user-e2e-') || marker.runId !== s.runId || s.project !== `ogh-e2e-${s.runId}`) throw Error('LOCAL_CLEANUP_OWNERSHIP');
  if (s.startAttempted) await sb(s, 'stop', ['--no-backup']);
  const suffix=new RegExp('(?:_|\\.)'+s.project+'$');
  const remaining = (await command(docker, ['ps','-a','--format','{{.Names}}'])).stdout.trim().split(/\r?\n/).filter(n=>suffix.test(n));
  const volumes = (await command(docker, ['volume','ls','--format','{{.Name}}'])).stdout.trim().split(/\r?\n/).filter(n=>suffix.test(n));
  if (remaining.length||volumes.length) throw Error('LOCAL_CLEANUP_CONTAINER_OR_VOLUME_REMAINS');
  // Configuration/mirror are nonsecret and reusable; ephemeral identities are not.
  if (s.privateDir === path.join(stateRoot, s.runId)) await fs.rm(s.privateDir, { recursive: true, force: true });
  await fs.rm(pointer, { force: true });
  for(const name of ['local-key.pem','local-cert.pem'])await fs.rm(path.join(runtime,name),{force:true});
}
async function prepare() {
  try { await fs.access(pointer); throw Error('LOCAL_INSTANCE_ALREADY_OWNED'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const runId = randomBytes(6).toString('hex');
  const s = { runId, project: `ogh-e2e-${runId}`, namespace: `e-verify-group1-local-user-e2e-${runId}`, privateDir: path.join(stateRoot, runId), runtime: await fs.mkdtemp(path.join(os.tmpdir(),'ogh-local-user-e2e-')), startAttempted: false, actors: {} };
  let stage = 'LOCAL_INIT';
  try {
    const context=JSON.parse((await command(docker,['context','inspect'])).stdout)[0];
    if(!/^npipe:\/\//.test(context?.Endpoints?.docker?.Host??''))throw Error('LOCAL_WINDOWS_DOCKER_ENDPOINT_REQUIRED');
    protectedOperation('Initialize', s.namespace, { directory: s.privateDir });
    await fs.writeFile(path.join(s.runtime,'owner.json'), JSON.stringify({ runId }));
    await sb(s,'init',['--yes']);
    const configPath = path.join(s.runtime,'supabase/config.toml');
    const config = parse(await fs.readFile(configPath,'utf8'));
    config.project_id = s.project;
    const base = 56320;
    config.api.port = base + 1; config.db.port = base + 2; config.db.shadow_port = base;
    config.studio.port = base + 3; config.local_smtp.port = base + 4;
    config.analytics.port = base + 7; config.db.pooler.port = base + 9;
    config.edge_runtime.inspector_port = base + 83;
    config.db.seed.enabled = false; config.analytics.enabled = false;
    config.auth.site_url = 'https://127.0.0.1:4328';
    config.auth.additional_redirect_urls = ['https://127.0.0.1:4328/**'];
    config.auth.email.enable_confirmations = false;
    await fs.writeFile(configPath,stringify(config));
    const mirror = await withCanonicalBaselineDirectory({root,environment}, canonicalDirectory => buildLocalSupabaseReplayMirror({ canonicalDirectory, outputDirectory:path.join(s.runtime,'supabase/migrations'), mappingPath:path.join(s.runtime,'migration-map.json'), repositoryRoot:root }));
    // The historical mirror freezes 50 migrations; include newer committed source
    // migrations without editing that frozen manifest or any canonical SQL file.
    const extras = (await fs.readdir(path.join(root,'supabase/migrations'))).filter(f=>f.endsWith('.sql')&&!ORDERED_MIGRATION_FILENAMES.includes(f)).sort();
    for (const name of extras) {
      if (!/^202610\d{8}_.*\.sql$/.test(name)) throw Error('LOCAL_ADDITIONAL_MIGRATION_SCOPE');
      const committed = (await command('git',['cat-file','blob',`HEAD:supabase/migrations/${name}`])).stdout;
      const working = (await fs.readFile(path.join(root,'supabase/migrations',name),'utf8')).replaceAll('\r\n','\n');
      if (working !== committed) throw Error('LOCAL_ADDITIONAL_MIGRATION_DIRTY');
      await fs.writeFile(path.join(s.runtime,'supabase/migrations',name),committed);
    }
    mirror.migrationCount += extras.length;
    stage = 'LOCAL_SUPABASE_START'; s.startAttempted = true;
    await sb(s,'start',['--exclude','logflare,vector,studio,postgres-meta,edge-runtime,supavisor']);
    s.status = JSON.parse((await sb(s,'status',['--output','json'])).stdout);
    for (const k of ['API_URL','DB_URL','STORAGE_S3_URL']) if (s.status[k]) assertLocalReplayTarget(s.status[k]);
    if (new URL(s.status.API_URL).port !== String(base + 1)) throw Error('LOCAL_API_PORT_MISMATCH');
    s.container = `supabase_db_${s.project}`;
    const inspect = JSON.parse((await command(docker,['inspect',s.container])).stdout)[0];
    if (!inspect.State.Running || inspect.Name !== '/'+s.container || Date.parse(inspect.Created) < Date.now()-180000) throw Error('LOCAL_CONTAINER_OWNERSHIP');
    const ledger = await sql(s,'select count(*) from supabase_migrations.schema_migrations;');
    if (+ledger.stdout.trim() !== mirror.migrationCount) throw Error('LOCAL_MIGRATION_COUNT');
    stage = 'LOCAL_ACCOUNTS';
    const admin = createClient(s.status.API_URL,s.status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    for (const actor of ['A','B','ADMIN']) {
      const email = `e2e-${runId}-${actor.toLowerCase()}@example.invalid`, password = randomBytes(24).toString('base64url');
      const {data,error} = await admin.auth.admin.createUser({email,password,email_confirm:true});
      if (error || !data.user) throw Error('LOCAL_ACCOUNT_CREATION');
      s.actors[actor] = {id:data.user.id,email,password,role:actor==='ADMIN'?'admin':'user'};
    }
    for (const [label,actor] of Object.entries(s.actors)) {
      await sql(s,`update public.profiles set username=${quote('e2e_'+runId+'_'+label.toLowerCase())},display_name=${quote('Local E2E '+label)} where id=${quote(actor.id)};`);
    }
    await sql(s,`select public.qa_grant_admin_role(${quote(s.actors.ADMIN.id)});`);
    for (const actor of Object.values(s.actors)) {
      const role = (await sql(s,`select role from public.profiles where id=${quote(actor.id)};`)).stdout.trim();
      if (role !== actor.role) throw Error('LOCAL_ROLE_MISMATCH');
    }
    s.catalogFixtureApplied=process.env.OGH_E2E_MIGRATION_RECONCILIATION!=='1';
    if(s.catalogFixtureApplied) {
    stage = 'LOCAL_CATALOG_FIXTURE';
    const {buildRepositoryInventory} = await import('../lib/product-detail-repository-inventory.mjs');
    const {prepareCanonicalCatalogImport} = await import('../lib/catalog-canonical-import.mjs');
    const inventory = await buildRepositoryInventory({root});
    const catalog = await prepareCanonicalCatalogImport({root,publication:{blocked_count:0,candidates:inventory.identities.map(i=>({slug:i.slug,brand:i.brandKey,decision:i.slug==='xreal-air'?'PUBLISHED':'NOT_PUBLISHED'}))}});
    await sql(s,catalog.sql); await sql(s,catalog.activationSql); await sql(s,catalog.hardeningSql);
    }
    stage = 'LOCAL_FORMAL_RATE_LIMIT_BASELINE';
    const rpc=(await sql(s,"select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='consume_forum_rate_limit';")).stdout.trim();
    if(rpc!=='1')throw Error('LOCAL_FORMAL_RATE_LIMIT_BASELINE_MISSING');
    s.rateLimitWasMissingFromCanonicalMigrations=false;
    s.rateLimitBaseline='FORMAL_MIGRATION_ONLY';
    s.migrations = mirror.migrationCount;
    await save(s); await fs.writeFile(pointer,JSON.stringify({runId}));
    console.log(JSON.stringify({localSupabase:'RUNNING',databaseIsolation:'PASS',accounts:['A_READY','B_READY','ADMIN_READY'],migrations:s.migrations,credentials:'CURRENT_USER_DPAPI_OWNER_SYSTEM_DACL',productionRequests:0}));
  } catch(e) {
    try { await cleanup(s); } catch { console.log('LOCAL_PARTIAL_CLEANUP=BLOCKED'); }
    // Error streams remain in process memory; never dump potentially secret CLI output.
    console.log(JSON.stringify({status:'BLOCKED',stage,error:sanitizeSupabaseStartDiagnosticText(e.message).slice(0,180),
      diagnostic: /column .*brand|PUBLICATION_IDENTITY/.test(e.message)?'LOCAL_CATALOG_IDENTITY': /migration|ERROR:/.test(e.stderr??'')?'LOCAL_MIGRATION_OR_SQL_ERROR':null}));
    process.exitCode=1;
  }
}
const mode = process.argv[2];
if (mode === '--prepare') await prepare();
else if (mode === '--cleanup') { await cleanup(await load()); console.log('LOCAL_CLEANUP=PASS'); }
else if (mode === '--run') {
  const s = await load(); let result;
  try { const {runCases} = await import('./local-user-e2e-cases.mjs'); result = await runCases({s,root,environment,command,sql}); }
  finally {
    await cleanup(s);
    await fs.writeFile(path.join(root,'output/playwright/local-supabase-e2e',s.runId,'CLEANUP_SAFE.json'),JSON.stringify({databaseContainersRemoved:true,ephemeralAccountsAndRowsRemoved:true,dpapiCredentialsDeleted:true,browserAndWorkerCleanupRequested:true,productionRequests:0,productionWrites:0},null,2)+'\n');
    console.log('LOCAL_DATABASE_CLEANUP=PASS');
  }
  if (result?.failed) process.exitCode=1;
} else throw Error('USE_PREPARE_RUN_OR_CLEANUP');
