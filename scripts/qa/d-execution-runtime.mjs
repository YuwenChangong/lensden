import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dHash,openDJournal,sealDRecord,D_LIMITS} from './d-execution-journal.mjs';
import {buildDCheckpointCode,buildDObserverCode} from './d-production-bindings.mjs';
import {createDHeadVerifier,receiveDHeadCredentials} from './d-r2-head-verification.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media',project='xcbnxzjlsvtgzixurcof';
const pwsh='C:/Users/1/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
const pwshSha='362a356ce7f0940ec74f73a8fc2c990a2cc24a38a11c90bbd8eca947110ad139';
const credentialException='0fb31bcc6a9230ff23914298d781093fa8b90f9f28e627acc59d2063bf885a03';
const parentRecovery='e5e1e5fb5eae76c974890bb45ede4b8fd008c989832df456dc8b7f07935883c2';
const livePorts=new WeakSet();
export const isDProductionPorts=ports=>livePorts.has(ports);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const pin=file=>dHash(fs.readFileSync(file));
export function dNativeProcessEnvironment(environment=process.env) {
  const names=['SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT','QA_SUPABASE_URL','QA_SUPABASE_SERVICE_ROLE_KEY'];
  return Object.fromEntries(names.filter(k=>environment[k]!==undefined).map(k=>[k,environment[k]]));
}
export function verifyDPrivateInputHost(pid) {
  if(process.platform!=='win32'||!Number.isSafeInteger(pid)||pid<=0)throw Error('D_PRIVATE_HOST_UNPROVEN');
  try {
    if(pin(pwsh)!==pwshSha)throw Error();
    const script=`$ErrorActionPreference='Stop';
      $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$args[0]);if($null -eq $p){throw 'PID'};
      $o=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid;
      if($o.ReturnValue -ne 0 -or [string]::IsNullOrEmpty($p.ExecutablePath)){throw 'OWNER'};
      $actual=[IO.Path]::GetFullPath($p.ExecutablePath);$expected=[IO.Path]::GetFullPath($args[1]);
      if(-not [string]::Equals($actual,$expected,[StringComparison]::OrdinalIgnoreCase) -or
        $o.Sid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw 'OWNER'};
      'READY_HOST_MATCH'`;
    const out=execFileSync(pwsh,['-NoProfile','-NonInteractive','-CommandWithArgs',script,String(pid),pwsh],
      {encoding:'utf8',windowsHide:true,timeout:10000,stdio:['ignore','pipe','pipe']});
    if(out.trim()!=='READY_HOST_MATCH')throw Error();
  }catch{throw Error('D_PRIVATE_HOST_UNPROVEN');}
}

const loaderPhases=new Set(['REVOCATION_DUTY','RECOVERY_BINDING','PRIVATE_READY','PRIVATE_HOST','PRIVATE_RECEIVE',
  'SUPPLIER_CONFIRMATION','FINAL_ADMISSION','PORTS_BINDING']);
const loaderReasons=new Set(['D_ORIGINAL_RECOVERY_WINDOW_EXPIRED','D_PRIVATE_INPUT_NOT_READY',
  'D_PRIVATE_HOST_UNPROVEN','D_HEAD_PRIVATE_INPUT_INVALID','D_ORDINARY_TOKEN_THIRD_FIELD_FORBIDDEN',
  'D_SUPPLIER_CONFIRMATION_INVALID','D_SUPPLIER_CONFIRMATION_EXPIRED','D_SUPPLIER_HANDOFF_NOT_ADMITTED',
  'D_SUPPLIER_LIFETIME_UNPROVEN','D_ACTUAL_LOCAL_CARRIERS_NOT_BOUND','D_RUNTIME_GATES_NOT_ADMITTED','D_INPUT_COORDINATOR_STOPPED',
  'D_STANDARD_CONTEXT_STALE','D_RUNTIME_SOURCE_CHANGED','D_SOURCE_COMMIT_MISMATCH','D_REVOCATION_DUTY_UNPROVEN']);
export function dLoaderFailureDetails(phase,error) {
  // Never persist raw exceptions, command output or credential-derived values.
  return {localPhase:loaderPhases.has(phase)?phase:'UNKNOWN',
    localReason:loaderReasons.has(error?.message)?error.message:'D_LOCAL_FAILURE_UNCLASSIFIED'};
}
function readBound(ref,max=262144) {
  if(!ref||!path.isAbsolute(ref.path)||!digest(ref.sha256))throw Error('D_EVIDENCE_REFERENCE_INVALID');
  const stat=fs.lstatSync(ref.path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max||pin(ref.path)!==ref.sha256)throw Error('D_EVIDENCE_CHANGED');
  return fs.readFileSync(ref.path,'utf8');
}
function privateDirectory(directory) {
  if(process.platform!=='win32'||pin(pwsh)!==pwshSha||!path.isAbsolute(directory))throw Error('D_PRIVATE_HOST_REQUIRED');
  // Only a non-secret path crosses argv. No credentials are queried here.
  const script=`$ErrorActionPreference='Stop';$p=[IO.Path]::GetFullPath($args[0]);$u=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
    $r=Get-Item -LiteralPath $p;while($null -ne $r){if($r.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE'};$r=$r.Parent};
    foreach($a in (Get-Acl -LiteralPath $p).Access){if($a.AccessControlType -eq 'Allow' -and $a.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($u,'S-1-5-18')){throw 'ACL'}};
    'PRIVATE_CURRENT_USER_DIRECTORY_VERIFIED'`;
  const out=execFileSync(pwsh,['-NoProfile','-NonInteractive','-CommandWithArgs',script,directory],{encoding:'utf8',windowsHide:true,timeout:10000});
  if(out.trim()!=='PRIVATE_CURRENT_USER_DIRECTORY_VERIFIED')throw Error('D_PRIVATE_ACL_UNPROVEN');
}

function supplierHandoff({input,supplierConfirmation,directory}) {
  const c=supplierConfirmation;
  if(!uuid(input?.nonce)||!timestamp(input.deadlineUtc)||!path.isAbsolute(directory)
    ||!c||!timestamp(c.deadlineUtc)||Date.parse(c.deadlineUtc)<=Date.now()
    ||Date.parse(c.deadlineUtc)-Date.now()>600000||Date.parse(c.deadlineUtc)<Date.parse(input.deadlineUtc)
    ||c.path!==path.join(directory,'supplier-confirmation.'+input.nonce+'.safe.json'))
    throw Error('D_SUPPLIER_HANDOFF_NOT_ADMITTED');
  return c;
}

export function assertDSupplierDeadline(supplier,deadlineUtc) {
  if(!timestamp(supplier?.expiresUtc)||!timestamp(deadlineUtc)||Date.parse(supplier.expiresUtc)<Date.parse(deadlineUtc))
    throw Error('D_SUPPLIER_LIFETIME_UNPROVEN');
}

