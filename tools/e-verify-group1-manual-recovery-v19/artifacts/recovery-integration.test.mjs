import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openNativeBrowser } from '../browser.mjs';
import { SharedBudget } from '../../e-verify-group1-v9-closure/gate.mjs';

test('offline native Auth after unresolved abort still needs Node identity before one exact RLS read', async () => {
  const app = 'https://app.example.invalid', db = 'https://qa.example.invalid';
  const user = { userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user' };
  const token = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ iss: db + '/auth/v1', aud: 'authenticated', role: 'authenticated',
    sub: user.userId, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url') + '.OFFLINE_ONLY';
  const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  let browser, page, held, release, calls = 0;
  const budget = new SharedBudget({ allBrowserHttpDispatchesMax: 650, turnstileHttpDispatchesMax: 40, supabaseAuthDispatchesMax: 40,
    supabaseRestReadDispatchesMax: 80, applicationMutationDispatchesMax: 50, ownerSessionRefreshRequestsMax: 6, executionSecondsMax: 3600 });
  try {
    browser = await openNativeBrowser({ actor: 'A', binding: user, appOrigin: app, supabaseOrigin: db, staticPaths: [], budget, workMs: 20000,
      transport: async q => { calls++; const u = new URL(q.url); let body, status = 200;
        if (u.pathname === '/auth/v1/user') body = { id: user.userId, email: user.email };
        else if (u.pathname === '/rest/v1/profiles') body = [{ id: user.userId, role: 'user' }];
        else { assert.equal(calls, 3); assert.equal(u.pathname, '/rest/v1/public_device_detail_specs');
          status = 403; body = { code: '42501', message: 'permission denied', details: null, hint: null }; }
        return { status, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify(body)) };
      }, fixtureSetup: {
        launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' },
          args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
        async install(s) { page = s.p; await s.context.route('**/*', async route => {
          const q = route.request(), u = new URL(q.url());
          if (u.origin === app) return route.fulfill({ status: 200, contentType: 'text/html',
            body: '<!doctype html><link rel="icon" href="data:,"><div data-brand-module>OFFLINE fixture</div>' });
          if (u.origin === db) return route.fulfill({ status: q.method() === 'OPTIONS' ? 204 : 200,
            headers: { 'content-type': 'application/json', 'access-control-allow-origin': app,
              'access-control-allow-headers': 'content-type,apikey', 'access-control-allow-methods': 'POST,OPTIONS' },
            body: q.method() === 'OPTIONS' ? '' : JSON.stringify({ access_token: token, token_type: 'bearer', user: { id: user.userId, email: user.email } }) });
          held = true; await new Promise(r => { release = r; }); await route.abort().catch(() => {});
        }); }, start: p => p.locator('#start').click()
      } });
    browser.permitLogin('success'); await browser.navigate('/login/');
    await page.evaluate(() => { window.c = new AbortController(); void fetch('https://external.example.invalid/fixture', { signal: window.c.signal }).catch(() => {}); });
    for (let i = 0; i < 200 && !held; i++) await new Promise(r => setTimeout(r, 10)); assert.equal(held, true);
    await page.evaluate(() => window.c.abort());
    for (let i = 0; i < 200 && !browser.receipt().diagnostics.unresolvedAborts.length; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(browser.receipt().diagnostics.unresolvedAborts.length, 1);
    await assert.rejects(browser.catalog('RLS_A_SPECS')); assert.equal(calls, 0);
    await page.evaluate(async ({ db, email }) => {
      const response = await fetch(db + '/auth/v1/token?grant_type=password', { method: 'POST',
        headers: { 'content-type': 'application/json', apikey: 'sb_publishable_OFFLINE_ONLY' },
        body: JSON.stringify({ email, password: 'LOCAL_ONLY', gotrue_meta_security: { captcha_token: 'LOCAL_FIXTURE_PROOF' } }) });
      localStorage.setItem('sb-qa-auth-token', JSON.stringify(await response.json())); location.href = '/products/';
    }, { db, email: user.email });
    await browser.waitForSession(5000); await browser.waitForLanding();
    assert.equal(calls, 0); assert.equal(await browser.verifyActor(), true); assert.equal(calls, 2);
    assert.equal(await browser.catalog('RLS_A_SPECS'), true); assert.equal(calls, 3);
    assert.equal(browser.receipt().diagnostics.unresolvedAborts[0].classification, 'UNRESOLVED');
    assert.equal(browser.receipt().fixtureOnly, true); assert.equal(browser.receipt().firstFailure, null);
    assert.equal(browser.receipt().captchaOwnerObserved, false);
  } finally { release?.(); await browser?.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
    assert.equal(browser?.receipt().closed, true); assert.equal(browser?.receipt().channel.destroyed, true); }
});
