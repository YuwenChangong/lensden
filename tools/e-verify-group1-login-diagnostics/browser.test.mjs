import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './browser-fixture.mjs';

test('actual Chrome + production AuthPanel/SDK initializes with safe admitted route diagnostics', {timeout: 30000}, async () => {
  const f = await fixture();
  try {
    f.browser.permitLogin('success'); await f.browser.navigate('/login/');
    await f.browser.page.waitForSelector('input[type=password]');
    await f.submit(); await f.browser.waitForSession(3000); await f.browser.verifyActor();
    const receipt = f.browser.receipt();
    assert.equal(receipt.firstFailure, null);
    assert.equal(receipt.identityVerified, true);
    assert.equal(receipt.diagnostics.events.some(e => e.normalizedRoute === '/auth/v1/token' && e.transportState === 'RESPONSE_COMPLETED'), true);
    assert.doesNotMatch(JSON.stringify(receipt), /SYNTHETIC_ACCESS|SYNTHETIC_REFRESH|SYNTHETIC_ONLY|qa@|00000000/);
  } finally { await f.close(); }
});
test('real browser rejected background fetch retains route/source/stage and no dispatch', {timeout: 30000}, async () => {
  const f = await fixture();
  try {
    await f.browser.navigate('/login/'); await f.browser.page.waitForSelector('input[type=password]');
    const before = f.count;
    await f.browser.page.evaluate(() => fetch('/api/unreviewed?token=PRIVATE_QUERY', {method: 'POST', body: 'PRIVATE_BODY'}).catch(() => null));
    const d = f.browser.receipt().diagnostics.firstRejection;
    assert.equal(f.count, before); assert.equal(d.stage, 'LOGIN_A'); assert.equal(d.actor, 'A');
    assert.equal(d.requestSource, 'BROWSER_FETCH'); assert.equal(d.rejectionCategory, 'UNAPPROVED_ROUTE');
    assert.equal(d.networkDispatchOccurred, false);
    assert.doesNotMatch(JSON.stringify(d), /PRIVATE_QUERY|PRIVATE_BODY|unreviewed/);
  } finally { await f.close(); }
});
test('diagnostic-only browser refuses SDK login at predispatch without authentication', {timeout: 30000}, async () => {
  const f = await fixture({readOnlyLoginDiagnostic: true});
  try {
    f.browser.permitLogin('success'); await f.browser.navigate('/login/');
    await f.browser.page.waitForSelector('input[type=password]'); await f.submit();
    await assert.rejects(f.browser.waitForSession(1000));
    const r = f.browser.receipt();
    assert.equal(r.diagnostics.firstRejection.rejectionCategory, 'UNAPPROVED_METHOD');
    assert.equal(r.counts.supabaseAuthDispatchesMax, 0);
    assert.equal(f.requests.some(q => q.startsWith('POST /auth/')), false);
  } finally { await f.close(); }
});
test('Turnstile script is classified but changed query remains rejected, never broadened', {timeout: 30000}, async () => {
  const f = await fixture();
  try {
    await f.browser.navigate('/login/'); await f.browser.page.waitForSelector('input[type=password]');
    const before = f.count;
    await f.browser.page.evaluate(() => fetch('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&extra=PRIVATE').catch(() => null));
    const d = f.browser.receipt().diagnostics.firstRejection;
    assert.equal(d.admissionRuleId, 'TURNSTILE_SCRIPT_GET'); assert.equal(d.rejectionCategory, 'REQUEST_BINDING_MISMATCH');
    assert.equal(d.queryPresent, true); assert.equal(d.networkDispatchOccurred, false); assert.equal(f.count, before);
    assert.doesNotMatch(JSON.stringify(d), /PRIVATE|extra=/);
  } finally { await f.close(); }
});
test('actual page initialization unknown request is diagnosed in a synthetic reproduction, not claimed historical', {timeout: 30000}, async () => {
  const f = await fixture({extraScript: "fetch('/api/unreviewed?secret=PRIVATE').catch(()=>null);"});
  try {
    await f.browser.navigate('/login/');
    for (let i = 0; i < 50 && !f.browser.receipt().firstFailure; i++) await new Promise(r => setTimeout(r, 20));
    const receipt = f.browser.receipt();
    assert.equal(receipt.firstFailure, 'UNAPPROVED_REQUEST');
    assert.equal(receipt.diagnostics.firstRejection.admissionRuleId, 'NO_BOUND_RULE');
    assert.equal(receipt.counts.supabaseAuthDispatchesMax, 0);
    assert.equal(f.requests.some(q => q.includes('/api/unreviewed')), false);
  } finally { await f.close(); }
});
test('response source hash and redirect guards still fail and preserve dispatched classification', {timeout: 30000}, async () => {
  const f = await fixture({staticManifest: [{path: '/_astro/app.js', bytes: 1, sha256: '0'.repeat(64)}]});
  try {
    await f.browser.navigate('/login/');
    for (let i = 0; i < 50 && !f.browser.receipt().firstFailure; i++) await new Promise(r => setTimeout(r, 20));
    const receipt = f.browser.receipt();
    assert.equal(receipt.firstFailure, 'STATIC_SOURCE_MISMATCH');
    assert.equal(receipt.diagnostics.firstFailure.networkDispatchOccurred, true);
    assert.equal(receipt.diagnostics.firstFailure.transportState, 'RESPONSE_REJECTED');
  } finally { await f.close(); }
});
