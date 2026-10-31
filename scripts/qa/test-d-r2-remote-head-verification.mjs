import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDHeadVerifier,isDHeadVerifier,bindDHeadCleanupReadback,bindDHeadPersistence} from './d-r2-head-verification.mjs';
import {runDBoundCleanup} from './legacy-tmp-lifecycle-safety.mjs';

// All bucket handles and receipts in this file are isolated OFFLINE fixtures.
const hash=v=>createHash('sha256').update(v).digest('hex');
const bytes=v=>Buffer.from(JSON.stringify(v));
const epoch=Date.parse('2026-10-31T10:00:00.000Z');
const time=n=>new Date(epoch+n).toISOString();
const actorId='22222222-2222-4222-8222-222222222222',postId='11111111-1111-4111-8111-111111111111';
const source=`tmp/${actorId}/${postId}/fixture.mp4`;
const retained=`${actorId}/${postId}/r2-retained-33333333-3333-4333-8333-333333333333.mp4`;
const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';
const actorRaw=bytes({executionBindingSha256:'1'.repeat(64),actorId,createdByThisRun:true,
  createdUtc:time(0),providerReceiptSha256:'a'.repeat(64)});
const baseBinding={executionBindingSha256:'1'.repeat(64),connectionBindingSha256:'2'.repeat(64),
  actorCreationReceiptSha256:hash(actorRaw),actorId,postId,creationMode:'SERVER_RECEIPT_V2',
  identityReceiptSha256:'3'.repeat(64),frozenArtifactSha256:'4'.repeat(64),observerSourceSha256:'5'.repeat(64),
  remoteSourceSha256:'6'.repeat(64),notBeforeUtc:time(0),deadlineUtc:time(1800000)};
const scope={account,bucket,jurisdiction:'default',permission:'object-read-only',evidenceSha256:'7'.repeat(64),
  bucketProvenanceSha256:'8'.repeat(64),configurationWindowBindingSha256:baseBinding.executionBindingSha256,
  expiresUtc:time(1800000)};
const session={schemaVersion:1,kind:'R2_REMOTE_HEAD_SESSION_V1',account,bucket,jurisdiction:'default',
  executionBindingSha256:baseBinding.executionBindingSha256,connectionBindingSha256:baseBinding.connectionBindingSha256,
  sourceSha256:baseBinding.remoteSourceSha256,scopeEvidenceSha256:scope.evidenceSha256,
  bucketProvenanceSha256:scope.bucketProvenanceSha256,configurationWindowBindingSha256:scope.configurationWindowBindingSha256,
  establishedUtc:time(0),expiresUtc:scope.expiresUtc,offlineFixture:true};
const sessionRaw=bytes(session);
const binding={...baseBinding,remoteSessionReceiptSha256:hash(sessionRaw)};
const etag='c'.repeat(32),httpEtag=`"${etag}"`;
const creationRaw=(keys=[source,retained])=>bytes({...baseBinding,account,bucket,jurisdiction:'default',keys,
  observedUtc:time(1000),uploadReceiptSha256:'9'.repeat(64),retentionReceiptSha256:'a'.repeat(64),
  objectMetadata:keys.map(key=>({key,sizeBytes:2018,mimeType:'video/mp4',etag:httpEtag}))});
const deletion=(raw=creationRaw(),started=4000)=>({...baseBinding,account,bucket,jurisdiction:'default',
  method:'DELETE',status:200,complete:true,requestId:'offline-delete',responseSha256:'b'.repeat(64),
  creationReceiptSha256:hash(raw),keys:JSON.parse(raw).keys,createdKeys:JSON.parse(raw).keys,
  startedUtc:time(started),completedUtc:time(started+1000)});
const object=(key=retained,patch={})=>({key,size:2018,etag,httpEtag,version:'offline-version-1',
  uploaded:new Date(time(500)),storageClass:'Standard',...patch});
