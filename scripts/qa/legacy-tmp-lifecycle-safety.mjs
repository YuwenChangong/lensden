// Offline QA helpers. No built-in transport, credentials, database connection or
// execution authority. Live callbacks/code require separate exact authorization.
import {createHash} from 'node:crypto';
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const count=v=>{const n=typeof v==='string'&&/^\d+$/.test(v)?Number(v):v;return Number.isSafeInteger(n)&&n>=0?n:null;};
const plans=new WeakSet();
const lifecyclePhases=new Set(['DISPATCH','HEADERS','BODY','JSON','VALIDATE','RECEIPT']);
const lifecycleCodes=new Set(['LIFECYCLE_HTTP_NOT_200','LIFECYCLE_RESPONSE_TOO_LARGE','LIFECYCLE_JSON_INVALID',
  'LIFECYCLE_RULE_SHAPE_UNPROVEN','PRIVATE_RECEIPT_READBACK','ABORT_ERR','ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN']);
export function lifecycleFailureEvidence(error,phase) {
  // AssertionError.message appends a value diff; only an exact known first line is safe.
  const first=typeof error?.message==='string'?error.message.split(/\r?\n/,1)[0]:'';
  const code=[first,error?.code,error?.cause?.code].find(v=>lifecycleCodes.has(v));
  return {phase:lifecyclePhases.has(phase)?phase:'UNKNOWN',code:code??'READONLY_STAGE_FAILED_UNCLASSIFIED',rootCause:'UNKNOWN'};
}
export function lifecycleResponseShape(envelope) {
  const type=v=>v===undefined?'missing':v===null?'null':Array.isArray(v)?'array':typeof v;
  const rules=envelope?.result?.rules;
  const known=['id','enabled','conditions','deleteObjectsTransition','abortMultipartUploadsTransition','storageClassTransitions'];
  return {successConfirmed:envelope?.success===true,resultType:type(envelope?.result),rulesType:type(rules),
    ruleCount:Array.isArray(rules)&&rules.length<=128?rules.length:null,ruleCountOverLimit:Array.isArray(rules)&&rules.length>128,
    rules:!Array.isArray(rules)||rules.length>128?[]:rules.map(r=>({
      ruleType:type(r),unknownRuleFields:r&&typeof r==='object'?Object.keys(r).some(k=>!known.includes(k)):false,
      idType:type(r?.id),enabledType:type(r?.enabled),conditionsType:type(r?.conditions),prefixType:type(r?.conditions?.prefix),
      deleteType:type(r?.deleteObjectsTransition),deleteConditionType:type(r?.deleteObjectsTransition?.condition),
      deleteKind:['Age','Date'].includes(r?.deleteObjectsTransition?.condition?.type)?r.deleteObjectsTransition.condition.type:'OTHER_OR_MISSING',
      abortType:type(r?.abortMultipartUploadsTransition),storageTransitionsType:type(r?.storageClassTransitions)
    }))};
}
function validCondition(v,dateAllowed=true) {
  if(!shape(v,['type','maxAge','date']))return false;
  if(v.type==='Age')return Object.keys(v).length===2&&Number.isFinite(v.maxAge)&&v.maxAge>=0;
  if(v.type!=='Date'||!dateAllowed||Object.keys(v).length!==2||typeof v.date!=='string'
    ||!/^\d{4}-\d{2}-\d{2}T/.test(v.date)||!Number.isFinite(Date.parse(v.date)))return false;
  const day=new Date(v.date.slice(0,10)+'T00:00:00Z');
  return Number.isFinite(day.getTime())&&day.toISOString().slice(0,10)===v.date.slice(0,10);
}

