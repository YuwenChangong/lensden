import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openNativeBrowser } from '../e-verify-group1-manual-auth/browser.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
import { classifyObserved } from '../e-verify-group1-manual-auth/monitor.mjs';
import { pinnedOpen } from './chrome-identity.mjs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(chrome)).digest('hex');
const expectedHash = 'fdd156b74dd997d3b15f0cdbb59ce0051f1e8b19d10822f31743abac09ec4c89';
const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://qa.example.invalid';
const caps = { allBrowserHttpDispatchesMax: 650, supabaseAuthDispatchesMax: 40, applicationMutationDispatchesMax: 50,
  ownerSessionRefreshRequestsMax: 6, supabaseRestReadDispatchesMax: 80, turnstileHttpDispatchesMax: 40, executionSecondsMax: 3600 };
const results = [];
test('identity mismatch prevents even opening a browser', async () => {
  let opened = false;
  await assert.rejects(() => pinnedOpen(async () => { opened = true; }, chrome, '0'.repeat(64)), /CHROME_IDENTITY_DRIFT/);
  assert.equal(opened, false);
});
test('identity change across launch closes the newly opened browser', async () => {
  const file = new URL('./artifacts/identity-fixture-' + Date.now() + '.bin', import.meta.url);
  fs.mkdirSync(new URL('./artifacts/', import.meta.url), { recursive: true });
  fs.writeFileSync(file, 'BEFORE', { flag: 'wx' });
  const expected = crypto.createHash('sha256').update('BEFORE').digest('hex'); let closed = false;
  await assert.rejects(() => pinnedOpen(async () => {
    fs.writeFileSync(file, 'AFTER'); return { close: async () => { closed = true; } };
  }, file, expected), /CHROME_IDENTITY_DRIFT/);
  assert.equal(closed, true);
});
async function open(workMs = 15000) {
  assert.equal(hash(), expectedHash);
  const oldProfiles = new Set(fs.readdirSync(os.tmpdir()).filter(x => x.startsWith('ogh-native-qa-')));
  const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  let context, p, portal, profile, paths, version;
  const budget = new SharedBudget(caps);
  let browser;
  try {
    browser = await openNativeBrowser({ actor: 'A', binding: { userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user' },
      appOrigin, supabaseOrigin, caps, budget, staticPaths: [], headless: true, workMs,
      transport: async () => { throw Error('NO_NODE_NETWORK_ALLOWED'); }, fixtureSetup: {
        launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' }, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
        async install(state) {
          ({ context, p, portal } = state);
          const cdp = await context.browser().newBrowserCDPSession();
          version = (await cdp.send('Browser.getVersion')).product;
          const profiles = fs.readdirSync(os.tmpdir()).filter(x => x.startsWith('ogh-native-qa-') && !oldProfiles.has(x));
          assert.equal(profiles.length, 1); profile = path.join(fs.realpathSync(os.tmpdir()), profiles[0]);
          const probe = spawnSync('powershell', ['-NoProfile', '-Command', "$p='" + profile.replaceAll("'", "''") + "'; @(Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($p)} | ForEach-Object {[pscustomobject]@{path=$_.ExecutablePath;browserProcess=[bool]($_.CommandLine -notmatch '--type=');extensionsDisabled=$_.CommandLine.Contains('--disable-extensions');syncDisabled=$_.CommandLine.Contains('--disable-sync');unsafeFlags=[bool]($_.CommandLine -match 'disable-web-security|ignore-certificate-errors')}}) | ConvertTo-Json -Compress"], { encoding: 'utf8', windowsHide: true });
          assert.equal(probe.status, 0); let processes = JSON.parse(probe.stdout); processes = Array.isArray(processes) ? processes : [processes];
          assert.ok(processes.every(x => !x.unsafeFlags));
          assert.equal(processes.filter(x => x.browserProcess && x.extensionsDisabled && x.syncDisabled).length, 1);
          paths = [...new Set(processes.map(x => x.path))];
          assert.ok(paths.length > 0); assert.ok(paths.every(x => path.resolve(x).toLowerCase() === path.resolve(chrome).toLowerCase()));
          assert.ok(version.endsWith('Chrome/156.0.8078.36'));
          assert.deepEqual(await context.cookies(), []);
          assert.equal(await p.evaluate(() => typeof Worker === 'function' && typeof SharedWorker === 'function'), true);
          assert.equal(await p.evaluate(() => Object.keys(localStorage).length).catch(() => 0), 0);
          await context.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><p>Offline identity fixture</p>' }));
          await cdp.detach();
        }, async start(page) { await page.getByRole('button', { name: 'Start', exact: true }).click(); }
      } });
  } catch (error) { proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); throw error; }
  return { browser, budget, p, portal, profile, version, paths, async close() {
    await browser.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
    assert.equal(fs.existsSync(profile), false); assert.equal(hash(), expectedHash);
    results.push({ version, actualExecutable: paths[0], profileDeleted: true, receipt: browser.receipt(), chromeHashStable: true });
  } };
}

test('changed signed Chrome starts through unchanged v14 adapter with isolation and original budget semantics', async () => {
  const q = await open();
  try {
    q.browser.permitLogin('success'); await q.browser.navigate('/login/');
    assert.equal(q.browser.receipt().started, true); assert.equal(q.browser.receipt().firstFailure, null);
    assert.equal(await q.p.evaluate(() => typeof Worker), 'function');
    assert.equal(await q.p.evaluate(() => typeof SharedWorker), 'function');
    assert.throws(() => classifyObserved({ url: appOrigin + '/unapproved', method: 'GET', appOrigin, supabaseOrigin, staticPaths: [] }));
    const b = new SharedBudget(caps); for (let i = 0; i < 650; i++) b.reserve(['allBrowserHttpDispatchesMax']);
    assert.throws(() => b.reserve(['allBrowserHttpDispatchesMax']), /BUDGET_EXCEEDED/);
    assert.equal(b.receipt().allBrowserHttpDispatchesMax, 650);
  } finally { await q.close(); }
});
test('new Chrome still observes forbidden request and stops without claiming native pre-dispatch prevention', async () => {
  const q = await open();
  try {
    await q.p.goto(appOrigin + '/unapproved').catch(() => {});
    for (let i = 0; i < 100 && !q.browser.receipt().firstFailure; i++) await new Promise(r => setTimeout(r, 20));
    assert.equal(q.browser.receipt().firstFailure, 'OBSERVED_UNAPPROVED_REQUEST');
    assert.equal(q.browser.receipt().diagnostics.lastRejectedRequest.admissionBoundary, 'OBSERVATION_ONLY');
    assert.ok(!JSON.stringify(q.browser.receipt()).includes('fixture@example.invalid'));
  } finally { await q.close(); }
});
test('new Chrome work deadline closes browser and owned profile without an owner Start', async () => {
  const q = await open(3000);
  try {
    for (let i = 0; i < 200 && !q.browser.receipt().closed; i++) await new Promise(r => setTimeout(r, 25));
    assert.equal(q.browser.receipt().firstFailure, 'WORK_DEADLINE');
    assert.equal(q.browser.receipt().started, false); assert.equal(q.browser.receipt().closed, true);
  } finally { await q.close(); }
});
test.after(() => {
  fs.mkdirSync(new URL('./artifacts/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('./artifacts/CHROME_TARGETED_SAFE_' + Date.now() + '.json', import.meta.url), JSON.stringify({ results, expectedHash,
    localFixturesOnly: true, nativeBoundary: 'MONITOR_ONLY', productionRequests: 0, thirdPartyLiveRequests: 0 }, null, 2) + '\n', { flag: 'wx' });
});
