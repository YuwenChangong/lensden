import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { openNativeBrowser } from '../e-verify-group1-fast-track-v18/browser.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';

const source = fs.readFileSync(new URL('../e-verify-group1-fast-track-v18/browser.mjs', import.meta.url), 'utf8');
const stopSource = source.slice(source.indexOf('  const stop ='), source.indexOf('  const tracked ='));
const handlerSource = source.slice(source.indexOf("    p.on('requestfailed'"), source.indexOf('    // Dedicated private response listener'));
assert.ok(stopSource.includes('failure ||='));
assert.ok(source.includes('closing = true; clearTimeout(timer); channel?.dispose();'));
const out = new URL('./artifacts/run-' + Date.now() + '/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const results = [];
const deniedProxyAttempts = [];
test.after(() => fs.writeFileSync(new URL('TARGETED_SAFE.json', out), JSON.stringify({
  scope: 'UNCHANGED_V18_ABORT_HANDLING_ONLY', tests: results, deniedLocalProxyAttempts: deniedProxyAttempts,
  productionRequests: 0, thirdPartyLiveRequests: 0, realCredentialsUsed: false,
  productionRootCauseProven: false, frozenBrowserModified: false
}, null, 2) + '\n', { flag: 'wx' }));

// Execute the frozen listener and stop implementation, not a new cancellation policy.
function model({ closing = false, failure = null } = {}) {
  const p = new EventEmitter(), events = [];
  const sandbox = vm.createContext({ p, URL, events, initialClosing: closing, initialFailure: failure });
  vm.runInContext(`let closing=initialClosing,failure=initialFailure,inFlight=1,lastFailedRequest=null;
    const excludedIcons=new WeakSet(),responseStatuses=new WeakMap();
    const supabaseOrigin='https://db.example.invalid',appOrigin='https://app.example.invalid';
    const clearRewrite=()=>{},budget={stop(){events.push('budget-stop')}};
    const close=()=>{events.push('close-entry');closing=true;return Promise.resolve()};
    ${stopSource}
    ${handlerSource}
    globalThis.snapshot=()=>({closing,failure,lastFailedRequest});`, sandbox);
  const failed = error => ({ url: () => 'https://external.example.invalid/fixture',
    method: () => 'GET', resourceType: () => 'fetch', failure: () => ({ errorText: error }) });
  return { emit(error) { events.push('requestfailed'); p.emit('requestfailed', failed(error)); },
    snapshot: () => sandbox.snapshot(), events };
}

test('cleanup guard ignores subsequent requestfailed without inventing a first failure', () => {
  const m = model({ closing: true }); m.emit('net::ERR_ABORTED');
  assert.equal(m.snapshot().failure, null); assert.equal(m.snapshot().lastFailedRequest, null);
  assert.deepEqual(m.events, ['requestfailed']); results.push('CLEANUP_ABORT_NOT_FIRST_FAILURE');
});
test('unassociated ERR_ABORTED remains fatal and precedes close entry', () => {
  const m = model(); m.emit('net::ERR_ABORTED');
  assert.equal(m.snapshot().failure, 'NATIVE_REQUEST_FAILED');
  assert.deepEqual(m.events, ['requestfailed', 'budget-stop', 'close-entry']);
  results.push('UNASSOCIATED_ABORT_STILL_FATAL');
});
test('network failure is never converted into a benign cancellation', () => {
  const m = model(); m.emit('net::ERR_CONNECTION_RESET');
  assert.equal(m.snapshot().failure, 'NATIVE_REQUEST_FAILED');
  assert.equal(m.snapshot().lastFailedRequest.errorClass, 'net::ERR_CONNECTION_RESET');
  results.push('NETWORK_FAILURE_STILL_FATAL');
});
test('subsequent cancellation does not overwrite the original safety failure', () => {
  const m = model({ failure: 'OBSERVED_CREDENTIAL_ORIGIN' }); m.emit('net::ERR_ABORTED');
  assert.equal(m.snapshot().failure, 'OBSERVED_CREDENTIAL_ORIGIN');
  const closed = model({ closing: true, failure: 'OWNER_STOP' }); closed.emit('net::ERR_ABORTED');
  assert.equal(closed.snapshot().failure, 'OWNER_STOP');
  results.push('FIRST_FAILURE_PRESERVED');
});

async function fixture() {
  let proxyAttempts = 0, page, portal, observedRoute, release;
  const proxy = http.createServer((q, r) => { proxyAttempts++; r.writeHead(403); r.end(); });
  proxy.on('connect', (q, s) => { proxyAttempts++; s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://db.example.invalid';
  let browser;
  try {
    browser = await openNativeBrowser({ actor: 'A', binding: {
      userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user'
    }, appOrigin, supabaseOrigin, staticPaths: [], workMs: 20000, headless: false,
    budget: new SharedBudget({ allBrowserHttpDispatchesMax: 650, turnstileHttpDispatchesMax: 40, executionSecondsMax: 3600 }),
    transport: async () => { throw Error('NO_AUTH_OR_RLS_IN_FIXTURE'); }, fixtureSetup: {
      launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' },
        args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
      async install(s) {
        page = s.p; portal = s.portal;
        await s.context.route('**/*', async route => {
          const u = new URL(route.request().url());
          if (u.origin === appOrigin) return route.fulfill({ status: 200, contentType: 'text/html', body:
            '<!doctype html><link rel="icon" href="data:,"><p>OFFLINE cancellation fixture</p>' });
          if (u.origin === 'https://external.example.invalid') {
            observedRoute = route;
            await new Promise(r => { release = r; });
            await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': appOrigin }, body: '{}' }).catch(() => {});
            return;
          }
          await route.abort('blockedbyclient');
        });
      }, start: p => p.locator('#start').click()
    } });
    browser.permitLogin('success'); await browser.navigate('/login/');
    return { browser, page, portal,
      async pendingFetch(method = 'GET') {
        await page.evaluate(method => { window.controller = new AbortController();
          void fetch('https://external.example.invalid/fixture', { method, signal: window.controller.signal }).catch(() => {});
        }, method);
        for (let i = 0; i < 200 && (!observedRoute || !release); i++) await new Promise(r => setTimeout(r, 10));
        assert.ok(observedRoute && release, 'fixture request must be locally intercepted');
        return observedRoute;
      },
      async close() { release?.(); await browser.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
        assert.equal(browser.receipt().closed, true); assert.equal(browser.receipt().channel.destroyed, true);
        // Chrome background CONNECT attempts terminate at this local deny-only server.
        // It has no forwarding implementation; attempts are not third-party dispatches.
        deniedProxyAttempts.push(proxyAttempts); }
    };
  } catch (error) { release?.(); await browser?.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); throw error; }
}
async function closed(s) {
  for (let i = 0; i < 300 && !s.browser.receipt().closed; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(s.browser.receipt().closed, true);
  return s.browser.receipt();
}

test('real offline Chrome AbortController cancellation stops the unchanged v18 browser', async () => {
  const s = await fixture();
  try { await s.pendingFetch(); await s.page.evaluate(() => window.controller.abort()).catch(() => {});
    const r = await closed(s); assert.equal(r.firstFailure, 'NATIVE_REQUEST_FAILED');
    assert.equal(r.diagnostics.lastFailedRequest.errorClass, 'net::ERR_ABORTED');
    results.push('REAL_CHROME_EXPLICIT_ABORT_STILL_FATAL_NOT_HISTORY_PROOF');
  } finally { await s.close(); }
});
test('real offline Chrome ordinary navigation does not prove the historical cancellation mechanism', async () => {
  const s = await fixture();
  try { await s.pendingFetch();
    const response = await s.page.goto('https://app.example.invalid/login/?next=%2Fproducts%2F', { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    const r = s.browser.receipt(); assert.equal(r.firstFailure, null);
    assert.equal(r.diagnostics.lastFailedRequest, null);
    results.push('ORDINARY_NAVIGATION_DID_NOT_REPRODUCE_ABORT_UNLOAD_CAUSALITY_UNPROVEN');
  } finally { await s.close(); }
});
test('real offline Chrome simulated connection reset still stops and cleans', async () => {
  const s = await fixture();
  try { const route = await s.pendingFetch(); await route.abort('connectionreset');
    const r = await closed(s); assert.equal(r.firstFailure, 'NATIVE_REQUEST_FAILED');
    assert.equal(r.diagnostics.lastFailedRequest.errorClass, 'net::ERR_CONNECTION_RESET');
    results.push('REAL_CHROME_NETWORK_FAILURE_FIXTURE_STILL_FATAL');
  } finally { await s.close(); }
});
test('illegal external POST stays blocked and cleanup cancellation cannot replace it', async () => {
  const s = await fixture();
  try { await s.pendingFetch('POST'); const r = await closed(s);
    assert.equal(r.firstFailure, 'OBSERVED_UNAPPROVED_REQUEST');
    assert.equal(r.diagnostics.observedExternalGets, 0); results.push('ILLEGAL_POST_FIRST_FAILURE_PRESERVED');
  } finally { await s.close(); }
});
