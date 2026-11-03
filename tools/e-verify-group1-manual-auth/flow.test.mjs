import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openNativeBrowser } from './browser.mjs';
import { runGroup1 } from '../e-verify-group1-script-identity/execution/group1/runner.mjs';
import { runSupervised, waitForStart } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { loopbackTransport } from '../e-verify-group1-script-binding/execution/wire.mjs';
import { catalogSteps } from '../e-verify-group1-script-identity/execution/group1/rls.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[2] === '--offline-child') {
  await waitForStart(); const servers = [], readers = []; let wireCalls = 0, refreshes = 0;
  const app = 'https://app.example.invalid', db = 'https://qa.example.invalid', pub = 'sb_publishable_LOCAL_ONLY';
  const accounts = Object.fromEntries(['A', 'B', 'ADMIN'].map((actor, i) => [actor, { userId: (i + 1).toString().repeat(8) + '-1111-4111-8111-111111111111',
    email: 'qa-' + i + '@example.invalid', applicationRole: actor === 'ADMIN' ? 'admin' : 'user', exists: true, ownerControlled: true, dedicatedQA: true, legalConsentCurrent: true }]));
  const budget = { allBrowserHttpDispatchesMax: 650, supabaseAuthDispatchesMax: 40, applicationMutationDispatchesMax: 50, ownerSessionRefreshRequestsMax: 6, supabaseRestReadDispatchesMax: 80, turnstileHttpDispatchesMax: 40, executionSecondsMax: 3600, openaiAndProviderCostUSDMax: 0 };
  const token = user => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ iss: db + '/auth/v1', aud: 'authenticated', role: 'authenticated', sub: user.userId, exp: Math.floor(Date.now() / 1000) + 1800 })).toString('base64url') + '.FIXTURE_NOT_SIGNED';
  const listen = async server => { servers.push(server); await new Promise(r => server.listen(0, '127.0.0.1', r)); return 'http://127.0.0.1:' + server.address().port; };
  const api = await listen(http.createServer((q, r) => {
    wireCalls++; let user;
    try { user = Object.values(accounts).find(a => a.userId === JSON.parse(Buffer.from(q.headers.authorization.split('.')[1], 'base64url')).sub); } catch {}
    const url = new URL(q.url, db); const step = catalogSteps().find(s => s.path === q.url && (q.headers.authorization === 'Bearer ' + pub ? s.actor === 'anon' : s.actor === Object.entries(accounts).find(([, a]) => a === user)?.[0]));
    let status = 200, body;
    if (url.pathname === '/auth/v1/user') body = { id: user?.userId, email: user?.email };
    else if (url.pathname === '/rest/v1/profiles') body = [{ id: user?.userId, role: user?.applicationRole }];
    else if (step) {
      if (step.expect !== 'public') { status = step.actor === 'anon' ? 401 : 403; body = { code: '42501', message: 'permission denied', details: null, hint: null }; }
      else body = { published: [{ slug: 'xreal-air', brand_key: 'xreal', name: 'Local fixture', catalog_normalized: true }], specs: [{ device_slug: 'xreal-air', key: 'local', state: 'KNOWN' }], sources: [{ device_slug: 'xreal-air', publisher: 'fixture' }], evidence: [] }[step.kind];
    } else if (url.pathname.startsWith('/api/admin/')) {
      if (user?.applicationRole !== 'admin') { status = 403; body = { error: 'forbidden' }; }
      else body = url.pathname.endsWith('/me') ? { user_id: user.userId, role: 'admin', allowed: true } : { ok: true, devices: [] };
    } else { status = 404; body = { error: 'fixture-unbound' }; }
    r.writeHead(status, { 'content-type': 'application/json' }); r.end(JSON.stringify(body));
  }));
  const wire = loopbackTransport(api);
  const transport = (q, bounds) => wire({ ...q, url: db + new URL(q.url).pathname + new URL(q.url).search }, bounds);
  const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); }); proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  const proxyOrigin = await listen(proxy);
  const openBrowser = async options => {
    const user = options.binding; let ctx;
    const fixtureSetup = {
      launchOptions: { proxy: { server: proxyOrigin, bypass: '127.0.0.1' }, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
      async install({ context, p, channel }) {
        ctx = context; readers.push(channel);
        await context.route(url => [app, db].includes(url.origin), async route => {
          const q = route.request(), u = new URL(q.url());
          if (u.origin === app) {
            const html = '<!doctype html><link rel="icon" href="data:,"><div data-brand-module>Devices fixture</div><div data-product-detail>Product fixture</div>' + (options.actor === 'ADMIN'
              ? '<div class="admin-news-dashboard"><div class="admin-news-dashboard__list">Read-only fixture</div></div>' : '<div class="admin-state-message"><p>This account does not have administrator access.</p></div>');
            await route.fulfill({ status: 200, contentType: 'text/html', body: html }); return;
          }
          const requestBody = q.postDataBuffer(); const body = requestBody?.length ? JSON.parse(requestBody) : {};
          let status = 200, result;
          if (q.method() === 'OPTIONS') { status = 204; result = ''; }
          else if (u.pathname === '/auth/v1/logout') { status = 204; result = ''; }
          else if (u.search.endsWith('refresh_token')) { refreshes++; result = { access_token: token(user), refresh_token: 'LOCAL_REFRESH', token_type: 'bearer', user: { id: user.userId, email: user.email } }; }
          else if (body.password !== 'OFFLINE_PASSWORD') { status = 400; result = { error_code: 'invalid_credentials' }; }
          else if (body.gotrue_meta_security?.captcha_token !== 'LOCAL_POSITIVE_PROOF') { status = 400; result = { error_code: 'captcha_failed' }; }
          else result = { access_token: token(user), refresh_token: 'LOCAL_REFRESH', token_type: 'bearer', user: { id: user.userId, email: user.email } };
          await route.fulfill({ status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': app,
            'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,apikey,authorization' }, body: typeof result === 'string' ? result : JSON.stringify(result) });
        });
      },
      async start(portal) { await portal.getByRole('button', { name: 'Start', exact: true }).click(); },
      async navigate(p, route, kind) {
        if (!route.startsWith('/login/')) return;
        await p.evaluate(async x => {
          const q = await fetch(x.db + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'content-type': 'application/json', apikey: x.pub },
            body: JSON.stringify({ email: x.email, password: x.kind === 'wrong-password' ? 'WRONG_FIXTURE' : 'OFFLINE_PASSWORD', gotrue_meta_security: { captcha_token: 'LOCAL_POSITIVE_PROOF' } }) });
          const data = await q.json(); if (!q.ok) return;
          localStorage.setItem('sb-qa-auth-token', JSON.stringify(data));
          const refreshed = await fetch(x.db + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { 'content-type': 'application/json', apikey: x.pub }, body: JSON.stringify({ refresh_token: 'LOCAL_REFRESH' }) }).then(r => r.json());
          localStorage.setItem('sb-qa-auth-token', JSON.stringify(refreshed));
          location.href = x.app + '/products/';
        }, { db, app, pub, email: user.email, kind });
      },
      async logout(p, portal) {
        await portal.getByRole('button', { name: 'CAPTCHA observed', exact: true }).click();
        await p.evaluate(async x => { await fetch(x.db + '/auth/v1/logout?scope=global', { method: 'POST', headers: { apikey: x.pub, authorization: 'Bearer ' + JSON.parse(localStorage.getItem('sb-qa-auth-token')).access_token } }); localStorage.removeItem('sb-qa-auth-token'); }, { db, pub });
      },
      async finish(portal) { await portal.getByRole('button', { name: 'Finish', exact: true }).click(); }
    };
    return openNativeBrowser({ ...options, fixtureSetup, headless: true, workMs: 45000 });
  };
  let result;
  try { result = await runGroup1({ privateBinding: { accounts, budget }, appOrigin: app, supabaseOrigin: db, staticManifest: [], transport,
    openBrowser, deployment: async () => ({ deploymentId: 'OFFLINE_FIXED', activeVersion: 'OFFLINE_ONLY' }), assertDeployment: x => x, manualWaitMs: 10000 }); }
  finally { for (const s of servers) { s.closeAllConnections(); await new Promise(r => s.close(r)); } }
  const safe = { fixtureOnly: true, actualChrome: true, actualSupabaseSdkUsed: false, actualTurnstileUsed: false, result,
    wireCalls, refreshes, readersDestroyed: readers.every(r => r.receipt().destroyed), productionRequests: 0, productionWrites: 0, thirdPartyLiveRequests: 0 };
  fs.writeFileSync(process.argv[3], JSON.stringify(safe, null, 2) + '\n', { flag: 'wx' });
  await new Promise(r => process.send({ type: 'receipt', status: 'complete' }, r)); process.disconnect();
} else {
  test('new manual adapter: six real offline Chrome profiles, original actor/negative flow, 16 hard reads and cleanup', { timeout: 65000 }, async () => {
    const out = path.join(root, 'artifacts', 'flow-' + Date.now()); fs.mkdirSync(out, { recursive: true }); const file = path.join(out, 'FLOW_SAFE.json');
    const s = await runSupervised({ entry: 'flow.test.mjs', cwd: root, args: ['--offline-child', file], deadlineMs: 60000, graceMs: 3000, reserveMs: 5000,
      receiptPath: path.join(out, 'SUPERVISOR_SAFE.json'), env: Object.fromEntries(['SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
    const r = JSON.parse(fs.readFileSync(file)); console.log('MANUAL_FLOW_SAFE=' + JSON.stringify({ file, status: r.result.status, failure: r.result.firstFailure, rls: r.result.catalogCasesPassed, auth: r.result.identitiesVerified, negatives: r.result.negativeAuthPassed }));
    assert.equal(s.classification, 'EXIT_ZERO'); assert.equal(s.reaped, true); assert.equal(s.containment.closed, true); assert.equal(r.result.status, 'PASS');
    assert.equal(r.result.identitiesVerified, 3); assert.equal(r.result.negativeAuthPassed, 3); assert.equal(r.result.catalogCasesPassed, 16);
    assert.equal(r.refreshes, 3); assert.equal(r.wireCalls, 28); assert.equal(r.readersDestroyed, true); assert.equal(r.result.cleanup, 'PASS');
    assert.equal(r.productionRequests, 0); assert.equal(r.thirdPartyLiveRequests, 0);
  });
}
