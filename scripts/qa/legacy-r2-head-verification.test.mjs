import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const api=await import('./legacy-r2-head-verification.mjs').catch(error=>{
  if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
  return {};
});
const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';
const keys=['tmp/00000000-0000-0000-0000-000000000001/legacy-first.mp4',
  'tmp/00000000-0000-0000-0000-000000000002/legacy-second.webm'];
const pins={manifestSha256:'1'.repeat(64),sourceSha256:'2'.repeat(64),executionBindingSha256:'3'.repeat(64),
  connectionBindingSha256:'4'.repeat(64),ownerUseRevisionSha256:'5'.repeat(64)};
const binding={...pins,purpose:'LEGACY_EXACT_HEAD_ONLY_V1',account,bucket,jurisdiction:'default',
  keys,maxHeads:2,maxPerKey:1,notBeforeUtc:'2026-10-30T10:00:00.000Z',deadlineUtc:'2026-10-30T11:00:00.000Z'};
const scope={...pins,purpose:binding.purpose,account,bucket,jurisdiction:'default',permission:'object-read-only',
  singleBucket:true,ownerExplicitUseRevision:true,issuedUtc:binding.notBeforeUtc,expiresUtc:'2026-10-31T10:00:00.000Z',
  supplierProvenanceSha256:'6'.repeat(64),bucketProvenanceSha256:'7'.repeat(64),credentialScopeEvidenceSha256:'8'.repeat(64)};
