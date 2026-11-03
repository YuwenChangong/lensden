import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {parse} from 'smol-toml';
import {AwsClient} from 'aws4fetch';
import {buildOutboundFetchInit} from '../lib/locale-v2-outbound-bridge.mjs';

const bucket='ogh-e2e-video-20261016';
const digest=b=>createHash('sha256').update(b).digest('hex');
const safeError=()=>Error('ISOLATED_R2_REQUEST_STOPPED');

export function validateR2CorsResponse(response) {
  assert.ok([200,204].includes(response.status),'R2_CORS_PREFLIGHT_FAILED');
  assert.equal(response.headers.get('access-control-allow-origin'),'https://127.0.0.1:4328','R2_CORS_ORIGIN_MISMATCH');
  assert.ok(response.headers.get('access-control-allow-methods')?.split(',').map(x=>x.trim().toUpperCase()).includes('PUT'),'R2_CORS_PUT_NOT_ALLOWED');
  assert.ok(response.headers.get('access-control-allow-headers')?.split(',').map(x=>x.trim().toLowerCase()).includes('content-type'),'R2_CORS_CONTENT_TYPE_NOT_ALLOWED');
  return {originMatched:true,putAllowed:true,contentTypeAllowed:true};
}

// One owner-approved object; secrets and signed URLs never enter the safe report.
export async function createIsolatedR2Run({root,s,report,offline=false}) {
  const e=parseEnv(await fs.readFile(path.join(root,'.env.r2-test.local'),'utf8'));
  const names=['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_PUBLIC_BASE_URL'];
  assert.ok(names.every(k=>e[k]?.trim()),'R2_CONFIGURATION_MISSING');
  assert.equal(e.R2_BUCKET_NAME,bucket,'R2_TEST_BUCKET_REQUIRED');
  assert.equal(e.R2_ACCOUNT_ID,'dcb374166b39234a499985145c075f50','R2_REVIEWED_ACCOUNT_REQUIRED');
  const config=parse(await fs.readFile(path.join(root,'wrangler.toml'),'utf8'));
  const prod=[config.vars,config.env?.production?.vars].filter(Boolean);
  assert.ok(prod.some(v=>v.R2_BUCKET_NAME)&&prod.every(v=>v.R2_BUCKET_NAME!==bucket),'R2_PRODUCTION_BUCKET_DENIED');
  assert.equal(new URL(s.status.API_URL).origin,'http://127.0.0.1:56321','R2_LOCAL_SUPABASE_REQUIRED');
  const publicBase=new URL(e.R2_PUBLIC_BASE_URL);
  assert.equal(publicBase.href,'https://pub-cbcb6154356e4ec3b53f5ef3e5fc58cf.r2.dev/','R2_REVIEWED_PUBLIC_URL_REQUIRED');
  const s3=`https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const virtual=`https://${bucket}.${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const meta=report.realR2={bucketScope:'OWNER_APPROVED_TEST_BUCKET_ONLY',ownerCredentialProvenance:true,
    independentKeyIdentifierMatch:'UNVERIFIED',bucketExclusiveCredentialScopeIndependentlyProven:false,
    costEvidence:'REVIEWED_OCTOBER16_ACCOUNT_SNAPSHOT_NOT_REALTIME',costHardGuarantee:false,
    requestBudget:{max:30,workMax:22,cleanupReserved:8,work:0,cleanup:0,denied:0,byMethod:{}},
    browserWholeNetworkHardCap:false,attempts:[],upload:'NOT_RUN',playback:'NOT_RUN',bucketRange:'NOT_RUN',
    applicationRange:'NOT_RUN',delete:'NOT_RUN',objectNonexistence:'NOT_RUN',cleanup:'NOT_RUN',offlineNoCloudDispatch:offline};
  const budget=meta.requestBudget;
  let key,putUrl,fixture,putAttempted=false,uploadComplete=false,cleanupMode=false,stopped=false;
  let deletionAction=0,deleteSeen=-1;
  const signer=new AwsClient({accessKeyId:e.R2_ACCESS_KEY_ID,secretAccessKey:e.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto',retries:0});
  function objectKey(url) {
    if(url.username||url.password||url.hash||url.protocol!=='https:')throw safeError();
    if(url.origin===publicBase.origin||url.origin===virtual)return decodeURIComponent(url.pathname.slice(1));
    if(url.origin===s3&&url.pathname.startsWith('/'+bucket+'/'))return decodeURIComponent(url.pathname.slice(bucket.length+2));
    throw safeError();
  }
  function admit(url,method,bucketCheck=false) {
    if(bucketCheck&&(method!=='HEAD'||url.href!==s3+'/'+bucket||meta.livePrecheck))throw safeError();
    const target=bucketCheck?null:objectKey(url);
    if((!bucketCheck&&(!key||target!==key))||!['HEAD','GET','PUT','DELETE','OPTIONS'].includes(method)||
      (cleanupMode&&!['HEAD','DELETE'].includes(method))||(!cleanupMode&&stopped)||
      (method==='OPTIONS'&&(putAttempted||url.href!==putUrl))||
      (method==='PUT'&&(putAttempted||url.href!==putUrl))||
      (method==='DELETE'&&(!cleanupMode||deleteSeen===deletionAction)))throw safeError();
    if((cleanupMode?budget.cleanup>=8:budget.work>=22)||budget.work+budget.cleanup>=30)throw safeError();
    if(method==='PUT')putAttempted=true;
    if(method==='DELETE')deleteSeen=deletionAction;
    budget[cleanupMode?'cleanup':'work']++;
    budget.byMethod[method]=(budget.byMethod[method]??0)+1;
  }
  function record(method,status,location) {
    meta.attempts.push({sequence:meta.attempts.length+1,phase:cleanupMode?'CLEANUP':'WORK',method,status,locationPresent:location});
    if(location||status>=300&&status!==404)stopped=true;
  }
  async function controlled(url,init={},bucketCheck=false) {
    if(offline)throw safeError();
    const u=new URL(url),method=init.method??'GET';
    try {admit(u,method,bucketCheck);}catch{budget.denied++;throw safeError();}
    try {
      const r=await fetch(u,{...init,method,redirect:'manual',signal:AbortSignal.timeout(10000)});
      record(method,r.status,r.headers.has('location'));
      if(r.headers.has('location')||r.status>=300&&r.status<400){await r.body?.cancel();throw safeError();}
      return r;
    }catch {stopped=true;throw safeError();}
  }
  async function signed(method,headers={}) {
    const request=await signer.sign(s3+'/'+bucket+'/'+key,{method,headers});
    return controlled(request.url,{method,headers:request.headers});
  }
  async function absent() {
    const r=await signed('HEAD');
    assert.equal(r.status,404,'R2_OBJECT_STILL_PRESENT_OR_ABSENCE_UNPROVEN');
    meta.objectNonexistence='PASS';
  }
  return {
    bindings:Object.fromEntries(names.map(k=>[k,e[k]])),meta,
    async preflight() {
      const request=await signer.sign(s3+'/'+bucket,{method:'HEAD'});
      const response=await controlled(request.url,{method:'HEAD',headers:request.headers},true);
      assert.equal(response.status,200,'R2_TEST_BUCKET_ACCESS_PRECHECK_FAILED');
      meta.livePrecheck={signedHeadStatus:200};
    },
    async verifyCors() {
      if(offline)return;
      const response=await controlled(putUrl,{method:'OPTIONS',headers:{Origin:'https://127.0.0.1:4328','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'}});
      try {
        meta.livePrecheck.corsResponse={status:response.status,
          originMatched:response.headers.get('access-control-allow-origin')==='https://127.0.0.1:4328',
          putAllowed:response.headers.get('access-control-allow-methods')?.split(',').map(x=>x.trim().toUpperCase()).includes('PUT')??false,
          contentTypeAllowed:response.headers.get('access-control-allow-headers')?.split(',').map(x=>x.trim().toLowerCase()).includes('content-type')??false};
        validateR2CorsResponse(response);
        meta.livePrecheck.corsOriginAndPutMatched=true;
      }finally{await response.body?.cancel();}
    },
    isTarget:u=>[s3,virtual,publicBase.origin].includes(u.origin),
    setFixture:b=>{assert.ok(b.length>100&&b.length<=65536);fixture=b;},
    register(ticket,payload) {
      assert.ok(!key,'ONLY_ONE_R2_OBJECT_ALLOWED');
      assert.equal(payload.mime_type,'video/mp4');
      assert.equal(payload.size_bytes,fixture.length);
      assert.match(payload.post_id,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
      const candidate=ticket.storage_path;
      const prefix='tmp/'+s.actors.A.id+'/'+payload.post_id+'/';
      assert.ok(typeof candidate==='string'&&candidate.startsWith(prefix)&&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-r2-[a-f0-9]{12}\.mp4$/.test(candidate.slice(prefix.length))&&
        candidate.endsWith('-r2-'+s.runId+'.mp4'),'R2_OWNED_UNIQUE_PREFIX_REQUIRED');
      const u=new URL(ticket.upload_url);
      assert.equal(objectKey(u),candidate,'R2_PRESIGNED_TARGET_MISMATCH');
      assert.equal(objectKey(new URL(ticket.media_url)),candidate,'R2_PUBLIC_TARGET_MISMATCH');
      key=candidate;putUrl=u.href;
      meta.ownedObjectReference=digest(Buffer.from(key)).slice(0,20);
    },
    async workerFetch(request) {
      try {return await controlled(request.url,await buildOutboundFetchInit(request));}
      catch{return new Response('ISOLATED_R2_STOPPED',{status:403});}
    },
    async browserFetch(route) {
      if(offline)return route.abort();
      const req=route.request(),method=req.method();
      try {
        if(method==='PUT')assert.equal(digest(req.postDataBuffer()??Buffer.alloc(0)),digest(fixture??Buffer.alloc(0)),'R2_SINGLE_FIXTURE_REQUIRED');
        admit(new URL(req.url()),method);
        const r=await route.fetch({maxRetries:0,maxRedirects:0,timeout:10000,ignoreHTTPSErrors:false});
        const location=Object.keys(r.headers()).some(h=>h.toLowerCase()==='location');
        record(method,r.status(),location);
        if(location||r.status()>=300&&r.status()<400)throw safeError();
        if(method==='PUT'){assert.ok(r.ok(),'R2_PUT_FAILED');uploadComplete=true;meta.upload='PASS';}
        await route.fulfill({response:r});await r.dispose();
      }catch {stopped=true;await route.abort().catch(()=>{});}
    },
    async verifyCreated() {
      const r=await signed('HEAD');assert.equal(r.status,200,'R2_CREATED_OBJECT_HEAD');
      assert.equal(+r.headers.get('content-length'),fixture.length,'R2_OBJECT_SIZE_MISMATCH');
      assert.ok(uploadComplete,'R2_UPLOAD_NOT_CONFIRMED');
      meta.createdObjectSizeVerified=true;
    },
    async verifyRange() {
      const r=await signed('GET',{Range:'bytes=0-31'});
      assert.equal(r.status,206,'R2_BUCKET_RANGE_NOT_206');
      assert.equal(r.headers.get('content-range'),'bytes 0-31/'+fixture.length,'R2_BUCKET_RANGE_HEADER');
      const data=Buffer.from(await r.arrayBuffer());assert.equal(data.length,32);assert.deepEqual(data,fixture.subarray(0,32));
      meta.bucketRange='PASS';
    },
    beginDeletion(){cleanupMode=true;deletionAction++;},
    absent,
    async finalize() {
      if(!putAttempted){meta.cleanup='NO_R2_UPLOAD_ATTEMPTED';return;}
      cleanupMode=true;
      try {
        if(meta.objectNonexistence!=='PASS') {
          deletionAction++;
          const r=await signed('DELETE');assert.ok([200,204,404].includes(r.status),'R2_CLEANUP_DELETE_FAILED');await r.body?.cancel();
          await absent();meta.fallbackCleanupUsed=true;
        }
        meta.cleanup='PASS';
      }catch{meta.cleanup='FAIL';meta.residualObjectReference=meta.ownedObjectReference;}
    }
  };
}

export async function runRealR2Cases(h) {
  const {r2,pages,goto,origin,contexts,s,sql,browserApi,responseFor,out,report}=h;
  const meta=r2.meta;
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  let bytes,media;
  const check=async(id,fn)=>{
    await h.check(id,fn,'realR2');
    if(report.results.at(-1)?.status!=='PASS')throw Error('R2_SINGLE_ATTEMPT_STOPPED');
  };
  await check('REAL_R2_LIVE_PRECHECK',async()=>{await r2.preflight();return {signedBucketHead200:true,consumesCurrentBudget:true};});
  await check('REAL_R2_SYNTHETIC_MP4',async()=>{
    const encoded=await pages.A.evaluate(async()=>{
      const mime=['video/mp4;codecs=avc1.42001E','video/mp4;codecs=avc1.42E01E','video/mp4'].find(t=>globalThis.MediaRecorder?.isTypeSupported(t));
      if(!mime)return null;
      const c=document.createElement('canvas');c.width=160;c.height=90;
      const stream=c.captureStream(10),chunks=[],ctx=c.getContext('2d');
      const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:32000});
      const done=new Promise((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onerror=()=>reject(Error('MP4_ENCODER_FAILED'));rec.onstop=async()=>resolve(btoa(String.fromCharCode(...new Uint8Array(await new Blob(chunks).arrayBuffer()))));});
      let f=0;rec.start();const timer=setInterval(()=>{ctx.fillStyle=f++%2?'#147d89':'#eeeeee';ctx.fillRect(0,0,160,90);},100);
      await new Promise(r=>setTimeout(r,1000));clearInterval(timer);rec.stop();
      try{return {base64:await done,mime};}finally{stream.getTracks().forEach(t=>t.stop());}
    });
    assert.ok(encoded,'LOCAL_MP4_ENCODER_UNAVAILABLE');bytes=Buffer.from(encoded.base64,'base64');
    assert.equal(bytes.toString('ascii',4,8),'ftyp','VALID_MP4_CONTAINER_REQUIRED');
    r2.setFixture(bytes);
    meta.fixture={bytes:bytes.length,sha256:digest(bytes),mime:encoded.mime,synthetic:true};
    return {...meta.fixture,realR2:false};
  });
  const ticketRoute=createR2TicketRoute(r2);
  await contexts.A.route(u=>u.origin===origin&&u.pathname==='/api/forum/external-video-upload',ticketRoute);
  try {
    await check('REAL_R2_VIDEO_UPLOAD',async()=>{
      const p=pages.A,title='Isolated R2 '+s.runId;
      await goto(p,'/posts/new/?circle='+h.circleSlug);
      const form=p.locator('.post-composer__form');
      await form.locator('input:not([type=hidden]):not([type=file])').fill(title);
      await form.locator('textarea').fill('Single disposable synthetic R2 video.');
      await p.locator('input[type=file]').setInputFiles({name:'r2-'+s.runId+'.mp4',mimeType:'video/mp4',buffer:bytes});
      await p.locator('.media-preview-card').first().waitFor();
      const linked=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/post-media'&&r.request().method()==='POST',{timeout:20000});
      await form.locator('button[type=submit]').click();
      assert.equal((await linked).status(),201,'R2_MEDIA_LINK_FAILED');
      const raw=(await sql(s,`select row_to_json(m)::text from (select pm.id,pm.post_id,pm.storage_path from public.post_media pm join public.posts p on p.id=pm.post_id where p.title=${q(title)} and p.author_id=${q(s.actors.A.id)} and pm.kind='video') m;`)).stdout.trim();
      media=JSON.parse(raw);assert.ok(media.storage_path.startsWith('tmp/'),'R2_FALLBACK_NOT_ACCEPTED');
      await r2.verifyCreated();return {presignedPut:true,realR2:true,sizeVerified:true,localMediaLinked:true};
    });
    await check('REAL_R2_VIDEO_PLAYBACK',async()=>{
      const p=pages.A;await goto(p,'/posts/'+media.post_id+'/');
      const video=p.locator('main video').first();await video.waitFor();
      await video.evaluate(async v=>{v.muted=true;await v.play();});
      await p.waitForFunction(()=>{const v=document.querySelector('main video');return v&&v.currentTime>0.1&&v.readyState>=2&&!v.error;},{},{timeout:10000});
      const evidence=await video.evaluate(v=>({time:v.currentTime,readyState:v.readyState,width:v.videoWidth,height:v.videoHeight,error:v.error?.code??null}));
      await video.evaluate(v=>{v.pause();v.removeAttribute('src');v.load();});
      await p.screenshot({path:path.join(out,'real-r2-video-safe.png'),fullPage:true,mask:[p.getByText(/@example\.invalid/)]});
      meta.playback='PASS';return {realBrowserDecoded:true,...evidence};
    });
    await check('REAL_R2_RANGE',async()=>{
      await r2.verifyRange();
      const read=await pages.A.evaluate(async id=>{const r=await fetch('/api/media/post/'+id,{headers:{Range:'bytes=0-31'},cache:'no-store'});return {status:r.status,contentRange:r.headers.get('content-range'),bytes:Array.from(new Uint8Array(await r.arrayBuffer()))};},media.id);
      assert.ok([200,206].includes(read.status),'APPLICATION_RANGE_READ_FAILED');
      const received=Buffer.from(read.bytes);
      if(read.status===200)assert.equal(digest(received),digest(bytes));else assert.deepEqual(received,bytes.subarray(0,32));
      meta.applicationRange=read.status===206?'PARTIAL_206':'FULL_200_RANGE_NOT_FORWARDED';
      return {bucketRange206:true,applicationStatus:read.status,applicationRange:meta.applicationRange};
    });
    await check('REAL_R2_OTHER_USER_DELETE_DENIED',async()=>{
      const before=meta.requestBudget.work+meta.requestBudget.cleanup;
      const response=await browserApi(pages.B,'/api/forum/posts?id='+media.post_id,'DELETE');
      assert.equal(response.status,403,'R2_CROSS_USER_DELETE_NOT_DENIED');
      assert.equal(meta.requestBudget.work+meta.requestBudget.cleanup,before,'UNAUTHORIZED_DELETE_REACHED_R2');
      return {httpStatus:403,r2Dispatches:0};
    });
    await check('REAL_R2_APPLICATION_DELETE',async()=>{
      r2.beginDeletion();
      const response=await browserApi(pages.A,'/api/forum/posts?id='+media.post_id,'DELETE');
      assert.equal(response.status,200,'R2_POST_DELETE_FAILED');assert.equal(response.data.cleanup?.ok,true,'R2_CLEANUP_NOT_COMPLETE');
      await r2.absent();
      assert.equal(await h.dbCount('post_media',`post_id=${q(media.post_id)}`),0,'R2_MEDIA_RECORD_REMAINS');
      meta.delete='PASS';return {appCleanupOk:true,authenticatedHead404:true,mediaRows:0};
    });
    await check('REAL_R2_IDEMPOTENT_DELETE',async()=>{
      r2.beginDeletion();
      const response=await browserApi(pages.A,'/api/forum/posts?id='+media.post_id,'DELETE');
      assert.equal(response.status,200);assert.equal(response.data.cleanup?.ok,true);
      await r2.absent();return {secondApplicationDeleteOk:true,authenticatedHead404:true};
    });
  }finally {
    await contexts.A.unroute(u=>u.origin===origin&&u.pathname==='/api/forum/external-video-upload',ticketRoute).catch(()=>{});
    await pages.A.goto('about:blank').catch(()=>{});
  }
}

