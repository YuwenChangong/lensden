import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { assessLegalOperatorSetting } from './legal-operator-setting-guard.mjs';

const root = 'C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub';
const require = createRequire(`${root}/package.json`);
const { unstable_readConfig } = await import(pathToFileURL(`${root}/node_modules/wrangler/wrangler-dist/cli.js`));
const config = unstable_readConfig({ config: `${root}/wrangler.toml`, env: 'production' }, { hideWarnings: true });
const expected = config.vars.PUBLIC_LEGAL_OPERATOR_NAME;
globalThis.fetch = () => { throw new Error('OFFLINE_TEST_NETWORK_FORBIDDEN'); };
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
await test('missing exact unused runtime variable requires real sealed static parity', async () => {
  const result = await assessLegalOperatorSetting([], expected);
  assert.equal(result.pass, true);
  assert(Object.values(result.proof).every(v => v === true));
});
await test('present exact plain text remains checked', async () => {
  assert.equal((await assessLegalOperatorSetting([{ name: 'PUBLIC_LEGAL_OPERATOR_NAME', type: 'plain_text', text: expected }], expected)).pass, true);
});
await test('a real value mismatch remains blocked', async () => {
  assert.equal((await assessLegalOperatorSetting([{ name: 'PUBLIC_LEGAL_OPERATOR_NAME', type: 'plain_text', text: 'nonsecret-offline-different-fixture' }], expected)).pass, false);
});
await test('wrong type does not gain an exception', async () => {
  assert.equal((await assessLegalOperatorSetting([{ name: 'PUBLIC_LEGAL_OPERATOR_NAME', type: 'json', json: JSON.stringify(expected) }], expected)).pass, false);
});
await test('duplicate and unknown field shapes stay blocked', async () => {
  const item = { name: 'PUBLIC_LEGAL_OPERATOR_NAME', type: 'plain_text', text: expected };
  assert.equal((await assessLegalOperatorSetting([item, item], expected)).pass, false);
  assert.equal((await assessLegalOperatorSetting([{ ...item, text: undefined }], expected)).pass, false);
  assert.equal((await assessLegalOperatorSetting(null, expected)).pass, false);
});
await test('expected source cannot be replaced by a caller-provided operator', async () => {
  await assert.rejects(() => assessLegalOperatorSetting([], 'nonsecret-offline-different-fixture'), /LOCAL_OPERATOR_SOURCE_VALUE_DRIFT/);
});
console.log(JSON.stringify({ targetedChecks: count, staticParity: 'SOURCE_AND_SEALED_COMPILED_OLD_RC_ENROLLMENT_ENFORCEMENT', productionRequests: 0, productionWrites: 0 }));
