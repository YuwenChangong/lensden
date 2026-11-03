import {catalogSteps,identitySteps,verifyIdentity} from '../identity-rls.mjs';
import {sha256} from '../budget.mjs';
import {randomBytes} from 'node:crypto';
const actors=['A','B','ADMIN'];
const browserHeaders=new Set(['accept','accept-language','sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform','user-agent','upgrade-insecure-requests','referer','origin','content-type','authorization','apikey','x-client-info','x-supabase-api-version','cache-control','pragma','priority','sec-fetch-site','sec-fetch-mode','sec-fetch-dest','cookie']);
const deny=code=>{throw new Error(code)};
const lower=h=>Object.fromEntries(Object.entries(h||{}).map(([k,v])=>[k.toLowerCase(),v]));
function json(bytes){try{return JSON.parse(Buffer.from(bytes).toString('utf8'))}catch{deny('JSON_INVALID')}}
const keys=(o,names)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>names.includes(k));
function exactOrigin(s){const u=new URL(s);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)deny('ORIGIN_INVALID');return u.origin}
export class SharedBudget{
 #caps;#counts;#stopped=false;#passwords=new Map();#salt=randomBytes(32).toString('hex');
 constructor(caps){this.#caps=structuredClone(caps);this.#counts=Object.fromEntries(Object.keys(caps).map(k=>[k,0]))}
 reserve(charges){if(this.#stopped)deny('BUDGET_STOPPED');for(const c of charges)if(!Number.isSafeInteger(this.#caps[c])||this.#counts[c]+1>this.#caps[c]){this.#stopped=true;deny('BUDGET_EXCEEDED')}for(const c of charges)this.#counts[c]++}
 receipt(){return{...this.#counts}}
 assertActive(){if(this.#stopped)deny('BUDGET_STOPPED')}
 verifyLoginPassword(actor,password,kind){this.assertActive();const digest=sha256(this.#salt+'\0'+actor+'\0'+password);if(kind==='success'){this.#passwords.set(actor,digest);return}const positive=this.#passwords.get(actor);if(!positive)deny('NEGATIVE_PASSWORD_BASELINE_MISSING');if(kind==='wrong-password'?positive===digest:positive!==digest)deny('NEGATIVE_PASSWORD_SCOPE')}
 stop(){this.#stopped=true;this.#passwords.clear();this.#salt=''}
}

export class Group1Gate{
 #caps;#actor;#binding;#app;#db;#static;#budget;#failed=null;#blockedKind=null;#login=null;#logout=false;#session=null;#verified=false;#seen=new Set();#epoch=0;#clock;#start;#work;#serial=0;#tickets=new Map();#inflight=0;
 constructor({caps,actor,binding,appOrigin,supabaseOrigin,staticPaths=[],budget=new SharedBudget(caps),clock=()=>performance.now(),workMs=caps?.executionSecondsMax*1000-60000}){
  if(!actors.includes(actor)||!binding||!/^[a-f\d-]{36}$/i.test(binding.userId)||typeof binding.email!=='string'||typeof binding.applicationRole!=='string')deny('PRIVATE_BINDING_INVALID');
  if(!caps||Object.values(caps).some(n=>!Number.isFinite(n)||n<0)||!Number.isFinite(workMs)||workMs<=0||workMs>caps.executionSecondsMax*1000)deny('BUDGET_INVALID');
  this.#caps=structuredClone(caps);this.#actor=actor;this.#binding=structuredClone(binding);this.#app=exactOrigin(appOrigin);this.#db=exactOrigin(supabaseOrigin);
  if(this.#app===this.#db)deny('ORIGIN_COLLISION');
  if(staticPaths.some(p=>!/^\/_astro\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(p)))deny('STATIC_MANIFEST_INVALID');
  this.#static=new Set(staticPaths);this.#budget=budget;this.#clock=clock;this.#start=clock();this.#work=workMs;
 }
 stop(code='BOUNDARY_FAILURE'){this.#failed??=/^[A-Z0-9_]{1,64}$/.test(code)?code:'BOUNDARY_FAILURE';this.#budget.stop();this.#session=null;this.#verified=false;return new Error(this.#failed)}
 dispose(){this.#session=null;this.#verified=false;this.#failed??='CONTEXT_CLOSED'}
 #fail(c){throw this.stop(c)}
 #active(){if(this.#failed)deny('STOPPED');if(this.#clock()-this.#start>=this.#work)this.#fail('WORK_DEADLINE')}
 permitLogin(kind){this.#active();if(!['success','invalid-captcha','missing-captcha','wrong-password'].includes(kind)||this.#login||this.#session)this.#fail('LOGIN_PERMIT_INVALID');this.#login=kind}
 permitLogout(){this.#active();if(!this.#session||this.#logout)this.#fail('LOGOUT_PERMIT_INVALID');this.#logout=true}
 nextNavigation(){this.#active();this.#epoch++}
 assertActive(){this.#active();this.#budget.assertActive()}
 sessionHeaders(){this.#active();if(!this.#session)deny('SESSION_MISSING');return{authorization:'Bearer '+this.#session.access_token}}
 #bearer(h){if(!this.#session||h.authorization!=='Bearer '+this.#session.access_token)this.#fail('SESSION_CROSS_USE')}
 reserve(request){
  this.#active();const h=lower(request.headers),body=request.body??Buffer.alloc(0);let u;
  try{u=new URL(request.url)}catch{this.#fail('URL_INVALID')}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.href.length>4096||Object.keys(h).some(k=>!browserHeaders.has(k))||!Buffer.isBuffer(body)||body.length>32768)this.#fail('REQUEST_ENVELOPE_INVALID');
  if(h.cookie){let record;try{const match=/^ogh_preferences_v1=([^;]+)$/.exec(h.cookie);if(u.origin!==this.#app||!match||match[1].length>512)this.#fail('COOKIE_SCOPE');record=JSON.parse(decodeURIComponent(match[1]))}catch{this.#fail('COOKIE_SCOPE')}
   if(!keys(record,['version','preference','generation','provenance'])||Object.keys(record).length!==4||record.version!==1||!['auto','zh-CN','en'].includes(record.preference)||!Number.isSafeInteger(record.generation)||record.generation<0||!['device_explicit','account_adopted'].includes(record.provenance))this.#fail('COOKIE_SCOPE');
  }
  const method=request.method||'GET';let kind,loginKind=null,expected=[200],classes=[],maxBytes=1048576;
  if(['GET','HEAD'].includes(method)&&body.length)this.#fail('GET_BODY_FORBIDDEN');
  const path=u.pathname+u.search,auth=h.authorization;
  if(u.origin===this.#db){
   if(path==='/auth/v1/token?grant_type=password'&&method==='POST'){
    if(!this.#login)this.#fail('LOGIN_NOT_ARMED');loginKind=this.#login;this.#login=null;
    const b=json(body);if(!keys(b,['email','password','gotrue_meta_security'])||typeof b.password!=='string'||!b.password||b.email?.toLowerCase()!==this.#binding.email.toLowerCase())this.#fail('LOGIN_IDENTITY');
    try{this.#budget.verifyLoginPassword(this.#actor,b.password,loginKind)}catch(e){this.#fail(e.message)}
    if(loginKind==='missing-captcha'){if(!keys(b.gotrue_meta_security,[])||Object.keys(b.gotrue_meta_security).length)this.#fail('MISSING_CAPTCHA_NEGATIVE_INVALID')}
    else if(!keys(b.gotrue_meta_security,['captcha_token'])||typeof b.gotrue_meta_security.captcha_token!=='string'||!b.gotrue_meta_security.captcha_token)this.#fail('CAPTCHA_REQUIRED');
    kind='login';classes=['supabaseAuthDispatchesMax','applicationMutationDispatchesMax'];expected=loginKind==='success'?[200]:[400,422];
   }else if(path==='/auth/v1/token?grant_type=refresh_token'&&method==='POST'){
    const b=json(body);if(!keys(b,['refresh_token'])||!this.#session||b.refresh_token!==this.#session.refresh_token)this.#fail('REFRESH_SESSION_INVALID');
    kind='refresh';classes=['supabaseAuthDispatchesMax','applicationMutationDispatchesMax','ownerSessionRefreshRequestsMax'];
   }else if((path==='/auth/v1/logout'||path==='/auth/v1/logout?scope=global')&&method==='POST'){
    this.#bearer(h);if(!this.#logout||body.length)this.#fail('LOGOUT_NOT_ARMED');this.#logout=false;kind='logout';classes=['supabaseAuthDispatchesMax','applicationMutationDispatchesMax'];expected=[204];
   }else if(method==='GET'&&path==='/auth/v1/user'){this.#bearer(h);kind='identity';classes=['supabaseAuthDispatchesMax']}
   else if(method==='GET'&&path===identitySteps(this.#binding,this.#actor)[1].path){this.#bearer(h);kind='profile';classes=['supabaseRestReadDispatchesMax']}
   else if(method==='GET'){
    const effectiveActor=request.actor??this.#actor,step=catalogSteps().find(s=>s.actor===effectiveActor&&s.path===path);
    if(!step||!['anon',this.#actor].includes(effectiveActor))this.#fail('UNAPPROVED_REQUEST');
    if(effectiveActor==='anon'){if(auth&&auth!=='Bearer '+h.apikey)this.#fail('ANON_SESSION_LEAK')}
    else{this.#bearer(h);if(!this.#verified)this.#fail('IDENTITY_NOT_VERIFIED')}
    kind='catalog';classes=['supabaseRestReadDispatchesMax'];expected=step.expect==='public'?[200]:step.expect==='deny'?(effectiveActor==='anon'?[401,403]:[403]):[200,403];
   }
  }else if(u.origin===this.#app){
   if(method==='GET'&&!body.length&&!auth&&['/login/','/login/?next=%2Fproducts%2F','/','/products/','/products/xreal/xreal-air/','/settings/','/admin/devices/'].includes(path)){kind='page';maxBytes=2097152}
   else if(method==='GET'&&!auth&&!body.length&&this.#static.has(path)){kind='static';maxBytes=2097152}
   else if(method==='GET'&&!body.length&&['/api/users/me/summary','/api/users/me/preferences','/api/users/me/notifications?limit=8&unread_only=1'].includes(path)){this.#bearer(h);kind='own-read'}
   else if(method==='GET'&&!body.length&&['/api/admin/devices','/api/admin/forum/me'].includes(path)){
    this.#bearer(h);if(!this.#verified)this.#fail('IDENTITY_NOT_VERIFIED');kind='admin-read';expected=this.#actor==='ADMIN'?[200]:[403];
   }
  }else if(u.origin==='https://challenges.cloudflare.com'&&['GET','POST'].includes(method)&&!auth){
   if(path==='/turnstile/v0/api.js?render=explicit'||(/^\/cdn-cgi\/challenge-platform\/[A-Za-z0-9_./~-]+$/.test(u.pathname)&&!/%|[\x00-\x20]/.test(u.href))){kind='turnstile';classes=['turnstileHttpDispatchesMax'];maxBytes=2097152;expected=[200,204]}
  }
  if(!kind)this.#fail('UNAPPROVED_REQUEST');
  if(h.apikey&&u.origin!==this.#db)this.#fail('APIKEY_LEAK');
  if(auth&&!['login','refresh'].includes(kind)&&!['identity','profile','catalog','logout','own-read','admin-read'].includes(kind))this.#fail('AUTH_LEAK');
  if(request.actor!==undefined&&!['anon',this.#actor].includes(request.actor))this.#fail('ACTOR_CROSS_USE');
  const replay=sha256(JSON.stringify([this.#epoch,request.actor??this.#actor,method,u.href,sha256(body)]));
  if(this.#seen.has(replay)){this.#blockedKind=kind;this.#fail('REQUEST_REPLAY')}
  const charges=['allBrowserHttpDispatchesMax',...classes];
  try{this.#budget.reserve(charges)}catch(e){this.#fail(e.message==='BUDGET_EXCEEDED'?'BUDGET_EXCEEDED':'BUDGET_STOPPED')}
  this.#seen.add(replay);this.#inflight++;
  const ticket=Object.freeze({serial:++this.#serial,kind,loginKind,expected,maxBytes});this.#tickets.set(ticket.serial,ticket);return ticket;
 }
 #ticket(t){if(this.#tickets.get(t?.serial)!==t)this.#fail('TICKET_INVALID')}
 acceptSession(t,data){this.#ticket(t);if(!['login','refresh'].includes(t.kind)||t.loginKind&&t.loginKind!=='success'||typeof data?.access_token!=='string'||!data.access_token||typeof data.refresh_token!=='string'||!data.refresh_token||data.user?.id!==this.#binding.userId||data.user?.email?.toLowerCase()!==this.#binding.email.toLowerCase())this.#fail('SESSION_IDENTITY');this.#session={access_token:data.access_token,refresh_token:data.refresh_token};this.#verified=false;return true}
 verifyIdentity(auth,profile){this.#active();try{verifyIdentity(auth,profile,this.#binding)}catch{this.#fail('IDENTITY_OR_ROLE_MISMATCH')}this.#verified=true;return true}
 acceptNegative(t,response){this.#ticket(t);const b=json(response.body),code=b.code||b.error_code;
  if(t.kind!=='login'||t.loginKind==='success'||![400,422].includes(response.status)||code!==(['invalid-captcha','missing-captcha'].includes(t.loginKind)?'captcha_failed':'invalid_credentials'))this.#fail('NEGATIVE_AUTH_ASSERTION');return true}
 acceptLogout(t,response){this.#ticket(t);if(t.kind!=='logout'||response.status!==204||response.body.length)this.#fail('LOGOUT_INVALID');this.#session=null;this.#verified=false;return true}
 complete(t){this.#ticket(t);this.#tickets.delete(t.serial);this.#inflight--}
 receipt(){return{format:'group1-admission-safe-v1',actor:this.#actor,firstFailure:this.#failed,blockedRequestKind:this.#blockedKind,counts:this.#budget.receipt(),sessionPresent:!!this.#session,identityVerified:this.#verified,inFlight:this.#inflight,retries:0,privateValuesLogged:false}}
}
export function validateResponse(ticket,response){
 const h=lower(response.headers);if(response.status>=300&&response.status<400||Object.hasOwn(h,'location'))deny('REDIRECT_OR_LOCATION');
 if(Object.hasOwn(h,'set-cookie'))deny('RESPONSE_COOKIE');
 if(!Buffer.isBuffer(response.body)||response.body.length>ticket.maxBytes)deny('RESPONSE_BOUND');
 if(!(ticket.expected||[200]).includes(response.status))deny('UNEXPECTED_STATUS');
 return true;
}
