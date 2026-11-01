import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runDBoundCleanup} from './legacy-tmp-lifecycle-safety.mjs';
const api=await import('./d-production-bindings.mjs').catch(()=>null);
const digest=v=>createHash('sha256').update(v).digest('hex');
const actorId='22222222-2222-4222-8222-222222222222',postId='11111111-1111-4111-8111-111111111111';
const mediaId='44444444-4444-4444-8444-444444444444',claimId='33333333-3333-4333-8333-333333333333';
const sourceKey=`tmp/${actorId}/${postId}/fixture.mp4`,retainedKey=`${actorId}/${postId}/r2-retained-${claimId}.mp4`;
const binding={executionBindingSha256:'1'.repeat(64),connectionBindingSha256:'2'.repeat(64),actorId,postId,
  actorCreationReceiptSha256:'3'.repeat(64),frozenArtifactSha256:'4'.repeat(64),
  observerSourceSha256:'5'.repeat(64),identityReceiptSha256:'6'.repeat(64)};
const capture=()=>({binding:binding.executionBindingSha256,actorId,postId,mediaId,sourceKey,retainedKey,
  status:'OBSERVED_REQUIRES_SERVER_READBACK',events:[
    {method:'POST',path:'/api/forum/posts',httpStatus:201,outcome:'PROJECTED'},
    {method:'POST',path:'/api/forum/external-video-upload',httpStatus:200,outcome:'PROJECTED'},
    {method:'PUT',path:'EXACT_S3_OBJECT',httpStatus:200,outcome:'PROJECTED'},
    {method:'POST',path:'/api/forum/post-media',httpStatus:201,outcome:'PROJECTED'}],
  put:{account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',key:sourceKey,
    status:200,sizeBytes:2018,etag:'"'+'a'.repeat(32)+'"',mimeType:'video/mp4',complete:true},
  media:{id:mediaId,post_id:postId,storage_path:retainedKey,kind:'video',size_bytes:2018,mime_type:'video/mp4',url:null},
  observedUtc:'2026-10-29T10:02:00.000Z'});
const snapshot=()=>({post:{id:postId,author_id:actorId,status:'published',moderation_status:'published'},
  media:[{id:mediaId,post_id:postId,user_id:actorId,storage_path:retainedKey,kind:'video',size_bytes:2018,mime_type:'video/mp4',url:null}],
  claim:{post_id:postId,user_id:actorId,claim_id:claimId,retained_key:retainedKey,mime_type:'video/mp4'},
  observedUtc:'2026-10-29T10:02:02.000Z'});

