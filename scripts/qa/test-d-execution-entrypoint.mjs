import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runDExecution,mainD} from './d-execution-entrypoint.mjs';
import {openDJournal,dHash} from './d-execution-journal.mjs';
import {createDHeadVerifier} from './d-r2-head-verification.mjs';
import {claimDExecution} from './d-execution-runtime.mjs';
import {createDManualExecutionCarrier,createDMcpExecutionBridge} from './d-execution-carriers.mjs';
import {fileURLToPath} from 'node:url';

const actorId='22222222-2222-4222-8222-222222222222',postId='11111111-1111-4111-8111-111111111111';
const mediaId='44444444-4444-4444-8444-444444444444',claimId='33333333-3333-4333-8333-333333333333';
const moderatorId='55555555-5555-4555-8555-555555555555';
const sourceKey=`tmp/${actorId}/${postId}/fixture.mp4`,retainedKey=`${actorId}/${postId}/r2-retained-${claimId}.mp4`;
const etag='"'+'a'.repeat(32)+'"';
const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';

function fixture(t,failure) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-d-entry-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let clock=Date.now(),postStatus='pending_review';const start=clock,observed=[],objects=new Set(),heads=[];
  const utc=()=>new Date(clock).toISOString();
  const binding={executionBindingSha256:'1'.repeat(64),authorizationSha256:'1'.repeat(64),sourceCommit:'a'.repeat(40),
    runId:randomUUID(),notBeforeUtc:utc(),deadlineUtc:new Date(clock+10800000).toISOString(),
    businessStopUtc:new Date(clock+8100000).toISOString(),connectionBindingSha256:'2'.repeat(64),moderatorId,
    moderatorContextReceiptSha256:'3'.repeat(64),frozenArtifactSha256:'4'.repeat(64),observerSourceSha256:'5'.repeat(64)};
  const journal=openDJournal({directory,binding,now:()=>clock});
  const actorRaw=JSON.stringify({executionBindingSha256:binding.executionBindingSha256,actorId,createdByThisRun:true,
    createdUtc:utc(),providerReceiptSha256:'6'.repeat(64)});
  const actor={actorId,email:'synthetic@example.invalid',createdAt:utc(),actorCreationRaw:actorRaw};
  const snapshot=()=>({post:{id:postId,author_id:actorId,status:postStatus,moderation_status:postStatus},
    media:[{id:mediaId,post_id:postId,user_id:actorId,kind:'video',storage_path:retainedKey,url:null,size_bytes:2018,mime_type:'video/mp4'}],
    claim:{post_id:postId,user_id:actorId,claim_id:claimId,retained_key:retainedKey,mime_type:'video/mp4'},observedUtc:utc()});
  const video={status:'PASS_FETCH_HASH_AND_DECODE',httpStatus:200,bytes:2018,sha256Match:true,
    decode:{width:16,height:16,currentTime:0.2,errorNull:true}};
  const ports={production:false,
    async prepare(){if(failure==='expired')clock+=10800001;},
    async createActor(){
      for(const id of ['ACTOR_CREATE','ACTOR_INITIAL_READ'])await journal.call({id,cost:{Auth:1},request:{method:id==='ACTOR_CREATE'?'POST':'GET'}},
        async()=>{observed.push(id);return {actorId,matched:true};},r=>r.matched);
      return actor;
    },
    async identity(){observed.push('ORDINARY_IDENTITY');if(failure==='checkpoint-expired')throw Error();
      return {actorId,confirmed:true,role:'user',circleMatches:true,normalLoginConfirmed:true,legalReady:true};},
    async upload(){observed.push('CREATE_POST_AND_VIDEO');objects.add(sourceKey);objects.add(retainedKey);return {
      binding:binding.executionBindingSha256,actorId,postId,mediaId,sourceKey,retainedKey,status:'OBSERVED_REQUIRES_SERVER_READBACK',
      events:[{method:'POST',path:'/api/forum/posts',httpStatus:201,outcome:'PROJECTED'},
        {method:'POST',path:'/api/forum/external-video-upload',httpStatus:200,outcome:'PROJECTED'},
        {method:'PUT',path:'EXACT_S3_OBJECT',httpStatus:200,outcome:'PROJECTED'},
        {method:'POST',path:'/api/forum/post-media',httpStatus:201,outcome:'PROJECTED'}],
      put:{account,bucket,key:sourceKey,status:200,sizeBytes:2018,etag,mimeType:'video/mp4',complete:true},
      media:snapshot().media[0],observedUtc:utc()};},
    async snapshot(){return snapshot();},
    headVerifier({binding:b}){
      return createDHeadVerifier({binding:b,scope:{account,bucket,jurisdiction:'default',permission:'object-read-only',
        evidenceSha256:'7'.repeat(64),bucketProvenanceSha256:'8'.repeat(64),configurationWindowBindingSha256:b.executionBindingSha256,
        expiresUtc:b.deadlineUtc},credentials:{accessKeyId:'FICTITIOUSACCESSKEYONLY',secretAccessKey:'FICTITIOUSSECRETKEYONLYNOTREAL000000000000'},
        now:()=>clock,beforeDispatch:async i=>journal.reserve({id:`HEAD_${i.phase}_${i.key===sourceKey?'SOURCE':'RETAINED'}`,
          cost:{HEAD:1},cleanup:i.phase!=='AFTER_CREATE',request:i}),
        afterResponse:async r=>{journal.acknowledge(`HEAD_${r.source.phase}_${r.source.key===sourceKey?'SOURCE':'RETAINED'}`,r,v=>v.state!=='UNKNOWN');return true;},
        onUnknown:async i=>journal.unknown(`HEAD_${i.phase}_${i.key===sourceKey?'SOURCE':'RETAINED'}`),
        requestHandler:{async handle(request){
          const key=decodeURIComponent(request.path.slice(('/'+bucket+'/').length));heads.push(key);observed.push('HEAD');
          const present=objects.has(key);return {response:{statusCode:present?200:404,headers:{'x-amz-request-id':randomUUID(),
            ...(present?{'content-length':'2018',etag,...(failure==='standard-header-omitted'?{}:
              {'x-amz-storage-class':failure==='ia-class'?'STANDARD_IA':failure==='unknown-class'?'UNRECOGNIZED':'STANDARD'})}:{})},body:new Uint8Array()}};
        },destroy(){}}});
    },
    async approve(){observed.push('APPROVE');postStatus='published';return {postId,actorId,status:'published',moderationStatus:'published'};},
    async video(p){observed.push('VIDEO_'+p.stage);if(p.stage==='before-public'||p.stage==='after-hide')return {
      status:failure==='anonymous-residual'&&p.stage==='after-hide'?'UNEXPECTED_PUBLIC':'PASS_DENIED',httpStatus:failure==='anonymous-residual'&&p.stage==='after-hide'?200:404};return video;},
    async checkpoint(code,p,signal,j){
      const id=p.phase,cost=id==='OWNER_DELETE'?{Worker:1}:id==='POST_READBACK'?{REST:2}:{Auth:1};
      return j.call({id,cost,cleanup:true,request:{manual:true},timeoutMs:120000,signal},async()=>{
        observed.push(id);
        if(id==='OWNER_DELETE'){postStatus='deleted';objects.delete(retainedKey);return {binding:p.executionBindingSha256,requestId:p.requestId,
          postId,actorId,acknowledged:true,postState:'deleted',applicationDeletedKeys:[retainedKey],startedUtc:utc(),completedUtc:utc(),cleanupOk:true};}
        if(id==='POST_READBACK')return {binding:p.executionBindingSha256,requestId:p.requestId,postId,independent:true,postState:postStatus,mediaRows:0};
        return {binding:p.executionBindingSha256,requestId:p.requestId,actorId,scope:'global',signedOut:true,completedUtc:utc()};
      },r=>!!r.binding);
    },
    async mcpExecute(code){observed.push('EXACT_SOURCE_DELETE');
      if(failure==='mcp-unknown')return {state:'UNKNOWN'};
      if(failure==='mcp-failed')throw Error();
      assert.match(code,/method:"DELETE"/);assert.match(code,/bucket="openglasshub-media"/);assert.match(code,/\/r2\/buckets\//);
      objects.delete(sourceKey);const creation=readCreation(journal);
      const rawDecodedResponse=JSON.stringify({success:true,result:[{key:sourceKey}],errors:[]});
      return {rawDecodedResponse,evidence:{executionBindingSha256:binding.executionBindingSha256,connectionBindingSha256:binding.connectionBindingSha256,
        account,bucket,jurisdiction:'default',method:'DELETE',requestId:'d-source-delete-'+binding.executionBindingSha256.slice(0,12),
        keys:[sourceKey],createdKeys:[sourceKey,retainedKey],creationReceiptSha256:dHash(Buffer.from(creation)),responseSha256:dHash(rawDecodedResponse),
        status:200,complete:true,startedUtc:utc(),completedUtc:utc()}};
    },
    async containActor({binding:b,logoutEvidence}){
      for(const id of ['ACTOR_PREBAN','ACTOR_BAN','ACTOR_READBACK']) {
        await journal.call({id,cost:{Auth:1},cleanup:true,request:{phase:id}},async()=>{
          observed.push(id);if((failure==='ban-failed'||failure==='child-crash')&&id==='ACTOR_BAN')throw Error();
          return {matched:true,actorId};},r=>r.matched);
      }
      return {actorId,actorCreationReceiptSha256:b.actorCreationReceiptSha256,signedOut:logoutEvidence?.signedOut===true,
        banned:true,independentReadback:true};
    },async close(){}
  };
  return {directory,binding,journal,ports,observed,objects,heads,start,utc,
    run:()=>runDExecution({journal,ports,binding,targets:{namespace:'offline-fixture'},now:()=>clock,wait:async ms=>{clock+=ms;}})};
}
function readCreation(journal) {
  const entries=fs.readdirSync(journalDirectory.get(journal)).filter(n=>/^d-receipt-/.test(n))
    .map(n=>JSON.parse(fs.readFileSync(path.join(journalDirectory.get(journal),n))));
  return entries.find(e=>e.kind==='CREATION_OBLIGATION').creationRaw;
}
const journalDirectory=new WeakMap();