export function planTmpLifecycleRead(response,source) {
  const unknown=()=>({status:'UNKNOWN',reason:'LIFECYCLE_OR_TARGET_NOT_PROVEN',productionAuthority:false});
  if(source?.targetVerified!==true||source.complete!==true||source.bucket!=='openglasshub-media'||source.jurisdiction!=='default'
    ||response?.success!==true||!shape(response.result,['rules'])||!Array.isArray(response.result.rules)
    ||response.result.rules.length>128||Buffer.byteLength(JSON.stringify(response))>262144)return unknown();
  const prefixes=[],ids=new Set();
  for(const rule of response.result.rules) {
    // Abort-only rules cannot expire completed media; never infer a deletion prefix.
    const abortOnly=Object.hasOwn(rule??{},'abortMultipartUploadsTransition')
      &&!Object.hasOwn(rule??{},'deleteObjectsTransition')&&!Object.hasOwn(rule??{},'storageClassTransitions');
    const omittedAbortPrefix=abortOnly&&shape(rule?.conditions,['prefix'])&&!Object.hasOwn(rule.conditions,'prefix');
    if(!shape(rule,['id','enabled','conditions','deleteObjectsTransition','abortMultipartUploadsTransition','storageClassTransitions'])
      ||typeof rule.id!=='string'||!rule.id||rule.id.length>1024||ids.has(rule.id)||typeof rule.enabled!=='boolean'
      ||!shape(rule.conditions,['prefix'])||(!omittedAbortPrefix
        &&(typeof rule.conditions.prefix!=='string'||Buffer.byteLength(rule.conditions.prefix)>1024)))return unknown();
    ids.add(rule.id);
    for(const name of ['deleteObjectsTransition','abortMultipartUploadsTransition'])if(Object.hasOwn(rule,name)
      &&(!shape(rule[name],['condition'])||!validCondition(rule[name].condition,name!=='abortMultipartUploadsTransition')))return unknown();
    if(Object.hasOwn(rule,'storageClassTransitions')&&(!Array.isArray(rule.storageClassTransitions)||rule.storageClassTransitions.length>128
      ||rule.storageClassTransitions.some(t=>!shape(t,['condition','storageClass'])||t.storageClass!=='InfrequentAccess'||!validCondition(t.condition))))return unknown();
    if(!rule.enabled||!rule.deleteObjectsTransition)continue;
    const prefix=rule.conditions.prefix;
    const boundedPrefix='tmp/'.startsWith(prefix)?'tmp/':prefix.startsWith('tmp/')?prefix:null;
    if(boundedPrefix!==null&&!prefixes.includes(boundedPrefix))prefixes.push(boundedPrefix);
  }
  // Prefixes remain transient SQL parameters; the persisted classification omits them.
  const result=Object.freeze({status:'READY',prefixes:Object.freeze(prefixes),ruleCount:response.result.rules.length,productionAuthority:false});
  plans.add(result);return result;
}

export function evaluateTmpLifecycleRisk(plan,evidence) {
  const base={risk:'UNKNOWN',scope:'CURRENT_TMP_VIDEO_REFERENCES_ONLY',allHistoricalMediaVerified:false,pastByteLoss:'NOT_PROVEN',productionAuthority:false};
  if(!plans.has(plan)||evidence?.databaseReadVerified!==true)return {...base,reason:'LIVE_READ_EVIDENCE_MISSING'};
  const total=count(evidence.total),published=count(evidence.published),orphan=count(evidence.orphan),rows=evidence.matched;
  if([total,published,orphan].includes(null)||published+orphan>total||!Array.isArray(rows)||rows.length!==plan.prefixes.length)return {...base,reason:'AGGREGATE_UNKNOWN'};
  const matches=new Map();
  for(const row of rows) {
    const n=count(row?.refs);
    if(!shape(row,['index','refs'])||!Number.isInteger(row.index)||row.index<0||row.index>=plan.prefixes.length||matches.has(row.index)
      ||n===null||n>total||(plan.prefixes[row.index]==='tmp/'&&n!==total))return {...base,reason:'AGGREGATE_UNKNOWN'};
    matches.set(row.index,n);
  }
  const deletionMatches=[...matches.values()].some(n=>n>0);
  return {...base,total,published,orphan,risk:deletionMatches?'BLOCKED':total===0?'SAFE':'UNKNOWN',
    lifecycleDeletionRisk:deletionMatches?'REFERENCED_TMP_CAN_EXPIRE':'NO_MATCHED_DELETION',
    reason:deletionMatches?'ENABLED_DELETION_MATCHES_REFERENCES':total===0?'NO_CURRENT_TMP_REFERENCES':'TMP_REFERENCES_REMAIN_NOT_GLOBALLY_SAFE'};
}

