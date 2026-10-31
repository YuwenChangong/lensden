import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {dHash,sealDRecord,D_LIMITS} from './d-execution-journal.mjs';

// Local metadata only. No credentials, provider clients, dispatch or authority.
export function publishDInputRecord(file,value) {
  const staging=file+'.publishing';
  sealDRecord(staging,value);
  fs.linkSync(staging,file);
  fs.unlinkSync(staging);
}

function readRecord(file,max=262144) {
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('INVALID_FILE');
  const bytes=fs.readFileSync(file);
  let value;
  try{value=JSON.parse(bytes);}catch{throw Error('MALFORMED_JSON');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_RECORD');
  return {value,sha256:dHash(bytes)};
}
const utc=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));

function chooseDecision(directory,nonce,value) {
  const file=path.join(directory,`INPUT_DECISION.${nonce}.safe.json`);
  const staging=file+'.'+randomUUID()+'.publishing';
  sealDRecord(staging,value);
  try {fs.linkSync(staging,file);fs.unlinkSync(staging);return {won:true,value};}
  catch(error){if(error.code!=='EEXIST')throw error;return {won:false,value:readRecord(file,4096).value};}
}
function validDecision(value,{binding,nonce,runId,deadlineUtc}) {
  if(value.kind!=='LOCAL_INPUT_SINGLE_DECISION'||value.binding!==binding||value.nonce!==nonce
    ||value.runId!==runId||value.entryDeadlineUtc!==deadlineUtc||!['STOP','ADMIT'].includes(value.decision))
    throw Error('INVALID_RECORD');
  if(value.decision==='ADMIT'&&(!utc(value.admittedUtc)||Date.parse(value.admittedUtc)>Date.parse(deadlineUtc)
    ||Date.parse(value.admittedUtc)>Date.now()||!utc(value.deadlineUtc)||!utc(value.businessStopUtc)
    ||Date.parse(value.deadlineUtc)!==Date.parse(value.admittedUtc)+10800000
    ||Date.parse(value.businessStopUtc)!==Date.parse(value.admittedUtc)+8100000))throw Error('INVALID_RECORD');
  return value;
}

export function assertDInputAdmissionActive({directory,nonce,binding,runId,deadlineUtc}) {
  const at=name=>path.join(directory,name);
  if(!utc(deadlineUtc)||Date.now()>=Date.parse(deadlineUtc)
    ||fs.existsSync(at(`COORDINATOR_FAILURE.${nonce}.safe.json`))
    ||fs.existsSync(at(`INPUT_TERMINAL.${nonce}.safe.json.failure.safe.json`)))
    throw Error('D_INPUT_COORDINATOR_STOPPED');
  if(fs.existsSync(at(`INPUT_DECISION.${nonce}.safe.json`)))throw Error('D_INPUT_COORDINATOR_STOPPED');
  const start=readRecord(at(`COORDINATOR_STARTED.${nonce}.safe.json`),4096).value;
  if(start.binding!==binding||start.nonce!==nonce||start.runId!==runId||start.deadlineUtc!==deadlineUtc)
    throw Error('D_INPUT_COORDINATOR_STOPPED');
  const terminal=at(`INPUT_TERMINAL.${nonce}.safe.json`);
  if(!fs.existsSync(terminal))return false;
  const value=readRecord(terminal,4096).value;
  if(value.binding!==binding||value.nonce!==nonce||value.kind!=='LOCAL_INPUT_TERMINAL_NOT_D_PASS'
    ||value.status!=='LOCAL_TRANSFER_REPORTED'||value.phase!=='CAPTURE_COMPLETE')
    throw Error('D_INPUT_COORDINATOR_STOPPED');
  return true;
}

