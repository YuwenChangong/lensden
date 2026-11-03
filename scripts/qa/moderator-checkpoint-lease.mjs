import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const readyFields=['ordinaryEdgeReady','moderatorPageConfirmed','isolatedBlankWindowReady',
  'privateInputVisible','ownerPresent','signedScopeAndBudgetsVerified','sourceAndReaderVerified'];
const resultFields=['schemaVersion','buildId','methodBinding','parentBinding','executionId','nonce','stage','status',
  'startedUTC','finishedUTC','authHttpStatus','meHttpStatus','mfaHttpStatus','protectedHttpStatus','adminOnlyHttpStatus',
  'anonymousMeHttpStatus','communityHttpStatus','identityMatches','protectedRole','userIdSha256','totpFactors','serverAal',
  'mfaErrorCode','dispatches','retries','cleanup','failure'];

// Local coordination only. The caller verifies the real signature, source pins,
// private directory ACL and fresh owner statements before calling prepare().
// No browser controller, credential capture, permit signing or provider client.
export function createModeratorCheckpointLease({directory,binding,readerSource,readerParams,
  now=Date.now,monotonic=()=>performance.now()}={}) {
  const b=structuredClone(binding),p=structuredClone(readerParams);
  if(!path.isAbsolute(directory??'')||!fs.lstatSync(directory).isDirectory()
    ||!digest(b?.authorizationSha256)||!digest(b.parentBindingSha256)||!digest(b.readerSourceSha256)
    ||!/^[a-f0-9]{40}$/.test(b.sourceCommit??'')||!uuid(b.nonce)||!uuid(b.executionId)
    ||Object.keys(b).some(k=>!['authorizationSha256','parentBindingSha256','readerSourceSha256','sourceCommit','nonce','executionId'].includes(k))
    ||typeof readerSource!=='string'||!readerSource.startsWith('async function readMfaSnapshotInPage(p) {')
    ||readerSource.length>32768||hash(readerSource)!==b.readerSourceSha256
    ||Object.keys(p??{}).sort().join(',')!=='backupSha256,expectedUserSha256,primarySha256,publicAnonKey,publicAnonKeySha256'
    ||!['expectedUserSha256','primarySha256','backupSha256','publicAnonKeySha256'].every(k=>digest(p[k]))
    ||p.primarySha256===p.backupSha256||typeof p.publicAnonKey!=='string'||p.publicAnonKey.length>4096
    ||hash(p.publicAnonKey)!==p.publicAnonKeySha256||typeof now!=='function'||typeof monotonic!=='function')
    throw Error('MODERATOR_LEASE_BINDING_INVALID');
  const prefix=path.join(directory,hash(JSON.stringify({authorization:b.authorizationSha256,nonce:b.nonce})));
  const seal=(suffix,value)=>{
    const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value)+'\n');
    const file=prefix+suffix,fd=fs.openSync(file,'wx',0o600);
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(!fs.lstatSync(file).isFile()||!fs.readFileSync(file).equals(bytes))throw Error('MODERATOR_LEASE_RECEIPT_FAILED');
    return file;
  };
  let state='PREPARING',preparedAt,preparedMono,start,end,startMono,codeSha256;
  const stop=()=>{state='STOPPED';};
  const instant=()=>{const n=now();if(!Number.isFinite(n))throw Error('MODERATOR_LEASE_CLOCK');return n;};
  const elapsed=(wall,mono)=>{
    const delta=monotonic()-mono,clock=instant()-wall;
    if(!Number.isFinite(delta)||delta<0||clock<0||Math.abs(delta-clock)>2000)throw Error('MODERATOR_LEASE_CLOCK');
    return Math.max(delta,clock);
  };
  const active=()=>{
    if(state!=='ACTIVE'||instant()>=end||elapsed(start,startMono)>=600000)throw Error('MODERATOR_LEASE_EXPIRED');
  };
  // This prevents reconstruction after a stopped or partly written attempt.
  seal('.preparation.json',{kind:'LOCAL_PREPARATION_NOT_PERMISSION',...b,productionWindowStarted:false});
  return Object.freeze({
    prepare(facts){
      try{
        if(state!=='PREPARING'||Object.keys(facts??{}).sort().join(',')!==[...readyFields,'ownerReadinessReceiptSha256'].sort().join(',')
          ||!readyFields.every(k=>facts[k]===true)||!digest(facts.ownerReadinessReceiptSha256))throw Error();
        preparedAt=instant();preparedMono=monotonic();
        seal('.ready.json',{kind:'OWNER_AND_LOCAL_READY_NOT_SERVER_IDENTITY_PROOF',...b,...facts,
          recordedUtc:new Date(preparedAt).toISOString(),productionWindowStarted:false});
        state='PREPARED';return {state,productionWindowStarted:false};
      }catch{stop();throw Error('MODERATOR_LEASE_PREPARATION_FAILED');}
    },
    activate(){
      try{
        if(state!=='PREPARED'||elapsed(preparedAt,preparedMono)>30000)throw Error();
        start=instant();startMono=monotonic();end=start+600000;
        const q={...p,schemaVersion:3,stage:'final',methodBinding:b.authorizationSha256,parentBinding:b.parentBindingSha256,
          executionId:b.executionId,nonce:b.nonce,approvedUTC:new Date(start).toISOString(),
          windowEndUTC:new Date(end).toISOString(),dispatchNotAfterUTC:new Date(end).toISOString()};
        const code=`void (async()=>{
          if(window.top!==window||location.origin!=="https://openglasshub.ogh.workers.dev"||location.search||location.hash
            ||!["/admin/security/","/admin/reports/"].includes(location.pathname))throw Error("MODERATOR_CONTEXT_REQUIRED");
          const p=${JSON.stringify(q)};
          if(Date.now()<Date.parse(p.approvedUTC)||Date.now()>=Date.parse(p.windowEndUTC)-15000)throw Error("MODERATOR_LEASE_EXPIRED");
          const marker="__ogh_moderator_"+p.nonce;
          if(Object.hasOwn(window,marker))throw Error("MODERATOR_ALREADY_USED");
          if(typeof navigator?.locks?.request!=="function")throw Error("MODERATOR_SHARED_ADMISSION_REQUIRED");
          const shared="ogh-moderator-once:"+p.methodBinding+":"+p.nonce;
          await navigator.locks.request(shared,{mode:"exclusive"},()=>{
            if(Date.now()<Date.parse(p.approvedUTC)||Date.now()>=Date.parse(p.windowEndUTC)-15000)throw Error("MODERATOR_LEASE_EXPIRED");
            if(localStorage.getItem(shared)!==null)throw Error("MODERATOR_ALREADY_USED");
            const claim=JSON.stringify({binding:p.methodBinding,nonce:p.nonce,auth:1,worker:2,state:"RESERVED_UNKNOWN"});
            localStorage.setItem(shared,claim);
            if(localStorage.getItem(shared)!==claim)throw Error("MODERATOR_SHARED_RESERVATION_UNPROVEN");
          });
          Object.defineProperty(window,marker,{value:true});
          const result=await (${readerSource})(p);
          const u=URL.createObjectURL(new Blob([JSON.stringify(result)],{type:"application/json"}));
          const a=document.createElement("a");a.href=u;a.download="ogh-moderator-"+p.nonce+".json";
          document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
        })();`;
        codeSha256=hash(code);
        seal('.activated.json',{kind:'READINESS_WINDOW_NOT_D_BUSINESS_WINDOW',...b,codeSha256,
          notBeforeUtc:q.approvedUTC,deadlineUtc:q.windowEndUTC,minutes:10});
        for(const phase of ['AUTH_GET','WORKER_ME','WORKER_MFA'])seal('.'+phase+'.reserved.json',{
          kind:'PRE_DISPATCH_INTENT_UNKNOWN_UNTIL_VALID_RESULT',...b,codeSha256,phase,method:'GET',
          notBeforeUtc:q.approvedUTC,deadlineUtc:q.windowEndUTC,reserved:true});
        const scriptPath=seal('.browser.js',code);
        if(instant()>=end||elapsed(start,startMono)>=600000)throw Error();
        state='ACTIVE';return {state,scriptPath,codeSha256,notBeforeUtc:q.approvedUTC,deadlineUtc:q.windowEndUTC,
          reserved:{auth:1,worker:2},productionAuthority:false};
      }catch{stop();throw Error('MODERATOR_LEASE_ACTIVATION_FAILED_NO_RETRY');}
    },
    accept(result){
      try{
        active();
        if(!result||Object.keys(result).sort().join(',')!==[...resultFields].sort().join(',')
          ||result.schemaVersion!==1||result.buildId!=='0.2.6-mfa-enforcement-v1'||result.stage!=='final'
          ||result.methodBinding!==b.authorizationSha256||result.parentBinding!==b.parentBindingSha256
          ||result.executionId!==b.executionId||result.nonce!==b.nonce||result.status!=='PASS'
          ||result.identityMatches!==true||result.userIdSha256!==p.expectedUserSha256||result.protectedRole!=='moderator'
          ||result.serverAal!=='aal2'||result.failure!==null||result.cleanup!=='PASS'||result.retries!==0
          ||['authHttpStatus','meHttpStatus','mfaHttpStatus'].some(k=>result[k]!==200)
          ||['protectedHttpStatus','adminOnlyHttpStatus','anonymousMeHttpStatus','communityHttpStatus','mfaErrorCode'].some(k=>result[k]!==null)
          ||Object.keys(result.dispatches??{}).sort().join(',')!=='auth,worker'||result.dispatches.auth!==1||result.dispatches.worker!==2
          ||!Array.isArray(result.totpFactors)||result.totpFactors.length!==2
          ||!result.totpFactors.every(f=>Object.keys(f).sort().join(',')==='idSha256,status'&&f.status==='verified')
          ||new Set(result.totpFactors.map(f=>f.idSha256)).size!==2
          ||![p.primarySha256,p.backupSha256].every(pin=>result.totpFactors.some(f=>f.idSha256===pin)))throw Error();
        const times=[result.startedUTC,result.finishedUTC].map(v=>typeof v==='string'&&new Date(Date.parse(v)).toISOString()===v?Date.parse(v):NaN);
        if(!times.every(Number.isFinite)||times[0]<start||times[1]<times[0]||times[1]>=end||times[1]>instant())throw Error();
        const receipt={kind:'VERIFIED_MODERATOR_READINESS_NOT_D_ACCEPTANCE',...b,codeSha256,
          startedUtc:result.startedUTC,completedUtc:result.finishedUTC,auth:1,worker:2,
          moderator:true,verifiedFactors:2,serverAal:'aal2',productionAuthority:false};
        // Disk I/O can itself cross the deadline. A persisted candidate is not
        // acceptance; only the in-window return may admit the dependent host.
        seal('.result.safe.json',{...receipt,kind:'READINESS_CANDIDATE_NOT_ACCEPTED'});
        active();state='VERIFIED';return {...receipt,acceptedUtc:new Date(instant()).toISOString()};
      }catch{stop();throw Error('MODERATOR_LEASE_RESULT_UNPROVEN_NO_RETRY');}
    },
    stop,
    status(){try{if(state==='ACTIVE')active();}catch{stop();}return {state,productionAuthority:false};}
  });
}
