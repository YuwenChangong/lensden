import {S3Client,HeadObjectCommand} from '@aws-sdk/client-s3';
import {NodeHttpHandler} from '@smithy/node-http-handler';
import {Agent} from 'node:https';
import {createHash,randomUUID} from 'node:crypto';
import {connect} from 'node:net';

const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';
const host=`${account}.r2.cloudflarestorage.com`;
const approved24hException='0fb31bcc6a9230ff23914298d781093fa8b90f9f28e627acc59d2063bf885a03';
const sha=v=>createHash('sha256').update(v).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const utc=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
  &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v?Date.parse(v):NaN;
const parse=(raw,max)=>{
  if(!Buffer.isBuffer(raw)||!raw.length||raw.length>max)throw Error('D_HEAD_RECEIPT_INVALID');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
};
const sameRun=(v,b)=>v?.executionBindingSha256===b.executionBindingSha256
  &&v.connectionBindingSha256===b.connectionBindingSha256;
const fixedTarget=v=>v?.account===account&&v.bucket===bucket&&v.jurisdiction==='default';
const records=new WeakMap(),verifiers=new WeakSet();

// Same-user local pipe only; never accepts a URL, remote socket or secret file.
// The caller validates the private READY record/ACL/PID before invoking this.
export function receiveDHeadCredentials({bindingSha256,nonce,deadlineUtc,offlineFixture=false}) {
  if(!digest(bindingSha256)||!uuid(nonce)||!Number.isFinite(utc(deadlineUtc))||utc(deadlineUtc)<=Date.now()
    ||(offlineFixture?bindingSha256!=='0'.repeat(64):bindingSha256==='0'.repeat(64)))
    return Promise.reject(Error('D_HEAD_PRIVATE_INPUT_INVALID'));
  return new Promise((resolve,reject)=>{
    const prefix=offlineFixture?'OGHR2HeadCredentials-Fixture-':'OGHR2HeadCredentials-';
    const chunks=[];let length=0,settled=false;
    const socket=connect({path:'\\\\.\\pipe\\'+prefix+nonce});
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);socket.destroy();
      for(const chunk of chunks)chunk.fill(0);
      error?reject(Error('D_HEAD_PRIVATE_INPUT_INVALID')):resolve(value);
    };
    const timer=setTimeout(()=>finish(true),Math.min(120000,utc(deadlineUtc)-Date.now()));
    socket.on('error',()=>finish(true));
    socket.on('data',chunk=>{chunks.push(chunk);length+=chunk.length;if(length>16384)finish(true);});
    socket.on('end',()=>{
      let raw;
      try {
        raw=Buffer.concat(chunks);
        const frame=parse(raw,16384),allowed=['schemaVersion','binding','nonce','accessKeyId','secretAccessKey','sessionToken'];
        if(Date.now()>=utc(deadlineUtc)||Object.keys(frame).some(k=>!allowed.includes(k))||frame.schemaVersion!==1
          ||frame.binding!==bindingSha256||frame.nonce!==nonce||typeof frame.accessKeyId!=='string'
          ||!/^[a-zA-Z0-9]{16,128}$/.test(frame.accessKeyId)||typeof frame.secretAccessKey!=='string'
          ||!/^[a-zA-Z0-9/+=]{32,256}$/.test(frame.secretAccessKey)
          ||(frame.sessionToken!==undefined&&(typeof frame.sessionToken!=='string'||!frame.sessionToken.length
            ||frame.sessionToken.length>8192||/[^\x21-\x7e]/.test(frame.sessionToken))))throw Error();
        finish(false,{accessKeyId:frame.accessKeyId,secretAccessKey:frame.secretAccessKey,
          ...(frame.sessionToken?{sessionToken:frame.sessionToken}:{})});
      }catch{finish(true);}finally{raw?.fill(0);}
    });
  });
}

