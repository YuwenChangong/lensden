import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {createPrivateCapture,probeProtectedCapture,protectedOperation,readProtectedEvidence} from './private-evidence.mjs';
import {validateAuthorization,claimOnce,GO,HUMAN_GATES} from './authorization.mjs';import {sha256} from './hash.mjs';
const id='e-verify-group1-local-evidence-test';
test('real Windows DPAPI capture stores no plaintext and decrypts to the exact body hash',async()=>{
  assert.equal(probeProtectedCapture(id),true);
  const directory=path.join(os.tmpdir(),'ogh-private-evidence-test-'+Date.now());
  const capture=createPrivateCapture(directory,id),body=Buffer.from('SYNTHETIC_PRIVATE_SOURCE_MARKER');
  const result=await capture('login-html',body),cipher=fs.readFileSync(path.join(directory,'login-html.dpapi'));
  assert.equal(result.ciphertextSha256,sha256(cipher));assert.equal(cipher.includes(body),false);
  assert.equal(protectedOperation('CheckHash',id,{input:cipher}),sha256(body));
  assert.deepEqual(readProtectedEvidence(directory,id,'login-html',result.ciphertextSha256),body);
  assert.throws(()=>readProtectedEvidence(directory,id,'login-html','f'.repeat(64)),/PRIVATE_ARTIFACT_HASH/);
  await assert.rejects(capture('login-html',body),/CAPTURE_SCOPE/);
  assert.throws(()=>protectedOperation('CheckHash','e-verify-group1-other-id',{input:cipher}),/PROTECTED_CAPTURE_FAILED/);
});
test('formal authorization requires all five gates, correct hashes, full time and separate exact GO',()=>{
 const a={format:'e-verify-group1-authorization-v1',authorizationId:'e-verify-group1-reader-test',packetSha256:'1'.repeat(64),executionBindingSha256:'2'.repeat(64),authorizedAtUTC:'2026-10-13T00:00:00Z',authorizationExpiresUTC:'2026-10-13T00:15:00Z',humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,true]))};
 const o={packet:{authorizationId:a.authorizationId,executionLimitSeconds:300},packetSha256:a.packetSha256,bindingSha256:a.executionBindingSha256,now:Date.parse('2026-10-13T00:01:00Z'),go:GO,claimExists:false};
 assert.equal(validateAuthorization(a,o),true);
 for(const diff of [{claimExists:true},{packetSha256:'3'.repeat(64)},{now:Date.parse('2026-10-13T00:16:00Z')},{go:'GO_E_VERIFY_GROUP1_SAFE_SCRIPT_IDENTITY_DIAGNOSTIC_V1'}])assert.throws(()=>validateAuthorization(a,{...o,...diff}));
 assert.throws(()=>validateAuthorization({...a,humanGates:{...a.humanGates,operatorAvailableForEntireValidity:null}},o));
});
test('exclusive Claim cannot be created twice',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-claim-test-')),file=path.join(root,'once.claim');
 claimOnce(file,'e-verify-group1-local-test');assert.throws(()=>claimOnce(file,'e-verify-group1-local-test'));
 assert.equal(fs.readFileSync(file,'utf8'),'e-verify-group1-local-test\n');
});
