import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ID, GO, GATES, sha, validate } from './authorization.mjs';
const root = new URL('./artifacts/', import.meta.url);
const packetBytes = fs.readFileSync(new URL('PACKET_NOT_AUTHORIZED.json', root));
const bindingBytes = fs.readFileSync(new URL('EXECUTION_BINDING.json', root));
const packet = JSON.parse(packetBytes), now = Date.now();
// Synthetic in-memory authorization only; never persist it or create a Claim.
const fixtureAuth = () => ({ authorizationId: ID, status: 'AUTHORIZED', fullContractAccepted: true,
  humanGates: Object.fromEntries(GATES.map(k => [k, true])), executionBindingSha256: sha(bindingBytes),
  packetSha256: sha(packetBytes), contractSha256: packet.contractSha256,
  authorizedAtUTC: new Date(now - 1000).toISOString(), authorizationExpiresUTC: new Date(now + 2700000).toISOString() });
const options = { packetBytes, bindingBytes, go: GO, now };
test('new freeze matches validator but persisted authorization is still pending', () => {
  assert.equal(validate(fixtureAuth(), options), true);
  const pending = JSON.parse(fs.readFileSync(new URL('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json', root)));
  assert.throws(() => validate(pending, options), /NEW_MANUAL_AUTHORIZATION_REQUIRED/);
  assert.ok(GATES.every(k => pending.humanGates[k] === null));
  for (const n of ['ONCE.claim', 'CHILD_ONCE.claim', 'AUTHORIZATION_APPROVED.json']) assert.equal(fs.existsSync(new URL(n, root)), false);
});
test('new abort risk gate cannot inherit the consumed v18 approval', () => {
  const a = fixtureAuth(); delete a.humanGates.unresolvedExternalFetchAbortContinuationAccepted;
  assert.throws(() => validate(a, options), /NEW_MANUAL_AUTHORIZATION_REQUIRED/);
  const old = JSON.parse(fs.readFileSync(new URL('../../e-verify-group1-fast-track-v18/artifacts/AUTHORIZATION_APPROVED.json', root)));
  assert.throws(() => validate(old, options), /NEW_MANUAL_AUTHORIZATION_REQUIRED/);
});
test('consumed claim, wrong GO and insufficient time all reject before execution', () => {
  assert.throws(() => validate(fixtureAuth(), { ...options, claimExists: true }), /NEW_MANUAL_AUTHORIZATION_REQUIRED/);
  assert.throws(() => validate(fixtureAuth(), { ...options, go: 'GO_E_VERIFY_GROUP1_NATIVE_MANUAL_AUTH_FAST_TRACK_V18' }));
  const a = fixtureAuth(); a.authorizationExpiresUTC = new Date(now + 1800000).toISOString();
  assert.throws(() => validate(a, options), /AUTHORIZATION_TIME_COVERAGE/);
});
test('all original budgets, Node routes, identities, cases and deadlines remain identical', () => {
  const old = JSON.parse(fs.readFileSync(new URL('../../e-verify-group1-fast-track-v18/artifacts/PACKET_NOT_AUTHORIZED.json', root)));
  for (const k of ['ownerBudgets', 'actors', 'requiredCases', 'catalogRestRequests', 'authPaths', 'staticManifest', 'fastTrackPolicy',
    'loginActions', 'executionLimitSeconds', 'workLimitSeconds', 'cleanupReserveSeconds', 'recoveryBoundary']) assert.deepEqual(packet[k], old[k]);
  assert.equal(packet.abortContinuationPolicy.classification, 'UNRESOLVED');
  assert.equal(packet.abortContinuationPolicy.networkPermissionExpansion, false);
});
