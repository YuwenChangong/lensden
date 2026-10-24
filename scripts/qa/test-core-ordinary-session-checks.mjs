import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { checkPlan, runSessionChecks, buildOwnerSnippet } from './core-ordinary-session-checks.mjs';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const post = '33333333-3333-4333-8333-333333333333';
const comment = '44444444-4444-4444-8444-444444444444';
const media = '55555555-5555-4555-8555-555555555555';
const namespace = 'ogh-core-ordinary-20261024-nonsecret-fixture';
function plan(stage = 'auth') {
  return { binding: 'a'.repeat(64), namespace, journalVerified: true, actorId: stage === 'rls-b' ? b : a,
    actor: stage === 'rls-b' ? 'B3' : 'A3', stage, deadlineUTC: new Date(Date.now() + 60000).toISOString(),
    fixtures: { actorA: a, actorB: b, postA: post, commentB: comment, imageMediaA: media } };
}
function fixture(p, options = {}) {
  const rows = {
    profiles: [{ id: a, role: options.role || 'user' }, { id: b, role: options.role || 'user' }],
    posts: [{ id: post, author_id: a, body: `${namespace} text` }],
    comments: [{ id: comment, author_id: b, post_id: post, body: `${namespace} comment` }],
    post_media: [{ id: media, user_id: a, post_id: post, storage_path: `${a}/${namespace}-image.png` }],
  };
  const user = { id: options.wrongId ? b : p.actorId, email_confirmed_at: '2026-10-23T01:00:00Z' };
  let authCalls = 0;
  const authResult = async () => { authCalls++; return options.authError
    ? { error: { status: 400, code: 'invalid_credentials', message: 'PRIVATE_ERROR_NOT_EXPORTED' } }
    : { data: { user }, error: null }; };
  const client = { auth: { getUser: authResult, refreshSession: authResult, signOut: async () => ({ data: {}, error: null }) },
    from(table) {
      let mode = 'select', values, filters = [];
      const q = {
        select() { return q; }, eq(k, v) { filters.push([k, v]); return q; }, limit() { return q; },
        update(v) { mode = 'update'; values = v; return q; }, delete() { mode = 'delete'; return q; },
        then(resolve, reject) {
          const selected = rows[table].filter(r => filters.every(([k, v]) => r[k] === v));
          if (mode === 'select') return Promise.resolve({ data: structuredClone(selected), error: null, status: 200 }).then(resolve, reject);
          const ownAllowed = table === 'posts' && p.actorId === a;
          if (!ownAllowed && !options.allowForbidden) return Promise.resolve(options.unauthorized
            ? { status: 401, error: { status: 401 } }
            : options.rlsError ? { status: 403, error: { code: '42501' } } : { status: 200, data: [], error: null }).then(resolve, reject);
          if (mode === 'update') for (const row of selected) Object.assign(row, values);
          else rows[table] = rows[table].filter(r => !selected.includes(r));
          return Promise.resolve({ status: 200, data: selected.map(r => ({ id: r.id })), error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return { client, authCalls: () => authCalls };
}

test('valid post-login plan', () => assert.equal(checkPlan(plan()).actor, 'A3'));
for (const [key, value] of [['binding','bad'], ['actorId','bad'], ['journalVerified',false], ['actor','admin'], ['stage','login'], ['deadlineUTC','invalid'], ['deadlineUTC','2020-01-01T00:00:00Z']]) {
  test(`invalid plan ${key} ${value}`, () => assert.throws(() => checkPlan({ ...plan(), [key]: value })));
}
test('fixture actor mismatch before request', () => assert.throws(() => checkPlan({ ...plan('rls-b'), actorId: a })));
test('actual Auth/profile/refresh sequence', async () => {
  const p = plan(), f = fixture(p), r = await runSessionChecks(f.client, p);
  assert.equal(r.status, 'PASS'); assert.deepEqual(r.counts, { auth: 3, rest: 1 }); assert.equal(f.authCalls(), 3);
});
test('identity mismatch stops before profile/refresh', async () => {
  const p = plan(), r = await runSessionChecks(fixture(p, { wrongId: true }).client, p);
  assert.equal(r.reason, 'SESSION_IDENTITY_MISMATCH'); assert.equal(r.counts.rest, 0);
});
test('admin profile is not ordinary', async () => {
  const p = plan(), r = await runSessionChecks(fixture(p, { role: 'admin' }).client, p);
  assert.equal(r.reason, 'ORDINARY_PROFILE_NOT_PROVEN');
});
test('Auth errors are allowlisted without raw messages', async () => {
  const p = plan(), r = await runSessionChecks(fixture(p, { authError: true }).client, p);
  assert.equal(r.authError.errorCode, 'invalid_credentials'); assert.ok(!JSON.stringify(r).includes('PRIVATE_ERROR'));
});
test('A own update and foreign comment denial readbacks', async () => {
  const p = plan('rls-a'), r = await runSessionChecks(fixture(p).client, p);
  assert.equal(r.status, 'PASS'); assert.equal(r.counts.rest, 6);
});
test('B foreign post media and role denial readbacks', async () => {
  const p = plan('rls-b'), r = await runSessionChecks(fixture(p, { rlsError: true }).client, p);
  assert.equal(r.status, 'PASS'); assert.equal(r.counts.rest, 9);
});
test('401 is not RLS proof', async () => {
  const p = plan('rls-b'), r = await runSessionChecks(fixture(p, { unauthorized: true }).client, p);
  assert.equal(r.reason, 'AUTH_FAILURE_NOT_RLS_PROOF');
});
test('unexpected write stops with no automatic repair', async () => {
  const p = plan('rls-b'), r = await runSessionChecks(fixture(p, { allowForbidden: true }).client, p);
  assert.equal(r.reason, 'UNEXPECTED_WRITE_SUCCESS'); assert.equal(r.counts.rest, 2);
});
test('logout acknowledgement not independent JWT revocation proof', async () => {
  const p = plan('logout'), r = await runSessionChecks(fixture(p).client, p);
  assert.equal(r.status, 'PASS'); assert.deepEqual(r.counts, { auth: 2, rest: 0 });
});
test('timeout stops once and late completion cannot become PASS', async () => {
  const p = plan(); let calls = 0, complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const r = await runSessionChecks({ auth: { getUser() { calls++; return pending; } } }, p);
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.reason, 'REQUEST_COMPLETION_UNKNOWN');
  complete({ data: { user: { id: a } } });
  await Promise.resolve(); assert.equal(calls, 1); assert.equal(r.status, 'BLOCKED');
});
test('response after stage deadline cannot become PASS', async () => {
  const p = { ...plan(), deadlineUTC: new Date(Date.now() + 20).toISOString() };
  const client = { auth: { getUser: () => new Promise(resolve => setTimeout(() => resolve({ data: { user: { id: a } } }), 40)) } };
  const r = await runSessionChecks(client, p);
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.reason, 'DEADLINE_EXPIRED'); assert.equal(r.counts.rest, 0);
});
test('generated owner snippet executes actual check with private-free download', async () => {
  const p = plan(), f = fixture(p); let saved;
  const storage = new Map();
  const context = vm.createContext({ location: { origin: 'https://openglasshub.ogh.workers.dev' },
    sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    Blob: class { constructor(parts) { saved = JSON.parse(parts[0]); } },
    document: { createElement: () => ({ click() {} }) }, URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} },
    setTimeout, clearTimeout, client: f.client });
  const snippet = buildOwnerSnippet(p).replace(/await import\("[^\"]+"\)/, '({n:()=>client})');
  assert.equal((await vm.runInContext(snippet, context)).status, 'PASS');
  assert.equal(saved.status, 'PASS'); assert.ok(!JSON.stringify(saved).includes('email_confirmed_at'));
  await assert.rejects(vm.runInContext(snippet, context), /CONSUMED/);
});
test('no credential export, direct login, or controller dependency', async () => {
  const source = await readFile(new URL('./core-ordinary-session-checks.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /signInWithPassword|access_token|refresh_token|document\.cookie|localStorage|playwright|puppeteer|process\.env/);
});
