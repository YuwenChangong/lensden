import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {execFile,spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {runDBoundCleanup} from './legacy-tmp-lifecycle-safety.mjs';

const api=await import('./d-r2-head-verification.mjs').catch(()=>null);
const hash=v=>createHash('sha256').update(v).digest('hex');
const actorId='22222222-2222-4222-8222-222222222222',postId='11111111-1111-4111-8111-111111111111';
const key=`tmp/${actorId}/${postId}/fixture.mp4`;
const retained=`${actorId}/${postId}/r2-retained-33333333-3333-4333-8333-333333333333.mp4`;
const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';
const actorRaw=Buffer.from(JSON.stringify({executionBindingSha256:'1'.repeat(64),actorId,createdByThisRun:true,
  createdUtc:'2026-10-29T10:00:00.000Z',providerReceiptSha256:'8'.repeat(64)}));
const binding={executionBindingSha256:'1'.repeat(64),connectionBindingSha256:'2'.repeat(64),
  actorCreationReceiptSha256:hash(actorRaw),actorId,postId,
  notBeforeUtc:'2026-10-29T10:00:00.000Z',deadlineUtc:'2026-10-29T10:50:00.000Z'};
const scope={account,bucket,jurisdiction:'default',permission:'object-read-only',
  expiresUtc:'2026-10-29T10:55:00.000Z',evidenceSha256:'3'.repeat(64),bucketProvenanceSha256:'9'.repeat(64),
  configurationWindowBindingSha256:binding.executionBindingSha256};
const secrets={accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64),sessionToken:'FICTITIOUS_SESSION_TOKEN_ONLY'};
const allocationRaw=Buffer.from(JSON.stringify({...binding,key,issuedUtc:'2026-10-29T10:00:01.000Z',
  ticketReceiptSha256:'4'.repeat(64)}));
const creationRaw=(keys=[key])=>Buffer.from(JSON.stringify({executionBindingSha256:binding.executionBindingSha256,
  connectionBindingSha256:binding.connectionBindingSha256,account,bucket,jurisdiction:'default',keys,
  observedUtc:'2026-10-29T10:00:04.000Z',uploadReceiptSha256:'5'.repeat(64),retentionReceiptSha256:'6'.repeat(64)}));
const deletion=(bytes=creationRaw())=>({executionBindingSha256:binding.executionBindingSha256,
  connectionBindingSha256:binding.connectionBindingSha256,account,bucket,jurisdiction:'default',method:'DELETE',
  requestId:'independent-delete',keys:JSON.parse(bytes).keys,createdKeys:JSON.parse(bytes).keys,
  creationReceiptSha256:hash(bytes),responseSha256:'7'.repeat(64),status:200,complete:true,
  startedUtc:'2026-10-29T10:00:08.000Z',completedUtc:'2026-10-29T10:00:09.000Z'});

function setup(responses=[404,200,404],options={}) {
  let instant=Date.parse('2026-10-29T10:00:02.000Z');const requests=[],gates=[];
  const handler={destroy(){},async handle(request){
    requests.push(request);const entry=responses.shift();
    if(entry==='timeout')return new Promise(()=>{});
    if(entry==='error')throw Error('SECRET_IN_EXCEPTION_MUST_NOT_ESCAPE');
    const status=typeof entry==='number'?entry:entry.status;
    return {response:{statusCode:status,headers:{'x-amz-request-id':'fixture-provider-id','cf-ray':'abcdef-AKL',
      ...(status===200?{'content-length':'2018',etag:'"'+'c'.repeat(32)+'"','x-amz-storage-class':'STANDARD'}:{}),
      ...(entry.headers??{})},body:Readable.from([])}};
  }};
  const verifier=api.createDHeadVerifier({binding,scope,credentials:{...secrets},requestHandler:handler,
    now:()=>instant,timeoutMs:20,beforeDispatch:async intent=>{gates.push(intent);return true;},...options});
  return {verifier,requests,gates,at:n=>{instant=Date.parse(`2026-10-29T10:00:${String(n).padStart(2,'0')}.000Z`);},
    atUtc:utc=>{instant=Date.parse(utc);}};
}
async function preAndPresent(s,bytes=creationRaw()) {
  const first=await s.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw});assert.equal(first.state,'PRECREATE_NOT_FOUND_CANDIDATE');
  s.at(6);const present=await s.verifier.head({phase:'BEFORE_DELETE',key,creationRaw:bytes});
  assert.equal(present.state,'PRESENT');return {first,present};
}

test('D HEAD: SDK verifier is implemented',()=>assert.equal(typeof api?.createDHeadVerifier,'function'));

