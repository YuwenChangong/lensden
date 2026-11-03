import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createProductionDispatchGuard} from './production-dispatch-guard.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const source = new URL('./production-dispatch-guard.mjs', import.meta.url);
const binding = {authorizationSha256: 'a'.repeat(64), guardSourceSha256: hash(fs.readFileSync(source)),
  sourceCommit: 'b'.repeat(40), nonce: 'offline_fixture_0001',
  notBeforeUtc: '2026-10-30T00:00:00.000Z', deadlineUtc: '2026-10-30T00:10:00.000Z'};
const operations = [{phase: 'BEFORE_GET', method: 'GET', target: 'https://example.invalid/config'},
  {phase: 'PUT', method: 'PUT', target: 'https://example.invalid/config', body: '{"rules":[]}'},
  {phase: 'AFTER_GET', method: 'GET', target: 'https://example.invalid/config'}];
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, overrides = {}, build = true) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogh-dispatch-offline-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const calls = [];
  const options = {directory, binding, operations, now: () => Date.parse('2026-10-30T00:00:01.000Z'),
    timeoutMs: 100, admit: async () => true,
    transport: async op => { calls.push(op.phase); return {status: 200, complete: true}; },
    validateResponse: response => response.status === 200 && response.complete === true, ...overrides};
  return {options, calls, directory, guard: build ? createProductionDispatchGuard(options) : null};
}

test('guard: transport only runs after exclusive, synced, exact readback; all three steps are bounded', async t => {
  const f = fixture(t, {}, false); const events = [];
  const sync = fs.fsyncSync, read = fs.readFileSync;
  t.mock.method(fs, 'fsyncSync', (...args) => { events.push('sync'); return sync(...args); });
  t.mock.method(fs, 'readFileSync', (...args) => { const bytes = read(...args); events.push('read'); return bytes; });
  const g = createProductionDispatchGuard({...f.options, transport: async op => {
    assert.deepEqual(events.slice(-2), ['sync', 'read']);
    const file = fs.readdirSync(f.directory).find(n => n.endsWith(`.${op.phase}.used.json`));
    const receipt = JSON.parse(read(path.join(f.directory, file)));
    assert.equal(receipt.requestSha256, hash(JSON.stringify(op)));
    assert.equal(receipt.authorizationSha256, binding.authorizationSha256);
    assert.equal(receipt.guardSourceSha256, binding.guardSourceSha256);
    f.calls.push(op.phase); return {status: 200, complete: true};
  }});
  for (const op of operations) await g.dispatch(op.phase);
  assert.deepEqual(f.calls, ['BEFORE_GET', 'PUT', 'AFTER_GET']);
  assert.equal(g.status().exhausted, true);
  await assert.rejects(g.dispatch('PUT'));
  assert.equal(f.calls.length, 3);
});

for (const failure of ['open', 'write', 'sync', 'close', 'read', 'mismatch']) {
  test(`guard: ${failure} failure prevents PUT and every later request`, async t => {
    const f = fixture(t); await f.guard.dispatch('BEFORE_GET');
    const method = {open: 'openSync', write: 'writeFileSync', sync: 'fsyncSync', close: 'closeSync',
      read: 'readFileSync', mismatch: 'readFileSync'}[failure];
    const original = fs[method];
    const mock = t.mock.method(fs, method, (...args) => {
      if (failure === 'mismatch') return Buffer.from('{}\n');
      if (failure === 'close') original(...args);
      throw Error('OFFLINE_FAULT_ONLY');
    });
    await assert.rejects(f.guard.dispatch('PUT'), /FAIL_CLOSED/);
    mock.mock.restore();
    await assert.rejects(f.guard.dispatch('AFTER_GET'));
    assert.deepEqual(f.calls, ['BEFORE_GET']);
    assert.equal(f.guard.status().stopped, true);
  });
}

test('guard: restart, changed body/source and duplicate phase cannot reuse a claimed operation', async t => {
  const f = fixture(t); await f.guard.dispatch('BEFORE_GET');
  const changed = structuredClone(operations); changed[0].target = 'https://example.invalid/other';
  assert.throws(() => createProductionDispatchGuard({...f.options, operations: changed}));
  assert.deepEqual(f.calls, ['BEFORE_GET']);
  assert.throws(() => createProductionDispatchGuard({...f.options,
    binding: {...binding, guardSourceSha256: '0'.repeat(64)}}));
  assert.throws(() => createProductionDispatchGuard({...f.options, operations: [operations[0], operations[0]]}));
});

test('guard: denied, thrown, or tool-shaped admission proof is not admission', async t => {
  for (const admit of [async () => false, async () => { throw Error(); }, async () => ({isError: true}),
    async () => ({durableIntentReadback: true})]) {
    const f = fixture(t, {admit});
    await assert.rejects(f.guard.dispatch('BEFORE_GET'));
    assert.equal(f.calls.length, 0);
    assert.throws(() => createProductionDispatchGuard({...f.options, admit: async () => true}));
  }
});