function setup(results=[object(),null],options={}) {
  let instant=epoch+2000;
  const calls=[],intents=[];
  const remoteBucket={async head(key){calls.push(key);const result=results.shift();
    if(result instanceof Error)throw result;
    return typeof result==='function'?result(key):result;}};
  const verifier=createDHeadVerifier({binding,scope,remoteBucket,remoteSessionRaw:sessionRaw,offlineFixture:true,
    now:()=>instant,timeoutMs:30,beforeDispatch:async intent=>{intents.push(intent);return true;},...options});
  return {verifier,calls,intents,at:n=>{instant=epoch+n;}};
}

test('remote HEAD: real registry binds present, bound deletion, and actual null without invented HTTP facts',async()=>{
  const s=setup();const raw=creationRaw(),d=deletion(raw);
  try {
    assert.equal(isDHeadVerifier(s.verifier),true);
    const present=await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:raw});
    assert.equal(present.state,'PRESENT');assert.equal(present.storageClass,'Standard');
    assert.equal(present.source.kind,'r2-binding-head');assert.equal(present.source.method,'R2Bucket.head');
    assert.equal(present.mode,'OFFLINE_FIXTURE');assert.equal(present.response.version,'offline-version-1');
    s.at(6000);
    const absent=await s.verifier.head({phase:'AFTER_DELETE',key:retained,creationRaw:raw,deletion:d});
    assert.equal(absent.state,'ABSENT');
    assert.equal(absent.notFoundClassification,'AUTHENTICATED_R2_BINDING_NULL_AT_QUERY');
    for(const receipt of [present,absent]) {
      for(const name of ['status','providerRequestId','ray','errorCode'])assert.equal(Object.hasOwn(receipt.response,name),false);
      assert.equal(Object.hasOwn(receipt.source,'endpoint'),false);
      assert.equal(Object.hasOwn(receipt.source,'credentialScopeEvidenceSha256'),false);
      assert.equal(Object.hasOwn(receipt.source,'credentialExpiresUtc'),false);
      assert.equal(receipt.source.remoteScopeEvidenceSha256,scope.evidenceSha256);
      assert.equal(receipt.source.remoteSessionExpiresUtc,session.expiresUtc);
      assert.equal(receipt.productionAuthority,false);
    }
    assert.equal(bindDHeadCleanupReadback(absent,d,raw).state,'ABSENCE_OBSERVED_AFTER_DELETE');
    assert.equal(bindDHeadCleanupReadback(structuredClone(absent),d,raw).state,'UNKNOWN');
    assert.equal(bindDHeadCleanupReadback(absent,{...d,requestId:'different'},raw).state,'UNKNOWN');
    assert.deepEqual(s.calls,[retained,retained]);
    assert.equal(s.intents[0].remoteSessionReceiptSha256,hash(sessionRaw));
  }finally{s.verifier.close();}
});

test('remote HEAD: rejects unbound session/scope/handle and mixed S3 configuration before any call',()=>{
  for(const options of [
    {remoteSessionRaw:bytes({...session,bucket:'other'})},
    {binding:{...binding,remoteSessionReceiptSha256:'0'.repeat(64)}},
    {binding:{...binding,remoteSourceSha256:'0'.repeat(64)}},
    {remoteSessionRaw:bytes({...session,executionBindingSha256:'0'.repeat(64)})},
    {scope:{...scope,permission:'admin-read-write'}},
    {scope:{...scope,expiresUtc:time(1000)}},
    {remoteBucket:{get(){assert.fail('body traffic');}}},
    {requestHandler:{handle(){assert.fail('S3 traffic');}}},
    {credentials:{accessKeyId:'fictitious',secretAccessKey:'fictitious'}},
    {offlineFixture:false},
    {timeoutMs:10001},
    {binding:{...binding,creationMode:undefined}},
  ]) assert.throws(()=>setup([] ,options),/D_HEAD_/);
});

test('remote HEAD: non-fixture registration schema is exercised offline without opening transport',()=>{
  const raw=bytes({...session,offlineFixture:false});
  let calls=0;
  const s=setup([],{binding:{...binding,remoteSessionReceiptSha256:hash(raw)},remoteSessionRaw:raw,offlineFixture:false,
    remoteBucket:{head(){calls++;assert.fail('construction must not invoke transport');}}});
  assert.equal(isDHeadVerifier(s.verifier),true);assert.equal(calls,0);s.verifier.close();
});

