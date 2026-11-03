import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import { createProfile, cleanupProfile } from '../e-verify-native-manual/profile.mjs';
import { verifyExecutable, CHROME } from '../e-verify-group1-chrome-v15/chrome-identity.mjs';
import { runSupervised } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { openProtectedOrigins } from './private-origin.mjs';
import { attachOriginDiagnostics } from './integration.mjs';
import { OriginDiagnostic } from './diagnostic.mjs';
import { openNativeBrowser } from './browser.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
const out = new URL('./artifacts/integration-' + Date.now() + '/', import.meta.url); fs.mkdirSync(out, { recursive: true });
const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://qa.example.invalid';
const summary = { productionRequests: 0, thirdPartyLiveRequests: 0, originalV16Identity: 'UNKNOWN', tests: [] };
test.after(() => fs.writeFileSync(new URL('TARGETED_SAFE.json', out), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' }));

test('actual Chrome/CDP observes allowed requests, redirects, child Frame and unknown fetch with private recoverable Origin', async () => {
  verifyExecutable(); const profile = createProfile(), store = await openProtectedOrigins();
  const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  let context, observation; const stops = [], served = [];
  try {
    context = await chromium.launchPersistentContext(profile, { executablePath: CHROME, headless: true, serviceWorkers: 'block',
      proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' },
      args: ['--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
    const page = await context.newPage();
    observation = await attachOriginDiagnostics({ context, page, actor: 'A', appOrigin, supabaseOrigin, store, stage: () => 'LOGIN_A', stop: code => stops.push(code) });
    await context.route('**/*', async route => {
      const q = route.request(), u = new URL(q.url()); served.push(u.origin === appOrigin ? 'LOCAL_APPLICATION_FIXTURE' : 'LOCAL_UNKNOWN_FIXTURE');
      if (u.origin !== appOrigin) { await route.abort(); return; }
      if (u.pathname === '/login/') await route.fulfill({ status: 200, contentType: 'text/html', body:
        '<!doctype html><link rel="icon" href="data:,"><iframe src="/child"></iframe><script>fetch("/redirect").catch(()=>{}).finally(()=>window.chain=true);setTimeout(()=>fetch("https://private-fixture.example.invalid/PRIVATE_PATH?token=PRIVATE_QUERY#PRIVATE_FRAGMENT").catch(()=>window.unknownDone=true),50)</script>' });
      else if (u.pathname === '/redirect') await route.fulfill({ status: 302, headers: { location: '/target' } });
      else if (u.pathname === '/child') await route.fulfill({ status: 200, contentType: 'text/html', body: '<script>fetch("/child-fetch")</script>' });
      else await route.fulfill({ status: 200, body: '{}' });
    });
    await page.goto(appOrigin + '/login/');
    await page.waitForFunction(() => window.chain && window.unknownDone, null, { timeout: 5000 });
    const r = await observation.flush(); summary.tests.push({ name: 'REAL_CHROME_CDP_PRIVATE_ORIGIN', result: 'PASS', evidence: r });
    const allowed = r.observations.find(x => x.publicResourceId === 'APP_LOGIN_DOCUMENT'); assert.equal(allowed.ruleMatched, true);
    const unknown = r.observations.find(x => x.originClass === 'OTHER_ORIGIN'); assert.ok(unknown);
    assert.equal(unknown.frameClass, 'APPLICATION_MAIN_FRAME'); assert.equal(unknown.ruleMatched, false);
    assert.equal(unknown.originEvidence.status, 'PRIVATE_ORIGIN_CAPTURE_ACKNOWLEDGED');
    assert.equal(unknown.dispatchStatus, 'UNKNOWN_OR_ALREADY_SENT');
    assert.ok(unknown.cdpCandidates.some(x => x.initiatorType === 'script' && x.publicInitiatorId === 'APP_LOGIN_DOCUMENT'));
    assert.ok(r.observations.some(x => x.frameClass === 'APPLICATION_CHILD_FRAME' && x.frameId && x.parentFrameId));
    const redirect = r.observations.find(x => x.redirectRelation === 'REDIRECT_CHAIN'); assert.ok(redirect?.redirectParentEventId);
    assert.ok(redirect.cdpCandidates.some(x => x.redirectResponseObserved));
    const privateValue = await store.read(unknown.originEvidence.evidenceRef);
    assert.equal(privateValue.host, 'private-fixture.example.invalid'); assert.deepEqual(Object.keys(privateValue).sort(), ['host', 'port', 'scheme']);
    assert.deepEqual(stops, []); assert.ok(served.includes('LOCAL_UNKNOWN_FIXTURE'));
    for (const value of ['private-fixture.example.invalid', 'PRIVATE_PATH', 'PRIVATE_QUERY', 'PRIVATE_FRAGMENT']) assert.ok(!JSON.stringify(r).includes(value));
    assert.equal(r.workerSharedWorkerWebSocketCoverage, 'UNKNOWN_INCOMPLETE');
    await store.close();
    await page.evaluate(() => fetch('https://second-fixture.example.invalid/PRIVATE_FAILED_CAPTURE').catch(() => {}));
    const failedCapture = await observation.flush();
    assert.ok(failedCapture.observations.some(x => x.originEvidence.status === 'PROTECTED_CAPTURE_FAILED'));
    assert.deepEqual(stops, ['PROTECTED_ORIGIN_CAPTURE_FAILED']);
    assert.ok(!JSON.stringify(failedCapture).includes('PRIVATE_FAILED_CAPTURE'));
    await observation.close(); observation = null;
  } finally {
    await observation?.close(); await context?.close(); await store.close();
    const cleanup = await openProtectedOrigins({ ...store.locator, reopen: true }); await cleanup.close({ destroy: true });
    proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); assert.equal(cleanupProfile(profile), true);
  }
});

test('independent actual runner stops unknown request, retains private evidence under Node guard, and drains supervised process tree', async () => {
  const store = await openProtectedOrigins(), locator = store.locator; await store.close();
  fs.writeFileSync(new URL('PRIVATE_LOCATOR_FIXTURE.json', out), JSON.stringify(locator), { flag: 'wx' });
  try {
    const result = await runSupervised({ entry: 'guard-check.mjs', cwd: fileURLToPath(new URL('.', import.meta.url)), args: [fileURLToPath(out)],
      deadlineMs: 30000, graceMs: 1000, reserveMs: 4000,
      env: Object.fromEntries(['SystemRoot', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE'].map(k => [k, process.env[k]])),
      receiptPath: fileURLToPath(new URL('GUARD_SUPERVISOR_SAFE.json', out)) });
    assert.equal(result.classification, 'EXIT_ZERO'); assert.equal(result.reaped, true); assert.equal(result.containment.closed, true);
    const receipt = JSON.parse(fs.readFileSync(new URL('GUARD_CHILD_SAFE.json', out))).receipt;
    assert.equal(receipt.firstFailure, 'OBSERVED_UNAPPROVED_REQUEST'); assert.equal(receipt.closed, true);
    assert.equal(receipt.controlEvidence.startEvents, 1);
    assert.equal(receipt.counts.supabaseAuthDispatchesMax ?? 0, 0); assert.equal(receipt.rlsEvidence.length, 0);
    const evidence = receipt.diagnostics.originEvidence;
    const unknown = evidence.observations.find(x => x.originEvidence.evidenceRef);
    assert.ok(unknown); assert.equal(unknown.ruleMatched, false);
    const reader = await openProtectedOrigins({ ...locator, reopen: true });
    try {
      const index = evidence.protectedIndex.evidence.find(x => x.evidenceRef === unknown.originEvidence.evidenceRef);
      assert.equal((await reader.read(index.evidenceRef, index.ciphertextSha256)).host, 'private-fixture.example.invalid');
    } finally { await reader.close(); }
    for (const marker of ['PRIVATE_PATH', 'PRIVATE_QUERY', 'private-fixture.example.invalid']) assert.ok(!JSON.stringify(receipt).includes(marker));
    summary.tests.push({ name: 'ACTUAL_RUNNER_GUARD_JOB_UNKNOWN_STOP', result: 'PASS', observedRequestRemainsUnauthorized: true, cleanup: 'PASS' });
  } finally {
    const cleanup = await openProtectedOrigins({ ...locator, reopen: true }); await cleanup.close({ destroy: true });
    fs.unlinkSync(new URL('PRIVATE_LOCATOR_FIXTURE.json', out));
  }
});

test('invalid and credential-bearing Origins stay privacy blocked with explicit reasons, no raw exception export', async () => {
  const d = new OriginDiagnostic({ appOrigin, supabaseOrigin, captureOrigin: () => { throw Error('RAW_SECRET'); } });
  const frame = { url: () => appOrigin + '/login/' }, page = { mainFrame: () => frame };
  const q = url => ({ url: () => url, method: () => 'GET', resourceType: () => 'fetch', frame: () => frame, redirectedFrom: () => null });
  try {
    for (const [url, reason] of [['data:text/plain,PRIVATE', 'OPAQUE_ORIGIN'], ['http://unknown.example.invalid/private', 'NON_HTTPS_SCHEME'],
      ['https://USER:PASSWORD@unknown.example.invalid/private', 'USERINFO_PRESENT']]) {
      const row = await d.observe(q(url), { page, actor: 'A', stage: 'LOGIN_A' });
      assert.equal(row.invalidOriginReason, reason); assert.equal(row.originEvidence.status, 'PRIVACY_BLOCKED');
      for (const marker of ['PRIVATE', 'PASSWORD', 'RAW_SECRET']) assert.ok(!JSON.stringify(row).includes(marker));
    }
    const failed = await d.observe(q('https://unknown.example.invalid/private'), { page, actor: 'A', stage: 'LOGIN_A' });
    assert.equal(failed.originEvidence.status, 'PROTECTED_CAPTURE_FAILED'); assert.ok(!JSON.stringify(failed).includes('RAW_SECRET'));
    summary.tests.push({ name: 'INVALID_ORIGIN_PRIVACY_FAIL_CLOSED', result: 'PASS' });
  } finally { d.dispose(); }
});

test('late CDP arrival and repeated requests remain candidates, never fabricated exact links', async () => {
  const d = new OriginDiagnostic({ appOrigin, supabaseOrigin });
  const frame = { url: () => appOrigin + '/login/' }, page = { mainFrame: () => frame };
  const request = { url: () => appOrigin + '/login/', method: () => 'GET', resourceType: () => 'document', frame: () => frame, redirectedFrom: () => null };
  const row = await d.observe(request, { page, actor: 'A', stage: 'LOGIN_A' }); assert.equal(row.cdpCorrelation, 'UNAVAILABLE');
  for (let i = 0; i < 6; i++) d.observeCdp({ requestId: 'PRIVATE_ID_' + i, request: { url: request.url(), method: 'GET' }, initiator: { type: 'parser' } });
  const refreshed = d.refreshCdp(row); assert.equal(refreshed.cdpCorrelation, 'AMBIGUOUS_CANDIDATES'); assert.equal(refreshed.cdpCandidates.length, 4);
  assert.ok(!JSON.stringify(refreshed).includes('PRIVATE_ID')); d.dispose();
});

for (const mode of ['OWNER_STOP', 'WORK_DEADLINE']) test('integrated observer preserves ' + mode + ' and private-helper cleanup before Start', async () => {
  const store = await openProtectedOrigins(); let browser, portal;
  const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  try {
    browser = await openNativeBrowser({ actor: 'A', binding: { userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user' },
      appOrigin, supabaseOrigin, staticPaths: [], diagnosticStore: store, headless: false, workMs: mode === 'WORK_DEADLINE' ? 4500 : 12000,
      budget: new SharedBudget({ allBrowserHttpDispatchesMax: 650, executionSecondsMax: 3600 }), transport: async () => { throw Error('NO_AUTH'); }, fixtureSetup: {
        launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' }, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
        install: async s => { portal = s.portal; await s.context.route('**/*', route => route.abort()); }
      } });
    if (mode === 'OWNER_STOP') await portal.locator('#stop').click().catch(() => {});
    else {
      browser.permitLogin('success'); await assert.rejects(browser.navigate('/login/'), /WORK_DEADLINE/);
      for (let i = 0; i < 20 && !browser.receipt().firstFailure; i++) await new Promise(r => setTimeout(r, 25));
    }
    await browser.close();
    assert.equal(browser.receipt().firstFailure, mode); assert.equal(browser.receipt().closed, true); assert.equal(browser.receipt().started, false);
    assert.equal(browser.receipt().diagnostics.originEvidence.observations.length, 0);
    summary.tests.push({ name: mode + '_INTEGRATION_CLEANUP', result: 'PASS' });
  } finally {
    await browser?.close(); await store.close();
    const cleanup = await openProtectedOrigins({ ...store.locator, reopen: true }); await cleanup.close({ destroy: true });
    proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
  }
});

test('unavailable Worker Frame remains unavailable, not an invented registered initiator', async () => {
  const d = new OriginDiagnostic({ appOrigin, supabaseOrigin });
  try {
    const row = await d.observe({ url: () => appOrigin + '/login/', method: () => 'GET', resourceType: () => 'fetch',
      frame: () => { throw Error('WORKER_FRAME_UNAVAILABLE'); }, redirectedFrom: () => null }, { actor: 'A', stage: 'LOGIN_A' });
    assert.equal(row.frameClass, 'FRAME_UNAVAILABLE'); assert.equal(row.cdpCorrelation, 'UNAVAILABLE'); assert.equal(row.dispatchStatus, 'UNKNOWN_OR_ALREADY_SENT');
  } finally { d.dispose(); }
});

test('independent browser differs from frozen v16 only by additive diagnostic wiring, not gates/Auth/session/budgets', () => {
  const original = fs.readFileSync(new URL('../e-verify-group1-control-v16/browser.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const integrated = fs.readFileSync(new URL('./browser.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const restored = integrated.replace("import { attachOriginDiagnostics } from './integration.mjs';\n", '')
    .replace("from '../e-verify-group1-control-v16/control.mjs'", "from './control.mjs'")
    .replace('workMs = 1740000, diagnosticStore, fixtureSetup', 'workMs = 1740000, fixtureSetup')
    .replace("let focus, controlOrigin, originDiagnostics, diagnosticStage = 'LOGIN_' + actor;", 'let focus, controlOrigin;')
    .replace('\n    await bound(async () => originDiagnostics?.close(), 7000);', '')
    .replace(/    if \(!diagnosticStore\) throw Error\('PROTECTED_ORIGIN_STORE_REQUIRED'\);\n    originDiagnostics = await attachOriginDiagnostics\([\s\S]*?\n    channel = new PrivateChannel/, '    channel = new PrivateChannel')
    .replace('lastFailedRequest, lastRejectedRequest, originEvidence: originDiagnostics?.receipt() ?? null, valuesLogged: false', 'lastFailedRequest, lastRejectedRequest, valuesLogged: false')
    .replace(/kind = value;\n        diagnosticStage = [^\n]+; \},/, 'kind = value; },')
    .replace(/\n        if \(!route.startsWith\('\/login\/'\)\) diagnosticStage = [^\n]+;/, '')
    .replace("async waitForLanding() { diagnosticStage = 'LANDING_' + actor;", 'async waitForLanding() {')
    .replace("\n        diagnosticStage = 'LOGOUT_' + actor;", '');
  assert.equal(restored, original);
});