const credentials={accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64),sessionToken:'OFFLINE_FICTITIOUS_SESSION_ONLY'};
const baseHeaders={'x-amz-request-id':'fixture-request','cf-ray':'fixture-AKL','content-length':'9876',
  'content-type':'video/mp4',etag:'"'+'c'.repeat(32)+'"'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function setup(t,entries=[{status:200},{status:200}],options={}) {
  assert.equal(typeof api.createLegacyR2HeadVerifier,'function');
  let instant=Date.parse('2026-10-30T10:00:02.000Z'),bodyReads=0,bodyDestroys=0,transportDestroys=0;
  const requests=[],gates=[];
  const handler={destroy(){transportDestroys++;},async handle(request,transportOptions){
    requests.push({method:request.method,protocol:request.protocol,hostname:request.hostname,
      exactSealedPath:keys.some(key=>request.path===`/${bucket}/${key}`),
      bodyAbsent:request.body===undefined,signed:/^AWS4-HMAC-SHA256 /.test(request.headers.authorization??''),
      sameCredential:request.headers['x-amz-security-token']===credentials.sessionToken,
      aborted:transportOptions.abortSignal.aborted});
    const entry=entries.shift();
    if(entry?.error)throw Object.assign(Error('PRIVATE_EXCEPTION_MUST_NOT_ESCAPE'),entry.error);
    if(entry?.pending)return entry.pending;
    return {response:{statusCode:entry?.status??200,headers:{...baseHeaders,...entry?.headers},body:{
      destroy(){bodyDestroys++;},[Symbol.asyncIterator](){bodyReads++;throw Error('BODY_READ_FORBIDDEN');},
      on(){bodyReads++;throw Error('BODY_READ_FORBIDDEN');}
    }}};
  }};
  const verifier=api.createLegacyR2HeadVerifier({binding:structuredClone(binding),scope:structuredClone(scope),
    credentials:{...credentials},now:()=>instant,timeoutMs:1000,requestHandler:handler,
    beforeDispatch:async intent=>{gates.push(intent);return true;},...options});
  t.after(()=>verifier.close());
  return {verifier,requests,gates,at:utc=>{instant=Date.parse(utc);},
    counters:()=>({bodyReads,bodyDestroys,transportDestroys})};
}

test('legacy HEAD: actual SDK sends exactly two sealed HEADs with safe private metadata',async t=>{
  const s=setup(t,[{status:200,headers:{'x-amz-storage-class':'STANDARD'}},
    {status:200,headers:{'content-length':'4321','content-type':'video/webm',etag:'"'+'d'.repeat(32)+'-2"'}}]);
  const a=await s.verifier.head({key:keys[0]}),b=await s.verifier.head({key:keys[1]});
  assert.deepEqual([a.state,b.state],['EXISTS','EXISTS']);
  assert.equal(a.response.sizeBytes,9876);assert.equal(b.response.sizeBytes,4321);
  assert.equal(a.response.mimeType,'video/mp4');assert.equal(a.response.storageClass,'Standard');
  assert.equal(b.response.storageClass,'UNKNOWN');assert.equal(b.response.etag.endsWith('-2"'),true);
  assert.equal(a.source.key===keys[0],true);assert.equal(b.source.key===keys[1],true);
  assert.equal(a.source.manifestSha256===pins.manifestSha256,true);
  assert.equal(a.source.ownerUseRevisionSha256===pins.ownerUseRevisionSha256,true);
  assert.equal(a.source.bucketProvenanceSha256===scope.bucketProvenanceSha256,true);
  assert.equal(s.gates.length,2);assert.deepEqual(s.gates.map(g=>g.ordinal),[1,2]);
  assert.equal(s.requests.length,2);
  assert.equal(s.requests.every(r=>r.method==='HEAD'&&r.protocol==='https:'&&r.hostname===`${account}.r2.cloudflarestorage.com`
    &&r.exactSealedPath&&r.bodyAbsent&&r.signed&&r.sameCredential&&!r.aborted),true);
  for(const receipt of [a,b]) {
    assert.equal(receipt.mode,'OFFLINE_FIXTURE');assert.equal(receipt.productionAuthority,false);
    const serialized=JSON.stringify(receipt);
    assert.equal(Object.values(credentials).some(value=>serialized.includes(value)),false);
    assert.equal(/authorization|secretAccessKey|accessKeyId|sessionToken/i.test(serialized),false);
  }
  assert.deepEqual(s.verifier.counts,{attempts:2,admissions:2,sdkCalls:2,transportCalls:2});
  assert.equal(s.counters().bodyReads,0);assert.equal(s.counters().bodyDestroys,2);
});

test('legacy HEAD: each key is single use and total budget cannot expand',async t=>{
  const s=setup(t);await s.verifier.head({key:keys[0]});
  assert.equal((await s.verifier.head({key:keys[0]})).state,'UNKNOWN');
  assert.equal((await s.verifier.head({key:keys[1]})).state,'UNKNOWN');
  assert.equal(s.requests.length,1);assert.equal(s.gates.length,1);
  const both=setup(t);await both.verifier.head({key:keys[0]});await both.verifier.head({key:keys[1]});
  assert.equal((await both.verifier.head({key:keys[1]})).state,'UNKNOWN');assert.equal(both.requests.length,2);
  assert.throws(()=>setup(t,[],{binding:{...binding,maxHeads:3}}),/LEGACY_HEAD_ADMISSION_INVALID/);
});

test('legacy HEAD: wrong or suffix targets stop before the caller gate',async t=>{
  for(const key of [keys[0]+'.suffix','tmp/other/file.mp4',keys[0].replace('legacy-first','../legacy-first'),
    'https://untrusted.invalid/file',keys[0].replace('tmp/','retained/')]) {
    const s=setup(t);assert.equal((await s.verifier.head({key})).state,'UNKNOWN');
    assert.equal(s.requests.length,0);assert.equal(s.gates.length,0);
  }
});

test('legacy HEAD: exact scope, pins, supplier lifetime and fresh owner use are mandatory',t=>{
  const patches=[{binding:{...binding,account:'different'}},{binding:{...binding,bucket:'different'}},
    {binding:{...binding,jurisdiction:'eu'}},{binding:{...binding,purpose:'D_HEAD'}},
    {binding:{...binding,keys:[keys[0],keys[0]]}},{binding:{...binding,keys:[keys[0]]}},
    {binding:{...binding,keys:[keys[0],keys[1]+'/nested']}},
    {binding:{...binding,deadlineUtc:'2026-10-30T11:00:00.001Z'}},
    {scope:{...scope,permission:'object-read-write'}},{scope:{...scope,singleBucket:false}},
    {scope:{...scope,ownerExplicitUseRevision:false}},
    {scope:{...scope,ownerUseRevisionSha256:'9'.repeat(64)}},
    {scope:{...scope,sourceSha256:'9'.repeat(64)}},{scope:{...scope,manifestSha256:'9'.repeat(64)}},
    {scope:{...scope,connectionBindingSha256:'9'.repeat(64)}},
    {scope:{...scope,supplierProvenanceSha256:undefined}},
    {scope:{...scope,bucketProvenanceSha256:undefined}},
    {scope:{...scope,issuedUtc:'2026-10-30T10:00:01.000Z'}},
    {scope:{...scope,expiresUtc:'2026-10-31T10:00:00.001Z'}},
    {scope:{...scope,expiresUtc:'2026-10-30T10:30:00.000Z'}},
    {now:()=>Date.parse('2026-10-30T09:59:59.999Z')},
    {now:()=>Date.parse(binding.deadlineUtc)},{timeoutMs:10001}];
  for(const patch of patches)assert.throws(()=>setup(t,[],patch),/LEGACY_HEAD_ADMISSION_INVALID/);
});

test('legacy HEAD: denied durable gate consumes the attempt without sending or retrying',async t=>{
  let admissions=0;
  const s=setup(t,[],{beforeDispatch:async()=>{admissions++;return false;}});
  const r=await s.verifier.head({key:keys[0]});
  assert.equal(r.state,'UNKNOWN');assert.equal(r.stopped,true);
  await s.verifier.head({key:keys[0]});assert.equal(admissions,1);assert.equal(s.requests.length,0);
  assert.deepEqual(s.verifier.counts,{attempts:1,admissions:1,sdkCalls:0,transportCalls:0});
});

test('legacy HEAD: missing owner use revision is rejected before credential inspection',t=>{
  let inspected=0;
  const privateInput={get accessKeyId(){inspected++;return credentials.accessKeyId;},
    get secretAccessKey(){inspected++;return credentials.secretAccessKey;}};
  assert.throws(()=>setup(t,[],{scope:{...scope,ownerExplicitUseRevision:false},credentials:privateInput}),
    /LEGACY_HEAD_ADMISSION_INVALID/);
  assert.equal(inspected,0);
});

test('legacy HEAD: snapshot survives caller mutation during admission',async t=>{
  const b=structuredClone(binding),sc=structuredClone(scope),secret={...credentials},input={key:keys[0]};
  let release;const waiting=new Promise(resolve=>{release=resolve;});let entered=false;
  const s=setup(t,[{status:200}],{binding:b,scope:sc,credentials:secret,
    beforeDispatch:async intent=>{entered=true;assert.equal(Object.isFrozen(intent.keys),true);await waiting;return true;}});
  const pending=s.verifier.head(input);await tick();assert.equal(entered,true);
  b.keys[0]='tmp/changed/changed.mp4';b.sourceSha256='9'.repeat(64);sc.bucket='wrong';sc.ownerExplicitUseRevision=false;
  secret.secretAccessKey='wrong';input.key='tmp/changed/changed.mp4';release();
  const r=await pending;assert.equal(r.state,'EXISTS');assert.equal(r.source.key===keys[0],true);
  assert.equal(r.source.sourceSha256===pins.sourceSha256,true);assert.equal(s.requests[0].sameCredential,true);
});

test('legacy HEAD: late admission cannot dispatch after the inclusive operation timeout',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const s=setup(t,[],{timeoutMs:20,beforeDispatch:()=>gate});
  assert.equal((await s.verifier.head({key:keys[0]})).state,'UNKNOWN');release(true);await tick();
  assert.equal(s.requests.length,0);assert.equal(s.verifier.counts.sdkCalls,0);
});