export function resolveDInputContextDeadline(plan,adoption,{now=Date.now}={}) {
  const proposed=adoption.additionalContextReadsProposed??{};
  if(Object.hasOwn(proposed,'originalContextDeadlineUtc'))return proposed.originalContextDeadlineUtc;
  const fail=()=>{throw Error('D_ORIGINAL_RECOVERY_WINDOW_EXPIRED');};
  if(proposed.newIndependentQuota!==true||proposed.windowMinutes!==60||proposed.LockGET!==1
    ||proposed.BucketPropertiesGET!==1||proposed.perCallMaxMs!==30000||proposed.retries!==0
    ||!digest(plan.sourceAdoption?.sha256)||!uuid(plan.inputCoordination?.nonce)
    ||plan.contextActivation?.path!==path.join(plan.directory,'CONTEXT_WINDOW.'+plan.sourceAdoption.sha256+'.safe.json'))fail();
  const activation=JSON.parse(readBound(plan.contextActivation,4096));
  const gates=JSON.parse(readBound(plan.runtimeAdmission));
  const readyRef=activation.ownerPreparationRef;
  if(activation.kind!=='ACTUAL_READINESS_CONTEXT_WINDOW_NOT_D_WINDOW'
    ||activation.sourceAdoptionSha256!==plan.sourceAdoption.sha256||activation.runId!==plan.runId
    ||activation.account!==account||activation.bucket!==bucket
    ||readyRef?.path!==path.join(plan.directory,'OWNER_ENTER.'+plan.inputCoordination.nonce+'.safe.json')
    ||readyRef.path!==gates.ownerPreparationRef?.path||readyRef.sha256!==gates.ownerPreparationRef.sha256
    ||!timestamp(activation.activatedUtc)||!timestamp(activation.deadlineUtc)
    ||Date.parse(activation.deadlineUtc)!==Date.parse(activation.activatedUtc)+3600000
    ||Date.parse(activation.activatedUtc)>now()||Date.parse(activation.deadlineUtc)<=now())fail();
  const ready=JSON.parse(readBound(readyRef,4096));
  if(ready.binding!==plan.sourceAdoption.sha256||ready.nonce!==plan.inputCoordination.nonce
    ||ready.currentPreparationConfirmed!==true||ready.tokenNotYetCreated!==true||!timestamp(ready.recordedUtc)
    ||Date.parse(ready.recordedUtc)>Date.parse(activation.activatedUtc)
    ||Date.parse(activation.activatedUtc)-Date.parse(ready.recordedUtc)>600000)fail();
  return activation.deadlineUtc;
}

