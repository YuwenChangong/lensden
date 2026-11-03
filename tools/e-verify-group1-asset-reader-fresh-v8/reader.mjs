import {AssetReadPlan,assertStaticResponse} from './dependency-policy.mjs';
import {sha256} from './hash.mjs';

const safe=e=>/^[A-Z][A-Z0-9_]{1,64}$/.test(e?.safeCode||e?.message)?e.safeCode||e.message:'READ_FAILED';
export class ReadBudget {
  #caps;#counts={total:0,asset:0,html:0,provider:0};#used=0;#accepted=0;#stopped=false;#active=0;#serial=0;#tickets=new Map();#completed=new Set();
  constructor(caps){this.#caps=caps}
  stop(){this.#stopped=true}
  reserve(kind){
    if(this.#stopped)throw new Error('READ_STOPPED');
    const cap={asset:this.#caps.assetGETMax,html:this.#caps.htmlGETMax,provider:this.#caps.providerDeploymentGETMax}[kind];
    if(cap===undefined||this.#counts.total>=this.#caps.totalGETMax||this.#counts[kind]>=cap||this.#active>=this.#caps.concurrencyMax)throw new Error('REQUEST_BUDGET');
    const bytes=kind==='provider'?131072:this.#caps.maxAssetBytes;
    if(kind!=='provider'&&this.#used+bytes>this.#caps.anonymousAggregateBytesMax)throw new Error('BYTE_BUDGET');
    if(kind!=='provider')this.#used+=bytes;
    this.#counts.total++;this.#counts[kind]++;this.#active++;
    const ticket=Object.freeze({serial:++this.#serial,kind,maxBytes:bytes});this.#tickets.set(ticket.serial,ticket);return ticket;
  }
  complete(ticket,bodyBytes){
    if(this.#tickets.get(ticket.serial)!==ticket||this.#completed.has(ticket.serial)||!Number.isSafeInteger(bodyBytes)||bodyBytes<0||bodyBytes>ticket.maxBytes)throw new Error('BYTE_TICKET');
    this.#completed.add(ticket.serial);
    if(ticket.kind!=='provider'){this.#used-=ticket.maxBytes-bodyBytes;this.#accepted+=bodyBytes}
  }
  release(ticket){if(this.#tickets.get(ticket.serial)===ticket){this.#tickets.delete(ticket.serial);this.#completed.delete(ticket.serial);this.#active--}}
  receipt(){return {...this.#counts,acceptedAnonymousBodyBytes:this.#accepted,conservativeReservedOrUsedBytes:this.#used,
    inFlight:this.#active,physicalNetworkTailBytes:'UNKNOWN_NOT_A_BILLING_OR_BANDWIDTH_HARD_CAP'}}
}
export async function runAssetRead({origin,deploymentURL,loginURL,requiredTarget,manifest,budgets,transport,providerHeaders,capture,assertDeployment,
  signal,workMs=budgets.workSeconds*1000,clock=()=>performance.now(),onStage=()=>{}}){
  const budget=new ReadBudget(budgets),plan=new AssetReadPlan({origin,manifest,requiredTarget});
  let pre=null,post=null,firstFailure=null,html=null,stage='LOCAL_PRECHECK';const assets=[],controllers=new Set();const start=clock(),startedAtUTC=new Date().toISOString();
  const enter=value=>{stage=value;onStage(value)};
  const check=()=>{if(signal?.aborted||clock()-start+budgets.perRequestSeconds*1000+5000>=workMs)throw new Error('WORK_DEADLINE')};
  const stop=e=>{firstFailure??=safe(e);budget.stop();for(const a of controllers)a.abort()};
  const abort=()=>stop(new Error('WORK_DEADLINE'));signal?.addEventListener('abort',abort,{once:true});
  const fetch=async(url,kind)=>{
    check();const provider=kind==='provider';const u=new URL(url);
    if(provider?url!==deploymentURL:u.origin!==origin||u.username||u.password||u.hash)throw new Error('READ_TARGET');
    const headers=provider?providerHeaders:{accept:kind==='html'?'text/html':'*/*','accept-encoding':'identity'};
    const allowed=provider?['accept','accept-encoding','authorization']:['accept','accept-encoding'];
    const headerNames=Object.keys(headers||{}).map(k=>k.toLowerCase());
    if(new Set(headerNames).size!==headerNames.length||headerNames.some(k=>!allowed.includes(k)))throw new Error('READ_HEADER_SCOPE');
    const ticket=budget.reserve(kind),controller=new AbortController();controllers.add(controller);
    try{const r=await transport({url,method:'GET',headers,body:Buffer.alloc(0)},{maxBytes:ticket.maxBytes,timeoutMs:budgets.perRequestSeconds*1000,signal:controller.signal});
      if(!Buffer.isBuffer(r.body))throw new Error('RESPONSE_BODY');budget.complete(ticket,r.body.length);return r;
    }catch(e){stop(e);throw e}finally{controller.abort();controllers.delete(controller);budget.release(ticket)}
  };
  const save=async(ref,bytes)=>{check();const result=await capture(ref,bytes);if(result?.encrypted!==true||!/^[a-f0-9]{64}$/.test(result.ciphertextSha256)||result.evidenceRef!==ref)throw new Error('CAPTURE_FAILED');return result};
  const readOne=async pathname=>{
    check();const url=origin+pathname,ticket=plan.reserve(url,'GET');
    const r=await fetch(url,'asset'),observation=assertStaticResponse(ticket.kind,r);
    try{new TextDecoder('utf-8',{fatal:true}).decode(r.body)}catch{throw new Error('SOURCE_ENCODING')}
    const evidence=await save('asset-'+sha256(Buffer.from(pathname)).slice(0,32),r.body);
    const row={path:pathname,kind:ticket.kind,referenceSource:ticket.source,bytes:observation.bytes,sha256:observation.sha256,
      evidence,localByteMatch:manifest.some(x=>x.sha256===observation.sha256&&x.bytes===observation.bytes),sourceVerified:false};
    assets.push(row);
    if(ticket.kind==='script')await plan.observeScript(pathname,r.body);else plan.observeStylesheet(pathname,r.body);
  };
  try{
    if(typeof transport!=='function'||typeof capture!=='function'||typeof assertDeployment!=='function')throw new Error('FIXED_READER_CAPABILITIES_REQUIRED');
    enter('PRE_DEPLOYMENT');pre=assertDeployment(await fetch(deploymentURL,'provider'));check();
    enter('LOGIN_HTML');const response=await fetch(loginURL,'html'),headers=Object.fromEntries(Object.entries(response.headers).map(([k,v])=>[k.toLowerCase(),v]));
    if(response.status!==200||Object.hasOwn(headers,'location')||Object.hasOwn(headers,'set-cookie')||!/^text\/html(?:;|$)/i.test(headers['content-type']||'')||headers['content-encoding']&&headers['content-encoding']!=='identity')throw new Error('LOGIN_HTML_RESPONSE');
    try{new TextDecoder('utf-8',{fatal:true}).decode(response.body)}catch{throw new Error('SOURCE_ENCODING')}
    html={bytes:response.body.length,sha256:sha256(response.body),evidence:await save('login-html',response.body)};
    plan.observeHtml(response.body);check();enter('REQUIRED_SCRIPT');await readOne(requiredTarget);
    enter('REFERENCED_DEPENDENCIES');
    while(!firstFailure){const next=plan.pending().slice(0,budgets.concurrencyMax);if(!next.length)break;
      const outcomes=await Promise.allSettled(next.map(p=>readOne(p).catch(e=>{stop(e);throw e})));
      if(outcomes.some(x=>x.status==='rejected'))break;
    }
    if(firstFailure)throw new Error(firstFailure);check();enter('POST_DEPLOYMENT');post=assertDeployment(await fetch(deploymentURL,'provider'));
    if(pre.deploymentId!==post.deploymentId||pre.activeVersion!==post.activeVersion||pre.activeTraffic!==post.activeTraffic||post.activeTraffic!==100||post.recoveryTraffic!==0)throw new Error('DEPLOYMENT_CHANGED');
  }catch(e){stop(e)}finally{signal?.removeEventListener('abort',abort);for(const a of controllers)a.abort()}
  return {format:'group1-production-asset-evidence-safe-v1',status:firstFailure?'BLOCKED':'CONTENT_EVIDENCE_COLLECTED',firstFailure,
    preDeployment:pre,postDeployment:post,html,assets,referenceGraph:plan.referenceGraph(),counts:budget.receipt(),requiredTarget,requiredTargetContentRead:assets.some(x=>x.path===requiredTarget),
    failedStage:firstFailure?stage:null,startedAtUTC,completedAtUTC:new Date().toISOString(),durationMs:Math.ceil(clock()-start),
    literalDependencyGraphClosed:!firstFailure,sourceProvenance:'PENDING_OFFLINE_REVIEW',deployedBuildByteEquality:'UNKNOWN_UNTIL_OFFLINE_COMPARISON',
    fullGroup1Ready:false,authDispatches:0,rlsReads:0,mediaReads:0,writes:0,retries:0,redirectsFollowed:0,catalogHold:'ACTIVE',publicBetaGo:'NOT_AUTHORIZED'};
}