test('legacy HEAD: stalled transport times out once and never retries',async t=>{
  const s=setup(t,[{pending:new Promise(()=>{})}],{timeoutMs:30});
  const r=await s.verifier.head({key:keys[0]});assert.equal(r.state,'UNKNOWN');
  await s.verifier.head({key:keys[1]});assert.equal(s.requests.length,1);
  assert.equal(s.verifier.counts.sdkCalls,1);assert.equal(r.providerCancellationProven,false);
});

test('legacy HEAD: 403, throttling, redirect and thrown SDK errors remain safe UNKNOWN',async t=>{
  for(const entry of [{status:403},{status:401},{status:429},{status:503},{status:301},
    {status:307},{status:200,headers:{location:'https://untrusted.invalid/'}},
    {error:{name:'AccessDenied',authorization:'PRIVATE_AUTH_MUST_NOT_ESCAPE'}}]) {
    const s=setup(t,[entry]);const r=await s.verifier.head({key:keys[0]});
    assert.equal(r.state,'UNKNOWN');assert.equal(r.mode,'OFFLINE_FIXTURE');assert.equal(r.productionAuthority,false);
    assert.equal(JSON.stringify(r).includes('PRIVATE_'),false);
    await s.verifier.head({key:keys[1]});assert.equal(s.requests.length,1);
    assert.equal(s.counters().bodyReads,0);
  }
});

