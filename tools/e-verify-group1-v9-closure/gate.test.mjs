import test from 'node:test';import assert from 'node:assert/strict';
import {Group1Gate,SharedBudget,validateResponse} from './gate.mjs';
import {ownedReadKey} from './cached-read.mjs';
import {validateAuthorization,GO,HUMAN_GATES} from '../e-verify-group1-remaining-assets/authorization.mjs';
const caps={allBrowserHttpDispatchesMax:500,applicationMutationDispatchesMax:50,supabaseAuthDispatchesMax:40,supabaseRestReadDispatchesMax:80,ownerSessionRefreshRequestsMax:6,executionSecondsMax:1800};
const binding={userId:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid',applicationRole:'user'};
function setup(){
 const gate=new Group1Gate({caps,actor:'A',binding,appOrigin:'https://app.example.invalid',supabaseOrigin:'https://db.example.invalid'});
 gate.permitLogin('success');const t=gate.reserve({url:'https://db.example.invalid/auth/v1/token?grant_type=password',method:'POST',body:Buffer.from(JSON.stringify({email:binding.email,password:'SYNTHETIC_ONLY',gotrue_meta_security:{captcha_token:'SYNTHETIC'}}))});
 gate.acceptSession(t,{access_token:'SYNTHETIC_ACCESS',refresh_token:'SYNTHETIC_REFRESH',user:{id:binding.userId,email:binding.email}});gate.complete(t);return gate;
}
const own=token=>({url:'https://app.example.invalid/api/users/me/summary',method:'GET',actor:'A',headers:{authorization:'Bearer '+token},body:Buffer.alloc(0)});
test('valid refresh creates a distinct authenticated GET generation, not a Mutation replay exemption',()=>{
 const gate=setup(),first=gate.reserve(own('SYNTHETIC_ACCESS'));gate.complete(first);
 const t=gate.reserve({url:'https://db.example.invalid/auth/v1/token?grant_type=refresh_token',method:'POST',body:Buffer.from('{"refresh_token":"SYNTHETIC_REFRESH"}')});
 gate.acceptSession(t,{access_token:'SYNTHETIC_NEXT',refresh_token:'SYNTHETIC_REFRESH_NEXT',user:{id:binding.userId,email:binding.email}});gate.complete(t);
 gate.complete(gate.reserve(own('SYNTHETIC_NEXT')));
 assert.equal(gate.receipt().counts.ownerSessionRefreshRequestsMax,1);
 assert.throws(()=>gate.reserve(own('SYNTHETIC_NEXT')),/REQUEST_REPLAY/);
});
test('same-session GET replay is still rejected',()=>{const g=setup();g.complete(g.reserve(own('SYNTHETIC_ACCESS')));assert.throws(()=>g.reserve(own('SYNTHETIC_ACCESS')),/REQUEST_REPLAY/)});
test('old or other session cannot use a cached own read',()=>assert.throws(()=>ownedReadKey(own('SYNTHETIC_OTHER'),'https://app.example.invalid',{authorization:'Bearer SYNTHETIC_ACCESS'}),/CACHED_READ_SCOPE/));
test('cached response cannot bypass credential-cookie rejection',()=>assert.throws(()=>ownedReadKey({...own('SYNTHETIC_ACCESS'),headers:{authorization:'Bearer SYNTHETIC_ACCESS',cookie:'session=DO_NOT_RECORD'}},'https://app.example.invalid',{authorization:'Bearer SYNTHETIC_ACCESS'}),/COOKIE_SCOPE/));
test('cache never includes other routes or mutations',()=>{for(const q of [{...own('SYNTHETIC_ACCESS'),method:'POST'},{...own('SYNTHETIC_ACCESS'),url:'https://app.example.invalid/api/admin/devices'}])assert.throws(()=>ownedReadKey(q,'https://app.example.invalid',{authorization:'Bearer SYNTHETIC_ACCESS'}))});
test('shared atomic reservation cannot partially consume a class on failure',()=>{const b=new SharedBudget({...caps,supabaseAuthDispatchesMax:0});assert.throws(()=>b.reserve(['allBrowserHttpDispatchesMax','supabaseAuthDispatchesMax']),/BUDGET_EXCEEDED/);assert.equal(b.receipt().allBrowserHttpDispatchesMax,0)});
test('refresh cannot cross identities or restore catalog access without explicit identity verification',()=>{
 const g=setup();const t=g.reserve({url:'https://db.example.invalid/auth/v1/token?grant_type=refresh_token',method:'POST',body:Buffer.from('{"refresh_token":"SYNTHETIC_REFRESH"}')});
 assert.throws(()=>g.acceptSession(t,{access_token:'SYNTHETIC_NEXT',refresh_token:'SYNTHETIC_NEXT_REFRESH',user:{id:'00000000-0000-4000-8000-000000000002',email:binding.email}}),/SESSION_IDENTITY/);
});
test('expired authorization and consumed Claim remain unreplayable',()=>{
 const a={format:'e-verify-group1-authorization-v1',authorizationId:'OFFLINE_ONLY',packetSha256:'1'.repeat(64),executionBindingSha256:'2'.repeat(64),authorizedAtUTC:'2026-10-13T00:00:00Z',authorizationExpiresUTC:'2026-10-13T01:00:00Z',humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,true]))};
 const o={packet:{authorizationId:a.authorizationId,executionLimitSeconds:300},packetSha256:a.packetSha256,bindingSha256:a.executionBindingSha256,go:GO,now:Date.parse('2026-10-13T00:01:00Z'),claimExists:false};
 assert.equal(validateAuthorization(a,o),true);assert.throws(()=>validateAuthorization(a,{...o,claimExists:true}));assert.throws(()=>validateAuthorization(a,{...o,now:Date.parse(a.authorizationExpiresUTC)}));
});
test('wrong profile role cannot pass explicit identity verification',()=>{
 const g=setup(),r=x=>({status:200,body:Buffer.from(JSON.stringify(x))});assert.throws(()=>g.verifyIdentity(r({id:binding.userId,email:binding.email}),r([{id:binding.userId,role:'admin'}])),/IDENTITY_OR_ROLE_MISMATCH/);
});
test('refresh ceiling is checked before transport admission',()=>{
 const g=new Group1Gate({caps:{...caps,ownerSessionRefreshRequestsMax:0},actor:'A',binding,appOrigin:'https://app.example.invalid',supabaseOrigin:'https://db.example.invalid'});
 g.permitLogin('success');const t=g.reserve({url:'https://db.example.invalid/auth/v1/token?grant_type=password',method:'POST',body:Buffer.from(JSON.stringify({email:binding.email,password:'SYNTHETIC_ONLY',gotrue_meta_security:{captcha_token:'SYNTHETIC'}}))});g.acceptSession(t,{access_token:'SYNTHETIC_ACCESS',refresh_token:'SYNTHETIC_REFRESH',user:{id:binding.userId,email:binding.email}});g.complete(t);
 assert.throws(()=>g.reserve({url:'https://db.example.invalid/auth/v1/token?grant_type=refresh_token',method:'POST',body:Buffer.from('{"refresh_token":"SYNTHETIC_REFRESH"}')}),/BUDGET_EXCEEDED/);assert.equal(g.receipt().counts.ownerSessionRefreshRequestsMax,0);
});
test('unapproved background Mutation is rejected before admission',()=>{const g=setup(),before=g.receipt().counts.allBrowserHttpDispatchesMax;assert.throws(()=>g.reserve({...own('SYNTHETIC_ACCESS'),url:'https://app.example.invalid/api/admin/devices',method:'DELETE'}),/UNAPPROVED_REQUEST/);assert.equal(g.receipt().counts.allBrowserHttpDispatchesMax,before)});
test('actor/session leakage is refused before wire',()=>{for(const q of [{...own('SYNTHETIC_ACCESS'),actor:'B'},own('SYNTHETIC_OTHER')])assert.throws(()=>setup().reserve(q),/ACTOR_CROSS_USE|SESSION_CROSS_USE/)});
test('work deadline stops admission even with remaining counters',()=>{let now=0;const g=new Group1Gate({caps,actor:'A',binding,appOrigin:'https://app.example.invalid',supabaseOrigin:'https://db.example.invalid',clock:()=>now,workMs:100});now=100;assert.throws(()=>g.reserve({url:'https://app.example.invalid/products/',method:'GET'}),/WORK_DEADLINE/);assert.equal(g.receipt().counts.allBrowserHttpDispatchesMax,0)});
test('redirect, Location and Set-Cookie responses remain rejected',()=>{const t={expected:[200],maxBytes:100};for(const r of [{status:302,headers:{}},{status:200,headers:{Location:'/products/'}},{status:200,headers:{'Set-Cookie':'DO_NOT_RECORD'}}])assert.throws(()=>validateResponse(t,{...r,body:Buffer.alloc(0)}))});
