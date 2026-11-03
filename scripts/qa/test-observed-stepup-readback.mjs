import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateObservedStepup} from './mfa-stepup-observation.mjs';
function fixture(){
 const hashes=['b'.repeat(64),'c'.repeat(64)],binding='a'.repeat(64),nonce='11111111-1111-4111-8111-111111111111';
 return [{submitEvent:'TRUSTED_OBSERVED',cleanup:'PASS',blocked:null,methodsRestored:{challenge:'RESTORED',verify:'RESTORED'},challenge:{invocations:1,completion:'RETURNED',success:true},verify:{invocations:1,completion:'RETURNED',success:true}},
 {methodBinding:binding,nonce,stage:'aal2',startedUTC:'2026-10-25T10:01:00.000Z',finishedUTC:'2026-10-25T10:01:01.000Z',status:'PASS',cleanup:'PASS',failure:null,retries:0,identityMatches:true,protectedRole:'moderator',userIdSha256:'d'.repeat(64),serverAal:'aal2',mfaErrorCode:null,authHttpStatus:200,meHttpStatus:200,mfaHttpStatus:200,protectedHttpStatus:200,adminOnlyHttpStatus:403,anonymousMeHttpStatus:401,communityHttpStatus:200,dispatches:{auth:1,worker:6},totpFactors:hashes.map(idSha256=>({idSha256,status:'verified'}))},
 {error:null,data:{currentLevel:'aal2'}},
 {ownerApprovalVerified:true,binding,nonce,independentCustodyReused:true,userSha256:'d'.repeat(64),factorHashes:hashes,approvedUTC:'2026-10-25T10:00:00Z',windowEndUTC:'2026-10-25T13:00:00Z',now:Date.parse('2026-10-25T10:01:02Z')}];
}
test('new manual stepup requires observed calls SDK assurance and real protected readbacks',()=>assert.equal(evaluateObservedStepup(...fixture()).status,'PASS'));
test('final new readback reuses observed stepup without an extra verification call',()=>{
 const f=fixture();f[3].stage=f[1].stage='final';f[1].dispatches.worker=4;f[1].anonymousMeHttpStatus=f[1].communityHttpStatus=null;
 assert.equal(evaluateObservedStepup(...f).status,'PASS');
});
test('UI success cannot replace AAL role factor identity or actual budget evidence',()=>{
 for(const change of [f=>f[1].mfaHttpStatus=403,f=>f[2].data.currentLevel='aal1',f=>f[1].protectedRole='admin',f=>f[1].adminOnlyHttpStatus=200,f=>f[1].totpFactors[1]=f[1].totpFactors[0],f=>f[1].dispatches.worker=2,f=>f[1].identityMatches=false]){const f=fixture();change(f);assert.equal(evaluateObservedStepup(...f).status,'BLOCKED');}
});
test('unknown verify cleanup or stale/reused request cannot admit database work',()=>{
 for(const change of [f=>f[0].verify.success=null,f=>f[0].cleanup='UNCONFIRMED',f=>f[1].nonce='other',f=>f[1].startedUTC='2026-10-25T09:00:00Z',f=>f[3].now=Date.parse('2026-10-25T13:00:00Z'),f=>f[3].ownerApprovalVerified=false]){const f=fixture();change(f);assert.equal(evaluateObservedStepup(...f).status,'BLOCKED');}
});
test('truthy approval flags and unapproved window extensions cannot admit stepup',()=>{
 for(const change of [f=>f[3].ownerApprovalVerified='true',f=>f[3].independentCustodyReused='true',f=>f[3].windowEndUTC='2026-10-25T14:00:00Z',f=>f[3].nonce=f[1].nonce='------------------------------------']){
  const f=fixture();change(f);assert.equal(evaluateObservedStepup(...f).status,'BLOCKED');
 }
});
