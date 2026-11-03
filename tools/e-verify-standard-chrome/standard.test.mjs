import test from 'node:test';
import assert from 'node:assert/strict';
import { Observation } from './observation.mjs';
import { validate, GATES, ID, GO } from './authorization.mjs';

test('Start is explicitly observed and complete requires callback/owner/cleanup', () => {
  const r = new Observation();
  r.event('START_CLICKED');
  for (const e of ['SDK_LOADED', 'RENDER_STARTED', 'RENDER_RETURNED', 'HUMAN_WIDGET_VISIBLE', 'HUMAN_NO_INTERACTION_REQUIRED', 'HUMAN_FINISH']) r.event(e);
  r.frame(); r.cleaned(true);
  assert.equal(r.receipt().startClicked, true);
  assert.equal(r.receipt().outcome, 'INCOMPLETE');
  r.event('CALLBACK');
  assert.equal(r.receipt().outcome, 'ISOLATED_OBSERVATION_COMPLETE');
  assert.equal(r.receipt().networkBoundary, 'MONITOR_ONLY');
  r.cleaned(false);
  assert.equal(r.receipt().outcome, 'BLOCKED');
});
test('missing Start can never become a complete manual observation', () => {
  const r = new Observation();
  for (const e of ['SDK_LOADED', 'RENDER_STARTED', 'RENDER_RETURNED', 'CALLBACK', 'HUMAN_WIDGET_VISIBLE', 'HUMAN_NO_INTERACTION_REQUIRED', 'HUMAN_FINISH']) r.event(e);
  r.frame(); r.cleaned(true);
  assert.equal(r.receipt().outcome, 'INCOMPLETE');
});
test('40/650 are observation soft stops, not dispatch reservations', () => {
  const vendor = new Observation();
  for (let i = 0; i < 40; i++) vendor.request({ url: 'https://challenges.cloudflare.com/test' });
  assert.equal(vendor.receipt().stopReason, 'OBSERVED_REQUEST_SOFT_STOP');
  const global = new Observation();
  for (let i = 0; i < 650; i++) global.request({ url: 'http://127.0.0.1:1/main' });
  assert.equal(global.receipt().stopReason, 'OBSERVED_REQUEST_SOFT_STOP');
  assert.equal(global.receipt().oldHardCapsInherited, false);
});
test('safe receipt has no raw URL/token/headers; failure survives cleanup', () => {
  const r = new Observation();
  r.request({ url: 'https://challenges.cloudflare.com/private?token=DO_NOT_STORE' });
  r.stop('OBSERVED_UNKNOWN_ORIGIN'); r.cleaned(true);
  assert.equal(r.receipt().outcome, 'BLOCKED');
  assert.ok(!JSON.stringify(r.receipt()).includes('DO_NOT_STORE'));
  assert.ok(!JSON.stringify(r.receipt()).includes('private'));
  assert.equal(r.receipt().startClicked, false);
});
test('fresh identity, six explicit gates, UTC and separate GO required', () => {
  const now = Date.parse('2026-10-14T00:00:00Z');
  const a = { format: 'standard-chrome-manual-authorization-v1', authorizationId: ID,
    executionBindingSha256: 'b', packetSha256: 'p', authorizedAtUTC: '2026-10-14T00:00:00Z',
    authorizationExpiresUTC: '2026-10-14T00:30:00Z', humanGates: Object.fromEntries(GATES.map(k => [k, true])) };
  const options = { bindingHash: 'b', packetHash: 'p', now, go: GO, claimExists: false };
  assert.doesNotThrow(() => validate(a, options));
  assert.throws(() => validate(a, { ...options, go: '' }));
  assert.throws(() => validate(a, { ...options, claimExists: true }));
  assert.throws(() => validate(a, { ...options, now: now + 1200000 }));
  assert.throws(() => validate({ ...a, authorizationId: 'CONSUMED_FRESH_V2' }, options));
  assert.throws(() => validate({ ...a, humanGates: Object.fromEntries(GATES.map(k => [k, null])) }, options));
});