function validKey(key,b) {
  if(typeof key!=='string'||key.length>1024||!/^[a-zA-Z0-9._/-]+$/.test(key)
    ||key.split('/').some(p=>!p||p==='.'||p==='..'))return false;
  return key.startsWith(`tmp/${b.actorId}/${b.postId}/`)?key.split('/').length===4
    :key.startsWith(`${b.actorId}/${b.postId}/`)
      &&new RegExp(`^${b.actorId}/${b.postId}/r2-retained-[a-f0-9-]+\\.(mp4|webm|mov)$`).test(key);
}
function creation(raw,b,key,now) {
  const c=parse(raw,8192);
  const partial=b.creationMode==='SOURCE_UPLOAD_RECOVERY_V1';
  if(!sameRun(c,b)||!fixedTarget(c)||!Array.isArray(c.keys)||!c.keys.length||c.keys.length>2
    ||new Set(c.keys).size!==c.keys.length||!c.keys.includes(key)||!c.keys.every(k=>validKey(k,b))
    ||!digest(c.uploadReceiptSha256)||(!partial&&!digest(c.retentionReceiptSha256))
    ||!Number.isFinite(utc(c.observedUtc))||utc(c.observedUtc)<utc(b.notBeforeUtc)||utc(c.observedUtc)>now)
    throw Error('D_HEAD_RECEIPT_INVALID');
  if(b.creationMode==='SERVER_RECEIPT_V2'||partial) {
    if(c.actorId!==b.actorId||c.postId!==b.postId||c.actorCreationReceiptSha256!==b.actorCreationReceiptSha256
      ||c.identityReceiptSha256!==b.identityReceiptSha256||c.frozenArtifactSha256!==b.frozenArtifactSha256
      ||c.observerSourceSha256!==b.observerSourceSha256
      ||!Array.isArray(c.objectMetadata)||c.objectMetadata.length!==c.keys.length
      ||new Set(c.objectMetadata.map(m=>m?.key)).size!==c.keys.length
      ||!c.objectMetadata.every(m=>c.keys.includes(m?.key)&&m.sizeBytes===2018&&m.mimeType==='video/mp4'
        &&(partial?m.etag===null:typeof m.etag==='string'&&/^"[a-f0-9]{32}"$/i.test(m.etag))))throw Error('D_HEAD_CREATION_METADATA_UNPROVEN');
    if(partial&&(c.recoveryOnly!==true||c.attachmentDispatched!==false||c.uploadAcknowledged!==true
      ||c.retentionReceiptSha256!==null||c.keys.length!==1||!key.startsWith('tmp/')
      ||c.mediaId!==null||c.claimId!==null))throw Error('D_HEAD_PARTIAL_SOURCE_UNPROVEN');
  }
  return c;
}
function validDeletion(d,c,b,key,raw,afterUtc) {
  if(!(sameRun(d,b)&&fixedTarget(d)&&d.method==='DELETE'&&d.status===200&&d.complete===true
    &&typeof d.requestId==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(d.requestId)
    &&digest(d.responseSha256)&&d.creationReceiptSha256===sha(raw)
    &&Array.isArray(d.keys)&&Array.isArray(d.createdKeys)&&d.keys.length>0&&d.keys.length<=c.keys.length
    &&d.createdKeys.length===c.keys.length&&new Set(d.keys).size===d.keys.length
    &&new Set(d.createdKeys).size===c.keys.length&&c.keys.every(k=>d.createdKeys.includes(k))
    &&d.keys.every(k=>c.keys.includes(k))&&utc(d.startedUtc)>=utc(c.observedUtc)
    &&utc(d.completedUtc)>=utc(d.startedUtc)&&utc(d.completedUtc)<=afterUtc))return false;
  if(d.keys.includes(key))return true;
  const a=d.applicationDeletion;
  return a?.actorId===b.actorId&&a.postId===b.postId&&a.status===200&&a.cleanupOk===true&&digest(a.responseSha256)
    &&typeof a.requestId==='string'&&a.requestId!==d.requestId&&Array.isArray(a.keys)&&a.keys.length===1
    &&a.keys[0]===key&&key.startsWith(`${b.actorId}/${b.postId}/`)
    &&utc(a.startedUtc)>=utc(c.observedUtc)&&utc(a.completedUtc)>=utc(a.startedUtc)&&utc(a.completedUtc)<=utc(d.startedUtc);
}