// These are private baseline values, not transport, approval or a protection plan.
// Retain every result field and array order; never project just the matched rules.
export function sealBucketRuleBaseline(raw,source) {
  const fail=()=>{throw Error('PRIVATE_RULE_BASELINE_UNPROVEN');};
  if(!Buffer.isBuffer(raw)||raw.length>262144||!raw.length||source?.complete!==true
    ||source.status!==200||source.redirected!==false||source.targetVerified!==true
    ||source.account!=='dcb374166b39234a499985145c075f50'
    ||source.bucket!=='openglasshub-media'||source.jurisdiction!=='default'
    ||!['lifecycle','lock'].includes(source.kind))fail();
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${source.account}/r2/buckets/${source.bucket}/${source.kind}`;
  if(source.endpoint!==endpoint)fail();
  let response;
  try {response=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{fail();}
  const rules=response?.result?.rules;
  if(response?.success!==true||!Array.isArray(rules)||rules.length>(source.kind==='lock'?1000:128))fail();
  const ids=new Set();
  for(const r of rules) {
    if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!r.id
      ||ids.has(r.id)||typeof r.enabled!=='boolean')fail();
    ids.add(r.id);
  }
  // A sorted entry serializer also preserves own keys such as __proto__ and
  // numeric-looking keys; ordinary assignment/JSON.stringify can reorder them.
  const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`
    :v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
    :JSON.stringify(v);
  const sha=v=>createHash('sha256').update(v).digest('hex');
  return {configuration:response.result,rawResponseSha256:sha(raw),
    configurationSha256:sha(canonical(response.result)),ruleCount:rules.length,
    kind:source.kind,productionAuthority:false,writeReady:false};
}

export function tmpTargetFailureReceipt(error) {
  const checks=new Set(['ROW_COUNT','COLUMNS','MEDIA_ID','POST_ID','DUPLICATE_MEDIA_ID',
    'KEY_NONCANONICAL','DUPLICATE_KEY','SIZE','POST_STATE','MODERATION_STATE','KEY_POST_LINK']);
  const scoped=error?.message==='PRIVATE_TMP_TARGET_SCOPE_UNPROVEN';
  const n=error?.returnedRowCount;
  return {admissionCheck:scoped&&checks.has(error.admissionCheck)?error.admissionCheck:'UNKNOWN',
    returnedRowCount:scoped&&Number.isInteger(n)&&n>=0&&n<=3?n:'UNKNOWN',
    rootCause:'UNKNOWN'};
}

export function admitExactTmpReferences(rows) {
  const fail=check=>{throw Object.assign(Error('PRIVATE_TMP_TARGET_SCOPE_UNPROVEN'),{
    admissionCheck:check,returnedRowCount:Array.isArray(rows)&&rows.length<=3?rows.length:'OVERFLOW_OR_INVALID'
  });};
  // Check count first: the third row is overflow detection, never a target.
  if(!Array.isArray(rows)||rows.length!==2)fail('ROW_COUNT');
  const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const columns=['media_id','post_id','storage_path','size_bytes','post_status','moderation_status'];
  const ids=new Set(),keys=new Set();
  for(const r of rows) {
    if(!r||Object.keys(r).length!==columns.length||!Object.keys(r).every(k=>columns.includes(k)))fail('COLUMNS');
    if(!uuid.test(r.media_id))fail('MEDIA_ID');
    if(!uuid.test(r.post_id))fail('POST_ID');
    if(ids.has(r.media_id.toLowerCase()))fail('DUPLICATE_MEDIA_ID');
    if(typeof r.storage_path!=='string'||!r.storage_path.startsWith('tmp/')
      ||Buffer.byteLength(r.storage_path)>1024||!/^tmp\/[a-zA-Z0-9._/-]+$/.test(r.storage_path)
      ||r.storage_path.split('/').some(p=>!p||p==='.'||p==='..'))fail('KEY_NONCANONICAL');
    if(keys.has(r.storage_path))fail('DUPLICATE_KEY');
    if(count(r.size_bytes)===null)fail('SIZE');
    if(typeof r.post_status!=='string'||!r.post_status)fail('POST_STATE');
    if(typeof r.moderation_status!=='string'||!r.moderation_status)fail('MODERATION_STATE');
    const parts=r.storage_path.split('/');
    if(parts.length!==4||!uuid.test(parts[1])||parts[2]!==r.post_id.toLowerCase())fail('KEY_POST_LINK');
    ids.add(r.media_id.toLowerCase());keys.add(r.storage_path);
  }
  return {privateTargets:rows.map(r=>Object.fromEntries(columns.map(k=>[k,r[k]]))),
    safeSummary:{admittedReferences:2,objectExistence:'UNKNOWN',protection:'NOT_APPLIED',productionAuthority:false}};
}

