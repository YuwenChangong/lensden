import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createModeratorCheckpointLease} from './moderator-checkpoint-lease.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const readerSource='async function readMfaSnapshotInPage(p) { return fixtureRead(p); }';
const params={expectedUserSha256:'1'.repeat(64),primarySha256:'2'.repeat(64),backupSha256:'3'.repeat(64),
  publicAnonKey:'PUBLIC_NONSECRET_OFFLINE_FIXTURE',publicAnonKeySha256:hash('PUBLIC_NONSECRET_OFFLINE_FIXTURE')};
const binding={authorizationSha256:'4'.repeat(64),parentBindingSha256:'5'.repeat(64),readerSourceSha256:hash(readerSource),
  sourceCommit:'6'.repeat(40),nonce:'00000000-0000-0000-0000-000000000001',executionId:'00000000-0000-0000-0000-000000000002'};
const facts={ordinaryEdgeReady:true,moderatorPageConfirmed:true,isolatedBlankWindowReady:true,
  privateInputVisible:true,ownerPresent:true,signedScopeAndBudgetsVerified:true,sourceAndReaderVerified:true,
  ownerReadinessReceiptSha256:'7'.repeat(64)};
function setup(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-lease-offline-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let time=Date.parse('2026-10-30T01:00:00.000Z'),mono=0;
  const make=(patch={})=>createModeratorCheckpointLease({directory,binding,readerSource,readerParams:params,
    now:()=>time,monotonic:()=>mono,...patch});
  return {directory,make,lease:make(),advance:ms=>{time+=ms;mono+=ms;},clockOnly:ms=>{time+=ms;},now:()=>time,
    files:()=>fs.readdirSync(directory),read:suffix=>JSON.parse(fs.readFileSync(path.join(directory,
      fs.readdirSync(directory).find(f=>f.endsWith(suffix))),'utf8'))};
}
function result(s){return {schemaVersion:1,buildId:'0.2.6-mfa-enforcement-v1',methodBinding:binding.authorizationSha256,
  parentBinding:binding.parentBindingSha256,executionId:binding.executionId,nonce:binding.nonce,stage:'final',status:'PASS',
  startedUTC:new Date(s.now()).toISOString(),finishedUTC:new Date(s.now()).toISOString(),
  authHttpStatus:200,meHttpStatus:200,mfaHttpStatus:200,protectedHttpStatus:null,adminOnlyHttpStatus:null,
  anonymousMeHttpStatus:null,communityHttpStatus:null,identityMatches:true,protectedRole:'moderator',
  userIdSha256:params.expectedUserSha256,totpFactors:[{idSha256:params.primarySha256,status:'verified'},
    {idSha256:params.backupSha256,status:'verified'}],serverAal:'aal2',mfaErrorCode:null,
  dispatches:{auth:1,worker:2},retries:0,cleanup:'PASS',failure:null};}

test('moderator lease: human preparation can take hours without starting or spending the window',t=>{
  const s=setup(t);s.advance(7200000);
  assert.equal(s.lease.status().state,'PREPARING');assert.equal(s.files().some(f=>f.includes('reserved')),false);
  assert.equal(s.lease.prepare(facts).productionWindowStarted,false);
  const active=s.lease.activate();assert.equal(Date.parse(active.deadlineUtc)-s.now(),600000);
  assert.equal(Date.parse(active.deadlineUtc)-Date.parse(active.notBeforeUtc),600000);
  assert.deepEqual(active.reserved,{auth:1,worker:2});
  assert.equal(s.files().filter(f=>f.endsWith('.reserved.json')).length,3);
  assert.equal(hash(fs.readFileSync(active.scriptPath)),active.codeSha256);
  for(const suffix of ['.AUTH_GET.reserved.json','.WORKER_ME.reserved.json','.WORKER_MFA.reserved.json']){
    const intent=s.read(suffix);assert.equal(intent.codeSha256,active.codeSha256);assert.equal(intent.deadlineUtc,active.deadlineUtc);
  }
});

test('moderator lease: no owner acknowledgement or false/extra readiness facts cannot activate',t=>{
  const s=setup(t);assert.throws(()=>s.lease.activate(),/ACTIVATION_FAILED/);assert.equal(s.lease.status().state,'STOPPED');
  for(const patch of [{ownerPresent:false},{privateInputVisible:false},{extra:true},{ownerReadinessReceiptSha256:null}]){
    const dir=fs.mkdtempSync(path.join(s.directory,'child-'));
    const lease=s.make({directory:dir});assert.throws(()=>lease.prepare({...facts,...patch}),/PREPARATION_FAILED/);
    assert.throws(()=>lease.activate(),/ACTIVATION_FAILED/);assert.equal(fs.readdirSync(dir).some(f=>f.includes('reserved')),false);
  }
});

test('moderator lease: readiness expires before activation; it is not an execution lease',t=>{
  const s=setup(t);s.lease.prepare(facts);s.advance(30001);
  assert.throws(()=>s.lease.activate(),/ACTIVATION_FAILED/);assert.equal(s.files().some(f=>f.includes('reserved')),false);
  assert.throws(()=>s.lease.prepare(facts),/PREPARATION_FAILED/);
});

test('moderator lease: malformed source or identity pins are rejected before preparing',t=>{
  const s=setup(t);
  for(const patch of [{readerSource:readerSource+' '},{binding:{...binding,nonce:'invalid'}},
    {readerParams:{...params,secretAccessKey:'MUST_NOT_ACCEPT'}},{readerParams:{...params,primarySha256:params.backupSha256}}]){
    assert.throws(()=>s.make(patch),/BINDING_INVALID/);
  }
});