// This factory grants no authority. The existing executor must admit every call
// through its durable window/quota/permission/cost gate before transport dispatch.
export function createDHeadVerifier({binding,scope,credentials,beforeDispatch,requestHandler,now=Date.now,timeoutMs=10000}) {
  const extended=binding?.credentialLifetimePolicy==='D_24H_OWNER_EXCEPTION_V1';
  // Pins identify the exact owner exception, not provider scope/expiry proof.
  // The durable execution host must verify both records before admitting a call.
  if(binding?.credentialLifetimePolicy!==undefined&&!extended
    ||extended&&(binding.credentialLifetimeApprovalSha256!==approved24hException
      ||scope?.credentialLifetimeApprovalSha256!==approved24hException
      ||!Number.isFinite(utc(scope.issuedUtc))||utc(scope.issuedUtc)>utc(binding.notBeforeUtc)
      ||utc(scope.expiresUtc)<=utc(scope.issuedUtc)||utc(scope.expiresUtc)-utc(scope.issuedUtc)>86400000))
    throw Error('D_HEAD_CREDENTIAL_EXCEPTION_INVALID');
  if(!binding||!digest(binding.executionBindingSha256)||!digest(binding.connectionBindingSha256)
    ||(binding.creationMode!==undefined&&!['SERVER_RECEIPT_V2','SOURCE_UPLOAD_RECOVERY_V1'].includes(binding.creationMode))
    ||(['SERVER_RECEIPT_V2','SOURCE_UPLOAD_RECOVERY_V1'].includes(binding.creationMode)
      &&!['identityReceiptSha256','frozenArtifactSha256','observerSourceSha256'].every(k=>digest(binding[k])))
    ||!digest(binding.actorCreationReceiptSha256)||!uuid(binding.actorId)||!uuid(binding.postId)
    ||!Number.isFinite(utc(binding.notBeforeUtc))||!Number.isFinite(utc(binding.deadlineUtc))
    ||utc(binding.deadlineUtc)<=utc(binding.notBeforeUtc)||utc(binding.deadlineUtc)-utc(binding.notBeforeUtc)>10800000
    ||!fixedTarget(scope)||scope.permission!=='object-read-only'||!digest(scope.evidenceSha256)
    ||!digest(scope.bucketProvenanceSha256)||scope.configurationWindowBindingSha256!==binding.executionBindingSha256
    ||!Number.isFinite(utc(scope.expiresUtc))||utc(scope.expiresUtc)<utc(binding.deadlineUtc)
    ||utc(scope.expiresUtc)-utc(binding.notBeforeUtc)>(extended?86400000:14400000)
    ||typeof credentials?.accessKeyId!=='string'||!/^[a-zA-Z0-9]{16,128}$/.test(credentials.accessKeyId)
    ||typeof credentials.secretAccessKey!=='string'||!/^[a-zA-Z0-9/+=]{32,256}$/.test(credentials.secretAccessKey)
    ||(credentials.sessionToken!==undefined&&(typeof credentials.sessionToken!=='string'
      ||!credentials.sessionToken.length||credentials.sessionToken.length>8192||/[^\x21-\x7e]/.test(credentials.sessionToken)))
    ||typeof beforeDispatch!=='function'||typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)
    throw Error('D_HEAD_ADMISSION_INVALID');
  const b=structuredClone(binding),s=structuredClone(scope),secret={...credentials};
  const mode=requestHandler?'OFFLINE_FIXTURE':'S3_HEAD_CAPTURE';
  const agent=requestHandler?null:new Agent({rejectUnauthorized:true,keepAlive:false,maxSockets:1});
  const transport=requestHandler??new NodeHttpHandler({connectionTimeout:2000,requestTimeout:10000,httpsAgent:agent});
  let stopped=false,busy=false,closed=false,count=0,active;
  const used=new Set(),precreate=new Map(),beforeDelete=new Map();
  const unknown=()=>({state:'UNKNOWN',stopped:true,mode,providerCancellationProven:false,productionAuthority:false});
  const handler={metadata:{handlerProtocol:'http/1.1'},destroy(){transport.destroy?.();},async handle(request,options) {
    const a=active;
    if(!a||a.calls++!==0||request.method!=='HEAD'||request.protocol!=='https:'||request.hostname!==host
      ||(request.port!==undefined&&request.port!==443)||request.path!==`/${bucket}/${a.key}`
      ||Object.keys(request.query??{}).some(k=>k!=='x-id'||request.query[k]!=='HeadObject')
      ||request.body!==undefined||!/^AWS4-HMAC-SHA256 /.test(request.headers.authorization??''))
      throw Error('D_HEAD_TRANSPORT_UNBOUND');
    const {response}=await transport.handle(request,options);
    const headers=response.headers??{},id=headers['x-amz-request-id'],ray=headers['cf-ray'];
    // HEAD has no media/error body. Never deserialize or retain an unexpected body.
    response.body?.destroy?.();response.body=new Uint8Array();
    a.response={status:response.statusCode,requestId:typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id)?id:null,
      ray:typeof ray==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(ray)?ray:null,
      redirected:headers.location!==undefined,
      size:typeof headers['content-length']==='string'&&/^\d{1,20}$/.test(headers['content-length'])?headers['content-length']:null,
      etag:typeof headers.etag==='string'&&/^"[a-f0-9]{32}"$/i.test(headers.etag)?headers.etag:null,
      storageClass:['STANDARD','Standard','STANDARD_IA','InfrequentAccess'].includes(headers['x-amz-storage-class'])
        ?headers['x-amz-storage-class']:'UNKNOWN',
      errorCode:headers['x-amz-error-code']===undefined?null
        :['NotFound','NoSuchKey','NoSuchBucket','AccessDenied','ExpiredToken','SignatureDoesNotMatch'].includes(headers['x-amz-error-code'])
          ?headers['x-amz-error-code']:'UNRECOGNIZED'};
    return {response};
  }};
  const client=new S3Client({region:'auto',endpoint:`https://${host}`,forcePathStyle:true,maxAttempts:1,
    followRegionRedirects:false,credentials:secret,requestHandler:handler,
    logger:{trace(){},debug(){},info(){},warn(){},error(){}}});
  const verifier={async head({phase,key,allocationRaw,creationRaw,deletion}={}) {
    if(stopped||closed||busy){stopped=true;return unknown();}
    busy=true;let timer,intent,dispatchUtc,observation,sdkErrorCode=null;
    try {
      // Do not let caller mutation during an admission await rebind evidence.
      if(Buffer.isBuffer(allocationRaw))allocationRaw=Buffer.from(allocationRaw);
      if(Buffer.isBuffer(creationRaw))creationRaw=Buffer.from(creationRaw);
      if(deletion!==undefined)deletion=structuredClone(deletion);
      const start=now();
      if(!Number.isFinite(start)||start<utc(b.notBeforeUtc)||start>=utc(b.deadlineUtc)||start>=utc(s.expiresUtc)
        ||!['BEFORE_CREATE','AFTER_CREATE','BEFORE_DELETE','AFTER_DELETE'].includes(phase)||!validKey(key,b)
        ||used.has(`${phase}:${key}`)||count>=6)throw Error('D_HEAD_NOT_ADMITTED');
      if(b.creationMode==='SOURCE_UPLOAD_RECOVERY_V1'&&!['BEFORE_DELETE','AFTER_DELETE'].includes(phase))
        throw Error('D_HEAD_PARTIAL_RECOVERY_ONLY');
      let c;
      if(phase==='BEFORE_CREATE') {
        const a=parse(allocationRaw,4096);
        if(precreate.size!==0||!key.startsWith('tmp/')||!sameRun(a,b)||a.actorId!==b.actorId||a.postId!==b.postId||a.key!==key
          ||a.actorCreationReceiptSha256!==b.actorCreationReceiptSha256||!digest(a.ticketReceiptSha256)
          ||!Number.isFinite(utc(a.issuedUtc))||utc(a.issuedUtc)<utc(b.notBeforeUtc)||utc(a.issuedUtc)>start)
          throw Error('D_HEAD_ALLOCATION_UNPROVEN');
      } else {
        c=creation(creationRaw,b,key,start);
        if(phase==='AFTER_CREATE'&&key.startsWith('tmp/')&&b.creationMode!=='SERVER_RECEIPT_V2')throw Error('D_HEAD_PHASE_UNPROVEN');
        const sourceKey=precreate.keys().next().value;
        if(!['SERVER_RECEIPT_V2','SOURCE_UPLOAD_RECOVERY_V1'].includes(b.creationMode)&&(precreate.size!==1||!c.keys.includes(sourceKey)||c.keys.filter(k=>k.startsWith('tmp/')).length!==1
          ||precreate.get(sourceKey).ended>utc(c.observedUtc)))throw Error('D_HEAD_SOURCE_UNPROVEN');
        if(!['SERVER_RECEIPT_V2','SOURCE_UPLOAD_RECOVERY_V1'].includes(b.creationMode)&&key.startsWith('tmp/')&&(!precreate.has(key)||precreate.get(key).ended>utc(c.observedUtc)))
          throw Error('D_HEAD_PRECREATE_UNPROVEN');
        if(phase==='AFTER_DELETE'&&(!beforeDelete.has(key)||beforeDelete.get(key).creationSha!==sha(creationRaw)
          ||!validDeletion(deletion,c,b,key,creationRaw,start)
          ||beforeDelete.get(key).ended>utc(deletion.keys.includes(key)?deletion.startedUtc:deletion.applicationDeletion?.startedUtc)))
          throw Error('D_HEAD_DELETE_UNPROVEN');
      }
      used.add(`${phase}:${key}`);
      const requestId=randomUUID();intent={phase,key,requestId,method:'HEAD',account,bucket,jurisdiction:'default',
        executionBindingSha256:b.executionBindingSha256,connectionBindingSha256:b.connectionBindingSha256,
        bucketProvenanceSha256:s.bucketProvenanceSha256,configurationWindowBindingSha256:s.configurationWindowBindingSha256,
        allocationReceiptSha256:allocationRaw?sha(allocationRaw):null,creationReceiptSha256:creationRaw?sha(creationRaw):null};
      if(extended)Object.assign(intent,{credentialLifetimePolicy:b.credentialLifetimePolicy,
        credentialLifetimeApprovalSha256:approved24hException,credentialIssuedUtc:s.issuedUtc,credentialExpiresUtc:s.expiresUtc});
      const controller=new AbortController();
      const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{
        stopped=true;controller.abort();reject(Error('D_HEAD_TIMEOUT'));},
      Math.min(timeoutMs,utc(b.deadlineUtc)-start,utc(s.expiresUtc)-start));});
      if(await Promise.race([beforeDispatch(Object.freeze(intent)),expired])!==true)throw Error('D_HEAD_NOT_ADMITTED');
      dispatchUtc=now();
      if(stopped||dispatchUtc<start||dispatchUtc>=utc(b.deadlineUtc)||dispatchUtc>=utc(s.expiresUtc))throw Error('D_HEAD_EXPIRED');
      count++;active={key,calls:0,response:null};observation=active;
      let sdkFailed=false,sdkStatus;
      await Promise.race([client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:controller.signal})
        .catch(error=>{sdkFailed=true;sdkStatus=error?.$metadata?.httpStatusCode;
          sdkErrorCode=['NotFound','NoSuchKey','NoSuchBucket','AccessDenied','ExpiredToken','SignatureDoesNotMatch'].includes(error?.name)
            ?error.name:'UNRECOGNIZED';}),expired]);
      const end=now(),r=observation.response;
      if(stopped||!r||observation.calls!==1||end<dispatchUtc||end-dispatchUtc>10000
        ||end>=utc(b.deadlineUtc)||end>=utc(s.expiresUtc)||r.redirected||(!r.requestId&&!r.ray))throw Error('D_HEAD_RESPONSE_UNPROVEN');
      const expected=phase==='BEFORE_DELETE'||phase==='AFTER_CREATE'?200:404;
      if(r.status!==expected||(expected===200&&sdkFailed)
        ||(expected===404&&(!sdkFailed||sdkStatus!==404||!['NotFound','NoSuchKey'].includes(sdkErrorCode)
          ||(r.errorCode!==null&&!['NotFound','NoSuchKey'].includes(r.errorCode)))))throw Error('D_HEAD_UNEXPECTED_STATUS');
      let sizeBytes=null,etag=null,storageClass='UNKNOWN';
      if(expected===200) {
        if(typeof r.size!=='string'||!/^\d+$/.test(r.size)||!Number.isSafeInteger(Number(r.size))||Number(r.size)!==2018
          ||typeof r.etag!=='string'||!/^"[a-f0-9]{32}"$/i.test(r.etag))throw Error('D_HEAD_METADATA_UNPROVEN');
        sizeBytes=Number(r.size);etag=r.etag;
        if(r.storageClass==='STANDARD'||r.storageClass==='Standard')storageClass='Standard';
        if(r.storageClass==='STANDARD_IA'||r.storageClass==='InfrequentAccess')storageClass='InfrequentAccess';
        if(b.creationMode==='SERVER_RECEIPT_V2') {
          const m=c.objectMetadata.find(m=>m.key===key);
          if(sizeBytes!==m.sizeBytes||etag!==m.etag)throw Error('D_HEAD_CREATION_METADATA_MISMATCH');
        }
      }
      const response={status:r.status,providerRequestId:r.requestId,ray:r.ray,sizeBytes,etag,storageClass};
      const source={...intent,kind:'s3-head',prefix:key,endpoint:`https://${host}/${bucket}/${key}`,
        startedUtc:new Date(dispatchUtc).toISOString(),completedUtc:new Date(end).toISOString(),
        credentialScopeEvidenceSha256:s.evidenceSha256,credentialExpiresUtc:s.expiresUtc};
      const receipt={state:expected===200?'PRESENT':phase==='BEFORE_CREATE'?'PRECREATE_NOT_FOUND_CANDIDATE':'ABSENT',
        source,response,responseSha256:sha(JSON.stringify(response)),
        notFoundClassification:expected===404?'BOUND_HEAD404_NOT_PROVIDER_EXCEPTION_CODE':null,
        precreationProof:b.creationMode==='SOURCE_UPLOAD_RECOVERY_V1'?'ACKNOWLEDGED_SOURCE_ONLY_RECOVERY_NOT_D_ACCEPTANCE'
          :b.creationMode==='SERVER_RECEIPT_V2'?'CAPTURED_SERVER_CREATION_CHAIN'
          :key.startsWith('tmp/')?'TICKET_BOUND_HEAD404':'SERVER_COPY_CREATION_RECEIPT_ONLY',
        mode,storageClass,productionAuthority:false};
      if(phase==='BEFORE_CREATE')precreate.set(key,{ended:end});
      if(phase==='BEFORE_DELETE')beforeDelete.set(key,{ended:end,creationSha:sha(creationRaw)});
      records.set(receipt,{hash:sha(JSON.stringify(receipt)),binding:b,
        before:phase==='AFTER_DELETE'?beforeDelete.get(key):null,
        deletionSha256:phase==='AFTER_DELETE'?sha(JSON.stringify(deletion)):null});
      return receipt;
    }catch{
      stopped=true;
      return {...unknown(),...(intent?{source:{...intent,kind:'s3-head',endpoint:`https://${host}/${bucket}/${key}`,
        ...(Number.isFinite(dispatchUtc)?{startedUtc:new Date(dispatchUtc).toISOString()}:{}),
        credentialScopeEvidenceSha256:s.evidenceSha256}}:{}),
        ...(observation?.response?{response:{...observation.response,sdkErrorCode},
          responseSha256:sha(JSON.stringify({...observation.response,sdkErrorCode}))}:{})};
    }
    finally{clearTimeout(timer);active=null;busy=false;}
  },close(){closed=true;stopped=true;client.destroy();agent?.destroy();
    for(const name of Object.keys(secret))secret[name]='';}};
  Object.freeze(verifier);verifiers.add(verifier);return verifier;
}

