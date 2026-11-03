import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openGroup1Browser} from './execution/group1/browser.mjs';
import {runLoginDiagnostic} from './execution/group1/runner.mjs';
import {loopbackTransport} from './execution/wire.mjs';
import {validateAuthorization,GO,HUMAN_GATES} from './execution/group1/authorization.mjs';
import {scriptPathFingerprint} from './execution/group1/path-fingerprint.mjs';

const appOrigin='https://app.example.invalid',supabaseOrigin='https://db.example.invalid';
const buildRoot='C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub';
const oldRoot='C:/Temp/ogh-product-beta-development-20261013/tools/e-verify-group1-script-binding/execution/group1/artifacts';
const packet=JSON.parse(fs.readFileSync(path.join(oldRoot,'GROUP1_PACKET_NOT_AUTHORIZED.json')));
const account=(suffix,role='user')=>({userId:'00000000-0000-4000-8000-00000000000'+suffix,email:'qa'+suffix+'@example.invalid',applicationRole:role,exists:true,ownerControlled:true,dedicatedQA:true,legalConsentCurrent:true});
const privateBinding={budget:packet.ownerBudgets,accounts:{A:account('1'),B:account('2'),ADMIN:account('3','admin')}};
const manifest=packet.staticManifest;
const wait=async predicate=>{const end=performance.now()+5000;while(performance.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,15))}throw new Error('LOCAL_TEST_DEADLINE')};
async function fixture(html,{dynamicSource=null}={}){
  const requests=[];
  const server=http.createServer((q,r)=>{
    requests.push({method:q.method,path:q.url});
    if(q.url.startsWith('/login/')){r.setHeader('content-type','text/html');r.end(html);return}
    if(q.url==='/_astro/client.C9ykwJRQ.js'&&dynamicSource){r.setHeader('content-type','application/javascript');r.end(dynamicSource);return}
    const item=manifest.find(x=>x.path===q.url);
    if(item){r.setHeader('content-type',item.path.endsWith('.js')?'application/javascript':'text/css');r.end(fs.readFileSync(path.join(buildRoot,'dist/client',item.path)));return}
    r.writeHead(418);r.end();
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const wire=loopbackTransport('http://127.0.0.1:'+server.address().port);
  const transport=(q,bounds)=>{
    const u=new URL(q.url);if(u.origin!==appOrigin)throw new Error('OFFLINE_SCOPE');
    return wire({...q,url:'https://qa.example.invalid'+u.pathname+u.search},bounds);
  };
  const staticManifest=dynamicSource?manifest.map(x=>x.path==='/_astro/client.C9ykwJRQ.js'?{...x,bytes:Buffer.byteLength(dynamicSource),sha256:(awaitHash(dynamicSource))}:x):manifest;
  return {requests,staticManifest,transport,
    async open(options={}){return openGroup1Browser({caps:packet.ownerBudgets,actor:'A',binding:privateBinding.accounts.A,appOrigin,supabaseOrigin,staticPaths:staticManifest.map(x=>x.path),staticManifest,transport,headless:true,readOnlyLoginDiagnostic:true,workMs:15000,...options})},
    async close(){server.closeAllConnections();await new Promise(r=>server.close(r))}};
}
import {createHash} from 'node:crypto';
const awaitHash=text=>createHash('sha256').update(text).digest('hex');

test('real Chrome unknown build script has exact public identity in final Runner JSON; zero target dispatch',async()=>{
  const target='/_astro/AuthPanel.NEWBUILD.js';
  const f=await fixture(`<script type="module" src="${target}"></script>`);
  let result;
  try{
    result=await runLoginDiagnostic({privateBinding,appOrigin,supabaseOrigin,staticManifest:f.staticManifest,transport:f.transport,
      openBrowser:options=>f.open(options),installGuard:()=>{},deployment:async()=>({}),assertDeployment:()=>({deploymentId:'LOCAL_DEPLOYMENT',activeVersion:'REFERENCE',activeTraffic:100,recoveryTraffic:0}),observationMs:100});
    assert.equal(result.status,'BLOCKED');assert.equal(result.firstFailure,'DIAGNOSTIC_ROUTE_FORBIDDEN');
    const d=JSON.parse(JSON.stringify(result)).diagnostics.firstRejection;
    assert.equal(d.scriptIdentity.status,'PUBLIC_REFERENCE_UNMATCHED');assert.equal(d.scriptIdentity.publicPathname,target);
    assert.equal(d.scriptPathSha256,scriptPathFingerprint(target));assert.equal(d.networkDispatchOccurred,false);
    assert.equal(result.providerGETs,1);assert.equal(result.postDeployment,null);assert.equal(result.cleanup,'PASS');
    assert.equal(result.authDispatches,0);assert.equal(result.catalogCasesPassed,0);
    assert.equal(f.requests.some(q=>q.path===target),false);
  }finally{await f.close()}
});
test('real Chrome literal dynamic import from hash-verified script preserves target identity before rejection',async()=>{
  const target='/_astro/AuthPanel.DYNAMIC1.js',source=`import("./AuthPanel.DYNAMIC1.js");`;
  // Local fixture binds its synthetic importer bytes explicitly; production uses unchanged frozen bytes.
  const f=await fixture('<script type="module" src="/_astro/client.C9ykwJRQ.js"></script>',{dynamicSource:source});let b;
  try{b=await f.open();await b.navigate('/login/?next=%2Fproducts%2F').catch(()=>{});await wait(()=>b.receipt().firstFailure!==null);
    const d=b.receipt().diagnostics.firstRejection;assert.equal(d.scriptIdentity.publicPathname,target);
    assert.equal(d.scriptIdentity.referenceSource,'VERIFIED_BOUND_SCRIPT_IMPORT');assert.equal(d.networkDispatchOccurred,false);
    assert.equal(f.requests.some(x=>x.path===target),false);
  }finally{await b?.close();await f.close()}
});
test('unknown private filename remains explicitly privacy-blocked in real browser receipt',async()=>{
  const f=await fixture('<script src="/_astro/PRIVATE_PERSON.SECRET01.js?token=PRIVATE_TOKEN"></script>');let b;
  try{b=await f.open();await b.navigate('/login/?next=%2Fproducts%2F').catch(()=>{});await wait(()=>b.receipt().firstFailure!==null);
    const d=b.receipt().diagnostics.firstRejection;assert.equal(d.scriptIdentity.status,'PRIVACY_BLOCKED');assert.equal(d.scriptIdentity.publicPathname,null);
    assert.equal(d.networkDispatchOccurred,false);assert.doesNotMatch(JSON.stringify(b.receipt()),/PRIVATE_PERSON|SECRET01|PRIVATE_TOKEN|token=/);
    assert.equal(f.requests.length,1);
  }finally{await b?.close();await f.close()}
});
test('page modulepreload and island references disclose no sensitive query and stay unapproved',async()=>{
  const target='/_astro/client.FUTURE01.js';
  const f=await fixture(`<link rel="modulepreload" href="${target}?token=PRIVATE_QUERY">`);let b;
  try{b=await f.open();await b.navigate('/login/?next=%2Fproducts%2F').catch(()=>{});await wait(()=>b.receipt().firstFailure!==null);
    const d=b.receipt().diagnostics.firstRejection;assert.equal(d.scriptIdentity.publicPathname,target);
    assert.equal(d.scriptIdentity.contentVerified,false);assert.equal(d.networkDispatchOccurred,false);
    assert.doesNotMatch(JSON.stringify(b.receipt()),/PRIVATE_QUERY|token=/);assert.equal(f.requests.length,1);
  }finally{await b?.close();await f.close()}
});
test('failed static hash cannot be used to introduce trusted public references',async()=>{
  const f=await fixture('<script type="module" src="/_astro/client.C9ykwJRQ.js"></script>',{dynamicSource:'import("./AuthPanel.DYNAMIC1.js");'});let b;
  try{b=await f.open({staticManifest:manifest});await b.navigate('/login/?next=%2Fproducts%2F').catch(()=>{});await wait(()=>b.receipt().firstFailure!==null);
    assert.equal(b.receipt().firstFailure,'STATIC_SOURCE_MISMATCH');assert.equal(f.requests.some(x=>x.path.includes('DYNAMIC1')),false);
  }finally{await b?.close();await f.close()}
});
test('new exact GO, fresh identity and unconsumed Claim are mandatory',()=>{
  assert.equal(GO,'GO_E_VERIFY_GROUP1_SAFE_SCRIPT_IDENTITY_DIAGNOSTIC_V1');
  const a={format:'e-verify-group1-authorization-v1',authorizationId:'e-verify-group1-safe-test',packetSha256:'1'.repeat(64),executionBindingSha256:'2'.repeat(64),authorizedAtUTC:'2026-10-13T00:00:00Z',authorizationExpiresUTC:'2026-10-13T00:15:00Z',humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,true]))};
  const options={packet:{authorizationId:a.authorizationId,executionLimitSeconds:300},packetSha256:a.packetSha256,bindingSha256:a.executionBindingSha256,now:Date.parse('2026-10-13T00:01:00Z'),go:GO,claimExists:false};
  assert.equal(validateAuthorization(a,options),true);assert.throws(()=>validateAuthorization(a,{...options,claimExists:true}));
  assert.throws(()=>validateAuthorization(a,{...options,go:'GO_E_VERIFY_GROUP1_SCRIPT_FINGERPRINT_DIAGNOSTIC_V1'}));
  assert.throws(()=>validateAuthorization({...a,authorizationId:'consumed-diagnostic-v3'},options));
  assert.throws(()=>validateAuthorization(a,{...options,now:Date.parse('2026-10-13T00:15:00Z')}));
});
test('actual entry with no GO stops before any new authorization, Claim, OAuth or network',()=>{
  const entry=fileURLToPath(new URL('./execution/group1/entry.mjs',import.meta.url));
  const r=spawnSync(process.execPath,[entry],{encoding:'utf8',timeout:5000,windowsHide:true,env:{SystemRoot:process.env.SystemRoot}});
  assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).firstFailure,'EXACT_GO_REQUIRED');
  const root=new URL('./execution/group1/artifacts/',import.meta.url);
  for(const file of ['GROUP1_ONCE.claim','AUTHORIZED_GROUP1.json'])assert.equal(fs.existsSync(new URL(file,root)),false);
});
