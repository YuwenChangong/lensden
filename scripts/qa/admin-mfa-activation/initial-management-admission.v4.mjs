import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { assessMfaRuntimeSettings } from './runtime-branch-setting-guard.mjs';

assert(process.argv.length === 3 && /^[a-f0-9]{64}$/.test(process.argv[2]), 'EXACT_NEW_BINDING_ARGUMENT_REQUIRED');
const binding = process.argv[2];
const home = 'C:/Temp/ogh-admin-mfa-activation-20261024';
const sink = path.join(process.env.LOCALAPPDATA, 'OpenGlassHub/admin-mfa-activation', binding);
const packetBytes = await fs.readFile(path.join(home, 'ADMIN_MFA_ACTIVATION.RESUME.v5.NOT_AUTHORIZED.json'));
assert.equal(createHash('sha256').update(packetBytes).digest('hex'), binding);
const packet = JSON.parse(packetBytes);
assert.equal(packet.target.account, 'dcb374166b39234a499985145c075f50', 'FIXED_ACCOUNT_REQUIRED');
assert.equal(packet.target.worker, 'openglasshub', 'FIXED_WORKER_REQUIRED');
for (const pin of packet.localAdmissionTools.sourcePins) assert.equal(createHash('sha256').update(await fs.readFile(pin.path)).digest('hex'), pin.sha256, 'LOCAL_ADMISSION_TOOL_IDENTITY');
const approval = JSON.parse(await fs.readFile(path.join(sink, 'owner-approval.safe.json')));
assert.equal(approval.binding, binding);
assert(Date.parse(approval.executionWindowEndUTC) - Date.now() >= 45 * 60000, 'OWNER_WINDOW_RESERVE');
const require = createRequire('C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub/package.json');
const configPath = 'C:/Users/1/AppData/Roaming/xdg.config/.wrangler/config/default.toml';
const config = require('smol-toml').parse(await fs.readFile(configPath, 'utf8'));
assert(Date.parse(config.expiration_time) - Date.now() >= 45 * 60000, 'WRANGLER_STAGE_VALIDITY');
assert(['account:read', 'workers:write', 'workers_scripts:write'].every(s => config.scopes?.includes(s)), 'WRANGLER_SCOPES');
const secretNames = ['OPENAI_API_KEY', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'RATE_LIMIT_SALT', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'TURNSTILE_SECRET_KEY'];
async function save(file, value) {
  const b = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const h = await fs.open(path.join(sink, file), 'wx');
  try { await h.writeFile(b); await h.sync(); } finally { await h.close(); }
  assert(b.equals(await fs.readFile(path.join(sink, file))));
}
let reads = 0;
async function get(label, suffix) {
  assert(reads < 3);
  assert(Date.parse(config.expiration_time) > Date.now() + 10000);
  await save(`management-${label}.used`, { binding, utc: new Date().toISOString(), method: 'GET', stage: 'INITIAL_ADMISSION', retries: 0 });
  reads++;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${packet.target.account}/workers/scripts/${packet.target.worker}${suffix}`, { method: 'GET', headers: { Authorization: `Bearer ${config.oauth_token}` }, redirect: 'error', signal: AbortSignal.timeout(8000) });
  assert.equal(r.status, 200, 'FIXED_WORKER_MANAGEMENT_ACCESS');
  const chunks = []; let bytes = 0;
  for await (const chunk of r.body) { bytes += chunk.length; assert(bytes <= 1048576, 'METADATA_BOUNDS'); chunks.push(chunk); }
  const j = JSON.parse(Buffer.concat(chunks));
  assert.equal(j.success, true, 'MANAGEMENT_PROVIDER_FAILURE');
  return j.result;
}
const result = { binding, recordedUTC: new Date().toISOString(), managementReads: 0, firstFailure: null, status: 'BLOCKED', retries: 0, deployments: 0, databaseConnections: 0, migrations: 0, secretValuesReturned: false };
try {
  const deployments = await get('initial-deployments', '/deployments');
  const list = Array.isArray(deployments) ? deployments : deployments?.deployments;
  assert(list?.length, 'DEPLOYMENT_RESULT_SHAPE');
  const current = list.reduce((a, b) => Date.parse(a.created_on) > Date.parse(b.created_on) ? a : b);
  assert.equal(current.id, packet.historyReuse.savedWorker.deployment, 'DEPLOYMENT_DRIFT');
  assert.equal(current.versions?.length, 1, 'MULTIVERSION_TRAFFIC');
  assert.equal(current.versions[0].version_id, packet.historyReuse.savedWorker.version, 'VERSION_DRIFT');
  assert.equal(current.versions[0].percentage, 100, 'TRAFFIC_DRIFT');
  result.version = current.versions[0].version_id; result.deployment = current.id; result.trafficPercent = 100;
  const settings = await get('initial-settings', '/settings');
  const { unstable_readConfig } = await import(pathToFileURL('C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub/node_modules/wrangler/wrangler-dist/cli.js'));
  const source = unstable_readConfig({ config: 'C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub/wrangler.toml', env: 'production' }, { hideWarnings: true });
  const bindings = settings.bindings;
  assert(Array.isArray(bindings), 'BINDING_METADATA_SHAPE');
  for (const name of secretNames) assert(bindings.some(b => b.name === name && b.type === 'secret_text'), 'REQUIRED_SECRET_NAME_DRIFT');
  const publicSettings = await assessMfaRuntimeSettings(bindings, source.vars);
  result.publicSettingsGate = publicSettings;
  assert(publicSettings.pass, `NONSECRET_SETTING_DRIFT:${publicSettings.firstFailed}`);
  assert(bindings.some(b => b.name === 'MODERATION_ASSETS' && b.type === 'r2_bucket' && b.bucket_name === 'openglasshub-media'), 'R2_BINDING_DRIFT');
  assert(bindings.some(b => b.name === 'SESSION' && b.type === 'kv_namespace' && b.namespace_id === 'c6d05834ec1d4d3780d8495236496887'), 'KV_BINDING_DRIFT');
  assert(bindings.some(b => b.name === 'IMAGES' && b.type === 'images'), 'IMAGES_BINDING_DRIFT');
  assert.equal(settings.compatibility_date, source.compatibility_date, 'COMPATIBILITY_DATE_DRIFT');
  assert.deepEqual(settings.compatibility_flags, source.compatibility_flags, 'COMPATIBILITY_FLAGS_DRIFT');
  const version = await get('initial-version', `/versions/${result.version}`);
  assert.equal(version.id, result.version, 'VERSION_IDENTITY');
  result.status = 'PASS'; result.configuration = 'FINITE_STATIC_AND_REUSED_DEFAULT_PROOF_FRESH_WORKER_BRANCH_REVIEW_ALL_REQUIRED_RESOURCES_AND_SECRETS_UNCHANGED';
} catch (error) {
  const msg = error?.message ?? '';
  result.firstFailure = /^[A-Z][A-Z0-9_:]{1,120}$/.test(msg) ? msg : (error?.code && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'MANAGEMENT_ADMISSION_FAILED');
} finally {
  config.oauth_token = ''; config.refresh_token = '';
  result.managementReads = reads;
  await save('initial-management-admission.safe.json', result);
}
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