export function createR2TicketRoute(r2) {
  return async route=>{
    const trace=r2.meta.ticket={stage:'REQUEST',requestObserved:true,httpStatus:null};
    let response;
    try {
      response=await route.fetch({maxRetries:0,maxRedirects:0,timeout:10000});
      trace.stage='HTTP';trace.httpStatus=response.status();
      if(response.status()!==200) {
        trace.stage='HTTP_REJECTED';
        await route.fulfill({response});
        return;
      }
      trace.stage='JSON';const data=await response.json();
      trace.stage='VALIDATE';r2.register(data,route.request().postDataJSON());
      if(r2.verifyCors){trace.stage='CORS_PRECHECK';await r2.verifyCors();}
      trace.stage='FULFILL';await route.fulfill({response});
      trace.stage='COMPLETE';
    }catch(e) {
      trace.errorClass=/self.signed|certificate/i.test(e.message??'')?'LOCAL_TLS_CERTIFICATE':
        /Network connection lost/i.test(e.message??'')?'LOCAL_RUNTIME_DISCONNECT':
        /^R2_[A-Z_]+$/.test(e.message??'')?e.message:'OTHER_LOCAL_TICKET_ERROR';
      trace.errorType=e.name;
      await route.abort();
    }finally{await response?.dispose();}
  };
}

