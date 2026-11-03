import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runLegacyR2HeadHost} from './legacy-r2-head-host.mjs';
import {dHash} from './d-execution-journal.mjs';
import {publishDInputRecord} from './d-input-coordination.mjs';
import {sealBucketRuleBaseline} from './legacy-tmp-lifecycle-safety.mjs';

const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';
const keys=['tmp/00000000-0000-0000-0000-000000000001/first.mp4',
  'tmp/00000000-0000-0000-0000-000000000002/second.mp4'];
const fake={accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)};
function fixture(t,entries=[200,404],patch=()=>{}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-legacy-host-'));
  t.after(()=>{assert.equal(path.dirname(directory),os.tmpdir());assert.match(path.basename(directory),/^ogh-legacy-host-/);
    fs.rmSync(directory,{recursive:true});});
  const store=(name,value)=>{const file=path.join(directory,name);publishDInputRecord(file,value);
    return {path:file,sha256:dHash(fs.readFileSync(file))};};
  const targets=store('targets.private.json',{account,bucket,jurisdiction:'default',legacyTargets:keys.map((key,i)=>({ordinal:i+1,key}))});
  const sourceHashes=Object.fromEntries(['legacy-r2-head-host.mjs','legacy-r2-head-verification.mjs','legacy-tmp-lifecycle-safety.mjs',
    'production-dispatch-guard.mjs','d-input-coordination.mjs','d-execution-journal.mjs']
    .map(name=>['scripts/qa/'+name,dHash(fs.readFileSync('scripts/qa/'+name))]));
  const lock={success:true,status:200,errors:[],result:{rules:keys.map((prefix,i)=>({id:'fixture-'+i,enabled:true,prefix,
    condition:{type:'Date',date:'2026-11-04T12:00:00Z'}}))}};
  const baseline=sealBucketRuleBaseline(Buffer.from(JSON.stringify(lock)),{complete:true,status:200,redirected:false,
    targetVerified:true,account,bucket,jurisdiction:'default',kind:'lock',
    endpoint:`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/lock`});
  const runId=randomUUID();
  const packet={sourceCommit:'1'.repeat(40),sourceHashes,legacyHeadExecution:{maxHeads:2,maxPerKey:1,maxMs:10000,
    manifestSha256:targets.sha256,objectBodyReads:0,retries:0,directory,runId,
    expectedLockConfigurationSha256:baseline.configurationSha256}};patch(packet);
  const sourceAdoption=store('adoption.safe.json',packet);
  const ownerApproval=store('owner.safe.json',{adoptionSha256:sourceAdoption.sha256,provenance:'ACTUAL_OWNER_CHAT_SIGNATURE',
    ownerFields:{LEGACY_EXACT_HEAD_DURABLE_HOST_GO:'APPROVED_FOR_EXACT_TWO_SEALED_KEYS_ONLY',
      LEGACY_HEAD_POSSIBLE_CHARGES_AND_SHARED_READONLY_CREDENTIAL_ACCEPTED:true}});
  const observedUtc=new Date().toISOString();
  const lockRaw=store('lock-response.private.json',{content:[{type:'text',text:JSON.stringify(lock)}]});
  const bucketRaw=store('bucket-response.private.json',{content:[{type:'text',text:JSON.stringify({success:true,status:200,errors:[],
    result:{name:bucket,storage_class:'Standard'}})}]});
  const bucketEvidence=store('bucket.safe.json',{account,bucket,jurisdiction:'default',httpStatus:200,complete:true,
    storageClass:'Standard',acceptedUtc:observedUtc,privateResponse:bucketRaw});
  const lockEvidence=store('lock.safe.json',{account,bucket,jurisdiction:'default',httpStatus:200,complete:true,
    configurationSha256:baseline.configurationSha256,acceptedUtc:observedUtc,privateResponse:lockRaw});
  const continuityEvidence=store('continuity.safe.json',{sourceAdoptionSha256:sourceAdoption.sha256,manifestSha256:targets.sha256,
    provenance:'ACTUAL_OWNER_ONSITE_CONFIRMATION',ownerConfirmed:true,noInterveningConfigurationChange:true,
    destructiveJobsPaused:true,noUnknownInFlightTargetWrites:true,confirmedUtc:observedUtc});
  const supplier={account,bucket,permission:'object-read-only',ttlHours:24,tokenLabel:'FICTITIOUS_ONLY',createdAfterVisiblePrompt:true,
    issuedUtc:new Date(Date.now()-1000).toISOString(),expiresUtc:new Date(Date.now()+86400000-1000).toISOString()};
  const supplierEvidence=store('supplier.safe.json',supplier);
  const plan={directory,runId,sourceAdoption,ownerApproval,targets,bucketEvidence,lockEvidence,continuityEvidence,
    notBeforeUtc:new Date().toISOString(),deadlineUtc:new Date(Date.now()+20000).toISOString(),connectionBindingSha256:'2'.repeat(64)};
  let dispatches=0;
  const requestHandler={async handle(request){
    dispatches++;
    assert.equal(request.method,'HEAD');assert.equal(request.body,undefined);
    assert.equal(keys.some(key=>request.path===`/${bucket}/${key}`),true);
    // The real guard must have durably debited before the SDK reaches transport.
    assert.equal(fs.readdirSync(directory).filter(n=>/LEGACY_HEAD\d\.used\.json$/.test(n)).length,dispatches);
    const status=entries.shift();
    return {response:{statusCode:status,headers:{'x-amz-request-id':'fixture-id',
      ...status===200?{'content-length':'2018','content-type':'video/mp4',etag:'"'+'c'.repeat(32)+'"','x-amz-storage-class':'STANDARD'}:{}},
      body:{destroy(){},on(){throw Error('NO_BODY');}}}};
  },destroy(){}};
  return {directory,plan,supplier,supplierEvidence,requestHandler,dispatches:()=>dispatches};
}