// Metadata only; a prefix page is not an exact-object lookup or a permission proof.
export function projectBoundR2ObjectPage(response,source,expectedKey) {
  const unknown=()=>({state:'UNKNOWN',exactKeyMatch:false,listingTerminated:false,
    suffixCollision:'UNKNOWN',sizeBytes:'UNKNOWN',storageClass:'UNKNOWN',
    lastModifiedUtc:'UNKNOWN',etag:'UNKNOWN',version:'UNKNOWN',productionAuthority:false});
  const out=unknown();
  const validKey=k=>typeof k==='string'&&k.length>0&&k.length<=1024
    &&/^[a-zA-Z0-9._/-]+$/.test(k)&&k.split('/').every(p=>p&&p!=='.'&&p!=='..');
  if(!validKey(expectedKey)||source?.account!=='dcb374166b39234a499985145c075f50'
    ||source.bucket!=='openglasshub-media'||source.jurisdiction!=='default'
    ||source.status!==200||source.complete!==true||source.redirected!==false
    ||source.targetVerified!==true||source.prefix!==expectedKey||source.perPage!==2
    ||source.pagination!==false||response?.success!==true
    ||(response.errors!==undefined&&(!Array.isArray(response.errors)||response.errors.length)))return out;
  let bytes;
  try{bytes=new TextEncoder().encode(JSON.stringify(response)).length;}catch{return out;}
  const rows=response.result;
  if(bytes>65536||!Array.isArray(rows)||rows.length>2)return out;
  const keys=new Set();
  for(const row of rows){
    if(!row||typeof row!=='object'||!validKey(row.key)||!row.key.startsWith(expectedKey)
      ||keys.has(row.key))return out;
    keys.add(row.key);
  }
  const info=response.result_info;
  if(info?.per_page!==undefined&&info.per_page!==2)return unknown();
  if(info?.count!==undefined&&(!Number.isSafeInteger(info.count)||info.count!==rows.length))return unknown();
  out.listingTerminated=info?.is_truncated===false
    &&(info.cursor===undefined||info.cursor===null||info.cursor==='')
    &&(info.delimited===undefined||(Array.isArray(info.delimited)&&info.delimited.length===0));
  const exact=rows.find(r=>r.key===expectedKey);
  out.suffixCollision=rows.some(r=>r.key!==expectedKey)?'OBSERVED'
    :out.listingTerminated?'NONE_OBSERVED':'UNKNOWN';
  if(!exact){if(out.listingTerminated)out.state='NOT_FOUND';return out;}
  out.state='EXISTS';out.exactKeyMatch=true;
  if(Number.isSafeInteger(exact.size)&&exact.size>=0)out.sizeBytes=exact.size;
  if(['Standard','InfrequentAccess'].includes(exact.storage_class))out.storageClass=exact.storage_class;
  if(typeof exact.last_modified==='string'&&/^\d{4}-\d{2}-\d{2}T.*Z$/.test(exact.last_modified)
    &&Number.isFinite(Date.parse(exact.last_modified))
    &&new Date(exact.last_modified).toISOString().slice(0,10)===exact.last_modified.slice(0,10))
    out.lastModifiedUtc=new Date(exact.last_modified).toISOString();
  if(typeof exact.etag==='string'&&/^[a-f0-9]{32}(?:-\d+)?$/i.test(exact.etag))out.etag=exact.etag;
  if(typeof exact.version==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(exact.version))out.version=exact.version;
  return out;
}

const metadataReceipts=new WeakMap();
const sha256=value=>createHash('sha256').update(value).digest('hex');
const hashValue=value=>sha256(JSON.stringify(value));
const digestShape=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const utcMillis=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return NaN;
  const n=Date.parse(value);return Number.isFinite(n)&&new Date(n).toISOString()===value?n:NaN;
};
const requestIdentity=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
const metadataKey=value=>typeof value==='string'&&value.length<=1024&&/^[a-zA-Z0-9._/-]+$/.test(value)
  &&value.split('/').every(p=>p&&p!=='.'&&p!=='..');