test('D runtime closure: actual SDK virtual-hosted PUT is observed while wrong targets and missing ETag fail closed',async()=>{
  const {S3Client,PutObjectCommand}=await import('@aws-sdk/client-s3');
  const {getSignedUrl}=await import('@aws-sdk/s3-request-presigner');
  const s3=new S3Client({region:'auto',maxAttempts:1,endpoint:'https://dcb374166b39234a499985145c075f50.r2.cloudflarestorage.com',
    credentials:{accessKeyId:'FICTITIOUSACCESSKEYONLY',secretAccessKey:'FICTITIOUSSECRETKEYONLYNOTREAL000000000000'}});
  let signed;
  try{signed=await getSignedUrl(s3,new PutObjectCommand({Bucket:'openglasshub-media',Key:sourceKey,ContentType:'video/mp4'}),{expiresIn:900});}
  finally{s3.destroy();}
  const names=['window','location','document','URL'],prior=Object.fromEntries(names.map(n=>[n,globalThis[n]]));
  assert.equal(new prior.URL(signed).hostname,'openglasshub-media.dcb374166b39234a499985145c075f50.r2.cloudflarestorage.com');
  for(const kind of ['virtual','path','foreign','wrong-key','missing-etag']){
    let blob,putCalls=0;const w={};w.top=w;
    w.fetch=async(input,init)=>{
      const u=new prior.URL(input,'https://openglasshub.ogh.workers.dev');
      if(init.method==='PUT'){putCalls++;return new Response(null,{status:200,headers:kind==='missing-etag'?{}:{etag:'"'+'a'.repeat(32)+'"'}});}
      if(u.pathname==='/api/forum/posts')return new Response(JSON.stringify({post:{id:postId}}),{status:201});
      if(u.pathname==='/api/forum/external-video-upload')return new Response(JSON.stringify({storage_path:sourceKey}),{status:200});
      return new Response(JSON.stringify({media:[capture().media]}),{status:201});
    };
    globalThis.window=w;globalThis.location={origin:'https://openglasshub.ogh.workers.dev',pathname:'/posts/new/',search:'',hash:''};
    globalThis.document={body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
    class LocalURL extends prior.URL{}LocalURL.createObjectURL=b=>{blob=b;return 'blob:fixture';};LocalURL.revokeObjectURL=()=>{};globalThis.URL=LocalURL;
    let observer;
    try{
      observer=api.installDVideoCreationObserver({...binding,verifiedContextReceiptSha256:'7'.repeat(64),
        deadlineUtc:new Date(Date.now()+10000).toISOString(),title:'fixture',body:'synthetic',circleSlug:'fixture'});
      await w.fetch('/api/forum/posts',{method:'POST',body:JSON.stringify({title:'fixture',body:'synthetic',circle_slug:'fixture',type:'feedback',has_media:true})});
      await w.fetch('/api/forum/external-video-upload',{method:'POST',body:JSON.stringify({post_id:postId})});
      const u=new prior.URL(signed);
      if(kind==='path'){u.hostname='dcb374166b39234a499985145c075f50.r2.cloudflarestorage.com';u.pathname='/openglasshub-media/'+sourceKey;}
      if(kind==='foreign')u.hostname='another-bucket.dcb374166b39234a499985145c075f50.r2.cloudflarestorage.com';
      if(kind==='wrong-key')u.pathname+='.wrong';
      const upload=()=>w.fetch(u.href,{method:'PUT',body:new Blob([new Uint8Array(2018)],{type:'video/mp4'})});
      if(['foreign','wrong-key','missing-etag'].includes(kind)){
        await assert.rejects(upload(),/D_OBSERVER_FAILED_NO_RETRY/);
        assert.equal(putCalls,kind==='missing-etag'?1:0);const partial=JSON.parse(await blob.text());
        assert.equal(partial.status,'STOPPED_UNKNOWN');assert.equal(partial.sourceKey,sourceKey);
        assert.throws(()=>api.buildDProductionCreation({captureRaw:Buffer.from(JSON.stringify(partial)),
          snapshotRaw:Buffer.from(JSON.stringify(snapshot())),binding}),/D_CREATION_CHAIN_UNPROVEN/);
      }else{
        await upload();await w.fetch('/api/forum/post-media',{method:'POST',body:JSON.stringify({post_id:postId,media:[{storage_path:sourceKey}]})});
        const text=await blob.text();assert.equal(JSON.parse(text).events[2].path,'EXACT_S3_OBJECT');assert.equal(putCalls,1);
        assert.equal(text.includes('X-Amz-'),false);
      }
    }finally{observer?.finish();for(const n of names)globalThis[n]=prior[n];}
  }
});

test('D retention diagnostic observer: captures only allowed failure stages without retry or provider disclosure',async()=>{
  const names=['window','location','document','URL'],prior=Object.fromEntries(names.map(n=>[n,globalThis[n]]));
  for(const stage of ['source_head','source_metadata','copy','retained_head','retained_metadata',undefined,'SECRET_PROVIDER_DETAIL']){
    let blob,attachCalls=0;const w={};w.top=w;
    w.fetch=async(input)=>{
      const u=new prior.URL(input,'https://openglasshub.ogh.workers.dev');
      if(u.pathname==='/api/forum/posts')return new Response(JSON.stringify({post:{id:postId}}),{status:201});
      if(u.pathname==='/api/forum/external-video-upload')return new Response(JSON.stringify({storage_path:sourceKey}),{status:200});
      attachCalls++;return new Response(JSON.stringify({error:'MEDIA_RETENTION_FAILED',retention_stage:stage,
        provider:'SECRET_PROVIDER_DETAIL',key:'PRIVATE_OBJECT_KEY'}),{status:500});
    };
    const originalFetch=w.fetch;
    globalThis.window=w;globalThis.location={origin:'https://openglasshub.ogh.workers.dev',pathname:'/posts/new/',search:'',hash:''};
    globalThis.document={body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
    class LocalURL extends prior.URL{}LocalURL.createObjectURL=b=>{blob=b;return 'blob:fixture';};LocalURL.revokeObjectURL=()=>{};globalThis.URL=LocalURL;
    let observer;
    try{
      observer=api.installDVideoCreationObserver({...binding,verifiedContextReceiptSha256:'7'.repeat(64),
        deadlineUtc:new Date(Date.now()+10000).toISOString(),title:'fixture',body:'synthetic',circleSlug:'fixture'});
      await w.fetch('/api/forum/posts',{method:'POST',body:JSON.stringify({title:'fixture',body:'synthetic',circle_slug:'fixture',type:'feedback',has_media:true})});
      await w.fetch('/api/forum/external-video-upload',{method:'POST',body:JSON.stringify({post_id:postId})});
      await assert.rejects(w.fetch('/api/forum/post-media',{method:'POST',body:JSON.stringify({post_id:postId,media:[{storage_path:sourceKey}]})}),/D_OBSERVER_FAILED_NO_RETRY/);
      const text=await blob.text(),result=JSON.parse(text);
      assert.equal(attachCalls,1);assert.equal(result.events.at(-1).httpStatus,500);
      assert.deepEqual(result.retentionFailure,{error:'MEDIA_RETENTION_FAILED',stage:stage==='SECRET_PROVIDER_DETAIL'?null:stage??null});
      assert.equal(text.includes('SECRET_PROVIDER_DETAIL'),false);assert.equal(text.includes('PRIVATE_OBJECT_KEY'),false);
      assert.equal(result.status,'STOPPED_UNKNOWN');assert.equal(w.fetch,originalFetch);
    }finally{observer?.finish();for(const n of names)globalThis[n]=prior[n];}
  }
});

test('D binding: actual creation observer and production checkpoints are implemented',()=>{
  assert.equal(typeof api?.buildDProductionCreation,'function');
  assert.equal(typeof api?.runDProductionCheckpoint,'function');
});

test('D binding: PUT post-media and independent ownership claim snapshot bind exact metadata',()=>{
  const result=api.buildDProductionCreation({captureRaw:Buffer.from(JSON.stringify(capture())),
    snapshotRaw:Buffer.from(JSON.stringify(snapshot())),binding});
  const c=JSON.parse(result.creationRaw);
  assert.deepEqual(c.keys,[sourceKey,retainedKey]);assert.equal(c.actorId,actorId);assert.equal(c.postId,postId);
  assert.equal(c.objectMetadata.length,2);assert.equal(c.objectMetadata[0].etag,capture().put.etag);
  assert.equal(c.objectMetadata[1].etag,capture().put.etag);assert.equal(result.productionAuthority,false);
  for(const mutate of [c=>c.put.status=403,c=>c.put.key+='x',c=>c.media.size_bytes=1,
    c=>c.events[2].outcome='UNKNOWN',c=>c.retainedKey=sourceKey]) {
    const v=capture();mutate(v);
    assert.throws(()=>api.buildDProductionCreation({captureRaw:Buffer.from(JSON.stringify(v)),
      snapshotRaw:Buffer.from(JSON.stringify(snapshot())),binding}),/D_CREATION_CHAIN_UNPROVEN/);
  }
  for(const mutate of [s=>s.media[0].user_id=postId,s=>s.claim.retained_key=sourceKey,s=>s.media=[],s=>s.post.author_id=postId]) {
    const v=snapshot();mutate(v);
    assert.throws(()=>api.buildDProductionCreation({captureRaw:Buffer.from(JSON.stringify(capture())),
      snapshotRaw:Buffer.from(JSON.stringify(v)),binding}),/D_CREATION_CHAIN_UNPROVEN/);
  }
});

test('D binding: production owner deletion uses exact real route and does not export a session',async()=>{
  const prior={window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch};
  const w={};w.top=w;globalThis.window=w;
  globalThis.location={origin:'https://openglasshub.ogh.workers.dev',pathname:'/posts/new/',search:'',hash:''};
  let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,`/api/forum/posts?id=${postId}`);
    assert.equal(options.method,'DELETE');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    assert.equal(options.headers.authorization,'Bearer NONSECRET_LOCAL_FIXTURE');
    return new Response(JSON.stringify({ok:true,status:'deleted',post:{id:postId,status:'deleted'},
      cleanup:{ok:true,warnings:[],errors:[],deletedRows:1,deletedObjects:[{storage:'r2',path:retainedKey,
        mediaId,status:'deleted',httpStatus:204}]}}),{status:200,headers:{'content-type':'application/json'}});};
  const client={supabaseUrl:'https://xcbnxzjlsvtgzixurcof.supabase.co',supabaseKey:'PUBLIC_FIXTURE',auth:{storage:{
    getItem:async()=>JSON.stringify({user:{id:actorId},access_token:'NONSECRET_LOCAL_FIXTURE',expires_at:Date.now()/1000+600})}}};
  try {
    const p={...binding,phase:'OWNER_DELETE',requestId:'fixture-delete',mediaId,retainedKey,deadlineUtc:new Date(Date.now()+10000).toISOString(),
      verifiedContextReceiptSha256:'7'.repeat(64)};
    const r=await api.runDProductionCheckpoint(p,client);
    assert.equal(r.postId,postId);assert.equal(r.acknowledged,true);assert.equal(calls,1);
    assert.equal(JSON.stringify(r).includes('NONSECRET_LOCAL_FIXTURE'),false);
    assert.equal((await api.runDProductionCheckpoint(p,client)).state,'UNKNOWN');assert.equal(calls,1);
    for(const expiry of [undefined,null,'123',NaN,Infinity]){
      client.auth.storage.getItem=async()=>JSON.stringify({user:{id:actorId},access_token:'NONSECRET_LOCAL_FIXTURE',expires_at:expiry});
      assert.equal((await api.runDProductionCheckpoint({...p,requestId:'invalid-expiry-'+String(expiry)},client)).state,'UNKNOWN');
    }
    assert.equal(calls,1);
  }finally{globalThis.window=prior.window;globalThis.location=prior.location;globalThis.fetch=prior.fetch;}
});

