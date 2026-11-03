import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openNativeBrowser } from './browser.mjs';
import { verifyExecutable } from '../e-verify-group1-chrome-v15/chrome-identity.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
import { runSupervised } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { fileURLToPath } from 'node:url';
const root = new URL('./artifacts/tests-' + Date.now() + '/', import.meta.url); fs.mkdirSync(root, { recursive: true });
const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://qa.example.invalid';
const caps = { allBrowserHttpDispatchesMax: 650, supabaseAuthDispatchesMax: 40, applicationMutationDispatchesMax: 50,
  supabaseRestReadDispatchesMax: 80, turnstileHttpDispatchesMax: 40, ownerSessionRefreshRequestsMax: 6, executionSecondsMax: 3600 };
const safe = { tests: [], productionRequests: 0, thirdPartyLiveRequests: 0, officialSdkUsed: false, realProductionAuthUsed: false, headedChrome: true };
let proxy;
test.before(async () => {
  verifyExecutable(); proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
});
test.after(async () => { proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
  fs.writeFileSync(new URL('TARGETED_SAFE.json', root), JSON.stringify(safe, null, 2) + '\n', { flag: 'wx' }); console.log('SAFE_EVIDENCE=' + root.pathname); });
async function open({ actor = 'A', workMs = 30000, beforeControl, afterInstall, onStart, onFinish, onLogout, onNavigate } = {}) {
  const state = { actor, budget: new SharedBudget(caps) }, before = new Set(fs.readdirSync(os.tmpdir()).filter(x => x.startsWith('ogh-native-qa-')));
  state.browser = await openNativeBrowser({ actor, binding: { userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: actor === 'ADMIN' ? 'admin' : 'user' },
    appOrigin, supabaseOrigin, budget: state.budget, staticPaths: [], headless: false, workMs,
    transport: async () => { throw Error('NO_AUTH_OR_RLS_IN_CONTROL_TEST'); }, fixtureSetup: {
      launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' }, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
      beforeControl,
      async install(s) { Object.assign(state, s);
        const profiles = fs.readdirSync(os.tmpdir()).filter(x => x.startsWith('ogh-native-qa-') && !before.has(x)); assert.equal(profiles.length, 1);
        state.profile = path.join(fs.realpathSync(os.tmpdir()), profiles[0]);
        await s.context.route(u => u.origin === appOrigin, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><p>Offline navigation fixture</p>' }));
        await afterInstall?.(state);
      }, async start(p) { await onStart?.(p, state); }, finish: onFinish, logout: onLogout, navigate: onNavigate
    } });
  return state;
}
async function close(s) { await s.browser.close(); assert.equal(s.browser.receipt().closed, true); assert.equal(fs.existsSync(s.profile), false); }

test('six headed contexts have no blank waiting page; active A regains actual foreground and receives exactly one Start', async () => {
  const instances = [];
  try {
    for (const [i, actor] of ['A', 'B', 'ADMIN', 'A', 'A', 'A'].entries()) instances.push(await open({ actor, workMs: 60000,
      async onStart(portal, state) {
        assert.equal(state.browser.receipt().controlEvidence.windowFocused, true);
        assert.equal(await portal.getByRole('button', { name: 'Start', exact: true }).isEnabled(), true);
        await portal.screenshot({ path: new URL('active-A-control.png', root).pathname.slice(1) });
        await portal.getByRole('button', { name: 'Start', exact: true }).click();
        await portal.evaluate(() => window.qaEvent('start'));
      } }));
    for (const s of instances) {
      assert.ok((await s.p.textContent('body')).includes('Waiting for Start')); assert.equal(await s.portal.locator('#start').isVisible(), true);
      assert.equal(await s.portal.locator('#start').isDisabled(), true); assert.equal(await s.portal.locator('#finish').isDisabled(), true);
      assert.equal(s.browser.receipt().observedRequests, 0); assert.equal(s.browser.receipt().started, false);
      await assert.rejects(() => s.browser.navigate('/forbidden'), /NATIVE_NAVIGATION_SCOPE/);
    }
    instances[0].browser.permitLogin('success'); await instances[0].browser.navigate('/login/');
    const r = instances[0].browser.receipt(); assert.equal(r.started, true); assert.equal(r.controlEvidence.startEvents, 1); assert.ok(r.controlEvidence.focusChecks >= 2);
    assert.equal(r.controlEvidence.handlerReady, true); assert.equal(r.firstFailure, null); assert.equal(r.counts.supabaseAuthDispatchesMax, 0);
    assert.ok(instances.slice(1).every(s => s.browser.receipt().started === false));
    safe.tests.push({ name: 'SIX_CONTEXT_FOCUS_START', status: 'PASS', active: r.controlEvidence, productionNavigation: false });
  } finally { await Promise.all(instances.map(close)); }
});
test('owner Stop remains usable without Start and closes browser/profile', async () => {
  const s = await open(); try { await s.portal.getByRole('button', { name: 'Stop', exact: true }).click().catch(() => {});
    for (let i = 0; i < 100 && !s.browser.receipt().closed; i++) await new Promise(r => setTimeout(r, 25));
    assert.equal(s.browser.receipt().firstFailure, 'OWNER_STOP'); assert.equal(s.browser.receipt().started, false);
    safe.tests.push({ name: 'OWNER_STOP', status: 'PASS' });
  } finally { await close(s); }
});
test('no Start times out within original work bound and never navigates application', async () => {
  const s = await open({ workMs: 4500 }); try {
    s.browser.permitLogin('success'); await assert.rejects(() => s.browser.navigate('/login/'), /WORK_DEADLINE/);
    assert.equal(s.browser.receipt().started, false); assert.equal(s.browser.receipt().observedRequests, 0);
    safe.tests.push({ name: 'NO_START_DEADLINE', status: 'PASS' });
  } finally { await close(s); }
});
test('loss of registered window title fails focus before Start or application navigation', async () => {
  const s = await open({ afterInstall: async s => { await s.portal.evaluate(() => { document.title = 'Unregistered offline fixture'; }); } });
  try {
    s.browser.permitLogin('success'); await assert.rejects(() => s.browser.navigate('/login/'), /WINDOW_FOCUS_FAILURE/);
    assert.equal(s.browser.receipt().started, false); assert.equal(s.browser.receipt().observedRequests, 0);
    safe.tests.push({ name: 'FOCUS_FAIL_CLOSED', status: 'PASS' });
  } finally { await close(s); }
});
test('Finish is enabled only after local negative assertion and delivers owner event', async () => {
  const s = await open({ onStart: portal => portal.locator('#start').click(),
    afterInstall: async s => { await s.context.route(supabaseOrigin + '/auth/v1/token?grant_type=password', route => route.fulfill({ status: 400,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': appOrigin }, body: JSON.stringify({ error_code: 'captcha_failed' }) })); },
    onNavigate: async p => { await p.evaluate(async origin => { await fetch(origin + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ email: 'fixture@example.invalid', password: 'OFFLINE_FIXTURE', gotrue_meta_security: { captcha_token: 'OFFLINE_PROOF' } }) }); }, supabaseOrigin); },
    onFinish: async portal => { assert.equal(await portal.locator('#finish').isEnabled(), true); await portal.locator('#finish').click(); }
  });
  try {
    s.budget.verifyLoginPassword('A', 'OFFLINE_FIXTURE', 'success');
    s.browser.permitLogin('invalid-captcha'); await s.browser.navigate('/login/'); await s.browser.waitForNegative(5000);
    assert.equal(s.browser.receipt().ownerFinished, true); assert.equal(s.browser.receipt().controlEvidence.startEvents, 1);
    safe.tests.push({ name: 'LOCAL_FINISH_DELIVERY', status: 'PASS' });
  } finally { await close(s); }
});
test('focus/readiness remain functional after existing Node guard; supervised descendants drain', async () => {
  const result = await runSupervised({ entry: 'guard-check.mjs', cwd: fileURLToPath(new URL('.', import.meta.url)), args: [fileURLToPath(root)],
    deadlineMs: 20000, graceMs: 1000, reserveMs: 3000,
    env: Object.fromEntries(['SystemRoot', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE'].map(k => [k, process.env[k]])),
    receiptPath: fileURLToPath(new URL('GUARD_SUPERVISOR_SAFE.json', root)) });
  assert.equal(result.classification, 'EXIT_ZERO'); assert.equal(result.containment.closed, true); assert.equal(result.reaped, true);
  safe.tests.push({ name: 'NODE_GUARD_AND_JOB_CLEANUP', status: 'PASS' });
});
for (const [name, body, expected] of [
  ['missing button', '<!doctype html><p>No control buttons</p>', 'START_BUTTON_NOT_RENDERED'],
  ['script exception', '<!doctype html><button id="start">Start</button><button id="finish">Finish</button><button id="stop">Stop</button><script>throw Error("PRIVATE_ERROR_NOT_EXPORTED")</script>', 'CONTROL_PAGE_SCRIPT_FAILED'],
  ['missing event handler', '<!doctype html><button id="start">Start</button><button id="finish">Finish</button><button id="stop">Stop</button>', 'CONTROL_START_HANDLER_FAILURE']]) {
  test('fail closed before production capability: ' + name, async () => {
    const before = new Set(fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('ogh-native-qa-'))), started = Date.now();
    await assert.rejects(() => open({ beforeControl: async ({ context, controlOrigin }) => {
      await context.route(controlOrigin + '/control', route => route.fulfill({ status: 200, contentType: 'text/html', body }));
    } }), new RegExp(expected));
    assert.ok(Date.now() - started < 15000); assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('ogh-native-qa-') && !before.has(n)), []);
    safe.tests.push({ name: name.toUpperCase().replaceAll(' ', '_'), status: 'PASS', failureCode: expected });
  });
}