test('actual D entrypoint: full synthetic creation -> six signed HEADs -> playback -> delay -> owner delete -> independent cleanup',async t=>{
  const f=fixture(t);journalDirectory.set(f.journal,f.directory);const r=await f.run();
  assert.equal(r.state,'SYNTHETIC_PASS',JSON.stringify(r));assert.equal(r.productionAuthority,false);
  assert.equal(r.cleanup,'CLEANUP_SEQUENCE_VERIFIED');assert.equal(r.actorContained,true);
  assert.deepEqual(r.residuals,[]);assert.equal(f.objects.size,0);assert.equal(f.heads.length,6);
  assert.ok(f.observed.indexOf('OWNER_DELETE')<f.observed.indexOf('EXACT_SOURCE_DELETE'));
  const used=f.journal.status().used;assert.equal(used.HEAD,6);assert.equal(used.management,1);
  assert.equal(used.Auth,8);assert.equal(used.REST,10);assert.equal(used.Worker,11);
});

test('S3-compatible omitted Standard header is supported, explicit IA/unknown class stops before publishing',async t=>{
  const f=fixture(t,'standard-header-omitted');journalDirectory.set(f.journal,f.directory);
  assert.equal((await f.run()).state,'SYNTHETIC_PASS');
  for(const className of ['ia-class','unknown-class']){
    const blocked=fixture(t,className);journalDirectory.set(blocked.journal,blocked.directory);
    assert.equal((await blocked.run()).state,'BLOCKED');assert.ok(!blocked.observed.includes('APPROVE'));
  }
});