test('D binding: generated checkpoint seals its deadline before delayed module import',async()=>{
  const {runInNewContext}=await import('node:vm');let now=Date.now(),loaded=0,read=0;
  const p={executionBindingSha256:binding.executionBindingSha256,actorId,postId,mediaId,retainedKey,phase:'OWNER_DELETE',requestId:'delayed-import',
    deadlineUtc:new Date(now+1000).toISOString(),verifiedContextReceiptSha256:'7'.repeat(64)};
  const code=api.buildDCheckpointCode(p),w={};w.top=w;
  class Clock extends Date{static now(){return now;}}
  // Replace only the import expression with a fixture loader; execute all actual guards.
  const fixture=code.replace('import("/_astro/supabase-browser.CbJzQpCJ.js")','load()');
  await assert.rejects(runInNewContext(`(${fixture})()`,{window:w,location:{origin:'https://openglasshub.ogh.workers.dev',search:'',hash:''},
    Date:Clock,load:async()=>{loaded++;now+=2000;return {n:()=>({auth:{storage:{getItem(){read++;}}}})};}}),/D_CHECKPOINT_EXPIRED/);
  assert.equal(loaded,1);assert.equal(read,0);
});

test('D binding: MCP deletion code dispatches only exact created keys, never a prefix LIST',async()=>{
  const {runInNewContext}=await import('node:vm');const {webcrypto}=await import('node:crypto');
  const b={...binding,keys:[sourceKey],createdKeys:[sourceKey,retainedKey],creationReceiptSha256:'8'.repeat(64),requestId:'fixture-object-delete'};
  const code=api.buildDObjectDeleteCode(b);let calls=0;
  const r=await runInNewContext(`(${code})()`,{accountId:'dcb374166b39234a499985145c075f50',TextEncoder,Date,
    setTimeout,clearTimeout,crypto:webcrypto,cloudflare:{request:async options=>{
      calls++;assert.equal(options.method,'DELETE');assert.equal(options.path,
        '/accounts/dcb374166b39234a499985145c075f50/r2/buckets/openglasshub-media/objects');
      assert.equal(options.query,undefined);assert.deepEqual(JSON.parse(JSON.stringify(options.body)),
        [sourceKey]);return {success:true,status:200,result:[{key:sourceKey}],errors:[]};}}});
  assert.equal(calls,1);assert.equal(r.evidence.responseSha256,digest(r.rawDecodedResponse));
  assert.equal(r.evidence.creationReceiptSha256,b.creationReceiptSha256);
});