test('legacy HEAD: only evidenced explicit NoSuchKey 404 can report NOT_FOUND',async t=>{
  const trustedScope={...scope,notFoundHeaderSemantics:'RELIABLE_NOSUCHKEY_HEADER_V1',notFoundHeaderEvidenceSha256:'9'.repeat(64)};
  const cases=[
    {status:404,headers:{'x-amz-error-code':'NoSuchKey'},scope:trustedScope,want:'NOT_FOUND'},
    {status:404,headers:{'x-amz-error-code':'NoSuchKey'},scope,want:'UNKNOWN'},
    {status:404,headers:{'x-amz-error-code':'NoSuchBucket'},scope:trustedScope,want:'UNKNOWN'},
    {status:404,headers:{},scope:trustedScope,want:'UNKNOWN'},
    {status:404,headers:{'x-amz-error-code':'NotFound'},scope:trustedScope,want:'UNKNOWN'},
    {status:200,headers:{'content-length':'0','content-type':undefined,etag:undefined},scope:trustedScope,want:'UNKNOWN'},
    {status:200,headers:{'x-amz-error-code':'NoSuchKey'},scope:trustedScope,want:'UNKNOWN'}
  ];
  for(const entry of cases){const s=setup(t,[entry],{scope:entry.scope});
    const r=await s.verifier.head({key:keys[0]});assert.equal(r.state,entry.want);
    assert.equal(r.productionAuthority,false);assert.equal(s.requests.length,1);assert.equal(s.counters().bodyReads,0);
  }
});

test('legacy HEAD: generic 404 preserves bounded error and wire diagnostics without claiming absence',async t=>{
  for(const errorCode of [undefined,'NoSuchKey','NoSuchBucket']) {
    const s=setup(t,[{status:404,headers:{'x-amz-error-code':errorCode}}]);
    const r=await s.verifier.head({key:keys[0]});
    assert.equal(r.state,'UNKNOWN');assert.equal(r.reason,'HEAD_404_ABSENCE_NOT_PROVEN_UNDER_CURRENT_CONTRACT');
    assert.equal(r.response.errorCode,errorCode===undefined?null:errorCode==='NoSuchKey'?'NoSuchKey':'OTHER');
    assert.equal(r.response.redirected,false);
    assert.equal(r.source.transportEvidence.requestBound,true);
    assert.equal(r.source.transportEvidence.sdkStatus,404);assert.equal(r.source.transportEvidence.sdkFailed,true);
    assert.equal(r.source.transportEvidence.responseWithinDeadline,true);
    assert.equal(r.source.transportEvidence.tlsCertificateVerification,'OFFLINE_FIXTURE');
    assert.equal(r.source.transportEvidence.bodyRead,false);
    assert.equal(JSON.stringify(r).includes(credentials.secretAccessKey),false);
    assert.equal(s.requests.length,1);assert.equal(s.counters().bodyReads,0);
  }
});