test('legacy host: exact SDK HEAD2 follows durable intents and keeps results private',async t=>{
  const f=fixture(t),result=await runLegacyR2HeadHost({...f,credentials:fake,mode:'SYNTHETIC'});
  assert.equal(result.status,'OBSERVED_NOT_DURABLY_RESOLVED');assert.equal(result.productionPass,false);
  assert.deepEqual(result.observations.map(r=>r.state),['EXISTS','NOT_PRESENT_AT_OBSERVATION']);
  assert.equal(f.dispatches(),2);assert.equal(JSON.stringify(result).includes(keys[0]),false);
  const saved=fs.readdirSync(f.directory).map(n=>fs.readFileSync(path.join(f.directory,n),'utf8')).join('');
  for(const value of Object.values(fake))assert.equal(saved.includes(value),false);
  assert.equal(fake.accessKeyId,'a'.repeat(32));
});

test('legacy preflight: all noncredential bindings checked without signer reservation or dispatch',async t=>{
  const f=fixture(t);
  const result=await runLegacyR2HeadHost({...f,credentials:undefined,supplier:undefined,supplierEvidence:undefined,
    mode:'SYNTHETIC',inspect:true});
  assert.equal(result.status,'NONCREDENTIAL_LEGACY_BINDINGS_READY');assert.equal(result.productionPass,false);
  assert.equal(f.dispatches(),0);
  assert.equal(fs.readdirSync(f.directory).some(n=>/\.used\./.test(n)),false);
  await assert.rejects(runLegacyR2HeadHost({...f,plan:{...f.plan,runId:randomUUID()},mode:'SYNTHETIC',inspect:true}));
});

test('legacy host: UNKNOWN consumes one attempt and stops before the second key',async t=>{
  const f=fixture(t,[403,200]),result=await runLegacyR2HeadHost({...f,credentials:fake,mode:'SYNTHETIC'});
  assert.equal(result.status,'BLOCKED');assert.equal(f.dispatches(),1);
  assert.deepEqual(result.observations.map(r=>r.state),['UNKNOWN']);
  await assert.rejects(runLegacyR2HeadHost({...f,credentials:fake,mode:'SYNTHETIC'}));
  assert.equal(f.dispatches(),1);
});

