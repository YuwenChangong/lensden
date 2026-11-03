import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const original = await readFile(new URL('./manual-identity.browser.js', import.meta.url), 'utf8');
const expression = 'import("/_astro/supabase-browser.CbJzQpCJ.js")';
assert.equal(original.split(expression).length, 2);
// Only the existing-client import is replaced in memory for these offline cases.
const code = original.replace(expression, 'fixtureImport()');
let passed = 0;
const parent = '4e447058285658339e9e0f13f2450705ce16789b2bad84d4008ec8d235e1a658';
const id = '00000000-0000-4000-8000-000000000001';
async function run(options = {}) {
  const files = new Map(); let listener, auth = 0, worker = 0, alerts = [];
  if (options.used) files.set('MANUAL_IDENTITY_DISPATCH.used.json', '{}');
  const approval = { parentBinding: parent, nonce: '86ab2edb-0c8b-4597-8d83-d61f1b3ae4f9', approved: true, amendmentBinding: 'a'.repeat(64), windowEndUTC: '2026-10-24T14:10:17.2244604Z', ...options.approval };
  const directory = { name: parent, async getFileHandle(name, flags) {
    if (name === 'MANUAL_IDENTITY_APPROVAL.safe.json') return { getFile: async () => ({ text: async () => JSON.stringify(approval) }) };
    if (!files.has(name) && !flags?.create) throw Object.assign(new Error(), { name: 'NotFoundError' });
    return { createWritable: async () => ({ write: async text => files.set(name, text), close: async () => {} }), getFile: async () => ({ text: async () => files.get(name) }) };
  } };
  const client = { supabaseUrl: 'https://xcbnxzjlsvtgzixurcof.supabase.co', auth: {
    getSession: async () => ({ data: { session: { access_token: 'PRIVATE_TEST_TOKEN', user: { id }, expires_at: 2000000000 } } }),
    getUser: async token => { auth++; assert.equal(token, 'PRIVATE_TEST_TOKEN'); return { data: { user: { id: options.authId ?? id } }, error: null }; },
  } };
  const context = {
    window: { top: null, addEventListener: (name, fn) => { assert.equal(name, 'click'); listener = fn; }, removeEventListener() {}, showDirectoryPicker: async () => directory },
    location: { origin: options.origin ?? 'https://openglasshub.ogh.workers.dev', pathname: '/admin/reports/' },
    alert: text => alerts.push(text),
    Date: class extends Date { static now() { return Date.parse(options.now ?? '2026-10-24T11:45:00Z'); } },
    fixtureImport: async () => ({ n: () => client }),
    fetch: async (url, request) => {
      worker++; assert.equal(url, 'https://openglasshub.ogh.workers.dev/api/admin/forum/me');
      assert.equal(request.method, 'GET'); assert.equal(request.redirect, 'manual');
      assert.equal(request.headers.authorization, 'Bearer PRIVATE_TEST_TOKEN');
      return { status: options.status ?? 200, redirected: false, type: 'basic', headers: new Headers(), json: async () => ({ user_id: options.workerId ?? id, role: options.role ?? 'moderator', allowed: true, profile: { privateValue: 'NOT_TO_SAVE' } }) };
    },
    AbortSignal, setTimeout, clearTimeout, Promise, JSON, Object, Error,
    console: { log() { throw Error('NO_CONSOLE_LOGS'); }, error() { throw Error('NO_CONSOLE_ERRORS'); } },
  };
  context.window.top = context.window;
  vm.runInNewContext(code, context);
  if (listener) await listener({ isTrusted: true, preventDefault() {}, stopImmediatePropagation() {} });
  const stored = [...files.values()].join('');
  assert(!stored.includes('PRIVATE_TEST_TOKEN')); assert(!stored.includes('NOT_TO_SAVE'));
  assert(!alerts.join('').includes(id));
  return { auth, worker, stored, files };
}
for (const [name, options, expected, auth, worker] of [
  ['same real response identity passes', {}, 'PASS', 1, 1],
  ['wrong protected role fails', { role: 'admin' }, 'NOT_VERIFIED', 1, 1],
  ['UUID mismatch fails', { workerId: '00000000-0000-4000-8000-000000000002' }, 'NOT_VERIFIED', 1, 1],
  ['redirect status fails', { status: 302 }, 'NOT_VERIFIED', 1, 1],
  ['unapproved marker causes no request', { approval: { approved: false } }, null, 0, 0],
  ['expired original window causes no request', { now: '2026-10-24T14:11:00Z' }, null, 0, 0],
  ['wrong origin causes no request', { origin: 'https://example.invalid' }, null, 0, 0],
  ['wrong amendment marker causes no request', { approval: { nonce: 'wrong' } }, null, 0, 0],
  ['consumed local allowance cannot dispatch again', { used: true }, null, 0, 0],
]) {
  const result = await run(options);
  assert.equal(result.auth, auth); assert.equal(result.worker, worker);
  if (expected) assert.equal(JSON.parse(result.files.get('MANUAL_IDENTITY_RESULT.private.json')).status, expected);
  passed++; console.log(`PASS ${name}`);
}
console.log(`OFFLINE_MANUAL_IDENTITY_CHECKS=${passed}/${passed}\nPRODUCTION_REQUESTS=0`);