test('guard: unknown/HTTP error/tool error result stops before any subsequent operation', async t => {
  for (const response of [undefined, {isError: true, status: 200, complete: true},
    {status: 403, complete: true}, {status: 200}, {status: 200, complete: false}]) {
    let calls = 0; const f = fixture(t, {transport: async () => { calls++; return response; }});
    await assert.rejects(f.guard.dispatch('BEFORE_GET'));
    await assert.rejects(f.guard.dispatch('PUT'));
    assert.equal(calls, 1);
    assert.equal(fs.readdirSync(f.directory).filter(n => n.endsWith('.used.json')).length, 1);
  }
});

test('guard: expiry during admission, explicit stop, and concurrent entry prevent a late dispatch', async t => {
  for (const action of ['expiry', 'stop', 'concurrent']) {
    let release, time = Date.parse('2026-10-30T00:00:01.000Z');
    const wait = new Promise(resolve => { release = resolve; });
    const f = fixture(t, {now: () => time, admit: () => wait});
    const pending = f.guard.dispatch('BEFORE_GET'); await tick();
    if (action === 'expiry') time = Date.parse(binding.deadlineUtc);
    if (action === 'stop') f.guard.stop();
    if (action === 'concurrent') await assert.rejects(f.guard.dispatch('BEFORE_GET'));
    release(true); await assert.rejects(pending);
    assert.equal(f.calls.length, 0);
  }
});

test('guard: gate timeout cannot resume after a late true result', async t => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const f = fixture(t, {timeoutMs: 10, admit: () => wait});
  await assert.rejects(f.guard.dispatch('BEFORE_GET'));
  release(true); await tick();
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.guard.dispatch('BEFORE_GET'));
  assert.throws(() => createProductionDispatchGuard({...f.options, admit: async () => true}));
});

test('guard: explicit stop before the first operation is durable across reconstruction', async t => {
  const f = fixture(t); f.guard.stop();
  await assert.rejects(f.guard.dispatch('BEFORE_GET'));
  assert.throws(() => createProductionDispatchGuard(f.options));
  assert.equal(f.calls.length, 0);
});

test('guard: transport timeout/unknown never enables retry or late completion', async t => {
  let release; const wait = new Promise(resolve => { release = resolve; }); let calls = 0;
  const f = fixture(t, {timeoutMs: 10, transport: () => { calls++; return wait; }});
  await assert.rejects(f.guard.dispatch('BEFORE_GET'));
  release({status: 200, complete: true}); await tick();
  await assert.rejects(f.guard.dispatch('PUT'));
  assert.equal(calls, 1); assert.equal(f.guard.status().completed, 0);
});

test('guard: synchronous persistence crossing the per-operation deadline cannot send', async t => {
  let time = Date.parse('2026-10-30T00:00:01.000Z');
  const f = fixture(t, {now: () => time, timeoutMs: 100});
  const sync = fs.fsyncSync;
  t.mock.method(fs, 'fsyncSync', (...args) => { sync(...args); time += 101; });
  await assert.rejects(f.guard.dispatch('BEFORE_GET'));
  assert.equal(f.calls.length, 0);
});

test('guard: failed post-response persistence preserves the attempt and stops later requests', async t => {
  const f = fixture(t); const open = fs.openSync;
  const mock = t.mock.method(fs, 'openSync', (file, ...args) => {
    if (String(file).endsWith('.result.json')) throw Error('OFFLINE_DISK_FAULT');
    return open(file, ...args);
  });
  await assert.rejects(f.guard.dispatch('BEFORE_GET'));
  mock.mock.restore();
  await assert.rejects(f.guard.dispatch('PUT'));
  assert.equal(f.calls.length, 1);
  assert.equal(f.guard.status().completed, 0);
  assert.equal(fs.readdirSync(f.directory).filter(n => n.endsWith('.used.json')).length, 1);
});

test('guard: external binding/body mutation and async response approval do not weaken the bound request', async t => {
  const mutableBinding = structuredClone(binding), mutableOps = structuredClone(operations);
  const f = fixture(t, {binding: mutableBinding, operations: mutableOps});
  mutableBinding.deadlineUtc = '2099-01-01T00:00:00.000Z'; mutableOps[1].body = 'UNAPPROVED';
  await f.guard.dispatch('BEFORE_GET'); await f.guard.dispatch('PUT');
  const file = fs.readdirSync(f.directory).find(n => n.endsWith('.PUT.used.json'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory, file))).requestSha256, hash(JSON.stringify(operations[1])));
  const g = fixture(t, {validateResponse: async () => true});
  await assert.rejects(g.guard.dispatch('BEFORE_GET'));
});

const lockBase='https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/r2/buckets/openglasshub-media';
const lockRemaining=[{phase:'LOCK_PUT',method:'PUT',target:lockBase+'/lock',body:'{"rules":[]}'},
  {phase:'LOCK_AFTER',method:'GET',target:lockBase+'/lock'},
  {phase:'LIFECYCLE_AFTER',method:'GET',target:lockBase+'/lifecycle'}];