// Preserve the entire decoded MCP envelope privately, not only its projection.
// This cannot certify upstream wire completeness, OAuth identity or permission.
export function sealR2MetadataReadback(raw,source) {
  const fail=()=>{throw Error('R2_METADATA_READBACK_UNPROVEN');};
  const fields=['kind','account','bucket','jurisdiction','endpoint','status','complete','redirected','targetVerified',
    'method','prefix','perPage','pagination','executionBindingSha256','connectionBindingSha256','requestId','startedUtc','completedUtc'];
  const start=utcMillis(source?.startedUtc),end=utcMillis(source?.completedUtc);
  if(!Buffer.isBuffer(raw)||!raw.length||raw.length>65536||!shape(source,fields)
    ||source.kind!=='metadata'||source.method!=='GET'||source.status!==200
    ||source.account!=='dcb374166b39234a499985145c075f50'||source.bucket!=='openglasshub-media'
    ||source.jurisdiction!=='default'||source.complete!==true||source.redirected!==false||source.targetVerified!==true
    ||source.endpoint!==`https://api.cloudflare.com/client/v4/accounts/${source.account}/r2/buckets/${source.bucket}/objects`
    ||!metadataKey(source.prefix)||source.perPage!==2||source.pagination!==false
    ||!digestShape(source.executionBindingSha256)||!digestShape(source.connectionBindingSha256)
    ||!requestIdentity(source.requestId)||!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>10000)fail();
  let text,response;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw);response=JSON.parse(text);}catch{fail();}
  if(text.includes('--- TRUNCATED ---')||response?.success!==true
    ||(response.status!==undefined&&response.status!==source.status)
    ||!Array.isArray(response.result)||response.result.length>2)fail();
  const receipt={source:JSON.parse(JSON.stringify(source)),rawDecodedResponse:text,
    decodedResponseSha256:sha256(raw),response,projection:projectBoundR2ObjectPage(response,source,source.prefix),
    providerWireCompletenessProven:false,productionAuthority:false};
  metadataReceipts.set(receipt,hashValue(receipt));return receipt;
}

// Correlate local capture records only; absence still needs a trusted live channel.
// A DELETE acknowledgement alone or a caller-fabricated read receipt is insufficient.
export function bindR2CleanupReadback(receipt,deletion,creationRaw) {
  const unknown=()=>({state:'UNKNOWN',productionAuthority:false});
  try {
    if(!receipt||metadataReceipts.get(receipt)!==hashValue(receipt))return unknown();
    const s=receipt.source,d=deletion;
    if(!Buffer.isBuffer(creationRaw)||!creationRaw.length||creationRaw.length>8192)return unknown();
    const creation=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(creationRaw));
    const start=utcMillis(d?.startedUtc),end=utcMillis(d?.completedUtc);
    if(!shape(d,['executionBindingSha256','connectionBindingSha256','account','bucket','jurisdiction','method',
      'requestId','keys','createdKeys','creationReceiptSha256','responseSha256','status','complete','startedUtc','completedUtc'])
      ||d.method!=='DELETE'||d.status!==200||d.complete!==true
      ||d.executionBindingSha256!==s.executionBindingSha256||d.connectionBindingSha256!==s.connectionBindingSha256
      ||d.account!==s.account||d.bucket!==s.bucket||d.jurisdiction!==s.jurisdiction
      ||!requestIdentity(d.requestId)||d.requestId===s.requestId
      ||!digestShape(d.creationReceiptSha256)||!digestShape(d.responseSha256)
      ||!Array.isArray(d.keys)||d.keys.length<1||d.keys.length>2||new Set(d.keys).size!==d.keys.length
      ||!Array.isArray(d.createdKeys)||d.createdKeys.length<1||d.createdKeys.length>2
      ||new Set(d.createdKeys).size!==d.createdKeys.length
      ||!d.keys.every(k=>metadataKey(k)&&d.createdKeys.includes(k))||!d.keys.includes(s.prefix)
      ||sha256(creationRaw)!==d.creationReceiptSha256
      ||!shape(creation,['executionBindingSha256','connectionBindingSha256','account','bucket','jurisdiction',
        'keys','observedUtc','uploadReceiptSha256','retentionReceiptSha256'])
      ||creation.executionBindingSha256!==s.executionBindingSha256||creation.connectionBindingSha256!==s.connectionBindingSha256
      ||creation.account!==s.account||creation.bucket!==s.bucket||creation.jurisdiction!==s.jurisdiction
      ||!digestShape(creation.uploadReceiptSha256)||!digestShape(creation.retentionReceiptSha256)
      ||!Array.isArray(creation.keys)||creation.keys.length!==d.createdKeys.length
      ||new Set(creation.keys).size!==creation.keys.length
      ||!creation.keys.every(k=>metadataKey(k)&&d.createdKeys.includes(k))
      ||!Number.isFinite(utcMillis(creation.observedUtc))||utcMillis(creation.observedUtc)>start
      ||!Number.isFinite(start)||!Number.isFinite(end)||end<start||end>utcMillis(s.startedUtc))return unknown();
    const projection=projectBoundR2ObjectPage(receipt.response,s,s.prefix);
    return {state:projection.state==='NOT_FOUND'?'ABSENCE_OBSERVED_AFTER_DELETE'
      :projection.state==='EXISTS'?'OBJECT_STILL_PRESENT':'UNKNOWN',
      deletionReceiptSha256:hashValue(d),readbackReceiptSha256:metadataReceipts.get(receipt),productionAuthority:false};
  }catch{return unknown();}
}

