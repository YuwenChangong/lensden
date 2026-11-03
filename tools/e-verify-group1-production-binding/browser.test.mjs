import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {openGroup1Browser} from './browser.mjs';
import {loopbackTransport} from '../e-verify-group1-script-binding/execution/wire.mjs';
import {reviewEvidence,VERSION,ORIGIN,TARGET} from './review.mjs';
import {sha} from './semantic.mjs';
import {validateAuthorization,GO} from '../e-verify-group1-script-identity/execution/group1/authorization.mjs';

const reviewed=await reviewEvidence();
const packet=JSON.parse(fs.readFileSync('C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json'));
const account={userId:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid',applicationRole:'user'};
const manifest=reviewed.safe.assets;
const item=name=>{const a=manifest.find(x=>x.path.startsWith('/_astro/'+name+'.'));assert.ok(a);return a.path};
function fixtureHtml(){
 const runtime=fs.readFileSync('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/node_modules/astro/dist/runtime/server/astro-island.js','utf8');
 const props={locale:[0,'en'],next:[0,'/products/'],initialMode:[0,'login'],captchaMode:[0,'required'],authTurnstileSiteKey:[0,'synthetic-public-sitekey']};
 const island=(component,p={})=>`<astro-island component-url="${item(component)}" component-export="default" renderer-url="${item('client')}" props="${JSON.stringify(p).replaceAll('"','&quot;')}" client="only" ssr opts="{}"></astro-island>`;
 return '<!doctype html><html><head>'+manifest.filter(x=>x.kind==='stylesheet').map(x=>`<link rel="stylesheet" href="${x.path}">`).join('')+
  `<link rel="modulepreload" href="${item('client')}">`+
  `<script>window.process={env:{NODE_ENV:'production'}};window.Astro={only:async load=>{const hydrate=await load();await hydrate()}};</script><script>${runtime}</script>`+
  `</head><body><header class="og-header"><button class="og-header__menu-toggle"></button><nav class="og-header__nav"></nav></header>`+
  island('AuthPanel',props)+island('HeaderUserMenu',{locale:[0,'en']})+island('HeaderNotifications',{locale:[0,'en']})+island('GlobalSearchBox',{locale:[0,'en']})+
  `<script type="module" src="${TARGET}"></script><script type="module" src="/_astro/LocalePreferenceSync.DozvmMnE.js"></script><script type="module" src="${item('page')}"></script></body></html>`;
}
async function fixture(html=fixtureHtml(),caps=packet.ownerBudgets,approvedHtmlSha=sha(Buffer.from(html))){
 const received=[];
 const server=http.createServer((q,r)=>{
  received.push({method:q.method,path:q.url});
  if(q.url.startsWith('/login/')){r.setHeader('content-type','text/html');r.end(html);return}
  const body=reviewed.bodies.get(q.url);
  if(body){r.setHeader('content-type',q.url.endsWith('.js')?'application/javascript':'text/css');r.end(body);return}
  if(q.url==='/turnstile/v0/api.js?render=explicit'){r.setHeader('content-type','application/javascript');r.end('window.turnstile={render(){return "local-widget"},reset(){},remove(){}}');return}
  r.writeHead(418);r.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const wire=loopbackTransport('http://127.0.0.1:'+server.address().port);
 const transport=(q,bounds)=>{
  const u=new URL(q.url);
  if(![ORIGIN,'https://challenges.cloudflare.com'].includes(u.origin))throw new Error('OFFLINE_ORIGIN_FORBIDDEN');
  return wire({...q,url:'https://qa.example.invalid'+u.pathname+u.search},bounds);
 };
 let browser;
 try{browser=await openGroup1Browser({caps,actor:'A',binding:account,appOrigin:ORIGIN,supabaseOrigin:'https://db.example.invalid',
  staticPaths:manifest.map(x=>x.path),staticManifest:manifest,productionVersion:VERSION,approvedHtmlHashes:{'/login/':[approvedHtmlSha]},transport,headless:true,workMs:20000})}
 catch(e){server.closeAllConnections();await new Promise(r=>server.close(r));throw e}
 return {browser,received,async close(){await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}};
}
const until=async fn=>{const end=performance.now()+8000;while(performance.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,25))}throw new Error('OFFLINE_ASSERTION_DEADLINE')};

test('all24 protected payloads/1469 frozen inputs and finite23 literal dependencies verify',()=>{
 assert.equal(reviewed.safe.protectedFilesVerified,24);assert.equal(reviewed.safe.frozenInputsVerified,1469);
 assert.equal(manifest.length,23);assert.equal(reviewed.safe.exactFrozenAssetBytes,16);
 assert.equal(reviewed.safe.scopedSourceStructuralReviews,7);assert.equal(reviewed.safe.literalLoginGraph,'CLOSED');
 assert.equal(manifest.some(x=>x.path.includes('DaQNT1ww')),false);
});
test('real Chrome hydrates reviewed Production chunks on a synthetic isolated shell without Auth or live egress',async()=>{
 const f=await fixture();
 try{
  await f.browser.navigate('/login/?next=%2Fproducts%2F');
  await f.browser.page.waitForSelector('input[type=email]');
  await until(()=>f.browser.page.evaluate(()=>[...document.querySelectorAll('astro-island')].every(x=>!x.hasAttribute('ssr'))));
  await until(()=>f.browser.receipt().inFlight===0);
  const r=f.browser.receipt();assert.equal(r.firstFailure,null);assert.equal(r.counts.supabaseAuthDispatchesMax,0);
  assert.equal(r.proxyForwardedRequests,0);assert.equal(r.diagnostics.firstRejection,null);
  for(const a of manifest)assert.ok(f.received.some(x=>x.path===a.path),'VERIFIED_DEPENDENCY_NOT_EXERCISED');
  assert.equal(f.received.some(x=>x.method!=='GET'||x.path.startsWith('/auth/')),false);
  assert.ok(r.wireDispatches<=packet.ownerBudgets.allBrowserHttpDispatchesMax);
 }finally{await f.close()}
});
test('real Chrome refuses old local header before wire; denial receipt never includes private query',async()=>{
 const f=await fixture('<script src="/_astro/SiteHeader.astro_astro_type_script_index_0_lang.DaQNT1ww.js?token=DO_NOT_RECORD"></script>');
 try{await f.browser.navigate('/login/').catch(()=>{});await until(()=>f.browser.receipt().firstFailure!==null);
  assert.equal(f.received.some(x=>x.path.includes('DaQNT1ww')),false);
  assert.doesNotMatch(JSON.stringify(f.browser.receipt()),/DO_NOT_RECORD|token=/);
  assert.equal(f.browser.receipt().diagnostics.firstRejection.networkDispatchOccurred,false);
 }finally{await f.close()}
});
test('concurrent module loads cannot exceed unchanged pre-dispatch global budget',async()=>{
 const f=await fixture(fixtureHtml(),{...packet.ownerBudgets,allBrowserHttpDispatchesMax:3});
 try{await f.browser.navigate('/login/').catch(()=>{});await until(()=>f.browser.receipt().firstFailure!==null);
  assert.ok(f.received.length<=3);assert.equal(f.browser.receipt().firstFailure,'BUDGET_EXCEEDED');
 }finally{await f.close()}
});
test('old consumed authorization still fails original replay guard',()=>{
 const gates=Object.fromEntries(['subsetBoundary2AndResidualCasesAccepted','authSecurityLogSideEffectsAccepted','manualTurnstileAndPrivateIdentityReady','catalogHoldAndPostHardeningRecoveryAccepted','operatorAvailableForEntireValidity'].map(x=>[x,true]));
 const a={format:'e-verify-group1-authorization-v1',authorizationId:'old',packetSha256:'1'.repeat(64),executionBindingSha256:'2'.repeat(64),authorizedAtUTC:'2026-10-13T00:00:00Z',authorizationExpiresUTC:'2026-10-13T00:30:00Z',humanGates:gates};
 assert.throws(()=>validateAuthorization(a,{packet:{authorizationId:'old',executionLimitSeconds:300},packetSha256:a.packetSha256,bindingSha256:a.executionBindingSha256,now:Date.parse('2026-10-13T00:01:00Z'),go:GO,claimExists:true}));
});
test('admin client:load dependency absent from captured graph stays blocked, not silently admitted',()=>{
 assert.equal(reviewed.safe.fullGroup1Blocker.code,'POST_LOGIN_ASSET_PROVENANCE_NOT_CAPTURED');
 assert.equal(manifest.some(x=>x.path.includes('AdminDevicesDashboard')),false);
});
test('modified inline JavaScript is rejected before Chrome receives the page',async()=>{
 const f=await fixture('<script>window.UNREVIEWED_INLINE_EXECUTED=true</script>',packet.ownerBudgets,sha(Buffer.from(fixtureHtml())));
 try{await f.browser.navigate('/login/').catch(()=>{});await until(()=>f.browser.receipt().firstFailure!==null);
  assert.equal(f.browser.receipt().firstFailure,'HTML_SOURCE_MISMATCH');
  assert.notEqual(await f.browser.page.evaluate(()=>window.UNREVIEWED_INLINE_EXECUTED).catch(()=>false),true);
 }finally{await f.close()}
});
test('real Chrome rejects an unknown third-party script without transport dispatch',async()=>{
 const f=await fixture('<script src="https://unapproved.example.invalid/hidden.js?secret=DO_NOT_RECORD"></script>');
 try{await f.browser.navigate('/login/').catch(()=>{});await until(()=>f.browser.receipt().firstFailure!==null);
  assert.equal(f.received.length,1);
  assert.equal(f.browser.receipt().diagnostics.firstRejection.networkDispatchOccurred,false);
  assert.doesNotMatch(JSON.stringify(f.browser.receipt()),/DO_NOT_RECORD|secret=/);
 }finally{await f.close()}
});
