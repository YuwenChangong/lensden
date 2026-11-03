import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const categoryKeys = Object.freeze({mutation:'applicationMutationDispatchesMax',cleanup:'cleanupMutationDispatchesMax',
  auth:'supabaseAuthDispatchesMax',restRead:'supabaseRestReadDispatchesMax',restWrite:'supabaseRestWriteDispatchesMax',
  turnstile:'turnstileHttpDispatchesMax',mail:'mailProducingSubmissionsMax',upload:'storageUploadOperationsMax',
  delete:'storageDeleteOperationsMax',range:'mediaRangeRequestsMax',refresh:'ownerSessionRefreshRequestsMax'});
const numericKeys = [...Object.values(categoryKeys),'allBrowserHttpDispatchesMax','mediaUploadBytesMax','mediaReadBytesMax',
  'r2StoredBytesMax','openaiModerationCallsMax','executionSecondsMax'];
const headerPresent=(headers,name)=>Object.keys(headers || {}).some(k=>k.toLowerCase()===name);
const codeError=code=>new Error(code);
function freeze(value){if(value&&typeof value==='object'){for(const x of Object.values(value))freeze(x);Object.freeze(value)}return value}

// This controller is transport-independent. A real egress/Worker adapter is a separate gate.
export class Controller {
  #caps; #counts; #plans; #clock; #started; #hard; #work; #serverAdmission;
  #firstFailure=null; #states=new Map(); #objects=new Map(); #active=new Set(); #mutationOutcome='NOT_DISPATCHED';
  constructor({caps,actions,clock=()=>performance.now(),cleanupReserveMs,serverAdmission=()=>false}) {
    if(!caps || Object.keys(caps).length!==numericKeys.length+1)throw codeError('BUDGET_SCHEMA_INVALID');
    for(const k of numericKeys)if(!Number.isSafeInteger(caps[k])||caps[k]<0)throw codeError('BUDGET_SCHEMA_INVALID');
    if(!Number.isFinite(caps.openaiAndProviderCostUSDMax)||caps.openaiAndProviderCostUSDMax<0||
      !Number.isSafeInteger(Math.floor(caps.openaiAndProviderCostUSDMax*1e6)))throw codeError('BUDGET_SCHEMA_INVALID');
    if(!Number.isFinite(cleanupReserveMs)||cleanupReserveMs<=0||cleanupReserveMs>=caps.executionSecondsMax*1000)throw codeError('RESERVE_INVALID');
    this.#caps=structuredClone(caps);
    this.#caps.providerCostMicros=Math.floor(caps.openaiAndProviderCostUSDMax*1e6);
    this.#counts=Object.fromEntries([...numericKeys.filter(k=>k!=='executionSecondsMax'),'providerCostMicros'].map(k=>[k,0]));
    this.#plans=new Map();
    for(const raw of actions){
      const a=structuredClone(raw);
      let url;try{url=new URL(a.url)}catch{throw codeError('PLAN_INVALID')}
      if(!/^[A-Z][A-Z0-9_]{0,63}$/.test(a.id)||this.#plans.has(a.id)||url.protocol!=='https:'||url.username||url.password||url.hash||
        !['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(a.method)||!['anon','A','B','ADMIN'].includes(a.actor)||
        !Array.isArray(a.categories)||new Set(a.categories).size!==a.categories.length||a.categories.some(k=>!Object.hasOwn(categoryKeys,k))||
        !Number.isSafeInteger(a.maxResponseBytes)||a.maxResponseBytes<0||
        [a.uploadBytes,a.r2StoredBytes,a.moderationCalls,a.costMicros].some(n=>!Number.isSafeInteger(n)||n<0)||
        typeof a.mutation!=='boolean'||typeof a.cleanup!=='boolean'||typeof a.media!=='boolean'||typeof a.serverEffects!=='boolean'||
        !Array.isArray(a.allowedRequestHeaders)||!Number.isInteger(a.expectedStatus)||
        ((a.moderationCalls||a.costMicros)&&!a.serverEffects)||
        (a.cleanup&&!a.mutation)||
        (a.uploadBytes&&!/^[a-f0-9]{64}$/.test(a.bodySha256||'')))throw codeError('PLAN_INVALID');
      this.#plans.set(a.id,freeze(a));
    }
    this.#clock=clock;this.#started=clock();this.#hard=caps.executionSecondsMax*1000;
    this.#work=this.#hard-cleanupReserveMs;this.#serverAdmission=serverAdmission;
  }
  #stop(code,mutation=false){
    this.#firstFailure??=code;
    if(mutation||[...this.#states.values()].some(s=>s.phase==='DISPATCHED'&&s.mutation))this.#mutationOutcome='UNKNOWN';
    for(const c of this.#active)c.abort();
    return codeError(code);
  }
  #reserve(id,request){
    if(this.#firstFailure)throw codeError('STOPPED');
    const a=this.#plans.get(id);
    if(!a)throw this.#stop('UNAPPROVED_ACTION');
    if(this.#states.has(id))throw this.#stop('ACTION_REPLAY');
    const elapsed=this.#clock()-this.#started;
    if(elapsed>=this.#hard)throw this.#stop('HARD_DEADLINE');
    if(!a.cleanup&&elapsed>=this.#work)throw this.#stop('WORK_DEADLINE');
    if(request.url!==a.url||request.method!==a.method||request.actor!==a.actor)throw this.#stop('REQUEST_SCOPE_MISMATCH');
    for(const h of Object.keys(request.headers||{}))if(!a.allowedRequestHeaders.includes(h.toLowerCase()))throw this.#stop('HEADER_NOT_BOUND');
    const body=request.body || Buffer.alloc(0);
    if(!Buffer.isBuffer(body)||((body.length||a.bodySha256)&&sha256(body)!==a.bodySha256)||
      (a.uploadBytes&&body.length!==a.uploadBytes))throw this.#stop('BODY_MISMATCH');
    if(a.cleanup&&!a.objectHandle)throw this.#stop('OBJECT_NOT_VERIFIED');
    if(a.objectHandle){
      const o=this.#objects.get(a.objectHandle);
      if(!o||o.actor!==a.actor||!o.ownerVerified)throw this.#stop('OBJECT_NOT_VERIFIED');
      if(a.cleanup){
        let target;
        try{target=decodeURIComponent(new URL(request.url).pathname.split('/').filter(Boolean)[a.objectIdPathIndex])}catch{}
        if(!Number.isSafeInteger(a.objectIdPathIndex)||a.objectIdPathIndex<0||target!==o.id)throw this.#stop('OBJECT_TARGET_MISMATCH');
      }
    }
    if(a.serverEffects && this.#serverAdmission(a)!==true)throw this.#stop('SERVER_EFFECTS_UNCONTROLLED');
    const charges={allBrowserHttpDispatchesMax:1};
    for(const c of a.categories)charges[categoryKeys[c]]=1;
    if(a.mutation)charges.applicationMutationDispatchesMax=1;
    if(a.cleanup)charges.cleanupMutationDispatchesMax=1;
    if(a.uploadBytes)charges.mediaUploadBytesMax=a.uploadBytes;
    if(a.media)charges.mediaReadBytesMax=a.maxResponseBytes;
    if(a.r2StoredBytes)charges.r2StoredBytesMax=a.r2StoredBytes;
    if(a.moderationCalls)charges.openaiModerationCallsMax=a.moderationCalls;
    if(a.costMicros)charges.providerCostMicros=a.costMicros;
    // All comparisons precede synchronous reservation. No await and no partial charges.
    for(const[k,n]of Object.entries(charges))if(this.#counts[k]+n>this.#caps[k])throw this.#stop('BUDGET_EXCEEDED');
    for(const[k,n]of Object.entries(charges))this.#counts[k]+=n;
    this.#states.set(id,{phase:'DISPATCHED',mutation:a.mutation});
    if(a.mutation)this.#mutationOutcome='IN_FLIGHT';
    return a;
  }
  async dispatch(id,request,transport){
    const a=this.#reserve(id,request);
    const controller=new AbortController();this.#active.add(controller);
    let timer;
    const remaining=Math.max(1,this.#hard-(this.#clock()-this.#started));
    const timeoutMs=Math.min(a.timeoutMs||15000,remaining);
    try{
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(codeError('REQUEST_TIMEOUT')),timeoutMs)});
      let result;
      try{result=await Promise.race([Promise.resolve(transport(request,{signal:controller.signal,maxBytes:a.maxResponseBytes,redirect:'manual',retry:0})),timeout])}
      catch(error){throw this.#stop(error?.message==='REQUEST_TIMEOUT'?'REQUEST_TIMEOUT':'TRANSPORT_FAILURE',a.mutation)}
      if(this.#firstFailure)throw codeError('STOPPED');
      if(this.#clock()-this.#started>=this.#hard)throw this.#stop('HARD_DEADLINE',a.mutation);
      if(!result||!Buffer.isBuffer(result.body))throw this.#stop('RESPONSE_INVALID',a.mutation);
      if(result.status>=300&&result.status<400||headerPresent(result.headers,'location'))throw this.#stop('REDIRECT_OR_LOCATION',a.mutation);
      if(headerPresent(result.headers,'set-cookie')&&!a.allowResponseCookie)throw this.#stop('RESPONSE_COOKIE_UNAPPROVED',a.mutation);
      if(result.status!==a.expectedStatus)throw this.#stop('UNEXPECTED_STATUS',a.mutation);
      if(result.body.length>a.maxResponseBytes)throw this.#stop('RESPONSE_BOUND_EXCEEDED',a.mutation);
      if(a.responseSha256&&sha256(result.body)!==a.responseSha256)throw this.#stop('RESPONSE_HASH_MISMATCH',a.mutation);
      this.#states.set(id,{phase:'ACKNOWLEDGED',mutation:a.mutation});
      if(a.mutation)this.#mutationOutcome='ACKNOWLEDGED';
      return result;
    }finally{clearTimeout(timer);controller.abort();this.#active.delete(controller)}
  }
  bindCreatedObject(handle,{createdByAction,actor,id,ownerVerified}){
    const p=this.#plans.get(createdByAction),s=this.#states.get(createdByAction);
    if(this.#firstFailure||!p||p.creates!==handle||s?.phase!=='ACKNOWLEDGED'||actor!==p.actor||!id||ownerVerified!==true||this.#objects.has(handle))throw this.#stop('CREATION_NOT_ACKNOWLEDGED');
    this.#objects.set(handle,{actor,id,ownerVerified:true});
  }
  async uncontrolledNodeRequest(){throw this.#stop('UNCONTROLLED_TRANSPORT')}
  stopFromBoundary(){this.#stop('BOUNDARY_FAILURE')}
  receipt(){return {format:'e-verify-control-safe-v1',status:this.#firstFailure?'STOPPED':'CONTROL_MODEL_ACTIVE',
    firstFailure:this.#firstFailure,counts:{...this.#counts},mutationOutcome:this.#mutationOutcome==='UNKNOWN'?'UNKNOWN':
      [...this.#states.values()].some(s=>s.phase==='DISPATCHED'&&s.mutation)?'IN_FLIGHT':this.#mutationOutcome,
    elapsedMs:Math.max(0,this.#clock()-this.#started),inFlight:this.#active.size,
    privateValuesLogged:false,productionCoverage:'NOT_PROVEN',retries:0,redirectsFollowed:0}}
}

export function validateStart({now,from,until,limitMs,go,approved,createClaim}){
  if(![now,from,until,limitMs].every(Number.isFinite)||go!==true||approved!==true||limitMs<=0||now<from||now>=until||now+limitMs>until)throw codeError('AUTHORIZATION_INVALID');
  if(typeof createClaim!=='function')throw codeError('CLAIM_ADAPTER_REQUIRED');
  createClaim();
}
export function createSyntheticClaim(file,value){
  const relative=path.relative(os.tmpdir(),path.resolve(file));
  if(relative.startsWith('..')||path.isAbsolute(relative)||path.basename(file)!=='synthetic.claim'||value!=='SYNTHETIC_ONLY')throw codeError('SYNTHETIC_CLAIM_SCOPE_INVALID');
  try{const fd=fs.openSync(file,'wx');try{fs.writeSync(fd,value);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{throw codeError('CLAIM_EXISTS')}
}
export function assertLiveCoverage(){
  // No live browser egress proof or Worker-side cost admission adapter exists in this binding.
  throw codeError('LIVE_COVERAGE_UNPROVEN');
}
