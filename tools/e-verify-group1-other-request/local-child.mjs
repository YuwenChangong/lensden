import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {randomBytes} from 'node:crypto';
import {waitForStart} from '../e-verify-group1-remaining-assets/supervisor.mjs';
import {chromium} from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import {reviewV9,ORIGIN,VERSION} from '../e-verify-group1-chrome-rebind/review-rebound.mjs';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
import {loopbackTransport} from '../e-verify-group1-script-binding/execution/wire.mjs';
import {installNodeGuard} from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import {openGroup1Browser as originalOpen} from '../e-verify-group1-v9-closure/browser.mjs';
import {openGroup1Browser as observedOpen} from './browser-observed-private.mjs';
import {ReviewedPublicResources} from './public-resources.mjs';
import {createPrivateCorrelation} from './private-correlation.mjs';
await waitForStart();
const out=path.resolve(process.argv[2]),mode=process.argv[3];
if(!out.includes('ogh-other-request-')||!['original','observed','unknown'].includes(mode))throw new Error('LOCAL_TEST_SCOPE');
const review=await reviewV9(),html=review.html.get('/login/');
const packet=JSON.parse(fs.readFileSync(new URL('../e-verify-group1-full650-chrome-v11/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json',import.meta.url)));
const index=new ReviewedPublicResources({actor:'A',appOrigin:ORIGIN,staticManifest:review.safe.assets});index.observeValidatedHtml(html,ORIGIN+'/login/');
const privateId=mode==='unknown'?'e-verify-group1-other-local-'+randomBytes(6).toString('hex'):null;
const privateCorrelation=privateId?createPrivateCorrelation(path.join(process.env.LOCALAPPDATA,'OpenGlassHub','acceptance-evidence','other-request',privateId),privateId):undefined;
const other=[],errors=[],requests=[];
const originalLaunch=chromium.launch.bind(chromium);
chromium.launch=async options=>{
 const browser=await originalLaunch(options),newContext=browser.newContext.bind(browser);
 browser.newContext=async options=>{const c=await newContext(options),route=c.route.bind(c);
  c.on('page',page=>page.on('pageerror',e=>errors.push(/process is not defined/.test(e.message)?'PROCESS_GLOBAL_MISSING':'PUBLIC_SCRIPT_EXECUTION_ERROR')));
  c.route=async(pattern,handler)=>route(pattern,async r=>{
   const q=r.request();if(q.resourceType()==='other'){
    const headers=await q.allHeaders();let frameClass='NO_FRAME_OR_UNAVAILABLE';try{frameClass=new URL(q.frame().url()).origin===ORIGIN?'APPLICATION_MAIN_FRAME':'UNAPPROVED_FRAME'}catch{}
    const d=index.observe({url:q.url(),method:q.method(),actor:'A'},{stage:'LOGIN_A',resourceType:'other',frameClass});
    d.fetchDestination=['image','empty','script','style','document','iframe','manifest','font'].includes(headers['sec-fetch-dest'])?headers['sec-fetch-dest']:'UNKNOWN';
    other.push(d);
   }
   return handler(r);
  });return c;
 };return browser;
};
const server=http.createServer((q,r)=>{const u=new URL(q.url,'http://127.0.0.1');requests.push({method:q.method,kind:u.pathname==='/login/'?'html':review.bodies.has(u.pathname)?'static':u.pathname==='/turnstile/v0/api.js'?'turnstile':'unbound'});
 const send=(body,type)=>{r.writeHead(200,{'content-type':type});r.end(body)};
 if(q.method!=='GET'){r.writeHead(418);r.end();return}
 if(u.pathname==='/login/')return send(html,'text/html');
 if(review.bodies.has(u.pathname))return send(review.bodies.get(u.pathname),u.pathname.endsWith('.js')?'application/javascript':'text/css');
 if(u.pathname==='/turnstile/v0/api.js')return send('window.turnstile={render(){return "offline-inert-widget"},reset(){},remove(){}};','application/javascript');
 r.writeHead(418);r.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const wire=loopbackTransport('http://127.0.0.1:'+server.address().port);
const transport=(q,bounds)=>{if(q.method!=='GET'||![ORIGIN,'https://challenges.cloudflare.com'].includes(new URL(q.url).origin))throw new Error('OFFLINE_TRANSPORT_SCOPE');const u=new URL(q.url);return wire({...q,url:'https://qa.example.invalid'+u.pathname+u.search},bounds)};
let browser,result;
try{
 browser=await(mode==='original'?originalOpen:observedOpen)({caps:packet.ownerBudgets,actor:'A',binding:{userId:'00000000-0000-4000-8000-000000000001',email:'offline@example.invalid',applicationRole:'user'},
  appOrigin:ORIGIN,supabaseOrigin:packet.supabaseOrigin,staticManifest:review.safe.assets,staticPaths:review.safe.assets.map(a=>a.path),productionVersion:VERSION,
  approvedHtmlHashes:{'/login/':[sha(html)]},transport,headless:false,workMs:45000,privateCorrelation});
 installNodeGuard();await browser.navigate('/login/?next=%2Fproducts%2F');
 for(let i=0;i<100;i++){if(browser.receipt().firstFailure||i>20&&browser.receipt().inFlight===0)break;await new Promise(r=>setTimeout(r,50))}
 if(mode==='unknown'&&!browser.receipt().firstFailure){await browser.page.evaluate(()=>{const e=document.createElement('link');e.rel='icon';e.type='image/x-icon';e.href='/not-reviewed.ico?token=NEVER_LOG';document.head.appendChild(e)});for(let i=0;i<80;i++){if(browser.receipt().firstFailure)break;await new Promise(r=>setTimeout(r,50))}}
 const hydrated=await browser.page.evaluate(()=>[...document.querySelectorAll('astro-island')].every(x=>!x.hasAttribute('ssr'))).catch(()=>false);
 result={status:browser.receipt().firstFailure?'BLOCKED':'OBSERVATION_COMPLETE',mode,hydrated,scriptErrorCodes:[...new Set(errors)],observedOther:other,wireRequests:requests,
  htmlSha256:sha(html),staticManifestCount:review.safe.assets.length,authDispatches:browser.receipt().counts.supabaseAuthDispatchesMax,rlsDispatches:browser.receipt().counts.supabaseRestReadDispatchesMax,
  globalAdmissions:browser.receipt().counts.allBrowserHttpDispatchesMax,browserReceipt:browser.receipt(),privateEvidenceAuthorizationId:privateId,productionRequests:0,productionWrites:0,allWireTraffic:'LOOPBACK_ONLY'};
}catch(e){result={status:'BLOCKED',mode,code:/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'LOCAL_BROWSER_FAILURE',observedOther:other,wireRequests:requests,browserReceipt:browser?.receipt(),productionRequests:0,productionWrites:0}}
finally{try{await browser?.close()}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}}
result.cleanup=browser?.receipt().closed?'PASS':'BLOCKED';result.browserReceipt=browser?.receipt();
const text=JSON.stringify(result);if(/NEVER_LOG|token=|offline@example|00000000-0000/.test(text))throw new Error('LOCAL_DIAGNOSTIC_LEAK');
fs.writeFileSync(out,text+'\n',{flag:'wx'});if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r));if(process.connected)process.disconnect();
