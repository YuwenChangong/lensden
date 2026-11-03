import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('./mfa-stepup-observation.mjs', import.meta.url), 'utf8');
function fixture(options = {}) {
  let now = 0, callback, listener, timer, delay, unsubscribes = 0;
  const api = runInNewContext(source.replaceAll('export ', '') + '\n({ installMfaStepupObservation });', {
    performance: { now: () => now },
    setTimeout(fn, ms) { timer = fn; delay = ms; return 1; },
    clearTimeout() { timer = undefined; },
  });
  const secret = new Proxy({}, { get() { throw new Error('PRIVATE_FIXTURE_UNREADABLE'); } });
  const response = error => Object.defineProperty({ error }, 'data', { get() { throw secret; } });
  const calls = { challenge: 0, verify: 0 };
  const mfa = {};
  const challengeResult = response(null), verifyResult = response(null);
  let resolveChallenge;
  const deferred = new Promise(resolve => { resolveChallenge = resolve; });
  function challenge() {
    calls.challenge++;
    assert.equal(this, mfa);
    assert.equal(arguments.length, 2);
    assert.equal(arguments[0], secret); assert.equal(arguments[1], secret);
    if (options.throws) throw options.throws;
    return options.pending ? deferred : options.challengePromise ?? Promise.resolve(options.challengeResult ?? challengeResult);
  }
  function verify() {
    calls.verify++;
    assert.equal(this, mfa);
    assert.equal(arguments[0], secret);
    if (options.verifyThrows) throw options.verifyThrows;
    return options.verifyPromise ?? Promise.resolve(options.verifyResult ?? verifyResult);
  }
  Object.defineProperty(mfa, 'challenge', { value: challenge, writable: !options.frozen, configurable: true, enumerable: true });
  Object.defineProperty(mfa, 'verify', { value: verify, writable: true, configurable: true, enumerable: false });
  const descriptors = Object.getOwnPropertyDescriptors(mfa);
  const auth = { mfa, onAuthStateChange(fn) {
    callback = fn; callback('INITIAL_SESSION', secret);
    return options.badSubscription ? {} : { data: { subscription: { unsubscribe() {
      unsubscribes++; if (options.unsubscribeFails) throw secret;
    } } } };
  } };
  for (const name of ['getSession', 'getUser', 'refreshSession']) {
    Object.defineProperty(auth, name, { get() { throw secret; } });
  }
  const form = {
    addEventListener(type, fn, config) {
      assert.equal(type, 'submit'); assert.equal(config.passive, true); assert.equal(config.capture, true);
      listener = fn; if (options.addFails) throw secret;
    },
    removeEventListener(type, fn, capture) {
      assert.equal(type, 'submit'); assert.equal(fn, listener); assert.equal(capture, true);
      listener = undefined;
    },
  };
  Object.defineProperty(form, 'elements', { get() { throw secret; } });
  const event = { isTrusted: true };
  for (const key of ['target', 'submitter', 'preventDefault', 'stopPropagation']) {
    Object.defineProperty(event, key, { get() { throw secret; } });
  }
  return { api, auth, form, mfa, secret, descriptors, calls, challengeResult, verifyResult, response,
    install: () => api.installMfaStepupObservation(form, auth),
    submit: (trusted = true) => listener?.(trusted ? event : { isTrusted: false }),
    challenge: () => mfa.challenge(secret, secret), verify: () => mfa.verify(secret),
    emit: name => callback(name, secret), advance: ms => { now += ms; }, expire: () => timer?.(),
    resolveChallenge: () => resolveChallenge(challengeResult),
    clock: () => ({ delay, timer: !!timer, unsubscribes }),
  };
}