test('D 24h exception: exact owner pins admit only the fixed bucket and preserve original four-hour default',()=>{
  const approval='0fb31bcc6a9230ff23914298d781093fa8b90f9f28e627acc59d2063bf885a03';
  const longScope={...scope,issuedUtc:binding.notBeforeUtc,expiresUtc:'2026-10-30T10:00:00.000Z',credentialLifetimeApprovalSha256:approval};
  const longBinding={...binding,credentialLifetimePolicy:'D_24H_OWNER_EXCEPTION_V1',credentialLifetimeApprovalSha256:approval};
  assert.throws(()=>setup([],{scope:longScope}),/D_HEAD_ADMISSION_INVALID/);
  const accepted=setup([],{binding:longBinding,scope:longScope});accepted.verifier.close();assert.equal(accepted.requests.length,0);
  for(const patch of [{binding:{...longBinding,credentialLifetimeApprovalSha256:'0'.repeat(64)}},
    {scope:{...longScope,credentialLifetimeApprovalSha256:'0'.repeat(64)}},
    {binding:{...longBinding,credentialLifetimePolicy:'UNAPPROVED'}},
    {scope:{...longScope,bucket:'another-bucket'}}])
    assert.throws(()=>setup([],{binding:longBinding,scope:longScope,...patch}),/D_HEAD_(CREDENTIAL_EXCEPTION|ADMISSION)_INVALID/);
});

test('D 24h exception: supplier issuance lifetime is bounded while the execution window stays at most three hours',()=>{
  const approval='0fb31bcc6a9230ff23914298d781093fa8b90f9f28e627acc59d2063bf885a03';
  const b={...binding,credentialLifetimePolicy:'D_24H_OWNER_EXCEPTION_V1',credentialLifetimeApprovalSha256:approval};
  const s={...scope,issuedUtc:binding.notBeforeUtc,expiresUtc:'2026-10-30T10:00:00.000Z',credentialLifetimeApprovalSha256:approval};
  for(const patch of [{scope:{...s,issuedUtc:undefined}},{scope:{...s,issuedUtc:'2026-10-29T10:01:00.000Z'}},
    {scope:{...s,issuedUtc:'2026-10-29T09:00:00.000Z'}},{scope:{...s,expiresUtc:'2026-10-30T10:00:00.001Z'}},
    {binding:{...b,deadlineUtc:'2026-10-29T13:00:00.001Z'}}])
    assert.throws(()=>setup([],{binding:b,scope:s,...patch}),/D_HEAD_(CREDENTIAL_EXCEPTION|ADMISSION)_INVALID/);
});

test('D 24h exception: admission sees the exception but denied dispatch still sends no HEAD',async()=>{
  const approval='0fb31bcc6a9230ff23914298d781093fa8b90f9f28e627acc59d2063bf885a03';let admitted;
  const s=setup([],{binding:{...binding,credentialLifetimePolicy:'D_24H_OWNER_EXCEPTION_V1',credentialLifetimeApprovalSha256:approval},
    scope:{...scope,issuedUtc:binding.notBeforeUtc,expiresUtc:'2026-10-30T10:00:00.000Z',credentialLifetimeApprovalSha256:approval},
    beforeDispatch:async intent=>{admitted=intent;return false;}});
  try{assert.equal((await s.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw})).state,'UNKNOWN');
    assert.equal(admitted.credentialLifetimeApprovalSha256,approval);assert.equal(s.requests.length,0);}
  finally{s.verifier.close();}
});

test('D HEAD: actual SDK signs only bound HEAD and links independent absent present absent receipts',async()=>{
  const s=setup();const {present}=await preAndPresent(s);s.at(10);
  const read=await s.verifier.head({phase:'AFTER_DELETE',key,creationRaw:creationRaw(),deletion:deletion()});
  assert.equal(read.state,'ABSENT');assert.equal(read.mode,'OFFLINE_FIXTURE');
  assert.equal(api.bindDHeadCleanupReadback(read,deletion(),creationRaw()).state,'ABSENCE_OBSERVED_AFTER_DELETE');
  assert.equal(s.requests.length,3);assert.equal(s.gates.length,3);
  for(const request of s.requests) {
    assert.equal(request.method,'HEAD');assert.equal(request.hostname,`${account}.r2.cloudflarestorage.com`);
    assert.equal(request.path,`/${bucket}/${key}`);assert.deepEqual(request.query,{});
    assert.match(request.headers.authorization,/^AWS4-HMAC-SHA256 /);
    assert.equal(request.headers['x-amz-security-token'],secrets.sessionToken);
  }
  assert.equal(present.storageClass,'Standard');
  assert.equal(present.precreationProof,'TICKET_BOUND_HEAD404');
  const safe=JSON.stringify([present,read]);
  for(const secret of Object.values(secrets))assert.equal(safe.includes(secret),false);
  assert.equal(read.productionAuthority,false);s.verifier.close();
});