test('D binding: actual passive UI observer captures PUT metadata without signed URL or credential export',async()=>{
  const names=['window','location','document','URL'];const prior=Object.fromEntries(names.map(n=>[n,globalThis[n]]));
  let blob,calls=0,malicious=false;const w={};w.top=w;
  w.fetch=async input=>{
    calls++;const u=new prior.URL(input,'https://openglasshub.ogh.workers.dev');
    if(u.pathname==='/api/forum/posts')return new Response(JSON.stringify({post:{id:postId}}),{status:201});
    if(u.pathname==='/api/forum/external-video-upload')return new Response(JSON.stringify({storage_path:sourceKey,
      upload_url:'SIGNED_URL_MUST_NOT_EXPORT',media_url:'UNNEEDED'}),{status:200});
    if(u.pathname.endsWith('/'+sourceKey))return new Response(null,{status:200,headers:{etag:'"'+'a'.repeat(32)+'"'}});
    return new Response(JSON.stringify({media:[{...capture().media,url:malicious?'https://invalid.example/?PRIVATE_RESPONSE_MARKER':null}]}),{status:201});
  };
  globalThis.window=w;globalThis.location={origin:'https://openglasshub.ogh.workers.dev',pathname:'/posts/new/',search:'',hash:''};
  globalThis.document={body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
  class LocalURL extends prior.URL {}
  LocalURL.createObjectURL=b=>{blob=b;return 'blob:fixture';};LocalURL.revokeObjectURL=()=>{};globalThis.URL=LocalURL;
  let installed;
  try {
    installed=api.installDVideoCreationObserver({...binding,verifiedContextReceiptSha256:'7'.repeat(64),
      deadlineUtc:new Date(Date.now()+10000).toISOString(),title:'fixture',body:'synthetic',circleSlug:'fixture'});
    await w.fetch('/api/forum/posts',{method:'POST',body:JSON.stringify({title:'fixture',body:'synthetic',circle_slug:'fixture',type:'feedback',has_media:true})});
    await w.fetch('/api/forum/external-video-upload',{method:'POST',body:JSON.stringify({post_id:postId})});
    await w.fetch(`https://dcb374166b39234a499985145c075f50.r2.cloudflarestorage.com/openglasshub-media/${sourceKey}?X-Amz-Signature=PRIVATE_QUERY`,
      {method:'PUT',body:new Blob([new Uint8Array(2018)],{type:'video/mp4'})});
    await w.fetch('/api/forum/post-media',{method:'POST',body:JSON.stringify({post_id:postId,media:[{storage_path:sourceKey}]})});
    const text=await blob.text(),result=JSON.parse(text);
    assert.equal(result.put.account,'dcb374166b39234a499985145c075f50');assert.equal(result.events.length,4);
    assert.equal(result.status,'OBSERVED_REQUIRES_SERVER_READBACK');assert.equal(result.requestsInitiated,0);
    assert.equal(text.includes('PRIVATE_QUERY'),false);assert.equal(text.includes('SIGNED_URL'),false);assert.equal(calls,4);
    malicious=true;
    installed=api.installDVideoCreationObserver({...binding,executionBindingSha256:'a'.repeat(64),verifiedContextReceiptSha256:'7'.repeat(64),
      deadlineUtc:new Date(Date.now()+10000).toISOString(),title:'fixture',body:'synthetic',circleSlug:'fixture'});
    await w.fetch('/api/forum/posts',{method:'POST',body:JSON.stringify({title:'fixture',body:'synthetic',circle_slug:'fixture',type:'feedback',has_media:true})});
    await w.fetch('/api/forum/external-video-upload',{method:'POST',body:JSON.stringify({post_id:postId})});
    await w.fetch(`https://dcb374166b39234a499985145c075f50.r2.cloudflarestorage.com/openglasshub-media/${sourceKey}`,
      {method:'PUT',body:new Blob([new Uint8Array(2018)],{type:'video/mp4'})});
    await assert.rejects(w.fetch('/api/forum/post-media',{method:'POST',body:JSON.stringify({post_id:postId,media:[{storage_path:sourceKey}]})}));
    const failure=await blob.text();assert.equal(failure.includes('PRIVATE_RESPONSE_MARKER'),false);
    assert.equal(JSON.parse(failure).status,'STOPPED_UNKNOWN');
  }finally{installed?.finish();for(const n of names)globalThis[n]=prior[n];}
});

test('D binding: timed out local session read cannot later submit logout or refresh',async()=>{
  const prior={window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch};
  const w={};w.top=w;globalThis.window=w;
  globalThis.location={origin:'https://openglasshub.ogh.workers.dev',pathname:'/posts/new/',search:'',hash:''};
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error();};
  const client={supabaseUrl:'https://xcbnxzjlsvtgzixurcof.supabase.co',supabaseKey:'PUBLIC_FIXTURE',auth:{storage:{
    getItem:async()=>{await new Promise(r=>setTimeout(r,40));return JSON.stringify({user:{id:actorId},
      access_token:'PRIVATE_FIXTURE',expires_at:Date.now()/1000+600});}},getSession:()=>{throw Error('MUST_NOT_REFRESH');}}};
  try{
    const r=await api.runDProductionCheckpoint({...binding,mediaId,phase:'ACTOR_LOGOUT',requestId:'late-logout',
      deadlineUtc:new Date(Date.now()+10).toISOString(),verifiedContextReceiptSha256:'7'.repeat(64)},client);
    assert.equal(r.state,'UNKNOWN');await new Promise(r=>setTimeout(r,60));assert.equal(calls,0);
  }finally{Object.assign(globalThis,prior);}
});