test('remote HEAD: rehashed but wrong session bindings, provenance and validity cannot be substituted',()=>{
  for(const patch of [{schemaVersion:2},{kind:'other'},{account:'0'.repeat(32)},{bucket:'other'},
    {jurisdiction:'eu'},{executionBindingSha256:'0'.repeat(64)},{connectionBindingSha256:'0'.repeat(64)},
    {sourceSha256:'0'.repeat(64)},{scopeEvidenceSha256:'0'.repeat(64)},{bucketProvenanceSha256:'0'.repeat(64)},
    {configurationWindowBindingSha256:'0'.repeat(64)},{establishedUtc:time(1)},
    {establishedUtc:'invalid'},{expiresUtc:time(1799999)},{expiresUtc:time(1800001)},{offlineFixture:false}]) {
    const raw=bytes({...session,...patch});
    assert.throws(()=>setup([],{binding:{...binding,remoteSessionReceiptSha256:hash(raw)},remoteSessionRaw:raw}),/D_HEAD_REMOTE_SESSION_INVALID/);
  }
});

test('remote HEAD: metadata and creation mismatches stop permanently without retries',async()=>{
  for(const result of [undefined,false,{},null,object(source),object(retained,{size:2019}),
    object(retained,{etag:'d'.repeat(32),httpEtag:`"${'d'.repeat(32)}"`}),
    object(retained,{etag:httpEtag}),object(retained,{httpEtag:'wrong'}),
    object(retained,{storageClass:undefined}),object(retained,{storageClass:'InfrequentAccess'}),
    object(retained,{version:''}),object(retained,{uploaded:'not-a-date'}),object(retained,{body:{}}),
    object(retained,{uploaded:new Date(time(-1))}),object(retained,{uploaded:new Date(time(1001))}),
    new Error('SYNTHETIC_SECRET_NOT_FOR_OUTPUT')]) {
    const s=setup([result,object()]);
    try {
      const r=await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()});
      assert.equal(r.state,'UNKNOWN');assert.equal(JSON.stringify(r).includes('SYNTHETIC_SECRET'),false);
      assert.equal((await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()})).state,'UNKNOWN');
      assert.equal(s.calls.length,1);
    }finally{s.verifier.close();}
  }
});

test('remote HEAD: null cannot bypass creation, present-before-delete, deletion, key or timing proof',async()=>{
  for(const request of [
    {phase:'AFTER_DELETE',key:retained,creationRaw:creationRaw(),deletion:deletion()},
    {phase:'BEFORE_DELETE',key:retained,creationRaw:bytes({})},
    {phase:'BEFORE_DELETE',key:'tmp/other/file.mp4',creationRaw:creationRaw()},
    {phase:'BEFORE_CREATE',key:source},
  ]) {
    const s=setup([null]);
    assert.equal((await s.verifier.head(request)).state,'UNKNOWN');assert.equal(s.calls.length,0);s.verifier.close();
  }
  for(const patch of [{requestId:'different',creationReceiptSha256:'0'.repeat(64)},
    {startedUtc:time(1000)}, {completedUtc:time(7000)}]) {
    const s=setup();await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()});s.at(6000);
    assert.equal((await s.verifier.head({phase:'AFTER_DELETE',key:retained,creationRaw:creationRaw(),deletion:{...deletion(),...patch}})).state,'UNKNOWN');
    assert.equal(s.calls.length,1);s.verifier.close();
  }
});