export async function runOfflineTicketCase(h) {
  const {r2,pages,contexts,origin,postId,sessions,report,worker}=h;
  r2.setFixture(Buffer.alloc(2028));
  const payload={post_id:postId,file_name:'r2-'+h.s.runId+'.mp4',mime_type:'video/mp4',size_bytes:2028};
  const matches=u=>u.origin===origin&&u.pathname==='/api/forum/external-video-upload';
  const handler=createR2TicketRoute(r2);
  await contexts.A.route(matches,handler);
  try {
    const observed=await pages.A.evaluate(async payload=>{
      const item=Object.keys(localStorage).find(k=>k.endsWith('-auth-token'));
      const token=JSON.parse(localStorage.getItem(item)||'null')?.access_token;
      try {
        const r=await fetch('/api/forum/external-video-upload',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(payload)});
        return {status:r.status,transportFailed:false};
      }catch(e){return {status:null,transportFailed:true,clientFallbackRegexMatched:/Failed to fetch|NetworkError|Load failed/i.test(e.message)};}
    },payload);
    report.offlineTicketDiagnostic={browser:observed,ticket:r2.meta.ticket};
    const direct=await worker.fetch(origin+'/api/forum/external-video-upload',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+sessions.A.access_token},body:JSON.stringify(payload)});
    const data=await direct.json();
    const schema={uploadUrl:typeof data.upload_url==='string',mediaUrl:typeof data.media_url==='string',storagePath:typeof data.storage_path==='string',expiresAt:typeof data.expires_at==='string'};
    report.offlineTicketDiagnostic.directWorker={status:direct.status,schema};
    if(direct.status===200&&!r2.meta.ownedObjectReference){r2.register(data,payload);report.offlineTicketDiagnostic.directWorker.exactTargetValidation=true;}
    await h.check('OFFLINE_R2_TICKET_FLOW',async()=>{
      assert.equal(observed.status,200,'BROWSER_SIGNING_TICKET_NOT_READY');
      assert.equal(direct.status,200,'WORKER_SIGNING_TICKET_NOT_READY');
      assert.ok(Object.values(schema).every(Boolean),'SIGNING_TICKET_SCHEMA_MISMATCH');
      assert.equal(r2.meta.ticket.stage,'COMPLETE','TICKET_VALIDATION_NOT_COMPLETE');
      assert.equal(r2.meta.requestBudget.work+r2.meta.requestBudget.cleanup,0);
      return {...report.offlineTicketDiagnostic,r2Requests:0};
    },'realR2Offline');
  }finally{await contexts.A.unroute(matches,handler);}
}