test('D HEAD: 403 errors redirects timeout and unknown outcomes stop once without retry',async()=>{
  for(const response of [403,401,301,307,503,'timeout','error',{status:404,headers:{location:'https://untrusted.invalid/'}}]) {
    const s=setup([response,404]);
    const r=await s.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw});
    assert.equal(r.state,'UNKNOWN');assert.equal(r.stopped,true);
    assert.equal(JSON.stringify(r).includes('SECRET_IN_EXCEPTION'),false);
    await s.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw});
    assert.equal(s.requests.length,1);s.verifier.close();
  }
});

test('D HEAD: failure receipts retain safe request provenance and bucket errors never become absence',async()=>{
  const denied=setup([403]);
  const failure=await denied.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw});
  assert.equal(failure.source.key,key);assert.equal(failure.source.method,'HEAD');
  assert.equal(failure.source.account,account);assert.equal(failure.response.status,403);
  assert.equal(failure.productionAuthority,false);denied.verifier.close();
  const wrongBucket=setup([{status:404,headers:{'x-amz-error-code':'NoSuchBucket'}}]);
  assert.equal((await wrongBucket.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw})).state,'UNKNOWN');
  wrongBucket.verifier.close();
});

test('D HEAD: occupied allocation unauthorized key wrong receipts and expired credentials cannot run',async()=>{
  const occupied=setup([200]);assert.equal((await occupied.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw})).state,'UNKNOWN');
  for(const patch of [{key:retained},{key:key+'.extra'},{key:'tmp/other/file.mp4'},
    {allocationRaw:Buffer.from('{}')}]) {
    const s=setup();const r=await s.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw,...patch});
    assert.equal(r.state,'UNKNOWN');assert.equal(s.requests.length,0);s.verifier.close();
  }
  for(const badScope of [{...scope,bucket:'other'},{...scope,permission:'admin-read-write'},
    {...scope,expiresUtc:binding.notBeforeUtc}])assert.throws(()=>setup([],{scope:badScope}),/D_HEAD_ADMISSION_INVALID/);
  const expired=setup();expired.at(59);
  const late=setup([],{now:()=>Date.parse(scope.expiresUtc)});
  assert.equal((await late.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw})).state,'UNKNOWN');
  assert.equal(late.requests.length,0);late.verifier.close();occupied.verifier.close();expired.verifier.close();
});

test('D HEAD: provider identity and present metadata are required; class is never defaulted',async()=>{
  for(const entry of [{status:404,headers:{'x-amz-request-id':undefined,'cf-ray':undefined}},
    {status:200,headers:{'content-length':undefined}},{status:200,headers:{etag:undefined}}]) {
    const s=setup([404,entry]);await s.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw});s.at(6);
    assert.equal((await s.verifier.head({phase:'BEFORE_DELETE',key,creationRaw:creationRaw()})).state,'UNKNOWN');
    s.verifier.close();
  }
  const s=setup([404,{status:200,headers:{'x-amz-storage-class':undefined}}]);
  const {present}=await preAndPresent(s);assert.equal(present.storageClass,'UNKNOWN');s.verifier.close();
});

test('D HEAD: repeat phases forged tampered cross-key and premature postdelete evidence fail closed',async()=>{
  const s=setup();await preAndPresent(s);s.at(10);
  const read=await s.verifier.head({phase:'AFTER_DELETE',key,creationRaw:creationRaw(),deletion:deletion()});
  for(const r of [JSON.parse(JSON.stringify(read)),{...read,source:{...read.source,key:retained}}])
    assert.equal(api.bindDHeadCleanupReadback(r,deletion(),creationRaw()).state,'UNKNOWN');
  assert.equal(api.bindDHeadCleanupReadback(read,{...deletion(),requestId:read.source.requestId},creationRaw()).state,'UNKNOWN');
  assert.equal(api.bindDHeadCleanupReadback(read,{...deletion(),requestId:'another-valid-delete'},creationRaw()).state,'UNKNOWN');
  assert.equal(api.bindDHeadCleanupReadback(read,{...deletion(),responseSha256:'0'.repeat(64)},creationRaw()).state,'UNKNOWN');
  assert.equal(api.bindDHeadCleanupReadback(read,deletion(),Buffer.from('{}')).state,'UNKNOWN');
  await s.verifier.head({phase:'AFTER_DELETE',key,creationRaw:creationRaw(),deletion:deletion()});
  assert.equal(s.requests.length,3);s.verifier.close();
  const early=setup();
  assert.equal((await early.verifier.head({phase:'AFTER_DELETE',key,creationRaw:creationRaw(),deletion:deletion()})).state,'UNKNOWN');
  assert.equal(early.requests.length,0);early.verifier.close();
});