test('remote HEAD: retained persistence keeps actual version continuity',async()=>{
  const s=setup([object(),object()]);const raw=creationRaw();
  const initial=await s.verifier.head({phase:'AFTER_CREATE',key:retained,creationRaw:raw});s.at(602000);
  const delayed=await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:raw});
  assert.equal(bindDHeadPersistence(initial,delayed).state,'PERSISTENCE_OBSERVED');
  assert.equal(bindDHeadPersistence(initial,structuredClone(delayed)).state,'UNKNOWN');s.verifier.close();
  const otherSession=bytes({...session,establishedUtc:time(-1)});
  const other=setup([object()],{remoteSessionRaw:otherSession,binding:{...binding,remoteSessionReceiptSha256:hash(otherSession)}});
  other.at(602000);
  const otherDelayed=await other.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:raw});
  assert.equal(otherDelayed.state,'PRESENT');
  assert.equal(bindDHeadPersistence(initial,otherDelayed).state,'UNKNOWN');other.verifier.close();
  const changed=setup([object(),object(retained,{version:'offline-version-2'})]);
  await changed.verifier.head({phase:'AFTER_CREATE',key:retained,creationRaw:raw});changed.at(602000);
  assert.equal((await changed.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:raw})).state,'UNKNOWN');
  changed.verifier.close();
});

test('remote HEAD: gate denial, timeout, late reply and late acknowledgement never regain acceptance',async()=>{
  for(const options of [
    {beforeDispatch:async()=>false},
    {beforeDispatch:()=>new Promise(()=>{})},
    {afterResponse:async()=>false},
    {afterResponse:()=>new Promise(()=>{})},
  ]) {
    const s=setup([object()],options);
    const r=await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()});
    assert.equal(r.state,'UNKNOWN');
    assert.equal((await s.verifier.head({phase:'BEFORE_DELETE',key:source,creationRaw:creationRaw()})).state,'UNKNOWN');
    assert.equal(s.calls.length,options.afterResponse?1:0);s.verifier.close();
  }
  let resolve;
  const s=setup([()=>new Promise(r=>{resolve=r;})]);
  const r=await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()});
  assert.equal(r.state,'UNKNOWN');resolve(object());
  assert.equal((await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()})).state,'UNKNOWN');
  assert.equal(s.calls.length,1);s.verifier.close();
  const unknown=setup([new Error('synthetic')],{onUnknown:()=>new Promise(()=>{})});
  const bounded=await Promise.race([unknown.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()}),
    new Promise(r=>{const timer=setTimeout(()=>r({state:'STALLED'}),300);timer.unref();})]);
  assert.equal(bounded.state,'UNKNOWN');assert.equal(unknown.calls.length,1);unknown.verifier.close();
});

test('remote HEAD: synchronous late admission/response/acknowledgement cannot escape the configured timer',async()=>{
  for(const stage of ['admission','transport','acknowledgement']) {
    let s;
    s=setup([()=>{if(stage==='transport')s.at(2030);return object();}],{
      beforeDispatch:async()=>{if(stage==='admission')s.at(2030);return true;},
      afterResponse:async()=>{if(stage==='acknowledgement')s.at(2030);return true;}});
    assert.equal((await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()})).state,'UNKNOWN');
    assert.equal(s.calls.length,stage==='admission'?0:1);s.verifier.close();
  }
});

test('remote HEAD: expiry after dispatch admission and concurrent close suppress transport/acceptance',async()=>{
  let s;
  s=setup([],{beforeDispatch:async()=>{s.at(1800000);return true;}});
  assert.equal((await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()})).state,'UNKNOWN');
  assert.equal(s.calls.length,0);s.verifier.close();
  let release;
  const t=setup([()=>new Promise(r=>{release=r;})]);
  const pending=t.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()});
  await new Promise(r=>setImmediate(r));t.verifier.close();release(object());
  assert.equal((await pending).state,'UNKNOWN');
  assert.equal(t.calls.length,1);
  let complete;
  const concurrent=setup([()=>new Promise(r=>{complete=r;})]);
  const first=concurrent.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:creationRaw()});
  await new Promise(r=>setImmediate(r));
  assert.equal((await concurrent.verifier.head({phase:'BEFORE_DELETE',key:source,creationRaw:creationRaw()})).state,'UNKNOWN');
  complete(object());assert.equal((await first).state,'UNKNOWN');assert.equal(concurrent.calls.length,1);concurrent.verifier.close();
});

