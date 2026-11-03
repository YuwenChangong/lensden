import fs from 'node:fs';
import http from 'node:http';
import { parse } from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/acorn/dist/acorn.mjs';
import { chromium } from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import { waitForStart } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { installNodeGuard } from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import { createProfile, cleanupProfile } from '../e-verify-native-manual-fresh-v2/profile.mjs';
import { verifyFrozen } from '../e-verify-native-manual-fresh-v2/binding.mjs';
import { sha } from '../e-verify-native-manual-fresh-v2/authorization.mjs';
import { harness } from '../e-verify-native-manual-fresh-v2/harness.mjs';
import { NativeScope } from '../e-verify-native-manual-fresh-v2/scope.mjs';

await waitForStart();
const file = process.argv[2];
const frozen = verifyFrozen(new URL('../e-verify-native-manual-fresh-v2/artifacts/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const source = fs.readFileSync(new URL('../e-verify-native-manual-fresh-v2/native-browser.mjs', import.meta.url), 'utf8');
const calls = [];
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression') calls.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
const called = (owner, name) => calls.filter(n => n.callee.type === 'MemberExpression' && n.callee.object.name === owner && n.callee.property.name === name);
const init = called('context', 'addInitScript');
const launch = called('chromium', 'launchPersistentContext');
if (init.length !== 1 || launch.length !== 1) throw Error('SOURCE_SHAPE_CHANGED');
const callback = init[0].arguments[0];
const actualInit = source.slice(callback.start, callback.end);
const args = launch[0].arguments[1].properties.find(p => p.key?.name === 'args').value.elements
  .filter(n => n.type === 'Literal').map(n => n.value);
const disabled = ['Worker', 'SharedWorker', 'EventSource', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport'];
let proxyHits = 0, deniedPageRequests = 0, nodeDenials = 0;
let workerFetchHits = 0, workerScriptHits = 0;
const servers = [];
const listen = async server => {
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
};
const frameServer = http.createServer((q, r) => {
  if (q.url === '/frame') {
    r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'none'; script-src 'self'; worker-src 'self'", 'cache-control': 'no-store' });
    r.end('<!doctype html><link rel="icon" href="data:,"><p>Local capability fixture only</p>');
  } else if (q.url === '/worker.js') {
    workerScriptHits++;
    r.writeHead(200, { 'content-type': 'application/javascript', 'content-security-policy': "default-src 'none'; connect-src 'self'" });
    r.end("fetch('/worker-fetch').then(r=>r.text()).then(()=>postMessage('LOCAL_WORKER_OK')).catch(()=>postMessage('LOCAL_WORKER_FAILED'))");
  } else if (q.url === '/worker-fetch') {
    workerFetchHits++;
    r.writeHead(200, { 'content-type': 'text/plain' }); r.end('LOCAL_ONLY');
  } else { r.writeHead(404); r.end(); }
});
const frameOrigin = await listen(frameServer);
const mainServer = http.createServer((q, r) => {
  if (q.url === '/main') {
    r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': `default-src 'none'; frame-src ${frameOrigin}; worker-src 'none'; img-src data:` });
    r.end('<!doctype html><link rel="icon" href="data:,"><iframe src="' + frameOrigin + '/frame"></iframe>');
  } else { r.writeHead(404); r.end(); }
});
const mainOrigin = await listen(mainServer);
const proxy = http.createServer((_, r) => { proxyHits++; r.writeHead(403); r.end(); });
proxy.on('connect', (_, socket) => {
  proxyHits++; socket.on('error', () => {});
  socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
});
const proxyOrigin = await listen(proxy);
const profile = createProfile();
let browser, shell;
const observations = [];
let profileRemoved = false;
try {
  shell = await chromium.launchPersistentContext(profile, {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    proxy: { server: proxyOrigin, bypass: '127.0.0.1' },
    args: [...args, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']
  });
  browser = shell.browser();
  installNodeGuard(() => nodeDenials++);
  for (const mode of ['native-api-baseline', 'frozen-api-removal', 'worker-only-local-experiment']) {
    const before = workerFetchHits;
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    let pageFetchWorkerEvents = 0, workerTargets = 0;
    const workerFetchClassifications = [];
    await context.routeWebSocket('**/*', socket => socket.close());
    if (mode === 'frozen-api-removal') await context.addInitScript({ content: '(' + actualInit + ')()' });
    if (mode === 'worker-only-local-experiment') await context.addInitScript(keys => {
      for (const key of keys) if (key !== 'Worker') Object.defineProperty(globalThis, key, { value: undefined, writable: false, configurable: false });
    }, disabled);
    const page = await context.newPage();
    page.on('worker', () => workerTargets++);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const mainId = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
    const frames = new Set([mainId]);
    const scope = new NativeScope(mainOrigin, { fixtureOrigin: frameOrigin });
    scope.register('main', null);
    // State for classification only: this does not fetch or execute a vendor SDK.
    scope.admit({ url: frameOrigin + '/fixture/sdk.js', method: 'GET', type: 'Script', frame: 'main', id: 'local-classification-bootstrap' });
    cdp.on('Page.frameAttached', e => {
      if (frames.has(e.parentFrameId)) {
        frames.add(e.frameId);
        scope.register(e.frameId, e.parentFrameId === mainId ? 'main' : e.parentFrameId);
      }
    });
    cdp.on('Fetch.requestPaused', e => {
      const u = new URL(e.request.url);
      if (![mainOrigin, frameOrigin].includes(u.origin) || !['/main', '/frame', '/worker.js', '/worker-fetch'].includes(u.pathname)) {
        deniedPageRequests++;
        void cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'BlockedByClient' });
        return;
      }
      if (u.pathname === '/worker-fetch') {
        pageFetchWorkerEvents++;
        let classification;
        try {
          classification = scope.admit({ url: e.request.url, method: e.request.method, type: e.resourceType,
            frame: e.frameId === mainId ? 'main' : frames.has(e.frameId) ? e.frameId : undefined, headers: e.request.headers, id: e.requestId });
        } catch (error) { classification = /^[A-Z_]+$/.test(error.message) ? error.message : 'CLASSIFICATION_UNKNOWN'; }
        workerFetchClassifications.push({ type: e.resourceType, frameRegistered: frames.has(e.frameId), classification });
      }
      void cdp.send('Fetch.continueRequest', { requestId: e.requestId });
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await page.goto(mainOrigin + '/main', { waitUntil: 'load', timeout: 10000 });
    const frame = page.frames().find(f => f.url() === frameOrigin + '/frame');
    if (!frame) throw Error('LOCAL_FRAME_MISSING');
    const capability = () => Object.fromEntries(['Worker', 'SharedWorker', 'EventSource', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport'].map(k => [k, {
      available: typeof globalThis[k] === 'function',
      writable: Object.getOwnPropertyDescriptor(globalThis, k)?.writable === true,
      configurable: Object.getOwnPropertyDescriptor(globalThis, k)?.configurable === true
    }]));
    const main = await page.evaluate(capability), child = await frame.evaluate(capability);
    const compute = () => new Promise(resolve => {
      if (typeof Worker !== 'function') { resolve('CONSTRUCTOR_UNAVAILABLE'); return; }
      let worker;
      const finish = value => { clearTimeout(timer); worker?.terminate(); resolve(value); };
      const timer = setTimeout(() => finish('LOCAL_WORKER_TIMEOUT'), 2000);
      try {
        worker = new Worker('/worker.js');
        worker.onmessage = e => finish(e.data === 'LOCAL_WORKER_OK' ? 'LOCAL_WORKER_OK' : 'LOCAL_WORKER_FAILED');
        worker.onerror = e => { e.preventDefault(); finish('WORKER_BLOCKED'); };
      } catch { finish('WORKER_BLOCKED'); }
    });
    const mainWorker = await page.evaluate(compute), childWorker = await frame.evaluate(compute);
    observations.push({ mode, main, child, mainWorker, childWorker, workerTargets,
      workerFetchHits: workerFetchHits - before, pageFetchWorkerEvents, workerFetchClassifications });
    await context.close();
  }
} finally {
  if (browser) await browser.close(); else if (shell) await shell.close();
  for (const server of servers) {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  profileRemoved = cleanupProfile(profile);
}
const csp = harness({ nonce: 'a'.repeat(32) }).headers['content-security-policy'];
const result = {
  format: 'native-compatibility-offline-capabilities-v1',
  observations, actualSourceSha256: sha(source), frozenBindingSha256: frozen.bindingHash,
  launchFlagsReused: true, serviceWorkersBlockedInAllModes: true,
  actualHarnessWorkerSrcNone: csp.includes("worker-src 'none'"),
  actualAutoAttachExcludesWorkerTargets: source.includes("filter:[{type:'iframe'},{exclude:true}]"),
  proxyRejectOnly: true, nonLoopbackDnsDisabled: true, deniedPageRequests, blockedProxyAttempts: proxyHits,
  nodeDenials, workerScriptHits, workerFetchHits, profileRemoved,
  officialSdkExecuted: false, productionRequests: 0, thirdPartyLiveRequests: 0,
  accountInputsUsed: false, frozenConfigurationChanged: false,
  noVendorRootCauseClaim: true, fixtureOnly: true
};
fs.writeFileSync(file, JSON.stringify(result, null, 2), { flag: 'wx' });
await new Promise(resolve => process.send({ type: 'receipt', status: 'complete' }, resolve));
process.disconnect();
