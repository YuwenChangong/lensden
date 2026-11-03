import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { openNativeBrowser } from './browser.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
import { installNodeGuard } from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import { waitForStart } from '../e-verify-group1-remaining-assets/supervisor.mjs';
await waitForStart();
const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
await new Promise(r => proxy.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await openNativeBrowser({ actor: 'A', binding: { userId: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', applicationRole: 'user' },
    appOrigin: 'https://app.example.invalid', supabaseOrigin: 'https://qa.example.invalid', staticPaths: [], headless: false, workMs: 12000,
    budget: new SharedBudget({ allBrowserHttpDispatchesMax: 650, executionSecondsMax: 3600 }), transport: async () => { throw Error('UNREACHED'); },
    fixtureSetup: {
      launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' }, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
      install: async ({ context }) => { await context.route(u => u.origin === 'https://app.example.invalid', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><p>Offline guard fixture</p>' })); },
      start: portal => portal.locator('#start').click()
    } });
  installNodeGuard(); browser.permitLogin('success'); await browser.navigate('/login/');
  const r = browser.receipt(); if (!r.started || !r.controlEvidence.windowFocused || r.controlEvidence.startEvents !== 1) throw Error('GUARD_CONTROL_NOT_READY');
} finally {
  await browser?.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
}
fs.writeFileSync(path.join(process.argv[2], 'GUARD_CHILD_SAFE.json'), JSON.stringify({ receipt: browser.receipt(), productionRequests: 0, thirdPartyLiveRequests: 0 }) + '\n', { flag: 'wx' });
await new Promise(r => process.send({ type: 'receipt', status: 'complete' }, r)); process.disconnect();
