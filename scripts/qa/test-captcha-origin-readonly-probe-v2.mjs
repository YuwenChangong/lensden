import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';

const baseline = process.argv.includes('--baseline');
const { requestDecision, observeLocalFixture } = await import(baseline
  ? './captcha-origin-readonly-probe.mjs' : './captcha-origin-readonly-probe-v2.mjs');
const target = 'https://openglasshub.ogh.workers.dev/login/?next=%2Ffeed%2F';
const provider = 'https://challenges.cloudflare.com';
const hagen = 'https://hagen.challenges.cloudflare.com';
const pageIdentity = {};
const makeFrame = (url, parent = null, page = pageIdentity, detached = false) => ({
  url: () => url, parentFrame: () => parent, page: () => page, isDetached: () => detached,
});
const mainFrame = makeFrame(target);
const trusted = makeFrame(provider + '/cdn-cgi/challenge-platform/frame', mainFrame);
const base = { url: hagen + '/nonsecret-fixture', method: 'GET', resourceType: 'fetch',
  frameKind: 'child', redirected: false, frame: trusted, mainFrame };
const decide = change => requestDecision({ ...base, ...change });
let cases = 0;
const check = (name, change, allowed) => {
  assert.equal(decide(change).allow, allowed, name); cases++;
};
check('trusted direct Turnstile child fetch', {}, true);
check('HEAD fetch from trusted child', { method: 'HEAD' }, true);
check('no second unobserved subdomain', { url: 'https://brunhild.challenges.cloudflare.com/probe' }, false);
check('no wildcard or suffix confusion', { url: hagen + '.outside.invalid/probe' }, false);
check('top navigation forbidden', { resourceType: 'document', frameKind: 'top', frame: mainFrame }, false);
check('hagen child document forbidden', { resourceType: 'document' }, false);
check('top frame fetch forbidden', { frameKind: 'top', frame: mainFrame }, false);
check('untrusted source frame', { frame: makeFrame('https://outside.invalid/frame', mainFrame) }, false);
check('forged frame metadata not trusted', { frame: { origin: provider, parentOrigin: new URL(target).origin } }, false);
check('missing browser frame', { frame: undefined }, false);
check('different page identity', { frame: makeFrame(provider + '/turnstile/frame', mainFrame, {}) }, false);
check('detached frame', { frame: makeFrame(provider + '/turnstile/frame', mainFrame, pageIdentity, true) }, false);
check('unexpected provider document path', { frame: makeFrame(provider + '/outside', mainFrame) }, false);
check('untrusted intermediate ancestor', { frame: makeFrame(provider + '/turnstile/frame', makeFrame('https://outside.invalid/frame', mainFrame)) }, false);
check('nested canonical provider is not direct trusted child', { frame: makeFrame(provider + '/turnstile/frame', trusted) }, false);
check('independent provider page', { frame: makeFrame(provider + '/turnstile/frame') }, false);
check('wrong top URL', { mainFrame: makeFrame(target + '&other=1') }, false);
check('different top object despite same URL', { mainFrame: makeFrame(target) }, false);
check('non-fetch resource rejected', { resourceType: 'script' }, false);
check('POST not added by exception', { method: 'POST' }, false);
check('redirect continuation forbidden', { redirected: true }, false);
check('URL userinfo forbidden', { url: 'https://private:secret@hagen.challenges.cloudflare.com/probe' }, false);
check('non-HTTPS rejected', { url: 'http://hagen.challenges.cloudflare.com/probe' }, false);
check('nondefault port rejected', { url: 'https://hagen.challenges.cloudflare.com:444/probe' }, false);
check('exact top navigation remains allowed', { url: target, resourceType: 'document', frameKind: 'top', frame: mainFrame }, true);
check('application API still denied', { url: new URL(target).origin + '/api/auth', method: 'POST', frame: mainFrame }, false);
const source = fs.readFileSync(new URL('./captcha-origin-readonly-probe-v2.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\.postData\(|\.allHeaders\(|\.cookies\(|\.storageState\(|\.screenshot\(|\.tracing\.|process\.env\.|response\.(?:body|text|json)\(/); cases++;

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => server.close(resolve));
let mode = 'trusted', fetched = 0, redirected = 0;
const endpoint = http.createServer((req, res) => {
  if (req.url === '/redirected') { redirected++; res.end(''); return; }
  fetched++;
  if (mode === 'redirect') { res.writeHead(302, { location: '/redirected' }); res.end(); return; }
  res.setHeader('access-control-allow-origin', '*'); res.end('nonsecret fixture');
});
const extra = await listen(endpoint);
let providerBase;
const widget = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(mode === 'nested' && req.url.endsWith('/outer')
    ? `<iframe src="${providerBase}/cdn-cgi/challenge-platform/inner"></iframe>`
    : `<script>fetch('${extra}/probe',{mode:'no-cors'}).catch(()=>{})</script>`);
});
providerBase = await listen(widget);
let providerDocumentOrigin = providerBase;
const app = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(mode === 'top-fetch' ? `<script>fetch('${extra}/probe',{mode:'no-cors'}).catch(()=>{})</script>`
    : `<iframe src="${providerDocumentOrigin}/cdn-cgi/challenge-platform/${mode === 'nested' ? 'outer' : 'frame'}"></iframe>`);
});
const appBase = await listen(app);
try {
  for (const scenario of ['trusted', 'top-fetch', 'nested', 'redirect']) {
    mode = scenario; fetched = 0; redirected = 0;
    const r = await observeLocalFixture({ target: appBase + '/login/', provider: providerBase,
      subframeFetchOrigin: extra, observeMilliseconds: 800 });
    assert.equal(r.browserClosed, true, 'cleanup ' + scenario + ' ' + JSON.stringify(r));
    assert.equal(r.responseGuardCleanup, 'PASS');
    assert.equal(r.navigationAttempts, 1);
    if (scenario === 'trusted') {
      assert.equal(fetched, 1, JSON.stringify(r)); assert.equal(r.subframeFetchDispatched, 1);
      assert.equal(r.subframeFetchResponses, 1); assert.equal(r.controllerOriginAllowance, 'PASS');
      assert.equal(r.classification, 'UNKNOWN');
    } else if (scenario === 'redirect') {
      assert.equal(fetched, 1); assert.equal(redirected, 0);
      assert.equal(r.subframeFetchRedirectPolicy, 'BROWSER_RESPONSE_STAGE_GUARD_BEFORE_REDIRECT');
      assert.equal(r.events.some(e => e.phase === 'FETCH_REDIRECT_RESPONSE_BLOCKED'), true);
    } else {
      assert.equal(fetched, 0);
      assert.equal(r.events.some(e => e.phase === 'TURNSTILE_SUBFRAME_FETCH_CONTEXT'), true);
    }
    assert.equal(r.turnstileVerification, 'NOT_TESTED');
    cases++;
  }
  for (const scenario of ['trusted', 'redirect']) {
    mode = scenario; fetched = 0; redirected = 0;
    providerDocumentOrigin = providerBase.replace('127.0.0.1', 'localhost');
    const r = await observeLocalFixture({ target: appBase + '/login/',
      provider: providerBase.replace('127.0.0.1', 'localhost'),
      subframeFetchOrigin: extra, observeMilliseconds: 800 });
    assert.equal(r.browserClosed, true, 'cross-site cleanup ' + JSON.stringify(r));
    assert.equal(r.responseGuardCleanup, 'PASS');
    assert.equal(fetched, 1, JSON.stringify(r)); assert.equal(redirected, 0, JSON.stringify(r));
    assert.equal(r.controllerOriginAllowance, 'PASS');
    if (scenario === 'redirect') assert.equal(r.events.some(e => e.phase === 'FETCH_REDIRECT_RESPONSE_BLOCKED'), true);
    else assert.equal(r.subframeFetchResponses, 1);
    cases++;
  }
} finally { await close(app); await close(widget); await close(endpoint); }
console.log(JSON.stringify({ status: 'PASS', cases, localEdgeScenarios: 6,
  productionRequests: 0, actualTurnstile: 'NOT_TESTED_LOCAL_FIXTURES_ONLY' }));