for(const failure of ['checkpoint-expired','mcp-failed','mcp-unknown','anonymous-residual','ban-failed','child-crash','expired'])
  test('entrypoint stops and retains containment duty: '+failure,async t=>{
    const f=fixture(t,failure);journalDirectory.set(f.journal,f.directory);const r=await f.run();
    assert.equal(r.state,'BLOCKED');assert.equal(r.productionAuthority,false);
    const operations=f.observed.filter(x=>!['HEAD'].includes(x));
    assert.equal(new Set(operations).size,operations.length,'no retried operator phase');
    if(failure.startsWith('mcp-')||failure==='anonymous-residual')assert.ok(f.observed.includes('ACTOR_BAN'));
    if(failure==='checkpoint-expired'||failure==='expired')assert.ok(!f.observed.includes('CREATE_POST_AND_VIDEO'));
    if(failure==='mcp-unknown'||failure==='mcp-failed')assert.ok(f.journal.status().pending.includes('EXACT_SOURCE_DELETE'));
  });

test('entrypoint refuses a fixture whose create/read did not traverse durable dispatch receipts',async t=>{
  const f=fixture(t);const create=f.ports.createActor;f.ports.createActor=async()=>({actorId,email:'fixture@example.invalid',createdAt:new Date().toISOString(),
    actorCreationRaw:JSON.stringify({executionBindingSha256:f.binding.executionBindingSha256,actorId,createdByThisRun:true})});
  const r=await f.run();assert.equal(r.state,'BLOCKED');assert.ok(!f.observed.includes('CREATE_POST_AND_VIDEO'));
});