test('legacy host: no production handler injection or mismatched scope is admitted',async t=>{
  const f=fixture(t);
  await assert.rejects(runLegacyR2HeadHost({...f,credentials:fake,mode:'PRODUCTION',verifyPrivateDirectory:()=>true}));
  const wrong=fixture(t,[200],packet=>{packet.legacyHeadExecution.maxHeads=3;});
  await assert.rejects(runLegacyR2HeadHost({...wrong,credentials:fake,mode:'SYNTHETIC'}));
  assert.equal(f.dispatches(),0);assert.equal(wrong.dispatches(),0);
});

test('legacy host: changed continuity or raw bucket proof stops before any HEAD',async t=>{
  for(const target of ['continuityEvidence','bucketEvidence']) {
    const f=fixture(t);fs.appendFileSync(f.plan[target].path,' ');
    await assert.rejects(runLegacyR2HeadHost({...f,credentials:fake,mode:'SYNTHETIC'}));
    assert.equal(f.dispatches(),0);
  }
});

test('legacy host: signed run identity and adoption-wide reservation cannot be reconstructed',async t=>{
  const f=fixture(t);
  await assert.rejects(runLegacyR2HeadHost({...f,plan:{...f.plan,runId:randomUUID()},credentials:fake,mode:'SYNTHETIC'}));
  assert.equal(f.dispatches(),0);
  await runLegacyR2HeadHost({...f,credentials:fake,mode:'SYNTHETIC'});
  await assert.rejects(runLegacyR2HeadHost({...f,plan:{...f.plan,runId:randomUUID()},credentials:fake,mode:'SYNTHETIC'}));
  assert.equal(f.dispatches(),2);
});

test('legacy host: STOP during first request prevents second request and aborts active scope',async t=>{
  const f=fixture(t),original=f.requestHandler.handle;let active=true;
  f.requestHandler.handle=async request=>{const result=await original(request);active=false;return result;};
  const result=await runLegacyR2HeadHost({...f,credentials:fake,mode:'SYNTHETIC',assertAdmissionActive:()=>active});
  assert.equal(f.dispatches(),1);assert.equal(result.status,'BLOCKED');
  assert.equal(result.observations[0].state,'UNKNOWN');
  const saved=JSON.parse(fs.readFileSync(result.observations[0].privateEvidence.path));
  assert.equal(saved.acknowledged,false);
});

test('legacy host: internally consistent but changed Lock rules cannot replace the signed C baseline',async t=>{
  const f=fixture(t),evidence=JSON.parse(fs.readFileSync(f.plan.lockEvidence.path));
  const raw=JSON.parse(fs.readFileSync(evidence.privateResponse.path)),payload=JSON.parse(raw.content[0].text);
  payload.result.rules.push({id:'unrelated-new-rule',enabled:true,prefix:'other/',condition:{type:'Date',date:'2026-11-04T12:00:00Z'}});
  raw.content[0].text=JSON.stringify(payload);fs.writeFileSync(evidence.privateResponse.path,JSON.stringify(raw));
  evidence.privateResponse.sha256=dHash(fs.readFileSync(evidence.privateResponse.path));
  evidence.configurationSha256=sealBucketRuleBaseline(Buffer.from(JSON.stringify(payload)),{complete:true,status:200,
    redirected:false,targetVerified:true,account,bucket,jurisdiction:'default',kind:'lock',
    endpoint:`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/lock`}).configurationSha256;
  fs.writeFileSync(f.plan.lockEvidence.path,JSON.stringify(evidence));f.plan.lockEvidence.sha256=dHash(fs.readFileSync(f.plan.lockEvidence.path));
  await assert.rejects(runLegacyR2HeadHost({...f,credentials:fake,mode:'SYNTHETIC'}));
  assert.equal(f.dispatches(),0);
});