test('D binding: projected REST reads never retry 520 or invoke SDK refresh',async()=>{
  const prior={window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch};
  const w={};w.top=w;globalThis.window=w;
  globalThis.location={origin:'https://openglasshub.ogh.workers.dev',pathname:'/admin/security/',search:'',hash:''};
  let calls=0;globalThis.fetch=async(url,options)=>{calls++;const u=new URL(url);
    assert.equal(u.pathname,'/rest/v1/posts');assert.equal(u.searchParams.get('id'),'eq.'+postId);
    assert.equal(options.redirect,'error');return new Response('{}',{status:520});};
  const client={supabaseUrl:'https://xcbnxzjlsvtgzixurcof.supabase.co',supabaseKey:'PUBLIC_FIXTURE',auth:{storage:{
    getItem:async()=>JSON.stringify({user:{id:claimId},access_token:'PRIVATE_FIXTURE',expires_at:Date.now()/1000+600})},
    getSession:()=>{throw Error('MUST_NOT_REFRESH');}},from:()=>{throw Error('MUST_NOT_RETRY');}};
  try{
    const r=await api.runDProductionCheckpoint({...binding,mediaId,moderatorId:claimId,phase:'POST_READBACK',requestId:'no-retry',
      deadlineUtc:new Date(Date.now()+10000).toISOString(),verifiedContextReceiptSha256:'7'.repeat(64)},client);
    assert.equal(r.state,'UNKNOWN');assert.equal(calls,1);assert.equal(JSON.stringify(r).includes('PRIVATE_FIXTURE'),false);
  }finally{Object.assign(globalThis,prior);}
});

