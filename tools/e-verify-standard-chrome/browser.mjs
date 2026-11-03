import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { chromium } from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import { installNodeGuard } from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import { createProfile, assertNewProfile, cleanupProfile } from '../e-verify-native-manual/profile.mjs';
import { Observation } from './observation.mjs';
import { harness } from './harness.mjs';

const bounded = async (promise, ms) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('CLEANUP_TIMEOUT')), ms); })]); }
  finally { clearTimeout(timer); }
};
export async function runStandard({ profilePath, fixtureOrigin, offlineProxy, fixtureOwner, workMs = 520000 } = {}) {
  if ((fixtureOrigin || offlineProxy || fixtureOwner) && !(fixtureOrigin && offlineProxy && fixtureOwner)) throw Error('COMPLETE_OFFLINE_FIXTURE_REQUIRED');
  if (offlineProxy) {
    const u = new URL(offlineProxy);
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || u.origin !== offlineProxy) throw Error('OFFLINE_PROXY_LOOPBACK_REQUIRED');
  }
  const content = harness({ nonce: randomBytes(16).toString('hex'), fixtureOrigin });
  const profile = assertNewProfile(profilePath || createProfile());
  const evidence = new Observation({ fixtureOrigin }), vendor = fixtureOrigin || 'https://challenges.cloudflare.com';
  let server, shell, browser, context, page, local, closing = false, profileRemoved = false, observedWorkers = 0;
  let capabilityBooleans = null;
  const seenFrames = new Set();
  const stop = code => { if (!closing) evidence.stop(code); };
  const allowedObserved = value => {
    try {
      const u = new URL(value);
      if (value === 'about:blank' || value.startsWith('data:,')) return true;
      if (u.username || u.password) return false;
      if (u.origin === vendor) return true;
      return u.origin === local && u.pathname === '/turnstile-native-qa' && !u.search;
    } catch { return false; }
  };
  const timer = setTimeout(() => stop('WORK_DEADLINE'), workMs);
  try {
    server = http.createServer((q, r) => {
      if (q.method !== 'GET' || q.url !== '/turnstile-native-qa') { r.writeHead(404); r.end(); return; }
      r.writeHead(200, content.headers); r.end(content.body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); local = 'http://127.0.0.1:' + server.address().port;
    shell = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: !!fixtureOrigin,
      ...(offlineProxy ? { proxy: { server: offlineProxy, bypass: '127.0.0.1' } } : {}),
      args: ['--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync',
        '--no-first-run', '--no-default-browser-check', ...(offlineProxy ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] : [])]
    });
    browser = shell.browser();
    context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    if ((await context.cookies()).length) throw Error('EXISTING_COOKIE_STATE');
    // Native capability globals are untouched. Worker traffic is NOT intercepted.
    await context.exposeBinding('qaEvent', (source, name) => {
      if (closing) return;
      if (source.page !== page || source.frame !== page.mainFrame() || typeof name !== 'string') { stop('STATUS_SOURCE_INVALID'); return; }
      evidence.event(name);
    });
    page = await context.newPage();
    for (const p of shell.pages()) await p.close();
    context.on('page', p => { if (p !== page) { stop('POPUP_OBSERVED'); void p.close().catch(() => {}); } });
    context.on('serviceworker', () => stop('SERVICE_WORKER_OBSERVED'));
    page.on('request', request => {
      if (closing) return;
      evidence.request({ url: request.url() });
      if (!allowedObserved(request.url())) stop('OBSERVED_UNKNOWN_ORIGIN');
      else if (new URL(request.url()).pathname === '/turnstile/v0/siteverify') stop('OBSERVED_FORBIDDEN_BUSINESS_ROUTE');
    });
    page.on('response', response => { if (!closing) evidence.response({ url: response.url(), status: response.status() }); });
    page.on('requestfailed', () => stop('OBSERVED_NETWORK_ERROR'));
    page.on('framenavigated', frame => {
      if (closing) return;
      if (!allowedObserved(frame.url())) { stop('OBSERVED_UNKNOWN_FRAME'); return; }
      if (frame !== page.mainFrame() && new URL(frame.url()).origin === vendor && !seenFrames.has(frame)) { seenFrames.add(frame); evidence.frame(); }
      if (frame === page.mainFrame() && frame.url() !== local + '/turnstile-native-qa') stop('MAIN_NAVIGATION_OBSERVED');
    });
    page.on('worker', worker => { observedWorkers++; if (!allowedObserved(worker.url())) stop('OBSERVED_UNKNOWN_WORKER'); });
    page.on('websocket', socket => { if (!allowedObserved(socket.url())) stop('OBSERVED_UNKNOWN_WEBSOCKET'); });
    page.on('pageerror', () => { evidence.error(); stop('PAGE_ERROR'); });
    page.on('download', () => stop('DOWNLOAD_OBSERVED'));
    page.on('dialog', dialog => { stop('DIALOG_OBSERVED'); void dialog.dismiss().catch(() => {}); });
    installNodeGuard(() => stop('INDEPENDENT_NODE_EGRESS_BLOCKED'));
    await page.goto(local + '/turnstile-native-qa', { waitUntil: 'domcontentloaded', timeout: 15000 });
    capabilityBooleans = await page.evaluate(() => Object.fromEntries(['Worker', 'SharedWorker', 'EventSource', 'RTCPeerConnection', 'WebTransport'].map(k => [k, typeof globalThis[k] === 'function'])));
    if (fixtureOwner) await fixtureOwner(page);
    while (!evidence.receipt().ownerFinished && !evidence.receipt().stopReason) await new Promise(resolve => setTimeout(resolve, 50));
  } catch (error) { stop(/^[A-Z0-9_]{1,64}$/.test(error?.message) ? error.message : 'QA_EXECUTION_FAILURE'); }
  finally {
    clearTimeout(timer); closing = true;
    let ok = true;
    try { if (context) await bounded(context.close(), 5000); } catch { ok = false; }
    try { if (browser) await bounded(browser.close(), 5000); else if (shell) await bounded(shell.close(), 5000); } catch { ok = false; }
    try { server?.closeAllConnections(); if (server) await bounded(new Promise(resolve => server.close(resolve)), 1000); } catch { ok = false; }
    if (ok) try { profileRemoved = cleanupProfile(profile); } catch { ok = false; }
    evidence.cleaned(ok); seenFrames.clear();
  }
  return { ...evidence.receipt(), capabilityBooleans, observedWorkers, serviceWorkersPolicy: 'BLOCK_RETAINED',
    sdkDelivery: 'STANDARD_NATIVE_CHROME_NO_NODE_INTERMEDIARY', profileRemoved, fixtureOnly: !!fixtureOrigin,
    workerSupervisionBeforeExecution: false, credentialsUsed: false, productionRequests: 0, productionWrites: 0 };
}
