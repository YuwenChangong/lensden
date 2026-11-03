import test from 'node:test';
import assert from 'node:assert/strict';
import { ControlledAuth } from './controlled-auth.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
import { MemorySessionReader } from '../e-verify-group1-standard-hybrid/session-reader.mjs';
const app = 'https://app.example.invalid', db = 'https://qa.example.invalid', key = 'sb_publishable_FIXTURE_ONLY';
const binding = { userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user' };
const caps = { allBrowserHttpDispatchesMax: 650, supabaseAuthDispatchesMax: 40, applicationMutationDispatchesMax: 50,
  ownerSessionRefreshRequestsMax: 6, executionSecondsMax: 3600, supabaseRestReadDispatchesMax: 80 };
function fixture(options = {}) {
  const context = {}, budget = options.budget || new SharedBudget({ ...caps, ...options.caps });
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ iss: db + '/auth/v1', aud: 'authenticated', role: 'authenticated',
    sub: binding.userId, exp: Math.floor(Date.now() / 1000) + 1800 })).toString('base64url'), 'UNSIGNED_OFFLINE_ONLY'].join('.');
  let calls = 0;
  const data = { access_token: token, refresh_token: 'FIXTURE_REFRESH_ONLY', token_type: 'bearer', user: { id: binding.userId, email: binding.email } };
  const transport = async (q, limits) => {
    calls++; assert.equal(limits.timeoutMs, 15000); assert.ok(limits.signal);
    if (options.error) throw Error('NETWORK_FAILURE');
    if (options.untilAborted) await new Promise((resolve, reject) => limits.signal.addEventListener('abort', () => reject(Error('FIXTURE_ABORTED')), { once: true }));
    if (options.hold) await new Promise(resolve => setTimeout(resolve, 10));
    const logout = q.url.includes('/logout');
    return { status: options.status || (logout ? 204 : 200), headers: { 'access-control-allow-origin': options.cors || app,
      'content-type': 'application/json', ...options.headers }, body: logout ? Buffer.alloc(0) : Buffer.from(JSON.stringify(options.body || data)) };
  };
  const reader = new MemorySessionReader({ actor: options.actor || 'A', binding, contextIdentity: context, supabaseOrigin: db,
    publicKey: key, budget, transport, validUntil: Date.now() + 1740000 });
  const auth = new ControlledAuth({ caps: { ...caps, ...options.caps }, actor: options.actor || 'A', binding, contextIdentity: context,
    appOrigin: app, supabaseOrigin: db, publicKey: key, budget, transport, reader, workMs: options.workMs || 1740000 });
  const req = (path, body, headers = {}) => ({ url: db + path, method: 'POST', headers: { origin: app, apikey: key,
    authorization: 'Bearer ' + key, 'content-type': 'application/json', ...headers }, body: Buffer.from(JSON.stringify(body)) });
  const login = () => req('/auth/v1/token?grant_type=password', { email: binding.email, password: 'OFFLINE_PASSWORD', gotrue_meta_security: { captcha_token: 'OFFLINE_PROOF_NOT_PRODUCTION' } });
  const meta = overrides => ({ contextIdentity: context, actor: options.actor || 'A', mainFrame: true, resourceType: 'fetch', redirected: false, stage: auth.receipt().stage, ...overrides });
  return { auth, reader, budget, req, login, meta, token, data, calls: () => calls };
}
test('fixed login, refresh, logout preserve private result and charge before wire', async () => {
  const x = fixture(); x.auth.armLogin('success'); await x.auth.dispatch(x.login(), x.meta());
  assert.equal(x.reader.receipt().sessionPresent, true);
  await x.auth.dispatch(x.req('/auth/v1/token?grant_type=refresh_token', { refresh_token: 'FIXTURE_REFRESH_ONLY' }), x.meta());
  x.auth.armLogout(); const q = x.req('/auth/v1/logout?scope=global', {}, { authorization: 'Bearer ' + x.token }); q.body = Buffer.alloc(0);
  await x.auth.dispatch(q, x.meta()); assert.equal(x.reader.receipt().destroyed, true);
  assert.equal(x.calls(), 3); const c = x.budget.receipt(); assert.equal(c.allBrowserHttpDispatchesMax, 3);
  assert.equal(c.supabaseAuthDispatchesMax, 3); assert.equal(c.applicationMutationDispatchesMax, 3); assert.equal(c.ownerSessionRefreshRequestsMax, 1);
  const receipt = JSON.stringify(x.auth.receipt()); assert.ok(!receipt.includes(x.token)); assert.ok(!receipt.includes(binding.email));
});
test('origin, context, actor, frame, method, stage and unknown Auth route reject before wire', async () => {
  const changes = [x => [x.login(), x.meta({ actor: 'B' })], x => [x.login(), x.meta({ contextIdentity: {} })],
    x => [x.login(), x.meta({ mainFrame: false })], x => [x.login(), x.meta({ resourceType: 'other' })],
    x => [x.login(), x.meta({ redirected: true })], x => [x.login(), x.meta({ stage: 'LOGOUT_A' })],
    x => [{ ...x.login(), method: 'GET' }, x.meta()], x => [{ ...x.login(), url: db + '/auth/v1/signup' }, x.meta()],
    x => [x.req('/auth/v1/token?grant_type=password', {}, { origin: 'https://untrusted.invalid' }), x.meta()],
    x => [x.req('/auth/v1/token?grant_type=password', {}, { cookie: 'PRIVATE_COOKIE_NOT_ALLOWED' }), x.meta()]];
  for (const change of changes) { const x = fixture(); x.auth.armLogin('success'); const [q, m] = change(x); await assert.rejects(x.auth.dispatch(q, m)); assert.equal(x.calls(), 0); }
});
test('global, Auth, Mutation caps and concurrent single login are predispatch', async () => {
  for (const category of ['allBrowserHttpDispatchesMax', 'supabaseAuthDispatchesMax', 'applicationMutationDispatchesMax']) {
    const x = fixture({ caps: { [category]: 0 } }); x.auth.armLogin('success'); await assert.rejects(x.auth.dispatch(x.login(), x.meta())); assert.equal(x.calls(), 0);
  }
  const y = fixture({ hold: true }); y.auth.armLogin('success');
  await Promise.allSettled([y.auth.dispatch(y.login(), y.meta()), y.auth.dispatch(y.login(), y.meta())]); assert.equal(y.calls(), 1);
});
test('refresh cap, incorrect refresh and logout cannot dispatch outside the authorized session', async () => {
  const x = fixture({ caps: { ownerSessionRefreshRequestsMax: 0 } }); x.auth.armLogin('success'); await x.auth.dispatch(x.login(), x.meta());
  await assert.rejects(x.auth.dispatch(x.req('/auth/v1/token?grant_type=refresh_token', { refresh_token: 'FIXTURE_REFRESH_ONLY' }), x.meta())); assert.equal(x.calls(), 1);
  const y = fixture(); y.auth.armLogin('success'); await y.auth.dispatch(y.login(), y.meta());
  await assert.rejects(y.auth.dispatch(y.req('/auth/v1/token?grant_type=refresh_token', { refresh_token: 'OTHER_SESSION' }), y.meta())); assert.equal(y.calls(), 1);
});
test('network failure is charged once, closes reader and denies retry', async () => {
  const x = fixture({ error: true }); x.auth.armLogin('success'); await assert.rejects(x.auth.dispatch(x.login(), x.meta()));
  await assert.rejects(x.auth.dispatch(x.login(), x.meta())); assert.equal(x.calls(), 1); assert.equal(x.reader.receipt().destroyed, true);
  assert.equal(x.budget.receipt().applicationMutationDispatchesMax, 1);
});
test('CORS, Cookie, Location, redirected status and foreign Session fail closed', async () => {
  for (const o of [{ cors: 'https://other.invalid' }, { headers: { 'set-cookie': 'PRIVATE_FIXTURE' } }, { headers: { location: '/unsafe' } },
    { status: 302 }, { body: { access_token: 'INVALID_FIXTURE', user: {} } }]) {
    const x = fixture(o); x.auth.armLogin('success'); await assert.rejects(x.auth.dispatch(x.login(), x.meta())); assert.equal(x.reader.receipt().destroyed, true);
  }
});
test('only A may arm the three original negative cases; rejected responses remain counted', async () => {
  const budget = new SharedBudget(caps); const positive = fixture({ budget }); positive.auth.armLogin('success'); await positive.auth.dispatch(positive.login(), positive.meta()); positive.auth.close();
  for (const kind of ['invalid-captcha', 'missing-captcha', 'wrong-password']) {
    const x = fixture({ budget, status: 400, body: { error_code: kind === 'wrong-password' ? 'invalid_credentials' : 'captcha_failed' } });
    x.auth.armLogin(kind); const q = x.login(), body = JSON.parse(q.body);
    if (kind === 'missing-captcha') body.gotrue_meta_security = {};
    if (kind === 'wrong-password') body.password = 'OTHER_OFFLINE_PASSWORD';
    q.body = Buffer.from(JSON.stringify(body)); const response = await x.auth.dispatch(q, x.meta()); assert.equal(response.status, 400); assert.equal(x.calls(), 1);
  }
  const b = fixture({ actor: 'B' }); assert.throws(() => b.auth.armLogin('wrong-password')); assert.equal(b.calls(), 0);
});
test('close aborts in-flight transport and no result, replay or Session survives', async () => {
  const x = fixture({ untilAborted: true }); x.auth.armLogin('success'); const pending = x.auth.dispatch(x.login(), x.meta());
  x.auth.close(); await assert.rejects(pending); assert.equal(x.calls(), 1); assert.equal(x.reader.receipt().destroyed, true);
  await assert.rejects(x.auth.dispatch(x.login(), x.meta())); assert.equal(x.calls(), 1);
});
test('work deadline is checked before any Auth dispatch', async () => {
  const x = fixture({ workMs: 1 }); x.auth.armLogin('success'); await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(x.auth.dispatch(x.login(), x.meta())); assert.equal(x.calls(), 0); assert.equal(x.reader.receipt().destroyed, true);
});
