import {createHash,createHmac,randomBytes} from 'node:crypto';
export const ORIGIN='https://challenges.cloudflare.com';
export const SDK=ORIGIN+'/turnstile/v0/api.js?render=explicit';
export const TEST_SITEKEY='1x00000000000000000000AA';
export const CAPS=Object.freeze({global:650,thirdParty:40,GET:40,POST:40,document:40,background:0,redirect:0});
const sha=b=>createHash('sha256').update(b).digest('hex');
const normalized=h=>Object.fromEntries(Object.entries(h||{}).map(([k,v])=>[k.toLowerCase(),v]));
const types=new Set(['script','document','stylesheet','image','font','fetch','xhr']);
export class TurnstileGate{
 #caps;#clock;#end;#salt=randomBytes(32);#sdk=null;#loading=false;#widget=false;#scripts=new Set();#frames=new Map();#tickets=new Map();#seen=new Set();#serial=0;#failure=null;#journal=[];
 #counts={global:0,thirdParty:0,GET:0,POST:0,document:0,background:0,redirect:0,proxyDenied:0,localHarness:0};
 constructor({caps=CAPS,clock=()=>performance.now(),workMs=240000}={}){this.#caps={...caps};this.#clock=clock;this.#end=clock()+workMs;if(Object.keys(CAPS).some(k=>!Number.isSafeInteger(caps[k])||caps[k]<0||caps[k]>CAPS[k]))throw new Error('INVALID_CAPS')}
 #stop(code){this.#failure??=code;throw new Error(this.#failure)}
 #active(){if(this.#failure)throw new Error(this.#failure);if(this.#clock()>=this.#end)this.#stop('WORK_DEADLINE')}
 #charge(keys){this.#active();const unique=[...new Set(keys)];if(unique.some(k=>this.#counts[k]+1>this.#caps[k]))this.#stop('BUDGET_EXCEEDED');for(const k of unique)this.#counts[k]++}
 #id(value){return createHmac('sha256',this.#salt).update(value).digest('hex')}
 #event(q,p,code,rule=null){if(this.#journal.length>=64)return;let u;try{u=new URL(q.url)}catch{}
  this.#journal.push({sequence:this.#journal.length+1,stage:this.#widget?'WIDGET_INIT':this.#sdk?'SDK_READY':'SDK_LOAD',method:['GET','POST'].includes(q.method)?q.method:'OTHER',
   hostClass:u?.origin===ORIGIN?'OFFICIAL_VENDOR':'UNAPPROVED',protocolClass:u?.protocol==='https:'?'HTTPS':'OTHER',resourceType:types.has(p.type)?p.type:'OTHER',
   frameClass:p.frame==='main'?'ISOLATED_HARNESS':this.#frames.has(p.frame)?'REGISTERED_WIDGET_FRAME':'UNREGISTERED',
   initiatorClass:['script','parser'].includes(p.initiator?.type)?p.initiator.type:'UNATTESTED',rule,code,
   evidenceId:u?this.#id(u.origin+'\0'+u.pathname):null,dispatchDecision:code==='ADMITTED'?'RESERVED_NOT_YET_DISPATCHED':'DENIED_BEFORE_DISPATCH'});
 }
 chargeHarness(){this.#charge(['global']);this.#counts.localHarness++}
 denyProxy(){this.#charge(['global']);this.#counts.proxyDenied++}
 startWidget(){this.#active();if(!this.#sdk||this.#widget)this.#stop('WIDGET_GRANT_INVALID');this.#widget=true}
 admit(q,p={}){
  try{
   this.#active();let u;try{u=new URL(q.url)}catch{this.#stop('URL_INVALID')}
   const h=normalized(q.headers),body=q.body||Buffer.alloc(0);
   if(u.protocol!=='https:'||u.origin!==ORIGIN||u.username||u.password||u.hash||u.href.length>4096||/%(?:00|0a|0d)|[\x00-\x20\\]/i.test(u.href))this.#stop('UNAPPROVED_ORIGIN_OR_ENVELOPE');
   try{decodeURI(u.pathname)}catch{this.#stop('ENCODING_INVALID')}
   if(Object.keys(h).some(k=>!['accept','content-type','origin','referer','user-agent','sec-fetch-site','sec-fetch-mode','sec-fetch-dest'].includes(k)))this.#stop('CREDENTIAL_OR_UNKNOWN_HEADER_FORBIDDEN');
   if(!Buffer.isBuffer(body)||body.length>32768||!['GET','POST'].includes(q.method)||q.method==='GET'&&body.length)this.#stop('METHOD_OR_BODY_FORBIDDEN');
   if(p.redirected)this.#stop('REDIRECT_FORBIDDEN');if(!types.has(p.type)||q.method==='POST'&&!['xhr','fetch'].includes(p.type))this.#stop('RESOURCE_TYPE_FORBIDDEN');
   let rule;
   if(q.url===SDK&&q.method==='GET'&&p.type==='script'&&p.frame==='main'&&p.harnessBootstrap===true){
    if(this.#loading||this.#sdk)this.#stop('SDK_REPLAY');this.#loading=true;rule='EXACT_BOOTSTRAP';
   }else{
    if(!this.#widget||!this.#sdk)this.#stop('SDK_WIDGET_REQUIRED');
    const scriptProof=p.initiator?.type==='script'&&(p.initiator.urls||[]).some(url=>this.#scripts.has(url));
    const known=this.#frames.get(p.frame),parent=this.#frames.get(p.parent);
    if(p.type==='document'&&p.frame!=='main'&&!known){
     if(p.parent==='main'&&scriptProof){if([...this.#frames.values()].some(x=>x.parent==='main'))this.#stop('SECOND_ROOT_FRAME');}
     else if(!parent?.verified||!['parser','script'].includes(p.initiator?.type)||p.initiator?.type==='script'&&!scriptProof)this.#stop('FRAME_REGISTRATION_REQUIRED');
     this.#frames.set(p.frame,{parent:p.parent,verified:false,target:q.url});rule='SDK_CREATED_FRAME';
    }else if(p.frame==='main'&&scriptProof&&p.type!=='document')rule='SDK_SCRIPT_CHAIN';
    else if(known?.verified&&((p.initiator?.type==='parser')||scriptProof))rule='VERIFIED_FRAME_CHAIN';
    else this.#stop('INITIATOR_OR_FRAME_UNPROVEN');
   }
   const replay=this.#id(q.method+'\0'+q.url+'\0'+body.toString('base64'));if(this.#seen.has(replay))this.#stop('REQUEST_REPLAY');
   this.#charge(['global','thirdParty',q.method,...(p.type==='document'?['document']:[])]);this.#seen.add(replay);
   const t=Object.freeze({serial:++this.#serial,rule,type:p.type,frame:p.frame,method:q.method,maxBytes:2097152});
   this.#tickets.set(t,{url:q.url,completed:false});this.#event(q,p,'ADMITTED',rule);return t;
  }catch(e){this.#event(q,p,e.message);throw e}
 }
 validateResponse(t,r){
  this.#active();const item=this.#tickets.get(t);if(!item||item.completed)this.#stop('TICKET_REPLAY');const h=normalized(r.headers);
  if(r.status>=300&&r.status<400||Object.hasOwn(h,'location'))this.#stop('REDIRECT_OR_LOCATION');if(Object.hasOwn(h,'set-cookie'))this.#stop('RESPONSE_COOKIE_FORBIDDEN');
  if(![200,204].includes(r.status)||!Buffer.isBuffer(r.body)||r.body.length>t.maxBytes)this.#stop('RESPONSE_STATUS_OR_SIZE');
  if(t.rule==='EXACT_BOOTSTRAP'&&(r.status!==200||!r.body.length))this.#stop('SDK_RESPONSE_INVALID');
  const mime=typeof h['content-type']==='string'?h['content-type'].split(';')[0].trim().toLowerCase():'';
  if(t.type==='script'&&!['text/javascript','application/javascript'].includes(mime)||t.type==='document'&&mime!=='text/html'||t.type==='stylesheet'&&mime!=='text/css')this.#stop('CONTENT_TYPE_INVALID');
  item.completed=true;
  if(t.rule==='EXACT_BOOTSTRAP'){this.#sdk={sha256:sha(r.body),bytes:r.body.length};this.#scripts.add(item.url)}
  else if(t.type==='script')this.#scripts.add(item.url);
  if(t.type==='document'){const f=this.#frames.get(t.frame);if(!f||f.target!==item.url)this.#stop('FRAME_RESPONSE_MISMATCH');f.verified=true}
 }
 fail(code){return this.#stop(/^[A-Z0-9_]{1,64}$/.test(code)?code:'BOUNDARY_FAILURE')}
 receipt(){return{counts:{...this.#counts},firstFailure:this.#failure,sdk:this.#sdk,widgetGrant:this.#widget,registeredFrames:this.#frames.size,journal:this.#journal.map(x=>({...x})),
  authority:'SUPPLIER_CAPABILITY_NOT_EXHAUSTIVE_URL_WHITELIST',rawValuesPersisted:false}}
 dispose(){this.#scripts.clear();this.#frames.clear();this.#tickets.clear();this.#seen.clear();this.#salt.fill(0)}
}
