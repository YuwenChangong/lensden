import http from 'node:http';
import {chromium} from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import {installNodeGuard} from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import {TurnstileGate,SDK,TEST_SITEKEY} from './gate.mjs';
export const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
export const HARNESS='http://127.0.0.1:1/isolated-turnstile-qa';
const safeCode=e=>/^[A-Z0-9_]{1,64}$/.test(e?.message)?e.message:'BOUNDARY_FAILURE';
const html=Buffer.from(`<!doctype html><meta charset="utf-8"><title>Isolated Turnstile QA</title><div id="widget"></div><script>
const s=document.createElement('script');s.src=${JSON.stringify(SDK)};
s.onload=async()=>{await window.qaStatus('RENDER_BEGIN');window.turnstile.render('#widget',{sitekey:${JSON.stringify(TEST_SITEKEY)},callback:()=>window.qaStatus('CALLBACK'), 'error-callback':()=>window.qaStatus('WIDGET_ERROR'),'expired-callback':()=>window.qaStatus('EXPIRED')});await window.qaStatus('RENDER_RETURNED')};
s.onerror=()=>window.qaStatus('SDK_ERROR');document.head.append(s);
</script>`);
const stackUrls=s=>{const out=[];for(let x=s;x;x=x.parent)for(const f of x.callFrames||[])if(typeof f.url==='string')out.push(f.url);return out};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bounded=async(p,ms)=>{let t;try{return await Promise.race([p,new Promise((_,r)=>{t=setTimeout(()=>r(new Error('CLEANUP_TIMEOUT')),ms)})])}finally{clearTimeout(t)}};