// Draft executable code for the existing MCP, never dispatch it during preparation.
// Keep the complete decoded envelope inside a hash-checked string across tool output.
const validDMetadataBinding=binding=>shape(binding,['executionBindingSha256','connectionBindingSha256','requestId','key'])
  &&digestShape(binding.executionBindingSha256)&&digestShape(binding.connectionBindingSha256)
  &&requestIdentity(binding.requestId)&&metadataKey(binding.key);
export function buildDMetadataCaptureCode(binding) {
  if(!validDMetadataBinding(binding))throw Error('D_METADATA_CAPTURE_BINDING_INVALID');
  return `async () => {
    const binding=${JSON.stringify(binding)};
    const fixedAccount="dcb374166b39234a499985145c075f50";
    if(accountId!==fixedAccount)return {state:"UNKNOWN",dispatchInvocations:0,productionAuthority:false};
    const request={...binding,account:fixedAccount,bucket:"openglasshub-media",jurisdiction:"default",method:"GET",
      path:"/accounts/"+fixedAccount+"/r2/buckets/openglasshub-media/objects",query:{prefix:binding.key,per_page:2}};
    const startedUtc=new Date().toISOString();let timer;
    try {
      const response=await Promise.race([cloudflare.request({method:request.method,path:request.path,query:request.query}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("TIMEOUT")),10000);})]);
      const rawDecodedResponse=JSON.stringify(response),bytes=new TextEncoder().encode(rawDecodedResponse);
      if(bytes.length>65536||rawDecodedResponse.includes("--- TRUNCATED ---"))throw new Error("INCOMPLETE");
      const hash=await crypto.subtle.digest("SHA-256",bytes);
      return {request,startedUtc,completedUtc:new Date().toISOString(),rawDecodedResponse,responseBytes:bytes.length,
        responseSha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join(""),
        dispatchInvocations:1,providerWireCompletenessProven:false,productionAuthority:false};
    }catch{return {request,startedUtc,completedUtc:new Date().toISOString(),state:"UNKNOWN",
      dispatchInvocations:1,providerCancellationProven:false,productionAuthority:false};}
    finally{clearTimeout(timer);}
  }`;
}

export function inspectDMetadataCapture(capture,binding) {
  const unknown=()=>({state:'UNKNOWN',productionAuthority:false,deleteAfterReadback:'NOT_RUN'});
  try {
    const r=capture?.request,text=capture?.rawDecodedResponse;
    if(!validDMetadataBinding(binding)||!r||typeof text!=='string'||Buffer.byteLength(text)>65536||text.includes('--- TRUNCATED ---')
      ||capture.dispatchInvocations!==1||capture.responseBytes!==Buffer.byteLength(text)
      ||capture.responseSha256!==sha256(text)||r.method!=='GET'||r.account!=='dcb374166b39234a499985145c075f50'
      ||r.bucket!=='openglasshub-media'||r.jurisdiction!=='default'
      ||r.path!==`/accounts/${r.account}/r2/buckets/openglasshub-media/objects`
      ||!shape(r.query,['prefix','per_page'])||r.query.per_page!==2||r.query.prefix!==binding?.key
      ||!['key','requestId','executionBindingSha256','connectionBindingSha256'].every(k=>r[k]===binding?.[k])
      ||!Number.isFinite(utcMillis(capture.startedUtc))||!Number.isFinite(utcMillis(capture.completedUtc))
      ||utcMillis(capture.completedUtc)<utcMillis(capture.startedUtc)
      ||utcMillis(capture.completedUtc)-utcMillis(capture.startedUtc)>10000)return unknown();
    const response=JSON.parse(text),info=response?.result_info;
    if(response.status!==200||response.success!==true||!Array.isArray(response.result)||response.result.length!==0
      ||(response.errors!==undefined&&(!Array.isArray(response.errors)||response.errors.length))
      ||info?.is_truncated!==false||![undefined,null,''].includes(info.cursor)
      ||(info.per_page!==undefined&&info.per_page!==2)||(info.count!==undefined&&info.count!==0)
      ||(info.delimited!==undefined&&(!Array.isArray(info.delimited)||info.delimited.length!==0)))return unknown();
    return {state:'TERMINAL_PAGE_OBSERVED',responseSha256:capture.responseSha256,
      productionAuthority:false,deleteAfterReadback:'NOT_RUN'};
  }catch{return unknown();}
}

