import fs from 'node:fs';
import http from 'node:http';
import { waitForStart } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { runStandard } from './browser.mjs';
await waitForStart();
const mode = process.argv[2], file = process.argv[3];
let sdkHits = 0, workerHits = 0, unknownHits = 0, proxyBlockedAttempts = 0;
const servers = [];
const listen = async server => {
  servers.push(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
};
const unknown = await listen(http.createServer((_, r) => { unknownHits++; r.setHeader('content-type', 'text/html'); r.end('<p>Local unapproved origin fixture</p>'); }));
let vendor;
const server = http.createServer((q, r) => {
  if (q.url === '/fixture/sdk.js') {
    sdkHits++;
    if (mode === 'sdk-error') { r.writeHead(500); r.end(); return; }
    r.writeHead(200, { 'content-type': 'application/javascript' });
    r.end(`window.turnstile={render:(selector,options)=>{const f=document.createElement('iframe');f.name=location.origin;f.src=${JSON.stringify(mode === 'unknown' ? unknown : vendor + '/fixture/frame')};document.querySelector(selector).append(f);window.addEventListener('message',event=>{if(event.origin===${JSON.stringify(vendor)}&&event.data==='LOCAL_READY'&&${mode !== 'no-callback' && mode !== 'abort'})options.callback('DISCARDED_FAKE_TOKEN')});return'local-only'}}`);
  } else if (q.url === '/fixture/frame') {
    r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; worker-src 'self'" });
    r.end(`<p id="pending">Local worker fixture</p><script>const worker=new Worker('/fixture/worker.js');worker.onmessage=()=>{document.querySelector('p').id='ready';parent.postMessage('LOCAL_READY',window.name)}</script>`);
  } else if (q.url === '/fixture/worker.js') {
    workerHits++; r.writeHead(200, { 'content-type': 'application/javascript' }); r.end("postMessage('LOCAL_COMPUTATION_COMPLETE')");
  } else { r.writeHead(404); r.end(); }
});
vendor = await listen(server);
const proxy = http.createServer((_, r) => { proxyBlockedAttempts++; r.writeHead(403); r.end(); });
proxy.on('connect', (_, socket) => { proxyBlockedAttempts++; socket.on('error', () => {}); socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
const proxyOrigin = await listen(proxy);
let result;
try {
  result = await runStandard({ fixtureOrigin: vendor, offlineProxy: proxyOrigin, workMs: mode === 'idle' ? 1200 : 10000,
    fixtureOwner: async page => {
      if (mode === 'idle') return;
      await page.locator('#start').click();
      // The duplicate synthetic click tests the one-shot harness, not vendor behavior.
      await page.locator('#start').evaluate(button => button.click());
      if (['sdk-error', 'unknown'].includes(mode)) return;
      await page.frameLocator('#widget iframe').locator('#ready').waitFor({ timeout: 4000 });
      if (mode === 'abort') { await page.locator('#abort').click(); return; }
      if (mode === 'success') await page.locator('#state').filter({ hasText: 'CALLBACK' }).waitFor({ timeout: 4000 });
      await page.locator('#visible').click(); await page.locator('#not-required').click(); await page.locator('#finish').click();
    }
  });
} finally {
  for (const s of servers) { s.closeAllConnections(); await new Promise(resolve => s.close(resolve)); }
}
fs.writeFileSync(file, JSON.stringify({ ...result, sdkHits, workerHits, unknownHits, proxyBlockedAttempts, thirdPartyLiveRequests: 0 }, null, 2), { flag: 'wx' });
await new Promise(resolve => process.send({ type: 'receipt', status: 'complete' }, resolve)); process.disconnect();
