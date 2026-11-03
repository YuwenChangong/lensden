import test from 'node:test';
import assert from 'node:assert/strict';
import {ordinarySignupIdentityEvidence} from './core-auth-admission-v2.mjs';
const id='11111111-1111-4111-8111-111111111111',binding='a'.repeat(64),email='owned+ogh-a3-0123456789abcdef@gmail.com';
function fixture(){
 const expected={id,binding,email,project:'xcbnxzjlsvtgzixurcof',namespace:'ogh-core-ordinary-fixture',createdAt:'2026-10-23T06:14:43.159Z'};
 return {expected,user:{id,email,created_at:expected.createdAt},sourceProject:expected.project,excludedIds:[],
 absence:{verified:true,sha256:'b'.repeat(64),binding,project:expected.project,email,matches:0},
 journal:{verified:true,sha256:'c'.repeat(64),binding,project:expected.project,namespace:expected.namespace,email,actorId:id,createdAt:expected.createdAt,submitCount:1,method:'NORMAL_OWNER_WEBSITE_SIGNUP'}};
}
test('normal signup exact absence journal and provider time bind without QA metadata',()=>{
 const r=ordinarySignupIdentityEvidence(fixture());assert.equal(r.identityVerified,true);assert.equal(r.productionAuthority,false);assert(!JSON.stringify(r).includes('@'));
});
test('normal signup never adopts existing unverified wrong-binding or ambiguous identity',()=>{
 for(const change of [f=>f.absence.matches=1,f=>f.absence.verified=false,f=>f.absence.binding='d'.repeat(64),f=>f.journal.verified=false,f=>f.journal.submitCount=2,f=>f.journal.actorId='other',f=>f.sourceProject='other',f=>f.excludedIds=[id]]){
  const f=fixture();change(f);assert.equal(ordinarySignupIdentityEvidence(f).identityVerified,false);
 }
});
test('normal signup missing invalid or changed provider timestamp fails without tolerance widening',()=>{
 for(const time of [undefined,'invalid','2026-10-23T06:14:43.160Z']){
  const f=fixture();f.user.created_at=time;assert.equal(ordinarySignupIdentityEvidence(f).identityVerified,false);
 }
});