test('D binding: stopped composite read cannot dispatch anonymous evidence later; stalled logout still bans',async()=>{
  const createdAt=new Date(Date.now()-60000).toISOString();
  const actorRaw=Buffer.from(JSON.stringify({executionBindingSha256:binding.executionBindingSha256,actorId,
    createdByThisRun:true,createdUtc:createdAt,providerReceiptSha256:'7'.repeat(64)}));
  const b={...binding,actorCreationReceiptSha256:digest(actorRaw),moderatorId:claimId,actorEmail:'fixture@example.invalid',
    namespace:'fixture-d-run',createdAt,deadlineUtc:new Date(Date.now()+60000).toISOString(),
    ownerContextReceiptSha256:'8'.repeat(64),moderatorContextReceiptSha256:'9'.repeat(64)};
  const created=api.buildDProductionCreation({captureRaw:Buffer.from(JSON.stringify(capture())),
    snapshotRaw:Buffer.from(JSON.stringify(snapshot())),binding:b}).creationRaw;
  let release,anonymous=0,calls=0,logoutCode,logoutParams;
  const cb=api.createDProductionCleanupCallbacks({binding:b,creationRaw:created,actorCreationRaw:actorRaw,
    adminKey:'PRIVATE_FIXTURE',logoutTimeoutMs:30,ownerCheckpoint:async(code,p)=>{logoutCode=code;logoutParams=p;return new Promise(()=>{});},
    moderatorCheckpoint:async(_code,p)=>new Promise(resolve=>{release=()=>resolve({binding:b.executionBindingSha256,
      requestId:p.requestId,postId,mediaRows:0,postState:'deleted'});}),mcpExecute:async()=>{},
    anonymousReadback:async()=>{anonymous++;},beforeDispatch:async phase=>{
      if(phase==='ACTOR_GLOBAL_LOGOUT')await new Promise(r=>setTimeout(r,10));return true;}});
  const abort=new AbortController(),read=cb.readPost(postId,abort.signal);abort.abort();release();
  await assert.rejects(read);assert.equal(anonymous,0);
  const prior=globalThis.fetch;globalThis.fetch=async()=>{
    calls++;return new Response(JSON.stringify({id:actorId,email:b.actorEmail,created_at:createdAt,role:'authenticated',
      user_metadata:{qa_namespace:b.namespace},banned_until:calls===3?new Date(Date.now()+876000*3600000).toISOString():null}),{status:200});};
  try{const started=Date.now(),r=await cb.finishActor(actorId);assert.equal(calls,3);assert.equal(r.banned,true);
    assert.equal(r.independentReadback,true);assert.equal(r.signedOut,false);
    assert.equal(Date.parse(logoutParams.deadlineUtc)<=started+30,true);
    const {runInNewContext}=await import('node:vm'),w={};w.top=w;
    await assert.rejects(runInNewContext(`(${logoutCode})()`,{window:w,Date,location:{origin:'https://openglasshub.ogh.workers.dev',search:'',hash:''}}),
      /D_CHECKPOINT_EXPIRED/);assert.equal(calls,3);}
  finally{globalThis.fetch=prior;}
});

test('D closure: callback targets are immutable and stalled deletion still reaches separate containment',async()=>{
  const actorRaw=Buffer.from(JSON.stringify({executionBindingSha256:binding.executionBindingSha256,actorId,
    createdByThisRun:true,createdUtc:'2026-10-29T10:00:00.000Z',providerReceiptSha256:'7'.repeat(64)}));
  const created=api.buildDProductionCreation({captureRaw:Buffer.from(JSON.stringify(capture())),
    snapshotRaw:Buffer.from(JSON.stringify(snapshot())),binding}).creationRaw;
  const target={actorId,postId,actorCreationReceiptSha256:digest(actorRaw)};
  let contained=0,deleted;
  const result=await runDBoundCleanup({creationRaw:created,actorCreationRaw:actorRaw,postState:'published',target,
    callbackTimeoutMs:10,callbacks:{beforeDispatch:async()=>{target.actorId=postId;target.postId=actorId;return true;},
      ownerDelete:async id=>{deleted=id;return new Promise(()=>{});},finishActor:async id=>{contained++;assert.equal(id,actorId);
        return {actorId,actorCreationReceiptSha256:digest(actorRaw),signedOut:true,banned:true,independentReadback:true};}}});
  assert.equal(deleted,postId);assert.equal(contained,1);assert.equal(result.actorContained,true);
  assert.equal(result.failedPhase,'OWNER_DELETE');assert.equal(result.state,'BLOCKED');
  assert.equal(result.objectOutcomes.length,2);assert.equal(result.objectOutcomes[0].state,'UNKNOWN');
  assert.equal(result.providerCancellationProven,false);
});

