import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {dHash} from './d-execution-journal.mjs';
import {createProductionDispatchGuard} from './production-dispatch-guard.mjs';
import {sealBucketRuleBaseline} from './legacy-tmp-lifecycle-safety.mjs';
import {createLegacyR2HeadVerifier} from './legacy-r2-head-verification.mjs';
import {publishDInputRecord} from './d-input-coordination.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';
const manifestPin='a3bae172c823ec9d78f643e4f7c29a5b61a8c6ca1ae4ae9566c08cc4ffed6ab1';
const frozenCConfiguration='ced37737b114b27e130aed5b5a1f0b74677005874c8c06e5fa9bf7f80bfe0952';
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const pin=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const hashFile=file=>dHash(fs.readFileSync(file));
const fail=()=>{throw Error('LEGACY_DURABLE_HOST_NOT_ADMITTED');};
function bound(ref,max=262144) {
  if(!ref||!path.isAbsolute(ref.path)||!pin(ref.sha256))fail();
  const stat=fs.lstatSync(ref.path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max||hashFile(ref.path)!==ref.sha256)fail();
  return JSON.parse(fs.readFileSync(ref.path,'utf8'));
}
function response(ref) {
  const raw=bound(ref);
  if(raw.isError===true||!Array.isArray(raw.content)||raw.content.length!==1
    ||raw.content[0].type!=='text'||typeof raw.content[0].text!=='string')fail();
  const value=JSON.parse(raw.content[0].text);
  if(value.status!==200||value.success!==true||value.errors?.length)fail();
  return value;
}

