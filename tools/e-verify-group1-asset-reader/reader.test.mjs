import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {loopbackTransport} from './wire.mjs';
let mod;try{mod=await import('./reader.mjs')}catch{}
const origin='https://app.example.invalid',deploymentURL='https://api.example.invalid/deployments',target='/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js';
const manifest=[{path:'/_astro/SiteHeader.astro_astro_type_script_index_0_lang.DaQNT1ww.js',bytes:1,sha256:'1'.repeat(64)},
 {path:'/_astro/SettingsPage.DImHgz8J.js',bytes:1,sha256:'2'.repeat(64)},{path:'/_astro/CommunityLayout.jf1vXvaF.css',bytes:1,sha256:'3'.repeat(64)}];
const budgets={totalGETMax:6,htmlGETMax:1,assetGETMax:3,providerDeploymentGETMax:2,concurrencyMax:4,hardSeconds:300,workSeconds:240,cleanupReserveSeconds:60,perRequestSeconds:1,maxHeaderBytes:8192,maxAssetBytes:2097152,anonymousAggregateBytesMax:16777216};
const options={origin,deploymentURL,loginURL:origin+'/login/?next=%2Fproducts%2F',requiredTarget:target,manifest,budgets};
function deployment(id='LOCAL_DEPLOYMENT'){return {deploymentId:id,activeVersion:'EXPECTED',activeTraffic:100,recoveryTraffic:0}}
async function fixture({unknown=false,redirect=false,large=false,stream=false,badJS=false,change=false,hang=false}={}){
 let dep=0;const requests=[],captured=[];
 const server=http.createServer((q,r)=>{requests.push(q.url);
  if(q.url==='/deployments'){r.setHeader('content-type','application/json');r.end(JSON.stringify(deployment(change&&++dep===2?'CHANGED':'LOCAL_DEPLOYMENT')));return}
  if(q.url.startsWith('/login/')){r.setHeader('content-type','text/html');r.end(`<script type="module" src="${target}"></script>`);return}
  r.setHeader('content-type','application/javascript');
  if(hang)return;
  if(redirect){r.writeHead(302,{location:'https://other.invalid/private'});r.end();return}
  if(large){r.setHeader('content-length','2097153');r.end();return}
  if(stream){r.end(Buffer.alloc(2097153));return}
  if(q.url===target){r.end(badJS?'import(window.PRIVATE_URL);':unknown?'import "./PRIVATE_USER.ABCDEFGH.js";':'import "./SettingsPage.NEW12345.js";');return}
  if(q.url==='/_astro/SettingsPage.NEW12345.js'){r.end('export const confirmation=()=>true;');return}
  r.writeHead(404);r.end();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const wire=loopbackTransport('http://127.0.0.1:'+server.address().port);
 const transport=(q,b)=>{const u=new URL(q.url);assert.ok([origin,'https://api.example.invalid'].includes(u.origin));return wire({...q,url:'https://qa.example.invalid'+u.pathname+u.search},b)};
 return {requests,captured,transport,capture:async(ref,body)=>{captured.push({ref,bytes:body.length});return {encrypted:true,ciphertextSha256:'e'.repeat(64),evidenceRef:ref}},async close(){server.closeAllConnections();await new Promise(r=>server.close(r))}};
}
async function run(f,extra={}){assert.ok(mod);return mod.runAssetRead({...options,transport:f.transport,providerHeaders:{accept:'application/json',authorization:'Bearer SYNTHETIC'},capture:f.capture,assertDeployment:r=>JSON.parse(r.body),...extra})}
test('real bounded reader is implemented',()=>assert.equal(typeof mod?.runAssetRead,'function'));
test('real HTTP reads changed build target then only its dependency, protects bytes and checks pre/post identity',async()=>{
 const f=await fixture();try{const r=await run(f);assert.equal(r.status,'CONTENT_EVIDENCE_COLLECTED');assert.equal(r.counts.total,5);assert.equal(r.counts.asset,2);
  assert.deepEqual(r.assets.map(x=>x.path),[target,'/_astro/SettingsPage.NEW12345.js']);assert.equal(r.sourceProvenance,'PENDING_OFFLINE_REVIEW');
  assert.equal(f.requests.some(x=>x.includes('DaQNT1ww')),false);assert.equal(f.captured.length,3);assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC|Bearer|export const/);
 }finally{await f.close()}
});
for(const [name,setup] of [['unreviewed dependency',{unknown:true}],['cross-host redirect',{redirect:true}],['oversized Content-Length',{large:true}],['oversized streaming body',{stream:true}],['unresolved import',{badJS:true}],['changed Production deployment',{change:true}],['hung request finite timeout',{hang:true}]])
 test('real HTTP safely stops: '+name,async()=>{const f=await fixture(setup);try{const r=await run(f);assert.equal(r.status,'BLOCKED');assert.equal(r.retries,0);assert.equal(r.writes,0);assert.ok(r.counts.total<=6);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_USER|PRIVATE_URL|other\.invalid|SYNTHETIC/)}finally{await f.close()}});