test('legacy HEAD: prospective context contract needs independent real-evidence admission, never just 404 or pins',async t=>{
  const absenceContext={bucketReceiptSha256:'9'.repeat(64),lockReceiptSha256:'a'.repeat(64),
    continuityReceiptSha256:'b'.repeat(64),credentialScopeEvidenceSha256:scope.credentialScopeEvidenceSha256,
    bucketObservedUtc:binding.notBeforeUtc,continuityConfirmedUtc:binding.notBeforeUtc,
    protectedUntilUtc:'2026-11-04T12:00:00.000Z'};
  const options={binding:{...binding,absenceSemantics:'VERIFIED_BUCKET_CONTEXT_V2'},
    scope:{...scope,absenceSemantics:'VERIFIED_BUCKET_CONTEXT_V2',absenceContext},
    verifyAbsenceContext:intent=>intent.absenceContext===undefined?false:
      intent.key===keys[0]&&intent.absenceContext.bucketReceiptSha256==='9'.repeat(64)};
  const s=setup(t,[{status:404}],options),r=await s.verifier.head({key:keys[0]});
  assert.equal(r.state,'NOT_PRESENT_AT_OBSERVATION');assert.equal(r.productionAuthority,false);
  assert.equal(r.source.absenceSemantics,'VERIFIED_BUCKET_CONTEXT_V2');assert.equal(r.response.errorCode,null);
  for(const verifyAbsenceContext of [()=>false,()=>({verified:true}),()=>Promise.resolve(true),()=>{throw Error('PRIVATE');}]){
    const denied=setup(t,[],{...options,verifyAbsenceContext});
    assert.equal((await denied.verifier.head({key:keys[0]})).state,'UNKNOWN');assert.equal(denied.requests.length,0);
  }
  for(const code of ['NoSuchBucket','AccessDenied']){
    const rejected=setup(t,[{status:404,headers:{'x-amz-error-code':code}}],options);
    assert.equal((await rejected.verifier.head({key:keys[0]})).state,'UNKNOWN');
  }
  assert.throws(()=>setup(t,[],{...options,verifyAbsenceContext:undefined}),/ADMISSION_INVALID/);
  assert.throws(()=>setup(t,[],{...options,scope:{...options.scope,
    absenceContext:{...absenceContext,secretAccessKey:'MUST_NOT_CAPTURE'}}}),/ADMISSION_INVALID/);
  const stale=setup(t,[],{...options,scope:{...options.scope,absenceContext:{...absenceContext,
    bucketObservedUtc:'2026-10-30T08:59:59.000Z'}}});
  assert.equal((await stale.verifier.head({key:keys[0]})).state,'UNKNOWN');assert.equal(stale.requests.length,0);
});

test('legacy HEAD: malformed metadata or missing provider identity cannot prove EXISTS',async t=>{
  for(const headers of [{'x-amz-request-id':undefined,'cf-ray':undefined},{'content-length':undefined},
    {'content-length':'9007199254740992'},{'content-type':undefined},{etag:undefined},{etag:'invalid'},
    {'content-type':'video/mp4\r\nunsafe'},{'x-amz-request-id':'unsafe\n','cf-ray':undefined}]) {
    const s=setup(t,[{status:200,headers}]);assert.equal((await s.verifier.head({key:keys[0]})).state,'UNKNOWN');
    assert.equal(s.requests.length,1);assert.equal(s.counters().bodyReads,0);
  }
  const rayOnly=setup(t,[{status:200,headers:{'x-amz-request-id':undefined}}]);
  assert.equal((await rayOnly.verifier.head({key:keys[0]})).state,'EXISTS');
});