export function publishDInputAdmission(input) {
  const entry={...input,deadlineUtc:input.entryDeadlineUtc};
  if(assertDInputAdmissionActive(entry)!==true)throw Error('D_INPUT_COORDINATOR_STOPPED');
  const value=validDecision({
    kind:'LOCAL_INPUT_SINGLE_DECISION',decision:'ADMIT',binding:input.binding,nonce:input.nonce,runId:input.runId,
    admittedUtc:input.admittedUtc,entryDeadlineUtc:input.entryDeadlineUtc,
    deadlineUtc:input.deadlineUtc,businessStopUtc:input.businessStopUtc,productionPass:false},entry);
  // One no-replace final file linearizes competing STOP and ADMIT writers.
  const chosen=chooseDecision(input.directory,input.nonce,value);
  if(!chosen.won||chosen.value.decision!=='ADMIT'||Date.now()>=Date.parse(input.entryDeadlineUtc))
    throw Error('D_INPUT_COORDINATOR_STOPPED');
  return chosen.value;
}

const reasons=new Set(['INVALID_FILE','MALFORMED_JSON','INVALID_RECORD','IDENTITY_MISMATCH',
  'WINDOW_EXPIRED','NATIVE_EXIT_FAILED','INPUT_STOPPED','INPUT_METADATA_INVALID','OWNER_GATE_INVALID',
  'PUBLICATION_FAILED','LOCAL_STOP_REQUESTED','PUBLISHER_FAILED','NATIVE_EXIT_PREMATURE']);

