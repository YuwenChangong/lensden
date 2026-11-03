import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {reviewV9,ORIGIN,VERSION} from '../e-verify-group1-v9-closure/review.mjs';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
import {makeBrowserFactory} from '../e-verify-group1-v9-closure/adapter.mjs';
import {runChromeSubset as runBoundGroup1} from './subset-runner.mjs';
import {loopbackTransport} from '../e-verify-group1-script-binding/execution/wire.mjs';
import {installNodeGuard} from '../e-verify-group1-script-identity/execution/node-guard.mjs';
import {catalogSteps} from '../e-verify-group1-script-identity/execution/group1/rls.mjs';

const privatePath='C:/Users/1/AppData/Local/OpenGlassHub/acceptance-input/e-verify-20261012/STATEFUL_PRIVATE_BINDING_GROUP1_650_V1.json';
const packetPath='C:/Temp/ogh-product-beta-development-20261013/tools/e-verify-group1-full650/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json';
export async function fullFlowFixture({refresh=true,wrongIdentity=false,globalLimit,measurementOnly=false,onBrowserReady=async()=>{}}={}){
  const reviewed=await reviewV9(),packet=JSON.parse(fs.readFileSync(packetPath));
  // Read only owner-approved numeric limits; never return or copy private account data.
  const caps=JSON.parse(fs.readFileSync(privatePath)).budget;
  if(JSON.stringify(caps)!==JSON.stringify(packet.ownerBudgets)||caps.openaiAndProviderCostUSDMax!==0)throw new Error('OWNER_CAP_DRIFT');
  const accounts=Object.fromEntries(['A','B','ADMIN'].map((a,i)=>[a,{userId:`00000000-0000-4000-8000-00000000000${i+1}`,email:`qa-${a.toLowerCase()}@example.invalid`,applicationRole:a==='ADMIN'?'admin':'user',exists:true,ownerControlled:true,dedicatedQA:true,legalConsentCurrent:true}]));
  // Counterfactual measurement is loopback-only, never a changed owner/Production cap.
  // Normal test/adapter still consumes the saved500 and proves its actual stop.
  const privateBinding={budget:{...caps,...(measurementOnly?{allBrowserHttpDispatchesMax:800}:globalLimit===undefined?{}:{allBrowserHttpDispatchesMax:globalLimit})},accounts};
  const item=name=>{const found=reviewed.safe.assets.find(a=>a.path.startsWith('/_astro/'+name+'.'));if(!found)throw new Error('FIXTURE_ASSET_MISSING');return found.path};
  const runtime=fs.readFileSync('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/node_modules/astro/dist/runtime/server/astro-island.js','utf8');
  const island=(component,props={})=>`<astro-island component-url="${item(component)}" component-export="default" renderer-url="${item('client')}" props="${JSON.stringify(props).replaceAll('"','&quot;')}" client="only" ssr opts="{}"></astro-island>`;
  const pages=new Map();
  for(const page of ['/login/','/products/','/products/xreal/xreal-air/','/admin/devices/'])for(const generation of [0,1,2]){
    const login=page==='/login/';
    const context=Object.fromEntries(Object.entries({locale:'zh-CN',preference:'auto',source:generation?'saved':'accept_language',autoLocale:'zh-CN',generation,provenance:generation?'account_adopted':null}).map(([k,v])=>[k,[0,v]]));
    const body='<!doctype html><html lang="zh-CN"><head>'+reviewed.safe.assets.filter(a=>a.kind==='stylesheet'&&reviewed.safe.graph.find(g=>g.path===a.path)?.parents.includes(page)).map(a=>`<link rel="stylesheet" href="${a.path}">`).join('')+
      `<link rel="modulepreload" href="${item('client')}"><script>window.process={env:{NODE_ENV:'production'}};window.Astro={only:async load=>{const hydrate=await load();await hydrate()}};</script><script>${runtime}</script></head><body>`+
      '<header class="og-header"><button class="og-header__menu-toggle"></button><nav class="og-header__nav"></nav></header>'+
      island('HeaderUserMenu',{localeContext:[0,context]})+island('HeaderNotifications',{localeContext:[0,context]})+island('LocalePreferenceSync',{initial:[0,context]})+(['/login/','/admin/devices/'].includes(page)?island('GlobalSearchBox',{localeContext:[0,context]}):'')+
      (login?island('AuthPanel',{locale:[0,'en'],next:[0,'/products/'],initialMode:[0,'login'],captchaMode:[0,'required'],authTurnstileSiteKey:[0,'synthetic-public-sitekey']}):'')+
      (page==='/admin/devices/'?island('AdminDevicesDashboard',{localeContext:[0,context]}):'')+
      (page==='/products/'?'<main data-brand-module><h1>Products</h1></main><script type="module" src="'+item('index.astro_astro_type_script_index_0_lang')+'"></script>':'')+
      (page==='/products/xreal/xreal-air/'?'<main data-product-detail><h1>Xreal Air</h1></main><script type="module">'+reviewed.detail.toString()+'</script>':'')+
      `<script type="module" src="${item('SiteHeader.astro_astro_type_script_index_0_lang')}"></script><script type="module" src="${item('page')}"></script></body></html>`;
    pages.set(page+'#'+generation,Buffer.from(body));
  }
  const htmlHashes=Object.fromEntries(['/login/','/products/','/products/xreal/xreal-air/','/admin/devices/'].map(p=>[p,[0,1,2].map(g=>sha(pages.get(p+'#'+g)))])),requests=[];
  const tokenActor=new Map(),pageTrace=[];let serial=0,provider=0;
  const server=http.createServer((q,r)=>{
    const u=new URL(q.url,'http://127.0.0.1'),route=u.pathname;
    // Only public route classes and methods enter the safe fixture trace.
    requests.push({method:q.method,kind:route.startsWith('/_astro/')?'static':route.startsWith('/auth/')?'auth':route.startsWith('/rest/')?'rest':route.startsWith('/turnstile/')||route.startsWith('/cdn-cgi/')?'turnstile':route.startsWith('/api/')?'app-read':'page'});
    const reply=(status,value,type='application/json')=>{r.writeHead(status,{'content-type':type});r.end(Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value))};
    let generation=0;try{const c=/ogh_preferences_v1=([^;]+)/.exec(q.headers.cookie||'');if(c)generation=JSON.parse(decodeURIComponent(c[1])).generation}catch{}
    if(pages.has(route+'#'+generation)){pageTrace.push({path:route,generation});return reply(200,pages.get(route+'#'+generation),'text/html')}
    if(reviewed.bodies.has(route))return reply(200,reviewed.bodies.get(route),route.endsWith('.js')?'application/javascript':'text/css');
    if(route==='/turnstile/v0/api.js')return reply(200,'window.turnstile={render(el,o){const f=document.createElement("iframe");f.src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/local-fixture";el.append(f);o.callback("SYNTHETIC_CHALLENGE");return "fixture-widget"},reset(){},remove(){}}','application/javascript');
    if(route==='/cdn-cgi/challenge-platform/local-fixture')return reply(200,'<!doctype html><p>Offline challenge fixture</p>','text/html');
    const actor=tokenActor.get(String(q.headers.authorization||'').replace(/^Bearer /,''));
    if(route==='/auth/v1/token'){
      const chunks=[];q.on('data',c=>chunks.push(c));q.on('end',()=>{
        const input=JSON.parse(Buffer.concat(chunks));let a;
        if(u.searchParams.get('grant_type')==='refresh_token')a=tokenActor.get(input.refresh_token);
        else{
          a=Object.keys(accounts).find(k=>accounts[k].email===input.email);
          if(!a)return reply(400,{code:'invalid_credentials'});
          if(input.gotrue_meta_security?.captcha_token!=='SYNTHETIC_CHALLENGE')return reply(400,{code:'captcha_failed'});
          if(input.password!=='SYNTHETIC_ONLY')return reply(400,{code:'invalid_credentials'});
        }
        if(!a)return reply(400,{code:'invalid_grant'});
        const access='SYNTHETIC_ACCESS_'+(++serial),refreshToken='SYNTHETIC_REFRESH_'+serial;tokenActor.set(access,a);tokenActor.set(refreshToken,a);
        reply(200,{access_token:access,refresh_token:refreshToken,token_type:'bearer',expires_in:3600,user:{id:wrongIdentity&&a==='A'?accounts.B.userId:accounts[a].userId,email:accounts[a].email,aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}});
      });return;
    }
    if(route==='/auth/v1/user')return reply(200,{id:accounts[actor]?.userId,email:accounts[actor]?.email});
    if(route==='/auth/v1/logout')return reply(204,'');
    if(route==='/rest/v1/profiles')return reply(200,[{id:accounts[actor]?.userId,role:accounts[actor]?.applicationRole}]);
    if(route.startsWith('/rest/')){
      const step=catalogSteps().find(s=>s.actor===(actor||'anon')&&s.path===u.pathname+u.search);
      if(!step)return reply(418,{code:'FIXTURE_UNBOUND_RLS'});
      if(step.expect==='deny')return reply(actor?403:401,{code:'42501',message:'permission denied'});
      if(step.expect==='empty-or-deny')return reply(200,[]);
      return reply(200,step.kind==='published'?[{slug:'xreal-air',brand_key:'xreal',name:'Xreal',catalog_normalized:true}]:step.kind==='specs'?[{device_slug:'xreal-air',key:'display',state:'KNOWN'}]:step.kind==='sources'?[{device_slug:'xreal-air',publisher:'Xreal'}]:[]);
    }
    if(route==='/api/admin/forum/me')return actor==='ADMIN'?reply(200,{user_id:accounts.ADMIN.userId,role:'admin',allowed:true}):reply(403,{error:'Forbidden'});
    if(route==='/api/admin/devices')return actor==='ADMIN'?reply(200,{ok:true,devices:[{id:'00000000-0000-4000-8000-000000000011',slug:'xreal-air',name:'Xreal',brandName:'Xreal',publicationStatus:'published'}]}):reply(403,{error:'Forbidden'});
    if(route==='/api/users/me/summary')return reply(200,{ok:true,profile:{id:accounts[actor]?.userId,username:'synthetic',display_name:'QA',profile_href:'/users/synthetic/',avatar_resolved_url:null},stats:{post_count:0,received_like_count:0},availability:{avatar:'unavailable',posts:'ready',commentLikes:'ready'}});
    if(route==='/api/users/me/preferences')return reply(200,{ok:true,preference:{locale_preference:'auto',revision:1,updated_at:'2026-10-12T00:00:00Z'}});
    if(route==='/api/users/me/notifications')return reply(200,{ok:true,notifications:[],unread_count:0});
    return reply(418,{code:'FIXTURE_UNBOUND_REQUEST'});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const wire=loopbackTransport('http://127.0.0.1:'+server.address().port);
  const transport=(q,bounds)=>{if(![ORIGIN,packet.supabaseOrigin,'https://challenges.cloudflare.com'].includes(new URL(q.url).origin))throw new Error('OFFLINE_ORIGIN_FORBIDDEN');const u=new URL(q.url);return wire({...q,url:'https://qa.example.invalid'+u.pathname+u.search},bounds)};
  const reviewedHtmlBodies=new Map(['/login/','/products/','/products/xreal/xreal-air/','/admin/devices/'].map(p=>[p,pages.get(p+'#0')]));
  const factory=makeBrowserFactory({manifest:reviewed.safe.assets,htmlHashes,reviewedHtmlBodies}),browsers=[];let fixtureProgress='INITIALIZED';
  const openBrowser=async options=>{
    const browser=await factory({...options,headless:true});browsers.push(browser);await onBrowserReady(browsers.length);let kind;
    const submit=async()=>{await browser.page.waitForSelector('input[type=email]');await browser.page.fill('input[type=email]',accounts[options.actor].email);await browser.page.fill('input[type=password]',kind==='wrong-password'?'SYNTHETIC_WRONG':'SYNTHETIC_ONLY');await browser.page.click('button[type=submit]')};
    return {...browser,permitLogin:k=>{kind=k;browser.permitLogin(k)},waitForSession:async()=>{await submit();return browser.waitForSession(15000)},waitForNegative:async()=>{await submit();return browser.waitForNegative(15000)},
      waitForLanding:async()=>{fixtureProgress='LANDING_'+options.actor;await browser.waitForLanding();fixtureProgress='LANDED_'+options.actor;if(refresh){const code=await browser.page.evaluate(async route=>{try{const m=await import(route);if(typeof m.n!=='function')return 'FIXTURE_CLIENT_EXPORT';const client=m.n();if(!client?.auth)return 'FIXTURE_CLIENT_EXPORT';const r=await client.auth.refreshSession();return r.error?'FIXTURE_REFRESH_REJECTED':'PASS'}catch{return 'FIXTURE_REFRESH_EXCEPTION'}},item('supabase-browser'));if(code!=='PASS')throw new Error(code);fixtureProgress='REFRESHED_'+options.actor}}};
  };
  let result;
  try{
    result=await runBoundGroup1({privateBinding,appOrigin:ORIGIN,supabaseOrigin:packet.supabaseOrigin,transport,openBrowser,
      deployment:async()=>{provider++;return {deploymentId:'SYNTHETIC_DEPLOYMENT',activeVersion:VERSION,activeTraffic:100}},assertDeployment:d=>d,installGuard:installNodeGuard,manualWaitMs:15000},
      {manifest:reviewed.safe.assets,htmlHashes,openBrowser});
    const observations=browsers.map(b=>b.receipt());
    return {result,fixtureProgress,pageTrace,actualOfflineDispatchCount:requests.length+provider,physicalLoopbackRequests:requests.length,providerFixtureGETs:provider,
      navigationFailureState:observations.map(b=>b.navigationFailureState).find(Boolean),countsBySource:Object.fromEntries(['static','page','auth','rest','app-read','turnstile'].map(k=>[k,requests.filter(q=>q.kind===k).length])),
      admittedGlobal:result.counts.allBrowserHttpDispatchesMax,proxyForwardedRequests:observations.reduce((n,b)=>n+b.proxyForwardedRequests,0),
      excludedResourceAttempts:observations.reduce((n,b)=>n+b.excludedResourceAttempts,0),savedOwnerCapsUnchanged:true,approvedGlobalMax:caps.allBrowserHttpDispatchesMax,
      fixtureAdmissionMax:privateBinding.budget.allBrowserHttpDispatchesMax,measurementOnly,productionCompatible:!measurementOnly&&globalLimit===undefined&&result.status==='PASS',productionRequests:0,productionWrites:0,
      offlineRefreshFixture:refresh,dynamicProductionChallengeRequests:'UNKNOWN_HARD_CAPPED',cleanupReserveSeconds:60};
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const output=await fullFlowFixture({wrongIdentity:process.argv.includes('--wrong-identity'),globalLimit:process.argv.includes('--low-budget')?3:undefined});
    if(process.argv.includes('--result'))fs.writeFileSync(process.argv[process.argv.indexOf('--result')+1],JSON.stringify(output)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:output.result.status,firstFailure:output.result.firstFailure,fixtureProgress:output.fixtureProgress,rejection:output.result.requestDiagnostics?.map(d=>d?.firstRejection).find(Boolean),navigationFailureState:output.navigationFailureState,pageTrace:output.pageTrace,counts:output.result.counts,identities:output.result.identitiesVerified,rls:output.result.catalogCasesPassed,negative:output.result.negativeAuthPassed,dispatches:output.actualOfflineDispatchCount,cleanup:output.result.cleanup,productionRequests:0}));
    if(output.result.status!=='PASS'&&!process.argv.includes('--wrong-identity')&&!process.argv.includes('--low-budget'))process.exitCode=1;
  }catch(e){console.log(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'OFFLINE_FULL_FLOW_FAILED',productionRequests:0}));process.exitCode=1}
}