test('owner UI remains caller; exact this/args/promise/results survive and data stays unread', async () => {
  const originalPromise = Promise.resolve(Object.defineProperty({ error: null }, 'data', { get() { throw Error('SECRET'); } }));
  const f = fixture({ challengePromise: originalPromise });
  const observer = f.install();
  try {
    assert.deepEqual(f.calls, { challenge: 0, verify: 0 });
    assert.equal(f.clock().delay, 120000);
    f.advance(100000); f.submit(); assert.equal(f.clock().delay, 12000);
    const returned = f.challenge(); assert.equal(returned, originalPromise);
    assert.equal(await returned, await originalPromise);
    assert.equal(await f.verify(), f.verifyResult);
    f.emit('MFA_CHALLENGE_VERIFIED');
    const value = observer.snapshot();
    assert.equal(value.challenge.success, true); assert.equal(value.verify.success, true);
    assert.equal(value.challenge.completion, 'RETURNED'); assert.equal(value.challenge.httpStatus, null);
    assert.equal(value.sdkMfaEvent, 'OBSERVED');
    assert.equal(value.sdkAal, 'UNKNOWN'); assert.equal(value.workerAal, 'UNKNOWN');
    assert.equal(value.productionAcceptance, 'NOT_EVALUATED'); assert.equal(value.recoveryAuthorized, false);
    assert.equal(JSON.stringify(value).includes('PRIVATE_FIXTURE'), false);
  } finally { observer.detach(); }
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.mfa), f.descriptors);
});

test('fulfilled SDK error projects only exact allowlisted code and integer status', async () => {
  const error = Object.defineProperties({ code: 'mfa_verification_failed', status: 400 }, {
    message: { get() { throw Error('SECRET'); } }, details: { get() { throw Error('SECRET'); } },
  });
  const result = { error, data: null };
  const f = fixture({ verifyResult: result }); const o = f.install();
  try {
    f.submit(); await f.challenge(); assert.equal(await f.verify(), result);
    const value = o.snapshot().verify;
    assert.equal(value.success, false); assert.equal(value.errorCode, 'mfa_verification_failed');
    assert.equal(value.httpStatus, 400); assert.equal(value.invocations, 1);
    assert.throws(() => f.verify(), /SDK_FAILURE/); assert.equal(f.calls.verify, 1);
  } finally { o.detach(); }
});

test('unlisted codes and string status are not copied; challenge failure blocks verify', async () => {
  const f = fixture({ challengeResult: { error: { code: 'PRIVATE_FIXTURE', status: '400' } } });
  const o = f.install();
  try {
    f.submit(); await f.challenge();
    assert.equal(o.snapshot().challenge.errorCode, 'UNLISTED');
    assert.equal(o.snapshot().challenge.httpStatus, null);
    assert.throws(() => f.verify(), /SDK_FAILURE/); assert.equal(f.calls.verify, 0);
  } finally { o.detach(); }
});

test('original synchronous throw and promise rejection retain exact identity', async () => {
  const thrown = { code: 'mfa_factor_not_found', status: 404 };
  const f = fixture({ throws: thrown }); const o = f.install();
  try { f.submit(); assert.throws(() => f.challenge(), e => e === thrown);
    assert.equal(o.snapshot().challenge.completion, 'THREW');
  } finally { o.detach(); }
  const rejected = { code: 'request_timeout', status: 504 };
  const g = fixture(); const p = g.install();
  try {
    // The caller supplies the original promise; the helper never invokes a method.
    g.submit(); await g.challenge();
    const h = fixture({ verifyPromise: Promise.reject(rejected) }); const q = h.install();
    try { h.submit(); await h.challenge(); await assert.rejects(h.verify(), e => e === rejected);
      assert.equal(q.snapshot().verify.completion, 'REJECTED');
    } finally { q.detach(); }
  } finally { p.detach(); }
});

test('synthetic submit cannot arm SDK calls; duplicate call and out-of-order verify fail closed', async () => {
  const f = fixture(); const o = f.install();
  try { f.submit(false); assert.throws(() => f.challenge(), /TRUSTED_SUBMIT_REQUIRED/);
    assert.equal(f.calls.challenge, 0);
  } finally { o.detach(); }
  const g = fixture(); const p = g.install();
  try { g.submit(); assert.throws(() => g.verify(), /ORDER_BLOCKED/); assert.equal(g.calls.verify, 0); }
  finally { p.detach(); }
  const h = fixture(); const q = h.install();
  try { h.submit(); await h.challenge(); assert.throws(() => h.challenge(), /REPEAT_BLOCKED/);
    assert.equal(h.calls.challenge, 1); assert.throws(() => h.verify(), /REPEAT_BLOCKED/);
  } finally { q.detach(); }
});