test('insufficient quota cannot spend cleanup reserve; expired run does not dispatch; restart cannot refund unknown',async t=>{
  const f=fixture(t);await assert.rejects(f.journal.call({id:'OVER_BUDGET',cost:{HEAD:3},request:{}},async()=>({ok:true}),()=>true));
  assert.equal(f.journal.status().used.HEAD,0);
  await assert.rejects(f.journal.call({id:'CRASHED_DELETE',cost:{management:1},cleanup:true,request:{}},async()=>{throw Error();},()=>true));
  const resumed=openDJournal({directory:f.directory,binding:f.binding,resume:true});
  assert.equal(resumed.status().used.management,1);assert.ok(resumed.status().pending.includes('CRASHED_DELETE'));
  await assert.rejects(resumed.call({id:'CRASHED_DELETE',cost:{management:1},cleanup:true},async()=>assert.fail('retry'),()=>true));
  await assert.rejects(resumed.call({id:'NEW_BUSINESS',cost:{Worker:1}},async()=>assert.fail('business replay'),()=>true));
});

test('tampered receipt/counter chain is rejected before any recovery dispatch',async t=>{
  const f=fixture(t);f.journal.reserve({id:'BEFORE_CRASH',cost:{Worker:1},request:{}});
  const file=path.join(f.directory,'d-receipt-000002.json'),r=JSON.parse(fs.readFileSync(file));r.cost.Worker=0;fs.writeFileSync(file,JSON.stringify(r));
  assert.throws(()=>openDJournal({directory:f.directory,binding:f.binding,resume:true}));
});

test('CLI rejects absent/unknown modes rather than opening a production channel',async()=>{
  await assert.rejects(mainD([]));await assert.rejects(mainD(['--synthetic-result-is-production']));
});

test('injected synthetic callbacks cannot label themselves a Production transport',async t=>{
  const f=fixture(t);f.ports.production=true;
  await assert.rejects(f.run(),/SYNTHETIC_PORTS_CANNOT_BECOME_PRODUCTION/);assert.equal(f.observed.length,0);
});