// Credentials stay in this native process while the trusted owner-result importer
// publishes a non-secret, hash-bound confirmation. No D window exists yet.
export async function receiveDConfirmedHeadCredentials({input,supplierConfirmation,directory,runId,
  bindingSha256,tokenLabel,offlineFixture=false,onReceived=()=>{},assertAdmissionActive=()=>{}}) {
  const c=supplierHandoff({input,supplierConfirmation,directory});
  if(!uuid(runId)||!digest(bindingSha256)||typeof tokenLabel!=='string'||!tokenLabel.length
    ||fs.existsSync(c.path))throw Error('D_SUPPLIER_HANDOFF_NOT_ADMITTED');
  let credentials,returned=false,admissionStopped=false;
  const aborter=new AbortController();
  const checkAdmission=()=>{try{assertAdmissionActive();}catch{admissionStopped=true;throw Error('D_INPUT_COORDINATOR_STOPPED');}};
  const watch=setInterval(()=>{try{checkAdmission();}catch{aborter.abort();}},50);
  try {
    checkAdmission();
    credentials=await receiveDHeadCredentials({bindingSha256,nonce:input.nonce,deadlineUtc:input.deadlineUtc,offlineFixture,signal:aborter.signal});
    checkAdmission();
    if(credentials.sessionToken!==undefined)throw Error('D_ORDINARY_TOKEN_THIRD_FIELD_FORBIDDEN');
    const receivedUtc=new Date().toISOString();
    onReceived({event:'OWNER_SUPPLIER_CONFIRMATION_REQUIRED',runId,nonce:input.nonce,
      confirmationPath:c.path,deadlineUtc:c.deadlineUtc,receivedUtc,productionRequests:0});
    while(Date.now()<Date.parse(c.deadlineUtc)) {
      checkAdmission();
      try {
        const stat=fs.lstatSync(c.path);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw Error('D_SUPPLIER_CONFIRMATION_INVALID');
        const confirmation=JSON.parse(readBound({path:c.path,sha256:pin(c.path)},4096));
        if(confirmation.schemaVersion!==1||confirmation.runId!==runId||confirmation.nonce!==input.nonce
          ||confirmation.sourceAdoptionSha256!==bindingSha256||confirmation.tokenLabel!==tokenLabel
          ||confirmation.provenance!=='OWNER_OFFICIAL_DASHBOARD'||confirmation.ownerConfirmed!==true
          ||!timestamp(confirmation.confirmedUtc)||Date.parse(confirmation.confirmedUtc)<Date.parse(receivedUtc)
          ||Date.parse(confirmation.confirmedUtc)>Date.now()||Date.parse(confirmation.confirmedUtc)>=Date.parse(c.deadlineUtc)
          ||confirmation.supplierEvidence?.path!==path.join(directory,'supplier-evidence.'+input.nonce+'.safe.json'))
          throw Error('D_SUPPLIER_CONFIRMATION_INVALID');
        const supplier=JSON.parse(readBound(confirmation.supplierEvidence,4096)),start=Date.now();
        if(supplier.account!==account||supplier.bucket!==bucket||supplier.tokenLabel!==tokenLabel
          ||supplier.permission!=='object-read-only'||supplier.ttlHours!==24||supplier.createdAfterVisiblePrompt!==true
          ||!timestamp(supplier.issuedUtc)||!timestamp(supplier.expiresUtc)||Date.parse(supplier.issuedUtc)>start
          ||Date.parse(supplier.expiresUtc)<start+10800000||Date.parse(supplier.expiresUtc)-Date.parse(supplier.issuedUtc)>86400000
          ||start>=Date.parse(c.deadlineUtc))throw Error('D_SUPPLIER_LIFETIME_UNPROVEN');
        returned=true;
        return {credentials,supplier,supplierEvidence:confirmation.supplierEvidence};
      }catch(error){if(error.code!=='ENOENT')throw error;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw Error('D_SUPPLIER_CONFIRMATION_EXPIRED');
  }catch(error){if(admissionStopped)throw Error('D_INPUT_COORDINATOR_STOPPED');throw error;}
  finally{
    clearInterval(watch);
    if(!returned)for(const key of Object.keys(credentials??{}))credentials[key]='';
  }
}
export function validateDPlan(plan,{inspect=false,resume=false}={}) {
  if(plan?.schemaVersion!==1||plan.account!==account||plan.bucket!==bucket||plan.project!==project
    ||!uuid(plan.runId)||!digest(plan.connectionBindingSha256)||!path.isAbsolute(plan.directory)
    ||!path.isAbsolute(plan.downloadsDirectory))throw Error('D_FIXED_SCOPE_REQUIRED');
  const adoptionText=readBound(plan.sourceAdoption),adoption=JSON.parse(adoptionText);
  const approval=JSON.parse(readBound(plan.ownerApproval));
  const parentApproval=JSON.parse(readBound(plan.parentOwnerApproval));
  if(parentApproval.bindingSha256!==parentRecovery||parentApproval.ownerFields?.CREDENTIAL_FINAL_RECOVERY_GO!==
    'APPROVED_FOR_EXACT_18159664_ADOPTION_ONE_EXTRA_24H_TOKEN_AND_CONDITIONAL_REMAINING_SCOPES_ONLY'
    ||parentApproval.ownerFields.CURRENT_OWNER_CONDITIONS_AND_OFFICIAL_TOKEN_REVOKE_CAPABILITY_CONFIRMED!==true)
    throw Error('D_SIGNED_PARENT_APPROVAL_REQUIRED');
  if(adoption.kind!=='D_EXECUTION_ENTRYPOINT_SOURCE_ADOPTION_V1'||adoption.parentRecoverySha256!==parentRecovery
    ||adoption.runId!==plan.runId||path.resolve(adoption.executionDirectory??'')!==path.resolve(plan.directory)
    ||approval.adoptionSha256!==plan.sourceAdoption.sha256
    ||approval.statement!=='D_EXECUTION_ENTRYPOINT_ADOPTION_GO=APPROVED_FOR_EXACT_SOURCE_AND_UNCONSUMED_D_ONLY'
    ||approval.feeRiskUnchanged!==true||approval.oldDebitsPreserved!==true
    ||adoption.headCap!==6||adoption.actorCap!==1||adoption.uploadCap!==1
    ||adoption.dMinutes!==180||adoption.businessStopMinutes!==135
    ||approval.entrypointMethodAccepted!==true||approval.oldDebitsPreserved!==true)throw Error('D_NEW_SOURCE_ADOPTION_REQUIRED');
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  if(head!==adoption.sourceCommit||!/^[a-f0-9]{40}$/.test(head))throw Error('D_SOURCE_COMMIT_MISMATCH');
  const required=['d-execution-entrypoint.mjs','d-execution-runtime.mjs','d-execution-journal.mjs','d-execution-carriers.mjs',
    'd-protected-actor-child.mjs','d-protected-actor-carrier.mjs','d-production-bindings.mjs','d-r2-head-verification.mjs',
    'legacy-tmp-lifecycle-safety.mjs','capture-d-r2-head-credentials.ps1','d-private-fixture-display.ps1',
    'd-input-coordination.mjs','d-local-input-receipt.ps1'];
  if(plan.legacyHeadPlan||adoption.legacyHeadExecution) {
    if(!plan.legacyHeadPlan||!adoption.legacyHeadExecution)throw Error('D_LEGACY_SCOPE_NOT_BOUND');
    required.push('legacy-r2-head-host.mjs','legacy-r2-head-verification.mjs','production-dispatch-guard.mjs');
  }
  for(const relative of Object.keys(adoption.sourceHashes??{}))if(!/^scripts\/qa\/[a-zA-Z0-9._-]+$/.test(relative))throw Error('D_SOURCE_PIN_PATH_INVALID');
  for(const name of required) {
    const relative='scripts/qa/'+name;
    if(!digest(adoption.sourceHashes?.[relative])||pin(path.join(root,relative))!==adoption.sourceHashes[relative])throw Error('D_RUNTIME_SOURCE_CHANGED');
  }
  if(!Array.isArray(plan.inheritedFiles)||!plan.inheritedFiles.some(r=>r.sha256===parentRecovery)
    ||!plan.inheritedFiles.some(r=>r.sha256===credentialException))throw Error('D_PARENT_BINDINGS_MISSING');
  for(const r of plan.inheritedFiles)readBound(r);
  const review=JSON.parse(readBound(plan.independentReview));
  if(review.status!=='PASS'||review.sourceAdoptionSha256!==plan.sourceAdoption.sha256||review.nonAuthor!==true
    ||!Array.isArray(review.reviewers)||!review.reviewers.length)throw Error('D_INDEPENDENT_REVIEW_REQUIRED');
  if(plan.targets?.sha256!=='a3bae172c823ec9d78f643e4f7c29a5b61a8c6ca1ae4ae9566c08cc4ffed6ab1')throw Error('D_ORIGINAL_TARGETS_REQUIRED');
  const targets=JSON.parse(readBound(plan.targets)),t=targets.videoFixture;
  if(!t||t.ordinaryActorMaximum!==1||t.videoBytes!==2018
    ||t.videoSha256!=='8c505e7279773c9b2647b3b47611f4cb71d7d83ecbb48e68fcbc5af818f348e0'
    ||pin(t.videoFile)!==t.videoSha256||fs.statSync(t.videoFile).size!==2018||!uuid(t.existingCircleId))throw Error('D_FIXTURE_PIN_INVALID');
  const gates=JSON.parse(readBound(plan.runtimeAdmission));
  if(gates.kind!=='D_RUNTIME_ADMISSION_NOT_AUTHORIZATION'||gates.runId!==plan.runId
    ||gates.sourceAdoptionSha256!==plan.sourceAdoption.sha256||!timestamp(gates.ownerReadyUtc)||!resume&&Date.now()-Date.parse(gates.ownerReadyUtc)>600000
    ||Date.parse(gates.ownerReadyUtc)>Date.now()
    ||!['ownerReady','ordinaryEdgeIsolated','moderatorUnchanged','aliasUnused','legalPathReady','fallbackNotAdmittedStopIfUsed',
      'freePlansUnchanged','noPaidFallback','dOnlyFeeRiskAccepted','mcpDeletePermissionBound','adminPermissionBound',
      'revocationAvailable','destructiveJobsPaused'].every(k=>gates[k]===true))throw Error('D_RUNTIME_GATES_NOT_ADMITTED');
  // These are admitted predecessor receipts, not newly fabricated live tests.
  const mod=JSON.parse(readBound(plan.moderatorEvidence)),bc=JSON.parse(readBound(plan.bucketEvidence));
  if(mod.moderator!==true||mod.verifiedFactors!==2||mod.serverAal!=='aal2'||mod.auth!==1||mod.worker!==2
    ||!Number.isFinite(Date.parse(mod.acceptedUtc)))throw Error('D_MODERATOR_PREDECESSOR_UNPROVEN');
  if(bc.account!==account||bc.bucket!==bucket||bc.jurisdiction!=='default'||bc.storageClass!=='Standard'
    ||bc.httpStatus!==200||bc.complete!==true||!timestamp(bc.acceptedUtc)||!resume&&Date.now()-Date.parse(bc.acceptedUtc)>3600000
    ||Date.parse(bc.acceptedUtc)>Date.now())throw Error('D_STANDARD_CONTEXT_STALE');
  const cors=JSON.parse(readBound(plan.corsEvidence));
  if(cors.configVerified!==true||cors.executionAudit!=='NOT_PASS'||cors.productionOrigin!=='https://openglasshub.ogh.workers.dev'
    ||cors.putAllowed!==true||cors.etagExposed!==true)throw Error('D_CORS_EVIDENCE_NOT_ADMITTED');
  for(const r of gates.permissionEvidence??[])readBound(r);
  if(!Array.isArray(gates.permissionEvidence)||gates.permissionEvidence.length<2)throw Error('D_PERMISSION_PROVENANCE_MISSING');
  const videoTemplate=readBound(plan.videoTemplate);
  if(plan.videoTemplate.sha256!=='3fbdf6a10b2a6753c40dfde10b46febdf0b0047ab198f29ca6593fa37d207518')throw Error('D_VIDEO_READER_CHANGED');
  if(!uuid(plan.moderatorId)||!digest(plan.frozenArtifactSha256)||!digest(plan.observerSourceSha256))throw Error('D_CONTEXT_PINS_MISSING');
  if(Object.keys(D_LIMITS).some(k=>plan.remainingCaps?.[k]!==D_LIMITS[k]))throw Error('D_OLD_DEBITS_MUST_BE_PRESERVED');
  return {adoption,t,gates,videoTemplate,mod,bc,inspect};
}

export function wrapDownload(code,params) {
  return `void (async()=>{const r=await (${code})();const out={...r,binding:${JSON.stringify(params.executionBindingSha256)},requestId:${JSON.stringify(params.requestId)}};
    const u=URL.createObjectURL(new Blob([JSON.stringify(out)],{type:'application/json'}));const a=document.createElement('a');
    a.href=u;a.download=${JSON.stringify('ogh-'+params.requestId+'.json')};document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);})();`;
}

export function claimDExecution({claimDirectory,plan,resume=false}) {
  if(!path.isAbsolute(claimDirectory)||!fs.statSync(claimDirectory).isDirectory()||!digest(plan.sourceAdoption?.sha256)
    ||!uuid(plan.runId)||!path.isAbsolute(plan.directory))throw Error('D_CLAIM_INVALID');
  const file=path.join(claimDirectory,'D_EXECUTION_SOURCE_ADOPTION.'+plan.sourceAdoption.sha256+'.used.json');
  const binding={authorizationSha256:plan.sourceAdoption.sha256,runId:plan.runId,directory:path.resolve(plan.directory)};
  if(resume){const old=JSON.parse(fs.readFileSync(file,'utf8'));
    if(JSON.stringify(old.binding)!==JSON.stringify(binding))throw Error('D_RECOVERY_CLAIM_MISMATCH');
  }else{
    if(fs.readdirSync(plan.directory).some(n=>/^d-receipt-/.test(n)))throw Error('D_ALREADY_STARTED_BEFORE_INPUT');
    sealDRecord(file,{kind:'SINGLE_USE_AUTHORIZATION_RESERVATION_BEFORE_PRIVATE_INPUT',binding,recordedUtc:new Date().toISOString()});
  }
  return file;
}
export function sealDRevocationDutyBeforeInput(plan) {
  try {
    if(!path.isAbsolute(plan.directory)||!uuid(plan.runId)||!digest(plan.sourceAdoption?.sha256)
      ||typeof plan.tokenLabel!=='string'||!/^[A-Za-z0-9_-]{1,96}$/.test(plan.tokenLabel))throw Error();
    // Superseded pre-business attempts share this directory. Never overwrite or
    // reuse their duty record; bind the new append-only record to its approval.
    const file=path.join(plan.directory,'TOKEN_REVOCATION_DUTY.before-input.'+plan.sourceAdoption.sha256+'.safe.json');
    sealDRecord(file,{kind:'TOKEN_REVOCATION_DUTY_BEFORE_PRIVATE_INPUT',runId:plan.runId,
      authorizationSha256:plan.sourceAdoption.sha256,tokenLabel:plan.tokenLabel,account,bucket,
      status:'REQUIRES_OWNER_OFFICIAL_REVOCATION_ON_STOP',notObjectCleanup:true});
    return file;
  }catch{throw Error('D_REVOCATION_DUTY_UNPROVEN');}
}
export function identityCode(p,t) {
  const existing = p.actorMode === 'OWNER_EXISTING';
  return `async()=>{
    const p=${JSON.stringify(p)},t=${JSON.stringify({alias:t.controlledAlias,circleId:t.existingCircleId,circleSlug:t.existingCircleSlug,namespace:t.namespace})};
    if(window.top!==window||location.origin!=='https://openglasshub.ogh.workers.dev'||location.search||location.hash||Date.now()>=Date.parse(p.deadlineUtc))throw Error();
    const c=(await import('/_astro/supabase-browser.CbJzQpCJ.js')).n();
    const raw=await c.auth.storage.getItem('sb-xcbnxzjlsvtgzixurcof-auth-token');const s=JSON.parse(raw??'null');
    ${existing ? "if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s?.user?.id??'')||!s?.user?.email||p.actorId&&p.actorId!==s.user.id)throw Error();p.actorId=s.user.id;" : ''}
    if(s?.user?.id!==p.actorId||!Number.isFinite(s.expires_at)||s.expires_at*1000<Date.now()+300000)throw Error();
    const headers={authorization:'Bearer '+s.access_token,apikey:c.supabaseKey};
    const get=async(url)=>{const r=await fetch(url,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(r.status!==200||r.redirected)throw Error();const reader=r.body.getReader(),chunks=[];let size=0;
      try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>65536)throw Error();chunks.push(x.value);}}
      finally{void reader.cancel().catch(()=>{});}const b=new Uint8Array(size);let o=0;for(const x of chunks){b.set(x,o);o+=x.length;}return JSON.parse(new TextDecoder().decode(b));};
    const u=await get('https://${project}.supabase.co/auth/v1/user');
    if(u.id!==p.actorId||!u.email_confirmed_at||u.role!=='authenticated')throw Error();
    ${existing
      ? "if(u.email!==s.user.email||!Number.isFinite(Date.parse(u.created_at))||u.app_metadata?.role!==undefined&&u.app_metadata.role!=='user'||u.banned_until&&Date.parse(u.banned_until)>Date.now())throw Error();"
      : "if(u.email!==t.alias||u.user_metadata?.qa_namespace!==t.namespace)throw Error();"}
    const profile=await get('https://${project}.supabase.co/rest/v1/profiles?select=id,role&id=eq.'+p.actorId);
    const circle=await get('https://${project}.supabase.co/rest/v1/circles?select=id,slug,name,status&id=eq.'+t.circleId);
    if(profile.length!==1||profile[0].id!==p.actorId||profile[0].role!=='user'||circle.length!==1
      ||circle[0].id!==t.circleId||circle[0].slug!==t.circleSlug||circle[0].status!=='active'
      ||['rls-test-circle','rls-test','test-circle'].includes(String(circle[0].slug).toLowerCase())
      ||String(circle[0].name).toLowerCase().includes('rls test'))throw Error();
    return {actorId:p.actorId,confirmed:true,role:'user',circleMatches:true,observedUtc:new Date().toISOString()${existing ? ",actorMode:'OWNER_EXISTING',createdByThisRun:false,createdAt:u.created_at" : ''}};
  }`;
}
export function approveCode(p) {
  return `async()=>{const p=${JSON.stringify(p)};
    if(window.top!==window||location.origin!=='https://openglasshub.ogh.workers.dev'||location.search||location.hash
      ||!['/admin/security/','/admin/reports/'].includes(location.pathname)||Date.now()>=Date.parse(p.deadlineUtc))throw Error();
    const c=(await import('/_astro/supabase-browser.CbJzQpCJ.js')).n();const s=JSON.parse(await c.auth.storage.getItem('sb-xcbnxzjlsvtgzixurcof-auth-token')??'null');
    if(s?.user?.id!==p.moderatorId||s.expires_at*1000<Date.now()+300000)throw Error();
    const r=await fetch('/api/admin/moderation/approve',{method:'POST',headers:{authorization:'Bearer '+s.access_token,'content-type':'application/json'},
      body:JSON.stringify({target_type:'post',target_id:p.postId,reason:'Bound D synthetic video acceptance'}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(r.status!==200||r.redirected)throw Error();const text=await r.text();if(text.length>65536)throw Error();const b=JSON.parse(text);
    if(b.ok!==true||b.item?.id!==p.postId||b.item.status!=='published'||b.item.moderation_status!=='published'||b.already_applied===true)throw Error();
    return {postId:p.postId,actorId:p.actorId,status:b.item.status,moderationStatus:b.item.moderation_status};}`;
}

// Called by trusted Codex tool orchestration, not by an owner-uploaded response.
// This registers a LOCAL executable peer; it never probes provider permission.
export async function openDTrustedToolBridge(planFile,{register=false}={}) {
  privateDirectory(path.dirname(planFile));const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
  privateDirectory(plan.directory);const checked=validateDPlan(plan,{resume:true});
  const {createDMcpExecutionBridge}=await import('./d-execution-carriers.mjs');
  const sourcePath=fileURLToPath(import.meta.url),binding={executionBindingSha256:plan.sourceAdoption.sha256,
    authorizationSha256:plan.sourceAdoption.sha256,sourceSha256:pin(sourcePath),nonce:plan.runId,
    runId:plan.runId,sourceCommit:checked.adoption.sourceCommit,connectionBindingSha256:plan.connectionBindingSha256};
  const bridge=createDMcpExecutionBridge({directory:plan.directory,binding,sourcePath,
    verifyPrivateDirectory:directory=>{privateDirectory(directory);return true;}});
  if(register)bridge.registerPeer({runId:plan.runId,authorizationSha256:plan.sourceAdoption.sha256,
    sourceCommit:checked.adoption.sourceCommit,connectionBindingSha256:plan.connectionBindingSha256,
    toolName:'mcp__cloudflare__execute'});
  return bridge;
}

// Run the metadata poller through the same source/approval-bound native entrypoint,
// not a separate untracked REPL timer. This mode cannot create a D window or call providers.
export async function coordinateDPrivateInput(planFile) {
  privateDirectory(path.dirname(planFile));
  const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
  privateDirectory(plan.directory);
  const checked=validateDPlan(plan,{resume:true}),input=plan.inputCoordination;
  const expectedEnd=resolveDInputContextDeadline(plan,checked.adoption);
  if(!uuid(input?.nonce)||input.deadlineUtc!==expectedEnd||!timestamp(expectedEnd)
    ||Date.now()>=Date.parse(expectedEnd)||Date.parse(expectedEnd)-Date.now()>3600000)
    throw Error('D_ORIGINAL_RECOVERY_WINDOW_EXPIRED');
  const {superviseDInputCoordinator}=await import('./d-input-coordination.mjs');
  return superviseDInputCoordinator({directory:plan.directory,nonce:input.nonce,
    binding:plan.sourceAdoption.sha256,runId:plan.runId,tokenLabel:plan.tokenLabel,deadlineUtc:expectedEnd,
    verifyPrivateDirectory:directory=>{privateDirectory(directory);return true;}},{launchNative:nativePlan=>{
      if(pin(process.execPath)!=='58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f')
        throw Error('D_PRIVATE_HOST_UNPROVEN');
      validateDPlan(JSON.parse(fs.readFileSync(nativePlan,'utf8')));
      return spawn(process.execPath,[fileURLToPath(new URL('./d-execution-entrypoint.mjs',import.meta.url)),
        '--execute-production','--plan',nativePlan],{cwd:root,windowsHide:true,
        env:dNativeProcessEnvironment(),
        stdio:['ignore','ignore','ignore']});
    }});
}

function assertDLegacyHeadReferences(plan) {
  const h=plan.legacyHeadPlan;
  if(h?.sourceAdoption?.sha256!==plan.sourceAdoption.sha256||h.ownerApproval?.sha256!==plan.ownerApproval.sha256
    ||h.targets?.sha256!==plan.targets.sha256||h.bucketEvidence?.sha256!==plan.bucketEvidence.sha256
    ||h.connectionBindingSha256!==plan.connectionBindingSha256)throw Error('D_LEGACY_SCOPE_NOT_BOUND');
}

export async function loadDProductionRuntime(planFile,{inspect=false,resume=false}={}) {
  privateDirectory(path.dirname(planFile));const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
  privateDirectory(plan.directory);const checked=validateDPlan(plan,{inspect,resume});
  const inputContextEnd=resume?null:resolveDInputContextDeadline(plan,checked.adoption);
  if(!resume&&(!timestamp(inputContextEnd)||Date.now()>=Date.parse(inputContextEnd)
    ||Date.parse(inputContextEnd)-Date.now()>3600000))throw Error('D_ORIGINAL_RECOVERY_WINDOW_EXPIRED');
  let legacyPreflight={status:'NOT_REQUESTED'};
  if(plan.legacyHeadPlan&&!resume) {
    try {
      assertDLegacyHeadReferences(plan);
      const {runLegacyR2HeadHost}=await import('./legacy-r2-head-host.mjs');
      legacyPreflight=await runLegacyR2HeadHost({plan:plan.legacyHeadPlan,inspect:true,
        verifyPrivateDirectory:directory=>{privateDirectory(directory);return true;},assertAdmissionActive:()=>true});
    }catch{legacyPreflight={status:'BLOCKED',productionPass:false,reason:'LEGACY_NONCREDENTIAL_BINDINGS_UNPROVEN'};}
  }
  const {createDManualExecutionCarrier,createDMcpExecutionBridge}=await import('./d-execution-carriers.mjs');
  const {createProtectedActorCarrier}=await import('./d-protected-actor-carrier.mjs');
  const sourcePath=fileURLToPath(import.meta.url),sourceSha256=pin(sourcePath);
  const carrierBinding={executionBindingSha256:plan.sourceAdoption.sha256,authorizationSha256:plan.sourceAdoption.sha256,
    nonce:plan.runId,runId:plan.runId,sourceCommit:checked.adoption.sourceCommit,sourceSha256,
    connectionBindingSha256:plan.connectionBindingSha256};
  const verifyPrivateDirectory=directory=>{privateDirectory(directory);return true;};
  const manual=createDManualExecutionCarrier({directory:plan.directory,downloadsDirectory:plan.downloadsDirectory,
    binding:carrierBinding,sourcePath,verifyPrivateDirectory,
    preparedContext:{origin:'https://openglasshub.ogh.workers.dev',pathname:'/login/',ownerPrepared:checked.gates.ordinaryEdgeIsolated},
    onReady:job=>process.stdout.write(JSON.stringify({event:'OWNER_CHECKPOINT_REQUIRED',requestId:job.requestId,
      instructionsFile:job.requestFile??job.manifestPath})+'\n')});
  const bridge=createDMcpExecutionBridge({directory:plan.directory,binding:carrierBinding,sourcePath,verifyPrivateDirectory,
    plan:code=>({requestId:'d-source-delete-'+plan.sourceAdoption.sha256.slice(0,12),codeSha256:dHash(code),
      deadlineUtc:new Date(Date.now()+10000).toISOString()}),
    onReady:job=>process.stdout.write(JSON.stringify({event:'CODEX_MCP_TOOL_CALL_REQUIRED',requestId:job.requestId,requestPath:job.requestPath})+'\n')});
  if(!manual.ready().ready||!bridge.ready().ready)throw Error('D_ACTUAL_LOCAL_CARRIERS_NOT_BOUND');
  if(inspect)return {status:'NONCREDENTIAL_CARRIERS_BOUND_RUNTIME_ASSERTIONS_REMAIN',productionAuthority:false,legacyPreflight};
  if(!resume)supplierHandoff({input:plan.credentialInput,supplierConfirmation:plan.supplierConfirmation,directory:plan.directory});
  const claimDirectory=path.join(os.homedir(),'AppData/Local/OpenGlassHub/mailbox-e9f2a410-6cc1-4197-a5f3-256e9c157302/emergency-media-protection-v1/final-production-closure-v1');
  privateDirectory(claimDirectory);claimDExecution({claimDirectory,plan,resume});
  let credentials=null,supplier=null,supplierEvidence=null,binding,inputCoordination=null,localPhase='REVOCATION_DUTY';
  try{
  if(!resume)sealDRevocationDutyBeforeInput(plan);
  localPhase='RECOVERY_BINDING';
  if(resume){
    const startFile=path.join(plan.directory,'d-receipt-000001.json'),first=JSON.parse(fs.readFileSync(startFile,'utf8'));
    binding=first.fixed?.binding;
    if(binding?.authorizationSha256!==plan.sourceAdoption.sha256||binding.runId!==plan.runId
      ||binding.sourceCommit!==checked.adoption.sourceCommit||Date.now()>=Date.parse(binding.deadlineUtc))throw Error('D_ORIGINAL_RECOVERY_WINDOW_EXPIRED');
  }else{
  const {assertDInputAdmissionActive,publishDInputRecord}=await import('./d-input-coordination.mjs');
  if(plan.inputCoordination?.nonce!==plan.credentialInput?.nonce||plan.inputCoordination?.deadlineUtc!==inputContextEnd)
    throw Error('D_INPUT_COORDINATOR_STOPPED');
  inputCoordination={directory:plan.directory,nonce:plan.credentialInput.nonce,binding:plan.sourceAdoption.sha256,
    runId:plan.runId,deadlineUtc:inputContextEnd};
  assertDInputAdmissionActive(inputCoordination);
  localPhase='PRIVATE_READY';
  const input=plan.credentialInput,ready=JSON.parse(readBound(input.readyRecord,4096));
  if(ready.status!=='LOCAL_CURRENT_USER_PIPE_READY'||ready.binding!==plan.sourceAdoption.sha256||ready.nonce!==input.nonce
    ||ready.pid!==input.expectedPid||!timestamp(input.deadlineUtc)||Date.now()>=Date.parse(input.deadlineUtc))throw Error('D_PRIVATE_INPUT_NOT_READY');
  localPhase='PRIVATE_HOST';
  verifyDPrivateInputHost(input.expectedPid);
  localPhase='PRIVATE_RECEIVE';
  ({credentials,supplier,supplierEvidence}=await receiveDConfirmedHeadCredentials({input,supplierConfirmation:plan.supplierConfirmation,
    directory:plan.directory,runId:plan.runId,bindingSha256:plan.sourceAdoption.sha256,tokenLabel:plan.tokenLabel,
    onReceived:event=>{
      localPhase='SUPPLIER_CONFIRMATION';
      publishDInputRecord(path.join(plan.directory,'INPUT_RECEIVED.'+input.nonce+'.safe.json'),{
        kind:'NATIVE_PRIVATE_INPUT_RECEIVED_NOT_ADMITTED',binding:plan.sourceAdoption.sha256,
        nonce:input.nonce,runId:plan.runId,tokenLabel:plan.tokenLabel,receivedUtc:event.receivedUtc,
        confirmationPath:event.confirmationPath,confirmationDeadlineUtc:event.deadlineUtc,productionRequests:0});
      process.stdout.write(JSON.stringify(event)+'\n');
    },
    assertAdmissionActive:()=>assertDInputAdmissionActive(inputCoordination)}));
  while(!assertDInputAdmissionActive(inputCoordination)) {
    if(Date.now()>=Date.parse(plan.supplierConfirmation.deadlineUtc))throw Error('D_INPUT_COORDINATOR_STOPPED');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(plan.legacyHeadPlan&&legacyPreflight.status==='NONCREDENTIAL_LEGACY_BINDINGS_READY') {
    // Shared signer remains private to this process. H owns a cloned signer and
    // separate durable HEAD2 ledger; an H observation is never D or durable-H PASS.
    const legacyPlan=structuredClone(plan.legacyHeadPlan);
    let legacyResult;
    try {
      assertDLegacyHeadReferences(plan);
      const start=Date.now();
      legacyPlan.notBeforeUtc=new Date(start).toISOString();
      legacyPlan.deadlineUtc=new Date(Math.min(start+3600000,Date.parse(inputCoordination.deadlineUtc),
        Date.parse(supplier.expiresUtc),Date.parse('2026-11-04T12:00:00Z'))).toISOString();
      const {runLegacyR2HeadHost}=await import('./legacy-r2-head-host.mjs');
      legacyResult=await runLegacyR2HeadHost({plan:legacyPlan,credentials,supplier,supplierEvidence,
        verifyPrivateDirectory:directory=>{privateDirectory(directory);return true;},
        assertAdmissionActive:()=>assertDInputAdmissionActive(inputCoordination)});
    }catch{legacyResult={status:'BLOCKED',productionPass:false,reason:'LEGACY_SCOPE_OR_EXECUTION_NOT_PROVEN'};}
    publishDInputRecord(path.join(plan.directory,'LEGACY_RUNTIME_OUTCOME.'+plan.sourceAdoption.sha256+'.safe.json'),legacyResult);
    assertDInputAdmissionActive(inputCoordination);
  }
  localPhase='FINAL_ADMISSION';
  validateDPlan(plan);
  if(!manual.ready().ready||!bridge.ready().ready)throw Error('D_ACTUAL_LOCAL_CARRIERS_NOT_BOUND');
  const start=Date.now(),deadlineUtc=new Date(start+10800000).toISOString();
  assertDSupplierDeadline(supplier,deadlineUtc);
  binding={authorizationSha256:plan.sourceAdoption.sha256,executionBindingSha256:plan.sourceAdoption.sha256,
    sourceCommit:checked.adoption.sourceCommit,runId:plan.runId,notBeforeUtc:new Date(start).toISOString(),deadlineUtc,
    businessStopUtc:new Date(start+8100000).toISOString(),connectionBindingSha256:plan.connectionBindingSha256,
    moderatorId:plan.moderatorId,moderatorContextReceiptSha256:plan.moderatorEvidence.sha256,
    frozenArtifactSha256:plan.frozenArtifactSha256,observerSourceSha256:plan.observerSourceSha256};
  }
  localPhase='PORTS_BINDING';
  if(!resume) {
    const {publishDInputAdmission}=await import('./d-input-coordination.mjs');
    publishDInputAdmission({...inputCoordination,entryDeadlineUtc:inputCoordination.deadlineUtc,
      admittedUtc:binding.notBeforeUtc,deadlineUtc:binding.deadlineUtc,businessStopUtc:binding.businessStopUtc});
  }
  const deadlineUtc=binding.deadlineUtc;
  const journal=openDJournal({directory:plan.directory,binding,resume,admit:()=>Object.entries(checked.adoption.sourceHashes)
    .every(([relative,sha])=>pin(path.join(root,relative))===sha)});
  const beforeDispatch=async phase=>journal.reserve({id:phase,cost:{Auth:1},cleanup:phase.startsWith('ACTOR_')&&phase!=='ACTOR_CREATE'&&phase!=='ACTOR_INITIAL_READ',request:{phase}});
  const afterResponse=async(phase,evidence)=>{journal.acknowledge(phase,evidence,r=>r?.matched===true&&r.status===200);return true;};
  const actor=createProtectedActorCarrier({beforeDispatch,afterResponse});
  const containment=createProtectedActorCarrier({beforeDispatch,afterResponse});
  let snapshotCount=0;
  const params=(ctx,phase)=>({...ctx,phase,requestId:'d-'+phase.toLowerCase()+'-'+plan.runId,
    deadlineUtc:new Date(Math.min(Date.now()+120000,Date.parse(deadlineUtc))).toISOString()});
  const runManual=async(code,p,validate,resultName,signal)=>manual.run({code,requestId:p.requestId,deadlineUtc:p.deadlineUtc,signal,
    validate:r=>r?.binding===binding.executionBindingSha256&&r.requestId===p.requestId&&validate(r),resultName});
  const video=async(p,signal)=>{
    const rp=params(binding,'VIDEO_'+p.stage.replaceAll('-','_')),v={binding:binding.executionBindingSha256,executionId:plan.runId,
      nonce:plan.runId,mediaId:p.mediaId,stage:p.stage,firstObservedUtc:p.firstObservedUtc,expectedSha256:checked.t.videoSha256,deadlineUtc:rp.deadlineUtc};
    const code=`async()=>{${checked.videoTemplate};return readFinalSyntheticVideo(${JSON.stringify(v)});}`;
    return runManual(wrapDownload(code,rp),rp,r=>r.stage===p.stage&&r.status.startsWith('PASS_'),undefined,signal);
  };
  const ports={production:true,targets:checked.t,
    async prepare(){validateDPlan(plan);journal.record('RUNTIME_ADMISSION',{planSha256:pin(planFile),sourceAdoptionSha256:plan.sourceAdoption.sha256,
      nativeR2Reservation:30,storageFallback:'NOT_ADMITTED_STOP_IF_TRIGGERED'});},
    async createActor(){return actor.create({executionBindingSha256:binding.executionBindingSha256,
      controlledAlias:checked.t.controlledAlias,namespace:checked.t.namespace,deadlineUtc,
      privateDirectory:plan.directory,displayReady:true,
      displaySourceSha256:checked.adoption.sourceHashes['scripts/qa/d-private-fixture-display.ps1']});},
    knownCreatedActor(){const raw=journal.cached('ACTOR_CREATE')?.actorCreation;if(!raw)return null;const c=JSON.parse(raw);
      return {actorId:c.actorId,email:checked.t.controlledAlias,createdAt:c.createdUtc,actorCreationRaw:raw};},
    async identity(ctx,signal){const p=params(ctx,'ORDINARY_IDENTITY');
      const r=await runManual(wrapDownload(identityCode(p,checked.t),p),p,r=>r.actorId===ctx.actorId&&r.role==='user',undefined,signal);
      const owner=readDLocalOwnerRecord(plan.directory,'ordinary-login-'+plan.runId+'.safe.json');
      if(owner.runId!==plan.runId||owner.actorId!==ctx.actorId||owner.normalPasswordLoginOnce!==true||owner.legalConsentReady!==true)throw Error('D_NORMAL_LOGIN_NOT_PROVEN');
      return {...r,normalLoginConfirmed:true,legalReady:true};},
    async upload(ctx,signal){const p={executionBindingSha256:ctx.executionBindingSha256,actorId:ctx.actorId,
      verifiedContextReceiptSha256:ctx.ownerContextReceiptSha256,deadlineUtc:new Date(Math.min(Date.now()+120000,Date.parse(deadlineUtc))).toISOString(),
      title:checked.t.title,body:checked.t.body,circleSlug:checked.t.existingCircleSlug};
      return manual.run({code:`(${buildDObserverCode(p)})();`,requestId:'d-upload-'+plan.runId,deadlineUtc:p.deadlineUtc,signal,
        resultName:'ogh-d-creation-'+ctx.executionBindingSha256.slice(0,16)+'.json',
        validate:r=>r.binding===ctx.executionBindingSha256&&r.actorId===ctx.actorId});},
    async snapshot(ctx,signal){const p=params(ctx,'CREATION_SNAPSHOT');p.requestId+='-'+(++snapshotCount);
      const allowed=Object.fromEntries(['executionBindingSha256','actorId','postId','mediaId','moderatorId','phase','requestId','deadlineUtc'].map(k=>[k,p[k]]));
      allowed.verifiedContextReceiptSha256=ctx.ownerContextReceiptSha256;
      return runManual(`void (${buildDCheckpointCode(allowed)})();`,p,r=>r.post?.id===ctx.postId,undefined,signal);},
    headVerifier({binding:b}) {
      if(!credentials||!supplier)throw Error('D_S3_INPUT_NOT_REPLAYED_DURING_RECOVERY');
      return createDHeadVerifier({binding:{...b,credentialLifetimePolicy:'D_24H_OWNER_EXCEPTION_V1',credentialLifetimeApprovalSha256:credentialException},
        scope:{account,bucket,jurisdiction:'default',permission:'object-read-only',evidenceSha256:supplierEvidence.sha256,
          bucketProvenanceSha256:plan.bucketEvidence.sha256,configurationWindowBindingSha256:b.executionBindingSha256,
          issuedUtc:supplier.issuedUtc,expiresUtc:supplier.expiresUtc,credentialLifetimeApprovalSha256:credentialException},credentials,
        beforeDispatch:async i=>journal.reserve({id:'HEAD_'+i.phase+'_'+(i.key.startsWith('tmp/')?'SOURCE':'RETAINED'),cost:{HEAD:1},
          cleanup:i.phase!=='AFTER_CREATE',request:i}),
        afterResponse:async r=>{journal.acknowledge('HEAD_'+r.source.phase+'_'+(r.source.key.startsWith('tmp/')?'SOURCE':'RETAINED'),r,v=>v.state!=='UNKNOWN');return true;},
        onUnknown:async i=>journal.unknown('HEAD_'+i.phase+'_'+(i.key.startsWith('tmp/')?'SOURCE':'RETAINED'))});
    },
    async approve(ctx,signal){const p=params(ctx,'APPROVE_EXACT_POST');return runManual(wrapDownload(approveCode(p),p),p,r=>r.postId===ctx.postId,undefined,signal);},
    video,
    async checkpoint(code,p,signal,j){const cost=p.phase==='OWNER_DELETE'?{Worker:1}:p.phase==='POST_READBACK'?{REST:2}:{Auth:1};
      if(resume){const cached=j.cached(p.phase);if(cached)return cached;}
      return j.call({id:p.phase,cost,cleanup:true,request:{manual:true,codeSha256:dHash(code)},timeoutMs:p.phase==='ACTOR_LOGOUT'?30000:120000,signal},
        s=>manual.run({code:`void (${code})();`,requestId:p.requestId,deadlineUtc:p.deadlineUtc,signal:s,
          validate:r=>r.binding===binding.executionBindingSha256&&r.requestId===p.requestId&&r.state!=='UNKNOWN'}),r=>r.state!=='UNKNOWN');},
    mcpExecute:(code,options,signal)=>bridge.execute(code,options,signal),
    async prepareMcp(){
      if(bridge.ready().ready)return;
      process.stdout.write(JSON.stringify({event:'CODEX_LOCAL_TOOL_PEER_REFRESH_REQUIRED',runId:plan.runId})+'\n');
      const end=Math.min(Date.now()+110000,Date.parse(deadlineUtc));
      while(Date.now()<end){if(bridge.ready().ready)return;await new Promise(resolve=>setTimeout(resolve,250));}
      throw Error('D_TOOL_PEER_NOT_AVAILABLE_BEFORE_DISPATCH');
    },
    async containActor(args){const r=await containment.contain(args);
      for(const phase of r.consumedPhases??[])if(!journal.cached(phase))journal.unknown(phase);
      return r;},
    async close(){let childReaped=false;
      try{const first=await actor.close?.(),second=await containment.close?.();childReaped=first===true&&second===true;}
      finally{for(const k of Object.keys(credentials??{}))credentials[k]='';credentials=null;}
      journal.record('TOKEN_REVOCATION_DUTY',{status:'OWNER_OFFICIAL_REVOKE_AND_STATUS_CONFIRMATION_REQUIRED',
        tokenLabel:plan.tokenLabel,notObjectCleanup:true});
      process.stdout.write(JSON.stringify({event:'OWNER_TOKEN_REVOCATION_REQUIRED',runId:plan.runId,tokenLabel:plan.tokenLabel})+'\n');
      const file='token-revocation-'+plan.runId+'.safe.json',end=Date.now()+120000;
      while(Date.now()<end){try{const r=readDLocalOwnerRecord(plan.directory,file);
        if(r.runId===plan.runId&&r.tokenLabel===plan.tokenLabel&&r.status==='REVOKED'&&r.officialPageVerified===true){
          journal.record('TOKEN_REVOCATION_VERIFIED',{recordSha256:pin(path.join(plan.directory,file)),provenance:'OWNER_OFFICIAL_DASHBOARD'});
          return {tokenStatus:'REVOKED',childReaped};}
        throw Error('D_REVOCATION_MISMATCH');
      }catch(e){if(e.code!=='ENOENT')return {tokenStatus:'UNKNOWN',childReaped};}
        await new Promise(resolve=>setTimeout(resolve,100));}
      return {tokenStatus:'UNKNOWN',childReaped};}
  };
  livePorts.add(ports);
  return {journal,ports,binding,targets:checked.t,resumeCleanup:resume};
  }catch(error){
    for(const k of Object.keys(credentials??{}))credentials[k]='';credentials=null;
    const failureFile=path.join(plan.directory,'LOADER_STOP.'+randomUUID()+'.safe.json');
    try{sealDRecord(failureFile,{kind:'D_LOADER_STOP_NO_RETRY',runId:plan.runId,
      authorizationSha256:plan.sourceAdoption.sha256,credentialInputMayBeConsumed:!resume,
      ownerMustRevokeExactToken:!resume,tokenLabel:plan.tokenLabel,source:'LOCAL_LOADER_FAILURE_NOT_PROVIDER_RESULT',
      ...dLoaderFailureDetails(localPhase,error)});}catch{}
    if(!resume)process.stdout.write(JSON.stringify({event:'OWNER_TOKEN_REVOCATION_REQUIRED',runId:plan.runId,
      tokenLabel:plan.tokenLabel,reason:'LOADER_STOP_NO_RETRY'})+'\n');
    throw Error('D_RUNTIME_LOADER_STOPPED_NO_RETRY');
  }
}

function readDLocalOwnerRecord(directory,name) {
  const file=path.join(directory,name),s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||s.size>4096)throw Error('D_OWNER_RECORD_INVALID');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
