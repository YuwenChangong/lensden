import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runLoginDiagnostic} from './execution/group1/runner.mjs';
import {validateAuthorization,claimOnce,GO} from './execution/group1/authorization.mjs';
import {Group1Gate,SharedBudget} from './execution/group1/gate.mjs';
import {DiagnosticJournal} from './execution/group1/diagnostics.mjs';
import {caps} from './browser-fixture.mjs';
import {runSupervised} from './execution/group1/supervisor.mjs';
const actors = Object.fromEntries(['A','B','ADMIN'].map((a,i)=>[a,{userId:'00000000-0000-4000-8000-00000000000'+(i+1),email:a.toLowerCase()+'@example.invalid',applicationRole:a==='ADMIN'?'admin':'user',exists:true,ownerControlled:true,dedicatedQA:true,legalConsentCurrent:true}]));
const privateBinding={accounts:actors,budget:{...caps}};
const cleanJournal={format:'group1-redacted-request-journal-v1',firstRejection:null,firstFailure:null,dispatchAttempts:1,completedResponses:1,events:[]};
function mockBrowser({fail=false,inflight=0}={}) {
  let failure=null, closed=false;
  return {async navigate(){if(fail)failure='UNAPPROVED_REQUEST'},receipt(){return{firstFailure:failure,inFlight:inflight,diagnostics:fail?{...cleanJournal,firstRejection:{stage:'LOGIN_A',rejectionCategory:'UNAPPROVED_ROUTE',networkDispatchOccurred:false}}:cleanJournal}},async close(){closed=true},get closed(){return closed}};
}
function options(browser,extra={}){let deps=0;return{privateBinding,appOrigin:'https://app.example.invalid',supabaseOrigin:'https://db.example.invalid',staticManifest:[],transport:()=>{throw new Error('UNEXPECTED_TRANSPORT')},deployment:async()=>{deps++;return{deploymentId:'synthetic',activeTraffic:100}},assertDeployment:r=>r,openBrowser:async()=>browser,installGuard:()=>{},observationMs:0,...extra,get deps(){return deps}}}
test('diagnostic happy path completes only two Deployment reads, never Auth/RLS success',async()=>{
  const b=mockBrowser(),o=options(b);const r=await runLoginDiagnostic(o);
  assert.equal(r.status,'DIAGNOSTIC_COMPLETE');assert.equal(r.providerGETs,2);assert.equal(r.authDispatches,0);
  assert.equal(r.loginVerified,false);assert.equal(r.catalogCasesPassed,0);assert.equal(b.closed,true);
});
test('rejected request reaches final runner receipt after browser close and stops post-Deployment',async()=>{
  const b=mockBrowser({fail:true}),r=await runLoginDiagnostic(options(b));
  assert.equal(r.status,'BLOCKED');assert.equal(r.providerGETs,1);assert.equal(r.postDeployment,null);
  assert.equal(r.diagnostics.firstRejection.stage,'LOGIN_A');assert.equal(b.closed,true);
});
test('inflight ambiguity stops with no extra Provider request or retry',async()=>{
  const r=await runLoginDiagnostic(options(mockBrowser({inflight:1})));
  assert.equal(r.firstFailure,'DIAGNOSTIC_INFLIGHT_NOT_SETTLED');assert.equal(r.providerGETs,1);
});
test('aborted execution cleans up without any network admission',async()=>{
  const c=new AbortController();c.abort();const b=mockBrowser();const r=await runLoginDiagnostic(options(b,{signal:c.signal}));
  assert.equal(r.firstFailure,'WORK_DEADLINE');assert.equal(r.providerGETs,0);assert.equal(r.authDispatches,0);
});
test('one diagnostic browser caps eight admissions atomically, independent of remaining owner allowance',async()=>{
  const opts={actor:'A',appOrigin:'https://app.example.invalid',supabaseOrigin:'https://db.example.invalid',staticPaths:Array.from({length:9},(_,i)=>'/_astro/'+i+'.js')};
  const budget=new SharedBudget({...caps}),gate=new Group1Gate({...opts,binding:actors.A,budget,caps}),journal=new DiagnosticJournal({...opts,readOnlyLoginDiagnostic:true});
  const results=await Promise.all(opts.staticPaths.map(p=>Promise.resolve().then(()=>{try{const {ticket}=journal.reserve(gate,{url:opts.appOrigin+p,method:'GET',actor:'A',headers:{},body:Buffer.alloc(0)},{stage:'LOGIN_A',source:'BROWSER_RESOURCE',resourceType:'script'});gate.complete(ticket);return true}catch{return false}})));
  assert.equal(results.filter(Boolean).length,8);assert.equal(budget.receipt().allBrowserHttpDispatchesMax,8);
  assert.equal(journal.receipt().firstRejection.rejectionCategory,'BUDGET_EXCEEDED');
});
test('session refresh remains a bounded original capability, diagnostic mode cannot dispatch it',()=>{
  const o={actor:'A',appOrigin:'https://app.example.invalid',supabaseOrigin:'https://db.example.invalid'};
  const gate=new Group1Gate({...o,binding:actors.A,caps,budget:new SharedBudget(caps)}),j=new DiagnosticJournal(o);
  gate.permitLogin('success');const meta={stage:'LOGIN_A',source:'CONTROLLED_NODE_READ',resourceType:'fetch'};
  const login={url:o.supabaseOrigin+'/auth/v1/token?grant_type=password',method:'POST',actor:'A',headers:{},body:Buffer.from(JSON.stringify({email:actors.A.email,password:'OFFLINE_ONLY',gotrue_meta_security:{captcha_token:'OFFLINE_ONLY'}}))};
  const first=j.reserve(gate,login,meta);gate.acceptSession(first.ticket,{access_token:'OFFLINE_ACCESS',refresh_token:'OFFLINE_REFRESH',user:{id:actors.A.userId,email:actors.A.email}});gate.complete(first.ticket);
  const req={url:o.supabaseOrigin+'/auth/v1/token?grant_type=refresh_token',method:'POST',actor:'A',headers:{},body:Buffer.from('{"refresh_token":"OFFLINE_REFRESH"}')};
  const limited=new DiagnosticJournal({...o,readOnlyLoginDiagnostic:true});assert.throws(()=>limited.reserve(gate,req,meta),/DIAGNOSTIC_METHOD_FORBIDDEN/);
  assert.equal(limited.receipt().dispatchAttempts,0);assert.doesNotMatch(JSON.stringify(limited.receipt()),/OFFLINE_REFRESH/);
});
test('consumed old authorization fails under new identity and exact new GO',()=>{
  const old=JSON.parse(fs.readFileSync('C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/artifacts/AUTHORIZED_GROUP1.json'));
  assert.throws(()=>validateAuthorization(old,{packet:{authorizationId:'e-verify-group1-openglasshub-20261013-login-diagnostic-v3',executionLimitSeconds:300},packetSha256:old.packetSha256,bindingSha256:old.executionBindingSha256,go:GO,now:Date.parse(old.authorizedAtUTC)+1,claimExists:true}));
});
test('Claim helper refuses second use without altering the first claim',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-login-claim-offline-')),file=path.join(dir,'synthetic.claim');
  claimOnce(file,'e-verify-group1-synthetic-offline');const before=fs.readFileSync(file);assert.throws(()=>claimOnce(file,'e-verify-group1-synthetic-offline'));
  assert.deepEqual(fs.readFileSync(file),before);
});
test('actual new entry without GO stops before private/OAuth reads or Claim',()=>{
  const entry=new URL('./execution/group1/entry.mjs',import.meta.url);
  const r=spawnSync(process.execPath,[entry.pathname.replace(/^\/([A-Za-z]:)/,'$1')],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(r.status,1);assert.match(r.stdout,/EXACT_GO_REQUIRED/);
  assert.equal(fs.existsSync(new URL('./execution/group1/artifacts/GROUP1_ONCE.claim',import.meta.url)),false);
});
test('unchanged Windows supervisor keeps hard deadline and reaps local child with cleanup reserve',{timeout:15000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-login-deadline-offline-'));
  const r=await runSupervised({entry:path.resolve('tools/e-verify-group1-login-diagnostics/offline-child.mjs'),args:['hang'],cwd:process.cwd(),deadlineMs:4000,reserveMs:1000,graceMs:500,workMs:2000,receiptPath:path.join(dir,'supervisor.json'),env:{}});
  assert.equal(r.timeout,true);assert.equal(r.reaped,true);assert.equal(r.containment.closed,true);assert.ok(r.elapsedMs<4000);
});