test('D closure: real-route creation metadata binds six HEADs, author cleanup and only source DELETE',async()=>{
  const {createDHeadVerifier}=await import('./d-r2-head-verification.mjs');const {Readable}=await import('node:stream');
  const actorRaw=Buffer.from(JSON.stringify({executionBindingSha256:binding.executionBindingSha256,actorId,
    createdByThisRun:true,createdUtc:'2026-10-29T10:00:00.000Z',providerReceiptSha256:'7'.repeat(64)}));
  const b={...binding,actorCreationReceiptSha256:digest(actorRaw),creationMode:'SERVER_RECEIPT_V2',
    notBeforeUtc:'2026-10-29T10:00:00.000Z',deadlineUtc:'2026-10-29T10:50:00.000Z'};
  const bytes=api.buildDProductionCreation({captureRaw:Buffer.from(JSON.stringify(capture())),
    snapshotRaw:Buffer.from(JSON.stringify(snapshot())),binding:b}).creationRaw;
  let time=Date.parse('2026-10-29T10:02:03.000Z'),calls=0;const responses=[200,200,200,200,404,404];
  const head=createDHeadVerifier({binding:b,scope:{account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',
    jurisdiction:'default',permission:'object-read-only',evidenceSha256:'8'.repeat(64),bucketProvenanceSha256:'9'.repeat(64),
    expiresUtc:b.deadlineUtc,configurationWindowBindingSha256:b.executionBindingSha256},
    credentials:{accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)},now:()=>time,beforeDispatch:async()=>true,
    requestHandler:{destroy(){},async handle(){calls++;const status=responses.shift();return {response:{statusCode:status,
      headers:{'x-amz-request-id':'fixture-id',...(status===200?{'content-length':'2018',etag:capture().put.etag,
        'x-amz-storage-class':'STANDARD'}:{})},body:Readable.from([])}};}}});
  try {
    for(const key of [sourceKey,retainedKey])assert.equal((await head.head({phase:'AFTER_CREATE',key,creationRaw:bytes})).state,'PRESENT');
    time=Date.parse('2026-10-29T10:12:04.000Z');
    const events=[];
    const result=await runDBoundCleanup({creationRaw:bytes,actorCreationRaw:actorRaw,postState:'published',
      target:{actorId,postId,actorCreationReceiptSha256:digest(actorRaw)},headVerifier:head,
      callbacks:{beforeDispatch:async p=>{events.push(p);return true;},
        ownerDelete:async()=>({postId,actorId,postState:'deleted',acknowledged:true,applicationDeletedKeys:[retainedKey],
          requestId:'owner-delete',cleanupOk:true,startedUtc:'2026-10-29T10:12:05.000Z',completedUtc:'2026-10-29T10:12:06.000Z'}),
        readPost:async()=>({postId,independent:true,postState:'deleted',mediaRows:0,anonymousStatus:404}),
        deleteExactObjects:async keys=>{assert.deepEqual(keys,[sourceKey]);time=Date.parse('2026-10-29T10:12:09.000Z');
          const rawDecodedResponse=JSON.stringify({success:true,status:200,result:[{key:sourceKey}],errors:[],messages:[]});
          return {rawDecodedResponse,evidence:{executionBindingSha256:b.executionBindingSha256,connectionBindingSha256:b.connectionBindingSha256,
            account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',jurisdiction:'default',method:'DELETE',requestId:'source-delete',
            keys,createdKeys:[sourceKey,retainedKey],creationReceiptSha256:digest(bytes),responseSha256:digest(rawDecodedResponse),
            status:200,complete:true,startedUtc:'2026-10-29T10:12:07.000Z',completedUtc:'2026-10-29T10:12:08.000Z'}};},
        finishActor:async()=>({actorId,actorCreationReceiptSha256:digest(actorRaw),signedOut:true,banned:true,independentReadback:true})}});
    assert.equal(result.state,'CLEANUP_SEQUENCE_VERIFIED');assert.equal(calls,6);
    assert.equal(result.objectOutcomes.every(o=>o.state==='ABSENCE_VERIFIED'),true);
    assert.equal(events[2],'OWNER_DELETE');assert.equal(result.productionAuthority,false);
  }finally{head.close();}
});

