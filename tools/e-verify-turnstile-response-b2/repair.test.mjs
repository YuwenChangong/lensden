import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TurnstileGate,SDK,ORIGIN,CAPS}from'./gate.mjs';
import {ResponseJournal}from'./response-diagnostics.mjs';
import {makeReceipt,readReceipt,finalizeReceipt}from'./receipts.mjs';
import {TurnstileGate as OldGate}from'../e-verify-turnstile-isolated/gate.mjs';
import {ID,GO,validate,GATES}from'./authorization.mjs';
const q={url:SDK,method:'GET',headers:{},body:Buffer.alloc(0)};
const proof={frame:'main',type:'script',harnessBootstrap:true,initiator:{type:'script',urls:[]}};
const fixtures=[
 [200,undefined,null,'2xx',false,false],
 [200,'/private?token=PRIVATE_SENTINEL','REDIRECT_OR_LOCATION','2xx',false,true],
 ...[301,302,307,308].map(n=>[n,'https://challenges.cloudflare.com/private?token=PRIVATE_SENTINEL','REDIRECT_OR_LOCATION','3xx',true,true]),
 [304,undefined,'REDIRECT_OR_LOCATION','3xx',true,false],
 [399,undefined,'REDIRECT_OR_LOCATION','3xx',true,false],
 [500,undefined,'RESPONSE_STATUS_OR_SIZE','5xx',false,false],
 [undefined,undefined,'RESPONSE_STATUS_OR_SIZE','UNKNOWN',null,false],
];
for(const[n,location,reason,klass,redirect,hasLocation]of fixtures)test('response '+n+' location '+hasLocation,()=>{
 const gate=new TurnstileGate(),ticket=gate.admit(q,proof),headers={'content-type':'application/javascript'};
 if(location!==undefined)headers.Location=location;
 const r={status:n,headers,body:Buffer.from('fixture')};
 if(reason)assert.throws(()=>gate.validateResponse(ticket,r),new RegExp(reason));else gate.validateResponse(ticket,r);
 const m=gate.receipt().responses[0];assert.equal(m.HTTP_STATUS_CODE,Number.isInteger(n)?n:null);assert.equal(m.HTTP_STATUS_CLASS,klass);
 assert.equal(m.LOCATION_HEADER_PRESENT,hasLocation);assert.equal(m.REDIRECT_STATUS_TRIGGERED,redirect);assert.equal(m.LOCATION_HEADER_TRIGGERED,hasLocation);
 assert.equal(m.SDK_RESPONSE_REJECTION_REASON,reason);assert.ok(!JSON.stringify(m).includes('PRIVATE_SENTINEL'));
});
for(const[location,klass,same]of [['https://evil.invalid/path?token=PRIVATE_SENTINEL','OTHER_HTTPS_ORIGIN',false],['http://challenges.cloudflare.com/path','NON_HTTPS_ORIGIN',false],['/relative?token=PRIVATE_SENTINEL','SAME_ALLOWED_ORIGIN',true],['https://user:PRIVATE_SENTINEL@challenges.cloudflare.com/x','CREDENTIAL_BEARING',false],['','EMPTY_OR_INVALID',null],['https://[','EMPTY_OR_INVALID',null],['https://challenges.cloudflare.com:444/x','OTHER_HTTPS_ORIGIN',false]])test('Location classification '+klass+' '+same,()=>{
 const j=new ResponseJournal();j.start(1);j.headers(1,{status:302,headers:{location}});const r=j.receipt()[0];assert.equal(r.LOCATION_TARGET_ORIGIN_CLASS,klass);assert.equal(r.LOCATION_TARGET_SAME_ALLOWED_HOST,same);assert.ok(!JSON.stringify(r).includes('PRIVATE_SENTINEL'));
});
test('network error before status and body failure after headers remain distinct',()=>{
 const j=new ResponseJournal();j.start(1);j.fail(1,'NETWORK_FAILURE');j.start(2);j.headers(2,{status:200,headers:{}});j.fail(2,'BODY_INCOMPLETE');
 const[a,b]=j.receipt();assert.equal(a.HTTP_STATUS_CODE,null);assert.equal(a.LOCATION_HEADER_PRESENT,null);assert.equal(a.RESPONSE_HEADERS_OBSERVED,false);assert.equal(b.HTTP_STATUS_CODE,200);assert.equal(b.LOCATION_HEADER_PRESENT,false);assert.equal(b.SDK_RESPONSE_REJECTION_REASON,'BODY_INCOMPLETE');
});
test('response metadata persists when stream validation never returns body',()=>{
 const g=new TurnstileGate(),t=g.admit(q,proof);g.observeResponse(t,{status:302,headers:{location:'/private?token=PRIVATE_SENTINEL'}});g.responseFailure(t,'BODY_LIMIT');
 assert.equal(g.receipt().responses[0].HTTP_STATUS_CODE,302);assert.equal(g.receipt().responses[0].SDK_RESPONSE_REJECTION_REASON,'BODY_LIMIT');assert.equal(g.receipt().counts.thirdParty,1);
});
const result=(changes={})=>({firstFailure:null,status:{renderStarted:true,renderReturned:true,callback:true},registeredFrames:1,cleanup:true,wireDispatches:1,sdkResponseObserved:true,...changes});
test('aggregate status cannot be overwritten by phase object',()=>{const r=makeReceipt(result());assert.equal(r.executionStatus,'OBSERVED_ISOLATED_VENDOR_CHAIN');assert.equal(typeof r.executionStatus,'string');assert.equal(r.stageResults.callback,true);assert.equal(r.status,undefined)});
test('SDK failure is not success and cleanup success does not hide block',()=>{const r=makeReceipt(result({firstFailure:'REDIRECT_OR_LOCATION',status:{renderStarted:false,renderReturned:false,callback:false}}));assert.equal(r.executionStatus,'BLOCKED');assert.equal(r.failureStage,'SDK_LOAD');assert.equal(r.cleanupStatus,'PASS')});
test('cleanup failure never hidden by main failure or successful stages',()=>{for(const c of [null,'REDIRECT_OR_LOCATION']){const r=makeReceipt(result({firstFailure:c,cleanup:false}));assert.equal(r.executionStatus,'BLOCKED');assert.equal(r.cleanupStatus,'FAILED');assert.equal(r.failureCode,c||'CLEANUP_FAILED')}});
test('B2 stops before SDK execution without claiming init success',()=>{const r=makeReceipt(result({status:{renderStarted:false,renderReturned:false,callback:false},registeredFrames:0}),{responseOnly:true});assert.equal(r.executionStatus,'SDK_RESPONSE_OBSERVED');assert.equal(r.stageResults.callback,false)});
test('historical B1 compatibility preserves unknown response and true failure',()=>{
 const raw=JSON.parse(fs.readFileSync(new URL('../e-verify-turnstile-isolated/artifacts/ONLINE_SAFE.json',import.meta.url))),before=JSON.stringify(raw),r=readReceipt(raw);
 assert.equal(r.executionStatus,'BLOCKED');assert.equal(r.failureCode,'REDIRECT_OR_LOCATION');assert.equal(r.failureStage,'SDK_LOAD');assert.equal(r.cleanupStatus,'PASS');assert.deepEqual(r.responses,[]);assert.equal(r.historicalResponseMetadata,'NOT_RETAINED');assert.equal(JSON.stringify(raw),before);
});
test('new schema parses and rejects ambiguous result structure',()=>{const r=makeReceipt(result());assert.equal(readReceipt(r).executionStatus,r.executionStatus);assert.throws(()=>readReceipt({...r,executionStatus:{callback:true}}),/RECEIPT_SCHEMA/)});
test('final consumer checks explicit execution and independent cleanup/process outcomes',()=>{
 const good=makeReceipt(result({status:{renderStarted:false,renderReturned:false,callback:false},registeredFrames:0}),{responseOnly:true}),s={classification:'EXIT_ZERO',containment:{closed:true},reaped:true};
 assert.equal(finalizeReceipt(good,s).executionStatus,'SDK_RESPONSE_DIAGNOSTIC_COMPLETE');
 assert.equal(finalizeReceipt({...good,cleanupStatus:'FAILED'},s).executionStatus,'BLOCKED');
 assert.equal(finalizeReceipt(good,{...s,containment:{closed:false}}).executionStatus,'BLOCKED');
 assert.equal(finalizeReceipt(null,s).executionStatus,'BLOCKED');
});
test('unchanged unknown origin and bounded concurrent admission',async()=>{
 assert.throws(()=>new TurnstileGate().admit({...q,url:'https://evil.invalid/x'},proof),/UNAPPROVED_ORIGIN/);
 const g=new TurnstileGate({caps:{...CAPS,thirdParty:1}});g.admit(q,proof);assert.throws(()=>g.admit(q,proof),/SDK_REPLAY/);assert.equal(g.receipt().counts.thirdParty,1);
});
test('request admission code is unchanged except diagnostic registration',()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replaceAll('\r\n','\n');
 const old=read('../e-verify-turnstile-isolated/gate.mjs'),current=read('./gate.mjs');
 const a=old.slice(old.indexOf(' admit(q,p={})'),old.indexOf(' validateResponse(t,r)')).trim();
 const b=current.slice(current.indexOf(' admit(q,p={})'),current.indexOf(' observeResponse(t,r)')).replace('this.#responses.start(t.serial);','').trim();
 assert.equal(a,b);
});
test('response deny semantics unchanged for all fixtures and credentials',()=>{
 for(const[n,location]of fixtures){const response={status:n,headers:{'content-type':'application/javascript',...(location===undefined?{}:{location})},body:Buffer.from('fixture')};
  const codes=[OldGate,TurnstileGate].map(C=>{const g=new C(),t=g.admit(q,proof);try{g.validateResponse(t,response);return'ACCEPTED'}catch(e){return e.message}});assert.equal(codes[0],codes[1]);
 }
});
test('one supplier cap concurrency blocks every dynamic admission before dispatch',async()=>{
 const g=new TurnstileGate({caps:{...CAPS,thirdParty:1}}),t=g.admit(q,proof);g.validateResponse(t,{status:200,headers:{'content-type':'application/javascript'},body:Buffer.from('fixture')});g.startWidget();
 const out=await Promise.allSettled(Array.from({length:20},(_,i)=>Promise.resolve().then(()=>g.admit({...q,url:ORIGIN+'/dynamic-'+i},{frame:'main',type:'fetch',initiator:{type:'script',urls:[SDK]}}))));
 assert.ok(out.every(x=>x.status==='rejected'));assert.equal(g.receipt().counts.thirdParty,1);assert.equal(g.receipt().counts.global,1);
});
test('old B1 approval cannot authorize fresh B2, pending gates reject',()=>{
 const old=JSON.parse(fs.readFileSync(new URL('../e-verify-turnstile-isolated/artifacts/AUTHORIZATION_APPROVED.json',import.meta.url)));
 assert.throws(()=>validate(old,{packetHash:old.packetSha256,bindingHash:old.executionBindingSha256,now:Date.parse(old.authorizedAtUTC),go:GO,claimExists:false}),/AUTHORIZATION_INVALID/);
 const a={...old,authorizationId:ID,humanGates:Object.fromEntries(GATES.map(k=>[k,null]))};
 assert.throws(()=>validate(a,{packetHash:a.packetSha256,bindingHash:a.executionBindingSha256,now:Date.parse(a.authorizedAtUTC),go:GO,claimExists:false}),/HUMAN_GATES_REQUIRED/);
});
test('receipt Schema rejects sensitive unknown response fields',()=>{
 const j=new ResponseJournal();j.start(1);j.headers(1,{status:200,headers:{}});const r=makeReceipt({...result(),responses:j.receipt()});
 r.responses[0].location='https://evil.invalid/PRIVATE_SENTINEL';assert.throws(()=>readReceipt(r),/RECEIPT_SCHEMA/);
});
