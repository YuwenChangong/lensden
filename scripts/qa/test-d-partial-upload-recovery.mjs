import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import * as production from './d-production-bindings.mjs';
import {createDHeadVerifier} from './d-r2-head-verification.mjs';
import {runDBoundCleanup} from './legacy-tmp-lifecycle-safety.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const actorId='22222222-2222-4222-8222-222222222222',postId='11111111-1111-4111-8111-111111111111';
const key=`tmp/${actorId}/${postId}/fixture.mp4`,account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';
const actorCreationRaw=Buffer.from(JSON.stringify({executionBindingSha256:'1'.repeat(64),actorId,createdByThisRun:true,
  createdUtc:'2026-10-29T10:00:00.000Z',providerReceiptSha256:'8'.repeat(64)}));
const binding={executionBindingSha256:'1'.repeat(64),connectionBindingSha256:'2'.repeat(64),actorId,postId,
  actorCreationReceiptSha256:hash(actorCreationRaw),frozenArtifactSha256:'4'.repeat(64),observerSourceSha256:'5'.repeat(64),
  identityReceiptSha256:'6'.repeat(64),creationMode:'SOURCE_UPLOAD_RECOVERY_V1',
  notBeforeUtc:'2026-10-29T10:00:00.000Z',deadlineUtc:'2026-10-29T10:50:00.000Z'};
function capture(){return {binding:binding.executionBindingSha256,actorId,postId,sourceKey:key,mediaId:null,retainedKey:null,
  status:'STOPPED_UNKNOWN',failurePhase:'PUT_ETAG_UNAVAILABLE',observedUtc:'2026-10-29T10:02:00.000Z',events:[
    {method:'POST',path:'/api/forum/posts',httpStatus:201,outcome:'PROJECTED'},
    {method:'POST',path:'/api/forum/external-video-upload',httpStatus:200,outcome:'PROJECTED'},
    {method:'PUT',path:'EXACT_S3_OBJECT',httpStatus:200,outcome:'REQUEST_OR_PROJECTION_UNKNOWN'}],
  put:{account,bucket,key,status:200,sizeBytes:2018,mimeType:'video/mp4',etag:null,complete:true}};}
const build=c=>production.buildDPartialSourceCreation({captureRaw:Buffer.from(JSON.stringify(c)),binding});

