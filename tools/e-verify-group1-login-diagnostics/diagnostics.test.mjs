import test from 'node:test';
import assert from 'node:assert/strict';
import {Group1Gate, SharedBudget, validateResponse} from './execution/group1/gate.mjs';
let implementation;
try { implementation = await import('./execution/group1/diagnostics.mjs'); } catch {}
const caps = {allBrowserHttpDispatchesMax: 10, applicationMutationDispatchesMax: 4,
  supabaseAuthDispatchesMax: 4, supabaseRestReadDispatchesMax: 4,
  turnstileHttpDispatchesMax: 4, executionSecondsMax: 300, ownerSessionRefreshRequestsMax: 1};
const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://db.example.invalid';
const binding = {userId: '00000000-0000-4000-8000-000000000001', email: 'qa@example.invalid', applicationRole: 'user'};
const options = {actor: 'A', appOrigin, supabaseOrigin, staticPaths: ['/_astro/app.js']};
const fixture = (overrides = {}) => {
  const budget = new SharedBudget({...caps, ...overrides});
  const gate = new Group1Gate({...options, binding, caps: {...caps, ...overrides}, budget});
  const journal = new implementation.DiagnosticJournal(options);
  return {budget, gate, journal};
};
const request = (route, method = 'GET', extra = {}) => ({url: appOrigin + route, method, actor: 'A', headers: {}, body: Buffer.alloc(0), ...extra});
const meta = {stage: 'LOGIN_A', source: 'BROWSER_RESOURCE', resourceType: 'script', redirected: false};
const check = (name, fn) => test(name, {skip: !implementation}, fn);
test('real predispatch diagnostic journal is implemented', () => assert.equal(typeof implementation?.DiagnosticJournal, 'function'));

