import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSupervised } from '../e-verify-group1-remaining-assets/supervisor.mjs';

const cwd = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(cwd, 'artifacts', 'offline-' + Date.now());
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'CAPABILITIES_SAFE.json');
const receipt = path.join(out, 'SUPERVISOR_SAFE.json');
test('actual Chrome: frozen API constraints and Worker-only experiment, offline only', async t => {
  const s = await runSupervised({ entry: 'capability-child.mjs', args: [file], cwd,
    deadlineMs: 60000, graceMs: 3000, reserveMs: 5000, receiptPath: receipt,
    env: Object.fromEntries(['SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
  assert.equal(s.classification, 'EXIT_ZERO');
  assert.equal(s.containment.closed, true);
  assert.equal(s.reaped, true);
  const r = JSON.parse(fs.readFileSync(file));
  const [baseline, frozen, experiment] = r.observations;
  await t.test('native APIs exist before the frozen init script', () => {
    assert.equal(baseline.main.Worker.available, true);
    assert.equal(baseline.child.Worker.available, true);
    assert.equal(baseline.child.SharedWorker.available, true);
    assert.equal(baseline.childWorker, 'LOCAL_WORKER_OK');
  });
  await t.test('actual frozen init removes and locks six APIs in main and cross-origin iframe', () => {
    for (const target of [frozen.main, frozen.child]) for (const descriptor of Object.values(target)) {
      assert.deepEqual(descriptor, { available: false, writable: false, configurable: false });
    }
    assert.equal(frozen.childWorker, 'CONSTRUCTOR_UNAVAILABLE');
  });
  await t.test('harness CSP independently denies Worker, even with a native constructor', () => {
    assert.equal(r.actualHarnessWorkerSrcNone, true);
    assert.equal(baseline.mainWorker, 'WORKER_BLOCKED');
    assert.equal(experiment.mainWorker, 'WORKER_BLOCKED');
  });
  await t.test('Worker-only LOCAL experiment changes exactly one constructor capability', () => {
    assert.equal(experiment.child.Worker.available, true);
    for (const key of Object.keys(frozen.child).filter(k => k !== 'Worker')) assert.deepEqual(experiment.child[key], frozen.child[key]);
    assert.equal(experiment.childWorker, 'LOCAL_WORKER_OK');
  });
  await t.test('measure Worker target/fetch without assuming a page-level interception bypass', () => {
    assert.ok(experiment.workerTargets >= 1);
    assert.equal(experiment.workerFetchHits, 1);
    assert.ok(experiment.pageFetchWorkerEvents >= 0 && experiment.pageFetchWorkerEvents <= experiment.workerFetchHits);
    assert.equal(experiment.workerFetchClassifications.length, experiment.pageFetchWorkerEvents);
    for (const entry of experiment.workerFetchClassifications) {
      assert.equal(typeof entry.frameRegistered, 'boolean');
      assert.match(entry.classification, /^[A-Z_]+$/);
    }
    assert.equal(r.actualAutoAttachExcludesWorkerTargets, true);
  });
  await t.test('no vendor execution, account input or live configuration change', () => {
    assert.equal(r.officialSdkExecuted, false);
    assert.equal(r.productionRequests, 0);
    assert.equal(r.thirdPartyLiveRequests, 0);
    assert.equal(r.accountInputsUsed, false);
    assert.equal(r.frozenConfigurationChanged, false);
    assert.equal(r.noVendorRootCauseClaim, true);
  });
  await t.test('deny-proxy/DNS, Node guard, service-worker policy and cleanup preserved', () => {
    assert.equal(r.proxyRejectOnly, true);
    assert.equal(r.nonLoopbackDnsDisabled, true);
    assert.equal(r.serviceWorkersBlockedInAllModes, true);
    assert.equal(r.launchFlagsReused, true);
    assert.equal(r.nodeDenials, 0);
    assert.equal(r.deniedPageRequests, 0);
    assert.equal(r.profileRemoved, true);
  });
  console.log('OFFLINE_CAPABILITY_RECEIPT=' + file);
}, { timeout: 65000 });
