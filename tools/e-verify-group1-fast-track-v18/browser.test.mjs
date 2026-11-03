import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openNativeBrowser } from './browser.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://db.example.invalid';
const out = new URL('./artifacts/browser-' + Date.now() + '/', import.meta.url); fs.mkdirSync(out, { recursive: true });
const safe = { productionRequests: 0, thirdPartyLiveRequests: 0, realAuthUsed: false, tests: [] };
test.after(() => fs.writeFileSync(new URL('TARGETED_SAFE.json', out), JSON.stringify(safe, null, 2) + '\n', { flag: 'wx' }));
async function open(mode, vendorMax = 40) {
  const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r)); let browser, page, portal;
  try {
    browser = await openNativeBrowser({ actor: 'A', binding: { userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user' },
      appOrigin, supabaseOrigin, staticPaths: [], workMs: 15000, headless: false,
      budget: new SharedBudget({ allBrowserHttpDispatchesMax: 650, turnstileHttpDispatchesMax: vendorMax, executionSecondsMax: 3600 }),
      transport: async () => { throw Error('NO_AUTH_OR_RLS_IN_FIXTURE'); }, fixtureSetup: {
        launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' }, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
        async install(s) { page = s.p; portal = s.portal;
          await s.context.route('**/*', async route => {
            const u = new URL(route.request().url());
            if (u.origin === appOrigin) await route.fulfill({ status: 200, contentType: 'text/html', body:
              '<!doctype html><link rel="icon" href="data:,"><p>OFFLINE login fixture</p><script>setTimeout(async()=>{await fetch("https://unreviewed.example.invalid/PRIVATE_PATH",{method:"' + mode + '"}).catch(()=>{});window.fixtureDone=true},50)</script>' });
            else await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': appOrigin }, body: '{}' });
          });
        }, start: p => p.locator('#start').click()
      } });
    return { browser, page, portal, async close() { await browser.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); } };
  } catch (e) { await browser?.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); throw e; }
}
test('real offline Chrome continues unenumerated external GET to interactive page and preserves owner Stop', async () => {
  const s = await open('GET');
  try {
    s.browser.permitLogin('success'); await s.browser.navigate('/login/');
    await s.page.waitForFunction(() => window.fixtureDone, null, { timeout: 5000 });
    const before = s.browser.receipt(); assert.equal(before.firstFailure, null); assert.equal(before.started, true);
    assert.equal(before.diagnostics.observedExternalGets, 1); assert.equal(before.counts.turnstileHttpDispatchesMax, 1);
    assert.equal(before.diagnostics.unenumeratedGets[0].legitimacy, 'UNKNOWN');
    assert.equal(before.diagnostics.exactPrivateOriginCollection, false);
    for (const value of ['unreviewed.example.invalid', 'PRIVATE_PATH']) assert.ok(!JSON.stringify(before).includes(value));
    await s.portal.locator('#stop').click().catch(() => {}); await s.browser.close();
    assert.equal(s.browser.receipt().firstFailure, 'OWNER_STOP'); assert.equal(s.browser.receipt().closed, true);
    safe.tests.push({ name: 'GET_CONTINUES_AND_OWNER_STOP', result: 'PASS', receipt: s.browser.receipt() });
  } finally { await s.close(); }
});
test('real offline Chrome stops an external POST without interpreting it as an allowed GET', async () => {
  const s = await open('POST');
  try {
    s.browser.permitLogin('success'); await s.browser.navigate('/login/').catch(() => {});
    for (let i = 0; i < 200 && !s.browser.receipt().closed; i++) await new Promise(r => setTimeout(r, 25));
    assert.equal(s.browser.receipt().firstFailure, 'OBSERVED_UNAPPROVED_REQUEST'); assert.equal(s.browser.receipt().closed, true);
    assert.equal(s.browser.receipt().diagnostics.observedExternalGets, 0);
    safe.tests.push({ name: 'POST_STOPS', result: 'PASS' });
  } finally { await s.close(); }
});
test('external GET uses existing vendor/global observation caps and excess stops, not a claimed pre-dispatch block', async () => {
  const s = await open('GET', 0);
  try {
    s.browser.permitLogin('success'); await s.browser.navigate('/login/').catch(() => {});
    for (let i = 0; i < 200 && !s.browser.receipt().closed; i++) await new Promise(r => setTimeout(r, 25));
    assert.ok(s.browser.receipt().firstFailure?.includes('BUDGET')); assert.equal(s.browser.receipt().closed, true);
    safe.tests.push({ name: 'OBSERVATION_BUDGET_STOP', result: 'PASS', boundary: 'MONITOR_ONLY' });
  } finally { await s.close(); }
});
