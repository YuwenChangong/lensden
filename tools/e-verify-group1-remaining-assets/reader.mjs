import {AssetReadPlan,assertStaticResponse} from './dependency-policy.mjs';
import {ReadBudget} from '../e-verify-group1-asset-reader-fresh-v8/reader.mjs';
import {sha256} from './hash.mjs';
const safe=e=>/^[A-Z][A-Z0-9_]{1,64}$/.test(e?.message)?e.message:'READ_FAILED';
const stem=p=>p.replace(/\.[A-Za-z0-9_-]+\.(js|css)$/,(_,e)=>'.'+e);

export async function runRemainingRead({origin,deploymentURL,pages,requiredTarget,manifest,edgeRules,requiredRoots={},htmlRequiredMarkers={},budgets,reuse,
 transport,providerHeaders,capture,assertDeployment,signal,workMs=budgets.workSeconds*1000,clock=()=>performance.now(),onStage=()=>{}}){
 const budget=new ReadBudget(budgets),plan=new AssetReadPlan({origin,manifest,requiredTarget,edgeRules});
 const controllers=new Set(),newAssets=[],html=[];let pre=null,post=null,firstFailure=null,stage='REUSE_EVIDENCE',reusedAssets=0;
 const start=clock();
 const check=()=>{if(signal?.aborted||clock()-start+budgets.perRequestSeconds*1000+5000>=workMs)throw new Error('WORK_DEADLINE')};
 const enter=s=>{stage=s;onStage(s)};
 const stop=e=>{firstFailure??=safe(e);budget.stop();for(const a of controllers)a.abort()};
 const abort=()=>stop(new Error('WORK_DEADLINE'));signal?.addEventListener('abort',abort,{once:true});
 const fetch=async(url,kind)=>{
  check();const provider=kind==='provider',u=new URL(url);
  if(provider?url!==deploymentURL:u.origin!==origin||u.search||u.hash||u.username||u.password)throw new Error('READ_TARGET');
  if(kind==='html'&&!pages.includes(u.pathname))throw new Error('HTML_SCOPE');
  const headers=provider?providerHeaders:{accept:kind==='html'?'text/html':'*/*','accept-encoding':'identity'};
  const allowed=provider?['accept','accept-encoding','authorization']:['accept','accept-encoding'];
  const names=Object.keys(headers||{}).map(k=>k.toLowerCase());
  if(new Set(names).size!==names.length||names.some(n=>!allowed.includes(n)))throw new Error('READ_HEADER_SCOPE');
  const ticket=budget.reserve(kind),controller=new AbortController();controllers.add(controller);
  try{const r=await transport({url,method:'GET',headers,body:Buffer.alloc(0)},
   {maxBytes:ticket.maxBytes,timeoutMs:budgets.perRequestSeconds*1000,signal:controller.signal});
   if(!Buffer.isBuffer(r.body))throw new Error('RESPONSE_BODY');budget.complete(ticket,r.body.length);return r;
  }catch(e){stop(e);throw e}finally{controller.abort();controllers.delete(controller);budget.release(ticket)}
 };
 const save=async(path,body)=>{
  check();const ref='asset-'+sha256(Buffer.from(path)).slice(0,32),r=await capture(ref,body);
  if(r?.encrypted!==true||r.evidenceRef!==ref||!/^[a-f0-9]{64}$/.test(r.ciphertextSha256))throw new Error('CAPTURE_FAILED');return r;
 };
 const observe=async(path,kind,body)=>{new TextDecoder('utf-8',{fatal:true}).decode(body);
  if(kind==='script')await plan.observeScript(path,body);else plan.observeStylesheet(path,body);
 };
 const readOne=async path=>{
  check();const admitted=plan.reserve(origin+path,'GET'),r=await fetch(origin+path,'asset'),a=assertStaticResponse(admitted.kind,r);
  const evidence=await save(path,r.body);newAssets.push({path,kind:admitted.kind,bytes:a.bytes,sha256:a.sha256,evidence,sourceVerified:false});
  await observe(path,admitted.kind,r.body);
 };
 try{
  if(typeof transport!=='function'||typeof capture!=='function'||typeof assertDeployment!=='function'
   ||!Array.isArray(pages)||pages.length!==3||new Set(pages).size!==3)throw new Error('FIXED_READER_CAPABILITIES_REQUIRED');
  check();plan.observeHtml(reuse.html);
  for(const a of reuse.assets){check();if(!Buffer.isBuffer(a.body)||a.body.length!==a.bytes||sha256(a.body)!==a.sha256)throw new Error('REUSED_CONTENT_CHANGED');
   const t=plan.reserve(origin+a.path,'GET');if(t.kind!==a.kind)throw new Error('REUSED_KIND_CHANGED');await observe(a.path,a.kind,a.body);reusedAssets++;
  }
  if(plan.pending().length)throw new Error('REUSED_GRAPH_INCOMPLETE');
  enter('PRE_DEPLOYMENT');pre=assertDeployment(await fetch(deploymentURL,'provider'));
  for(const p of pages){
   enter('PUBLIC_HTML');const r=await fetch(origin+p,'html'),h=Object.fromEntries(Object.entries(r.headers).map(([k,v])=>[k.toLowerCase(),v]));
   if(r.status!==200||Object.hasOwn(h,'location')||Object.hasOwn(h,'set-cookie')||typeof h['content-type']!=='string'||!/^text\/html(?:;|$)/i.test(h['content-type'])
    ||h['content-encoding']&&h['content-encoding']!=='identity')throw new Error('PUBLIC_HTML_RESPONSE');
   try{new TextDecoder('utf-8',{fatal:true}).decode(r.body)}catch{throw new Error('SOURCE_ENCODING')}
   html.push({path:p,bytes:r.body.length,sha256:sha256(r.body),evidence:await save(p,r.body)});
   if((htmlRequiredMarkers[p]||[]).some(marker=>!r.body.toString('utf8').includes(marker)))throw new Error('PUBLIC_PAGE_MARKER_MISSING');
   plan.observeHtml(r.body,p);
   const seen=plan.referenceGraph().filter(x=>x.parents.includes(p)).map(x=>stem(x.path));
   if((requiredRoots[p]||[]).some(x=>!seen.includes(x)))throw new Error('REQUIRED_ROOT_MISSING');
  }
  enter('REMAINING_DEPENDENCIES');
  while(!firstFailure){const next=plan.pending().slice(0,budgets.concurrencyMax);if(!next.length)break;
   const outcomes=await Promise.allSettled(next.map(p=>readOne(p).catch(e=>{stop(e);throw e})));
   if(outcomes.some(x=>x.status==='rejected'))break;
  }
  if(firstFailure)throw new Error(firstFailure);check();enter('POST_DEPLOYMENT');post=assertDeployment(await fetch(deploymentURL,'provider'));
  if(pre.deploymentId!==post.deploymentId||pre.activeVersion!==post.activeVersion||pre.activeTraffic!==100||post.activeTraffic!==100
   ||pre.recoveryTraffic!==0||post.recoveryTraffic!==0)throw new Error('DEPLOYMENT_CHANGED');
 }catch(e){stop(e)}finally{signal?.removeEventListener('abort',abort);for(const a of controllers)a.abort()}
 return {format:'group1-remaining-assets-safe-v1',status:firstFailure?'BLOCKED':'CONTENT_EVIDENCE_COLLECTED',firstFailure,
  failedStage:firstFailure?stage:null,preDeployment:pre,postDeployment:post,html,newAssets,reusedAssets,referenceGraph:plan.referenceGraph(),counts:budget.receipt(),
  durationMs:Math.ceil(clock()-start),literalDependencyGraphClosed:!firstFailure,authDispatches:0,rlsReads:0,
  anonymousSSRDataReads:'PUBLIC_PAGES_MAY_READ_EXISTING_CATALOG_NO_DIRECT_POSTGREST_CASES',
  writes:0,retries:0,redirectsFollowed:0,sourceProvenance:'PENDING_OFFLINE_REVIEW',fullGroup1Ready:false,catalogHold:'ACTIVE'};
}
