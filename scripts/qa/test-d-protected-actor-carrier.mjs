import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {createHash} from 'node:crypto';
import cp, {fork} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createProtectedActorCarrier} from './d-protected-actor-carrier.mjs';
import {startDProtectedActorChild, D_AUTH_ORIGIN, dActorPayload} from './d-protected-actor-child.mjs';

const hash = v => createHash('sha256').update(v).digest('hex');
const file = fileURLToPath(import.meta.url);
const actorId = '22222222-2222-4222-8222-222222222222';
const executionBindingSha256 = '1'.repeat(64);
const actorEmail = 'fixture+ogh-d-0123456789abcdef@gmail.com', namespace = 'ogh-d-offline-fixture';
const createdAt = '2026-10-30T00:00:00.000000+00:00';
const actorCreationRaw = Buffer.from(JSON.stringify({executionBindingSha256, actorId,
  createdByThisRun: true, createdUtc: createdAt, providerReceiptSha256: '2'.repeat(64)}));
const binding = () => ({executionBindingSha256, actorId, actorEmail, namespace, createdAt,
  actorCreationReceiptSha256: hash(actorCreationRaw), deadlineUtc: new Date(Date.now() + 20000).toISOString()});
const logoutEvidence = () => ({actorId, binding: executionBindingSha256, scope: 'global', signedOut: true,
  requestId: 'fixture-global-signout', completedUtc: new Date().toISOString()});
const adminKey = 'FICTITIOUS.' + Buffer.from(JSON.stringify({ref: 'xcbnxzjlsvtgzixurcof',
  role: 'service_role', exp: 4102444800})).toString('base64url') + '.FICTITIOUS';