export const isDHeadVerifier=v=>verifiers.has(v);
export function bindDHeadCleanupReadback(receipt,deletion,creationRaw) {
  const unknown=()=>({state:'UNKNOWN',productionAuthority:false});
  try {
    const record=records.get(receipt),s=receipt?.source;
    if(!record||record.hash!==sha(JSON.stringify(receipt))||receipt.state!=='ABSENT'||s.phase!=='AFTER_DELETE'
      ||s.requestId===deletion?.requestId||record.deletionSha256!==sha(JSON.stringify(deletion)))return unknown();
    const c=creation(creationRaw,record.binding,s.key,utc(s.startedUtc));
    if(!validDeletion(deletion,c,record.binding,s.key,creationRaw,utc(s.startedUtc))
      ||!record.before||record.before.creationSha!==sha(creationRaw)
      ||record.before.ended>utc(deletion.keys.includes(s.key)?deletion.startedUtc:deletion.applicationDeletion?.startedUtc))return unknown();
    return {state:'ABSENCE_OBSERVED_AFTER_DELETE',deletionReceiptSha256:sha(JSON.stringify(deletion)),
      readbackReceiptSha256:record.hash,mode:receipt.mode,productionAuthority:false};
  }catch{return unknown();}
}

export function bindDHeadPersistence(initial,delayed) {
  const unknown=()=>({state:'UNKNOWN',productionAuthority:false});
  try {
    const a=records.get(initial),b=records.get(delayed);
    if(!a||!b||a.hash!==sha(JSON.stringify(initial))||b.hash!==sha(JSON.stringify(delayed))
      ||initial.state!=='PRESENT'||delayed.state!=='PRESENT'||initial.source.phase!=='AFTER_CREATE'
      ||delayed.source.phase!=='BEFORE_DELETE'||initial.source.key.startsWith('tmp/')
      ||initial.source.key!==delayed.source.key||initial.source.requestId===delayed.source.requestId
      ||!sameRun(initial.source,delayed.source)
      ||initial.source.creationReceiptSha256!==delayed.source.creationReceiptSha256
      ||initial.source.credentialScopeEvidenceSha256!==delayed.source.credentialScopeEvidenceSha256
      ||initial.source.bucketProvenanceSha256!==delayed.source.bucketProvenanceSha256
      ||initial.response.etag!==delayed.response.etag||initial.response.sizeBytes!==delayed.response.sizeBytes
      ||initial.storageClass!=='Standard'||delayed.storageClass!=='Standard'
      ||utc(delayed.source.startedUtc)-utc(initial.source.completedUtc)<600000)return unknown();
    return {state:'PERSISTENCE_OBSERVED',initialReceiptSha256:a.hash,delayedReceiptSha256:b.hash,
      uninterruptedPresenceProven:false,productionAuthority:false};
  }catch{return unknown();}
}
