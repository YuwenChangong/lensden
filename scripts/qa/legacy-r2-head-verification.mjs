import {S3Client,HeadObjectCommand} from '@aws-sdk/client-s3';
import {NodeHttpHandler} from '@smithy/node-http-handler';
import {Agent} from 'node:https';

const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';
const host=`${account}.r2.cloudflarestorage.com`,purpose='LEGACY_EXACT_HEAD_ONLY_V1';
const pins=['manifestSha256','sourceSha256','executionBindingSha256','connectionBindingSha256','ownerUseRevisionSha256'];
const hashPin=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
const utc=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
  &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v?Date.parse(v):NaN;
const fixed=v=>v?.account===account&&v.bucket===bucket&&v.jurisdiction==='default'&&v.purpose===purpose;
const legacyKey=v=>typeof v==='string'&&v.length<=1024
  &&/^tmp\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/[a-zA-Z0-9._-]{1,240}$/.test(v)
  &&!['.','..'].includes(v.split('/')[2]);
const identity=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v)?v:null;
const fail=()=>{throw Error('LEGACY_HEAD_ADMISSION_INVALID');};

// Pins and supplier/owner records are verified by the external durable caller.
// This helper neither loads a manifest/credential nor creates execution authority.
export function createLegacyR2HeadVerifier({binding,scope,credentials,beforeDispatch,requestHandler,now=Date.now,timeoutMs=10000}={}) {
  let b,s,secret;
  try {
    b=structuredClone(binding);s=structuredClone(scope);
    const start=utc(b?.notBeforeUtc),end=utc(b?.deadlineUtc),issued=utc(s?.issuedUtc),expires=utc(s?.expiresUtc);
    const instant=typeof now==='function'?now():NaN;
    const absentEvidence=s?.notFoundHeaderSemantics!==undefined||s?.notFoundHeaderEvidenceSha256!==undefined;
    if(!fixed(b)||!fixed(s)||!pins.every(k=>hashPin(b[k])&&s[k]===b[k])
      ||!Array.isArray(b.keys)||b.keys.length!==2||!b.keys.every(legacyKey)||new Set(b.keys).size!==2
      ||b.keys.some((a,i)=>b.keys.some((other,j)=>i!==j&&a.startsWith(other)))
      ||b.maxHeads!==2||b.maxPerKey!==1||!Number.isFinite(start)||!Number.isFinite(end)
      ||end<=start||end-start>3600000||!Number.isFinite(instant)||instant<start||instant>=end
      ||s.permission!=='object-read-only'||s.singleBucket!==true||s.ownerExplicitUseRevision!==true
      ||!['supplierProvenanceSha256','bucketProvenanceSha256','credentialScopeEvidenceSha256'].every(k=>hashPin(s[k]))
      ||!Number.isFinite(issued)||!Number.isFinite(expires)||issued>start||expires<end||expires<=issued||expires-issued>86400000
      ||absentEvidence&&(s.notFoundHeaderSemantics!=='RELIABLE_NOSUCHKEY_HEADER_V1'||!hashPin(s.notFoundHeaderEvidenceSha256))
      ||typeof beforeDispatch!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000
      ||requestHandler!==undefined&&typeof requestHandler?.handle!=='function')fail();
    secret=structuredClone(credentials);
    if(typeof secret?.accessKeyId!=='string'||!/^[a-zA-Z0-9]{16,128}$/.test(secret.accessKeyId)
      ||typeof secret.secretAccessKey!=='string'||!/^[a-zA-Z0-9/+=]{32,256}$/.test(secret.secretAccessKey)
      ||Object.keys(secret).some(k=>!['accessKeyId','secretAccessKey','sessionToken'].includes(k))
      ||secret.sessionToken!==undefined&&(typeof secret.sessionToken!=='string'||!secret.sessionToken.length
        ||secret.sessionToken.length>8192||/[^\x21-\x7e]/.test(secret.sessionToken)))fail();
  }catch{fail();}
  Object.freeze(b.keys);Object.freeze(b);Object.freeze(s);
  const mode=requestHandler?'OFFLINE_FIXTURE':'LEGACY_S3_HEAD_CAPTURE';
  const agent=requestHandler?null:new Agent({rejectUnauthorized:true,keepAlive:false,maxSockets:1});
  const transport=requestHandler??new NodeHttpHandler({connectionTimeout:2000,requestTimeout:10000,httpsAgent:agent});
  const forward=transport.handle.bind(transport),destroy=transport.destroy?.bind(transport);
  const provenance=Object.freeze({...Object.fromEntries(pins.map(k=>[k,b[k]])),
    supplierProvenanceSha256:s.supplierProvenanceSha256,bucketProvenanceSha256:s.bucketProvenanceSha256,
    credentialScopeEvidenceSha256:s.credentialScopeEvidenceSha256,credentialIssuedUtc:s.issuedUtc,credentialExpiresUtc:s.expiresUtc,
    notFoundHeaderSemantics:s.notFoundHeaderSemantics??null,notFoundHeaderEvidenceSha256:s.notFoundHeaderEvidenceSha256??null});
  const used=new Set(),counts={attempts:0,admissions:0,sdkCalls:0,transportCalls:0};
  let stopped=false,closed=false,busy=false,active=null;
  const inWindow=instant=>Number.isFinite(instant)&&instant>=utc(b.notBeforeUtc)
    &&instant<utc(b.deadlineUtc)&&instant<utc(s.expiresUtc);
  const handler={metadata:{handlerProtocol:'http/1.1'},destroy(){destroy?.();},async handle(request,options) {
    const a=active;
    if(!a||stopped||closed||options?.abortSignal?.aborted||!inWindow(now())||performance.now()>=a.wallDeadline
      ||a.calls++!==0||request.method!=='HEAD'||request.protocol!=='https:'||request.hostname!==host
      ||request.port!==undefined&&request.port!==443||request.path!==`/${bucket}/${a.key}`
      ||Object.entries(request.query??{}).some(([k,v])=>k!=='x-id'||v!=='HeadObject')
      ||request.body!==undefined||!/^AWS4-HMAC-SHA256 /.test(request.headers.authorization??''))
      throw Error('LEGACY_HEAD_TRANSPORT_UNBOUND');
    counts.transportCalls++;
    const {response}=await forward(request,options);
    // Discard even error bodies before the SDK can deserialize them.
    try{response.body?.destroy?.();}finally{response.body=new Uint8Array();}
    if(active!==a||stopped||closed||options?.abortSignal?.aborted||performance.now()>=a.wallDeadline)
      throw Error('LEGACY_HEAD_RESPONSE_UNPROVEN');
    const h=response.headers??{},size=h['content-length'],mime=h['content-type'],etag=h.etag;
    a.response={status:Number.isInteger(response.statusCode)?response.statusCode:null,
      providerRequestId:identity(h['x-amz-request-id']),ray:identity(h['cf-ray']),
      sizeBytes:typeof size==='string'&&/^\d{1,20}$/.test(size)&&Number.isSafeInteger(Number(size))?Number(size):null,
      mimeType:typeof mime==='string'&&/^[a-zA-Z0-9!#$&^_.+-]{1,127}\/[a-zA-Z0-9!#$&^_.+-]{1,127}$/.test(mime)?mime:null,
      etag:typeof etag==='string'&&/^"[a-f0-9]{32}(?:-[1-9][0-9]{0,9})?"$/i.test(etag)?etag:null,
      storageClass:['STANDARD','Standard'].includes(h['x-amz-storage-class'])?'Standard'
        :['STANDARD_IA','InfrequentAccess'].includes(h['x-amz-storage-class'])?'InfrequentAccess':'UNKNOWN',
      redirected:h.location!==undefined,
      errorCode:h['x-amz-error-code']===undefined?null:h['x-amz-error-code']==='NoSuchKey'?'NoSuchKey':'OTHER'};
    return {response};
  }};
  const client=new S3Client({region:'auto',endpoint:`https://${host}`,forcePathStyle:true,maxAttempts:1,
    followRegionRedirects:false,credentials:secret,requestHandler:handler,
    logger:{trace(){},debug(){},info(){},warn(){},error(){}}});
  const unknown=(reason,source,response)=>({state:'UNKNOWN',reason,stopped:true,mode,productionAuthority:false,
    providerCancellationProven:false,...source&&{source},...response&&{response}});
  const safeResponse=r=>r?{status:r.status,providerRequestId:r.providerRequestId,ray:r.ray,
    sizeBytes:r.sizeBytes,mimeType:r.mimeType,etag:r.etag,storageClass:r.storageClass}:undefined;
  return Object.freeze({
    get counts(){return Object.freeze({...counts});},
    async head(input={}) {
      if(stopped||closed||busy){stopped=true;active?.controller.abort();return unknown('STOPPED');}
      busy=true;
      let timer,controller,observation,source,timedOut=false;
      try {
        const key=input?.key,start=now(),wallStart=performance.now();
        if(!input||Object.keys(input).some(k=>k!=='key')||!inWindow(start)||!legacyKey(key)
          ||!b.keys.includes(key)||used.has(key)||counts.attempts>=2)throw Error();
        used.add(key);counts.attempts++;
        controller=new AbortController();
        const duration=Math.min(timeoutMs,utc(b.deadlineUtc)-start,utc(s.expiresUtc)-start);
        const intent=Object.freeze({...provenance,account,bucket,jurisdiction:'default',purpose,method:'HEAD',key,keys:b.keys,
          ordinal:counts.attempts,maxHeads:2,maxPerKey:1,notBeforeUtc:b.notBeforeUtc,deadlineUtc:b.deadlineUtc,
          permission:'object-read-only',singleBucket:true,ownerExplicitUseRevision:true});
        source={...provenance,account,bucket,jurisdiction:'default',purpose,method:'HEAD',key,
          admissionStartedUtc:new Date(start).toISOString()};
        observation={key,calls:0,response:null,controller,wallDeadline:wallStart+duration};active=observation;
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
          timedOut=true;stopped=true;controller.abort();reject(Error('LEGACY_HEAD_TIMEOUT'));
        },duration);});
        counts.admissions++;
        if(await Promise.race([Promise.resolve().then(()=>beforeDispatch(intent)),timeout])!==true)throw Error();
        const dispatch=now();
        if(stopped||closed||controller.signal.aborted||!inWindow(dispatch)||dispatch<start
          ||performance.now()>=observation.wallDeadline)throw Error();
        source.startedUtc=new Date(dispatch).toISOString();
        counts.sdkCalls++;
        let sdkStatus=null,sdkFailed=false;
        await Promise.race([client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:controller.signal})
          .then(result=>{sdkStatus=result?.$metadata?.httpStatusCode;})
          .catch(error=>{sdkFailed=true;sdkStatus=error?.$metadata?.httpStatusCode;}),timeout]);
        const end=now(),r=observation.response;
        source.completedUtc=new Date(end).toISOString();
        if(stopped||closed||!inWindow(end)||end<dispatch||end-start>duration||performance.now()>=observation.wallDeadline
          ||observation.calls!==1||!r||r.redirected||!r.providerRequestId&&!r.ray)throw Error();
        let state;
        if(r.status===200&&!sdkFailed&&sdkStatus===200&&r.errorCode===null
          &&r.sizeBytes!==null&&r.mimeType!==null&&r.etag!==null)state='EXISTS';
        // A pin is not provider semantics proof. The durable caller must validate
        // actual header reliability evidence; fixture declarations cannot supply it.
        else if(r.status===404&&sdkFailed&&sdkStatus===404&&r.errorCode==='NoSuchKey'
          &&s.notFoundHeaderSemantics==='RELIABLE_NOSUCHKEY_HEADER_V1'&&hashPin(s.notFoundHeaderEvidenceSha256))state='NOT_FOUND';
        else throw Error();
        return {state,source,response:safeResponse(r),mode,productionAuthority:false,
          notFoundClassification:state==='NOT_FOUND'?'EXPLICIT_NOSUCHKEY_HEADER_WITH_CALLER_VERIFIED_PROVENANCE':null};
      }catch{
        stopped=true;
        const end=now();if(source&&Number.isFinite(end))source.completedUtc=new Date(end).toISOString();
        return unknown(timedOut?'TIMEOUT':'UNPROVEN',source,safeResponse(observation?.response));
      }finally{clearTimeout(timer);controller?.abort();active=null;busy=false;}
    },
    close(){closed=true;stopped=true;active?.controller.abort();client.destroy();agent?.destroy();
      for(const key of Object.keys(secret))secret[key]='';}
  });
}
