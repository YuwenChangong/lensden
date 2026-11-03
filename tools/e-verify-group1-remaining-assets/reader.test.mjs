import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {runRemainingRead} from './reader.mjs';
import {loopbackTransport} from './wire.mjs';import {sha256} from './hash.mjs';
const origin='https://openglasshub.ogh.workers.dev',deploymentURL='https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/workers/scripts/openglasshub/deployments';
const pages=['/products/','/products/xreal/xreal-air/','/admin/devices/'];
const header='/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js',fresh='/_astro/AdminDevicesDashboard.ABCDEFGH.js';
const headerBody=Buffer.from('export const reviewed=true;'),freshBody=Buffer.from('export const dashboard=true;');
const manifest=[{path:header},{path:'/_astro/AdminDevicesDashboard.hFDGJRVO.js'}];
const edges={'/login/':['/_astro/SiteHeader.astro_astro_type_script_index_0_lang.js'],
 '/products/':['/_astro/SiteHeader.astro_astro_type_script_index_0_lang.js'],
 '/products/xreal/xreal-air/':['/_astro/SiteHeader.astro_astro_type_script_index_0_lang.js'],
 '/admin/devices/':['/_astro/SiteHeader.astro_astro_type_script_index_0_lang.js','/_astro/AdminDevicesDashboard.js'],
 '/_astro/SiteHeader.astro_astro_type_script_index_0_lang.js':[],'/_astro/AdminDevicesDashboard.js':[]};
const reuse={html:Buffer.from(`<script type="module" src="${header}"></script>`),assets:[{path:header,kind:'script',body:headerBody,bytes:headerBody.length,sha256:sha256(headerBody)}]};
const budgets={totalGETMax:11,htmlGETMax:3,assetGETMax:6,providerDeploymentGETMax:2,concurrencyMax:4,hardSeconds:300,workSeconds:240,cleanupReserveSeconds:60,perRequestSeconds:1,maxHeaderBytes:8192,maxAssetBytes:2097152,anonymousAggregateBytesMax:16777216};
async function run({fault,cap=budgets,reuseInput=reuse}={}){
 const received=[];
 const server=http.createServer((q,r)=>{
  received.push(q.url);
  if(q.url==='/deployment'){r.setHeader('content-type','application/json');r.end(JSON.stringify({id:received.filter(x=>x==='/deployment').length===2&&fault==='version'?'changed':'same'}));return}
  if(pages.includes(q.url)){
   if(fault==='redirect'){r.writeHead(302,{location:'https://other.invalid/'});r.end();return}
   r.setHeader('content-type','text/html');
   let src=q.url==='/admin/devices/'?fresh:header;
   if(fault==='unapproved')src='/_astro/AdminUsersDashboard.ABCDEFGH.js';
   const extra=fault==='base'?'<base href="https://other.invalid/">':fault==='upperModule'?'<script type="MODULE">import "https://other.invalid/a.js"</script>':
    fault==='upperStyle'?'<link rel="STYLESHEET" href="https://other.invalid/a.css">':fault==='upperPreload'?'<link rel="MODULEPRELOAD" href="https://other.invalid/a.js">':'';
   r.end(extra+`<script type="module" src="${src}"></script><script type="module" src="${header}"></script>`);return;
  }
  if(q.url===fresh){r.setHeader('content-type','application/javascript');
   if(fault==='timeout'){r.write('export ');return}
   if(fault==='oversize'){r.setHeader('content-length','3000000');r.end();return}
   if(fault==='stream'){r.write(Buffer.alloc(2097152));r.end(Buffer.from('!'));return}
   r.end(fault==='import'?`import './Unknown.ABCDEFGH.js'`:fault==='parse'?'import {':fault==='fallback'?'<html><body>challenge</body></html>':freshBody);return;
  }
  r.writeHead(418);r.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const wire=loopbackTransport('http://127.0.0.1:'+server.address().port);
 try{const result=await runRemainingRead({origin,deploymentURL,pages,requiredTarget:header,manifest,edgeRules:edges,budgets:cap,reuse:reuseInput,
  transport:(q,b)=>{assert.equal(q.method,'GET');assert.equal(Object.keys(q.headers).some(x=>x.toLowerCase()==='cookie'),false);
   if(q.url!==deploymentURL)assert.equal(Object.keys(q.headers).some(x=>x.toLowerCase()==='authorization'),false);
   const u=new URL(q.url);return wire({...q,url:'https://qa.example.invalid'+(q.url===deploymentURL?'/deployment':u.pathname)},b)},
  providerHeaders:fault==='cookie'?{accept:'application/json',Cookie:'DO_NOT_SEND'}:{accept:'application/json'},
  htmlRequiredMarkers:fault==='marker'?{'/products/':['EXPECTED_SOURCE_MARKER']}:{},
  workMs:fault==='deadline'?1000:undefined,capture:async(ref)=>({encrypted:fault!=='capture',ciphertextSha256:'a'.repeat(64),evidenceRef:ref}),
  assertDeployment:r=>{const id=JSON.parse(r.body).id;return {deploymentId:id,activeVersion:'b2b62ec9-bb8d-4159-ac99-08fca5740134',activeTraffic:100,recoveryTraffic:0}}});
  return {result,received};
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}
test('only new referenced assets fetched, proven resources reused without GET',async()=>{
 const {result:r,received}=await run();assert.equal(r.status,'CONTENT_EVIDENCE_COLLECTED');assert.equal(r.counts.total,6);
 assert.equal(r.counts.provider,2);assert.equal(r.counts.html,3);assert.equal(r.counts.asset,1);assert.equal(r.reusedAssets,1);
 assert.equal(received.includes(header),false);assert.equal(r.newAssets[0].path,fresh);assert.equal(r.authDispatches,0);assert.equal(r.rlsReads,0);
});
for(const fault of ['redirect','unapproved','oversize','stream','import','version','parse','timeout','capture','deadline','cookie','fallback','base','upperModule','upperStyle','upperPreload','marker'])test('fails closed on '+fault,async()=>{
 const {result:r,received}=await run({fault});assert.equal(r.status,'BLOCKED');assert.equal(r.retries,0);
 assert.equal(received.some(x=>x.includes('Unknown')||x.includes('AdminUsers')),false);
 assert.equal(received.includes(header),false);assert.ok(r.counts.total<=11);
});
test('aggregate byte reservation rejects before anonymous network dispatch',async()=>{
 const {result:r,received}=await run({cap:{...budgets,anonymousAggregateBytesMax:1}});assert.equal(r.status,'BLOCKED');assert.equal(received.length,1);
});
test('budget exhausted before a further request is sent',async()=>{
 const {result:r,received}=await run({cap:{...budgets,totalGETMax:2}});assert.equal(r.status,'BLOCKED');assert.equal(received.length,2);assert.equal(r.counts.total,2);
});
test('reused bytes tamper blocks before first Deployment GET',async()=>{
 const {result:r,received}=await run({reuseInput:{...reuse,assets:[{...reuse.assets[0],body:Buffer.from('bad')}]}});assert.equal(r.status,'BLOCKED');assert.equal(received.length,0);
});