test('D partial recovery: real passive observer preserves only acknowledged source failures',async()=>{
  const names=['window','location','document','URL'],saved=Object.fromEntries(names.map(n=>[n,globalThis[n]]));
  for(const failure of ['missing-etag','invalid-etag','403','network']){
    const w={};w.top=w;let blob,puts=0;
    w.fetch=async(url,init)=>{
      if(init.method==='PUT'){puts++;if(failure==='network')throw Error('NetworkError');
        return new Response(null,{status:failure==='403'?403:200,
          headers:failure==='invalid-etag'?{etag:'INVALID_HEADER_MUST_NOT_EXPORT'}:{}});}
      return new Response(JSON.stringify(url==='/api/forum/posts'?{post:{id:postId}}:{storage_path:key}),
        {status:url==='/api/forum/posts'?201:200});
    };
    globalThis.window=w;globalThis.location={origin:'https://openglasshub.ogh.workers.dev',pathname:'/posts/new/',search:'',hash:''};
    globalThis.document={body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
    class LocalURL extends saved.URL{}LocalURL.createObjectURL=b=>{blob=b;return 'blob:fixture';};LocalURL.revokeObjectURL=()=>{};globalThis.URL=LocalURL;
    let observer;
    try{
      observer=production.installDVideoCreationObserver({...binding,verifiedContextReceiptSha256:'7'.repeat(64),
        title:'fixture',body:'synthetic',circleSlug:'fixture',deadlineUtc:new Date(Date.now()+10000).toISOString()});
      await w.fetch('/api/forum/posts',{method:'POST',body:JSON.stringify({title:'fixture',body:'synthetic',circle_slug:'fixture',type:'feedback',has_media:true})});
      await w.fetch('/api/forum/external-video-upload',{method:'POST',body:JSON.stringify({post_id:postId})});
      await assert.rejects(w.fetch(`https://${bucket}.${account}.r2.cloudflarestorage.com/${key}?SIGNATURE_NOT_EXPORT`,
        {method:'PUT',body:new Blob([new Uint8Array(2018)],{type:'video/mp4'})}),/D_OBSERVER_FAILED_NO_RETRY/);
      const text=await blob.text(),c=JSON.parse(text);assert.equal(puts,1);assert.equal(c.status,'STOPPED_UNKNOWN');
      assert.equal(text.includes('SIGNATURE_NOT_EXPORT'),false);assert.equal(text.includes('INVALID_HEADER_MUST_NOT_EXPORT'),false);
      if(failure.endsWith('etag')){assert.equal(c.put.etag,null);assert.deepEqual(JSON.parse(build(c).creationRaw).keys,[key]);}
      else assert.throws(()=>build(c),/D_PARTIAL_SOURCE_UNPROVEN/);
    }finally{observer?.finish();Object.assign(globalThis,saved);}
  }
});

test('D partial recovery: only acknowledged exact source PUT without attachment can be recovered',()=>{
  assert.equal(typeof production.buildDPartialSourceCreation,'function');
  const r=build(capture()),c=JSON.parse(r.creationRaw);
  assert.equal(r.productionAuthority,false);assert.equal(c.recoveryOnly,true);assert.deepEqual(c.keys,[key]);
  assert.equal(c.retentionReceiptSha256,null);assert.equal(c.objectMetadata[0].etag,null);
  for(const mutate of [c=>c.put.status=403,c=>c.events[2].httpStatus=null,c=>c.events.push({method:'POST',path:'/api/forum/post-media'}),
    c=>c.put.key+='x',c=>c.mediaId=postId,c=>c.retainedKey=key,c=>c.failurePhase='UNKNOWN',c=>c.put.complete=false]){
    const c=capture();mutate(c);assert.throws(()=>build(c),/D_PARTIAL_SOURCE_UNPROVEN/);
  }
});

test('D partial recovery: independent HEAD200, exact DELETE and HEAD404 never become full D PASS',async()=>{
  const creationRaw=build(capture()).creationRaw;
  for(const scenario of ['success','head403','head404','deleteUnknown','postResidual','readback403','timeout']){
    let now=Date.parse('2026-10-29T10:02:02.000Z'),calls=0,deleted=0,contained=0,ownerDeletes=0;
    const verifier=createDHeadVerifier({binding,scope:{account,bucket,jurisdiction:'default',permission:'object-read-only',
      expiresUtc:'2026-10-29T10:55:00.000Z',evidenceSha256:'3'.repeat(64),bucketProvenanceSha256:'9'.repeat(64),
      configurationWindowBindingSha256:binding.executionBindingSha256},
      credentials:{accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)},now:()=>now,timeoutMs:30,
      beforeDispatch:async()=>true,requestHandler:{destroy(){},async handle(){calls++;
        if(scenario==='timeout')return new Promise(()=>{});
        const status=calls===1?(scenario==='head403'?403:scenario==='head404'?404:200):(scenario==='readback403'?403:404);
        return {response:{statusCode:status,headers:{'x-amz-request-id':'fixture-provider-id',
          ...(status===200?{'content-length':'2018',etag:'"'+'c'.repeat(32)+'"','x-amz-storage-class':'STANDARD'}:{})},body:Readable.from([])}};
      }}});
    try{
      const result=await runDBoundCleanup({creationRaw,actorCreationRaw,target:{...binding},headVerifier:verifier,callbacks:{
        beforeDispatch:async()=>true,ownerDelete:async()=>{ownerDeletes++;throw Error();},
        deleteExactObjects:async keys=>{deleted++;assert.deepEqual(keys,[key]);now+=1000;
          if(scenario==='deleteUnknown')return {state:'UNKNOWN'};
          const text=JSON.stringify({success:true,result:[{key}],errors:[]});
          return {rawDecodedResponse:text,evidence:{executionBindingSha256:binding.executionBindingSha256,
            connectionBindingSha256:binding.connectionBindingSha256,account,bucket,jurisdiction:'default',method:'DELETE',
            requestId:'source-delete',keys:[key],createdKeys:[key],creationReceiptSha256:hash(creationRaw),responseSha256:hash(text),
            status:200,complete:true,startedUtc:'2026-10-29T10:02:02.500Z',completedUtc:'2026-10-29T10:02:02.900Z'}};},
        readPost:async()=>({postId,independent:true,postState:scenario==='postResidual'?'pending_review':'deleted',mediaRows:0,noMediaCreated:true}),
        finishActor:async()=>{contained++;return {actorId,actorCreationReceiptSha256:binding.actorCreationReceiptSha256,
          signedOut:true,banned:true,independentReadback:true};}}});
      assert.equal(result.state,scenario==='success'?'PARTIAL_SOURCE_RECOVERED_D_FAILED':'BLOCKED');
      assert.equal(result.dAcceptance,'FAIL');assert.equal(result.actorContained,true);assert.equal(contained,1);assert.equal(ownerDeletes,0);
      assert.equal(deleted,['head403','head404','timeout'].includes(scenario)?0:1);
      assert.equal(calls,['head403','head404','timeout','deleteUnknown'].includes(scenario)?1:2);
      if(scenario==='success'||scenario==='postResidual')assert.equal(result.objectOutcomes[0].state,'ABSENCE_VERIFIED');
    }finally{verifier.close();}
  }
});

