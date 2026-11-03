import http from'node:http';import {randomBytes}from'node:crypto';
import {chromium}from'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import {installNodeGuard}from'../e-verify-group1-script-identity/execution/node-guard.mjs';
import {NativeScope,ORIGIN}from'./scope.mjs';import {Evidence}from'./evidence.mjs';import {harness}from'./harness.mjs';
import {createProfile,assertNewProfile,cleanupProfile}from'./profile.mjs';
const safe=e=>/^[A-Z0-9_]{1,64}$/.test(e?.message)?e.message:'QA_BOUNDARY_FAILURE';
const bounded=async(p,ms)=>{let t;try{return await Promise.race([p,new Promise((_,r)=>{t=setTimeout(()=>r(new Error('CLEANUP_TIMEOUT')),ms)})])}finally{clearTimeout(t)}};
export async function runNative({workMs=520000,fixtureOrigin,offlineProxy,fixtureOwner,profilePath}={}){
 if((fixtureOrigin||offlineProxy||fixtureOwner)&&!(fixtureOrigin&&offlineProxy&&fixtureOwner))throw new Error('COMPLETE_OFFLINE_FIXTURE_REQUIRED');
 const profile=assertNewProfile(profilePath||createProfile());let profileRemoved=false;
 let server,browser,context,page,policy,closing=false;const evidence=new Evidence({fixtureOrigin}),seenFrames=new Set(),frameMap=new Map();let mainId;
 const stop=code=>evidence.stop(code),nonce=randomBytes(16).toString('hex');
 const content=harness({nonce,...(fixtureOrigin?{sdk:fixtureOrigin+'/fixture/sdk.js',vendorOrigin:fixtureOrigin}:{})});
 const processEvent=(method,e)=>{
  if(closing)return;
  if(method==='Page.frameAttached'){
   try{const parent=e.parentFrameId===mainId?'main':frameMap.get(e.parentFrameId);policy.register(e.frameId,parent);frameMap.set(e.frameId,e.frameId)}catch(err){stop(safe(err))}
  }else if(method==='Page.frameNavigated'){
   if(e.frame.id!==mainId&&policy.classify(e.frame.url)==='OFFICIAL_VENDOR'&&!seenFrames.has(e.frame.id)){seenFrames.add(e.frame.id);evidence.frame()}
  }else if(method==='Network.requestWillBeSent'){
   if(e.redirectResponse)evidence.response({url:e.redirectResponse.url,status:e.redirectResponse.status});
   evidence.request({url:e.request.url,method:e.request.method,type:e.type});
  }
  else if(method==='Network.responseReceived')evidence.response({url:e.response.url,status:e.response.status});
 };
 const installSession=async session=>{
  for(const name of ['Page.frameAttached','Page.frameNavigated','Network.requestWillBeSent','Network.responseReceived'])session.on(name,e=>processEvent(name,e));
  session.on('Fetch.requestPaused',e=>{
   void(async()=>{
    if(closing||evidence.receipt().stopReason){await session.send('Fetch.failRequest',{requestId:e.requestId,errorReason:'Aborted'});return}
    try{policy.admit({url:e.request.url,method:e.request.method,headers:e.request.headers,type:e.resourceType,
     frame:e.frameId===mainId?'main':frameMap.get(e.frameId),id:e.requestId,redirectedFrom:e.redirectedRequestId});
     // Browser native HTTP/TLS, not Node fetch, route.fetch or route.fulfill.
     await session.send('Fetch.continueRequest',{requestId:e.requestId});
    }catch(err){stop(safe(err));await session.send('Fetch.failRequest',{requestId:e.requestId,errorReason:'BlockedByClient'}).catch(()=>{})}
   })().catch(()=>stop('CDP_REQUEST_CONTROL_FAILED'));
  });
  await session.send('Page.enable');await session.send('Network.enable');await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await nested(session);
 };
 const nested=async parent=>{
  parent.on('Target.attachedToTarget',e=>{
   if(e.targetInfo.type!=='iframe'||!e.waitingForDebugger){stop('UNOBSERVED_TARGET');return}
   let seq=0;const pending=new Map(),listeners=new Map();
   const child={on:(name,fn)=>listeners.set(name,fn),send:(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_TARGET_TIMEOUT'))},1500);pending.set(id,{resolve,reject,t});
    parent.send('Target.sendMessageToTarget',{sessionId:e.sessionId,message:JSON.stringify({id,method,params})}).catch(()=>{clearTimeout(t);pending.delete(id);reject(new Error('CDP_TARGET_FAILED'))});
   })};
   parent.on('Target.receivedMessageFromTarget',msg=>{if(msg.sessionId!==e.sessionId)return;let m;try{m=JSON.parse(msg.message)}catch{stop('CDP_MESSAGE_INVALID');return}
    if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.t);pending.delete(m.id);m.error?p.reject(new Error('CDP_TARGET_FAILED')):p.resolve(m.result)}}
    else listeners.get(m.method)?.(m.params);
   });
   void(async()=>{await installSession(child);await child.send('Runtime.runIfWaitingForDebugger')})().catch(()=>stop('CDP_TARGET_FAILED'));
  });
  await parent.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:false,filter:[{type:'iframe'},{exclude:true}]});
 };
 const timer=setTimeout(()=>stop('WORK_DEADLINE'),workMs);
 try{
  server=http.createServer((q,r)=>{if(q.method!=='GET'||q.url!=='/turnstile-native-qa'){r.writeHead(404);r.end();return}r.writeHead(200,content.headers);r.end(content.body)});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port;policy=new NativeScope(local,{fixtureOrigin});
  const shell=await chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:!!fixtureOrigin,
   ...(offlineProxy?{proxy:{server:offlineProxy,bypass:'127.0.0.1'}}:{}),args:['--disable-extensions','--disable-background-networking','--disable-component-update','--disable-sync',
    '--no-first-run','--no-default-browser-check','--disable-quic','--disable-domain-reliability','--disable-features=WebTransport',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',...(offlineProxy?['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']:[])]});
  browser=shell.browser();
  context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,permissions:[]});
  if((await context.cookies()).length)throw new Error('EXISTING_COOKIE_STATE');
  await context.addInitScript(()=>{for(const k of ['Worker','SharedWorker','EventSource','RTCPeerConnection','webkitRTCPeerConnection','WebTransport'])Object.defineProperty(globalThis,k,{value:undefined,writable:false,configurable:false})});
  await context.routeWebSocket('**/*',s=>{stop('WEBSOCKET_BLOCKED');s.close()});
  context.on('serviceworker',()=>stop('SERVICE_WORKER_BLOCKED'));
  await context.exposeBinding('qaEvent',(source,name)=>{if(closing)return;if(source.page!==page||source.frame!==page.mainFrame()||typeof name!=='string'){stop('STATUS_SOURCE_INVALID');return}evidence.event(name)});
  page=await context.newPage();for(const p of shell.pages())await p.close();context.on('page',p=>{if(p!==page){stop('POPUP_BLOCKED');void p.close().catch(()=>{})}});
  page.on('pageerror',()=>{evidence.error();stop('PAGE_ERROR')});page.on('download',()=>stop('DOWNLOAD_BLOCKED'));
  const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');mainId=(await cdp.send('Page.getFrameTree')).frameTree.frame.id;policy.register('main',null);
  await installSession(cdp);
  installNodeGuard(()=>stop('INDEPENDENT_NODE_EGRESS_BLOCKED'));
  await page.goto(local+'/turnstile-native-qa',{waitUntil:'domcontentloaded',timeout:15000});
  if(fixtureOwner)await fixtureOwner(page);
  while(!evidence.receipt().ownerFinished&&!evidence.receipt().stopReason)await new Promise(r=>setTimeout(r,50));
 }catch(e){stop(safe(e))}finally{
  clearTimeout(timer);closing=true;
  let ok=true;try{if(context)await bounded(context.close(),5000)}catch{ok=false}
  try{if(browser)await bounded(browser.close(),5000)}catch{ok=false}
  try{server?.closeAllConnections();if(server)await bounded(new Promise(r=>server.close(r)),1000)}catch{ok=false}
  if(ok)try{profileRemoved=cleanupProfile(profile)}catch{ok=false}
  evidence.cleaned(ok);seenFrames.clear();frameMap.clear();
 }
 return{...evidence.receipt(),nativeSdkDelivery:'CHROME_FETCH_CONTINUE_NO_NODE_TLS_TRANSPORT',profile:'EPHEMERAL_BROWSER_PLUS_INCOGNITO_CONTEXT',
  profileCleanup:'EXACT_OWNED_TEMP_PATH_REMOVAL_AFTER_CLOSE_NATIVE_JOB_DRAIN_REQUIRED',profileRemoved,fixtureOnly:!!fixtureOrigin,productionRequests:0,productionWrites:0};
}
