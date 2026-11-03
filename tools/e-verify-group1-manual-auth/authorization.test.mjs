import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ID, GO, GATES, sha, validate, claimOnce } from './authorization.mjs';
test('new authorization requires every fresh decision, correct hashes, full time and no previous Claim', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const packetBytes = Buffer.from(JSON.stringify({ authorizationId: ID, contractSha256: 'FIXTURE_CONTRACT', browserNetworkBoundary: 'MONITOR_ONLY',
    ownerBudgets: { allBrowserHttpDispatchesMax: 650, openaiAndProviderCostUSDMax: 0 }, requiredCases: Array(14).fill('FIXTURE'), catalogRestRequests: Array(16).fill('FIXTURE'), executionLimitSeconds: 1800, catalogHold: 'ACTIVE' }));
  const bindingBytes = Buffer.from(JSON.stringify({ authorizationId: ID, packetSha256: sha(packetBytes), files: [] }));
  const auth = { authorizationId: ID, status: 'AUTHORIZED', fullContractAccepted: true, humanGates: Object.fromEntries(GATES.map(k => [k, true])),
    authorizedAtUTC: '2026-10-14T12:00:00Z', authorizationExpiresUTC: '2026-10-14T13:00:00Z', contractSha256: 'FIXTURE_CONTRACT', packetSha256: sha(packetBytes), executionBindingSha256: sha(bindingBytes) };
  const options = { packetBytes, bindingBytes, go: GO, now };
  assert.equal(validate(auth, options), true);
  assert.throws(() => validate({ ...auth, humanGates: { ...auth.humanGates, privateSdkStorageSnapshotAndNoRawEvidenceExportAccepted: null } }, options));
  assert.throws(() => validate(auth, { ...options, claimExists: true }));
  assert.throws(() => validate(auth, { ...options, now: now + 1800000 }));
  assert.throws(() => validate({ ...auth, authorizationId: 'OLD_CONSUMED_INSTANCE' }, options));
  assert.throws(() => validate(auth, { ...options, go: 'GO_OLD_V11' }));
  assert.throws(() => validate({ ...auth, packetSha256: 'DRIFT' }, options));
});
test('Claim replay is denied in an owned local test fixture, never a production Claim', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ogh-claim-fixture-')), file = path.join(folder, 'fixture.claim');
  try { claimOnce(file); assert.equal(fs.readFileSync(file, 'utf8'), ID + '\n'); assert.throws(() => claimOnce(file)); }
  finally { fs.unlinkSync(file); fs.rmdirSync(folder); }
});