test('remote HEAD: all six permitted phase/key calls consume once; a seventh never dispatches',async()=>{
  const s=setup([object(source),object(),object(source),object(),null,null]);const raw=creationRaw(),d=deletion(raw);
  for(const phase of ['AFTER_CREATE','BEFORE_DELETE','AFTER_DELETE']) {
    if(phase==='AFTER_DELETE')s.at(6000);
    for(const key of [source,retained])assert.notEqual((await s.verifier.head({phase,key,creationRaw:raw,deletion:d})).state,'UNKNOWN');
  }
  assert.equal(s.calls.length,6);
  const another=`${actorId}/${postId}/r2-retained-44444444-4444-4444-8444-444444444444.mp4`;
  assert.equal((await s.verifier.head({phase:'BEFORE_DELETE',key:another,creationRaw:creationRaw([source,another])})).state,'UNKNOWN');
  assert.equal(s.calls.length,6);s.verifier.close();
});

test('remote HEAD: existing cleanup consumes genuine remote registry receipts without LIST or S3',async()=>{
  const raw=creationRaw(),s=setup([object(source),object(),null,null]);
  const ack=JSON.stringify({success:true,result:[{key:source},{key:retained}],errors:[]});
  const result=await runDBoundCleanup({creationRaw:raw,actorCreationRaw:actorRaw,postState:'published',
    target:{actorId,postId,actorCreationReceiptSha256:hash(actorRaw)},headVerifier:s.verifier,
    callbacks:{beforeDispatch:async()=>true,
      ownerDelete:async()=>({postId,postState:'deleted',acknowledged:true}),
      readPost:async()=>({postId,independent:true,postState:'deleted',mediaRows:0,anonymousStatus:404}),
      deleteExactObjects:async()=>{s.at(6000);return {evidence:{...deletion(raw),responseSha256:hash(ack)},rawDecodedResponse:ack};},
      readExactObject:async()=>assert.fail('LIST not authorized'),
      finishActor:async()=>({actorId,actorCreationReceiptSha256:hash(actorRaw),signedOut:true,banned:true,independentReadback:true})}});
  assert.equal(result.state,'CLEANUP_SEQUENCE_VERIFIED');assert.equal(result.objectProofs.length,2);
  assert.equal(result.actorContained,true);assert.deepEqual(s.calls,[source,retained,source,retained]);s.verifier.close();
});

test('remote HEAD: source-only recovery still requires its acknowledged creation and exact delete chain',async()=>{
  const raw=bytes({...JSON.parse(creationRaw([source])),recoveryOnly:true,attachmentDispatched:false,
    uploadAcknowledged:true,retentionReceiptSha256:null,mediaId:null,claimId:null,
    objectMetadata:[{key:source,sizeBytes:2018,mimeType:'video/mp4',etag:null}]});
  const s=setup([object(source),null],{binding:{...binding,creationMode:'SOURCE_UPLOAD_RECOVERY_V1'}});
  const present=await s.verifier.head({phase:'BEFORE_DELETE',key:source,creationRaw:raw});
  assert.equal(present.state,'PRESENT');assert.equal(present.precreationProof,'ACKNOWLEDGED_SOURCE_ONLY_RECOVERY_NOT_D_ACCEPTANCE');
  s.at(6000);const d=deletion(raw);
  const absent=await s.verifier.head({phase:'AFTER_DELETE',key:source,creationRaw:raw,deletion:d});
  assert.equal(bindDHeadCleanupReadback(absent,d,raw).state,'ABSENCE_OBSERVED_AFTER_DELETE');s.verifier.close();
  const bad=setup([object(source)],{binding:{...binding,creationMode:'SOURCE_UPLOAD_RECOVERY_V1'}});
  assert.equal((await bad.verifier.head({phase:'BEFORE_DELETE',key:source,creationRaw:creationRaw([source])})).state,'UNKNOWN');
  assert.equal(bad.calls.length,0);bad.verifier.close();
});