test('D HEAD: retained initial and delayed heads bind persistence without another LIST',async()=>{
  const s=setup([404,200,200]);const bytes=creationRaw([key,retained]);
  await s.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw});s.at(6);
  const initial=await s.verifier.head({phase:'AFTER_CREATE',key:retained,creationRaw:bytes});
  assert.equal(initial.state,'PRESENT');assert.equal(initial.precreationProof,'SERVER_COPY_CREATION_RECEIPT_ONLY');
  s.atUtc('2026-10-29T10:10:06.000Z');
  const delayed=await s.verifier.head({phase:'BEFORE_DELETE',key:retained,creationRaw:bytes});
  assert.equal(api.bindDHeadPersistence(initial,delayed).state,'PERSISTENCE_OBSERVED');
  assert.equal(api.bindDHeadPersistence(initial,{...delayed}).state,'UNKNOWN');
  assert.equal(api.bindDHeadPersistence(initial,initial).state,'UNKNOWN');
  assert.equal(s.requests.length,3);s.verifier.close();
});

test('D HEAD: deletion evidence is snapshotted before asynchronous dispatch admission',async()=>{
  const d=deletion(),original=structuredClone(d);
  const s=setup([404,200,404],{beforeDispatch:async intent=>{
    if(intent.phase==='AFTER_DELETE'){d.requestId='changed-during-admission';d.responseSha256='0'.repeat(64);}
    return true;
  }});
  await preAndPresent(s);s.at(10);
  const read=await s.verifier.head({phase:'AFTER_DELETE',key,creationRaw:creationRaw(),deletion:d});
  assert.equal(api.bindDHeadCleanupReadback(read,original,creationRaw()).state,'ABSENCE_OBSERVED_AFTER_DELETE');
  assert.equal(api.bindDHeadCleanupReadback(read,d,creationRaw()).state,'UNKNOWN');s.verifier.close();
});

test('D HEAD: existing cleanup uses both predelete 200 proofs before owner delete and independent HEAD after',async()=>{
  const bytes=creationRaw([key,retained]),s=setup([404,200,200,404,404]),events=[];
  await s.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw});s.at(6);
  const ack=JSON.stringify({success:true,result:[{key},{key:retained}],errors:[]});const d={...deletion(bytes),responseSha256:hash(ack)};
  const result=await runDBoundCleanup({creationRaw:bytes,actorCreationRaw:actorRaw,postState:'published',
    target:{actorId,postId,actorCreationReceiptSha256:hash(actorRaw)},headVerifier:s.verifier,
    callbacks:{beforeDispatch:async phase=>{events.push(phase);return true;},
      ownerDelete:async()=>({postId,postState:'deleted',acknowledged:true}),
      readPost:async()=>({postId,independent:true,postState:'deleted',mediaRows:0,anonymousStatus:404}),
      deleteExactObjects:async()=>{s.at(10);return {evidence:d,rawDecodedResponse:ack};},
      readExactObject:async()=>assert.fail('LIST must never be called'),
      finishActor:async()=>({actorId,actorCreationReceiptSha256:hash(actorRaw),signedOut:true,banned:true,independentReadback:true})}});
  assert.equal(result.state,'CLEANUP_SEQUENCE_VERIFIED');assert.equal(result.actorContained,true);
  assert.deepEqual(events.slice(0,3),['OBJECT_PREDELETE_HEAD_0','OBJECT_PREDELETE_HEAD_1','OWNER_DELETE']);
  assert.equal(s.requests.length,5);assert.equal(result.objectProofs.length,2);s.verifier.close();
});