// Existing bound executors supply all callbacks and durable quota/window gates.
// This coordinator cannot grant permission, refresh a session, retry, or hide a post.
export async function runDBoundCleanup({creationRaw,actorCreationRaw,postState,target,callbacks}) {
  const result={state:'BLOCKED',phase:'ADMISSION',objectProofs:[],actorContained:false,productionAuthority:false};
  let admitted=false;
  const dispatch=async(phase,operation)=>{
    result.phase=phase;
    if(typeof callbacks?.beforeDispatch!=='function'||await callbacks.beforeDispatch(phase)!==true)
      throw Error('D_CLEANUP_DISPATCH_NOT_ADMITTED');
    return operation();
  };
  try {
    const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
    if(!Buffer.isBuffer(actorCreationRaw)||!actorCreationRaw.length||actorCreationRaw.length>4096
      ||!uuid.test(target?.actorId)||sha256(actorCreationRaw)!==target?.actorCreationReceiptSha256)
      throw Error('D_ACTOR_CREATION_UNPROVEN');
    const actor=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(actorCreationRaw));
    if(!shape(actor,['executionBindingSha256','actorId','createdByThisRun','createdUtc','providerReceiptSha256'])
      ||actor.actorId!==target.actorId||actor.createdByThisRun!==true||!digestShape(actor.executionBindingSha256)
      ||!digestShape(actor.providerReceiptSha256)||!Number.isFinite(utcMillis(actor.createdUtc)))
      throw Error('D_ACTOR_CREATION_UNPROVEN');
    admitted=true;
    if(!Buffer.isBuffer(creationRaw)||creationRaw.length>8192)throw Error('D_CREATION_UNPROVEN');
    const c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(creationRaw));
    if(c.account!=='dcb374166b39234a499985145c075f50'||c.bucket!=='openglasshub-media'||c.jurisdiction!=='default'
      ||!digestShape(c.executionBindingSha256)||!digestShape(c.connectionBindingSha256)
      ||!digestShape(c.uploadReceiptSha256)||!digestShape(c.retentionReceiptSha256)
      ||!Number.isFinite(utcMillis(c.observedUtc))||!Array.isArray(c.keys)||c.keys.length<1||c.keys.length>2
      ||new Set(c.keys).size!==c.keys.length||!c.keys.every(metadataKey)
      ||!uuid.test(target?.postId)||c.executionBindingSha256!==actor.executionBindingSha256
      ||utcMillis(c.observedUtc)<utcMillis(actor.createdUtc)
      ||!c.keys.every(k=>k.startsWith(`tmp/${target.actorId}/${target.postId}/`)?k.split('/').length===4
        :k.startsWith(`${target.actorId}/${target.postId}/`)
          &&k.split('/').length===3&&/^r2-retained-[a-f0-9-]+\.(mp4|webm|mov)$/i.test(k.split('/')[2])))
      throw Error('D_CREATION_UNPROVEN');
    if(postState!=='published')throw Error('D_OWNER_DELETE_STATE_UNAVAILABLE');
    const owner=await dispatch('OWNER_DELETE',()=>callbacks.ownerDelete(target.postId));
    if(owner?.postId!==target.postId||owner.acknowledged!==true||owner.postState!=='deleted')throw Error('D_OWNER_DELETE_UNPROVEN');
    const post=await dispatch('POST_READBACK',()=>callbacks.readPost(target.postId));
    if(post?.postId!==target.postId||post.independent!==true||post.postState!=='deleted'||post.mediaRows!==0||post.anonymousStatus!==404)
      throw Error('D_POST_CLEANUP_UNPROVEN');
    const deletion=await dispatch('EXACT_OBJECT_DELETE',()=>callbacks.deleteExactObjects([...c.keys]));
    // Both tmp source and retained key need their own later terminal observation.
    const readRequestIds=new Set();
    for(let i=0;i<c.keys.length;i++) {
      const read=await dispatch('OBJECT_READBACK_'+i,()=>callbacks.readExactObject(c.keys[i]));
      if(read?.source?.prefix!==c.keys[i]||readRequestIds.has(read?.source?.requestId))throw Error('D_OBJECT_TARGET_UNPROVEN');
      readRequestIds.add(read.source.requestId);
      const proof=bindR2CleanupReadback(read,deletion,creationRaw);
      result.objectProofs.push(proof);
      if(proof.state!=='ABSENCE_OBSERVED_AFTER_DELETE')throw Error('D_OBJECT_CLEANUP_UNPROVEN');
    }
    result.state='CLEANUP_SEQUENCE_VERIFIED';
  }catch{result.state='BLOCKED';}
  finally {
    // Failure containment is separately admitted even when a business step stops.
    if(admitted)try {
      const actor=await dispatch('ACTOR_CONTAINMENT',()=>callbacks.finishActor(target.actorId));
      result.actorContained=actor?.actorId===target.actorId&&actor.actorCreationReceiptSha256===target.actorCreationReceiptSha256
        &&actor.signedOut===true&&actor.banned===true&&actor.independentReadback===true;
    }catch{result.actorContained=false;}
    if(!result.actorContained)result.state='BLOCKED';
  }
  return result;
}

