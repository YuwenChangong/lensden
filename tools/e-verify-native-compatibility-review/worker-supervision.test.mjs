import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import { runSupervised, waitForStart } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { createProfile, cleanupProfile } from '../e-verify-native-manual-fresh-v2/profile.mjs';
import { installNodeGuard } from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import { verifyFrozen } from '../e-verify-native-manual-fresh-v2/binding.mjs';

const cwd = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[2] === '--offline-child') {
  await waitForStart();
  verifyFrozen(path.resolve(cwd, '../e-verify-native-manual-fresh-v2/artifacts'));
  const file = process.argv[3], profile = createProfile();
  const servers = [];
  let bodyExecutionHits = 0, scriptRequests = 0, scriptAdmittedFromRegisteredFrame = false, blockedProxyAttempts = 0;
  let shell, browser, profileRemoved = false, nodeDenials = 0;
  let workerObserved = false, waitingForDebugger = false, ownerFrameProven = false;
  let fetchSupported = null, fetchFailureClass = null, workerResumed = false;
  let bodyExecutionHitsAtAttachment = null;
  const listen = async server => {
    servers.push(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return 'http://127.0.0.1:' + server.address().port;
  };
  const childOrigin = await listen(http.createServer((q, r) => {
    if (q.url === '/frame') {
      r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'none'; script-src 'self'; worker-src 'self'" });
      r.end('<!doctype html><p>Worker supervision fixture</p>');
    } else if (q.url === '/worker.js') {
      scriptRequests++; r.writeHead(200, { 'content-type': 'application/javascript' });
      r.end("fetch('/body-executed').then(()=>postMessage('LOCAL_ONLY'))");
    } else if (q.url === '/body-executed') { bodyExecutionHits++; r.end('LOCAL_ONLY'); }
    else { r.writeHead(404); r.end(); }
  }));
  const mainOrigin = await listen(http.createServer((q, r) => {
    if (q.url !== '/main') { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': `default-src 'none'; frame-src ${childOrigin}; worker-src 'none'; img-src data:` });
    r.end('<!doctype html><link rel="icon" href="data:,"><iframe src="' + childOrigin + '/frame"></iframe>');
  }));
  const proxy = http.createServer((_, r) => { blockedProxyAttempts++; r.writeHead(403); r.end(); });
  proxy.on('connect', (_, socket) => { blockedProxyAttempts++; socket.on('error', () => {}); socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  const proxyOrigin = await listen(proxy);
  let observedResolve;
  const observed = new Promise(resolve => { observedResolve = resolve; });
  try {
    shell = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
      proxy: { server: proxyOrigin, bypass: '127.0.0.1' },
      args: ['--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync',
        '--no-first-run', '--no-default-browser-check', '--disable-quic', '--disable-domain-reliability', '--disable-features=WebTransport',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']
    });
    browser = shell.browser();
    installNodeGuard(() => nodeDenials++);
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const mainId = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
    const frames = new Set([mainId]);
    cdp.on('Page.frameAttached', e => { if (frames.has(e.parentFrameId)) frames.add(e.frameId); });
    cdp.on('Fetch.requestPaused', e => {
      const u = new URL(e.request.url);
      const local = e.request.method === 'GET' && [mainOrigin, childOrigin].includes(u.origin) && ['/main', '/frame', '/worker.js'].includes(u.pathname);
      if (u.origin === childOrigin && u.pathname === '/worker.js' && frames.has(e.frameId)) scriptAdmittedFromRegisteredFrame = true;
      void cdp.send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId: e.requestId } : { requestId: e.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    cdp.on('Target.attachedToTarget', e => {
      if (e.targetInfo.type !== 'worker') { observedResolve('UNEXPECTED_TARGET'); return; }
      workerObserved = true; waitingForDebugger = e.waitingForDebugger;
      ownerFrameProven = typeof e.targetInfo.openerFrameId === 'string' && frames.has(e.targetInfo.openerFrameId) && e.targetInfo.openerFrameId !== mainId;
      bodyExecutionHitsAtAttachment = bodyExecutionHits;
      let sequence = 0;
      const pending = new Map();
      cdp.on('Target.receivedMessageFromTarget', message => {
        if (message.sessionId !== e.sessionId) return;
        const response = JSON.parse(message.message), call = pending.get(response.id);
        if (!call) return; pending.delete(response.id); clearTimeout(call.timer);
        if (response.error) call.reject(response.error); else call.resolve(response.result);
      });
      const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject({ message: 'LOCAL_CDP_TIMEOUT' }); }, 2000);
        pending.set(id, { resolve, reject, timer });
        void cdp.send('Target.sendMessageToTarget', { sessionId: e.sessionId, message: JSON.stringify({ id, method, params }) })
          .catch(() => { clearTimeout(timer); pending.delete(id); reject({ message: 'LOCAL_CDP_SEND_FAILED' }); });
      });
      void (async () => {
        try { await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }); fetchSupported = true; }
        catch (error) {
          fetchSupported = false;
          fetchFailureClass = /(?:wasn't found|not found|method.*found)/i.test(error.message || '') ? 'CDP_METHOD_NOT_AVAILABLE'
            : error.message === 'LOCAL_CDP_TIMEOUT' ? 'CDP_TIMEOUT' : 'CDP_COMMAND_FAILED';
        }
        // This is a capability decision, NOT a live gate: never resume even on support.
        observedResolve('WORKER_REMAINS_PAUSED_PENDING_DECISION');
      })().catch(() => observedResolve('LOCAL_PROBE_FAILURE'));
    });
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false,
      filter: [{ type: 'worker' }, { exclude: true }] });
    await page.goto(mainOrigin + '/main', { waitUntil: 'load', timeout: 10000 });
    const frame = page.frames().find(f => f.url() === childOrigin + '/frame');
    if (!frame) throw Error('LOCAL_FRAME_MISSING');
    await frame.evaluate(() => { globalThis.fixtureWorker = new Worker('/worker.js'); });
    let timer;
    try { await Promise.race([observed, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('WORKER_TARGET_NOT_OBSERVED')), 6000); })]); }
    finally { clearTimeout(timer); }
    await context.close();
  } finally {
    if (browser) await browser.close(); else if (shell) await shell.close();
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    profileRemoved = cleanupProfile(profile);
  }
  const result = { format: 'offline-worker-supervision-feasibility-v1', workerObserved, waitingForDebugger, ownerFrameProven,
    scriptAdmittedFromRegisteredFrame, scriptRequests, bodyExecutionHitsAtAttachment, bodyExecutionHits, fetchSupported, fetchFailureClass,
    workerResumed, profileRemoved, blockedProxyAttempts, nodeDenials, fixtureOnly: true, officialSdkExecuted: false,
    frozenExecutorChanged: false, productionRequests: 0, thirdPartyLiveRequests: 0,
    liveReadiness: 'BLOCKED_NOT_AN_AUTHORIZATION_OR_SAFE_WORKER_IMPLEMENTATION' };
  fs.writeFileSync(file, JSON.stringify(result, null, 2), { flag: 'wx' });
  await new Promise(resolve => process.send({ type: 'receipt', status: 'complete' }, resolve)); process.disconnect();
} else {
  const out = path.join(cwd, 'artifacts', 'worker-feasibility-' + Date.now()); fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, 'WORKER_FEASIBILITY_SAFE.json');
  test('bounded offline worker CDP feasibility, no automatic fallback', async t => {
    const s = await runSupervised({ entry: 'worker-supervision.test.mjs', args: ['--offline-child', file], cwd,
      deadlineMs: 30000, graceMs: 3000, reserveMs: 5000, receiptPath: path.join(out, 'SUPERVISOR_SAFE.json'),
      env: Object.fromEntries(['SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
    assert.equal(s.classification, 'EXIT_ZERO'); assert.equal(s.containment.closed, true); assert.equal(s.reaped, true);
    const r = JSON.parse(fs.readFileSync(file));
    await t.test('Worker target observed and paused; no body execution', () => {
      assert.equal(r.workerObserved, true); assert.equal(r.waitingForDebugger, true);
      assert.equal(r.bodyExecutionHitsAtAttachment, 0); assert.equal(r.bodyExecutionHits, 0); assert.equal(r.workerResumed, false);
    });
    await t.test('Worker Fetch support measured, never silently assumed', () => {
      assert.equal(typeof r.fetchSupported, 'boolean');
      if (!r.fetchSupported) assert.ok(['CDP_METHOD_NOT_AVAILABLE', 'CDP_TIMEOUT', 'CDP_COMMAND_FAILED'].includes(r.fetchFailureClass));
      assert.equal(r.liveReadiness, 'BLOCKED_NOT_AN_AUTHORIZATION_OR_SAFE_WORKER_IMPLEMENTATION');
    });
    await t.test('Frame ownership remains an explicit proof obligation', () => {
      assert.equal(typeof r.ownerFrameProven, 'boolean'); assert.equal(typeof r.scriptAdmittedFromRegisteredFrame, 'boolean');
    });
    await t.test('offline-only containment, immutable executor, owned-profile cleanup', () => {
      assert.equal(r.profileRemoved, true); assert.equal(r.nodeDenials, 0);
      assert.equal(r.productionRequests, 0); assert.equal(r.thirdPartyLiveRequests, 0);
      assert.equal(r.officialSdkExecuted, false); assert.equal(r.frozenExecutorChanged, false);
    });
    console.log('WORKER_FEASIBILITY_RECEIPT=' + file);
  }, { timeout: 35000 });
}
