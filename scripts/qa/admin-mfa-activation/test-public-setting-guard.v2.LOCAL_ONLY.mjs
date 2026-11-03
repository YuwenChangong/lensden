import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assessPublicSettings, compareSettingMetadata, STATIC_SETTING_NAMES } from './public-setting-guard.v2.mjs';

globalThis.fetch = () => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); };
const root = 'C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub';
const { unstable_readConfig } = await import(pathToFileURL(`${root}/node_modules/wrangler/wrangler-dist/cli.js`));
const config = unstable_readConfig({ config: `${root}/wrangler.toml`, env: 'production' }, { hideWarnings: true });
let checks = 0;
async function test(name, action) { await action(); checks++; console.log(`PASS ${name}`); }
const exact = Object.entries(config.vars).map(([name, text]) => ({ name, type: 'plain_text', text }));
await test('all exact settings and real three-artifact proof', async () => {
  const result = await assessPublicSettings(exact, config.vars);
  assert.equal(result.pass, true);
  assert.equal(result.proof.exactCanonicalContacts, true);
  assert.equal(Object.keys(result.proof.compiledEvidence).length, 4);
});
await test('all nine finite static absences require real sealed proof', async () => {
  const result = await assessPublicSettings(exact.filter(b => !STATIC_SETTING_NAMES.includes(b.name)), config.vars);
  assert.equal(result.pass, true);
  assert.equal(STATIC_SETTING_NAMES.length, 9);
});
await test('each legal or build field rejects present mismatch and wrong type', () => {
  for (const name of STATIC_SETTING_NAMES) {
    assert.equal(compareSettingMetadata([{ name, type: 'plain_text', text: 'offline-wrong-fixture' }], name, config.vars[name], true).pass, false);
    assert.equal(compareSettingMetadata([{ name, type: 'json', json: '{}' }], name, config.vars[name], true).pass, false);
  }
});
await test('duplicates and missing value are blocked', () => {
  for (const name of STATIC_SETTING_NAMES) {
    const entry = { name, type: 'plain_text', text: config.vars[name] };
    assert.equal(compareSettingMetadata([entry, entry], name, config.vars[name], true).pass, false);
    assert.equal(compareSettingMetadata([{ name, type: 'plain_text' }], name, config.vars[name], true).pass, false);
  }
});
await test('runtime security and media fields never inherit absence exception', () => {
  for (const name of ['AUTH_CAPTCHA_MODE', 'PUBLIC_AUTH_TURNSTILE_SITE_KEY', 'SUPABASE_URL', 'PUBLIC_R2_PUBLIC_BASE_URL', 'MODERATION_PROVIDER', 'DEV_TURNSTILE_BYPASS']) {
    assert.equal(compareSettingMetadata([], name, config.vars[name], true).pass, false);
  }
});
await test('unknown bindings fail closed', () => {
  for (const value of [null, {}, undefined]) assert.equal(compareSettingMetadata(value, STATIC_SETTING_NAMES[0], 'fixture', true).pass, false);
});
await test('explicit empty runtime value is exact, not absence', () => {
  const name = 'OPENAI_FORUM_POLICY_MODEL';
  assert.equal(compareSettingMetadata([{ name, type: 'plain_text', text: '' }], name, '').pass, true);
  assert.equal(compareSettingMetadata([], name, '', true).pass, false);
  assert.equal(compareSettingMetadata([{ name, type: 'plain_text', text: 'different' }], name, '').pass, false);
});
await test('caller cannot replace canonical email', async () => {
  await assert.rejects(() => assessPublicSettings([], { ...config.vars, PUBLIC_SUPPORT_EMAIL: 'offline@example.invalid' }), /CANONICAL_CONTACT_MISMATCH/);
});
await test('caller cannot replace compiled client target', async () => {
  await assert.rejects(() => assessPublicSettings([], { ...config.vars, PUBLIC_SUPABASE_URL: 'https:\/\/offline.invalid' }), /EXACT_COMPILED_BUILD_VALUE_NOT_PROVEN/);
});
await test('value prefix is not evidence of exact compiled value', async () => {
  await assert.rejects(() => assessPublicSettings([], { ...config.vars, PUBLIC_SUPABASE_ANON_KEY: config.vars.PUBLIC_SUPABASE_ANON_KEY.slice(0, 12) }), /EXACT_COMPILED_BUILD_VALUE_NOT_PROVEN/);
});
await test('missing runtime field records safe specific failure', async () => {
  const result = await assessPublicSettings(exact.filter(b => b.name !== 'SUPABASE_URL'), config.vars);
  assert.equal(result.pass, false);
  assert.equal(result.firstFailed, 'SUPABASE_URL');
  assert.equal(result.fields.SUPABASE_URL.bindingType, 'ABSENT');
  assert.equal(JSON.stringify(result).includes(config.vars.PUBLIC_SUPPORT_EMAIL), false);
  assert.equal(JSON.stringify(result).includes(config.vars.PUBLIC_SUPABASE_ANON_KEY), false);
});
await test('new caller preserves resource secret version and compatibility checks', async () => {
  const source = await readFile(new URL('./initial-management-admission.v3.mjs', import.meta.url), 'utf8');
  for (const name of ['REQUIRED_SECRET_NAME_DRIFT', 'R2_BINDING_DRIFT', 'KV_BINDING_DRIFT', 'IMAGES_BINDING_DRIFT', 'COMPATIBILITY_DATE_DRIFT', 'COMPATIBILITY_FLAGS_DRIFT', 'VERSION_DRIFT', 'TRAFFIC_DRIFT']) assert(source.includes(name));
  assert(source.includes('result.publicSettingsGate = publicSettings'));
  assert(source.includes('RESUME.v4.NOT_AUTHORIZED.json'));
});
console.log(JSON.stringify({ targetedChecks: checks, productionRequests: 0, productionWrites: 0, builds: 0, privateValuesReturned: false }));