test('cleanup interruption recovery reuses only ACKs, executes unissued cleanup, never repeats unknown mutation or HEAD',async t=>{
  const f=fixture(t);journalDirectory.set(f.journal,f.directory);assert.equal((await f.run()).state,'SYNTHETIC_PASS');
  const original=f.journal.records(),boundary=original.find(e=>e.kind==='INTENT'&&e.id==='EXACT_SOURCE_DELETE').sequence;
  const recoveredDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-d-recover-'));
  t.after(()=>fs.rmSync(recoveredDirectory,{recursive:true,force:true}));
  for(const e of original.filter(e=>e.sequence<boundary)) {
    const name=`d-receipt-${String(e.sequence).padStart(6,'0')}.json`;
    fs.copyFileSync(path.join(f.directory,name),path.join(recoveredDirectory,name));
  }
  const j=openDJournal({directory:recoveredDirectory,binding:f.binding,resume:true});journalDirectory.set(j,recoveredDirectory);
  f.objects.add(sourceKey);const beforeHeads=f.heads.length,checkpoint=f.ports.checkpoint;
  f.ports.targets={namespace:'offline-fixture',controlledAlias:'synthetic@example.invalid'};
  f.ports.checkpoint=(code,p,signal,journal)=>journal.cached(p.phase)??checkpoint(code,p,signal,journal);
  // Fixture containment routes through this new recovered journal, not the old run.
  f.ports.containActor=async({binding:b,logoutEvidence})=>{
    for(const id of ['ACTOR_PREBAN','ACTOR_BAN','ACTOR_READBACK'])await j.call({id,cost:{Auth:1},cleanup:true},async()=>({matched:true}),r=>r.matched);
    return {actorId,actorCreationReceiptSha256:b.actorCreationReceiptSha256,signedOut:logoutEvidence?.signedOut===true,banned:true,independentReadback:true};
  };
  const beforeDeleteCount=f.observed.filter(x=>x==='EXACT_SOURCE_DELETE').length;
  const r=await runDExecution({journal:j,ports:f.ports,binding:f.binding,targets:f.ports.targets,resumeCleanup:true});
  assert.equal(r.state,'BLOCKED');assert.equal(r.cleanup,'DELETIONS_ACKNOWLEDGED_ABSENCE_UNKNOWN');
  assert.equal(f.heads.length,beforeHeads);assert.equal(f.objects.size,0);
  assert.equal(f.observed.filter(x=>x==='EXACT_SOURCE_DELETE').length,beforeDeleteCount+1);
  assert.equal(j.status().used.management,1);
  // A second recovery cannot repeat the source delete that is now acknowledged.
  await assert.rejects(j.call({id:'EXACT_SOURCE_DELETE',cost:{management:1},cleanup:true},async()=>assert.fail('duplicate'),()=>true));
});

test('an acknowledged creation remains exact-containable when later creation display/readback fails',async t=>{
  const f=fixture(t),create=f.ports.createActor;
  f.ports.createActor=async()=>({...await create(),state:'UNKNOWN'});
  const r=await f.run();assert.equal(r.state,'BLOCKED');assert.ok(f.observed.includes('ACTOR_BAN'));
  assert.ok(!f.observed.includes('CREATE_POST_AND_VIDEO'));
});

test('absolute per-operation deadline includes synchronous operation and ACK persistence',async t=>{
  const f=fixture(t);let time=Date.now();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-d-deadline-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const j=openDJournal({directory:dir,binding:{...f.binding,notBeforeUtc:new Date(time).toISOString(),
    deadlineUtc:new Date(time+10800000).toISOString(),businessStopUtc:new Date(time+8100000).toISOString()},now:()=>time});
  await assert.rejects(j.call({id:'SYNC_BLOCK',cost:{Worker:1},timeoutMs:10},()=>{time+=11;return {ok:true};},()=>true));
  assert.equal(j.cached('SYNC_BLOCK'),undefined);assert.equal(j.status().used.Worker,1);
  assert.ok(j.status().pending.includes('SYNC_BLOCK'));
  assert.throws(()=>openDJournal({directory:dir,binding:{...f.binding,businessStopUtc:'malformed'},resume:true}));
  const dir2=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-d-ack-late-'));t.after(()=>fs.rmSync(dir2,{recursive:true,force:true}));
  const k=openDJournal({directory:dir2,binding:f.binding,now:()=>time});
  k.reserve({id:'LATE_PERSISTENCE',cost:{Worker:1},cleanup:true,operationDeadlineUtc:new Date(time+50).toISOString()});
  const write=fs.fsyncSync;fs.fsyncSync=fd=>{write(fd);time+=51;};
  try{assert.throws(()=>k.acknowledge('LATE_PERSISTENCE',{ok:true},()=>true));}
  finally{fs.fsyncSync=write;}
  assert.equal(k.cached('LATE_PERSISTENCE'),undefined);
});