test('legacy HEAD: expiry crossing during admission prevents a send',async t=>{
  let s;s=setup(t,[],{beforeDispatch:async()=>{s.at(binding.deadlineUtc);return true;}});
  assert.equal((await s.verifier.head({key:keys[0]})).state,'UNKNOWN');assert.equal(s.requests.length,0);
});

test('legacy HEAD: concurrent calls stop the pending operation before dispatch',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const s=setup(t,[],{beforeDispatch:()=>gate});const first=s.verifier.head({key:keys[0]});await tick();
  assert.equal((await s.verifier.head({key:keys[1]})).state,'UNKNOWN');release(true);
  assert.equal((await first).state,'UNKNOWN');assert.equal(s.requests.length,0);
});

test('legacy HEAD: close during admission prevents late SDK dispatch',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const s=setup(t,[],{beforeDispatch:()=>gate});const pending=s.verifier.head({key:keys[0]});await tick();
  s.verifier.close();release(true);assert.equal((await pending).state,'UNKNOWN');
  assert.equal(s.requests.length,0);assert.equal((await s.verifier.head({key:keys[1]})).state,'UNKNOWN');
});

test('legacy HEAD: fresh import and native transport construction never connect',()=>{
  const code=`
    import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';
    import {syncBuiltinESMExports} from 'node:module';
    let attempts=0;const blocked=()=>{attempts++;throw Error('OFFLINE_NETWORK_FORBIDDEN');};
    for(const mod of [http,https]){mod.request=blocked;mod.get=blocked;mod.Agent.prototype.createConnection=blocked;}
    net.connect=blocked;net.createConnection=blocked;net.Socket.prototype.connect=blocked;tls.connect=blocked;
    syncBuiltinESMExports();
    const api=await import(${JSON.stringify(new URL('./legacy-r2-head-verification.mjs',import.meta.url).href)});
    const verifier=api.createLegacyR2HeadVerifier({binding:${JSON.stringify(binding)},scope:${JSON.stringify(scope)},
      credentials:${JSON.stringify(credentials)},now:()=>Date.parse('2026-10-30T10:00:02.000Z'),beforeDispatch:async()=>false});
    verifier.close();process.stdout.write(JSON.stringify({attempts}));`;
  const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const result=execFileSync(process.execPath,['--input-type=module','-e',code],
    {env,encoding:'utf8',windowsHide:true,timeout:5000,stdio:['ignore','pipe','pipe']});
  assert.equal(JSON.parse(result).attempts,0);
});

test('legacy HEAD: late transport response is discarded and its body never read',async t=>{
  let release,bodyReads=0,bodyDestroys=0;
  const late=new Promise(resolve=>{release=resolve;});
  const s=setup(t,[{pending:late}],{timeoutMs:30});
  const result=await s.verifier.head({key:keys[0]});assert.equal(result.state,'UNKNOWN');
  release({response:{statusCode:200,headers:baseHeaders,body:{destroy(){bodyDestroys++;},
    [Symbol.asyncIterator](){bodyReads++;throw Error('BODY_READ_FORBIDDEN');}}}});
  await tick();await tick();
  assert.equal(bodyReads,0);assert.equal(bodyDestroys,1);assert.equal(s.requests.length,1);
  assert.equal(Object.hasOwn(result,'response'),false);
  assert.equal((await s.verifier.head({key:keys[1]})).state,'UNKNOWN');assert.equal(s.requests.length,1);
});
