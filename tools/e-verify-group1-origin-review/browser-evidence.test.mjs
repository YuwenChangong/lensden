import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import { createProfile, cleanupProfile } from '../e-verify-native-manual/profile.mjs';
import { verifyExecutable, CHROME } from '../e-verify-group1-chrome-v15/chrome-identity.mjs';
import { OriginDiagnostic } from './diagnostic.mjs';

test('real Chrome/CDP mocked cross-origin fetch supplies Frame, candidate initiator and private origin components without live egress', async () => {
  verifyExecutable(); const profile = createProfile(), captured = [], appOrigin = 'https://app.example.invalid';
  const d = new OriginDiagnostic({ appOrigin, supabaseOrigin: 'https://db.example.invalid',
    captureOrigin: value => { captured.push(value); return 'origin-' + 'c'.repeat(32); } });
  const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  proxy.on('connect', (q, socket) => { socket.on('error', () => {}); socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  let context, page, unknown, safe, cdpErrors = 0;
  try {
    context = await chromium.launchPersistentContext(profile, { executablePath: CHROME, headless: true,
      proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' }, serviceWorkers: 'block',
      args: ['--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
    page = await context.newPage(); const cdp = await context.newCDPSession(page);
    cdp.on('Network.requestWillBeSent', event => { try { d.observeCdp(event); } catch { cdpErrors++; } });
    await cdp.send('Network.enable');
    page.on('request', q => { if (q.resourceType() === 'fetch') unknown = q; });
    await context.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.origin === appOrigin) await route.fulfill({ status: 200, contentType: 'text/html', body:
        '<!doctype html><link rel="icon" href="data:,"><script>fetch("https://unknown.example.invalid/public?session=FIXTURE_ONLY_NO_LOG").then(()=>window.done=true)</script>' });
      else if (u.origin === 'https://unknown.example.invalid') await route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{}' });
      else await route.abort();
    });
    await page.goto(appOrigin + '/login/'); await page.waitForFunction(() => window.done === true, null, { timeout: 5000 });
    assert.ok(unknown); safe = await d.observe(unknown, { page, actor: 'A', stage: 'LOGIN_A' });
    assert.equal(safe.originClass, 'OTHER_ORIGIN'); assert.equal(safe.resourceType, 'fetch'); assert.equal(safe.ruleMatched, false);
    assert.equal(safe.frameClass, 'APPLICATION_MAIN_FRAME'); assert.equal(safe.cdpCandidates[0].initiatorType, 'script');
    assert.equal(safe.cdpCandidates[0].publicInitiatorId, 'APP_LOGIN_DOCUMENT'); assert.equal(safe.cdpCorrelation, 'SINGLE_CANDIDATE_NOT_PROVEN');
    assert.deepEqual(captured, [{ scheme: 'https:', host: 'unknown.example.invalid', port: '443' }]);
    assert.equal(cdpErrors, 0); assert.ok(!JSON.stringify(safe).includes('FIXTURE_ONLY_NO_LOG'));
    await cdp.detach();
  } finally {
    d.dispose(); await context?.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
    assert.equal(cleanupProfile(profile), true);
  }
  const out = new URL('./artifacts/', import.meta.url); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(new URL('BROWSER_EVIDENCE_SAFE.json', out), JSON.stringify({ result: 'PASS', safe,
    protectedSinkTested: false, captureWasMemoryOnlyFixture: true, consumedV16Changed: false, futureRunnerIntegration: 'NOT_IMPLEMENTED_OR_AUTHORIZED',
    productionRequests: 0, thirdPartyLiveRequests: 0, profileRemoved: !fs.existsSync(profile) }, null, 2) + '\n', { flag: 'wx' });
});
