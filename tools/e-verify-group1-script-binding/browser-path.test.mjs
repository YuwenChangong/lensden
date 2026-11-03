import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openGroup1Browser} from './execution/group1/browser.mjs';
import {loopbackTransport} from './execution/wire.mjs';
import {scriptPathFingerprint} from './execution/group1/path-fingerprint.mjs';
import {buildRoot,inspectBuild} from './build-evidence.mjs';
import {validateAuthorization,GO} from './execution/group1/authorization.mjs';

const appOrigin='https://app.example.invalid',supabaseOrigin='https://db.example.invalid';
const account={userId:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid',applicationRole:'user'};
const packet=JSON.parse(fs.readFileSync(new URL('../e-verify-group1-login-diagnostics/execution/group1/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json',import.meta.url)));
const staticManifest=packet.staticManifest;
const islandRuntime=fs.readFileSync(buildRoot+'/node_modules/astro/dist/runtime/server/astro-island.js','utf8');
function islandHtml(){
  const props={locale:[0,'en'],next:[0,'/products/'],initialMode:[0,'login'],captchaMode:[0,'required'],authTurnstileSiteKey:[0,'synthetic-public-sitekey']};
  const encoded=JSON.stringify(props).replaceAll('&','&amp;').replaceAll('"','&quot;');
  return `<!doctype html><link rel="modulepreload" href="/_astro/client.C9ykwJRQ.js">
    <link rel="stylesheet" href="/_astro/CommunityLayout.jf1vXvaF.css">
    <link rel="stylesheet" href="/_astro/SiteHeader.BKThlVlH.css">
    <script>window.process={env:{NODE_ENV:'production'}};window.Astro={only:async load=>{const hydrate=await load();await hydrate()}};</script>
    <script>${islandRuntime}</script>
    <astro-island component-url="/_astro/AuthPanel.EZiCXg-9.js" component-export="default"
      renderer-url="/_astro/client.C9ykwJRQ.js" props="${encoded}" client="only" ssr opts="{}"></astro-island>`;
}
async function fixture({html=islandHtml(),diagnostic=false,caps=packet.ownerBudgets}={}){
  const received=[];
  const server=http.createServer((q,r)=>{
    received.push({method:q.method,path:q.url});
    if(q.url.startsWith('/login/')){r.setHeader('content-type','text/html');r.end(html);return}
    const item=staticManifest.find(x=>x.path===q.url);
    if(item){r.setHeader('content-type',item.path.endsWith('.js')?'application/javascript':'text/css');r.end(fs.readFileSync(path.join(buildRoot,'dist/client',item.path)));return}
    if(q.url==='/turnstile/v0/api.js?render=explicit'){
      r.setHeader('content-type','application/javascript');
      // No token is issued and no challenge is solved in this local diagnostic.
      r.end('window.turnstile={render(){return "local-widget"},reset(){},remove(){}}');return;
    }
    r.writeHead(418);r.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const wire=loopbackTransport('http://127.0.0.1:'+server.address().port);
  const transport=(q,bounds)=>{
    const u=new URL(q.url);
    if(![appOrigin,'https://challenges.cloudflare.com'].includes(u.origin))throw new Error('OFFLINE_ORIGIN_FORBIDDEN');
    return wire({...q,url:'https://qa.example.invalid'+u.pathname+u.search},bounds);
  };
  let browser;
  try{browser=await openGroup1Browser({caps,actor:'A',binding:account,appOrigin,supabaseOrigin,staticPaths:staticManifest.map(x=>x.path),staticManifest,transport,headless:true,workMs:15000,readOnlyLoginDiagnostic:diagnostic})}
  catch(error){server.closeAllConnections();await new Promise(r=>server.close(r));throw error}
  return {browser,received,async close(){await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}};
}
const until=async predicate=>{const end=performance.now()+5000;while(performance.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,20))}throw new Error('LOCAL_ASSERTION_DEADLINE')};

test('real Chrome hydrates frozen Astro/React/AuthPanel chunks including modulepreload and dynamic import without Auth dispatch',async()=>{
  const evidence=await inspectBuild();assert.equal(evidence.missingLocalStaticBindings.length,0);
  const f=await fixture();
  try{
    await f.browser.navigate('/login/?next=%2Fproducts%2F');
    await f.browser.page.waitForSelector('input[type=email]');
    await until(()=>f.browser.page.evaluate(()=>document.querySelector('astro-island')?.hasAttribute('ssr')===false));
    await until(()=>f.browser.receipt().inFlight===0);
    const receipt=f.browser.receipt();assert.equal(receipt.firstFailure,null);
    assert.equal(receipt.counts.supabaseAuthDispatchesMax,0);
    assert.ok(f.received.some(x=>x.path==='/_astro/AuthPanel.EZiCXg-9.js'));
    assert.ok(f.received.some(x=>x.path==='/_astro/client.C9ykwJRQ.js'));
    assert.ok(f.received.some(x=>x.path==='/_astro/supabase-browser.CbJzQpCJ.js'));
    assert.ok(receipt.wireDispatches<=packet.ownerBudgets.allBrowserHttpDispatchesMax);
    assert.equal(f.received.some(x=>x.path.startsWith('/auth/')||x.method!=='GET'),false);
    assert.equal(receipt.diagnostics.firstRejection,null);
  }finally{await f.close()}
});
test('real Chrome reports denied script fingerprint before any script wire dispatch',async()=>{
  const f=await fixture({html:'<!doctype html><script src="/_astro/missing.js?private=DO_NOT_RECORD"></script>',diagnostic:true});
  try{
    await f.browser.navigate('/login/?next=%2Fproducts%2F').catch(()=>{});
    await until(()=>f.browser.receipt().firstFailure!==null);
    const d=f.browser.receipt().diagnostics.firstRejection;
    assert.equal(d.scriptPathSha256,scriptPathFingerprint('/_astro/missing.js'));
    assert.equal(d.normalizedRoute,'/:unbound');
    assert.equal(d.networkDispatchOccurred,false);
    assert.equal(f.received.some(x=>x.path.includes('missing.js')),false);
    assert.doesNotMatch(JSON.stringify(f.browser.receipt()),/DO_NOT_RECORD|private=|missing\.js/);
  }finally{await f.close()}
});
test('real Chrome strict diagnostic still stops at eight admitted browser GETs without budget increase',async()=>{
  const paths=[...staticManifest.filter(x=>x.path.endsWith('.css')),staticManifest.find(x=>x.path==='/_astro/client.C9ykwJRQ.js')];
  assert.equal(paths.length,8);
  const f=await fixture({html:'<!doctype html>'+paths.map(x=>`<link rel="${x.path.endsWith('.css')?'stylesheet':'modulepreload'}" href="${x.path}">`).join(''),diagnostic:true});
  try{
    await f.browser.navigate('/login/?next=%2Fproducts%2F').catch(()=>{});
    await until(()=>f.browser.receipt().firstFailure!==null);
    const receipt=f.browser.receipt();assert.equal(receipt.firstFailure,'BUDGET_EXCEEDED');
    assert.equal(receipt.counts.allBrowserHttpDispatchesMax,8);
    assert.ok(f.received.length<=8);
  }finally{await f.close()}
});
test('fresh GO is separate and consumed/expired or foreign authorization cannot replay',()=>{
  assert.equal(GO,'GO_E_VERIFY_GROUP1_SCRIPT_FINGERPRINT_DIAGNOSTIC_V1');
  const a={format:'e-verify-group1-authorization-v1',authorizationId:'e-verify-group1-test',packetSha256:'1'.repeat(64),executionBindingSha256:'2'.repeat(64),authorizedAtUTC:'2026-10-13T00:00:00Z',authorizationExpiresUTC:'2026-10-13T00:15:00Z',humanGates:Object.fromEntries(['subsetBoundary2AndResidualCasesAccepted','authSecurityLogSideEffectsAccepted','manualTurnstileAndPrivateIdentityReady','catalogHoldAndPostHardeningRecoveryAccepted','operatorAvailableForEntireValidity'].map(k=>[k,true]))};
  const context={packet:{authorizationId:a.authorizationId,executionLimitSeconds:300},packetSha256:a.packetSha256,bindingSha256:a.executionBindingSha256,now:Date.parse('2026-10-13T00:01:00Z'),go:GO,claimExists:false};
  assert.equal(validateAuthorization(a,context),true);
  assert.throws(()=>validateAuthorization(a,{...context,claimExists:true}));
  assert.throws(()=>validateAuthorization(a,{...context,now:Date.parse('2026-10-13T00:16:00Z')}));
  assert.throws(()=>validateAuthorization(a,{...context,go:'GO_E_VERIFY_GROUP1_LOGIN_A_DIAGNOSTIC_V1'}));
  assert.throws(()=>validateAuthorization({...a,authorizationId:'consumed-id'},context));
});
test('real new entry without independent GO exits before authorization, Claim, OAuth or network',()=>{
  const entry=fileURLToPath(new URL('./execution/group1/entry.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[entry],{encoding:'utf8',timeout:5000,windowsHide:true,env:{SystemRoot:process.env.SystemRoot}});
  assert.equal(run.status,1);assert.equal(JSON.parse(run.stdout).firstFailure,'EXACT_GO_REQUIRED');
  const root=new URL('./execution/group1/artifacts/',import.meta.url);
  assert.equal(fs.existsSync(new URL('GROUP1_ONCE.claim',root)),false);
  assert.equal(fs.existsSync(new URL('AUTHORIZED_GROUP1.json',root)),false);
});
