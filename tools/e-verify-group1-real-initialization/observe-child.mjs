import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {chromium} from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import {waitForStart} from '../e-verify-group1-remaining-assets/supervisor.mjs';
import {openGroup1Browser} from '../e-verify-group1-other-request/browser-observed-private.mjs';
import {ReviewedPublicResources} from '../e-verify-group1-other-request/public-resources.mjs';
import {SharedBudget} from '../e-verify-group1-v9-closure/gate.mjs';
import {loopbackTransport} from '../e-verify-group1-script-binding/execution/wire.mjs';
import {installNodeGuard} from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import {loadRetainedInputs} from './retained-input.mjs';
await waitForStart();
const out=path.resolve(process.argv[2]);if(!out.includes('ogh-real-init-'))throw new Error('LOCAL_OUTPUT_SCOPE');
let inputs;try{inputs=loadRetainedInputs()}catch(e){
 fs.writeFileSync(out,JSON.stringify({status:'BLOCKED',stage:'RETAINED_INPUT_LOADING',code:/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'LOCAL_INPUT_FAILURE',productionRequests:0,productionWrites:0})+'\n',{flag:'wx'});
 throw new Error('RETAINED_INPUT_LOADING_FAILED');
}
const {packet,html,bodies}=inputs,origin=packet.appOrigin,budget=new SharedBudget(packet.ownerBudgets);
const index=new ReviewedPublicResources({actor:'A',appOrigin:origin,staticManifest:packet.staticManifest,supabaseOrigin:packet.supabaseOrigin});
index.observeValidatedHtml(html,origin+'/login/');
const requests=[],cdpRequests=[],parsedScripts=[],errors=[],wire=[],proxyRequests=[];let boundary=false,eventLimit=false,proxyBudgetExceeded=false;
const frameClass=q=>{try{const f=q.frame();return new URL(f.url()).origin===origin?(f.parentFrame()?'APPLICATION_CHILD_FRAME':'APPLICATION_MAIN_FRAME'):new URL(f.url()).origin==='https://challenges.cloudflare.com'?'TURNSTILE_FRAME':'UNAPPROVED_FRAME'}catch{return'NO_FRAME_OR_UNAVAILABLE'}};
const describe=(url,method,type)=>index.observe({url,method,actor:'A'},{stage:'LOGIN_A',source:'BROWSER_RESOURCE',resourceType:type});
const originalLaunch=chromium.launch.bind(chromium);
chromium.launch=async options=>{
 const b=await originalLaunch(options),newContext=b.newContext.bind(b);
 b.newContext=async options=>{
  const c=await newContext(options),route=c.route.bind(c),newPage=c.newPage.bind(c);
  c.newPage=async()=>{const p=await newPage(),cdp=await c.newCDPSession(p);
   p.on('pageerror',()=>{if(errors.length<16)errors.push('PUBLIC_PAGE_ERROR')});
   cdp.on('Network.requestWillBeSent',e=>{
    if(cdpRequests.length>=96){eventLimit=true;return}
    const d=describe(e.request.url,e.request.method,(e.type||'UNKNOWN').toLowerCase());
    const frames=e.initiator?.stack?.callFrames||[],matched=frames.map(f=>describe(f.url,'GET','script')).filter(f=>f.verifiedResourceMatch);
    cdpRequests.push({sequence:cdpRequests.length+1,evidenceId:d.evidenceId,originClass:d.originClass,protocolClass:d.protocolClass,
     resourceType:d.resourceType,initiatorClass:['parser','script','preload','other'].includes(e.initiator?.type)?e.initiator.type:'UNKNOWN',
     reviewedInitiatorModules:[...new Set(matched.map(f=>f.publicPathname))],initiatorFramesNotExposed:frames.length===0});
   });
   cdp.on('Debugger.scriptParsed',e=>{const d=describe(e.url,'GET','script');if(d.verifiedResourceMatch&&parsedScripts.length<96)parsedScripts.push({sequence:parsedScripts.length+1,path:d.publicPathname,meaning:'SCRIPT_PARSED_NOT_TOTAL_EVALUATION_ORDER'})});
   await cdp.send('Network.enable');await cdp.send('Debugger.enable');return p;
  };
  c.route=async(pattern,handler)=>route(pattern,async r=>{
   const q=r.request(),d=index.observe({url:q.url(),method:q.method(),actor:'A'},
    {stage:'LOGIN_A',source:q.isNavigationRequest()?'BROWSER_NAVIGATION':['fetch','xhr'].includes(q.resourceType())?'BROWSER_FETCH':'BROWSER_RESOURCE',resourceType:q.resourceType(),frameClass:frameClass(q),redirected:!!q.redirectedFrom()});
   if(requests.length>=96){eventLimit=true;await r.abort();return}
   const u=new URL(q.url()),bootstrap=q.method()==='GET'&&u.origin==='https://challenges.cloudflare.com'&&u.pathname==='/turnstile/v0/api.js'&&u.search==='?render=explicit'&&!q.redirectedFrom();
   const nonessential=['image','media','font'].includes(q.resourceType())&&u.origin!=='https://challenges.cloudflare.com';
   const row={sequence:requests.length+1,...d,observationCategory:d.disposition==='EXCLUDE_DOCUMENT_ICON_WITHOUT_DISPATCH'?'B_ICON_CANCELLED':nonessential?'B_EXISTING_NONESSENTIAL_RESOURCE_EXCLUSION':d.verifiedResourceMatch||q.isNavigationRequest()&&u.origin===origin&&u.pathname==='/login/'?'A_REVIEWED_APPLICATION_INITIALIZATION':bootstrap?'C_REAL_THIRD_PARTY_BYTES_UNAVAILABLE':'D_UNBOUND_OR_UNATTRIBUTED'};
   requests.push(row);
   if(bootstrap){budget.reserve(['allBrowserHttpDispatchesMax','turnstileHttpDispatchesMax']);boundary=true;row.disposition='ABORT_WITHOUT_MOCK_OR_NETWORK';await r.abort('blockedbyclient');return}
   // Every other request follows the unchanged exact gate; no third-party substitute.
   return handler(r);
  });return c;
 };return b;
};
const server=http.createServer((q,r)=>{const u=new URL(q.url,'http://127.0.0.1');
 const bytes=u.pathname==='/login/'?html:bodies.get(u.pathname);
 if(q.method!=='GET'||!bytes){r.writeHead(418);r.end();return}
 wire.push({kind:u.pathname==='/login/'?'html':'verified-static',path:u.pathname});
 r.writeHead(200,{'content-type':u.pathname==='/login/'?'text/html':u.pathname.endsWith('.css')?'text/css':'application/javascript'});r.end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=loopbackTransport('http://127.0.0.1:'+server.address().port);
// The adapter's deny proxy also sees browser traffic outside Playwright's page route.
const createServer=http.createServer.bind(http);
http.createServer=(...args)=>{const proxy=createServer(...args),record=q=>{
 try{budget.reserve(['allBrowserHttpDispatchesMax'])}catch{proxyBudgetExceeded=true}
 if(proxyRequests.length>=96){eventLimit=true;return}
 const d=describe(q.method==='CONNECT'?'https://'+q.url:q.url,q.method,'other');
 proxyRequests.push({sequence:proxyRequests.length+1,stage:'LOGIN_A',actor:'A',source:'BROWSER_DENY_PROXY',method:q.method==='CONNECT'?'CONNECT':d.method,
  hostClass:d.originClass,protocolClass:d.protocolClass,evidenceId:d.evidenceId,frameClass:'NO_PAGE_ATTRIBUTION_AVAILABLE',initiatorClass:'UNAVAILABLE_AT_PROXY',
  forwarded:false,classification:'UNATTRIBUTED_BROWSER_TRAFFIC_ALWAYS_DENIED'});
 };proxy.prependListener('request',record);proxy.prependListener('connect',record);return proxy};
const transport=(q,bounds)=>{const u=new URL(q.url);if(q.method!=='GET'||u.origin!==origin||!(u.pathname==='/login/'||bodies.has(u.pathname)))throw new Error('NO_OFFLINE_TRANSPORT_FOR_UNBOUND_REQUEST');return local({...q,url:'https://qa.example.invalid'+u.pathname+u.search},bounds)};
let browser,result;
try{
 browser=await openGroup1Browser({caps:packet.ownerBudgets,budget,actor:'A',binding:{userId:'00000000-0000-4000-8000-000000000001',email:'offline@example.invalid',applicationRole:'user'},
  appOrigin:origin,supabaseOrigin:packet.supabaseOrigin,staticManifest:packet.staticManifest,staticPaths:packet.staticManifest.map(a=>a.path),productionVersion:packet.expectedProductionVersion,
  approvedHtmlHashes:{'/login/':['3d47e816eb1605fa98c203b62372528170d9dc356866ff1a6e61d670ab49468c']},transport,headless:false,workMs:45000});
 installNodeGuard();await browser.navigate('/login/?next=%2Fproducts%2F');
 const until=performance.now()+12000;let dom;
 while(performance.now()<until){
  if(eventLimit||proxyBudgetExceeded||browser.receipt().firstFailure)break;
  dom=await browser.page.evaluate(()=>({islands:[...document.querySelectorAll('astro-island')].map(e=>({hydrated:!e.hasAttribute('ssr')})),
   emailFieldPresent:!!document.querySelector('input[type=email]'),passwordFieldPresent:!!document.querySelector('input[type=password]'),
   credentialFieldsEmpty:[...document.querySelectorAll('input[type=email],input[type=password]')].every(e=>e.value.length===0),
   captchaContainerPresent:!!document.querySelector('.auth-turnstile'),captchaUnavailableUi:!!document.querySelector('.auth-turnstile .auth-alert--error'),
   turnstileGlobalAvailable:typeof window.turnstile!=='undefined',captchaFrameCount:document.querySelectorAll('.auth-turnstile iframe').length,
   authStorageEntryCount:Object.keys(localStorage).filter(k=>k.endsWith('-auth-token')).length}));
  if(boundary&&dom.islands.length>0&&dom.islands.every(e=>e.hydrated)&&dom.captchaUnavailableUi){await new Promise(r=>setTimeout(r,1000));break}
  await new Promise(r=>setTimeout(r,100));
 }
 const checkpoints=browser.receipt(),unknown=requests.filter(q=>q.observationCategory==='D_UNBOUND_OR_UNATTRIBUTED');
 result={format:'group1-real-login-initialization-offline-v1',status:boundary?'PARTIAL_THIRD_PARTY_REAL_BYTES_UNAVAILABLE':'BLOCKED_EXPECTED_BOUNDARY_NOT_OBSERVED',
  actualChromeRequests:requests,cdpRequests,parsedScripts,proxyRequests,dom,unknownNaturalRequests:unknown.length,publicScriptErrorCodes:[...new Set(errors)],loopbackResponses:wire,
  boundaryObserved:boundary,thirdPartyResponseProvided:false,inertMockUsed:false,injectedUnknownUsed:false,authActionsPerformed:0,eventLimit,proxyBudgetExceeded,
  beforeCloseFirstFailure:checkpoints.firstFailure,globalAdmissions:checkpoints.counts.allBrowserHttpDispatchesMax,authDispatches:checkpoints.counts.supabaseAuthDispatchesMax,
  restDispatches:checkpoints.counts.supabaseRestReadDispatchesMax,turnstileRealDispatches:0,thirdPartyCancelledAdmissions:checkpoints.counts.turnstileHttpDispatchesMax,
  browserReceipt:checkpoints,coverage:{verifiedApplicationBytes:'REPLAYED',fullTurnstile:'UNAVAILABLE',postChallengeRuntime:'UNOBSERVED',originalV11Identity:'UNKNOWN',liveAuth:'NOT_VERIFIED'},
  productionRequests:0,productionWrites:0,allTransportTraffic:'LOOPBACK_ONLY'};
}catch(e){result={status:'BLOCKED',errorCode:/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'LOCAL_INITIALIZATION_FAILURE',actualChromeRequests:requests,cdpRequests,productionRequests:0,productionWrites:0}}
finally{try{await browser?.close()}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}}
result.cleanup=browser?.receipt().closed?'PASS':'BLOCKED';
result.finalGlobalAdmissions=budget.receipt().allBrowserHttpDispatchesMax;
const encoded=JSON.stringify(result);if(/offline@example|00000000-0000|"url"\s*:|"headers"\s*:|"session"\s*:|eyJ[A-Za-z0-9_-]{30}/.test(encoded))throw new Error('SAFE_RECEIPT_CHECK');
fs.writeFileSync(out,encoded+'\n',{flag:'wx'});if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r));if(process.connected)process.disconnect();