test('D binding: exact new actor containment uses actual Auth routes with independent ban readback',async()=>{
  const prior=globalThis.fetch;let calls=0;
  const createdAt=new Date(Date.now()-60000).toISOString();
  const actorCreationRaw=Buffer.from(JSON.stringify({executionBindingSha256:binding.executionBindingSha256,actorId,
    createdByThisRun:true,createdUtc:createdAt,providerReceiptSha256:'7'.repeat(64)}));
  const p={...binding,actorEmail:'fixture@example.invalid',namespace:'fixture-d-run',createdAt,
    actorCreationReceiptSha256:digest(actorCreationRaw),deadlineUtc:new Date(Date.now()+10000).toISOString()};
  globalThis.fetch=async(url,options)=>{
    calls++;assert.equal(url,`https://xcbnxzjlsvtgzixurcof.supabase.co/auth/v1/admin/users/${actorId}`);
    assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer PRIVATE_FIXTURE_ADMIN_KEY');
    if(options.method==='PUT')assert.deepEqual(JSON.parse(options.body),{ban_duration:'876000h'});
    return new Response(JSON.stringify({id:actorId,email:p.actorEmail,created_at:p.createdAt,role:'authenticated',
      user_metadata:{qa_namespace:p.namespace},banned_until:calls===3?new Date(Date.now()+876000*3600000).toISOString():null}),{status:200});
  };
  try {
    const result=await api.containDProductionActor({binding:p,actorCreationRaw,adminKey:'PRIVATE_FIXTURE_ADMIN_KEY',
      logoutEvidence:{actorId,binding:p.executionBindingSha256,scope:'global',signedOut:true,
        requestId:'browser-global-signout',completedUtc:new Date().toISOString()},
      beforeDispatch:async()=>true});
    assert.equal(result.signedOut,true);assert.equal(result.banned,true);assert.equal(result.independentReadback,true);
    assert.equal(calls,3);assert.equal(JSON.stringify(result).includes('PRIVATE_FIXTURE_ADMIN_KEY'),false);
  }finally{globalThis.fetch=prior;}
});

test('D closure: server creation source pins and metadata mismatch stop HEAD and cannot reach deletion',async()=>{
  const {createDHeadVerifier}=await import('./d-r2-head-verification.mjs');const {Readable}=await import('node:stream');
  const b={...binding,creationMode:'SERVER_RECEIPT_V2',notBeforeUtc:'2026-10-29T10:00:00.000Z',deadlineUtc:'2026-10-29T10:50:00.000Z'};
  const raw=api.buildDProductionCreation({captureRaw:Buffer.from(JSON.stringify(capture())),snapshotRaw:Buffer.from(JSON.stringify(snapshot())),binding:b}).creationRaw;
  const make=()=>{let calls=0;const head=createDHeadVerifier({binding:b,scope:{account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',
    jurisdiction:'default',permission:'object-read-only',evidenceSha256:'8'.repeat(64),bucketProvenanceSha256:'9'.repeat(64),
    expiresUtc:b.deadlineUtc,configurationWindowBindingSha256:b.executionBindingSha256},credentials:{accessKeyId:'a'.repeat(32),secretAccessKey:'b'.repeat(64)},
    now:()=>Date.parse('2026-10-29T10:03:00.000Z'),beforeDispatch:async()=>true,requestHandler:{destroy(){},async handle(){calls++;
      return {response:{statusCode:200,headers:{'x-amz-request-id':'fixture-id','content-length':'2018',etag:'"'+'f'.repeat(32)+'"',
        'x-amz-storage-class':'STANDARD'},body:Readable.from([])}};}}});return {head,calls:()=>calls};};
  for(const field of ['identityReceiptSha256','frozenArtifactSha256','observerSourceSha256']){
    const x=make(),changed=JSON.parse(raw);changed[field]='a'.repeat(64);
    try{const r=await x.head.head({phase:'AFTER_CREATE',key:sourceKey,creationRaw:Buffer.from(JSON.stringify(changed))});
      assert.equal(r.state,'UNKNOWN');assert.equal(x.calls(),0);}finally{x.head.close();}
  }
  const x=make();try{assert.equal((await x.head.head({phase:'AFTER_CREATE',key:sourceKey,creationRaw:raw})).state,'UNKNOWN');
    assert.equal(x.calls(),1);assert.equal((await x.head.head({phase:'BEFORE_DELETE',key:sourceKey,creationRaw:raw})).state,'UNKNOWN');
    assert.equal(x.calls(),1);}finally{x.head.close();}
});
