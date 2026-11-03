import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSupervised } from '../e-verify-group1-remaining-assets/supervisor.mjs';
const cwd = path.dirname(fileURLToPath(import.meta.url)), out = path.join(cwd, 'artifacts', 'offline-' + Date.now());
fs.mkdirSync(out, { recursive: true });
for (const mode of ['success', 'no-callback', 'abort', 'idle', 'unknown', 'sdk-error']) test('standard Chrome offline fixture: ' + mode, async () => {
  const file = path.join(out, mode + '.json');
  const s = await runSupervised({ entry: 'offline-child.mjs', args: [mode, file], cwd,
    deadlineMs: 30000, graceMs: 3000, reserveMs: 5000, receiptPath: path.join(out, mode + '-supervisor.json'),
    env: Object.fromEntries(['SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
  assert.equal(s.classification, 'EXIT_ZERO'); assert.equal(s.reaped, true); assert.equal(s.containment.closed, true);
  const r = JSON.parse(fs.readFileSync(file));
  assert.equal(r.cleanupStatus, 'PASS'); assert.equal(r.profileRemoved, true); assert.equal(r.fixtureOnly, true);
  assert.equal(r.networkBoundary, 'MONITOR_ONLY'); assert.equal(r.workerSupervisionBeforeExecution, false);
  assert.equal(r.hardGlobalNetworkLimit, false); assert.equal(r.allNetworkRequestsObservable, false);
  assert.equal(r.credentialsUsed, false); assert.equal(r.productionRequests, 0); assert.equal(r.thirdPartyLiveRequests, 0);
  assert.ok(!JSON.stringify(r).includes('DISCARDED_FAKE_TOKEN'));
  assert.ok(Object.values(r.capabilityBooleans).every(Boolean));
  assert.equal(r.sdkHits, mode === 'idle' ? 0 : 1);
  if (mode === 'success') {
    assert.equal(r.outcome, 'ISOLATED_OBSERVATION_COMPLETE'); assert.equal(r.startClicked, true);
    assert.equal(r.stageResults.callback, true); assert.equal(r.ownerFinished, true);
    assert.ok(r.observedFrames > 0); assert.ok(r.workerHits > 0); assert.ok(r.observedWorkers > 0);
  } else if (mode === 'no-callback') {
    assert.equal(r.outcome, 'INCOMPLETE'); assert.equal(r.stageResults.callback, false); assert.equal(r.ownerFinished, true);
  } else {
    assert.equal(r.outcome, 'BLOCKED');
    if (mode === 'abort') assert.equal(r.stopReason, 'HUMAN_ABORT');
    if (mode === 'idle') { assert.equal(r.stopReason, 'WORK_DEADLINE'); assert.equal(r.startClicked, false); }
    if (mode === 'unknown') assert.ok(['CSP_BLOCKED', 'OBSERVED_UNKNOWN_ORIGIN', 'OBSERVED_UNKNOWN_FRAME'].includes(r.stopReason));
  }
  console.log('STANDARD_OFFLINE_RECEIPT=' + file);
}, { timeout: 35000 });
