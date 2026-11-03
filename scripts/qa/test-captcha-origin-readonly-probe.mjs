import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { requestDecision, providerConsoleCode, classifyEvidence, observeLocalFixture } from './captcha-origin-readonly-probe.mjs';

const target = 'https://openglasshub.ogh.workers.dev/login/?next=%2Ffeed%2F';
const worker = new URL(target).origin;
const provider = 'https://challenges.cloudflare.com';
const decide = x => requestDecision({ target, provider, ...x });
let cases = 0;
assert.equal(decide({ url: target, method: 'GET', resourceType: 'document', frameKind: 'top', redirected: false }).allow, true); cases++;
assert.equal(decide({ url: provider + '/cdn-cgi/challenge-platform/test', method: 'GET', resourceType: 'document', frameKind: 'child', redirected: false }).allow, true); cases++;
assert.equal(decide({ url: provider + '/turnstile/v0/api.js', method: 'GET', resourceType: 'script', frameKind: 'child', redirected: false }).allow, true); cases++;
assert.equal(decide({ url: provider + '/cdn-cgi/challenge-platform/test', method: 'GET', resourceType: 'document', frameKind: 'top', redirected: false }).allow, false); cases++;
assert.equal(decide({ url: target, method: 'GET', resourceType: 'document', frameKind: 'top', redirected: true }).allow, false); cases++;
assert.equal(decide({ url: worker + '/admin/reports/', method: 'GET', resourceType: 'document', frameKind: 'child', redirected: false }).allow, false); cases++;
const blocked = decide({ url: 'https://user:password@outside.invalid/path?token=secret#identity', method: 'GET', resourceType: 'document', frameKind: 'child', redirected: false });
assert.equal(blocked.allow, false); assert.equal(blocked.origin, 'https://outside.invalid');
for (const privatePart of ['password', '/path', '?token', 'secret', '#identity', 'user:']) assert.equal(JSON.stringify(blocked).includes(privatePart), false); cases++;
assert.equal(decide({ url: worker + '/api/forum/posts', method: 'POST', resourceType: 'fetch', frameKind: 'top', redirected: false }).allow, false); cases++;
assert.equal(decide({ url: 'https://xcbnxzjlsvtgzixurcof.supabase.co/auth/v1/token?grant_type=password', method: 'POST', resourceType: 'fetch', frameKind: 'top', redirected: false }).allow, false); cases++;
assert.equal(providerConsoleCode('[Cloudflare Turnstile] Error: 110200. private-noise', provider + '/turnstile/v0/api.js', provider), '110200');
assert.equal(providerConsoleCode('[Cloudflare Turnstile] Error: 110200.', worker + '/fake.js', provider), null); cases++;
assert.equal(classifyEvidence([{ layer: 'CONTROLLER', origin: 'https://outside.invalid' }, { layer: 'PROVIDER', code: '110200' }]), 'CONTROLLER_BLOCK_PROVIDER_CAUSALITY_UNPROVEN');
assert.equal(classifyEvidence([{ layer: 'APPLICATION_CSP', enforced: false }]), 'UNKNOWN'); cases++;
const source = fs.readFileSync(new URL('./captcha-origin-readonly-probe.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\.postData\(|\.allHeaders\(|\.cookies\(|\.storageState\(|\.screenshot\(|\.tracing\.|\.getResponse\(|process\.env\./);
assert.doesNotMatch(source, /response\.(?:body|text|json)\(/); cases++;

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => server.close(resolve));
let dependentRequests = 0;
const dependency = http.createServer((req, res) => {
  dependentRequests++;
  res.setHeader('content-type', 'text/html');
  res.end('<script>console.error("[Cloudflare Turnstile] Error: 110200. fixture-private-noise")</script>');
});
const external = await listen(dependency);
let mode = 'controller';
const app = http.createServer((req, res) => {
  if (req.url === '/outside.js') { res.setHeader('content-type', 'text/javascript'); res.end(''); return; }
  res.setHeader('content-type', 'text/html');
  if (mode === 'csp') res.setHeader('content-security-policy', "default-src 'self'; frame-src 'none'");
  res.end(mode === 'controller' ? `<script src="${external}/outside.js?private=secret"></script>`
    : mode === 'websocket' ? `<script>new WebSocket('${external.replace('http:', 'ws:')}/private?token=secret')</script>`
    : mode === 'top-reload' ? '<script>location.href="/login/"</script>'
    : `<iframe src="${external}/cdn-cgi/challenge-platform/widget"></iframe>`);
});
const local = await listen(app);
try {
  const a = await observeLocalFixture({ target: local + '/login/', provider: local, observeMilliseconds: 1000 });
  assert.equal(a.classification, 'CONTROLLER_BLOCK_PROVIDER_CAUSALITY_UNPROVEN');
  assert.equal(a.events.find(e => e.layer === 'CONTROLLER').origin, external);
  assert.equal(dependentRequests, 0); assert.equal(a.browserClosed, true, JSON.stringify(a)); cases++;
  mode = 'csp';
  const b = await observeLocalFixture({ target: local + '/login/', provider: external, observeMilliseconds: 1000 });
  assert.equal(b.classification, 'APPLICATION_CSP_BLOCK');
  assert.equal(b.events.some(e => e.layer === 'APPLICATION_CSP' && e.enforced), true);
  assert.equal(dependentRequests, 0); assert.equal(b.browserClosed, true); cases++;
  mode = 'provider';
  const c = await observeLocalFixture({ target: local + '/login/', provider: external, observeMilliseconds: 1000 });
  assert.equal(c.classification, 'PROVIDER_ERROR_REPORTED_CAUSE_NOT_INFERRED');
  assert.equal(c.events.find(e => e.layer === 'PROVIDER').code, '110200');
  assert.equal(JSON.stringify(c).includes('fixture-private-noise'), false);
  assert.equal(c.browserClosed, true); cases++;
  mode = 'websocket';
  const before = dependentRequests;
  const d = await observeLocalFixture({ target: local + '/login/', provider: external, observeMilliseconds: 1000 });
  assert.equal(d.events.some(e => e.phase === 'WEBSOCKET_NOT_AUTHORIZED'), true);
  assert.equal(dependentRequests, before); assert.equal(d.browserClosed, true); cases++;
  mode = 'top-reload';
  const e = await observeLocalFixture({ target: local + '/login/', provider: external, observeMilliseconds: 1000 });
  assert.equal(e.events.some(v => v.phase === 'TOP_NAVIGATION_BUDGET'), true);
  assert.equal(e.navigationAttempts, 1); assert.equal(e.browserClosed, true); cases++;
} finally { await close(app); await close(dependency); }
console.log(JSON.stringify({ status: 'PASS', cases, productionRequests: 0, providerRequests: 0,
  actualTurnstile: 'NOT_TESTED_LOCAL_FIXTURES_ONLY', externalOriginsAdded: false }));
