import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ID, GO, GATES, sha, validate } from './authorization.mjs';
import { GATES as oldGates } from '../e-verify-group1-control-v16/authorization.mjs';
import { diagnosticBrowserFactory } from './browser-factory.mjs';
import { reviewProtectedIndex } from './evidence-review.mjs';
import { readPrivateVersion } from '../e-verify-group1-full650-chrome-v11/policy.mjs';
import { scopeFields, scopeDigest } from 'file:///C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/free-plan-policy.mjs';
const here = fileURLToPath(new URL('.', import.meta.url)), root = path.join(here, 'artifacts');
const previous = path.resolve(here, '../e-verify-group1-control-v16');
const read = p => fs.readFileSync(p), json = p => JSON.parse(read(p)), checks = [];
const bb = read(path.join(root, 'EXECUTION_BINDING.json')), pb = read(path.join(root, 'PACKET_NOT_AUTHORIZED.json'));
const binding = JSON.parse(bb), packet = JSON.parse(pb), old = json(path.join(previous, 'artifacts/PACKET_NOT_AUTHORIZED.json'));
const oldBinding = json(path.join(previous, 'artifacts/EXECUTION_BINDING.json'));
const check = async (name, action) => { await action(); checks.push({ name, result: 'PASS' }); };
await check('ORIGINAL_305_AND_CONSUMED_RECEIPTS_UNCHANGED', () => {
  assert.equal(oldBinding.files.length, 305);
  for (const f of oldBinding.files) assert.equal(sha(read(f.path)), f.sha256);
  const closure = json(path.join(previous, 'artifacts/GO_CLOSURE_SAFE.json'));
  assert.equal(closure.authorizationConsumed, true); assert.equal(closure.claimCreated, true);
  for (const [file, hash] of Object.entries(closure.originalReceiptSha256)) assert.equal(sha(read(path.join(previous, 'artifacts', file))), hash);
});
await check('NEW_BINDING_PACKET_CONTRACT_AND_ENTRY_CONSISTENT', () => {
  for (const f of binding.files) assert.equal(sha(read(f.path)), f.sha256);
  assert.equal(binding.authorizationId, ID); assert.equal(packet.authorizationId, ID); assert.equal(sha(pb), binding.packetSha256);
  assert.equal(packet.executionEntry, path.join(here, 'entry.mjs')); assert.equal(packet.independentGo, GO);
  assert.equal(sha(read(packet.contractPath)), packet.contractSha256);
});
await check('ALL_UNCHANGED_NETWORK_BUSINESS_AND_BUDGET_FIELDS', () => {
  const changes = new Set(['format', 'authorizationId', 'independentGo', 'executionEntry', 'contractSha256', 'previousAuthorizationId', 'ownerGates']);
  for (const key of Object.keys(old)) if (!changes.has(key)) assert.deepEqual(packet[key], old[key], 'UNEXPECTED_PACKET_CHANGE_' + key);
  assert.equal(packet.requiredCases.length, 14); assert.equal(packet.catalogRestRequests.length, 16);
  assert.equal(packet.staticManifest.length, 29); assert.equal(packet.protectedOriginPolicy.networkPermissionExpansion, false);
  assert.equal(packet.ownerBudgets.allBrowserHttpDispatchesMax, 650); assert.equal(packet.ownerBudgets.openaiAndProviderCostUSDMax, 0);
});
await check('THIRTEEN_MATERIAL_CONDITIONS_BYTE_IDENTICAL', () => {
  const section = s => s.slice(s.indexOf('## Thirteen material conditions'), s.indexOf('## ', s.indexOf('## Thirteen material conditions') + 3));
  assert.equal(section(read(packet.contractPath).toString()), section(read(path.join(previous, 'CONTRACT_NOT_AUTHORIZED.md')).toString()));
});
await check('TEN_UNAPPROVED_GATES_NO_UTC_AUTH_CLAIM_OR_GO', () => {
  assert.deepEqual(GATES.slice(0, 9), oldGates); assert.equal(GATES[9], 'protectedOriginCollectionLocalReviewAndCleanupAccepted');
  assert.deepEqual(packet.ownerGates, Object.fromEntries(GATES.map(g => [g, null])));
  const auth = json(path.join(root, 'AUTHORIZATION_PENDING_NOT_AUTHORIZED.json'));
  assert.equal(auth.status, 'NOT_AUTHORIZED'); assert.equal(auth.fullContractAccepted, false);
  assert.equal(auth.authorizedAtUTC, null); assert.equal(auth.authorizationExpiresUTC, null);
  assert.equal(auth.executionBindingSha256, sha(bb)); assert.equal(auth.packetSha256, sha(pb)); assert.equal(auth.contractSha256, packet.contractSha256);
  for (const name of ['AUTHORIZATION_APPROVED.json', 'ONCE.claim', 'CHILD_ONCE.claim', 'EXECUTION_SAFE.json', 'PREFLIGHT_ONCE_SAFE.json']) assert.equal(fs.existsSync(path.join(root, name)), false);
});
await check('EXISTING_PRIVATE_650_BINDING_VALUE_BLIND_MATCH', () => { readPrivateVersion(binding, packet); });
await check('EXISTING_FREE_PLAN_REFERENCE_AND_V16_NETWORK_SCOPE_UNCHANGED', () => {
  const proof = read(path.resolve(here, '../e-verify-group1-full650-chrome-v11/artifacts/OWNER_FREE_PLAN_EVIDENCE.json'));
  assert.equal(sha(proof), old.freePlanProofSha256); assert.equal(packet.freePlanProofSha256, old.freePlanProofSha256);
  for (const key of scopeFields) assert.deepEqual(packet[key], old[key]);
  const evidence = JSON.parse(proof); assert.equal(evidence.ownerEvidence, 'OWNER_ATTESTED'); assert.equal(evidence.providerEvidence, 'PROVIDER_DOCUMENTED');
  assert.equal(evidence.policy.MAX_ADDITIONAL_COST_USD, 0);
  // Historical free-plan hashes do not certify the later native-packet shape.
  assert.equal(packet.billingEvidenceReuse.legacyScopeDigestIsNewAuthorization, false);
  assert.equal(scopeDigest(packet), scopeDigest(old));
});
await check('UNCHANGED_13_TEST_DIAGNOSTIC_IMPLEMENTATION_REUSED', () => {
  const base = path.resolve(here, '../e-verify-group1-origin-integration'), proof = json(path.join(base, 'artifacts/OFFLINE_INTEGRATION_SAFE.json'));
  assert.equal(proof.tests.passed, 13); assert.equal(proof.tests.total, 13);
  for (const f of proof.files) assert.equal(sha(read(path.join(base, f.file))), f.sha256);
});
await check('EXACT_PARENT_ENTRY_AND_ONLY_DISCLOSED_CHILD_ADAPTER_CHANGES', () => {
  assert.equal(read(path.join(here, 'entry.mjs')).toString().replaceAll('\r\n', '\n'), read(path.join(previous, 'entry.mjs')).toString().replaceAll('\r\n', '\n'));
  let child = read(path.join(here, 'child.mjs')).toString();
  child = child.replace("import { diagnosticBrowserFactory } from './browser-factory.mjs';", "import { pinnedOpen } from '../e-verify-group1-chrome-v15/chrome-identity.mjs';\nimport { openNativeBrowser } from './browser.mjs';")
    .replace('  const openBrowser = diagnosticBrowserFactory({ packet, assertions, remaining, browsers });',
      "  const openBrowser = async options => {\n    const browser = await pinnedOpen(() => openNativeBrowser({ ...options, headless: false, iconPaths: packet.iconPaths, pageAssertions: assertions,\n      workMs: Math.min(remaining, options.workMs) })); browsers.push(browser); return browser;\n  };")
    .replace("authorizationId: JSON.parse(fs.readFileSync(root + 'PACKET_NOT_AUTHORIZED.json')).authorizationId, format: 'group1-native-manual-protected-origin-v17'", "format: 'group1-native-manual-safe-control-v16'")
    .replace("manualRetries: 0, protectedOriginEvidenceCleanup: 'REQUIRES_SEPARATE_LOCAL_REVIEW_AND_DESTROY', nativeBrowserEvidence:", 'manualRetries: 0, nativeBrowserEvidence:');
  assert.equal(child, read(path.join(previous, 'child.mjs')).toString().replaceAll('\r\n', '\n'));
});
await check('THIN_STORE_FACTORY_NO_PERMISSION_EXPANSION_OR_REAL_CAPTURE', async () => {
  const before = Date.now(), browsers = [], options = { actor: 'A', workMs: 1740000, budget: {} };
  let expiry, opened, closed = false; const store = { close: async o => { assert.equal(o.destroy, true); closed = true; } };
  const factory = diagnosticBrowserFactory({ packet, assertions: {}, remaining: 10000, browsers,
    openStore: async o => { expiry = Date.parse(o.expiresUTC); return store; }, pin: cb => cb(), open: async o => { opened = o; return { fixture: true }; } });
  await factory(options); assert.equal(browsers.length, 1); assert.equal(opened.diagnosticStore, store); assert.equal(opened.budget, options.budget);
  assert.equal(opened.workMs, 10000); assert.equal(opened.headless, false); assert.equal(closed, false);
  assert.ok(expiry >= before + 3600000 && expiry <= Date.now() + 3600000);
  const failed = diagnosticBrowserFactory({ packet, remaining: 10000, browsers, openStore: async () => store, pin: cb => cb(),
    open: async () => { throw Error('FIXTURE_OPEN_FAILED'); } });
  await assert.rejects(failed(options), /FIXTURE_OPEN_FAILED/); assert.equal(closed, true); assert.equal(browsers.length, 1);
});
await check('OFFLINE_REVIEW_CLASSIFICATION_ONLY_AND_VERIFIED_DELETION', async () => {
  const index = { evidenceStoreId: '1'.repeat(32), storageNamespace: 'e-verify-group1-offline-origin-' + '2'.repeat(32),
    evidence: [{ evidenceRef: 'origin-' + '3'.repeat(32), ciphertextSha256: '4'.repeat(64) }] };
  let destroyed = false;
  const openStore = async () => ({ read: async () => ({ scheme: 'https:', host: 'PRIVATE_FIXTURE_ADDRESS.example.invalid', port: '443' }),
    close: async o => { assert.equal(o.destroy, true); destroyed = true; } });
  const result = await reviewProtectedIndex(index, packet, { openStore });
  assert.equal(result.reviewed[0].originClass, 'UNAPPROVED_ORIGIN'); assert.equal(result.deleted, true); assert.equal(destroyed, true);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_FIXTURE_ADDRESS'));
  const expired = await reviewProtectedIndex(index, packet, { openStore: async () => ({ read: async () => { throw Error('PRIVATE_FIXTURE_SECRET'); }, close: async () => {} }) });
  assert.equal(expired.readFailure, 'PRIVATE_REVIEW_FAILED_OR_EXPIRED'); assert.equal(expired.deleted, true); assert.ok(!JSON.stringify(expired).includes('PRIVATE_FIXTURE_SECRET'));
  await assert.rejects(reviewProtectedIndex(index, packet, { openStore: async () => ({ read: async () => ({}), close: async () => { throw Error('DESTROY_FAILED'); } }) }), /DESTROY_FAILED/);
  await assert.rejects(reviewProtectedIndex({ ...index, evidenceStoreId: '../outside' }, packet, { openStore }), /PRIVATE_INDEX_INVALID/);
});
await check('PENDING_AND_OLD_AUTHORIZATION_CANNOT_EXECUTE_OR_REPLAY', () => {
  const pending = json(path.join(root, 'AUTHORIZATION_PENDING_NOT_AUTHORIZED.json'));
  assert.throws(() => validate(pending, { packetBytes: pb, bindingBytes: bb, go: GO }), /NEW_MANUAL_AUTHORIZATION_REQUIRED/);
  assert.throws(() => validate(pending, { packetBytes: pb, bindingBytes: bb, go: old.independentGo, claimExists: true }), /NEW_MANUAL_AUTHORIZATION_REQUIRED/);
});
await check('NEW_ENTRY_AND_HELPERS_SYNTAX_CHECK_ONLY_NO_EXECUTION', () => {
  for (const file of fs.readdirSync(here).filter(n => n.endsWith('.mjs'))) {
    const result = spawnSync(process.execPath, ['--check', path.join(here, file)], { windowsHide: true, timeout: 5000 });
    assert.equal(result.status, 0, 'SYNTAX_' + file);
  }
});
const result = { format: 'group1-origin-contract-consistency-v1', authorizationId: ID, status: 'PASS', checks,
  bindingSha256: sha(bb), packetSha256: sha(pb), contractSha256: packet.contractSha256, boundFiles: binding.files.length,
  previous305FilesUnchanged: true, realPrivateOriginCollection: false, prior13TestsReusedNotRerun: true,
  productionAuthorization: 'NOT_AUTHORIZED', allHumanGates: 'PENDING', utcWindow: 'PENDING', claimCreated: false, goIssued: false,
  productionRequests: 0, thirdPartyLiveRequests: 0, productionWrites: 0, catalogHold: 'ACTIVE' };
fs.writeFileSync(path.join(root, 'CONSISTENCY_SAFE.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, consistencyChecks: checks.length, boundFiles: binding.files.length,
  bindingSha256: result.bindingSha256, packetSha256: result.packetSha256, contractSha256: result.contractSha256,
  productionRequests: 0, thirdPartyLiveRequests: 0, realPrivateOriginCollection: false }));