for (const [name, q, expected] of [
  ['origin', request('/unknown', 'GET', {url: 'https://sensitive-user.example.invalid/private?token=SECRET'}), 'UNAPPROVED_ORIGIN'],
  ['route', request('/api/unbound/private-user?access_token=SECRET'), 'UNAPPROVED_ROUTE'],
  ['method', request('/login/', 'POST'), 'UNAPPROVED_METHOD'],
  ['actor', request('/login/', 'GET', {actor: 'B'}), 'UNAPPROVED_ACTOR'],
  ['query binding', request('/login/?code=SECRET'), 'REQUEST_BINDING_MISMATCH'],
]) check('rejection diagnostic distinguishes ' + name + ' without dispatch', () => {
  const {gate, journal} = fixture();
  assert.throws(() => journal.reserve(gate, q, meta));
  const d = journal.receipt().firstRejection;
  assert.equal(d.rejectionCategory, expected);
  assert.equal(d.networkDispatchOccurred, false);
  assert.equal(d.stage, 'LOGIN_A');
  const encoded = JSON.stringify(journal.receipt());
  assert.doesNotMatch(encoded, /SECRET|private-user|sensitive-user|access_token|qa@|00000000/);
});
check('normal static remains admitted under original gate and exact bytes checks are not replaced', () => {
  const {gate, journal} = fixture();
  const {ticket, sequence} = journal.reserve(gate, request('/_astro/app.js'), meta);
  assert.equal(ticket.kind, 'static'); journal.dispatchStarted(sequence); journal.completed(sequence, 200); gate.complete(ticket);
  assert.equal(journal.receipt().dispatchAttempts, 1);
  assert.equal(journal.receipt().completedResponses, 1);
  assert.equal(journal.receipt().firstRejection, null);
});
check('stage restriction is additional diagnostic-only scope, never a route whitelist expansion', () => {
  const {gate} = fixture(); const j = new implementation.DiagnosticJournal({...options, readOnlyLoginDiagnostic: true});
  assert.throws(() => j.reserve(gate, request('/products/'), {...meta, stage: 'FINISHED'}));
  assert.equal(j.receipt().firstRejection.rejectionCategory, 'UNAPPROVED_STAGE');
});
check('diagnostic-only mode denies Auth POST before transport, without recording secret body or headers', () => {
  const {gate} = fixture(); gate.permitLogin('success');
  const j = new implementation.DiagnosticJournal({...options, readOnlyLoginDiagnostic: true});
  assert.throws(() => j.reserve(gate, {url: supabaseOrigin + '/auth/v1/token?grant_type=password', method: 'POST', actor: 'A', headers: {cookie: 'SECRET_COOKIE', authorization: 'SECRET_TOKEN'}, body: Buffer.from('{"password":"SECRET_PASSWORD"}')}, meta));
  assert.equal(j.receipt().firstRejection.rejectionCategory, 'UNAPPROVED_METHOD');
  assert.doesNotMatch(JSON.stringify(j.receipt()), /SECRET|password|cookie|authorization/);
});
check('global and category budget failures stay fail-closed and predispatch', () => {
  for (const limit of ['allBrowserHttpDispatchesMax', 'turnstileHttpDispatchesMax']) {
    const {gate, journal, budget} = fixture({[limit]: 0});
    assert.throws(() => journal.reserve(gate, {url: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', method: 'GET', actor: 'A', headers: {}, body: Buffer.alloc(0)}, meta));
    assert.equal(journal.receipt().firstRejection.rejectionCategory, 'BUDGET_EXCEEDED');
    assert.equal(budget.receipt().allBrowserHttpDispatchesMax, 0);
  }
});
check('failed transport is counted and classified as dispatched, not misreported as a gate rejection', () => {
  const {gate, journal} = fixture(); const {sequence} = journal.reserve(gate, request('/login/'), meta);
  journal.dispatchStarted(sequence); journal.failed(sequence, 'ECONNRESET');
  const d = journal.receipt(); assert.equal(d.dispatchAttempts, 1); assert.equal(d.firstFailure.networkDispatchOccurred, true);
});
check('redirect relation is safe and redirect is refused before gate dispatch', () => {
  const {gate, journal} = fixture();
  assert.throws(() => journal.rejectBrowser(gate, request('/login/'), {...meta, redirected: true}, 'REDIRECT_FORBIDDEN'));
  assert.equal(journal.receipt().firstRejection.redirectRelation, 'REDIRECT_CHAIN');
  assert.equal(journal.receipt().dispatchAttempts, 0);
});
check('replay diagnostics preserve original no-retry error and budget', () => {
  const {gate, journal, budget} = fixture(); const q = request('/login/');
  const first = journal.reserve(gate, q, meta); gate.complete(first.ticket);
  assert.throws(() => journal.reserve(gate, q, meta), /REQUEST_REPLAY/);
  assert.equal(journal.receipt().firstRejection.retryRelation, 'REPEATED_REQUEST');
  assert.equal(budget.receipt().allBrowserHttpDispatchesMax, 1);
});
check('diagnostics storage is bounded and emits only whitelisted fields', () => {
  const {gate, journal} = fixture();
  assert.throws(() => journal.reserve(gate, request('/unknown?token=' + 'X'.repeat(10000)), {...meta, source: 'SECRET_SOURCE', stage: 'SECRET_STAGE', resourceType: 'SECRET_TYPE'}));
  const d = journal.receipt(); assert.equal(d.firstRejection.stage, 'UNKNOWN');
  assert.ok(JSON.stringify(d).length < 6000); assert.doesNotMatch(JSON.stringify(d), /XXXX|SECRET/);
});
check('private profile query and challenge dynamic route never disclose IDs, sitekeys or tokens', () => {
  for (const url of [supabaseOrigin + '/rest/v1/profiles?select=id,role&id=eq.PRIVATE_ID', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/opaque-sitekey/SECRET_TOKEN?private=SECRET']) {
    const {gate, journal} = fixture();
    try { journal.reserve(gate, {url, method: 'GET', actor: 'A', headers: {}, body: Buffer.alloc(0)}, meta); } catch {}
    assert.doesNotMatch(JSON.stringify(journal.receipt()), /PRIVATE_ID|SECRET|opaque-sitekey|select=id/);
  }
});
for (const [name, response] of [
  ['307 redirect', {status:307,headers:{location:'/private'},body:Buffer.alloc(0)}],
  ['200 Location', {status:200,headers:{Location:'/private'},body:Buffer.alloc(0)}],
  ['response Cookie', {status:200,headers:{'Set-Cookie':'SECRET'},body:Buffer.alloc(0)}],
  ['oversized body', {status:200,headers:{},body:Buffer.alloc(4)}],
]) check('unchanged strict response guard rejects '+name,()=>{
  assert.throws(()=>validateResponse({expected:[200],maxBytes:3},response));
});