if (process.argv[2] === '--native-env-check') {
  process.env.UNRELATED_PRIVATE_TEST_VALUE = 'MUST_NOT_INHERIT';
  process.env.NODE_OPTIONS = '--trace-warnings';
  let checked = false;
  cp.fork = (entry, args, options) => {
    assert.equal(entry.endsWith('d-protected-actor-child.mjs'), true);assert.deepEqual(args, []);
    assert.deepEqual(options.execArgv, []);assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
    assert.equal(options.env.QA_SUPABASE_SERVICE_ROLE_KEY, adminKey);
    assert.equal(options.env.QA_SUPABASE_URL, D_AUTH_ORIGIN);
    assert.equal(Object.keys(options.env).every(k => ['SystemRoot', 'WINDIR', 'TEMP', 'TMP',
      'QA_SUPABASE_URL', 'QA_SUPABASE_SERVICE_ROLE_KEY'].includes(k)), true);
    const child = new EventEmitter();child.connected = true;child.exitCode = null;child.signalCode = null;
    child.send = (frame, callback) => {
      callback?.();
      if (frame.type === 'RUN') queueMicrotask(() => child.emit('message', {v: 1, nonce: frame.nonce,
        id: frame.id, type: 'RESULT', action: 'CONTAIN', result: {state: 'UNKNOWN'}}));
      if (frame.type === 'STOP') queueMicrotask(() => {child.connected = false;child.exitCode = 0;child.emit('close', 0);});
    };
    child.kill = () => {child.signalCode = 'SIGKILL';child.emit('close', null, 'SIGKILL');return true;};
    queueMicrotask(() => child.emit('message', {v: 1, type: 'READY'}));checked = true;return child;
  };
  syncBuiltinESMExports();
  const carrier = createProtectedActorCarrier({beforeDispatch: async () => {throw Error('MUST_NOT_DISPATCH');}});
  await carrier.contain({binding: binding(), actorCreationRaw});await carrier.close();
  process.send({checked}, () => process.disconnect());
} else if (process.argv[2] === '--synthetic-child') {
  const scenario = process.env.D_ACTOR_TEST_CASE;
  if (scenario === 'malformed-frame' || scenario === 'oversized-frame') {
    process.on('message', m => {
      if (m.type === 'STOP') {process.disconnect();return;}
      if (m.type === 'RUN') process.send({v: 1, nonce: m.nonce, id: m.id, type: 'GATE', seq: 1,
        phase: 'ACTOR_PREBAN', method: 'GET', executionBindingSha256,
        extra: scenario === 'oversized-frame' ? 'x'.repeat(30000) : 'PRIVATE_FIELD_MUST_NOT_ESCAPE'});
    });
    process.send({v: 1, type: 'READY'});
  } else {
    let created = false, banned = false;
    const user = () => ({id: actorId, email: actorEmail, created_at: createdAt,
      role: 'authenticated', email_confirmed_at: createdAt,
      user_metadata: {qa_namespace: namespace, untrusted: 'PROVIDER_PRIVATE_FIELD_MUST_NOT_ESCAPE'},
      app_metadata: {role: 'user'}, banned_until: banned ? new Date(Date.now() + 876000 * 3600000).toISOString() : null});
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.apikey, adminKey);
      assert.equal(options.headers.authorization, 'Bearer ' + adminKey);
      assert.equal(options.redirect, 'error');
      if (scenario === 'crash') process.exit(23);
      if (scenario === 'timeout') return new Promise(() => {});
      if (scenario === 'network-unknown') throw Error('PRIVATE_EXCEPTION_MUST_NOT_ESCAPE');
      if (scenario === 'crash-initial-read' && created && options.method === 'GET') process.exit(24);
      assert.equal(url, D_AUTH_ORIGIN + '/auth/v1/admin/users' + (options.method === 'POST' ? '' : '/' + actorId));
      if (options.method === 'POST') {
        assert.equal(created, false);created = true;
        const body = JSON.parse(options.body);
        assert.deepEqual(Object.keys(body).sort(), ['app_metadata', 'email', 'email_confirm', 'password', 'user_metadata']);
        assert.equal(body.email, actorEmail);assert.equal(body.email_confirm, true);
        assert.match(body.password, /^[a-zA-Z0-9_-]{48}$/);
        assert.deepEqual(body.app_metadata, {role: 'user'});
        assert.deepEqual(body.user_metadata, {qa_namespace: namespace});
        if (scenario === 'create-failure') return new Response('{}', {status: 403});
      }
      if (options.method === 'PUT') {
        assert.deepEqual(JSON.parse(options.body), {ban_duration: '876000h'});
        if (scenario === 'ban-failure') return new Response('{}', {status: 403});
        banned = true;
      }
      if (scenario === 'oversized-provider') return new Response('x'.repeat(131073), {status: 200});
      const value = user();
      if (scenario === 'identity-mismatch') value.email = 'other@example.invalid';
      return new Response(JSON.stringify(value), {status: 200});
    };
    // Only the isolated test process replaces the display process. The production
    // fork has no code/transport/display injection field or test-mode switch.
    Object.defineProperty(process, 'platform', {value: 'win32'});
    cp.spawn = (executable, args, options) => {
      assert.equal(options.stdio[0], 'pipe');assert.equal(options.env.QA_SUPABASE_SERVICE_ROLE_KEY, undefined);
      assert.equal(args.some(v => v.includes('FICTITIOUS')), false);
      const display = new EventEmitter();
      display.stdin = new EventEmitter();
      display.stdin.end = text => {
        const p = JSON.parse(text);assert.match(p.password, /^[a-zA-Z0-9_-]{48}$/);
        assert.equal(p.purpose, 'D_FIXTURE_ONLY');assert.equal(p.email, actorEmail);
        if (scenario === 'crash-after-create') {queueMicrotask(() => process.exit(25));return;}
        queueMicrotask(() => display.emit('close', scenario === 'display-failure' ? 1 : 0));
      };
      display.kill = () => {display.emit('close', 1);return true;};
      return display;
    };
    syncBuiltinESMExports();
    if (['crash-after-preban-ack', 'crash-after-ban-ack'].includes(scenario)) {
      process.on('message', frame => {
        const last = scenario === 'crash-after-preban-ack' ? 1 : 2;
        if (frame.type === 'ACK' && frame.kind === 'RESPONSE' && frame.seq === last && frame.approved === true)
          queueMicrotask(() => process.exit(26));
      });
    }
    startDProtectedActorChild(process, process.env);
  }
} else {
  function fixture(t, scenario = 'success', patch = {}) {
    const gates = [], responses = [], children = [];
    const factory = () => {
      const environment = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k])
        .map(k => [k, process.env[k]]));
      const child = fork(file, ['--synthetic-child'], {execArgv: [], windowsHide: true,
        env: {...environment, SystemRoot: environment.SystemRoot ?? 'C:/Windows',
          QA_SUPABASE_URL: D_AUTH_ORIGIN, QA_SUPABASE_SERVICE_ROLE_KEY: scenario === 'invalid-admin' ? 'INVALID' : adminKey,
          D_ACTOR_TEST_CASE: scenario}, stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
      children.push(child);return child;
    };
    const carrier = createProtectedActorCarrier({timeoutMs: 10000, childFactory: factory,
      beforeDispatch: async (phase, intent) => {gates.push({phase, intent});return true;},
      afterResponse: async (phase, evidence) => {responses.push({phase, evidence});return true;}, ...patch});
    t.after(async () => {await carrier.close();assert.equal(children.every(c => c.exitCode !== null || c.signalCode !== null), true);});
    return {carrier, gates, responses, children};
  }
  const contain = (f, extra = {}) => f.carrier.contain({binding: binding(), actorCreationRaw, logoutEvidence: logoutEvidence(), ...extra});
  const create = (f, extra = {}) => f.carrier.create({executionBindingSha256, controlledAlias: actorEmail, namespace,
    privateDirectory: os.tmpdir(), displayReady: true,
    deadlineUtc: new Date(Date.now() + 20000).toISOString(), ...extra});
  const safe = value => {
    const text = JSON.stringify(value);
    for (const secret of [adminKey, 'PRIVATE_EXCEPTION', 'PROVIDER_PRIVATE_FIELD', 'PRIVATE_FIELD_MUST_NOT_ESCAPE'])
      assert.equal(text.includes(secret), false);
    assert.equal(/secretAccessKey|service_role|access_token|"password"|"authorization"/.test(text), false);
  };

  test('protected actor: real child reuses reviewed containment and acknowledges every bounded Auth phase', async t => {
    const f = fixture(t), r = await contain(f);
    assert.equal(r.signedOut, true);assert.equal(r.banned, true);assert.equal(r.independentReadback, true);
    assert.equal(r.childReaped, true);assert.equal(r.productionAuthority, false);safe(r);safe(f.responses);
    assert.deepEqual(f.gates.map(v => v.phase), ['ACTOR_PREBAN', 'ACTOR_BAN', 'ACTOR_READBACK']);
    assert.deepEqual(f.responses.map(v => v.evidence.status), [200, 200, 200]);
    assert.equal(f.responses.every(v => v.evidence.matched === true), true);
    assert.equal(f.gates.every(v => v.intent.endpoint === D_AUTH_ORIGIN + '/auth/v1/admin/users/' + actorId), true);
    await assert.rejects(contain(f));
  });

  test('protected actor: default fork strips unrelated environment and Node flags in a fresh synthetic host', async () => {
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    const child = fork(file, ['--native-env-check'], {execArgv: [], windowsHide: true,
      env: {...env, QA_SUPABASE_URL: D_AUTH_ORIGIN, QA_SUPABASE_SERVICE_ROLE_KEY: adminKey},
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
    let value;
    child.on('message', m => {value = m;});
    const code = await new Promise((resolve, reject) => {child.once('close', resolve);child.once('error', reject);});
    assert.equal(code, 0);assert.deepEqual(value, {checked: true});
  });

  test('protected actor: creation is one confirmed ordinary POST, one GET, child-private display, then same-child containment', async t => {
    const f = fixture(t), r = await create(f);
    assert.equal(r.state, 'CREATED');assert.equal(r.independentReadback, true);assert.equal(f.children.length, 1);
    assert.equal(r.credentialDisplay, 'CLOSED_LOGIN_NOT_INFERRED');safe(r);safe(f.responses);
    assert.equal(typeof r.actorCreationRaw, 'string');assert.equal(hash(r.actorCreationRaw), r.binding.actorCreationReceiptSha256);
    assert.equal(r.actorId, actorId);assert.equal(r.email, actorEmail);assert.equal(r.createdAt, createdAt);
    assert.equal(f.responses[0].evidence.actorCreation, r.actorCreationRaw.toString('utf8'));
    const done = await f.carrier.contain({binding: r.binding, actorCreationRaw: r.actorCreationRaw, logoutEvidence: logoutEvidence()});
    assert.equal(done.banned, true);assert.equal(done.childReaped, true);assert.equal(f.children.length, 1);
    assert.deepEqual(f.gates.map(v => v.phase), ['ACTOR_CREATE', 'ACTOR_INITIAL_READ', 'ACTOR_PREBAN', 'ACTOR_BAN', 'ACTOR_READBACK']);
    await assert.rejects(create(f));
  });

  test('protected actor: invalid inherited admin identity prevents any fixture dispatch or extra permission probe', async t => {
    const f = fixture(t, 'invalid-admin'), r = await create(f);
    assert.equal(r.state, 'UNKNOWN');assert.equal(r.childReaped, true);assert.deepEqual(r.consumedPhases, []);
    assert.equal(f.gates.length, 0);safe(r);
  });

  for (const scenario of ['ban-failure', 'network-unknown', 'identity-mismatch', 'oversized-provider', 'crash']) {
    test(`protected actor: ${scenario} stays UNKNOWN, consumes admitted phases and reaps child`, async t => {
      const f = fixture(t, scenario), r = await contain(f);
      assert.equal(r.state, 'UNKNOWN');assert.equal(r.childReaped, true);safe(r);safe(f.responses);
      assert.deepEqual(r.consumedPhases, scenario === 'ban-failure' ? ['ACTOR_PREBAN', 'ACTOR_BAN'] : ['ACTOR_PREBAN']);
      assert.equal(r.independentReadback, false);
      if (scenario !== 'crash') assert.equal(f.responses.length, r.consumedPhases.length);
    });
  }

  test('protected actor: parent reserve/response rejection prevents the next call and does not retry', async t => {
    for (const hook of ['beforeDispatch', 'afterResponse']) {
      let called = 0;
      const f = fixture(t, 'success', {[hook]: async () => {called++;return false;}}), r = await contain(f);
      assert.equal(r.state, 'UNKNOWN');assert.equal(r.childReaped, true);assert.equal(called, 1);
      assert.deepEqual(r.consumedPhases, ['ACTOR_PREBAN']);
    }
  });

  test('protected actor: stalled provider and aborted pending journal gate cannot resume or leak a live child', async t => {
    const stalled = fixture(t, 'timeout', {timeoutMs: 1000});
    const r = await contain(stalled);assert.equal(r.state, 'UNKNOWN');assert.equal(r.childReaped, true);
    assert.deepEqual(r.consumedPhases, ['ACTOR_PREBAN']);
    let release, entered;
    const gate = new Promise(resolve => {release = resolve;}), seen = new Promise(resolve => {entered = resolve;});
    const f = fixture(t, 'success', {beforeDispatch: () => {entered();return gate;}});
    const controller = new AbortController(), pending = contain(f, {signal: controller.signal});
    await seen;controller.abort();const stopped = await pending;release(true);
    assert.equal(stopped.state, 'UNKNOWN');assert.equal(stopped.childReaped, true);assert.equal(f.responses.length, 0);
  });

  for (const scenario of ['malformed-frame', 'oversized-frame']) {
    test(`protected actor: ${scenario} fails closed without invoking journal or exposing input`, async t => {
      const f = fixture(t, scenario), r = await contain(f);
      assert.equal(r.state, 'UNKNOWN');assert.equal(r.childReaped, true);assert.equal(f.gates.length, 0);safe(r);
    });
  }

  test('protected actor: creation/display failure preserves known actor receipt without repeating creation', async t => {
    const f = fixture(t, 'display-failure'), r = await create(f);
    assert.equal(r.state, 'UNKNOWN');assert.equal(typeof r.actorCreationRaw, 'string');safe(r);
    assert.deepEqual(r.consumedPhases, ['ACTOR_CREATE', 'ACTOR_INITIAL_READ']);
    const cleanup = await f.carrier.contain({binding: r.binding, actorCreationRaw: r.actorCreationRaw, logoutEvidence: logoutEvidence()});
    assert.equal(cleanup.banned, true);assert.equal(cleanup.childReaped, true);
    const bad = fixture(t, 'create-failure'), denied = await create(bad);
    assert.equal(denied.state, 'UNKNOWN');assert.equal(denied.actorCreationRaw, undefined);assert.equal(denied.childReaped, true);
  });

  test('protected actor: failed creation response acknowledgement preserves the exact actor for separate cleanup', async t => {
    let recorded;
    const f = fixture(t, 'success', {afterResponse: async (phase, evidence) => {
      assert.equal(phase, 'ACTOR_CREATE');recorded = evidence;return false;
    }});
    const r = await create(f);assert.equal(r.state, 'UNKNOWN');assert.equal(r.childReaped, true);
    assert.deepEqual(r.consumedPhases, ['ACTOR_CREATE']);assert.equal(typeof r.actorCreationRaw, 'string');
    assert.equal(r.actorCreationRaw.toString('utf8'), recorded.actorCreation);safe(r);safe(recorded);
    const cleanup = fixture(t);
    const done = await cleanup.carrier.contain({binding: r.binding, actorCreationRaw: r.actorCreationRaw, logoutEvidence: logoutEvidence()});
    assert.equal(done.banned, true);assert.equal(done.childReaped, true);
  });

  test('protected actor: a crashed create child hands its proven actor to a separate standalone containment carrier', async t => {
    for (const scenario of ['crash-after-create', 'crash-initial-read']) {
      const creator = fixture(t, scenario), r = await create(creator);
      assert.equal(r.state, 'UNKNOWN');assert.equal(r.childReaped, true);
      assert.deepEqual(r.consumedPhases, ['ACTOR_CREATE', 'ACTOR_INITIAL_READ']);
      assert.equal(r.actorId, actorId);assert.equal(typeof r.actorCreationRaw, 'string');
      assert.equal(creator.responses[0].phase, 'ACTOR_CREATE');
      assert.equal(creator.responses[0].evidence.actorCreation, r.actorCreationRaw);
      assert.equal(creator.responses.length, scenario === 'crash-after-create' ? 2 : 1);
      await assert.rejects(create(creator));
      const cleanup = fixture(t);
      const contained = await cleanup.carrier.contain({binding: r.binding, actorCreationRaw: r.actorCreationRaw,
        logoutEvidence: logoutEvidence()});
      assert.equal(contained.banned, true);assert.equal(contained.independentReadback, true);
      assert.equal(contained.childReaped, true);safe(r);safe(contained);
      assert.deepEqual(cleanup.gates.map(v => v.phase), ['ACTOR_PREBAN', 'ACTOR_BAN', 'ACTOR_READBACK']);
      assert.equal(cleanup.gates.some(v => ['ACTOR_CREATE', 'ACTOR_INITIAL_READ'].includes(v.phase)), false);
    }
  });

  test('protected actor: interrupted acknowledged containment stays blocked on restart without replay or phase skipping', async t => {
    for (const scenario of ['crash-after-preban-ack', 'crash-after-ban-ack']) {
      const reserved = new Set(), acknowledged = new Map(), attempts = [];
      const hooks = {
        beforeDispatch: async phase => {
          attempts.push(phase);
          if (reserved.has(phase)) return false;
          reserved.add(phase);return true;
        },
        afterResponse: async (phase, evidence) => {acknowledged.set(phase, evidence);return true;}
      };
      const first = fixture(t, scenario, hooks), interrupted = await contain(first);
      const completed = scenario === 'crash-after-preban-ack' ? ['ACTOR_PREBAN'] : ['ACTOR_PREBAN', 'ACTOR_BAN'];
      assert.equal(interrupted.state, 'UNKNOWN');assert.equal(interrupted.childReaped, true);
      assert.deepEqual([...acknowledged.keys()], completed);
      assert.deepEqual([...reserved], completed);
      assert.equal([...acknowledged.values()].every(e => e.matched === true && e.status === 200), true);
      const restarted = fixture(t, 'success', hooks), blocked = await contain(restarted);
      assert.equal(blocked.state, 'UNKNOWN');assert.equal(blocked.childReaped, true);
      assert.equal(blocked.independentReadback, false);
      assert.deepEqual(attempts, [...completed, 'ACTOR_PREBAN']);
      assert.deepEqual([...reserved], completed);assert.deepEqual([...acknowledged.keys()], completed);
      assert.equal(acknowledged.has('ACTOR_READBACK'), false);
      assert.equal(typeof restarted.carrier.resumeContain, 'undefined');safe(interrupted);safe(blocked);
    }
  });

  test('protected actor: thrown journal hooks and wrong creation display hash fail without further phases', async t => {
    for (const hook of ['beforeDispatch', 'afterResponse']) {
      const f = fixture(t, 'success', {[hook]: async () => {throw Error('PRIVATE_EXCEPTION_MUST_NOT_ESCAPE');}});
      const r = await contain(f);assert.equal(r.state, 'UNKNOWN');assert.equal(r.childReaped, true);
      assert.deepEqual(r.consumedPhases, ['ACTOR_PREBAN']);safe(r);
    }
  });

  test('protected actor: request fields, receipt hash, alias and fixed display pin reject before child dispatch', async t => {
    let spawned = 0;
    const carrier = createProtectedActorCarrier({beforeDispatch: async () => true, childFactory: () => {spawned++;throw Error();}});
    await assert.rejects(carrier.contain({binding: binding(), actorCreationRaw: Buffer.from('{}')}));
    await assert.rejects(carrier.contain({binding: binding(), actorCreationRaw, logoutEvidence: {...logoutEvidence(), access_token: 'MUST_NOT_SEND'}}));
    await assert.rejects(carrier.create({executionBindingSha256, controlledAlias: 'other@example.invalid', namespace,
      privateDirectory: os.tmpdir(), displayReady: true,
      deadlineUtc: new Date(Date.now() + 20000).toISOString(), displaySourceSha256: 'a'.repeat(64)}));
    await assert.rejects(carrier.create({executionBindingSha256, controlledAlias: actorEmail, namespace,
      privateDirectory: os.tmpdir(), displayReady: false, deadlineUtc: new Date(Date.now() + 20000).toISOString()}));
    assert.equal(spawned, 0);await carrier.close();
    const f = fixture(t), r = await create(f, {displaySourceSha256: 'a'.repeat(64)});
    assert.equal(r.state, 'UNKNOWN');assert.equal(f.gates.length, 0);
    assert.throws(() => dActorPayload('CREATE', {executionBindingSha256, controlledAlias: actorEmail, namespace,
      deadlineUtc: new Date().toISOString(), displaySourceSha256: 'a'.repeat(64), workerCode: 'FORBIDDEN'}));
  });
}
