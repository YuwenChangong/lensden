import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openNativeBrowser } from './browser.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';

const out = new URL('./artifacts/targeted-' + Date.now() + '/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const results = [];
test.after(() => fs.writeFileSync(new URL('BROWSER_SAFE.json', out), JSON.stringify({
  tests: results, productionRequests: 0, thirdPartyLiveRequests: 0,
  realCredentialsUsed: false, realSdkOrCaptchaUsed: false
}, null, 2) + '\n', { flag: 'wx' }));
async function fixture({ kind = 'success', workMs = 20000 } = {}) {
  let browser, page, portal, routeReady, release, blockedProxyAttempts = 0, wireCalls = 0;
  const proxy = http.createServer((q, r) => { blockedProxyAttempts++; r.writeHead(403); r.end(); });
  proxy.on('connect', (q, s) => { blockedProxyAttempts++; s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://db.example.invalid';
  try {
    browser = await openNativeBrowser({ actor: 'A', binding: {
      userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user'
    }, appOrigin, supabaseOrigin, staticPaths: [], headless: false, workMs,
    budget: new SharedBudget({ allBrowserHttpDispatchesMax: 650, turnstileHttpDispatchesMax: 40, executionSecondsMax: 3600 }),
    transport: async () => { wireCalls++; throw Error('NO_AUTH_OR_RLS_IN_FIXTURE'); }, fixtureSetup: {
      launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' },
        args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
      async install(s) {
        page = s.p; portal = s.portal;
        await s.context.route('**/*', async route => {
          if (new URL(route.request().url()).origin === appOrigin) return route.fulfill({ status: 200, contentType: 'text/html',
            body: '<!doctype html><link rel="icon" href="data:,"><p>OFFLINE authentication control fixture</p>' });
          routeReady = route;
          await new Promise(r => { release = r; });
          await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': appOrigin }, body: '{}' }).catch(() => {});
        });
      }, start: p => p.locator('#start').click()
    } });
    browser.permitLogin(kind); await browser.navigate('/login/');
    return { browser, page, portal, wireCalls: () => wireCalls,
      async request({ method = 'GET', url = 'https://external.example.invalid/not-a-secret', type = 'fetch' } = {}) {
        await page.evaluate(({ method, url, type }) => {
          window.abortController = new AbortController();
          if (type === 'script') { const script = document.createElement('script'); script.src = url; document.body.append(script); }
          else void fetch(url, { method, signal: window.abortController.signal }).catch(() => {});
        }, { method, url, type });
        for (let i = 0; i < 200 && (!routeReady || !release); i++) await new Promise(r => setTimeout(r, 10));
        assert.ok(routeReady && release); return routeReady;
      },
      async close() { release?.(); await browser.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
        assert.equal(browser.receipt().closed, true); assert.equal(browser.receipt().channel.destroyed, true);
        return { blockedProxyAttempts, forwardedProxyRequests: 0 }; }
    };
  } catch (error) { release?.(); await browser?.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); throw error; }
}
async function until(predicate, attempts = 300) { for (let i = 0; i < attempts && !predicate(); i++) await new Promise(r => setTimeout(r, 10)); assert.ok(predicate()); }

test('eligible native GET/fetch abort stays UNRESOLVED without closing, retrying or authenticating', async () => {
  const s = await fixture();
  try { await s.request(); await s.page.evaluate(() => window.abortController.abort());
    await until(() => !!s.browser.receipt().diagnostics.unresolvedAborts?.length || s.browser.receipt().closed);
    const r = s.browser.receipt(); assert.equal(r.firstFailure, null); assert.equal(r.closed, false);
    assert.equal(r.diagnostics.unresolvedAborts.length, 1); assert.equal(r.diagnostics.unresolvedAborts[0].classification, 'UNRESOLVED');
    assert.equal(r.identityConfirmed, false); assert.equal(r.captchaOwnerObserved, false); assert.equal(r.channel.sessionPresent, false);
    await assert.rejects(s.browser.verifyActor(), /PRIVATE_SNAPSHOT_SOURCE_INVALID/);
    await assert.rejects(s.browser.catalog('RLS_A_SPECS'), /PRIVATE_SESSION_MISSING/); assert.equal(s.wireCalls(), 0);
    assert.equal(r.diagnostics.observedExternalGets, 1);
    for (const value of ['external.example.invalid', 'not-a-secret', 'fixture@example.invalid']) assert.ok(!JSON.stringify(r).includes(value));
    await s.portal.locator('#stop').click().catch(() => {}); await until(() => s.browser.receipt().closed);
    assert.equal(s.browser.receipt().firstFailure, 'OWNER_STOP');
    results.push({ name: 'ABORT_CONTINUES_NO_AUTH_NO_RLS_OWNER_STOP', result: 'PASS', evidence: r.diagnostics });
  } finally { await s.close(); }
});
test('connection reset is still fatal, not an authentication success', async () => {
  const s = await fixture();
  try { const route = await s.request(); await route.abort('connectionreset'); await until(() => s.browser.receipt().closed);
    assert.equal(s.browser.receipt().firstFailure, 'NATIVE_REQUEST_FAILED'); assert.equal(s.browser.receipt().identityConfirmed, false);
    results.push({ name: 'CONNECTION_RESET_STILL_FATAL', result: 'PASS' });
  } finally { await s.close(); }
});
test('unknown external POST remains a safety stop and abort cannot replace first failure', async () => {
  const s = await fixture();
  try { await s.request({ method: 'POST' }); await until(() => s.browser.receipt().closed);
    assert.equal(s.browser.receipt().firstFailure, 'OBSERVED_UNAPPROVED_REQUEST');
    assert.equal(s.browser.receipt().diagnostics.unresolvedAborts?.length ?? 0, 0);
    results.push({ name: 'POST_STILL_DENIED', result: 'PASS' });
  } finally { await s.close(); }
});
test('recognized sensitive query is rejected even if that fetch is cancelled', async () => {
  const s = await fixture();
  try { await s.request({ url: 'https://external.example.invalid/?token=LOCAL_SECRET_SENTINEL' });
    await until(() => s.browser.receipt().closed);
    assert.equal(s.browser.receipt().firstFailure, 'OBSERVED_SENSITIVE_EXTERNAL_QUERY');
    assert.ok(!JSON.stringify(s.browser.receipt()).includes('LOCAL_SECRET_SENTINEL'));
    results.push({ name: 'SENSITIVE_REQUEST_STILL_FATAL', result: 'PASS' });
  } finally { await s.close(); }
});
test('script ERR_ABORTED is outside the fetch-only continuation', async () => {
  const s = await fixture();
  try { const route = await s.request({ type: 'script' }); await route.abort('aborted'); await until(() => s.browser.receipt().closed);
    assert.equal(s.browser.receipt().firstFailure, 'NATIVE_REQUEST_FAILED'); results.push({ name: 'SCRIPT_ABORT_STILL_FATAL', result: 'PASS' });
  } finally { await s.close(); }
});
test('negative authentication stage does not inherit the positive-login continuation', async () => {
  const s = await fixture({ kind: 'wrong-password' });
  try { const route = await s.request(); await route.abort('aborted'); await until(() => s.browser.receipt().closed);
    assert.equal(s.browser.receipt().firstFailure, 'NATIVE_REQUEST_FAILED'); results.push({ name: 'NEGATIVE_STAGE_STILL_STRICT', result: 'PASS' });
  } finally { await s.close(); }
});
test('deadline still closes an eligible unresolved authentication attempt', async () => {
  const s = await fixture({ workMs: 6000 });
  try { await s.request(); await s.page.evaluate(() => window.abortController.abort()).catch(() => {});
    await until(() => s.browser.receipt().closed, 1000); assert.equal(s.browser.receipt().firstFailure, 'WORK_DEADLINE');
    results.push({ name: 'DEADLINE_AFTER_UNRESOLVED_ABORT', result: 'PASS' });
  } finally { await s.close(); }
});