test('moderator lease: persistence failure before handoff never releases executable code or resets reservations',t=>{
  const s=setup(t);s.lease.prepare(facts);const prefix=s.files()[0].replace('.preparation.json','');
  fs.mkdirSync(path.join(s.directory,prefix+'.WORKER_ME.reserved.json'));
  assert.throws(()=>s.lease.activate(),/ACTIVATION_FAILED/);assert.equal(s.lease.status().state,'STOPPED');
  assert.equal(s.files().some(f=>f.endsWith('.browser.js')),false);
  assert.equal(s.files().some(f=>f.endsWith('.AUTH_GET.reserved.json')),true);
  assert.throws(()=>s.make(),/EEXIST/);assert.throws(()=>s.lease.activate(),/ACTIVATION_FAILED/);
});

test('moderator lease: clock jumps fail closed instead of silently extending execution',t=>{
  const s=setup(t);s.lease.prepare(facts);s.lease.activate();s.clockOnly(-3000);
  assert.equal(s.lease.status().state,'STOPPED');assert.throws(()=>s.lease.accept(result(s)),/RESULT_UNPROVEN/);
});

test('moderator lease: timeout, replay and foreign results retain the three UNKNOWN reservations',t=>{
  const s=setup(t);s.lease.prepare(facts);s.lease.activate();s.advance(600000);
  assert.throws(()=>s.lease.accept(result(s)),/RESULT_UNPROVEN/);assert.equal(s.files().filter(f=>f.endsWith('.reserved.json')).length,3);
  assert.equal(s.files().some(f=>f.endsWith('.result.safe.json')),false);assert.throws(()=>s.lease.activate(),/ACTIVATION_FAILED/);
});

test('moderator lease: exact minimized result verifies only readiness, not real D acceptance',t=>{
  const s=setup(t);s.lease.prepare(facts);s.lease.activate();s.advance(1000);
  const r=s.lease.accept(result(s));assert.equal(r.productionAuthority,false);assert.equal(r.kind,'VERIFIED_MODERATOR_READINESS_NOT_D_ACCEPTANCE');
  assert.equal(s.lease.status().state,'VERIFIED');assert.equal(s.read('.result.safe.json').serverAal,'aal2');
  assert.throws(()=>s.lease.accept(result(s)),/RESULT_UNPROVEN/);
});

test('moderator lease: altered identity, counts, nonce, times or extra secret fields cannot be imported',t=>{
  const s=setup(t);
  for(const patch of [{nonce:'foreign'},{userIdSha256:'9'.repeat(64)},{serverAal:'NOT_AAL2'},
    {dispatches:{auth:1,worker:3}},{startedUTC:'invalid'},{finishedUTC:'2027-01-01T00:00:00.000Z'},
    {access_token:'SECRET_MUST_NOT_PERSIST'},
    {totpFactors:[{idSha256:params.primarySha256,status:'verified'},{idSha256:params.primarySha256,status:'verified'}]}]){
    const dir=fs.mkdtempSync(path.join(s.directory,'child-')),lease=s.make({directory:dir});lease.prepare(facts);lease.activate();
    assert.throws(()=>lease.accept({...result(s),...patch}),/RESULT_UNPROVEN/);
    assert.equal(fs.readdirSync(dir).some(f=>f.endsWith('.result.safe.json')),false);
  }
});

test('moderator lease: a result persisted after the deadline remains an unaccepted candidate',t=>{
  const s=setup(t);s.lease.prepare(facts);s.lease.activate();
  const fsync=fs.fsyncSync;
  try{
    fs.fsyncSync=fd=>{fsync(fd);s.advance(600100);};
    assert.throws(()=>s.lease.accept(result(s)),/RESULT_UNPROVEN/);
  }finally{fs.fsyncSync=fsync;}
  assert.equal(s.read('.result.safe.json').kind,'READINESS_CANDIDATE_NOT_ACCEPTED');
  assert.equal(s.lease.status().state,'STOPPED');assert.throws(()=>s.lease.activate(),/ACTIVATION_FAILED/);
});

test('moderator lease: actual generated wrapper permits delayed manual delivery within ten minutes, never renewal',async t=>{
  const s=setup(t);s.lease.prepare(facts);const a=s.lease.activate();s.advance(180000);
  let calls=0,download=0;const w={};w.top=w;
  class Clock extends Date{static now(){return s.now();}}
  const context={window:w,location:{origin:'https://openglasshub.ogh.workers.dev',pathname:'/admin/security/',search:'',hash:''},
    Date:Clock,Blob,URL:{createObjectURL(){return 'blob:OFFLINE';},revokeObjectURL(){}},setTimeout(){},
    document:{body:{appendChild(){}},createElement:()=>({click(){download++;},remove(){}})},
    fixtureRead:async p=>{calls++;assert.equal(p.dispatchNotAfterUTC,a.deadlineUtc);return result(s);}};
  // The wrapper's only runtime is an isolated VM; fixtureRead never uses fetch.
  const code=fs.readFileSync(a.scriptPath,'utf8').replace(/^void /,'');
  await vm.runInNewContext(code,context);assert.equal(calls,1);assert.equal(download,1);
  await assert.rejects(vm.runInNewContext(code,context),/ALREADY_USED/);assert.equal(calls,1);
  s.advance(420000);context.window={};context.window.top=context.window;
  await assert.rejects(vm.runInNewContext(code,context),/LEASE_EXPIRED/);assert.equal(calls,1);
});