test('authorization-wide claim prevents a fresh directory from recreating approved counters before private input',t=>{
  const f=fixture(t),claims=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-d-claim-'));
  t.after(()=>fs.rmSync(claims,{recursive:true,force:true}));
  const first=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-d-first-')),second=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-d-second-'));
  t.after(()=>{fs.rmSync(first,{recursive:true,force:true});fs.rmSync(second,{recursive:true,force:true});});
  const plan={directory:first,runId:randomUUID(),sourceAdoption:{sha256:'a'.repeat(64)}};
  claimDExecution({claimDirectory:claims,plan});
  assert.throws(()=>claimDExecution({claimDirectory:claims,plan:{...plan,directory:second,runId:randomUUID()}}));
  assert.throws(()=>claimDExecution({claimDirectory:claims,plan:{...plan,directory:second},resume:true}));
  assert.doesNotThrow(()=>claimDExecution({claimDirectory:claims,plan,resume:true}));
});

test('failed ACK fsync cannot become accepted evidence after process restart',async t=>{
  const f=fixture(t),sync=fs.fsyncSync;let writes=0,providerCalls=0;
  fs.fsyncSync=fd=>{writes++;if(writes===3)throw Error('SYNTHETIC_ACK_FSYNC_FAILURE');sync(fd);};
  try{await assert.rejects(f.journal.call({id:'FAILED_ACK',cost:{Worker:1}},async()=>{providerCalls++;return {ok:true};},r=>r.ok));}
  finally{fs.fsyncSync=sync;}
  assert.equal(providerCalls,1);assert.equal(f.journal.cached('FAILED_ACK'),undefined);
  assert.throws(()=>openDJournal({directory:f.directory,binding:f.binding,resume:true}),/INCOMPLETE_WRITE/);
});

test('two competing journals cannot replace a published intent or dispatch twice',async t=>{
  const f=fixture(t),second=openDJournal({directory:f.directory,binding:f.binding,resume:true});
  let dispatched=0;
  await f.journal.call({id:'ACTOR_BAN',cost:{Auth:1},cleanup:true},async()=>{dispatched++;return {ok:true};},r=>r.ok);
  const file=path.join(f.directory,'d-receipt-000002.json'),before=fs.readFileSync(file),exists=fs.existsSync;
  // Force the exact stale exists() view from the race; atomic publication must
  // still fail before the second carrier receives permission to dispatch.
  fs.existsSync=p=>String(p)===file?false:exists(p);
  try{await assert.rejects(second.call({id:'ACTOR_BAN',cost:{Auth:1},cleanup:true},async()=>{dispatched++;return {ok:true};},r=>r.ok));}
  finally{fs.existsSync=exists;}
  assert.equal(dispatched,1);assert.ok(fs.readFileSync(file).equals(before));
});