export function startDInputCoordinator(options) {
  const {directory,nonce,binding,runId,tokenLabel,deadlineUtc,pollMs=100,mode='PRODUCTION',verifyPrivateDirectory}=options??{};
  if(!path.isAbsolute(directory??'')||!fs.lstatSync(directory).isDirectory()
    ||!/^[a-f0-9-]{36}$/.test(nonce??'')||!/^[a-f0-9]{64}$/.test(binding??'')
    ||!/^[a-f0-9-]{36}$/.test(runId??'')||!/^[A-Za-z0-9_-]{1,96}$/.test(tokenLabel??'')
    ||!utc(deadlineUtc)||Date.parse(deadlineUtc)<=Date.now()||!Number.isInteger(pollMs)||pollMs<5||pollMs>1000
    ||!['PRODUCTION','SYNTHETIC'].includes(mode)
    ||mode==='PRODUCTION'&&(typeof verifyPrivateDirectory!=='function'||verifyPrivateDirectory(directory)!==true))
    throw Error('LOCAL_COORDINATOR_NOT_ADMITTED');
  const at=name=>path.join(directory,name),end=Date.parse(deadlineUtc);
  const files={parameters:at(`HEAD_INPUT.${nonce}.parameters.safe.json`),ready:at(`head-input.${nonce}.ready.safe.json`),
    terminal:at(`INPUT_TERMINAL.${nonce}.safe.json`),exit:at(`WORKSPACE_NATIVE_EXIT.${nonce}.safe.json`),
    nativePlan:at(`D.plan.native-input.${nonce}.private.json`),failure:at(`COORDINATOR_FAILURE.${nonce}.safe.json`)};
  if(fs.existsSync(files.nativePlan)||fs.existsSync(files.nativePlan+'.publishing')||fs.existsSync(files.failure)
    ||fs.existsSync(at(`INPUT_DECISION.${nonce}.safe.json`)))
    throw Error('LOCAL_COORDINATOR_ALREADY_USED');
  publishDInputRecord(at(`COORDINATOR_STARTED.${nonce}.safe.json`),{
    kind:'LOCAL_COORDINATOR_START_NOT_AUTHORIZATION',binding,nonce,runId,deadlineUtc,providerRequests:0});
  let timer,settled=false,stage='WAITING',status='WAITING',planPublications=0,inputDeadline=null,supplierDeadline=null,transferred=false,admittedEnd=null;
  let resolveDone;
  const done=new Promise(resolve=>{resolveDone=resolve;});
  const state=()=>({status,stage,planPublications,inputDeadline,supplierDeadline,providerRequests:0,productionPass:false});
  const finish=(next,reason)=>{
    if(settled)return;
    settled=true;clearInterval(timer);status=next;
    if(next==='STOPPED'&&admittedEnd===null) {
      try {
        const chosen=validDecision(chooseDecision(directory,nonce,{kind:'LOCAL_INPUT_SINGLE_DECISION',decision:'STOP',
          binding,nonce,runId,entryDeadlineUtc:deadlineUtc,stage,reason:reason??null}).value,options);
        if(chosen.decision==='ADMIT')admittedEnd=Date.parse(chosen.deadlineUtc);
      }catch{status='LOCAL_DECISION_UNKNOWN';}
    }
    if(next==='STOPPED'&&admittedEnd!==null)status='ADMITTED_OBSERVER_STOPPED_NOT_D_PASS';
    const result={...state(),reason:reason??null};
    if(next==='STOPPED') {
      const failure=admittedEnd===null&&status!=='LOCAL_DECISION_UNKNOWN'?files.failure:
        at(`COORDINATOR_OBSERVER_FAILURE.${nonce}.safe.json`);
      try{publishDInputRecord(failure,{kind:'LOCAL_COORDINATOR_FAILURE',binding,nonce,runId,
        ...result,noRetry:true,recordedUtc:new Date().toISOString()});}catch{result.failureReceipt='UNPROVEN';}
    }
    resolveDone(result);
  };
  const identity=value=>{if(value.binding!==binding||value.nonce!==nonce)throw Error('IDENTITY_MISMATCH');};
  const tick=()=>{
    if(settled)return;
    try {
      stage='ADMISSION_HANDOFF';
      const handoff=at(`INPUT_DECISION.${nonce}.safe.json`);
      if(admittedEnd===null&&fs.existsSync(handoff)) {
        const admitted=validDecision(readRecord(handoff,4096).value,options);
        if(admitted.decision==='STOP')throw Error('INPUT_STOPPED');
        if(planPublications!==1)throw Error('INVALID_RECORD');
        admittedEnd=Date.parse(admitted.deadlineUtc);status='ADMITTED_WAITING_NATIVE_EXIT';
      }
      stage='DEADLINE';
      if(admittedEnd===null&&Date.now()>=end)throw Error('WINDOW_EXPIRED');
      if(admittedEnd!==null&&Date.now()>=admittedEnd){finish('LOCAL_D_WINDOW_EXPIRED','NATIVE_EXIT_UNPROVEN');return;}
      stage='TERMINAL_FAILURE';
      if(fs.existsSync(files.terminal+'.failure.safe.json'))throw Error('PUBLISHER_FAILED');
      stage='TERMINAL_READ';
      if(fs.existsSync(files.terminal)) {
        const terminal=readRecord(files.terminal,4096).value;
        stage='TERMINAL_BINDING';identity(terminal);
        if(terminal.kind!=='LOCAL_INPUT_TERMINAL_NOT_D_PASS')throw Error('INVALID_RECORD');
        if(terminal.status==='STOPPED')throw Error('INPUT_STOPPED');
        if(terminal.status!=='LOCAL_TRANSFER_REPORTED'||terminal.phase!=='CAPTURE_COMPLETE')throw Error('INVALID_RECORD');
        transferred=true;
        status=admittedEnd===null?'WAITING_SUPPLIER_OR_NATIVE_EXIT':'ADMITTED_WAITING_NATIVE_EXIT';
      }
      stage='NATIVE_EXIT_READ';
      if(fs.existsSync(files.exit)) {
        const exit=readRecord(files.exit,4096).value;
        stage='NATIVE_EXIT_BINDING';identity(exit);
        if(exit.kind!=='ACTUAL_NATIVE_EXIT_NOT_CLEANUP_PASS'||exit.supervisionUnknown!==false||!Number.isInteger(exit.exitCode))
          throw Error('INVALID_RECORD');
        if(exit.exitCode!==0)throw Error('NATIVE_EXIT_FAILED');
        if(planPublications!==1||!transferred)throw Error('NATIVE_EXIT_PREMATURE');
        finish('LOCAL_NATIVE_EXIT');return;
      }
      stage='INPUT_DEADLINE';
      if(inputDeadline&&!transferred&&Date.now()>=Date.parse(inputDeadline))
        throw Error('WINDOW_EXPIRED');
      if(planPublications)return;
      stage='PARAMETER_READ';
      if(!fs.existsSync(files.parameters)||!fs.existsSync(files.ready))return;
      const p=readRecord(files.parameters,4096).value,ready=readRecord(files.ready,4096);
      stage='INPUT_BINDING';identity(p);identity(ready.value);
      if(p.account!=='dcb374166b39234a499985145c075f50'||p.bucket!=='openglasshub-media'
        ||p.tokenLabel!==tokenLabel||p.permission!=='object-read-only'||p.ttlHours!==24||p.tokenCreated!==false
        ||!utc(p.deadlineUtc)||Date.parse(p.deadlineUtc)<=Date.now()||Date.parse(p.deadlineUtc)>end
        ||Date.parse(p.deadlineUtc)>Date.now()+120000||ready.value.schemaVersion!==1
        ||ready.value.status!=='LOCAL_CURRENT_USER_PIPE_READY'||ready.value.productionRequests!==0
        ||!Number.isSafeInteger(ready.value.pid)||ready.value.pid<=0
        ||p.planPath!==at(`D.plan.owner-enter.${nonce}.private.json`))throw Error('INPUT_METADATA_INVALID');
      stage='OWNER_PLAN_READ';const plan=readRecord(p.planPath).value;
      if(plan.sourceAdoption?.sha256!==binding||plan.runId!==runId||path.resolve(plan.directory)!==path.resolve(directory)
        ||plan.tokenLabel!==tokenLabel||plan.account!==p.account||plan.bucket!==p.bucket
        ||plan.project!=='xcbnxzjlsvtgzixurcof'||Object.keys(D_LIMITS).some(k=>plan.remainingCaps?.[k]!==D_LIMITS[k])
        ||plan.runtimeAdmission?.path!==at(`D_RUNTIME_ADMISSION.owner-enter.${nonce}.safe.json`))throw Error('OWNER_GATE_INVALID');
      const gates=readRecord(plan.runtimeAdmission.path);
      if(gates.sha256!==plan.runtimeAdmission.sha256||gates.value.sourceAdoptionSha256!==binding
        ||!utc(gates.value.ownerReadyUtc)||Date.parse(gates.value.ownerReadyUtc)>Date.now()
        ||Date.now()-Date.parse(gates.value.ownerReadyUtc)>600000
        ||gates.value.ownerPreparationRef?.path!==at(`OWNER_ENTER.${nonce}.safe.json`))throw Error('OWNER_GATE_INVALID');
      const enter=readRecord(gates.value.ownerPreparationRef.path,4096);
      identity(enter.value);
      if(enter.sha256!==gates.value.ownerPreparationRef.sha256||enter.value.currentPreparationConfirmed!==true
        ||enter.value.tokenNotYetCreated!==true)throw Error('OWNER_GATE_INVALID');
      inputDeadline=p.deadlineUtc;supplierDeadline=new Date(Math.min(Date.now()+600000,end)).toISOString();
      plan.credentialInput={nonce,expectedPid:ready.value.pid,deadlineUtc:inputDeadline,
        readyRecord:{path:files.ready,sha256:ready.sha256}};
      plan.supplierConfirmation={path:at(`supplier-confirmation.${nonce}.safe.json`),deadlineUtc:supplierDeadline};
      plan.inputCoordination={nonce,deadlineUtc};
      stage='NATIVE_PLAN_PUBLICATION';
      try{publishDInputRecord(files.nativePlan,plan);}catch{throw Error('PUBLICATION_FAILED');}
      planPublications=1;
    } catch(error) {
      const reason=reasons.has(error?.message)?error.message:
        ['EACCES','EBUSY','EPERM','ENOENT','EEXIST'].includes(error?.code)?error.code:'LOCAL_IO_UNCLASSIFIED';
      finish('STOPPED',reason);
    }
  };
  timer=setInterval(tick,pollMs);tick();
  return {done,state,stop:()=>finish('STOPPED','LOCAL_STOP_REQUESTED')};
}
