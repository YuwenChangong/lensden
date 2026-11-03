import test from 'node:test';
import assert from 'node:assert/strict';
import { MemorySessionReader } from './session-reader.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
import { catalogSteps } from '../e-verify-group1-script-identity/execution/group1/rls.mjs';
const origin = 'https://qa.example.invalid';
const binding = { userId: '11111111-1111-4111-8111-111111111111', email: 'qa-a@example.invalid', applicationRole: 'user' };
const now = 1791968400000;
const jwt = (claims = {}) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ iss: origin + '/auth/v1', aud: 'authenticated', role: 'authenticated', sub: binding.userId, exp: Math.floor(now / 1000) + 1800, ...claims })).toString('base64url'), 'LOCAL_ONLY_NOT_SIGNED'].join('.');
const data = () => ({ access_token: jwt(), refresh_token: 'NOT_CAPTURED_REFRESH_SECRET', token_type: 'bearer', expires_at: now / 1000 + 1800, user: { id: binding.userId, email: binding.email } });
const response = (status, body) => ({ status, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify(body)) });
function setup(overrides = {}) {
  let calls = 0;
  const budget = new SharedBudget({ allBrowserHttpDispatchesMax: 650, supabaseAuthDispatchesMax: 40, supabaseRestReadDispatchesMax: 80 });
  const transport = async q => {
    calls++;
    if (q.url.endsWith('/auth/v1/user')) return response(200, { id: binding.userId, email: binding.email });
    if (q.url.includes('/profiles?')) return response(200, [{ id: binding.userId, role: 'user' }]);
    return response(403, { code: '42501', message: 'permission denied', details: null, hint: null });
  };
  const context = Object.freeze({ actor: 'A' });
  const reader = new MemorySessionReader({ actor: 'A', binding, contextIdentity: context, supabaseOrigin: origin,
    publicKey: 'sb_publishable_LOCAL_ONLY_PUBLIC_KEY', budget, transport, now: () => now, validUntil: now + 1740000, ...overrides });
  return { reader, context, budget, calls: () => calls };
}
test('memory-only capture requires pinned context/actor/origin and real identity verification', async () => {
  const x = setup();
  x.reader.capture({ contextIdentity: x.context, actor: 'A', origin, data: data() });
  await x.reader.verifyActor();
  assert.equal(await x.reader.catalog(catalogSteps().find(s => s.id === 'RLS_A_SPECS').id), true);
  assert.equal(x.calls(), 3);
  assert.equal(x.reader.receipt().identityVerified, true);
  assert.ok(!JSON.stringify(x.reader.receipt()).includes('NOT_CAPTURED_REFRESH_SECRET'));
  assert.ok(!JSON.stringify(x.reader.receipt()).includes(binding.email));
  x.reader.dispose();
  await assert.rejects(x.reader.catalog('RLS_A_SOURCES'));
});
test('expired/foreign/elevated tokens and cross-context/actor capture fail before any GET', () => {
  for (const change of [
    x => ({ contextIdentity: {}, actor: 'A', origin, data: data() }),
    x => ({ contextIdentity: x.context, actor: 'B', origin, data: data() }),
    x => ({ contextIdentity: x.context, actor: 'A', origin: 'https://other.invalid', data: data() }),
    x => ({ contextIdentity: x.context, actor: 'A', origin, data: { ...data(), access_token: jwt({ role: 'service_role' }) } }),
    x => ({ contextIdentity: x.context, actor: 'A', origin, data: { ...data(), access_token: jwt({ exp: now / 1000 }) } }),
    x => ({ contextIdentity: x.context, actor: 'A', origin, data: { ...data(), user: { ...data().user, id: '22222222-2222-4222-8222-222222222222' } } })
  ]) { const x = setup(); assert.throws(() => x.reader.capture(change(x))); assert.equal(x.calls(), 0); }
});
test('budget reservations are pre-dispatch atomic and failed reads are charged without retry', async () => {
  const budget = new SharedBudget({ allBrowserHttpDispatchesMax: 1, supabaseAuthDispatchesMax: 1, supabaseRestReadDispatchesMax: 80 });
  const x = setup({ budget }); x.reader.capture({ contextIdentity: x.context, actor: 'A', origin, data: data() });
  await assert.rejects(x.reader.verifyActor()); assert.equal(x.calls(), 1);
  assert.equal(budget.receipt().allBrowserHttpDispatchesMax, 1);
  const y = setup({ transport: async () => { throw Error('NETWORK_FAILURE'); } });
  y.reader.capture({ contextIdentity: y.context, actor: 'A', origin, data: data() });
  await assert.rejects(y.reader.verifyActor());
  assert.equal(y.budget.receipt().allBrowserHttpDispatchesMax, 1);
  await assert.rejects(y.reader.verifyActor());
  assert.equal(y.budget.receipt().allBrowserHttpDispatchesMax, 1);
});
test('redirects, role mismatch, arbitrary paths and cross-actor catalog are rejected', async () => {
  const x = setup(); x.reader.capture({ contextIdentity: x.context, actor: 'A', origin, data: data() });
  await x.reader.verifyActor(); await assert.rejects(x.reader.catalog('RLS_B_SPECS'));
  const y = setup({ transport: async () => response(302, {}) });
  y.reader.capture({ contextIdentity: y.context, actor: 'A', origin, data: data() });
  await assert.rejects(y.reader.verifyActor());
});
test('capture refresh invalidates identity; destroyed buffers and receipts do not export secrets', async () => {
  const x = setup(); x.reader.capture({ contextIdentity: x.context, actor: 'A', origin, data: data() }); await x.reader.verifyActor();
  x.reader.capture({ contextIdentity: x.context, actor: 'A', origin, data: data(), refresh: true });
  assert.equal(x.reader.receipt().identityVerified, false);
  await assert.rejects(x.reader.catalog('RLS_A_SPECS'));
  assert.ok(!JSON.stringify(x.reader).includes('access_token'));
});
test('secret/service-role public keys are refused before any request', () => {
  assert.throws(() => setup({ publicKey: 'sb_secret_NO_PERMISSION' }));
  assert.throws(() => setup({ publicKey: jwt({ role: 'service_role' }) }));
});
test('all exact 16 RLS steps retain anon6/A5/B5 expectations, with no ADMIN RLS', async () => {
  let calls = 0, anonBearerLeaks = 0;
  const budget = new SharedBudget({ allBrowserHttpDispatchesMax: 650, supabaseAuthDispatchesMax: 40, supabaseRestReadDispatchesMax: 80 });
  let passed = 0;
  for (const [i, actor] of ['A', 'B', 'ADMIN'].entries()) {
    const user = { userId: (i + 1).toString().repeat(8) + '-1111-4111-8111-111111111111', email: `fixture-${i}@example.invalid`, applicationRole: actor === 'ADMIN' ? 'admin' : 'user' };
    const context = {};
    const transport = async q => {
      calls++;
      const u = new URL(q.url);
      if (u.pathname === '/auth/v1/user') return response(200, { id: user.userId, email: user.email });
      if (u.pathname === '/rest/v1/profiles') return response(200, [{ id: user.userId, role: user.applicationRole }]);
      const role = q.headers.authorization === 'Bearer sb_publishable_LOCAL_FIXTURE' ? 'anon' : actor;
      const step = catalogSteps().find(s => s.actor === role && s.path === u.pathname + u.search);
      assert.ok(step);
      if (step.actor === 'anon' && q.headers.authorization !== 'Bearer sb_publishable_LOCAL_FIXTURE') anonBearerLeaks++;
      if (step.expect !== 'public') return response(step.actor === 'anon' ? 401 : 403, { code: '42501', message: 'permission denied', details: null, hint: null });
      const rows = { published: [{ slug: 'xreal-air', brand_key: 'xreal', name: 'Local fixture', catalog_normalized: true }],
        specs: [{ device_slug: 'xreal-air', key: 'local', state: 'KNOWN' }],
        sources: [{ device_slug: 'xreal-air', publisher: 'local fixture' }], evidence: [] };
      return response(200, rows[step.kind]);
    };
    const reader = new MemorySessionReader({ actor, binding: user, contextIdentity: context, supabaseOrigin: origin,
      publicKey: 'sb_publishable_LOCAL_FIXTURE', budget, transport, now: () => now, validUntil: now + 1740000 });
    reader.capture({ contextIdentity: context, actor, origin, data: { ...data(), access_token: jwt({ sub: user.userId }), user: { id: user.userId, email: user.email } } });
    await reader.verifyActor();
    for (const step of catalogSteps().filter(s => s.actor === actor || actor === 'A' && s.actor === 'anon')) {
      assert.equal(await reader.catalog(step.id), true); passed++;
    }
    reader.dispose();
  }
  assert.equal(passed, 16); assert.equal(calls, 22); assert.equal(anonBearerLeaks, 0);
  assert.equal(budget.receipt().allBrowserHttpDispatchesMax, 22);
  assert.equal(budget.receipt().supabaseAuthDispatchesMax, 3);
  assert.equal(budget.receipt().supabaseRestReadDispatchesMax, 19);
});