test('D partial recovery: actual checkpoint reads deleted post and empty media without inventing a media ID',async()=>{
  const saved={window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch};
  const moderatorId='77777777-7777-4777-8777-777777777777',w={};w.top=w;
  globalThis.window=w;globalThis.location={origin:'https://openglasshub.ogh.workers.dev',pathname:'/admin/security/',search:'',hash:''};
  let calls=0;
  globalThis.fetch=async url=>{calls++;const u=new URL(url);assert.equal(u.hostname,'xcbnxzjlsvtgzixurcof.supabase.co');
    return new Response(JSON.stringify(u.pathname.endsWith('/posts')?[{id:postId,author_id:actorId,status:'deleted'}]:[]),{status:200});};
  const client={supabaseUrl:'https://xcbnxzjlsvtgzixurcof.supabase.co',supabaseKey:'PUBLIC_FIXTURE',auth:{storage:{
    getItem:async()=>JSON.stringify({user:{id:moderatorId},access_token:'NONSECRET_FIXTURE',expires_at:Date.now()/1000+600})}}};
  try{
    const p={...binding,mediaId:null,moderatorId,recoveryOnly:true,phase:'POST_READBACK',requestId:'partial-read',
      verifiedContextReceiptSha256:'7'.repeat(64),deadlineUtc:new Date(Date.now()+10000).toISOString()};
    const r=await production.runDProductionCheckpoint(p,client);assert.equal(r.noMediaCreated,true);assert.equal(r.mediaRows,0);
    assert.equal(calls,2);assert.equal(r.requiresSeparateAnonymousDenial,false);
    assert.equal((await production.runDProductionCheckpoint({...p,phase:'OWNER_DELETE',requestId:'no-repeat'},client)).state,'UNKNOWN');
    assert.equal(calls,2);
  }finally{Object.assign(globalThis,saved);}
});

test('D partial recovery: production callback factory never retries app rollback or reads invented media',async()=>{
  const creationRaw=build(capture()).creationRaw,moderatorId='77777777-7777-4777-8777-777777777777';let reads=0,anon=0,deletes=0;
  const b={...binding,moderatorId,deadlineUtc:new Date(Date.now()+10000).toISOString(),
    ownerContextReceiptSha256:'a'.repeat(64),moderatorContextReceiptSha256:'b'.repeat(64)};
  const callbacks=production.createDProductionCleanupCallbacks({binding:b,creationRaw,actorCreationRaw,
    adminKey:'FICTITIOUS_ONLY',beforeDispatch:async()=>true,ownerCheckpoint:async()=>{throw Error('MUST_NOT_DELETE');},
    moderatorCheckpoint:async(code,p)=>{reads++;assert.equal(p.recoveryOnly,true);assert.equal(p.mediaId,null);
      assert.equal(p.phase,'POST_READBACK');return {postId,postState:'deleted',mediaRows:0,noMediaCreated:true,
        independent:true,binding:b.executionBindingSha256,requestId:p.requestId};},
    anonymousReadback:async()=>{anon++;throw Error();},mcpExecute:async()=>{deletes++;throw Error();}});
  const abort=new AbortController();await assert.rejects(callbacks.ownerDelete(postId,abort.signal),/D_CALLBACK_TARGET_INVALID/);
  const r=await callbacks.readPost(postId,abort.signal);assert.equal(r.noMediaCreated,true);assert.equal(reads,1);assert.equal(anon,0);assert.equal(deletes,0);
});
