// Offline-only classification of the documented R2 lifecycle shape. No transport,
// credentials, database connection, mutation or execution authority lives here.
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const count=v=>{const n=typeof v==='string'&&/^\d+$/.test(v)?Number(v):v;return Number.isSafeInteger(n)&&n>=0?n:null;};
const plans=new WeakSet();
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
    if(!shape(rule,['id','enabled','conditions','deleteObjectsTransition','abortMultipartUploadsTransition','storageClassTransitions'])
      ||typeof rule.id!=='string'||!rule.id||rule.id.length>1024||ids.has(rule.id)||typeof rule.enabled!=='boolean'
      ||!shape(rule.conditions,['prefix'])||typeof rule.conditions.prefix!=='string'||Buffer.byteLength(rule.conditions.prefix)>1024)return unknown();
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