// No BrowserContext, arbitrary evaluator or raw transport is returned to callers.
export async function runIsolatedBrowser({transport,headless=true,workMs=240000,observeMs=30000,caps,installGuard=true,sdkResponseOnly=false}={}){
 if(typeof transport!=='function')throw new Error('CONTROLLED_TRANSPORT_REQUIRED');
 const gate=new TurnstileGate({workMs,...(caps?{caps}:{})}),frames=new Map(),frameIds=new Map(),cdpParents=new Map(),frameStacks=new Map(),cdpEvents=[],sessions=[],controllers=new Set(),observation=[];
 let browser,context,page,proxy,closing=false,cleanup=false,harnessUsed=false,wire=0,nodeDenials=0,frameSerial=0,sdkResponseObserved=false,responseDecisionComplete=false,status={renderStarted:false,renderReturned:false,callback:false};
 const stop=code=>{for(const c of controllers)c.abort();try{gate.fail(code)}catch{}};
 const workTimer=setTimeout(()=>stop('WORK_DEADLINE'),workMs);
 const observe=event=>{
  if(event.method==='Page.frameAttached'){const e=event.params;cdpParents.set(e.frameId,e.parentFrameId);frameStacks.set(e.frameId,e.stack)}
  if(event.method==='Network.requestWillBeSent'){
   const e=event.params;if(cdpEvents.length>=1500){stop('OBSERVATION_OVERFLOW');return}
   if(cdpEvents.some(x=>x.requestId===e.requestId&&x.frameId===e.frameId&&x.url===e.request.url))return;
   cdpEvents.push({requestId:e.requestId,url:e.request.url,method:e.request.method,type:e.type?.toLowerCase(),frameId:e.frameId,initiator:e.initiator,redirect:!!e.redirectResponse,used:false});
  }
 };
 const setupNested=async parent=>{
  parent.on('Target.attachedToTarget',e=>{
   if(e.targetInfo.type!=='iframe'||!e.waitingForDebugger){stop('UNOBSERVED_TARGET');return}
   let seq=0;const pending=new Map(),listeners=new Map();
   const child={on:(name,fn)=>{listeners.set(name,fn)},send:(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_TARGET_TIMEOUT'))},1500);pending.set(id,{resolve,reject,t});
    parent.send('Target.sendMessageToTarget',{sessionId:e.sessionId,message:JSON.stringify({id,method,params})}).catch(()=>{clearTimeout(t);pending.delete(id);reject(new Error('CDP_TARGET_FAILED'))});
   })};
   parent.on('Target.receivedMessageFromTarget',msg=>{if(msg.sessionId!==e.sessionId)return;let parsed;try{parsed=JSON.parse(msg.message)}catch{stop('CDP_MESSAGE_INVALID');return}
    if(parsed.id){const p=pending.get(parsed.id);if(p){clearTimeout(p.t);pending.delete(parsed.id);parsed.error?p.reject(new Error('CDP_TARGET_FAILED')):p.resolve(parsed.result)}}
    else{observe(parsed);listeners.get(parsed.method)?.(parsed.params)}
   });
   void(async()=>{await child.send('Page.enable');await child.send('Network.enable');await setupNested(child);await child.send('Runtime.runIfWaitingForDebugger')})().catch(()=>stop('CDP_TARGET_FAILED'));
  });
  await parent.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:false,filter:[{type:'iframe'},{exclude:true}]});
 };
 const attach=async target=>{
  const session=await context.newCDPSession(target);sessions.push(session);
  await session.send('Page.enable');const tree=await session.send('Page.getFrameTree');
  frameIds.set(target===page?page.mainFrame():target,tree.frameTree.frame.id);
  session.on('Page.frameAttached',e=>observe({method:'Page.frameAttached',params:e}));
  session.on('Network.requestWillBeSent',e=>observe({method:'Network.requestWillBeSent',params:e}));
  await session.send('Network.enable');
  if(target===page)await setupNested(session);
 };
 const frameKey=f=>{if(f===page.mainFrame())return'main';if(!frames.has(f))frames.set(f,'frame-'+(++frameSerial));return frames.get(f)};
 const proof=async q=>{
  const until=performance.now()+1500;
  while(performance.now()<until){
   const f=q.frame(),parent=f.parentFrame();
   if(!frameIds.has(f)&&parent&&frameIds.has(parent)){
    const candidates=[...cdpParents].filter(([id,p])=>p===frameIds.get(parent)&&![...frameIds.values()].includes(id));
    const pending=parent.childFrames().filter(x=>!frameIds.has(x));
    if(candidates.length===1&&pending.length===1&&pending[0]===f)frameIds.set(f,candidates[0][0]);
   }
   const hits=cdpEvents.filter(e=>!e.used&&e.url===q.url()&&e.method===q.method());
   if(hits.length>1)throw new Error('INITIATOR_CORRELATION_AMBIGUOUS');
   if(hits.length===1&&frameIds.has(q.frame())&&['script','parser'].includes(hits[0].initiator?.type)){const e=hits[0];e.used=true;
    // The browser-created frame and CDP initiator must both be observable.
    if(e.frameId!==frameIds.get(q.frame())||!['script','parser'].includes(e.initiator?.type))throw new Error('INITIATOR_UNOBSERVABLE');
    return{frame:frameKey(f),parent:parent?frameKey(parent):null,type:q.resourceType(),redirected:!!q.redirectedFrom()||e.redirect,
     harnessBootstrap:q.url()===SDK&&f===page.mainFrame()&&e.initiator.type==='script'&&stackUrls(e.initiator.stack).includes(HARNESS),
     initiator:{type:e.initiator.type,urls:stackUrls(e.initiator.stack)}};
   }
   await sleep(10);
  }
  const f=q.frame(),id=frameIds.get(f),stack=frameStacks.get(id);
  // Chrome's frameAttached stack is direct frame-creation evidence, not page data.
  if(q.resourceType()==='document'&&q.method()==='GET'&&id&&stack){
   return{frame:frameKey(f),parent:f.parentFrame()?frameKey(f.parentFrame()):null,type:'document',redirected:!!q.redirectedFrom(),initiator:{type:'script',urls:stackUrls(stack)}};
  }
  observation.push({type:q.resourceType(),frameMapped:!!id,parentEvents:cdpParents.size,matchingEvents:cdpEvents.filter(x=>x.url===q.url()&&x.method===q.method()).length,creationStackAvailable:!!stack});
  throw new Error('INITIATOR_UNOBSERVABLE');
 };
 try{
  proxy=http.createServer((_,r)=>{try{gate.denyProxy()}catch(e){stop(safeCode(e))}r.writeHead(403);r.end()});
  proxy.on('connect',(_,socket)=>{try{gate.denyProxy()}catch(e){stop(safeCode(e))}socket.on('error',()=>{});socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')});
  await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({executablePath:CHROME,headless,proxy:{server:'http://127.0.0.1:'+proxy.address().port},args:[
   '--disable-background-networking','--disable-component-update','--disable-sync','--disable-quic','--no-first-run','--no-default-browser-check',
   '--disable-domain-reliability','--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
   '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--proxy-bypass-list=<-loopback>','--disable-features=WebTransport']});
  context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  await context.addInitScript(()=>{for(const k of ['RTCPeerConnection','webkitRTCPeerConnection','WebTransport','Worker','SharedWorker','EventSource'])Object.defineProperty(globalThis,k,{value:undefined,writable:false,configurable:false})});
  await context.routeWebSocket('**/*',s=>{stop('WEBSOCKET_FORBIDDEN');s.close()});
  context.on('serviceworker',()=>stop('SERVICE_WORKER_FORBIDDEN'));
  await context.exposeBinding('qaStatus',async(source,event)=>{
   if(closing||sdkResponseOnly&&sdkResponseObserved&&event==='SDK_ERROR')return;
   if(source.page!==page||source.frame!==page.mainFrame()||!['RENDER_BEGIN','RENDER_RETURNED','CALLBACK','WIDGET_ERROR','EXPIRED','SDK_ERROR'].includes(event)){stop('STATUS_SOURCE_FORBIDDEN');return}
   if(event==='RENDER_BEGIN'){try{gate.startWidget();status.renderStarted=true}catch(e){stop(safeCode(e))}}
   else if(event==='RENDER_RETURNED')status.renderReturned=true;
   else if(event==='CALLBACK')status.callback=true;
   else stop(event);
  });
  page=await context.newPage();await attach(page);
  context.on('page',p=>{if(p!==page){stop('POPUP_FORBIDDEN');void p.close().catch(()=>{})}});
  page.on('frameattached',f=>{void attach(f).catch(()=>{/* Missing CDP proof is denied at admission. */})});
  page.on('download',()=>stop('DOWNLOAD_FORBIDDEN'));
  await context.route('**/*',async route=>{
   const q=route.request();let c,ticket;
   try{
    if(closing){await route.abort();return}
    if(q.url()===HARNESS&&q.method()==='GET'&&q.frame()===page.mainFrame()&&!harnessUsed){harnessUsed=true;gate.chargeHarness();await route.fulfill({status:200,contentType:'text/html',body:html});return}
    const p=await proof(q),headers={};
    for(const [k,v]of Object.entries(await q.allHeaders())){
     if(['cookie','authorization','proxy-authorization','apikey'].includes(k.toLowerCase()))throw new Error('BROWSER_CREDENTIAL_FORBIDDEN');
     if(['accept','content-type','origin','referer','user-agent','sec-fetch-site','sec-fetch-mode','sec-fetch-dest'].includes(k.toLowerCase()))headers[k]=v;
    }
    const request={url:q.url(),method:q.method(),headers,body:q.postDataBuffer()||Buffer.alloc(0)};ticket=gate.admit(request,p);
    c=new AbortController();controllers.add(c);wire++;
    const response=await transport(request,{maxBytes:ticket.maxBytes,signal:c.signal,timeoutMs:10000,onResponse:r=>{gate.observeResponse(ticket,r);if(ticket.rule==='EXACT_BOOTSTRAP')sdkResponseObserved=true}});
    if(ticket.rule==='EXACT_BOOTSTRAP')sdkResponseObserved=true;
    gate.validateResponse(ticket,response);
    // B2 observes one response and NEVER delivers/executes the retrieved SDK.
    if(sdkResponseOnly){responseDecisionComplete=true;await route.abort();return}
    const out={...response.headers};for(const k of ['connection','transfer-encoding','content-length'])delete out[k];
    await route.fulfill({status:response.status,headers:out,body:response.body});
   }catch(e){if(ticket){gate.responseFailure(ticket,safeCode(e));if(ticket.rule==='EXACT_BOOTSTRAP')responseDecisionComplete=true}if(!closing)stop(safeCode(e));await route.abort().catch(()=>{})}finally{if(c){c.abort();controllers.delete(c)}}
  });
  if(installGuard)installNodeGuard(()=>{nodeDenials++;stop('UNCONTROLLED_NODE_EGRESS')});
  await page.goto(HARNESS,{waitUntil:'domcontentloaded',timeout:10000}).catch(e=>stop(safeCode(e)));
  const until=performance.now()+Math.min(observeMs,workMs);
  while(performance.now()<until&&!gate.receipt().firstFailure&&!(sdkResponseOnly?responseDecisionComplete:status.callback))await sleep(20);
  if(!gate.receipt().firstFailure&&!(sdkResponseOnly?responseDecisionComplete:status.callback))stop(sdkResponseOnly?'SDK_RESPONSE_NOT_OBSERVED':'CALLBACK_NOT_OBSERVED');
 }catch(e){stop(safeCode(e))}finally{
  clearTimeout(workTimer);
  closing=true;for(const c of controllers)c.abort();
  try{if(context)await bounded(context.close(),5000);if(browser)await bounded(browser.close(),5000);proxy?.closeAllConnections();if(proxy)await bounded(new Promise(r=>proxy.close(r)),1000);cleanup=true}catch{stop('CLEANUP_FAILED')}
  cdpEvents.length=0;frames.clear();
 }
 const result={...gate.receipt(),status,observation,wireDispatches:wire,nodeDenials,proxyForwardedRequests:0,cleanup,sdkResponseObserved,credentialsUsed:false,
  mediation:'FRESH_CONTROLLED_HTTP_RESPONSE_AT_ORIGINAL_URL_NOT_NATIVE_CHROME_TLS',supplierRuntime:'NOT_SOURCE_AUDITED'};
 gate.dispose();return result;
}
