import test from 'node:test';
import assert from 'node:assert/strict';
import {DiagnosticJournal} from './execution/group1/diagnostics.mjs';
import {Group1Gate,SharedBudget} from './execution/group1/gate.mjs';

const appOrigin='https://app.example.invalid',supabaseOrigin='https://db.example.invalid';
const caps={allBrowserHttpDispatchesMax:10,executionSecondsMax:300,turnstileHttpDispatchesMax:8};
const binding={userId:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid',applicationRole:'user'};
const meta={stage:'LOGIN_A',source:'BROWSER_RESOURCE',resourceType:'script'};
const options={actor:'A',appOrigin,supabaseOrigin,staticPaths:['/_astro/known.js'],readOnlyLoginDiagnostic:true};
const setup=(extra={})=>({journal:new DiagnosticJournal(options),gate:new Group1Gate({...options,binding,caps:{...caps,...extra},budget:new SharedBudget({...caps,...extra})})});
const q=(path,extra={})=>({url:appOrigin+path,method:'GET',actor:'A',headers:{},body:Buffer.alloc(0),...extra});
function rejection(request,metadata=meta){const {journal,gate}=setup();assert.throws(()=>journal.reserve(gate,request,metadata));return journal.receipt().firstRejection;}

test('unbound script retains stable pathname evidence, not an invented root route',()=>{
  const d=rejection(q('/_astro/unbound.js'));
  assert.equal(d.normalizedRoute,'/:unbound');
  assert.match(d.scriptPathSha256,/^[a-f0-9]{64}$/);
  assert.equal(d.pathnameEvidence,'UNBOUND_PATH_FINGERPRINT_ONLY');
  assert.equal(d.networkDispatchOccurred,false);
});
test('fingerprint is stable across sessions and excludes every query value',()=>{
  const a=rejection(q('/_astro/unbound.js?token=PRIVATE_ONE'));
  const b=rejection(q('/_astro/unbound.js?token=PRIVATE_TWO'));
  assert.equal(a.scriptPathSha256,b.scriptPathSha256);
  assert.doesNotMatch(JSON.stringify([a,b]),/PRIVATE|token=|unbound\.js/);
});
test('root script is a known page route, not an unbound route or a static capability',()=>{
  const d=rejection(q('/'));
  assert.equal(d.normalizedRoute,'/');
  assert.equal(d.admissionRuleId,'FROZEN_PAGE_GET');
  assert.equal(d.pathnameEvidence,'KNOWN_PAGE_PATH');
});
test('different and percent-encoded paths do not alias',()=>{
  assert.notEqual(rejection(q('/_astro/unbound.js')).scriptPathSha256,rejection(q('/_astro/other.js')).scriptPathSha256);
  assert.notEqual(rejection(q('/_astro/unbound.js')).scriptPathSha256,rejection(q('/_astro/%75nbound.js')).scriptPathSha256);
});
test('fingerprint cannot make an unbound route admissible',()=>{
  const {journal,gate}=setup();assert.throws(()=>journal.reserve(gate,q('/_astro/unbound.js'),meta),/DIAGNOSTIC_ROUTE_FORBIDDEN/);
  assert.equal(gate.receipt().counts.allBrowserHttpDispatchesMax,0);
  assert.equal(journal.receipt().dispatchAttempts,0);
});
test('private origin and nonscript requests never expose path fingerprints',()=>{
  for(const [request,metadata] of [[q('/private', {url:'https://private.example.invalid/PRIVATE'}),meta],[q('/PRIVATE'),{...meta,resourceType:'fetch'}],[q('/PRIVATE',{method:'POST'}),meta]]){
    const d=rejection(request,metadata);assert.equal(d.scriptPathSha256,null);assert.equal(d.pathnameEvidence,'UNKNOWN_PATH_REDACTED');assert.doesNotMatch(JSON.stringify(d),/PRIVATE|private\.example/);
  }
});
test('known static capability still uses original exact gate and predispatch budgets',()=>{
  const {journal,gate}=setup();const admitted=journal.reserve(gate,q('/_astro/known.js'),meta);
  assert.equal(admitted.ticket.kind,'static');assert.equal(gate.receipt().counts.allBrowserHttpDispatchesMax,1);
  assert.equal(journal.receipt().events[0].pathnameEvidence,'KNOWN_STATIC_PATH');
  gate.complete(admitted.ticket);
  const f=setup({allBrowserHttpDispatchesMax:0});assert.throws(()=>f.journal.reserve(f.gate,q('/_astro/known.js'),meta),/BUDGET_EXCEEDED/);
  assert.equal(f.journal.receipt().dispatchAttempts,0);
});
test('Auth, replay and unexpected query stay fail-closed',()=>{
  assert.throws(()=>{const f=setup();f.journal.reserve(f.gate,q('/_astro/known.js?new=1'),meta)});
  assert.throws(()=>{const f=setup();f.journal.reserve(f.gate,q('/auth/v1/token',{url:supabaseOrigin+'/auth/v1/token',method:'POST'}),meta)},/DIAGNOSTIC_METHOD_FORBIDDEN/);
  const f=setup();const t=f.journal.reserve(f.gate,q('/_astro/known.js'),meta);f.gate.complete(t.ticket);
  assert.throws(()=>f.journal.reserve(f.gate,q('/_astro/known.js'),meta),/REQUEST_REPLAY/);
});