const lockBinding={...binding,lockTimeoutAmendmentSha256:'c'.repeat(64)};

test('guard: explicit lock-only amendment permits13.534s/10.857s responses within30s',async t=>{
  let time=Date.parse('2026-10-30T00:00:01.000Z');
  const f=fixture(t,{binding:lockBinding,operations:lockRemaining,timeoutMs:30000,now:()=>time,
    transport:async op=>{time+=op.phase==='LOCK_PUT'?13534:10857;return {status:200,complete:true};}});
  for(const op of lockRemaining)await f.guard.dispatch(op.phase);
  assert.equal(f.guard.status().completed,3);assert.equal(f.guard.status().exhausted,true);
  const file=fs.readdirSync(f.directory).find(n=>n.endsWith('.LOCK_PUT.used.json'));
  const receipt=JSON.parse(fs.readFileSync(path.join(f.directory,file)));
  assert.equal(receipt.lockTimeoutAmendmentSha256,lockBinding.lockTimeoutAmendmentSha256);
  assert.equal(receipt.requestTimeoutMs,30000);
});

test('guard: thirty-second policy cannot spread to other endpoints, accounts, methods or unpinned callers',t=>{
  const invalid=[{binding}, {binding:{...lockBinding,lockTimeoutAmendmentSha256:'0'.repeat(64)}},
    ...[10000,10001,29999,30001].map(timeoutMs=>({timeoutMs})),
    {operations:[{...lockRemaining[0],target:lockBase+'/cors'}]},
    {operations:[{...lockRemaining[0],target:lockBase.replace('openglasshub-media','other')+'/lock'}]},
    {operations:[{...lockRemaining[0],target:lockBase.replace('dcb374166b39234a499985145c075f50','unapproved')+'/lock'}]},
    {operations:[{...lockRemaining[0],method:'DELETE'}]},
    {operations:[{...lockRemaining[0],phase:'UNBOUND_PHASE'}]},
    {operations:[lockRemaining[2],lockRemaining[0]]}];
  for(const patch of invalid)assert.throws(()=>fixture(t,{binding:lockBinding,operations:lockRemaining,
    timeoutMs:30000,...patch}),/PRODUCTION_DISPATCH_/);
});

test('guard: unamended callers retain ten-second maximum and reject13.534s completion',async t=>{
  let time=Date.parse('2026-10-30T00:00:01.000Z');
  const f=fixture(t,{timeoutMs:10000,now:()=>time,transport:async()=>{time+=13534;return {status:200,complete:true};}});
  await assert.rejects(f.guard.dispatch('BEFORE_GET'));assert.equal(f.guard.status().completed,0);
  assert.throws(()=>fixture(t,{timeoutMs:30000}),/BINDING_INVALID/);
});

test('guard: thirty-second cutoff still stops late results and forbids retry/reconstruction',async t=>{
  let time=Date.parse('2026-10-30T00:00:01.000Z'),calls=0;
  const f=fixture(t,{binding:lockBinding,operations:lockRemaining,timeoutMs:30000,now:()=>time,
    transport:async()=>{calls++;time+=30000;return {status:200,complete:true};}});
  await assert.rejects(f.guard.dispatch('LOCK_PUT'));await assert.rejects(f.guard.dispatch('LOCK_AFTER'));
  assert.equal(calls,1);assert.equal(f.guard.status().completed,0);
  assert.throws(()=>createProductionDispatchGuard(f.options));
});

test('guard: lock PUT requires enough original-window time for all remaining calls and margin',async t=>{
  const time=Date.parse(binding.deadlineUtc)-119999;let calls=0;
  const f=fixture(t,{binding:lockBinding,operations:lockRemaining,timeoutMs:30000,now:()=>time,
    transport:async()=>{calls++;return {status:200,complete:true};}});
  await assert.rejects(f.guard.dispatch('LOCK_PUT'));assert.equal(calls,0);
  assert.equal(fs.readdirSync(f.directory).some(n=>n.endsWith('.used.json')),false);
});

test('guard: amended PUT cannot omit either independent readback or shrink its reserve',t=>{
  for(const incomplete of [[lockRemaining[0]],[lockRemaining[0],lockRemaining[1]],
    [lockRemaining[0],lockRemaining[2]]]){
    assert.throws(()=>fixture(t,{binding:lockBinding,operations:incomplete,timeoutMs:30000,
      now:()=>Date.parse(binding.deadlineUtc)-60000}),/PRODUCTION_DISPATCH_/);
  }
});

test('guard: amended reads cannot run or acknowledge past the unchanged overall deadline',async t=>{
  let time=Date.parse(binding.deadlineUtc)-20000,calls=0;
  const f=fixture(t,{binding:lockBinding,operations:lockRemaining.slice(2),timeoutMs:30000,now:()=>time,
    transport:async()=>{calls++;time=Date.parse(binding.deadlineUtc);return {status:200,complete:true};}});
  await assert.rejects(f.guard.dispatch('LIFECYCLE_AFTER'));assert.equal(calls,1);
  assert.equal(f.guard.status().completed,0);
});