// Exact H metadata caller only. It owns a separate durable ledger and cloned signer;
// neither the D six-HEAD budget nor the frozen B queries can be consumed here.
export async function runLegacyR2HeadHost({plan,credentials,supplier,supplierEvidence,
  mode='PRODUCTION',inspect=false,requestHandler,verifyPrivateDirectory,assertAdmissionActive,signal,now=Date.now}={}) {
  let verifier,guard,watch;
  const observations=[];
  try {
    if(!['PRODUCTION','SYNTHETIC'].includes(mode)||typeof now!=='function'
      ||!plan||!path.isAbsolute(plan.directory)||!fs.lstatSync(plan.directory).isDirectory()
      ||mode==='PRODUCTION'&&(requestHandler!==undefined||verifyPrivateDirectory?.(plan.directory)!==true
        ||typeof assertAdmissionActive!=='function')
      ||mode==='SYNTHETIC'&&typeof requestHandler?.handle!=='function')fail();
    const adoption=bound(plan.sourceAdoption),approval=bound(plan.ownerApproval),targets=bound(plan.targets);
    const execution=adoption.legacyHeadExecution;
    if(approval.adoptionSha256!==plan.sourceAdoption.sha256||approval.provenance!=='ACTUAL_OWNER_CHAT_SIGNATURE'
      ||approval.ownerFields?.LEGACY_EXACT_HEAD_DURABLE_HOST_GO!=='APPROVED_FOR_EXACT_TWO_SEALED_KEYS_ONLY'
      ||approval.ownerFields?.LEGACY_HEAD_POSSIBLE_CHARGES_AND_SHARED_READONLY_CREDENTIAL_ACCEPTED!==true
      ||execution?.maxHeads!==2||execution.maxPerKey!==1||execution.maxMs!==10000
      ||execution.manifestSha256!==plan.targets.sha256||execution.objectBodyReads!==0||execution.retries!==0
      ||execution.directory!==plan.directory||execution.runId!==plan.runId||!pin(execution.expectedLockConfigurationSha256)
      ||mode==='PRODUCTION'&&execution.expectedLockConfigurationSha256!==frozenCConfiguration
      ||!stamp(plan.notBeforeUtc)||!stamp(plan.deadlineUtc)
      ||Date.parse(plan.notBeforeUtc)>now()||Date.parse(plan.deadlineUtc)<=now()
      ||Date.parse(plan.deadlineUtc)-Date.parse(plan.notBeforeUtc)>3600000||!pin(plan.connectionBindingSha256)
      ||!/^[a-f0-9-]{36}$/.test(plan.runId))fail();
    const sources=['legacy-r2-head-host.mjs','legacy-r2-head-verification.mjs','legacy-tmp-lifecycle-safety.mjs',
      'production-dispatch-guard.mjs','d-input-coordination.mjs','d-execution-journal.mjs'];
    if(sources.some(name=>adoption.sourceHashes?.['scripts/qa/'+name]!==hashFile(path.join(root,'scripts/qa',name))))fail();
    if(mode==='PRODUCTION'&&(plan.targets.sha256!==manifestPin||execFileSync('git',['rev-parse','HEAD'],
      {cwd:root,encoding:'utf8',windowsHide:true}).trim()!==adoption.sourceCommit))fail();
    if(targets.account!==account||targets.bucket!==bucket||targets.jurisdiction!=='default'
      ||!Array.isArray(targets.legacyTargets)||targets.legacyTargets.length!==2)fail();
    const keys=targets.legacyTargets.map((target,i)=>{
      if(target.ordinal!==i+1||typeof target.key!=='string')fail();return target.key;
    });
    const bucketEvidence=bound(plan.bucketEvidence),lockEvidence=bound(plan.lockEvidence),continuity=bound(plan.continuityEvidence);
    const supplierRecord=inspect?null:bound(supplierEvidence,4096);
    if(!inspect&&(!supplier||supplier.account!==account||supplier.bucket!==bucket||supplier.permission!=='object-read-only'
      ||supplier.ttlHours!==24||supplier.createdAfterVisiblePrompt!==true||!stamp(supplier.issuedUtc)||!stamp(supplier.expiresUtc)
      ||Date.parse(supplier.issuedUtc)>Date.parse(plan.notBeforeUtc)||Date.parse(supplier.expiresUtc)<Date.parse(plan.deadlineUtc)
      ||Date.parse(supplier.expiresUtc)-Date.parse(supplier.issuedUtc)>86400000
      ||['account','bucket','permission','ttlHours','tokenLabel','issuedUtc','expiresUtc','createdAfterVisiblePrompt']
        .some(key=>supplierRecord[key]!==supplier[key])))fail();
    const ensureContext=()=>{
      if(signal?.aborted||assertAdmissionActive&&assertAdmissionActive()!==true)fail();
      // Re-read every pinned source before each irreversible debit/dispatch.
      bound(plan.sourceAdoption);bound(plan.ownerApproval);bound(plan.targets);if(!inspect)bound(supplierEvidence,4096);
      bound(plan.bucketEvidence);bound(plan.lockEvidence);bound(plan.continuityEvidence);
      if(sources.some(name=>adoption.sourceHashes['scripts/qa/'+name]!==hashFile(path.join(root,'scripts/qa',name))))fail();
      const time=now(),rawBucket=response(bucketEvidence.privateResponse),rawLock=response(lockEvidence.privateResponse);
      if(bucketEvidence.account!==account||bucketEvidence.bucket!==bucket||bucketEvidence.jurisdiction!=='default'
        ||bucketEvidence.httpStatus!==200||bucketEvidence.complete!==true||bucketEvidence.storageClass!=='Standard'
        ||!stamp(bucketEvidence.acceptedUtc)||time<Date.parse(bucketEvidence.acceptedUtc)
        ||time-Date.parse(bucketEvidence.acceptedUtc)>3600000||rawBucket.result?.name!==bucket
        ||rawBucket.result?.storage_class!=='Standard'
        ||lockEvidence.account!==account||lockEvidence.bucket!==bucket||lockEvidence.jurisdiction!=='default'
        ||lockEvidence.httpStatus!==200||lockEvidence.complete!==true||!stamp(lockEvidence.acceptedUtc)
        ||time<Date.parse(lockEvidence.acceptedUtc)||time-Date.parse(lockEvidence.acceptedUtc)>3600000
        ||continuity.sourceAdoptionSha256!==plan.sourceAdoption.sha256||continuity.manifestSha256!==plan.targets.sha256
        ||continuity.provenance!=='ACTUAL_OWNER_ONSITE_CONFIRMATION'||continuity.ownerConfirmed!==true
        ||!['noInterveningConfigurationChange','destructiveJobsPaused','noUnknownInFlightTargetWrites'].every(k=>continuity[k]===true)
        ||!stamp(continuity.confirmedUtc)||time<Date.parse(continuity.confirmedUtc)
        ||time-Date.parse(continuity.confirmedUtc)>600000||time>=Date.parse(plan.deadlineUtc))fail();
      const baseline=sealBucketRuleBaseline(Buffer.from(JSON.stringify(rawLock)),{complete:true,status:200,
        redirected:false,targetVerified:true,account,bucket,jurisdiction:'default',kind:'lock',
        endpoint:`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/lock`});
      if(baseline.configurationSha256!==lockEvidence.configurationSha256
        ||baseline.configurationSha256!==execution.expectedLockConfigurationSha256
        ||!keys.every(key=>baseline.configuration.rules.some(rule=>
        rule.enabled===true&&rule.prefix===key&&rule.condition?.type==='Date'
        &&Date.parse(rule.condition.date)===Date.parse('2026-11-04T12:00:00Z')
        &&Date.parse(rule.condition.date)>=Date.parse(plan.deadlineUtc))))fail();
      return true;
    };
    ensureContext();
    if(inspect)return {status:'NONCREDENTIAL_LEGACY_BINDINGS_READY',productionPass:false,used:0};
    // Adoption-wide, not caller-selected run identity: reconstruction never resets HEAD2.
    publishDInputRecord(path.join(plan.directory,'LEGACY_HEAD_SCOPE.'+plan.sourceAdoption.sha256+'.used.safe.json'),{
      kind:'SINGLE_USE_LEGACY_HEAD_SCOPE_RESERVATION',authorizationSha256:plan.sourceAdoption.sha256,
      runId:plan.runId,maxHeads:2,maxPerKey:1,recordedUtc:new Date(now()).toISOString()});
    const binding={manifestSha256:plan.targets.sha256,sourceSha256:hashFile(fileURLToPath(import.meta.url)),
      executionBindingSha256:plan.sourceAdoption.sha256,connectionBindingSha256:plan.connectionBindingSha256,
      ownerUseRevisionSha256:plan.ownerApproval.sha256,purpose:'LEGACY_EXACT_HEAD_ONLY_V1',account,bucket,
      jurisdiction:'default',keys,maxHeads:2,maxPerKey:1,notBeforeUtc:plan.notBeforeUtc,deadlineUtc:plan.deadlineUtc,
      absenceSemantics:'VERIFIED_BUCKET_CONTEXT_V2'};
    const scope={...binding,permission:'object-read-only',singleBucket:true,ownerExplicitUseRevision:true,
      issuedUtc:supplier.issuedUtc,expiresUtc:supplier.expiresUtc,supplierProvenanceSha256:supplierEvidence.sha256,
      bucketProvenanceSha256:plan.bucketEvidence.sha256,credentialScopeEvidenceSha256:supplierEvidence.sha256,
      absenceContext:{bucketReceiptSha256:plan.bucketEvidence.sha256,lockReceiptSha256:plan.lockEvidence.sha256,
        continuityReceiptSha256:plan.continuityEvidence.sha256,credentialScopeEvidenceSha256:supplierEvidence.sha256,
        bucketObservedUtc:bucketEvidence.acceptedUtc,continuityConfirmedUtc:continuity.confirmedUtc,
        protectedUntilUtc:'2026-11-04T12:00:00.000Z'}};
    let armedOrdinal=0,lastObservation=null;
    verifier=createLegacyR2HeadVerifier({binding,scope,credentials,requestHandler,now,timeoutMs:10000,
      verifyAbsenceContext:()=>ensureContext(),beforeDispatch:intent=>
        intent.ordinal===armedOrdinal&&intent.key===keys[armedOrdinal-1]&&ensureContext()});
    const operations=keys.map((key,i)=>({phase:'LEGACY_HEAD'+(i+1),method:'HEAD',
      target:`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`}));
    guard=createProductionDispatchGuard({directory:plan.directory,binding:{authorizationSha256:plan.sourceAdoption.sha256,
      guardSourceSha256:hashFile(path.join(root,'scripts/qa/production-dispatch-guard.mjs')),sourceCommit:adoption.sourceCommit,
      nonce:plan.runId,notBeforeUtc:plan.notBeforeUtc,deadlineUtc:plan.deadlineUtc},operations,now,timeoutMs:10000,
      admit:()=>ensureContext(),transport:async op=>{
        armedOrdinal=operations.findIndex(candidate=>candidate.phase===op.phase)+1;
        lastObservation=await verifier.head({key:keys[armedOrdinal-1]});return lastObservation;
      },validateResponse:result=>{
        ensureContext();
        return ['EXISTS','NOT_PRESENT_AT_OBSERVATION'].includes(result?.state);
      }});
    watch=setInterval(()=>{try{ensureContext();}catch{guard.stop();verifier.close();}},50);
    for(let i=0;i<2;i++) {
      lastObservation=null;
      let acknowledged=true;
      try{await guard.dispatch(operations[i].phase);}catch{acknowledged=false;}
      try{ensureContext();}catch{acknowledged=false;}
      const observation=lastObservation??{state:'UNKNOWN',reason:'DURABLE_DISPATCH_UNPROVEN'};
      const file=path.join(plan.directory,'LEGACY_HEAD'+(i+1)+'.private.json');
      publishDInputRecord(file,{schemaVersion:1,kind:'NEW_INDEPENDENT_LEGACY_HEAD_OBSERVATION',
        ordinal:i+1,sourceAdoptionSha256:plan.sourceAdoption.sha256,mode,acknowledged,observation});
      observations.push({ordinal:i+1,state:acknowledged?observation.state:'UNKNOWN',
        privateEvidence:{path:file,sha256:hashFile(file)}});
      if(!acknowledged)break;
    }
    return {status:observations.length===2&&observations.every(r=>r.state!=='UNKNOWN')?'OBSERVED_NOT_DURABLY_RESOLVED':'BLOCKED',
      mode,productionPass:false,observations,used:verifier.counts};
  }finally{clearInterval(watch);guard?.stop();verifier?.close();}
}
