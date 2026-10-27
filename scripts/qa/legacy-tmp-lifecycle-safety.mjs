// Offline-only classification of the documented R2 lifecycle shape. No transport,
// credentials, database connection, mutation or execution authority lives here.
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
