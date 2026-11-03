import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import { runSupervised, waitForStart } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { createProfile, cleanupProfile } from '../e-verify-native-manual/profile.mjs';
const cwd = path.dirname(fileURLToPath(import.meta.url));

if (process.argv[2] === '--offline-child') {
  await waitForStart();
  const servers = [], profile = createProfile();
  let shell, context, page, directHttp = 0, directAuthPosts = 0, directWebSocket = 0, httpIntercepted = 0, socketIntercepted = 0, proxyDenied = 0;
  const listen = async server => { servers.push(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + server.address().port; };
  const endpoint = http.createServer((q, r) => {
    directHttp++;
    if (q.method === 'POST' && q.url === '/auth/v1/token?grant_type=password') directAuthPosts++;
    r.writeHead(403, { 'access-control-allow-origin': '*' }); r.end();
  });
  endpoint.on('upgrade', (q, socket) => { directWebSocket++; socket.on('error', () => {}); socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); });
  const authFixture = await listen(endpoint);
  const app = await listen(http.createServer((q, r) => {
    if (q.url === '/fixture') { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><link rel="icon" href="data:,"><p>Offline Auth egress probe, no credentials</p>'); return; }
    if (q.url === '/worker.js' || q.url === '/shared.js') {
      r.writeHead(200, { 'content-type': 'application/javascript' });
      const body = `async function probe(p){
        const post=await fetch(${JSON.stringify(authFixture + '/auth/v1/token?grant_type=password')},{method:'POST',body:'NO_CREDENTIAL_FIXTURE'}).then(()=>false,()=>true);
        const ws=await new Promise(resolve=>{const s=new WebSocket(${JSON.stringify(authFixture.replace('http:', 'ws:') + '/auth/v1/user')});
          const timer=setTimeout(()=>{s.close();resolve('TIMEOUT')},1000);s.onerror=()=>{clearTimeout(timer);resolve('CLOSED')};s.onopen=()=>{clearTimeout(timer);s.close();resolve('OPEN')};});
        p.postMessage({postStopped:post,webSocketOutcome:ws});}
      `;
      r.end(body + (q.url === '/shared.js' ? 'onconnect=e=>{const p=e.ports[0];p.start();probe(p)};' : 'probe(self);')); return;
    }
    r.writeHead(404); r.end();
  }));
  const proxy = http.createServer((q, r) => { proxyDenied++; r.writeHead(403); r.end(); });
  proxy.on('connect', (q, s) => { proxyDenied++; s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  const proxyOrigin = await listen(proxy);
  let dedicated, shared, profileRemoved = false;
  try {
    shell = await chromium.launchPersistentContext(profile, { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
      proxy: { server: proxyOrigin, bypass: '127.0.0.1' }, args: ['--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync',
        '--no-first-run', '--no-default-browser-check', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
    context = await shell.browser().newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    // This is a deny-all oracle stronger than the proposed finite Auth route gate.
    // A native request reaching the fixture despite it is evidence against HARD.
    await context.route(url => url.origin === authFixture, route => { httpIntercepted++; return route.abort(); });
    await context.routeWebSocket(url => url.hostname === '127.0.0.1', socket => { socketIntercepted++; socket.close(); });
    page = await context.newPage(); await page.goto(app + '/fixture');
    const mainStopped = await page.evaluate(async origin => {
      const stopped = await fetch(origin + '/auth/v1/token?grant_type=password', { method: 'POST', body: 'NO_CREDENTIAL_FIXTURE' }).then(() => false, () => true);
      await new Promise(resolve => { const s = new WebSocket(origin.replace('http:', 'ws:') + '/auth/v1/user'); const timer = setTimeout(() => { s.close(); resolve(); }, 1000);
        s.onerror = () => { clearTimeout(timer); resolve(); }; s.onclose = () => { clearTimeout(timer); resolve(); }; });
      return stopped;
    }, authFixture);
    dedicated = await page.evaluate(() => new Promise(resolve => {
      const w = new Worker('/worker.js'), timer = setTimeout(() => { w.terminate(); resolve({ timeout: true }); }, 3000);
      w.onmessage = e => { clearTimeout(timer); w.terminate(); resolve(e.data); }; w.onerror = e => { e.preventDefault(); clearTimeout(timer); w.terminate(); resolve({ error: true }); };
    }));
    shared = await page.evaluate(() => new Promise(resolve => {
      const w = new SharedWorker('/shared.js'), p = w.port, timer = setTimeout(() => { p.close(); resolve({ timeout: true }); }, 3000);
      p.start(); p.onmessage = e => { clearTimeout(timer); p.close(); resolve(e.data); }; w.onerror = e => { e.preventDefault(); clearTimeout(timer); p.close(); resolve({ error: true }); };
    }));
    if (!mainStopped) throw Error('MAIN_FETCH_DENIAL_FAILED');
  } finally {
    await context?.close(); await shell?.browser()?.close();
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    profileRemoved = cleanupProfile(profile);
  }
  const result = { format: 'group1-native-auth-outlet-probe-offline-v1', fixtureOnly: true, credentialsUsed: false,
    actualChrome: true, serviceWorkersBlocked: true, nativeWorkerGlobalsUntouched: true, denyAllHttpInstalled: true, socketRouteInstalled: true,
    httpIntercepted, socketIntercepted, directHttp, directAuthPosts, directWebSocket, dedicated, shared, profileRemoved, proxyDenied,
    authBypassPrevention: directHttp || directWebSocket || dedicated?.timeout || shared?.timeout || dedicated?.error || shared?.error ? 'BLOCKED' : 'OBSERVED_FIXTURE_COVERAGE_ONLY_NOT_GENERAL_PROOF',
    rawValuesLogged: false, productionRequests: 0, productionWrites: 0, thirdPartyLiveRequests: 0 };
  fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  await new Promise(resolve => process.send({ type: 'receipt', status: 'complete' }, resolve)); process.disconnect();
} else {
  test('actual offline standard Chrome: deny-all Auth outlet plus native Worker/SharedWorker channels', { timeout: 35000 }, async () => {
    const out = path.join(cwd, 'artifacts', 'auth-outlet-' + Date.now()); fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, 'BYPASS_PROBE_SAFE.json');
    const supervisor = await runSupervised({ entry: 'browser-bypass.test.mjs', args: ['--offline-child', file], cwd,
      deadlineMs: 30000, graceMs: 3000, reserveMs: 5000, receiptPath: path.join(out, 'SUPERVISOR_SAFE.json'),
      env: Object.fromEntries(['SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
    assert.equal(supervisor.classification, 'EXIT_ZERO'); assert.equal(supervisor.containment.closed, true); assert.equal(supervisor.reaped, true);
    const r = JSON.parse(fs.readFileSync(file)); assert.equal(r.profileRemoved, true); assert.equal(r.credentialsUsed, false);
    assert.equal(r.productionRequests, 0); assert.equal(r.thirdPartyLiveRequests, 0);
    console.log('AUTH_OUTLET_PROBE=' + JSON.stringify({ file, httpIntercepted: r.httpIntercepted, socketIntercepted: r.socketIntercepted,
      directHttp: r.directHttp, directAuthPosts: r.directAuthPosts, directWebSocket: r.directWebSocket, authBypassPrevention: r.authBypassPrevention, dedicated: r.dedicated, shared: r.shared }));
  });
}