test('D HEAD: dispatch denial delayed replies expiry and unknown outcome never regain execution',async()=>{
  const denied=setup([404],{beforeDispatch:async()=>false});
  assert.equal((await denied.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw})).state,'UNKNOWN');
  assert.equal(denied.requests.length,0);denied.verifier.close();
  let calls=0;
  const late=setup([],{requestHandler:{destroy(){},async handle(){calls++;await new Promise(r=>setTimeout(r,40));
    return {response:{statusCode:404,headers:{'x-amz-request-id':'late-id'},body:Readable.from([])}};}}});
  const result=await late.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw});
  assert.equal(result.state,'UNKNOWN');await new Promise(r=>setTimeout(r,50));
  assert.equal((await late.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw})).state,'UNKNOWN');
  assert.equal(calls,1);late.verifier.close();
  let current=Date.parse(binding.notBeforeUtc)+2000;
  const expire=setup([404],{beforeDispatch:async()=>{current=Date.parse(binding.deadlineUtc);return true;},now:()=>current});
  assert.equal((await expire.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw})).state,'UNKNOWN');
  assert.equal(expire.requests.length,0);expire.verifier.close();
});

test('D HEAD: a stalled admission callback times out without starting transport',async()=>{
  const s=setup([404],{beforeDispatch:()=>new Promise(()=>{})});
  const r=await Promise.race([s.verifier.head({phase:'BEFORE_CREATE',key,allocationRaw}),
    new Promise(resolve=>setTimeout(()=>resolve({state:'STALLED'}),200))]);
  assert.equal(r.state,'UNKNOWN');assert.equal(s.requests.length,0);s.verifier.close();
});

test('D HEAD: local input rejects unbound fixture frames without leaking their values',async()=>{
  const nonce=randomUUID(),deadlineUtc=new Date(Date.now()+10000).toISOString();
  const server=createServer(socket=>socket.end(JSON.stringify({schemaVersion:1,binding:'9'.repeat(64),nonce,...secrets})));
  await new Promise(resolve=>server.listen('\\\\.\\pipe\\OGHR2HeadCredentials-Fixture-'+nonce,resolve));
  try {
    await assert.rejects(api.receiveDHeadCredentials({bindingSha256:'0'.repeat(64),nonce,deadlineUtc,offlineFixture:true}),
      e=>e.message==='D_HEAD_PRIVATE_INPUT_INVALID'&&!e.message.includes(secrets.secretAccessKey));
  }finally{await new Promise(resolve=>server.close(resolve));}
  await assert.rejects(api.receiveDHeadCredentials({bindingSha256:'0'.repeat(64),nonce,deadlineUtc}));
});

test('D HEAD: actual hidden input script transfers fictitious credentials only in a private local pipe',async()=>{
  const execute=promisify(execFile),nonce=randomUUID();
  const root=path.join(process.env.LOCALAPPDATA,'OpenGlassHub');
  const directory=await mkdtemp(path.join(root,'d-head-input-fixture-'));
  let child;
  const quote=v=>"'"+v.replaceAll("'","''")+"'";
  try {
    await execute('pwsh.exe',['-NoProfile','-NonInteractive','-Command',
      `$p=${quote(directory)};$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);`+
      `$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;`+
      `foreach($s in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){`+
      `$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};Set-Acl -LiteralPath $p -AclObject $a`],
      {windowsHide:true});
    const deadlineUtc=new Date(Date.now()+20000).toISOString();
    const script=path.resolve('scripts/qa/capture-d-r2-head-credentials.ps1');
    child=spawn('pwsh.exe',['-NoProfile','-NonInteractive','-File',script,'-Nonce',nonce,
      '-Binding','0'.repeat(64),'-WindowEndUTC',deadlineUtc,'-StatusDirectory',directory,'-OfflineFixture'],
      {windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
    const completed=new Promise(resolve=>child.once('exit',code=>resolve(code)));
    const readyFile=path.join(directory,`head-input.${nonce}.ready.safe.json`);
    let ready;
    for(let i=0;i<160;i++) {
      try{ready=JSON.parse(await readFile(readyFile,'utf8'));break;}catch{}
      if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));
    }
    assert.equal(ready?.status,'LOCAL_CURRENT_USER_PIPE_READY');assert.equal(ready.pid,child.pid);
    const credentials=await api.receiveDHeadCredentials({bindingSha256:'0'.repeat(64),nonce,deadlineUtc,offlineFixture:true});
    assert.deepEqual(credentials,secrets);assert.equal(await completed,0);
    const stored=await readdir(directory);assert.deepEqual(stored,[path.basename(readyFile)]);
    const publicBytes=await readFile(readyFile,'utf8');
    for(const value of Object.values(secrets))assert.equal((publicBytes+stdout+stderr).includes(value),false);
    assert.equal(ready.productionRequests,0);assert.equal(stderr,'');
  }finally{
    if(child?.exitCode===null)child.kill();
    assert.equal(path.resolve(directory).startsWith(path.resolve(root)+path.sep),true);
    assert.match(path.basename(directory),/^d-head-input-fixture-/);
    await rm(directory,{recursive:true,force:true});
  }
});