test('second trusted submit blocks subsequent SDK calls without resetting the deadline', () => {
  const f = fixture(); const o = f.install();
  try { f.submit(); f.submit(); assert.throws(() => f.challenge(), /REPEAT_BLOCKED/);
    assert.equal(f.calls.challenge, 0); assert.equal(f.clock().delay, 12000);
  } finally { o.detach(); }
});

test('idle and operation deadlines restore methods; late result stays UNKNOWN', async () => {
  const f = fixture(); const o = f.install(); f.advance(120000); f.expire();
  assert.equal(o.snapshot().detachedBy, 'DEADLINE'); assert.equal(o.snapshot().challenge.success, null);
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.mfa), f.descriptors);
  const g = fixture({ pending: true }); const p = g.install();
  g.submit(); const returned = g.challenge(); g.advance(12000); g.expire();
  g.resolveChallenge(); await returned;
  assert.equal(p.snapshot().challenge.completion, 'UNKNOWN');
  assert.equal(p.snapshot().challenge.success, null);
});

test('callbacks after absolute deadline fail closed before delayed timeout runs', () => {
  const f = fixture(); const o = f.install(); f.submit(); const saved = f.mfa.challenge;
  f.advance(12000); assert.throws(() => saved.call(f.mfa, f.secret, f.secret), /CLOSED/);
  assert.equal(f.calls.challenge, 0); assert.equal(o.snapshot().detachedBy, 'DEADLINE');
});

test('detach is idempotent; restore exact own descriptors and never overwrite a replacement', () => {
  const f = fixture(); const o = f.install(); const replacement = () => null;
  f.mfa.verify = replacement;
  const value = o.detach(); assert.equal(f.mfa.verify, replacement);
  assert.equal(value.methodsRestored.verify, 'NOT_OWNED'); assert.equal(value.cleanup, 'UNCONFIRMED');
  assert.deepEqual(o.detach(), value);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.mfa, 'challenge'), f.descriptors.challenge);
  f.emit('MFA_CHALLENGE_VERIFIED'); assert.deepEqual(o.snapshot(), value);
});

test('nonwritable methods reject installation without pretending readiness', () => {
  const f = fixture({ frozen: true });
  assert.throws(() => f.install(), /METHODS_NOT_WRAPPABLE/);
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.mfa), f.descriptors);
  assert.deepEqual(f.calls, { challenge: 0, verify: 0 });
});

test('partial installation rolls back and failed cleanup is reported safely', () => {
  const f = fixture({ addFails: true });
  assert.throws(() => f.install(), e => e.message === 'MFA_OBSERVATION_INSTALL_FAILED');
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.mfa), f.descriptors);
  assert.throws(() => f.install(), /ALREADY_USED/);
  const g = fixture({ badSubscription: true });
  assert.throws(() => g.install(), /CLEANUP_UNCONFIRMED/);
  assert.deepEqual(Object.getOwnPropertyDescriptors(g.mfa), g.descriptors);
});

test('method ownership change blocks original invocation; missing result projection stays UNKNOWN', async () => {
  const f = fixture(); const o = f.install(); const saved = f.mfa.challenge;
  try { f.submit(); f.mfa.verify = () => null;
    assert.throws(() => saved.call(f.mfa, f.secret, f.secret), /METHOD_REPLACED/);
    assert.equal(f.calls.challenge, 0);
  } finally { o.detach(); }
  const g = fixture({ challengeResult: {} }); const p = g.install();
  try { g.submit(); await g.challenge(); assert.equal(p.snapshot().challenge.success, null);
    assert.throws(() => g.verify(), /RESULT_UNAVAILABLE/);
  } finally { p.detach(); }
});

test('verify cannot run twice; detached pending outcomes stay UNKNOWN after external replacement', async () => {
  const f = fixture(); const o = f.install();
  try { f.submit(); await f.challenge(); await f.verify();
    assert.throws(() => f.verify(), /REPEAT_BLOCKED/); assert.equal(f.calls.verify, 1);
  } finally { o.detach(); }
  const g = fixture({ pending: true }); const p = g.install();
  g.submit(); const returned = g.challenge(); g.mfa.challenge = () => null;
  p.detach(); g.resolveChallenge(); await returned;
  assert.equal(p.snapshot().challenge.completion, 'UNKNOWN');
  assert.equal(p.snapshot().methodsRestored.challenge, 'NOT_OWNED');
});
