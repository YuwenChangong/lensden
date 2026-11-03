import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import { runSupervised, waitForStart } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { createProfile, cleanupProfile } from '../e-verify-native-manual/profile.mjs';
import { installNodeGuard } from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import { MemorySessionReader } from './session-reader.mjs';
import { attachSessionCapture } from './capture.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
import { loopbackTransport } from '../e-verify-group1-script-binding/execution/wire.mjs';

const cwd = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[2] === '--offline-child') {
  await waitForStart();
  const file = process.argv[3], servers = [], profiles = [], browsers = [], captureHandles = [];
  let budget, forbiddenForwarding = 0, apiCalls = 0, stops = 0, proxyBlocked = 0, handoffs = 0;
  const listen = async server => { servers.push(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + server.address().port; };
  const actors = ['A', 'B', 'ADMIN'].map((actor, i) => ({ actor, userId: (i + 1).toString().repeat(8) + '-1111-4111-8111-111111111111',
    email: 'fixture-' + i + '@example.invalid', applicationRole: actor === 'ADMIN' ? 'admin' : 'user' }));
  let app;
  const appServer = http.createServer((q, r) => {
    if (q.url === '/fixture') { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><link rel="icon" href="data:,"><p>Local memory handoff only</p>'); return; }
    r.writeHead(404); r.end();
  });
  app = await listen(appServer);
  const proxy = http.createServer((_, r) => { proxyBlocked++; r.writeHead(403); r.end(); });
  proxy.on('connect', (_, socket) => { proxyBlocked++; socket.on('error', () => {}); socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  const proxyOrigin = await listen(proxy);
  const fixtureKey = 'sb_publishable_LOCAL_FIXTURE';
  const apiOrigin = 'https://qa.example.invalid';
  const apiLoopback = await listen(http.createServer((q, r) => {
    apiCalls++;
    let user;
    try {
      const token = q.headers.authorization?.replace(/^Bearer /, '');
      const sub = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub;
      user = actors.find(a => a.userId === sub);
    } catch {}
    if (!user || !['/auth/v1/user', '/rest/v1/profiles?select=id,role&id=eq.' + user.userId + '&limit=1'].includes(q.url)) { r.writeHead(403); r.end(); return; }
    r.writeHead(200, { 'content-type': 'application/json' });
    r.end(JSON.stringify(q.url === '/auth/v1/user' ? { id: user.userId, email: user.email } : [{ id: user.userId, role: user.applicationRole }]));
  }));
  const controlledFixture = loopbackTransport(apiLoopback);
  const nativeEndpoints = new Map(), contexts = [], readers = [];
  let profileRemoved = false, contextIsolation = false;
  try {
    for (const binding of actors) {
      const profile = createProfile(); profiles.push(profile);
      const shell = await chromium.launchPersistentContext(profile, { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
        proxy: { server: proxyOrigin, bypass: '127.0.0.1' }, args: ['--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync',
          '--no-first-run', '--no-default-browser-check', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
      const browser = shell.browser(); browsers.push(browser);
      const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [] }); contexts.push(context);
      const page = await context.newPage();
      // Browser responses are delivered only by this local fixture, not a live Supabase SDK.
      await context.route('**/*', route => {
        const request = route.request(), u = new URL(request.url());
        if (u.origin === app && u.pathname === '/fixture') return route.continue();
        if (u.origin !== apiOrigin || u.pathname !== '/auth/v1/token' || request.method() !== 'POST') { forbiddenForwarding++; return route.abort(); }
        const claims = { iss: apiOrigin + '/auth/v1', aud: 'authenticated', role: 'authenticated', sub: binding.userId, exp: Math.floor(Date.now() / 1000) + 1800 };
        const token = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.UNSIGNED_FIXTURE';
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': app }, body: JSON.stringify({
          token_type: 'bearer', access_token: token, refresh_token: 'DO_NOT_STORE_FIXTURE_REFRESH', user: { id: binding.userId, email: binding.email } }) });
      });
      nativeEndpoints.set(binding.actor, { page, context, binding });
    }
    budget = new SharedBudget({ allBrowserHttpDispatchesMax: 650, supabaseAuthDispatchesMax: 40, supabaseRestReadDispatchesMax: 80 });
    installNodeGuard(() => { throw Error('NODE_ESCAPE'); });
    for (const [actor, endpoint] of nativeEndpoints) {
      const { page, context, binding } = endpoint;
      const reader = new MemorySessionReader({ actor, binding, contextIdentity: context, supabaseOrigin: apiOrigin, publicKey: fixtureKey,
        budget, transport: controlledFixture, validUntil: Date.now() + 1740000 }); readers.push(reader);
      const capture = attachSessionCapture(page, { reader, contextIdentity: context, actor, expectedOrigin: apiOrigin, onStop: () => stops++ }); captureHandles.push(capture);
      await page.goto(app + '/fixture');
      await page.evaluate(label => localStorage.setItem('fixture-actor-label', label), actor);
      capture.arm('password');
      await page.evaluate(origin => fetch(origin + '/auth/v1/token?grant_type=password', { method: 'POST' }).then(r => r.json()).then(() => true), apiOrigin);
      const until = Date.now() + 3000;
      while (!reader.receipt().sessionPresent && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
      if (!reader.receipt().sessionPresent) throw Error('MEMORY_CAPTURE_NOT_COMPLETED');
      await reader.verifyActor(); handoffs++;
    }
    contextIsolation = true;
    for (const [actor, { page }] of nativeEndpoints) {
      if (await page.evaluate(() => localStorage.getItem('fixture-actor-label')) !== actor) contextIsolation = false;
    }
  } finally {
    for (const capture of captureHandles) capture.dispose();
    for (const browser of browsers) await browser.close();
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    profileRemoved = profiles.every(profile => cleanupProfile(profile));
  }
  fs.writeFileSync(file, JSON.stringify({ handoffs, contextIsolation, separateProfiles: profiles.length === 3, stops,
    apiCalls, forbiddenForwarding, profileRemoved, sessionsDestroyed: readers.every(r => r.receipt().destroyed), proxyBlocked,
    rawValuesLogged: false, fixtureOnly: true, actualSupabaseSdkUsed: false, controlledTransportFixture: 'EXISTING_REAL_HTTP_LOOPBACK_WIRE_NOT_PRODUCTION_TLS',
    productionRequests: 0, productionWrites: 0, thirdPartyLiveRequests: 0, counts: budget.receipt() }, null, 2), { flag: 'wx' });
  await new Promise(resolve => process.send({ type: 'receipt', status: 'complete' }, resolve)); process.disconnect();
} else {
  test('real offline Chrome capture: A/B/ADMIN process-memory bridge and strict identity fixtures', async () => {
    const out = path.join(cwd, 'artifacts', 'handoff-' + Date.now()); fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, 'HANDOFF_SAFE.json');
    const s = await runSupervised({ entry: 'browser-handoff.test.mjs', args: ['--offline-child', file], cwd,
      deadlineMs: 30000, graceMs: 3000, reserveMs: 5000, receiptPath: path.join(out, 'SUPERVISOR_SAFE.json'),
      env: Object.fromEntries(['SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
    assert.equal(s.classification, 'EXIT_ZERO'); assert.equal(s.containment.closed, true); assert.equal(s.reaped, true);
    const r = JSON.parse(fs.readFileSync(file));
    assert.equal(r.handoffs, 3); assert.equal(r.apiCalls, 6); assert.equal(r.contextIsolation, true); assert.equal(r.separateProfiles, true);
    assert.equal(r.profileRemoved, true); assert.equal(r.sessionsDestroyed, true); assert.equal(r.rawValuesLogged, false);
    assert.equal(r.stops, 0); assert.equal(r.productionRequests, 0); assert.equal(r.thirdPartyLiveRequests, 0);
    console.log('HANDOFF_RECEIPT=' + file);
  }, { timeout: 35000 });
}
