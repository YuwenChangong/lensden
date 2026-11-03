import {StaticEvidencePolicy} from '../e-verify-group1-production-binding/policy.mjs';
import http from 'node:http';
import {chromium} from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import {Group1Gate,SharedBudget,validateResponse} from './gate.mjs';
import {identitySteps} from '../e-verify-group1-script-identity/execution/identity-rls.mjs';
import {catalogSteps,verifyGroup1Catalog as verifyCatalog} from '../e-verify-group1-script-identity/execution/group1/rls.mjs';
import {createHash} from 'node:crypto';
import {DiagnosticJournal} from '../e-verify-group1-script-identity/execution/group1/diagnostics.mjs';
import {ownedReadKey,isOwnedRead} from './cached-read.mjs';

// One actor, one disposable context. Tokens never leave this process or enter receipts.
export async function openGroup1Browser({caps,actor,binding,appOrigin,supabaseOrigin,staticPaths,staticManifest=[],pageAssertions={},transport,budget=new SharedBudget(caps),headless=false,workMs,readOnlyLoginDiagnostic=false,productionVersion,approvedHtmlHashes={},htmlEvidencePolicy}={}){
 if(typeof transport!=='function')throw new Error('CONTROLLED_TRANSPORT_REQUIRED');
 if(!Array.isArray(approvedHtmlHashes['/login/'])||!approvedHtmlHashes['/login/'].length
  ||Object.values(approvedHtmlHashes).some(v=>!Array.isArray(v)||!v.length||v.some(h=>!/^[a-f0-9]{64}$/.test(h))))throw new Error('REVIEWED_HTML_REQUIRED');
 const pageHashes=new Map(Object.entries(approvedHtmlHashes).map(([p,v])=>[p,new Set(v)]));
 const staticPolicy=new StaticEvidencePolicy({origin:appOrigin,version:productionVersion,assets:staticManifest});
 const gate=new Group1Gate({caps,actor,binding,appOrigin,supabaseOrigin,staticPaths,budget,workMs});
 const diagnostics=new DiagnosticJournal({actor,appOrigin,supabaseOrigin,staticPaths,readOnlyLoginDiagnostic});
 let diagnosticStage='LOGIN_'+actor,preferenceObserved=false,navigationFailureState=null;
 const aborts=new Set(),readCoalescing=new Map();let browser,context,proxy,p,closed=false,closingMode=false,key=null,wire=0,proxyDenials=0,realtime=0,excluded=0,pendingNavigation=null,loginNavigation=null,preferenceNavigation=null,preferenceReloadUsed=false,logoutNavigation=null,loginKind=null,negativePassed=false,coalescedReads=0;
 const stop=c=>{for(const a of aborts)a.abort();return gate.stop(c)};
 const dispatch=async(request,meta={source:'CONTROLLED_NODE_READ',resourceType:'fetch',redirected:false})=>{
  if(closingMode)throw new Error('CONTEXT_CLOSING');
  let ticket,sequence;const controller=new AbortController();aborts.add(controller);
  try{
   if(new URL(request.url).pathname.startsWith('/_astro/'))staticPolicy.assertRequest(request,{...meta,stage:diagnosticStage},productionVersion);
   const admitted=diagnostics.reserve(gate,request,{...meta,stage:diagnosticStage});ticket=admitted.ticket;sequence=admitted.sequence;wire++;
   diagnostics.dispatchStarted(sequence);
   const result=await transport(request,{maxBytes:ticket.maxBytes,signal:controller.signal,timeoutMs:15000});
   diagnostics.completed(sequence,result.status);
   validateResponse(ticket,result);
   if(ticket.kind==='page'){if(htmlEvidencePolicy)htmlEvidencePolicy.assertBody(new URL(request.url).pathname,result.body);else if(!pageHashes.get(new URL(request.url).pathname)?.has(createHash('sha256').update(result.body).digest('hex')))throw new Error('HTML_SOURCE_MISMATCH')}
   if(ticket.kind==='page'&&pageAssertions[new URL(request.url).pathname])pageAssertions[new URL(request.url).pathname](result);
   if(ticket.kind==='static'&&staticManifest.length){const item=staticManifest.find(x=>x.path===new URL(request.url).pathname);if(!item||result.body.length!==item.bytes||createHash('sha256').update(result.body).digest('hex')!==item.sha256)throw new Error('STATIC_SOURCE_MISMATCH')}
   if(ticket.kind==='static')staticPolicy.assertBody(new URL(request.url).pathname,result.body);
   // Register public references only after response/identity or static-byte checks,
   // before Chrome receives the document or evaluates the bound script.
   if(readOnlyLoginDiagnostic&&diagnosticStage==='LOGIN_A'){
    if(ticket.kind==='page'&&new URL(request.url).pathname==='/login/'){
     const contentType=Object.entries(result.headers).find(([k])=>k.toLowerCase()==='content-type')?.[1];
     if(typeof contentType!=='string'||!/^text\/html(?:;|$)/i.test(contentType))throw new Error('LOGIN_HTML_TYPE_INVALID');
     await diagnostics.observeLoginHtml(result.body,request.url);
    }else if(ticket.kind==='static'&&staticManifest.length&&new URL(request.url).pathname.endsWith('.js'))
     await diagnostics.observeBoundScript(result.body,request.url);
   }
   if(ticket.kind==='own-read'&&new URL(request.url).pathname==='/api/users/me/summary'){let data;try{data=JSON.parse(result.body)}catch{throw new Error('OWN_SUMMARY_INVALID')}if(data.ok!==true||data.profile?.id!==binding.userId)throw new Error('OWN_SUMMARY_IDENTITY')}
   if(ticket.kind==='admin-read'){
    let data;try{data=JSON.parse(result.body)}catch{throw new Error('ADMIN_JSON_INVALID')}
    if(actor!=='ADMIN'){if(result.status!==403||!data||typeof data!=='object'||Array.isArray(data)||!['error','code'].some(k=>typeof data[k]==='string')||['devices','data','profile','users'].some(k=>Object.hasOwn(data,k)))throw new Error('ADMIN_DENIAL_ASSERTION')}
    else if(new URL(request.url).pathname==='/api/admin/forum/me'){if(data.user_id!==binding.userId||data.role!=='admin'||data.allowed!==true)throw new Error('ADMIN_IDENTITY_MISMATCH')}
    else if(data.ok!==true||!Array.isArray(data.devices)||!data.devices.every(d=>d&&['id','slug','name','brandName'].every(k=>typeof d[k]==='string')&&['draft','published','hidden','archived'].includes(d.publicationStatus)))throw new Error('ADMIN_READ_ASSERTION');
   }
   if(ticket.kind==='login'||ticket.kind==='refresh'){
    let data;try{data=JSON.parse(result.body.toString('utf8'))}catch{throw new Error('AUTH_JSON_INVALID')}
    if(ticket.loginKind&&ticket.loginKind!=='success'){gate.acceptNegative(ticket,result);negativePassed=true}
    else{gate.acceptSession(ticket,data);readCoalescing.clear();if(ticket.kind==='login')loginNavigation=appOrigin+'/products/';const found=Object.entries(request.headers||{}).find(([k])=>k.toLowerCase()==='apikey')?.[1];if(found){if(key&&found!==key)throw new Error('PUBLIC_KEY_DRIFT');key=found}}
   }
   if(ticket.kind==='logout'){gate.acceptLogout(ticket,result);logoutNavigation=p.url()}
   if(ticket.kind==='own-read'&&new URL(request.url).pathname==='/api/users/me/preferences'&&!preferenceReloadUsed){
    let data;try{data=JSON.parse(result.body)}catch{throw new Error('PREFERENCE_RESPONSE_INVALID')}
    const v=data?.preference;if(data.ok!==true||!['auto','zh-CN','en'].includes(v?.locale_preference)||!Number.isSafeInteger(v.revision)||v.revision<0||(v.revision===0?v.updated_at!==null:!Number.isFinite(Date.parse(v.updated_at))))throw new Error('PREFERENCE_RESPONSE_INVALID');
    preferenceNavigation=new URL(p.url()).pathname.startsWith('/login')?appOrigin+'/products/':p.url();
    preferenceObserved=true;
   }
   return result;
  }catch(e){if(sequence!==undefined)diagnostics.failed(sequence,e.message);if(closingMode)throw new Error('CONTEXT_CLOSING');throw stop(/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'REQUEST_FAILURE')}
  finally{controller.abort();aborts.delete(controller);if(ticket)gate.complete(ticket)}
 };
 const bounded=async(promise,ms)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('BROWSER_CLOSE_TIMEOUT')),ms)})])}finally{clearTimeout(timer)}};
 let closing;
 const close=()=>closing??=(async()=>{closingMode=true;for(const a of aborts)a.abort();try{try{if(context){await bounded(context.unrouteAll({behavior:'ignoreErrors'}),2000);await bounded(context.close(),5000)}}finally{try{if(browser)await bounded(browser.close(),5000)}finally{proxy?.closeAllConnections();if(proxy)await bounded(new Promise(r=>proxy.close(r)),1000)}}closed=true}finally{gate.dispose()}})();
 try{
  proxy=http.createServer((q,r)=>{proxyDenials++;r.writeHead(403);r.end()});
  proxy.on('connect',(q,s)=>{proxyDenials++;s.on('error',()=>{});s.end('HTTP/1.1 403 Forbidden\r\n\r\n')});
  await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless,proxy:{server:'http://127.0.0.1:'+proxy.address().port},args:[
   '--disable-background-networking','--disable-component-update','--disable-sync','--disable-quic','--no-first-run','--no-default-browser-check',
   '--disable-domain-reliability','--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
   '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--proxy-bypass-list=<-loopback>','--disable-features=WebTransport']});
  context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  await context.addInitScript(()=>{
   for(const k of ['RTCPeerConnection','webkitRTCPeerConnection','WebTransport','Worker','SharedWorker','EventSource'])Object.defineProperty(globalThis,k,{value:undefined,writable:false,configurable:false});
   // Ephemeral browser storage is allowed; no disk-backed user profile, tracing or HAR.
  });
  await context.routeWebSocket('**/*',socket=>{realtime++;socket.close()});
  await context.route('**/*',async route=>{
   const q=route.request();
   const diagnosticRequest={url:q.url(),method:q.method(),actor};
   const diagnosticMeta={stage:diagnosticStage,source:q.isNavigationRequest()?'BROWSER_NAVIGATION':['fetch','xhr'].includes(q.resourceType())?'BROWSER_FETCH':'BROWSER_RESOURCE',resourceType:q.resourceType(),redirected:!!q.redirectedFrom()};
   try{
    if(closingMode){await route.abort().catch(()=>{});return}
    // Deliberately exclude nonessential images/media/fonts from this Auth/RLS subset.
    if(['image','media','font'].includes(q.resourceType())&&new URL(q.url()).origin!=='https://challenges.cloudflare.com'){excluded++;await route.abort();return}
    if(q.redirectedFrom())throw new Error('REDIRECT_FORBIDDEN');
    if(q.isNavigationRequest()&&p&&q.frame()!==p.mainFrame()&&(!q.frame().parentFrame()||new URL(q.url()).origin!=='https://challenges.cloudflare.com'))throw new Error('POPUP_OR_FRAME_FORBIDDEN');
    if(q.isNavigationRequest()&&p&&q.frame()===p.mainFrame()){
     if(q.url()===pendingNavigation)pendingNavigation=null;
     else if(q.url()===loginNavigation)loginNavigation=null;
     else if(q.url()===preferenceNavigation&&!preferenceReloadUsed){preferenceNavigation=null;preferenceReloadUsed=true}
     else if(q.url()===logoutNavigation)logoutNavigation=null;
     else{navigationFailureState={preferenceObserved,preferenceReloadUsed,preferenceNavigationArmed:!!preferenceNavigation,loginNavigationArmed:!!loginNavigation,explicitNavigationArmed:!!pendingNavigation};throw new Error('NAVIGATION_NOT_ARMED')}
     gate.nextNavigation();
     readCoalescing.clear();
    }
    let body=q.postDataBuffer()||Buffer.alloc(0);
    if(['invalid-captcha','missing-captcha'].includes(loginKind)&&q.url()===supabaseOrigin+'/auth/v1/token?grant_type=password'&&q.method()==='POST'){
     const parsed=JSON.parse(body);if(typeof parsed.gotrue_meta_security?.captcha_token!=='string'||!parsed.gotrue_meta_security.captcha_token)throw new Error('NEGATIVE_CHALLENGE_NOT_READY');
     parsed.gotrue_meta_security=loginKind==='missing-captcha'?{}:{captcha_token:'QA_EXPLICITLY_INVALID_CAPTCHA_PROOF'};body=Buffer.from(JSON.stringify(parsed));
    }
    const request={url:q.url(),method:q.method(),actor,headers:await q.allHeaders(),body};
    let response;
    if(request.method==='GET'&&(request.url===appOrigin+'/api/admin/forum/me'||isOwnedRead(request.url,appOrigin))){
     gate.assertActive();const summary=isOwnedRead(request.url,appOrigin);
     const fingerprint=summary?ownedReadKey(request,appOrigin,gate.sessionHeaders()):JSON.stringify([request.url,Object.entries(request.headers).sort(([a],[b])=>a.localeCompare(b))]);
     const pending=readCoalescing.get(fingerprint);
     if(pending&&(summary||!pending.reused&&performance.now()-pending.start<=1000&&new URL(p.url()).pathname==='/admin/devices/')){
      budget.reserve(['allBrowserHttpDispatchesMax']);pending.reused=true;coalescedReads++;response=await pending.promise;gate.assertActive();
     }else{const item={start:performance.now(),reused:false,promise:dispatch(request,diagnosticMeta)};readCoalescing.set(fingerprint,item);response=await item.promise}
    }else response=await dispatch(request,diagnosticMeta);
    const headers={...response.headers};for(const k of ['connection','transfer-encoding','set-cookie','content-length'])delete headers[k];
    await route.fulfill({status:response.status,headers,body:response.body});
   }catch(e){if(!closingMode){if(!diagnostics.receipt().firstFailure){try{diagnostics.rejectBrowser(gate,diagnosticRequest,diagnosticMeta,e.message)}catch{}}stop(/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'BROWSER_REQUEST_FAILURE')}await route.abort().catch(()=>{})}
  });
  p=await context.newPage();
  const page=Object.freeze({
   async fill(selector,value){if(!['input[type=email]','input[type=password]'].includes(selector))throw new Error('INPUT_SELECTOR_INVALID');await p.locator(selector).fill(value)},
   async click(selector){if(selector!=='button[type=submit]')throw new Error('CLICK_SELECTOR_INVALID');await p.locator(selector).click()},
   async waitForSelector(selector){await p.waitForSelector(selector,{timeout:5000});return true},
   async evaluate(fn,arg){return p.evaluate(fn,arg)},
  });
  const read=async(path,role=actor)=>dispatch({url:supabaseOrigin+path,method:'GET',actor:role,headers:{apikey:key,...(role==='anon'?{authorization:'Bearer '+key}:gate.sessionHeaders())},body:Buffer.alloc(0)});
  return Object.freeze({page,permitLogin:k=>{gate.permitLogin(k);loginKind=k;diagnosticStage=k==='success'?'LOGIN_'+actor:k==='invalid-captcha'?'NEGATIVE_CAPTCHA':k==='missing-captcha'?'NEGATIVE_MISSING_CAPTCHA':'NEGATIVE_PASSWORD'},permitLogout:()=>gate.permitLogout(),
   async navigate(path){if(!['/login/','/login/?next=%2Fproducts%2F','/','/products/','/products/xreal/xreal-air/','/settings/','/admin/devices/'].includes(path)||pendingNavigation)throw stop('NAVIGATION_SCOPE');pendingNavigation=appOrigin+path;await p.goto(appOrigin+path,{waitUntil:'domcontentloaded',timeout:15000})},
   async waitForSession(ms=15000){const until=performance.now()+ms;while(performance.now()<until){const s=gate.receipt();if(s.firstFailure)throw new Error(s.firstFailure);if(s.sessionPresent)return true;await new Promise(r=>setTimeout(r,25))}throw stop('LOGIN_WAIT_TIMEOUT')},
   async waitForLanding(){await p.waitForURL(appOrigin+'/products/',{timeout:15000});await p.locator('[data-brand-module]').first().waitFor({timeout:15000});const until=performance.now()+15000;let quietSince=null;while(performance.now()<until){const r=gate.receipt();if(r.firstFailure)throw new Error(r.firstFailure);const hydrated=await p.evaluate(()=>[...document.querySelectorAll('astro-island')].every(x=>!x.hasAttribute('ssr'))).catch(()=>false);if(preferenceObserved&&r.inFlight===0&&hydrated){quietSince??=performance.now();if(performance.now()-quietSince>=500)return true}else quietSince=null;await new Promise(r=>setTimeout(r,25))}throw stop('LOGIN_LANDING_NOT_SETTLED')},
   async waitForNegative(ms=15000){const until=performance.now()+ms;while(performance.now()<until){if(gate.receipt().firstFailure)throw new Error(gate.receipt().firstFailure);if(negativePassed&&!gate.receipt().sessionPresent)return true;await new Promise(r=>setTimeout(r,25))}throw stop('NEGATIVE_AUTH_WAIT_TIMEOUT')},
   async verifyActor(){const steps=identitySteps(binding,actor);const auth=await read(steps[0].path),profile=await read(steps[1].path);return gate.verifyIdentity(auth,profile)},
   async catalog(id){const step=catalogSteps().find(s=>s.id===id&&['anon',actor].includes(s.actor));if(!step||!key)throw stop('RLS_STEP_UNBOUND');try{return verifyCatalog(step,await read(step.path,step.actor))}catch{throw stop('RLS_ASSERTION_FAILED')}},
   async adminRead(){const r=await dispatch({url:appOrigin+'/api/admin/devices',method:'GET',actor,headers:gate.sessionHeaders(),body:Buffer.alloc(0)});let data;try{data=JSON.parse(r.body)}catch{throw stop('ADMIN_JSON_INVALID')}if(actor==='ADMIN'&&(!data?.ok||!Array.isArray(data.devices)))throw stop('ADMIN_READ_ASSERTION');if(actor!=='ADMIN'&&r.status!==403)throw stop('ADMIN_DENIAL_ASSERTION');return true},
   async assertAdminUi(){if(actor==='ADMIN'){await p.locator('.admin-news-dashboard').waitFor({timeout:10000});await p.locator('.admin-news-dashboard__list').waitFor({timeout:10000});if(await p.locator('.comment-inline-error').count())throw stop('ADMIN_UI_LOAD_FAILED')}else{await p.locator('.admin-state-message p').filter({hasText:/^(?:This account does not have administrator access\.|当前账号没有管理员权限)$/}).waitFor({timeout:10000});if(await p.locator('.admin-news-dashboard').count())throw stop('ORDINARY_ADMIN_UI_LEAK')}return true},
   async logout(){gate.permitLogout();await p.locator('.header-user-menu__trigger').click();await p.locator('.header-user-menu__actions button[role=menuitem]').click();const until=performance.now()+5000;while(performance.now()<until){if(gate.receipt().firstFailure)throw new Error(gate.receipt().firstFailure);const cleared=await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.endsWith('-auth-token')).length===0).catch(()=>false);if(!gate.receipt().sessionPresent&&cleared)return true;await new Promise(r=>setTimeout(r,25))}throw stop('SDK_LOGOUT_NOT_CONFIRMED')},
   receipt:()=>({...gate.receipt(),navigationFailureState,diagnostics:diagnostics.receipt(),negativeAuthPassed:negativePassed,coalescedConcurrentReads:coalescedReads,wireDispatches:wire,proxyDenials,proxyForwardedRequests:0,blockedRealtime:realtime,excludedResourceAttempts:excluded,closed}),close});
 }catch(e){await close();throw e}
}