test('global request cap rejects next HTTP dispatch, including postcheck, without retry',async()=>{
 const f=await fixture();try{const r=await run(f,{budgets:{...budgets,totalGETMax:3}});assert.equal(r.status,'BLOCKED');assert.equal(r.firstFailure,'REQUEST_BUDGET');assert.equal(f.requests.length,3)}finally{await f.close()}
});
test('aggregate byte reserve rejects request before HTTP and does not refund failed requests',async()=>{
 const f=await fixture();try{const r=await run(f,{budgets:{...budgets,anonymousAggregateBytesMax:2097151}});assert.equal(r.status,'BLOCKED');assert.equal(r.firstFailure,'BYTE_BUDGET');assert.equal(f.requests.length,1)}finally{await f.close()}
});
test('atomic reservations prevent concurrent global/category overspend',()=>{
 assert.ok(mod);const b=new mod.ReadBudget(budgets);for(let i=0;i<3;i++)b.reserve('asset');assert.throws(()=>b.reserve('asset'),/REQUEST_BUDGET/);assert.equal(b.receipt().asset,3);
});
test('insufficient work time blocks before first network operation',async()=>{
 const f=await fixture();try{const r=await run(f,{workMs:1});assert.equal(r.status,'BLOCKED');assert.equal(f.requests.length,0)}finally{await f.close()}
});
test('safe capture failure stops; raw source never enters final receipt',async()=>{
 const f=await fixture();try{const r=await run(f,{capture:async()=>{throw new Error('CAPTURE_FAILED')}});assert.equal(r.status,'BLOCKED');assert.equal(r.firstFailure,'CAPTURE_FAILED');assert.doesNotMatch(JSON.stringify(r),/<script|SYNTHETIC/)}finally{await f.close()}
});
test('anonymous Cookie and duplicate provider headers stop before HTTP',async()=>{const f=await fixture();try{for(const headers of [{cookie:'PRIVATE'},{accept:'application/json',Accept:'application/json'}]){const r=await run(f,{providerHeaders:headers});assert.equal(r.firstFailure,'READ_HEADER_SCOPE');assert.equal(r.counts.total,0)}assert.equal(f.requests.length,0)}finally{await f.close()}});
test('concurrent dependency failure cancels in-flight requests and starts no later dependency',async()=>{
 const paths=['/_astro/SettingsPage.NEW12345.js','/_astro/CommunityLayout.NEW12345.css','/_astro/index.NEW12345.js'],requests=[];
 const server=http.createServer((q,r)=>{requests.push(q.url);if(q.url==='/deployments'){r.setHeader('content-type','application/json');r.end(JSON.stringify(deployment()))}else if(q.url.startsWith('/login/')){r.setHeader('content-type','text/html');r.end(`<script src="${target}"></script>`)}else if(q.url===target){r.setHeader('content-type','application/javascript');r.end(paths.map(p=>`import "${p}";`).join(''))}else if(q.url===paths[0]){r.writeHead(500);r.end()}else if(q.url===paths[1]){r.setHeader('content-type','text/css');setTimeout(()=>r.end('body{}'),500)}else{r.writeHead(404);r.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const wire=loopbackTransport('http://127.0.0.1:'+server.address().port);
 try{const result=await mod.runAssetRead({...options,manifest:[...manifest,{path:'/_astro/index.OLD12345.js'}],budgets:{...budgets,concurrencyMax:2,assetGETMax:4,totalGETMax:7},transport:(q,b)=>{const u=new URL(q.url);return wire({...q,url:'https://qa.example.invalid'+u.pathname+u.search},b)},providerHeaders:{accept:'application/json'},capture:async(ref)=>({encrypted:true,evidenceRef:ref,ciphertextSha256:'e'.repeat(64)}),assertDeployment:r=>JSON.parse(r.body)});assert.equal(result.status,'BLOCKED');assert.equal(requests.includes(paths[2]),false);assert.equal(result.counts.inFlight,0);assert.equal(result.counts.total,5);assert.equal(result.postDeployment,null)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
