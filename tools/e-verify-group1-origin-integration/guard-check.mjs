import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { openNativeBrowser } from './browser.mjs';
import { openProtectedOrigins } from './private-origin.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
import { installNodeGuard } from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import { waitForStart } from '../e-verify-group1-remaining-assets/supervisor.mjs';
await waitForStart();
const output = process.argv[2], locator = JSON.parse(fs.readFileSync(path.join(output, 'PRIVATE_LOCATOR_FIXTURE.json')));
const store = await openProtectedOrigins({ ...locator, reopen: true });
const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
await new Promise(r => proxy.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await openNativeBrowser({ actor: 'A', binding: { userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user' },
    appOrigin: 'https://app.example.invalid', supabaseOrigin: 'https://qa.example.invalid', staticPaths: [], headless: false, workMs: 15000,
    budget: new SharedBudget({ allBrowserHttpDispatchesMax: 650, executionSecondsMax: 3600 }), diagnosticStore: store,
    transport: async () => { throw Error('UNREACHED'); }, fixtureSetup: {
      launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' }, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
      async install({ context }) {
        await context.route('**/*', async route => {
          const u = new URL(route.request().url());
          if (u.origin === 'https://app.example.invalid') await route.fulfill({ status: 200, contentType: 'text/html',
            body: '<!doctype html><link rel="icon" href="data:,"><p>Offline integration</p><script>setTimeout(()=>fetch("https://private-fixture.example.invalid/PRIVATE_PATH?token=PRIVATE_QUERY").catch(()=>{}),50)</script>' });
          else await route.abort();
        });
      }, start: portal => portal.locator('#start').click()
    } });
  installNodeGuard(); browser.permitLogin('success');
  await browser.navigate('/login/').catch(() => {});
  const end = Date.now() + 10000;
  while (!browser.receipt().closed && Date.now() < end) await new Promise(r => setTimeout(r, 25));
  const r = browser.receipt();
  if (!r.closed || r.firstFailure !== 'OBSERVED_UNAPPROVED_REQUEST' || r.channel.identityConfirmed) throw Error('INTEGRATED_UNKNOWN_STOP_FAILED');
  if (!r.diagnostics.originEvidence.observations.some(x => x.originEvidence.evidenceRef)) throw Error('INTEGRATED_PRIVATE_CAPTURE_MISSING');
} finally {
  await browser?.close(); await store.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
}
fs.writeFileSync(path.join(output, 'GUARD_CHILD_SAFE.json'), JSON.stringify({ receipt: browser.receipt(), productionRequests: 0, thirdPartyLiveRequests: 0 }) + '\n', { flag: 'wx' });
await new Promise(r => process.send({ type: 'receipt', status: 'complete' }, r)); process.disconnect();
