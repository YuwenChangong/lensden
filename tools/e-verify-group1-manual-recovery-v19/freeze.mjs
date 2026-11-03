import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ID, GO, GATES, sha } from './authorization.mjs';
import { readPrivateVersion } from '../e-verify-group1-full650-chrome-v11/policy.mjs';
const here = fileURLToPath(new URL('.', import.meta.url)), out = path.join(here, 'artifacts');
const previous = path.resolve(here, '../e-verify-group1-fast-track-v18/artifacts');
const bb = fs.readFileSync(path.join(previous, 'EXECUTION_BINDING.json'));
const pb = fs.readFileSync(path.join(previous, 'PACKET_NOT_AUTHORIZED.json'));
assert.equal(sha(bb), 'c0c416e1aa4750319c760c852a75db0560794a691ed7bb7b691ed11f28d741e8');
assert.equal(sha(pb), '106ba518ece42834a1e435cbb34976914772954a4771bbfcc0b11d60a48a4c76');
const old = JSON.parse(bb), original = JSON.parse(pb);
for (const f of old.files) assert.equal(sha(fs.readFileSync(f.path)), f.sha256, 'PREVIOUS_FROZEN_FILE_DRIFT');
readPrivateVersion(old, original);
const closure = JSON.parse(fs.readFileSync(path.join(previous, 'GO_CLOSURE_SAFE.json')));
assert.equal(closure.authorizationConsumed, true); assert.equal(closure.claimCreated, true);
assert.equal(closure.status, 'BLOCKED'); assert.equal(closure.cleanup, 'PASS');
for (const [n, h] of Object.entries(closure.originalReceiptSha256)) assert.equal(sha(fs.readFileSync(path.join(previous, n))), h);
const contract = fs.readFileSync(path.join(here, 'CONTRACT_NOT_AUTHORIZED.md'));
fs.mkdirSync(out, { recursive: true });
const write = (n, data) => fs.writeFileSync(path.join(out, n), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const template = 'HUMAN_GROUP1_MANUAL_RECOVERY_V19_AUTHORIZATION_NOT_AUTHORIZED.md';
fs.writeFileSync(path.join(out, template), contract, { flag: 'wx' });
const packet = { ...original, authorizationId: ID, format: 'group1-native-manual-recovery-v19', independentGo: GO,
  executionEntry: path.join(here, 'entry.mjs'), contractPath: path.join(out, template), contractSha256: sha(contract),
  previousAuthorizationId: original.authorizationId, previousAuthorizationConsumed: true, previousOwnerGatesApplied: false,
  ownerGates: Object.fromEntries(GATES.map(g => [g, null])), authorizedAtUTC: null, authorizationExpiresUTC: null,
  productionAuthorization: 'NOT_AUTHORIZED', claimCreated: false, readiness: 'READY_FOR_OWNER_APPROVAL',
  abortContinuationPolicy: { error: 'net::ERR_ABORTED', method: 'GET', resourceType: 'fetch', originClass: 'OTHER',
    scope: 'POSITIVE_LOGIN_ONLY', classification: 'UNRESOLVED', priorSafetyChecksRequired: true,
    frameObservedRequired: true, startedRequired: true, originalRequestAndCurrentStageMustMatch: true,
    maximumEvidenceRecordsPerContext: 40, evidenceOverflowStops: true, automaticRetry: false,
    networkPermissionExpansion: false, independentIdentityBeforeRlsRequired: true,
    unknownCancellationIsBenign: false, newOwnerGate: 'unresolvedExternalFetchAbortContinuationAccepted' } };
write('PACKET_NOT_AUTHORIZED.json', packet);
const packetSha256 = sha(fs.readFileSync(path.join(out, 'PACKET_NOT_AUTHORIZED.json')));
const files = new Map(old.files.map(f => [f.path, { ...f }]));
const additions = [path.join(previous, 'EXECUTION_BINDING.json'), path.join(previous, 'PACKET_NOT_AUTHORIZED.json'),
  path.join(previous, 'GO_CLOSURE_SAFE.json'), path.join(previous, 'OWNER_POST_EXECUTION_OBSERVATION_SAFE.json'),
  ...Object.keys(closure.originalReceiptSha256).map(n => path.join(previous, n)),
  ...fs.readdirSync(here).filter(n => /\.(mjs|md)$/.test(n) || n === '.gitattributes').map(n => path.join(here, n)), path.join(out, template)];
for (const file of additions) { const p = file.replaceAll('\\', '/'); files.set(p, { path: p, sha256: sha(fs.readFileSync(file)) }); }
write('EXECUTION_BINDING.json', { ...old, authorizationId: ID, packetSha256,
  files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), previousBindingSha256: sha(bb),
  previous362FrozenFilesUnchanged: true, previousAuthorizationConsumed: true, oldAuthorizationReused: false });
const bindingSha256 = sha(fs.readFileSync(path.join(out, 'EXECUTION_BINDING.json')));
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json', { authorizationId: ID, status: 'NOT_AUTHORIZED', fullContractAccepted: false,
  humanGates: packet.ownerGates, authorizedAtUTC: null, authorizationExpiresUTC: null,
  executionBindingSha256: bindingSha256, packetSha256, contractSha256: sha(contract) });
const preserved = ['ownerBudgets', 'requiredCases', 'catalogRestRequests', 'actors', 'loginActions', 'appOrigin', 'supabaseOrigin',
  'applicationPages', 'pageContentAssertions', 'authPaths', 'staticManifest', 'dynamicPrivateProfileGet', 'ownBackgroundGet',
  'adminGet', 'excluded', 'recoveryBoundary', 'executionLimitSeconds', 'workLimitSeconds', 'cleanupReserveSeconds',
  'oauthRemainingSecondsStrictlyGreaterThan', 'expectedProductionVersion', 'sourceSha', 'fastTrackPolicy'];
for (const key of preserved) assert.deepEqual(packet[key], original[key], 'SCOPE_OR_BUDGET_CHANGED:' + key);
const summary = { authorizationId: ID, readiness: 'READY_FOR_OWNER_APPROVAL', bindingSha256, packetSha256,
  contractSha256: sha(contract), frozenFiles: files.size, previous362FrozenFilesUnchanged: true,
  allBudgetsUnchanged: true, preservedScopeFields: preserved, nodeIdentityAndRlsTransportUnchanged: true,
  ownerGates: '11_PENDING', utcWindow: 'PENDING', authorization: 'NOT_AUTHORIZED', claimCreated: false, goIssued: false,
  productionRequests: 0, thirdPartyLiveRequests: 0, productionWrites: 0 };
write('CONSISTENCY_SAFE.json', summary); console.log(JSON.stringify(summary));
