import http from 'node:http';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {loopbackTransport} from './execution/wire.mjs';import {openGroup1Browser} from './execution/group1/browser.mjs';
import {SharedBudget} from './execution/group1/gate.mjs';
const deps='C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/node_modules';
const require=createRequire(import.meta.url),esbuild=require(deps+'/esbuild/lib/main.js');
export const caps={allBrowserHttpDispatchesMax:500,applicationMutationDispatchesMax:50,cleanupMutationDispatchesMax:20,supabaseAuthDispatchesMax:40,supabaseRestReadDispatchesMax:80,supabaseRestWriteDispatchesMax:20,turnstileHttpDispatchesMax:40,mailProducingSubmissionsMax:3,storageUploadOperationsMax:20,storageDeleteOperationsMax:10,mediaRangeRequestsMax:20,mediaUploadBytesMax:30000000,mediaReadBytesMax:52428800,r2StoredBytesMax:20971520,openaiModerationCallsMax:20,openaiAndProviderCostUSDMax:0,executionSecondsMax:3600,ownerSessionRefreshRequestsMax:6};
export const user={userId:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid',applicationRole:'user'};
const appOrigin='https://app.example.invalid',supabaseOrigin='https://db.example.invalid';
export async function fixture({captcha=true,wrongUser=false,loginError=false,hydratedShell=false,staticManifest=[],admin=false,wrongAdminIdentity=false,actor='A',extraScript='',readOnlyLoginDiagnostic=false}={}){
 const account={...user,applicationRole:admin?'admin':'user',...(actor==='B'?{userId:'00000000-0000-4000-8000-000000000002',email:'qb@example.invalid'}:{})};
 const repo='C:/Users/1/.codex/worktrees/e-verify-stateful-controls/OpenGlass Hub';
 const bundle=await esbuild.build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import AdminDevicesDashboard from './src/components/admin/AdminDevicesDashboard.tsx';
 import AuthPanel from './src/components/forum/AuthPanel.tsx';import HeaderUserMenu from './src/components/site/HeaderUserMenu.tsx';
 import HeaderNotifications from './src/components/site/HeaderNotifications.tsx';import LocalePreferenceSync from './src/components/i18n/LocalePreferenceSync.tsx';
 import {resolveLocale} from './src/lib/i18n/locale.ts';import {readBrowserPreference} from './src/lib/i18n/preference-cookie.ts';
 const initial=resolveLocale({saved:readBrowserPreference()});const root=createRoot(document.getElementById('root'));
 root.render(location.pathname==='/login/'?React.createElement(AuthPanel,{locale:'en',captchaMode:'required',authTurnstileSiteKey:'synthetic-public-sitekey',next:'/products/'}):
 React.createElement(React.Fragment,null,React.createElement(HeaderUserMenu,{localeContext:initial}),React.createElement(HeaderNotifications,{localeContext:initial}),
 React.createElement(LocalePreferenceSync,{initial}),location.pathname==='/admin/devices/'?React.createElement(AdminDevicesDashboard,{localeContext:initial}):React.createElement('main',{'data-brand-module':''},React.createElement('h1',null,'Products'))));
 ${extraScript}
 `,resolveDir:repo,loader:'jsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',nodePaths:[deps],define:{'import.meta.env.PUBLIC_SUPABASE_URL':JSON.stringify(supabaseOrigin),'import.meta.env.PUBLIC_SUPABASE_ANON_KEY':'"synthetic-public-key"','import.meta.env.DEV':'false','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 let wireCount=0;const requests=[];
 const server=http.createServer((q,r)=>{wireCount++;requests.push(q.method+' '+q.url);r.setHeader('access-control-allow-origin',appOrigin);r.setHeader('access-control-allow-headers','authorization,apikey,content-type,x-client-info,x-supabase-api-version');r.setHeader('access-control-allow-methods','GET,POST,OPTIONS');
  if(q.method==='OPTIONS'){r.writeHead(204);r.end();return}
  if(q.url==='/login/'){r.setHeader('content-type','text/html');r.end('<!doctype html><div id="root"></div><script src="/_astro/app.js"></script>');return}
  if(q.url==='/_astro/app.js'){r.setHeader('content-type','application/javascript');r.end(bundle.outputFiles[0].contents);return}
  if(q.url.startsWith('/turnstile/')){r.setHeader('content-type','application/javascript');r.end(`window.turnstile={render(el,options){${captcha?"options.callback('SYNTHETIC_CHALLENGE')":""};return 'synthetic-widget'},reset(){},remove(){}}`);return}
  if(q.url===`/products/`||q.url===`/settings/`||q.url===`/admin/devices/`){r.setHeader('content-type','text/html');r.end(hydratedShell?'<!doctype html><div id="root"></div><script src="/_astro/app.js"></script>':'<!doctype html><h1>Products</h1>');return}
  r.setHeader('content-type','application/json');
  if(q.url==='/auth/v1/token?grant_type=password'){
   q.resume();if(loginError){r.writeHead(400);r.end(JSON.stringify({code:typeof loginError==='string'?loginError:'captcha_failed',msg:'synthetic denial'}));return}
   r.end(JSON.stringify({access_token:'SYNTHETIC_ACCESS',refresh_token:'SYNTHETIC_REFRESH',token_type:'bearer',expires_in:3600,user:{id:wrongUser?'00000000-0000-4000-8000-000000000002':account.userId,email:account.email,aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));return}
  if(q.url==='/auth/v1/user'){r.end(JSON.stringify({id:account.userId,email:account.email}));return}
  if(q.url.startsWith('/rest/v1/profiles?')){r.end(JSON.stringify([{id:account.userId,role:account.applicationRole}]));return}
  if(q.url.startsWith('/rest/v1/')){
   const anon=q.headers.authorization==='Bearer synthetic-public-key',u=new URL(q.url,'http://127.0.0.1'),table=u.pathname.split('/').at(-1),select=u.searchParams.get('select');
   if(table==='devices'&&select==='slug,brand_key,name,catalog_normalized'){r.end('[{"slug":"xreal-air","brand_key":"xreal","name":"Xreal","catalog_normalized":true}]');return}
   if((table==='devices'||table==='catalog_audit_events')&&!anon){r.end('[]');return}
   if((table==='devices'||table==='catalog_audit_events')&&anon||!anon){r.writeHead(anon?401:403);r.end(JSON.stringify({code:'42501',message:'permission denied for '+(table.startsWith('public_device')?'view ':'table ')+table}));return}
   r.end(JSON.stringify(table.endsWith('_specs')?[{device_slug:'xreal-air',key:'display',state:'KNOWN'}]:table.endsWith('_sources')?[{device_slug:'xreal-air',publisher:'Xreal'}]:[]));return;
  }
  if(q.url==='/api/admin/forum/me'){if(!admin){r.writeHead(403);r.end('{"error":"Forbidden"}');return}r.end(JSON.stringify({user_id:wrongAdminIdentity?'00000000-0000-4000-8000-000000000009':account.userId,role:'admin',allowed:true}));return}
  if(q.url==='/api/admin/devices'){if(!admin){r.writeHead(403);r.end('{"error":"Forbidden"}');return}r.end('{"ok":true,"devices":[{"id":"00000000-0000-4000-8000-000000000011","slug":"xreal-air","name":"Xreal","brandName":"Xreal","publicationStatus":"published"}]}');return}
  if(q.url==='/api/users/me/summary'){r.end(JSON.stringify({ok:true,profile:{id:user.userId,username:'synthetic',display_name:'QA',profile_href:'/users/synthetic/',avatar_resolved_url:null},stats:{post_count:0,received_like_count:0},availability:{avatar:'unavailable',posts:'ready',commentLikes:'ready'}}));return}
  if(q.url==='/api/users/me/notifications?limit=8&unread_only=1'){r.end('{"ok":true,"notifications":[],"unread_count":0}');return}
  if(q.url==='/api/users/me/preferences'){r.end('{"ok":true,"preference":{"locale_preference":"auto","revision":1,"updated_at":"2026-10-12T00:00:00Z"}}');return}
  if(q.url==='/auth/v1/logout'||q.url==='/auth/v1/logout?scope=global'){r.writeHead(204);r.end();return}
  r.end('{}');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const wire=loopbackTransport('http://127.0.0.1:'+server.address().port);
 const transport=(q,bounds)=>{const u=new URL(q.url);return wire({...q,url:'https://qa.example.invalid'+u.pathname+u.search},bounds)};
 const budget=new SharedBudget(caps);if(loginError)budget.verifyLoginPassword('A','SYNTHETIC_ONLY','success');
 const browser=await openGroup1Browser({caps,actor:admin?'ADMIN':actor,binding:account,appOrigin,supabaseOrigin,staticPaths:['/_astro/app.js'],staticManifest,transport,budget,headless:true,readOnlyLoginDiagnostic});
 return{browser,requests,get count(){return wireCount},async submit(){await browser.page.fill('input[type=email]',account.email);await browser.page.fill('input[type=password]','SYNTHETIC_ONLY');await browser.page.click('button[type=submit]')},async close(){await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}};
}
export async function submit(b,password='SYNTHETIC_ONLY'){await b.page.fill('input[type=email]',user.email);await b.page.fill('input[type=password]',password);await b.page.click('button[type=submit]')}
