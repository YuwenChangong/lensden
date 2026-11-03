import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyObserved } from './monitor.mjs';
import { classifyObserved as strict } from '../e-verify-group1-manual-auth/monitor.mjs';
const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://db.example.invalid';
const base = { appOrigin, supabaseOrigin, staticPaths: [], actor: 'A', stage: 'LOGIN_A', started: true,
  frameObserved: true, mainFrameNavigation: false, headers: {}, method: 'GET', type: 'fetch' };

test('unenumerated HTTPS GET is observed, not legitimized or a hard admission rule', () => {
  const r = classifyObserved({ ...base, url: 'https://unknown.example.invalid/runtime' });
  assert.equal(r.kind, 'unenumerated-third-party-get-observed'); assert.equal(r.legitimacy, 'UNKNOWN');
  assert.equal(r.dispatchBoundary, 'MONITOR_ONLY');
  assert.deepEqual(r.charges, ['allBrowserHttpDispatchesMax', 'turnstileHttpDispatchesMax']);
});
test('original exact Auth and fixed first-party rules remain unchanged', () => {
  for (const q of [{ url: appOrigin + '/login/', method: 'GET', type: 'document' },
    { url: supabaseOrigin + '/auth/v1/token?grant_type=password', method: 'POST', type: 'fetch' },
    { url: supabaseOrigin + '/auth/v1/token?grant_type=refresh_token', method: 'POST', type: 'fetch' },
    { url: supabaseOrigin + '/auth/v1/logout?scope=global', method: 'POST', type: 'fetch' }]) {
    const args = { ...base, ...q }; assert.deepEqual(classifyObserved(args), strict(args));
  }
});
test('unknown first-party/database operations and third-party POST remain rejected', () => {
  for (const q of [{ url: appOrigin + '/api/admin/write', method: 'POST' }, { url: appOrigin + '/unknown' },
    { url: supabaseOrigin + '/rest/v1/unknown' }, { url: 'https://unknown.example.invalid/action', method: 'POST' }])
    assert.throws(() => classifyObserved({ ...base, ...q }));
});
test('credential-bearing external GET, insecure envelope and sensitive query stop without raw error export', () => {
  for (const q of [{ url: 'https://unknown.example.invalid/path', headers: { authorization: 'PRIVATE_SECRET' } },
    { url: 'https://unknown.example.invalid/path', headers: { apikey: 'PRIVATE_SECRET' } },
    { url: 'https://unknown.example.invalid/path?access_token=PRIVATE_SECRET' },
    { url: 'https://USER:PRIVATE_SECRET@unknown.example.invalid/path' }, { url: 'http://unknown.example.invalid/path' }]) {
    assert.throws(() => classifyObserved({ ...base, ...q }), error => /^[A-Z0-9_]+$/.test(error.message) && !error.message.includes('PRIVATE_SECRET'));
  }
});
test('external GET does not permit arbitrary navigation, unavailable Frame, unstarted context or invalid identity/stage', () => {
  for (const override of [{ started: false }, { frameObserved: false }, { mainFrameNavigation: true }, { actor: 'B' }, { stage: 'PAGE_ADMIN_A' }, { type: 'other' }])
    assert.throws(() => classifyObserved({ ...base, url: 'https://unknown.example.invalid/runtime', ...override }));
});
