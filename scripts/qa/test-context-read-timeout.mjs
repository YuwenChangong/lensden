import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createProductionDispatchGuard} from './production-dispatch-guard.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const start = Date.parse('2026-10-30T00:00:00.000Z');
const target = 'https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/r2/buckets/openglasshub-media';
const operations = [
  {phase: 'CONTEXT_LOCK', method: 'GET', target: `${target}/lock`},
  {phase: 'CONTEXT_BUCKET', method: 'GET', target}
];
const binding = {
  authorizationSha256: 'a'.repeat(64), contextReadTimeoutAmendmentSha256: 'a'.repeat(64),
  guardSourceSha256: hash(fs.readFileSync(new URL('./production-dispatch-guard.mjs', import.meta.url))),
  sourceCommit: 'b'.repeat(40), nonce: 'offline_context_only_0001',
  notBeforeUtc: new Date(start).toISOString(), deadlineUtc: new Date(start + 3600000).toISOString()
};
function fixture(t, patch = {}, build = true) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogh-context-offline-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const f = {directory, time: start + 1000, calls: []};
  f.options = {directory, binding, operations, timeoutMs: 30000, now: () => f.time,
    admit: async () => true, validateResponse: r => r.status === 200 && r.complete === true,
    transport: async op => {
      const intent = JSON.parse(fs.readFileSync(path.join(directory,
        fs.readdirSync(directory).find(n => n.endsWith(`.${op.phase}.used.json`)))));
      assert.equal(intent.requestSha256, hash(JSON.stringify(op)));
      assert.equal(intent.requestTimeoutMs, 30000);
      assert.equal(intent.contextReadTimeoutAmendmentSha256, binding.authorizationSha256);
      f.calls.push(op.phase);
      f.time += op.phase === 'CONTEXT_LOCK' ? 13534 : 10857;
      return {status: 200, complete: true};
    }, ...patch};
  if (build) f.guard = createProductionDispatchGuard(f.options);
  return f;
}

test('context30: both exact GETs accept 13.534s/10.857s after durable intent, once only', async t => {
  const f = fixture(t);
  for (const op of operations) await f.guard.dispatch(op.phase);
  assert.deepEqual(f.calls, ['CONTEXT_LOCK', 'CONTEXT_BUCKET']);
  assert.deepEqual(f.guard.status(), {stopped: false, completed: 2, exhausted: true});
  assert.equal(fs.readdirSync(f.directory).filter(n => n.endsWith('.used.json')).length, 2);
  await assert.rejects(f.guard.dispatch('CONTEXT_BUCKET'));
  assert.throws(() => createProductionDispatchGuard(f.options));
  assert.equal(f.calls.length, 2);
});

test('context30: scope cannot spread to writes, other endpoints/accounts/buckets, or query/body', t => {
  const invalid = [
    {...operations[0], method: 'PUT', body: '{}'},
    {...operations[0], method: 'HEAD'},
    {...operations[0], target: `${target}/lifecycle`},
    {...operations[0], target: `${target}/cors`},
    {...operations[0], target: target.replace('openglasshub-media', 'other') + '/lock'},
    {...operations[0], target: target.replace('dcb374166b39234a499985145c075f50', 'other') + '/lock'},
    {...operations[0], target: `${target}/lock?extra=true`},
    {...operations[0], body: '{}'},
    {...operations[0], phase: 'LOCK_BEFORE'},
    {...operations[0], phase: 'CONTEXT_BUCKET'}
  ];
  for (const op of invalid) {
    const f = fixture(t, {operations: [op]}, false);
    assert.throws(() => createProductionDispatchGuard(f.options), /PRODUCTION_DISPATCH_/);
    assert.deepEqual(fs.readdirSync(f.directory), []);
  }
});

