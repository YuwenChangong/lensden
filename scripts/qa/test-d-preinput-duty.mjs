import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {claimDExecution,sealDRevocationDutyBeforeInput,receiveDConfirmedHeadCredentials,
  dLoaderFailureDetails} from './d-execution-runtime.mjs';
import {dHash,sealDRecord} from './d-execution-journal.mjs';

function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-duty-regression-'));
  t.after(()=>{assert.equal(path.dirname(directory),os.tmpdir());
    assert.match(path.basename(directory),/^ogh-duty-regression-/);fs.rmSync(directory,{recursive:true});});
  const plan={directory,runId:randomUUID(),sourceAdoption:{sha256:'0'.repeat(64)},tokenLabel:'FICTITIOUS_TOKEN_LABEL'};
  return {directory,plan};
}

test('pre-input: a preserved predecessor duty cannot block a separately authorized source claim',t=>{
  const {directory,plan}=fixture(t),old=path.join(directory,'TOKEN_REVOCATION_DUTY.before-input.safe.json');
  const oldBytes=Buffer.from('{"preserved":"OLD_STOPPED_NOT_PASS"}\n');fs.writeFileSync(old,oldBytes,{flag:'wx'});
  const oldClaim=claimDExecution({claimDirectory:directory,plan:{...plan,sourceAdoption:{sha256:'1'.repeat(64)}}});
  const newClaim=claimDExecution({claimDirectory:directory,plan});
  const duty=sealDRevocationDutyBeforeInput(plan);
  assert.notEqual(duty,old);assert.deepEqual(fs.readFileSync(old),oldBytes);
  assert.equal(JSON.parse(fs.readFileSync(duty)).authorizationSha256,plan.sourceAdoption.sha256);
  assert.equal(fs.existsSync(oldClaim),true);assert.equal(fs.existsSync(newClaim),true);
  assert.throws(()=>claimDExecution({claimDirectory:directory,plan}));
});

test('pre-input: duplicate or failed scoped duty stays fail-closed and never overwrites evidence',t=>{
  const {directory,plan}=fixture(t),file=sealDRevocationDutyBeforeInput(plan),before=fs.readFileSync(file);
  assert.throws(()=>sealDRevocationDutyBeforeInput(plan),/^Error: D_REVOCATION_DUTY_UNPROVEN$/);
  assert.deepEqual(fs.readFileSync(file),before);
  assert.throws(()=>sealDRevocationDutyBeforeInput({...plan,directory:path.join(directory,'absent')}),
    /^Error: D_REVOCATION_DUTY_UNPROVEN$/);
  assert.deepEqual(dLoaderFailureDetails('REVOCATION_DUTY',Error('D_REVOCATION_DUTY_UNPROVEN')),
    {localPhase:'REVOCATION_DUTY',localReason:'D_REVOCATION_DUTY_UNPROVEN'});
});

test('pre-input chain: old duty -> new claim/duty -> receiver ACK -> fictitious input -> confirmation',async t=>{
  const {directory,plan}=fixture(t),nonce=randomUUID(),binding=plan.sourceAdoption.sha256;
  sealDRecord(path.join(directory,'TOKEN_REVOCATION_DUTY.before-input.safe.json'),{oldStoppedAttempt:true});
  claimDExecution({claimDirectory:directory,plan});sealDRevocationDutyBeforeInput(plan);
  const fake={accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)};
  const server=createServer(socket=>{
    socket.on('error',()=>{});let ack='';
    socket.on('data',data=>{ack+=data.toString('ascii');if(!ack.endsWith('\n'))return;
      assert.equal(ack,`OGH_HEAD_RECEIVER_V1 ${binding} ${nonce}\n`);
      socket.end(JSON.stringify({schemaVersion:1,binding,nonce,...fake}));});
  });
  const pipe=process.platform==='win32'?'\\\\.\\pipe\\OGHR2HeadCredentials-Fixture-'+nonce:path.join(directory,'input.sock');
  await new Promise(resolve=>server.listen(pipe,resolve));
  const confirmationPath=path.join(directory,'supplier-confirmation.'+nonce+'.safe.json');
  let result;
  try {
    result=await receiveDConfirmedHeadCredentials({directory,runId:plan.runId,bindingSha256:binding,
      tokenLabel:plan.tokenLabel,offlineFixture:true,input:{nonce,deadlineUtc:new Date(Date.now()+4000).toISOString()},
      supplierConfirmation:{path:confirmationPath,deadlineUtc:new Date(Date.now()+5000).toISOString()},
      onReceived:r=>{
        const supplierPath=path.join(directory,'supplier-evidence.'+nonce+'.safe.json');
        sealDRecord(supplierPath,{account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',
          tokenLabel:plan.tokenLabel,permission:'object-read-only',ttlHours:24,createdAfterVisiblePrompt:true,
          issuedUtc:r.receivedUtc,expiresUtc:new Date(Date.parse(r.receivedUtc)+86400000).toISOString()});
        sealDRecord(confirmationPath,{schemaVersion:1,runId:plan.runId,nonce,sourceAdoptionSha256:binding,
          tokenLabel:plan.tokenLabel,provenance:'OWNER_OFFICIAL_DASHBOARD',ownerConfirmed:true,
          confirmedUtc:new Date().toISOString(),supplierEvidence:{path:supplierPath,sha256:dHash(fs.readFileSync(supplierPath))}});
      }});
    assert.deepEqual(result.credentials,fake);
    const stored=fs.readdirSync(directory).filter(n=>n.endsWith('.json')).map(n=>fs.readFileSync(path.join(directory,n),'utf8')).join('');
    for(const value of Object.values(fake))assert.equal(stored.includes(value),false);
    assert.equal(fs.readdirSync(directory).some(n=>n.startsWith('d-receipt-')),false);
  }finally{for(const key of Object.keys(result?.credentials??{}))result.credentials[key]='';await new Promise(resolve=>server.close(resolve));}
});