// Build a draft only. Live object, cost, authorization and drift gates stay separate.
export function buildFinitePrefixLockCandidate({baseline,expectedConfigurationSha256,keys,ruleIds,expiryUtc,nowUtc}) {
  const fail=()=>{throw Error('FINITE_PREFIX_LOCK_CANDIDATE_UNPROVEN');};
  const source={kind:'lock',account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',
    jurisdiction:'default',endpoint:'https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/r2/buckets/openglasshub-media/lock',
    status:200,complete:true,redirected:false,targetVerified:true};
  if(baseline?.kind!=='lock'||!Array.isArray(keys)||keys.length<1||keys.length>2
    ||new Set(keys).size!==keys.length||keys.some(k=>typeof k!=='string'||!/^tmp\/[a-zA-Z0-9._/-]+$/.test(k)
      ||k.length>1024||k.split('/').length<3||k.split('/').some(p=>!p||p==='.'||p==='..'))
    ||keys.some((a,i)=>keys.some((b,j)=>i!==j&&b.startsWith(a)))
    ||!Array.isArray(ruleIds)||ruleIds.length!==keys.length||new Set(ruleIds).size!==ruleIds.length
    ||ruleIds.some(id=>typeof id!=='string'||!/^ogh-legacy-[a-z0-9-]{1,80}$/.test(id)))fail();
  const now=Date.parse(nowUtc),end=Date.parse(expiryUtc);
  if(!Number.isFinite(now)||!Number.isFinite(end)||end-now<3600000||end-now>8*86400000
    ||new Date(now).toISOString()!==nowUtc||new Date(end).toISOString()!==expiryUtc)fail();
  const sealed=sealBucketRuleBaseline(Buffer.from(JSON.stringify({success:true,result:baseline.configuration})),source);
  if(sealed.configurationSha256!==expectedConfigurationSha256
    ||sealed.configurationSha256!==baseline.configurationSha256||sealed.ruleCount+keys.length>1000
    ||sealed.configuration.rules.some(r=>ruleIds.includes(r.id)))fail();
  const configuration=JSON.parse(JSON.stringify(sealed.configuration));
  configuration.rules.push(...keys.map((prefix,i)=>({id:ruleIds[i],enabled:true,prefix,
    condition:{type:'Date',date:expiryUtc}})));
  const candidate=sealBucketRuleBaseline(Buffer.from(JSON.stringify({success:true,result:configuration})),source);
  return {configuration:candidate.configuration,configurationSha256:candidate.configurationSha256,
    originalConfigurationSha256:sealed.configurationSha256,preservedRuleCount:sealed.ruleCount,
    addedRuleCount:keys.length,expiryUtc,fullKeyPrefixesAreNotExactEquality:true,
    futureSuffixMatchesBounded:false,objectExistence:'UNKNOWN',productionAuthority:false,writeReady:false};
}