test('context30: exact signed opt-in, exact timeout, unique GET2 maximum and 60min maximum required', t => {
  const withoutOptIn = {...binding}; delete withoutOptIn.contextReadTimeoutAmendmentSha256;
  const invalid = [
    {binding: withoutOptIn},
    {binding: {...binding, contextReadTimeoutAmendmentSha256: '0'.repeat(64)}},
    {binding: {...binding, contextReadTimeoutAmendmentSha256: 'c'.repeat(64)}},
    {binding: {...binding, lockTimeoutAmendmentSha256: 'c'.repeat(64)}},
    {binding: {...binding, deadlineUtc: new Date(start + 3600001).toISOString()}},
    ...[10000, 29999, 30001].map(timeoutMs => ({timeoutMs})),
    {operations: [operations[0], operations[0]]},
    {operations: [...operations, {...operations[0], phase: 'EXTRA'}]}
  ];
  for (const patch of invalid) {
    const f = fixture(t, patch, false);
    assert.throws(() => createProductionDispatchGuard(f.options), /PRODUCTION_DISPATCH_/);
    assert.deepEqual(fs.readdirSync(f.directory), []);
  }
});

test('context30: exact 30s is timeout, consumed dispatch cannot retry or be reconstructed', async t => {
  const f = fixture(t, {}, false);
  f.options.transport = async op => { f.calls.push(op.phase); f.time += 30000; return {status: 200, complete: true}; };
  f.guard = createProductionDispatchGuard(f.options);
  await assert.rejects(f.guard.dispatch('CONTEXT_LOCK'), /FAIL_CLOSED/);
  await assert.rejects(f.guard.dispatch('CONTEXT_BUCKET'));
  assert.throws(() => createProductionDispatchGuard(f.options));
  assert.deepEqual(f.calls, ['CONTEXT_LOCK']);
  assert.equal(f.guard.status().completed, 0);
  assert.equal(fs.readdirSync(f.directory).filter(n => n.endsWith('.used.json')).length, 1);
});

test('context30: 60min deadline stops late acknowledgements and no expired dispatch is sent', async t => {
  const f = fixture(t); f.time = start + 3600000 - 10000;
  await assert.rejects(f.guard.dispatch('CONTEXT_LOCK'));
  assert.equal(f.guard.status().completed, 0);
  assert.equal(f.calls.length, 1);
  const expired = fixture(t, {now: () => start + 3600000}, false);
  assert.throws(() => createProductionDispatchGuard(expired.options));
  assert.deepEqual(fs.readdirSync(expired.directory), []);
});

test('context30: intent persistence failure dispatches nothing; HTTP failure stops remaining GET', async t => {
  const f = fixture(t);
  const read = fs.readFileSync;
  const mock = t.mock.method(fs, 'readFileSync', (file, ...args) =>
    String(file).endsWith('.used.json') ? Buffer.from('{}\n') : read(file, ...args));
  await assert.rejects(f.guard.dispatch('CONTEXT_LOCK'));
  mock.mock.restore();
  assert.equal(f.calls.length, 0);
  const bad = fixture(t, {transport: async () => ({status: 403, complete: true})});
  await assert.rejects(bad.guard.dispatch('CONTEXT_LOCK'));
  await assert.rejects(bad.guard.dispatch('CONTEXT_BUCKET'));
  assert.equal(bad.guard.status().completed, 0);
});

test('context30: other callers retain 10s; legacy lock-only opt-in remains separate', async t => {
  const noOptIn = {...binding}; delete noOptIn.contextReadTimeoutAmendmentSha256;
  const f = fixture(t, {binding: noOptIn, timeoutMs: 10000,
    transport: async () => { f.time += 13534; return {status: 200, complete: true}; }});
  await assert.rejects(f.guard.dispatch('CONTEXT_LOCK'));
  const legacy = fixture(t, {binding: {...noOptIn, lockTimeoutAmendmentSha256: 'c'.repeat(64)},
    operations: [{phase: 'LOCK_BEFORE', method: 'GET', target: `${target}/lock`}],
    transport: async () => ({status: 200, complete: true})});
  await legacy.guard.dispatch('LOCK_BEFORE');
  assert.equal(legacy.guard.status().completed, 1);
});
