import test from 'node:test';import assert from 'node:assert/strict';
import {candidateCaps,scopeDifference} from './candidate.mjs';
import {SharedBudget,Group1Gate} from '../e-verify-group1-v9-closure/gate.mjs';
import {DiagnosticJournal} from '../e-verify-group1-script-identity/execution/group1/diagnostics.mjs';
import {catalogSteps} from '../e-verify-group1-script-identity/execution/group1/rls.mjs';
const owner={allBrowserHttpDispatchesMax:500,supabaseAuthDispatchesMax:40,supabaseRestReadDispatchesMax:80,turnstileHttpDispatchesMax:40,ownerSessionRefreshRequestsMax:6,executionSecondsMax:3600,openaiAndProviderCostUSDMax:0};
const account={userId:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid',applicationRole:'user'};
test('proposal changes only global500->650 and never mutates saved caps',()=>{
 const c=candidateCaps(owner);assert.deepEqual(scopeDifference(owner,c),['allBrowserHttpDispatchesMax']);assert.equal(c.allBrowserHttpDispatchesMax,650);assert.equal(owner.allBrowserHttpDispatchesMax,500);
});
test('1000 simultaneous attempts cannot dispatch beyond candidate650',async()=>{
 const b=new SharedBudget(candidateCaps(owner));let dispatches=0;
 await Promise.all(Array.from({length:1000},()=>Promise.resolve().then(()=>{try{b.reserve(['allBrowserHttpDispatchesMax']);dispatches++}catch{}})));
 assert.equal(dispatches,650);assert.equal(b.receipt().allBrowserHttpDispatchesMax,650);assert.throws(()=>b.reserve(['allBrowserHttpDispatchesMax']),/BUDGET_STOPPED/);
});
test('original500 stop is unchanged for unamended budget',()=>{
 const b=new SharedBudget(owner);for(let i=0;i<500;i++)b.reserve(['allBrowserHttpDispatchesMax']);assert.throws(()=>b.reserve(['allBrowserHttpDispatchesMax']),/BUDGET_EXCEEDED/);assert.equal(b.receipt().allBrowserHttpDispatchesMax,500);
});
test('dynamic challenge request41 is denied before global or wire increment',()=>{
 const caps=candidateCaps(owner),g=new Group1Gate({caps,actor:'A',binding:account,appOrigin:'https://app.example.invalid',supabaseOrigin:'https://db.example.invalid'});let wire=0;
 for(let i=0;i<40;i++){const t=g.reserve({url:'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/fixture-'+i,method:'GET',actor:'A'});wire++;g.complete(t)}
 assert.throws(()=>g.reserve({url:'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/fixture-40',method:'GET',actor:'A'}),/BUDGET_EXCEEDED/);
 assert.equal(wire,40);assert.equal(g.receipt().counts.turnstileHttpDispatchesMax,40);assert.equal(g.receipt().counts.allBrowserHttpDispatchesMax,40);
});
test('Auth40 and refresh6 remain independent pre-dispatch ceilings',()=>{
 for(const [key,max]of [['supabaseAuthDispatchesMax',40],['ownerSessionRefreshRequestsMax',6]]){
   const b=new SharedBudget(candidateCaps(owner));for(let i=0;i<max;i++)b.reserve(['allBrowserHttpDispatchesMax',key]);
   assert.throws(()=>b.reserve(['allBrowserHttpDispatchesMax',key]),/BUDGET_EXCEEDED/);assert.equal(b.receipt()[key],max);assert.equal(b.receipt().allBrowserHttpDispatchesMax,max);
 }
});
test('unknown observed public script after event cap still produces safe identity and zero dispatch',async()=>{
 const app='https://app.example.invalid',known='/_astro/SiteHeader.12345678.js',unknown='/_astro/SiteHeader.87654321.js';
 const g=new Group1Gate({caps:candidateCaps(owner),actor:'A',binding:account,appOrigin:app,supabaseOrigin:'https://db.example.invalid',staticPaths:[known]});
 const j=new DiagnosticJournal({actor:'A',appOrigin:app,supabaseOrigin:'https://db.example.invalid',staticPaths:[known]});
 await j.observeLoginHtml(Buffer.from('<script src="'+unknown+'"></script>'),app+'/login/');
 const meta={stage:'LOGIN_A',source:'BROWSER_RESOURCE',resourceType:'script'};
 for(let i=0;i<650;i++){g.nextNavigation();const r=j.reserve(g,{url:app+known,method:'GET',actor:'A'},meta);j.dispatchStarted(r.sequence);j.completed(r.sequence,200);g.complete(r.ticket)}
 assert.throws(()=>j.reserve(g,{url:app+unknown+'?token=DO_NOT_RECORD',method:'GET',actor:'A'},meta),/UNAPPROVED_REQUEST/);
 const r=j.receipt(),d=r.firstRejection;assert.equal(r.eventsCapped,true);assert.equal(d.rejectionCategory,'UNAPPROVED_ROUTE');assert.equal(d.scriptIdentity.publicPathname,unknown);
 assert.equal(d.networkDispatchOccurred,false);assert.equal(d.stage,'LOGIN_A');assert.equal(d.requestSource,'BROWSER_RESOURCE');assert.equal(d.method,'GET');assert.equal(d.resourceType,'script');assert.equal(d.admissionRuleId,'NO_BOUND_RULE');
 assert.doesNotMatch(JSON.stringify(r),/DO_NOT_RECORD|token=/);
});
test('original exact16 RLS roles and paths are not expanded by budget proposal',()=>{
 const steps=catalogSteps();assert.equal(steps.length,16);assert.equal(steps.filter(s=>s.actor==='anon').length,6);assert.equal(steps.filter(s=>s.actor==='A').length,5);assert.equal(steps.filter(s=>s.actor==='B').length,5);assert.equal(steps.some(s=>s.actor==='ADMIN'),false);
});