test('unified entrypoint integrates actual file import and separate-instance MCP tool bridge, not just callback existence',async t=>{
  const f=fixture(t),downloads=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-d-downloads-'));
  t.after(()=>fs.rmSync(downloads,{recursive:true,force:true}));journalDirectory.set(f.journal,f.directory);
  const sourcePath=fileURLToPath(import.meta.url),binding={executionBindingSha256:f.binding.executionBindingSha256,
    sourceSha256:dHash(fs.readFileSync(sourcePath)),nonce:f.binding.runId,runId:f.binding.runId,
    sourceCommit:f.binding.sourceCommit,authorizationSha256:f.binding.authorizationSha256,
    connectionBindingSha256:f.binding.connectionBindingSha256};
  const source={directory:f.directory,sourcePath,binding,mode:'SYNTHETIC',pollIntervalMs:1};
  let nextResult,imports=0,toolCalls=0;
  const manual=createDManualExecutionCarrier({...source,downloadsDirectory:downloads,deliver:job=>{
    imports++;assert.ok(fs.existsSync(job.codePath));
    fs.writeFileSync(path.join(downloads,job.resultName),JSON.stringify(nextResult));
  }});
  const original={identity:f.ports.identity,upload:f.ports.upload,snapshot:f.ports.snapshot,video:f.ports.video,
    approve:f.ports.approve,checkpoint:f.ports.checkpoint,mcp:f.ports.mcpExecute};let ordinal=0;
  const imported=async(result,signal)=>{
    const requestId='integration-'+(++ordinal);nextResult={...result,binding:binding.executionBindingSha256,requestId};
    return manual.run({code:'void 0; // synthetic file carrier only',requestId,
      deadlineUtc:new Date(Date.now()+30000).toISOString(),signal,validate:r=>r.requestId===requestId});
  };
  for(const name of ['identity','upload','snapshot','video','approve'])f.ports[name]=async(...args)=>imported(await original[name](...args),args[1]);
  f.ports.checkpoint=async(code,p,signal,j)=>{
    const id=p.phase,cost=id==='OWNER_DELETE'?{Worker:1}:id==='POST_READBACK'?{REST:2}:{Auth:1};
    return j.call({id,cost,cleanup:true,request:{manual:true},timeoutMs:120000,signal},async()=>{
      let result;
      if(id==='OWNER_DELETE'){
        f.objects.delete(retainedKey);result={postId,actorId,postState:'deleted',acknowledged:true,cleanupOk:true,
          applicationDeletedKeys:[retainedKey],startedUtc:f.utc(),completedUtc:f.utc()};
      }else if(id==='POST_READBACK')result={postId,postState:'deleted',mediaRows:0,independent:true};
      else result={actorId,signedOut:true,scope:'global',completedUtc:f.utc()};
      const r=await imported(result,signal);return {...r,requestId:p.requestId};
    },()=>true);
  };
  const bridge=createDMcpExecutionBridge({...source,plan:code=>({requestId:'d-source-delete-'+binding.executionBindingSha256.slice(0,12),
    codeSha256:dHash(code),deadlineUtc:new Date(Date.now()+10000).toISOString()}),onReady:()=>{
      const peer=createDMcpExecutionBridge(source),ticket=peer.takePending();
      assert.ok(ticket&&peer.canDispatch(ticket));toolCalls++;
      void original.mcp(ticket.code).then(result=>{
        const body=JSON.parse(result.rawDecodedResponse);body.status=200;result.rawDecodedResponse=JSON.stringify(body);
        result.evidence.responseSha256=dHash(result.rawDecodedResponse);
        const accepted=peer.acceptResult({ticket,toolResult:{content:[{type:'text',text:JSON.stringify(result)}]}});
        assert.equal(accepted.accepted,true);
      });
  }});
  f.ports.mcpExecute=(code,options,signal)=>bridge.execute(code,options,signal);
  // Keep HEAD/deletion provenance on one real clock; the persistence delay uses
  // a timestamp-only synthetic clock in the core fixture, not a provider wait.
  const result=await f.run();
  assert.equal(result.state,'SYNTHETIC_PASS',JSON.stringify(result));assert.ok(imports>=9);assert.equal(toolCalls,1);
  assert.equal(f.journal.status().used.HEAD,6);assert.equal(f.objects.size,0);
});
