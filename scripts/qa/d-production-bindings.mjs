import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const account='dcb374166b39234a499985145c075f50',bucket='openglasshub-media';
const origin='https://openglasshub.ogh.workers.dev';
const decode=raw=>{
  if(!Buffer.isBuffer(raw)||!raw.length||raw.length>65536)throw Error();
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
};

// Minimized trusted-checkpoint inputs, not permission or provider signatures.
// The execution host must bind their private capture/import provenance separately.
export function buildDProductionCreation({captureRaw,snapshotRaw,binding}) {
  try {
    const c=decode(captureRaw),s=decode(snapshotRaw),b=binding;
    if(!uuid(b?.actorId)||!uuid(b.postId)||!['executionBindingSha256','connectionBindingSha256',
      'actorCreationReceiptSha256','frozenArtifactSha256','observerSourceSha256','identityReceiptSha256'].every(k=>digest(b[k]))
      ||c.binding!==b.executionBindingSha256||c.actorId!==b.actorId||c.postId!==b.postId||!uuid(c.mediaId)
      ||c.status!=='OBSERVED_REQUIRES_SERVER_READBACK'||!Array.isArray(c.events)||c.events.length!==4)throw Error();
    const stages=[['POST','/api/forum/posts',201],['POST','/api/forum/external-video-upload',200],
      ['PUT','EXACT_S3_OBJECT',200],['POST','/api/forum/post-media',201]];
    if(!stages.every((r,i)=>r[0]===c.events[i].method&&r[1]===c.events[i].path&&r[2]===c.events[i].httpStatus
      &&c.events[i].outcome==='PROJECTED'))throw Error();
    const sourcePrefix=`tmp/${b.actorId}/${b.postId}/`,put=c.put,m=c.media;
    if(typeof c.sourceKey!=='string'||!c.sourceKey.startsWith(sourcePrefix)
      ||!/^[a-z0-9._-]{1,240}$/i.test(c.sourceKey.slice(sourcePrefix.length))
      ||put?.account!==account||put.bucket!==bucket||put.key!==c.sourceKey||put.status!==200||put.complete!==true
      ||put.sizeBytes!==2018||put.mimeType!=='video/mp4'||typeof put.etag!=='string'||!/^"[a-f0-9]{32}"$/i.test(put.etag)
      ||m?.id!==c.mediaId||m.post_id!==b.postId||m.kind!=='video'||m.storage_path!==c.retainedKey
      ||m.size_bytes!==2018||m.mime_type!=='video/mp4'||m.url!==null
      ||s.post?.id!==b.postId||s.post.author_id!==b.actorId||!Array.isArray(s.media)||s.media.length!==1)throw Error();
    const row=s.media[0],claim=s.claim;
    if(row.id!==c.mediaId||row.user_id!==b.actorId||row.post_id!==b.postId||row.storage_path!==c.retainedKey
      ||row.kind!=='video'||row.size_bytes!==2018||row.mime_type!=='video/mp4'||row.url!==null
      ||!uuid(claim?.claim_id)||claim.post_id!==b.postId||claim.user_id!==b.actorId||claim.mime_type!=='video/mp4'
      ||claim.retained_key!==c.retainedKey||c.retainedKey!==`${b.actorId}/${b.postId}/r2-retained-${claim.claim_id}.mp4`
      ||!Number.isFinite(Date.parse(c.observedUtc))||!Number.isFinite(Date.parse(s.observedUtc))
      ||Date.parse(s.observedUtc)<Date.parse(c.observedUtc))throw Error();
    const record={executionBindingSha256:b.executionBindingSha256,connectionBindingSha256:b.connectionBindingSha256,
      account,bucket,jurisdiction:'default',keys:[c.sourceKey,c.retainedKey],actorId:b.actorId,postId:b.postId,
      mediaId:c.mediaId,claimId:claim.claim_id,observedUtc:s.observedUtc,
      uploadReceiptSha256:hash(captureRaw),retentionReceiptSha256:hash(snapshotRaw),
      frozenArtifactSha256:b.frozenArtifactSha256,observerSourceSha256:b.observerSourceSha256,
      identityReceiptSha256:b.identityReceiptSha256,actorCreationReceiptSha256:b.actorCreationReceiptSha256,
      objectMetadata:[c.sourceKey,c.retainedKey].map(key=>({key,sizeBytes:2018,mimeType:'video/mp4',etag:put.etag}))};
    return {creationRaw:Buffer.from(JSON.stringify(record)),productionAuthority:false};
  }catch{throw Error('D_CREATION_CHAIN_UNPROVEN');}
}

// Passive extension of the already reviewed form observer. No provider call is
// initiated here, and signed upload URLs/request headers are never exported.
export function installDVideoCreationObserver(p) {
  if(window.top!==window||location.origin!=='https://openglasshub.ogh.workers.dev'||location.pathname!=='/posts/new/'
    ||location.search||location.hash||!uuid(p.actorId)||!digest(p.executionBindingSha256)
    ||!digest(p.verifiedContextReceiptSha256)||!Number.isFinite(Date.parse(p.deadlineUtc))||Date.now()>=Date.parse(p.deadlineUtc))
    throw Error('D_OBSERVER_ADMISSION_INVALID');
  const marker='__ogh_d_creation_'+p.executionBindingSha256;
  if(Object.hasOwn(window,marker))throw Error('D_OBSERVER_USED');Object.defineProperty(window,marker,{value:true});
  const original=window.fetch,state={binding:p.executionBindingSha256,actorId:p.actorId,status:'OBSERVING',
    postId:null,sourceKey:null,retainedKey:null,mediaId:null,events:[],requestsInitiated:0};
  let done=false,timer,activeReader,stopReject;const seen=new Set();
  const stopped=new Promise((_,reject)=>{stopReject=reject;});stopped.catch(()=>{});
  const finish=()=>{
    if(done)return;done=true;clearTimeout(timer);stopReject(Error('D_OBSERVER_STOPPED'));
    if(activeReader)void activeReader.cancel().catch(()=>{});
    if(window.fetch===wrapped)window.fetch=original;
    if(state.status==='OBSERVING')state.status='INCOMPLETE_UNKNOWN';state.observedUtc=new Date().toISOString();
    const u=URL.createObjectURL(new Blob([JSON.stringify(state)],{type:'application/json'}));
    const a=document.createElement('a');a.href=u;a.download='ogh-d-creation-'+p.executionBindingSha256.slice(0,16)+'.json';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
  };
  const boundedJson=async response=>{
    const reader=response.clone().body?.getReader();if(!reader)throw Error();activeReader=reader;let total=0;const chunks=[];
    try{while(true){const x=await Promise.race([reader.read(),stopped]);if(x.done)break;total+=x.value.length;if(total>65536)throw Error();chunks.push(x.value);}}
    finally{activeReader=null;void reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(total);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  };
  async function wrapped(input,init) {
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
    const method=String(init?.method??input?.method??'GET').toUpperCase();
    const routes=['/api/forum/posts','/api/forum/external-video-upload','/api/forum/post-media'];
    const put=method==='PUT'&&state.sourceKey!==null;
    const site=method==='POST'&&url.origin===location.origin&&routes.includes(url.pathname);
    if(!put&&!site)return original.apply(this,arguments);
    const label=put?'EXACT_S3_OBJECT':url.pathname,id=method+' '+label;
    if(done||state.status!=='OBSERVING'||Date.now()>=Date.parse(p.deadlineUtc)||seen.has(id))throw Error('D_OBSERVER_STOPPED');
    seen.add(id);const event={method,path:label,httpStatus:null,outcome:'UNKNOWN'};state.events.push(event);
    try {
      let body;
      if(put) {
        const exactTarget=(url.hostname==='dcb374166b39234a499985145c075f50.r2.cloudflarestorage.com'
          &&url.pathname===`/openglasshub-media/${state.sourceKey}`)
          ||(url.hostname==='openglasshub-media.dcb374166b39234a499985145c075f50.r2.cloudflarestorage.com'
          &&url.pathname===`/${state.sourceKey}`);
        if(url.protocol!=='https:'||!exactTarget
          ||url.username||url.password||url.port||url.hash||init?.body?.size!==2018||init.body.type!=='video/mp4')throw Error();
      } else {
        if(typeof init?.body!=='string'||init.body.length>65536)throw Error();body=JSON.parse(init.body);
        if(url.pathname===routes[0]) {
          if(body.title!==p.title||body.body!==p.body||body.circle_slug!==p.circleSlug||body.type!=='feedback'||body.has_media!==true)throw Error();
        }else if(!state.postId||body.post_id!==state.postId)throw Error();
        if(url.pathname===routes[2]&&(!Array.isArray(body.media)||body.media.length!==1||body.media[0].storage_path!==state.sourceKey))throw Error();
      }
      const response=await Promise.race([original.apply(this,arguments),stopped]);event.httpStatus=response.status;
      if(done||response.redirected||!response.ok)throw Error();
      if(put) {
        const etag=response.headers.get('etag');if(response.status!==200||!/^"[a-f0-9]{32}"$/i.test(etag??''))throw Error();
        state.put={account:'dcb374166b39234a499985145c075f50',bucket:'openglasshub-media',key:state.sourceKey,
          status:200,sizeBytes:2018,mimeType:'video/mp4',etag,complete:true};
      }else {
        const r=await boundedJson(response);if(done)throw Error();
        if(url.pathname===routes[0]){if(response.status!==201||!uuid(r.post?.id))throw Error();state.postId=r.post.id;}
        else if(url.pathname===routes[1]) {
          const prefix=`tmp/${p.actorId}/${state.postId}/`;
          if(response.status!==200||typeof r.storage_path!=='string'||!r.storage_path.startsWith(prefix)
            ||!/^[a-z0-9._-]{1,240}$/i.test(r.storage_path.slice(prefix.length)))throw Error();state.sourceKey=r.storage_path;
        }else {
          if(response.status!==201||!state.put||!Array.isArray(r.media)||r.media.length!==1)throw Error();
          const m=r.media[0];if(!uuid(m.id)||m.post_id!==state.postId||m.url!==null||m.kind!=='video'
            ||m.size_bytes!==2018||m.mime_type!=='video/mp4'||typeof m.storage_path!=='string'
            ||!new RegExp(`^${p.actorId}/${state.postId}/r2-retained-[a-f0-9-]+\\.mp4$`).test(m.storage_path))throw Error();
          state.media=Object.fromEntries(['id','post_id','storage_path','kind','size_bytes','mime_type','url'].map(k=>[k,m[k]]));
          state.mediaId=m.id;state.retainedKey=m.storage_path;state.status='OBSERVED_REQUIRES_SERVER_READBACK';
        }
      }
      event.outcome='PROJECTED';return response;
    }catch{event.outcome='REQUEST_OR_PROJECTION_UNKNOWN';state.status='STOPPED_UNKNOWN';
      throw Error('D_OBSERVER_FAILED_NO_RETRY');}
    finally{if(state.status!=='OBSERVING')finish();}
  }
  window.fetch=wrapped;timer=setTimeout(finish,Math.min(480000,Date.parse(p.deadlineUtc)-Date.now()));
  return {status:'LOCAL_OBSERVER_INSTALLED_NOT_IDENTITY_OR_UPLOAD_PROOF',finish,requestsInitiated:0};
}

// Executed only in the already-approved ordinary Edge checkpoint method.
// The frozen same-page Supabase singleton is passed locally, never serialized.
export async function runDProductionCheckpoint(p,client) {
  const unknown=()=>({state:'UNKNOWN',phase:p?.phase,productionAuthority:false});
  let timer;
  try {
    if(window.top!==window||location.origin!=='https://openglasshub.ogh.workers.dev'||location.search||location.hash
      ||client?.supabaseUrl!=='https://xcbnxzjlsvtgzixurcof.supabase.co'
      ||!['OWNER_DELETE','CREATION_SNAPSHOT','POST_READBACK','ACTOR_LOGOUT'].includes(p.phase)
      ||!uuid(p.actorId)||!uuid(p.postId)||!uuid(p.mediaId)||!digest(p.executionBindingSha256)
      ||!digest(p.verifiedContextReceiptSha256)||!Number.isFinite(Date.parse(p.deadlineUtc))||Date.now()>=Date.parse(p.deadlineUtc)
      ||typeof p.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(p.requestId))throw Error();
    const marker='__ogh_d_checkpoint_'+p.executionBindingSha256+'_'+p.requestId;
    if(Object.hasOwn(window,marker))throw Error();Object.defineProperty(window,marker,{value:true});
    const isOwner=p.phase!=='POST_READBACK';
    if(!isOwner&&!['/admin/security/','/admin/reports/'].includes(location.pathname))throw Error();
    const abort=new AbortController(),guard=()=>{if(abort.signal.aborted||Date.now()>=Date.parse(p.deadlineUtc))throw Error();};
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error());},
      Math.min(10000,Date.parse(p.deadlineUtc)-Date.now()));});
    const readJson=async response=>{
      const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
      try{while(true){const r=await reader.read();guard();if(r.done)break;size+=r.value.length;if(size>65536)throw Error();chunks.push(r.value);}}
      finally{void reader.cancel().catch(()=>{});}
      const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
    };
    const result=await Promise.race([(async()=>{
      // Read only this frozen client's local session; never invoke getSession's
      // implicit refresh or the PostgREST builder's native retry/fetchWithAuth.
      const storageKey='sb-xcbnxzjlsvtgzixurcof-auth-token';
      const stored=await client.auth.storage.getItem(storageKey);guard();
      if(typeof stored!=='string'||stored.length>65536)throw Error();const session=JSON.parse(stored);
      if(typeof session?.access_token!=='string'||!session.access_token.length||session.user?.id!==(isOwner?p.actorId:p.moderatorId)
        ||typeof session.expires_at!=='number'||!Number.isFinite(session.expires_at)
        ||session.expires_at*1000<=Date.now()+300000||typeof client.supabaseKey!=='string'||!client.supabaseKey.length)throw Error();
      const headers={authorization:'Bearer '+session.access_token,apikey:client.supabaseKey};
      const query=async(table,select,filters)=>{
        guard();const url=new URL('https://xcbnxzjlsvtgzixurcof.supabase.co/rest/v1/'+table);
        url.searchParams.set('select',select);for(const [k,v] of Object.entries(filters))url.searchParams.set(k,'eq.'+v);
        const response=await fetch(url.href,{method:'GET',redirect:'error',cache:'no-store',signal:abort.signal,headers});guard();
        if(response.status!==200||response.redirected)throw Error();const rows=await readJson(response);guard();
        if(!Array.isArray(rows))throw Error();return rows;
      };
      const startedUtc=new Date().toISOString();
      if(p.phase==='ACTOR_LOGOUT') {
        guard();const response=await fetch('https://xcbnxzjlsvtgzixurcof.supabase.co/auth/v1/logout?scope=global',
          {method:'POST',redirect:'error',cache:'no-store',signal:abort.signal,headers});guard();
        if(response.status!==204||response.redirected)throw Error();
        // Stop local renewal only after the one acknowledged global logout.
        await client.auth.stopAutoRefresh();guard();await client.auth.storage.removeItem(storageKey);guard();
        return {actorId:p.actorId,signedOut:true,scope:'global',requestId:p.requestId,
          binding:p.executionBindingSha256,completedUtc:new Date().toISOString()};
      }
      if(p.phase==='OWNER_DELETE') {
        guard();
        const response=await fetch('/api/forum/posts?id='+p.postId,{method:'DELETE',redirect:'error',cache:'no-store',
          signal:abort.signal,headers:{authorization:headers.authorization}});guard();
        const body=await readJson(response);guard();
        if(response.status!==200||response.redirected||body.ok!==true||body.status!=='deleted'
          ||body.post?.id!==p.postId||body.post.status!=='deleted'||body.cleanup?.ok!==true
          ||!Array.isArray(body.cleanup.errors)||body.cleanup.errors.length||body.cleanup.deletedRows!==1)throw Error();
        const objects=body.cleanup.deletedObjects??[];
        if(!Array.isArray(objects)||objects.length!==1||objects.some(o=>o.storage!=='r2'||o.path!==p.retainedKey||o.mediaId!==p.mediaId
          ||o.status!=='deleted'||![200,204].includes(o.httpStatus)))throw Error();
        return {postId:p.postId,postState:'deleted',acknowledged:true,actorId:p.actorId,
          applicationDeletedKeys:objects.map(o=>o.path),requestId:p.requestId,startedUtc,
          completedUtc:new Date().toISOString(),cleanupOk:true};
      }
      const posts=await query('posts','id,author_id,status,moderation_status',{id:p.postId});guard();
      if(posts.length!==1||posts[0].id!==p.postId||posts[0].author_id!==p.actorId)throw Error();const post=posts[0];
      const media=await query('post_media','id,post_id,user_id,kind,storage_path,url,size_bytes,mime_type',{post_id:p.postId});guard();
      if(p.phase==='CREATION_SNAPSHOT') {
        const claims=await query('post_media_r2_copy_claims','post_id,user_id,claim_id,retained_key,mime_type',
          {post_id:p.postId,user_id:p.actorId});guard();if(claims.length!==1)throw Error();
        return {post,media,claim:claims[0],observedUtc:new Date().toISOString(),requestId:p.requestId};
      }
      if(post.status!=='deleted'||media.length!==0)throw Error();
      return {postId:p.postId,independent:true,postState:'deleted',mediaRows:0,requestId:p.requestId,
        requiresSeparateAnonymousDenial:true,observedUtc:new Date().toISOString()};
    })(),timeout]);
    if(Date.now()>=Date.parse(p.deadlineUtc))throw Error();return {...result,productionAuthority:false};
  }catch{return unknown();}finally{clearTimeout(timer);}
}

export function buildDObjectDeleteCode(b) {
  if(!digest(b?.executionBindingSha256)||!digest(b.connectionBindingSha256)||!digest(b.creationReceiptSha256)
    ||!uuid(b.actorId)||!uuid(b.postId)||!Array.isArray(b.keys)||!b.keys.length||b.keys.length>2
    ||new Set(b.keys).size!==b.keys.length||!b.keys.every(k=>typeof k==='string'&&k.startsWith(`tmp/${b.actorId}/${b.postId}/`)
      &&/^[a-zA-Z0-9._/-]{1,1024}$/.test(k)&&k.split('/').length===4&&k.split('/').every(p=>p&&p!=='.'&&p!=='..'))
    ||typeof b.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(b.requestId))throw Error('D_DELETE_BINDING_INVALID');
  b=Object.fromEntries(['executionBindingSha256','connectionBindingSha256','actorId','postId','keys','createdKeys',
    'creationReceiptSha256','requestId'].filter(k=>b[k]!==undefined).map(k=>[k,b[k]]));
  return `async () => {
    const b=${JSON.stringify(b)},account="${account}",bucket="${bucket}";
    if(accountId!==account)return {state:"UNKNOWN",productionAuthority:false};
    const startedUtc=new Date().toISOString();let timer;
    try {
      const response=await Promise.race([cloudflare.request({method:"DELETE",path:"/accounts/"+account+"/r2/buckets/"+bucket+"/objects",body:b.keys}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),10000);})]);
      const rawDecodedResponse=JSON.stringify(response),bytes=new TextEncoder().encode(rawDecodedResponse);
      if(bytes.length>65536||rawDecodedResponse.includes("--- TRUNCATED ---"))throw Error();
      const h=await crypto.subtle.digest("SHA-256",bytes);
      return {rawDecodedResponse,evidence:{executionBindingSha256:b.executionBindingSha256,connectionBindingSha256:b.connectionBindingSha256,
        account,bucket,jurisdiction:"default",method:"DELETE",requestId:b.requestId,keys:b.keys,createdKeys:b.createdKeys??b.keys,
        creationReceiptSha256:b.creationReceiptSha256,responseSha256:Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,"0")).join(""),
        status:response.status,complete:true,startedUtc,completedUtc:new Date().toISOString()},productionAuthority:false};
    }catch{return {state:"UNKNOWN",providerCancellationProven:false,productionAuthority:false};}finally{clearTimeout(timer);}
  }`;
}

export function buildDCheckpointCode(p) {
  if(!p||Object.keys(p).some(k=>!['executionBindingSha256','actorId','postId','mediaId','moderatorId','retainedKey',
    'phase','requestId','deadlineUtc','verifiedContextReceiptSha256'].includes(k)))throw Error('D_CHECKPOINT_BINDING_INVALID');
  p={...p,deadlineUtc:new Date(Math.min(Date.parse(p.deadlineUtc),Date.now()+120000)).toISOString()};
  return `async () => {
    if(window.top!==window||location.origin!=="${origin}"||location.search||location.hash)throw Error("D_CONTEXT_INVALID");
    const p=${JSON.stringify(p)};
    if(Date.now()>=Date.parse(p.deadlineUtc))throw Error("D_CHECKPOINT_EXPIRED");
    const uuid=${uuid.toString()},digest=${digest.toString()};
    const client=(await import("/_astro/supabase-browser.CbJzQpCJ.js")).n();
    if(Date.now()>=Date.parse(p.deadlineUtc))throw Error("D_CHECKPOINT_EXPIRED");
    const result=await (${runDProductionCheckpoint.toString()})(p,client);
    const out={...result,binding:${JSON.stringify(p.executionBindingSha256)},requestId:${JSON.stringify(p.requestId)}};
    const u=URL.createObjectURL(new Blob([JSON.stringify(out)],{type:"application/json"}));
    const a=document.createElement("a");a.href=u;a.download=${JSON.stringify('ogh-'+p.requestId+'.json')};
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);return out;
  }`;
}

export function buildDObserverCode(p) {
  if(!p||Object.keys(p).some(k=>!['executionBindingSha256','actorId','verifiedContextReceiptSha256','deadlineUtc',
    'title','body','circleSlug'].includes(k)))throw Error('D_OBSERVER_BINDING_INVALID');
  return `() => {const uuid=${uuid.toString()},digest=${digest.toString()};
    return (${installDVideoCreationObserver.toString()})(${JSON.stringify(p)});}`;
}

// Existing private Auth admin access only; never acquire/export a credential here.
// Raw provider user JSON is transiently inspected, not persisted or returned.
export async function containDProductionActor({binding,actorCreationRaw,adminKey,logoutEvidence,beforeDispatch}) {
  const b=structuredClone(binding),out={actorId:binding?.actorId,actorCreationReceiptSha256:binding?.actorCreationReceiptSha256,
    signedOut:false,banned:false,independentReadback:false,phase:'ADMISSION',productionAuthority:false};
  let calls=0;
  try {
    const created=decode(actorCreationRaw);
    if(hash(actorCreationRaw)!==b.actorCreationReceiptSha256||created.actorId!==b.actorId||created.createdByThisRun!==true
      ||created.executionBindingSha256!==b.executionBindingSha256||created.createdUtc!==b.createdAt||!digest(created.providerReceiptSha256)
      ||!uuid(b.actorId)||!digest(b.executionBindingSha256)||!digest(b.actorCreationReceiptSha256)
      ||typeof b.actorEmail!=='string'||!/^[^\s@]+@[^\s@]+$/.test(b.actorEmail)
      ||typeof b.namespace!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(b.namespace)
      ||!Number.isFinite(Date.parse(b.createdAt))||!Number.isFinite(Date.parse(b.deadlineUtc))
      ||typeof adminKey!=='string'||!adminKey.length||typeof beforeDispatch!=='function')throw Error();
    const bounded=async operation=>{
      let timer;
      try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),
        Math.max(1,Math.min(10000,Date.parse(b.deadlineUtc)-Date.now())));})]);}
      finally{clearTimeout(timer);}
    };
    const gate=async stage=>{
      out.phase=stage;
      if(Date.now()>=Date.parse(b.deadlineUtc)||await bounded(()=>beforeDispatch(stage))!==true||Date.now()>=Date.parse(b.deadlineUtc))throw Error();
    };
    // Browser logout is a separate checkpoint; no ordinary JWT crosses to Node.
    out.signedOut=logoutEvidence?.actorId===b.actorId&&logoutEvidence.binding===b.executionBindingSha256
      &&logoutEvidence.scope==='global'&&logoutEvidence.signedOut===true
      &&typeof logoutEvidence.requestId==='string'&&Number.isFinite(Date.parse(logoutEvidence.completedUtc))
      &&Date.parse(logoutEvidence.completedUtc)>=Date.parse(b.createdAt)&&Date.parse(logoutEvidence.completedUtc)<=Date.now();
    if(!out.signedOut)out.logout='UNKNOWN';
    const call=async(method,phase)=>{
      await gate(phase);if(++calls>3)throw Error();
      const response=await fetch(`https://xcbnxzjlsvtgzixurcof.supabase.co/auth/v1/admin/users/${b.actorId}`,{
        method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,Date.parse(b.deadlineUtc)-Date.now()))),
        headers:{authorization:'Bearer '+adminKey,apikey:adminKey,'content-type':'application/json'},
        ...(method==='PUT'?{body:JSON.stringify({ban_duration:'876000h'})}:{})});
      if(response.status!==200||response.redirected)throw Error();
      const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>131072)throw Error();chunks.push(chunk);}
      const u=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      if(u.id!==b.actorId||u.email!==b.actorEmail||u.created_at!==b.createdAt||u.role!=='authenticated'
        ||u.user_metadata?.qa_namespace!==b.namespace||Date.now()>=Date.parse(b.deadlineUtc))throw Error();
      return u;
    };
    await call('GET','ACTOR_PREBAN');await call('PUT','ACTOR_BAN');const read=await call('GET','ACTOR_READBACK');
    out.banned=Date.parse(read.banned_until)>=Date.now()+876000*3600000-120000;out.independentReadback=out.banned;
  }catch{out.phase='STOPPED_'+out.phase;}
  finally{adminKey=null;}
  return out;
}

// Connect the existing manual Edge checkpoints and MCP dispatcher, not a new
// controller. Transport readiness/import provenance remain execution-host gates.
export function createDProductionCleanupCallbacks({binding,creationRaw,actorCreationRaw,adminKey,
  ownerCheckpoint,moderatorCheckpoint,mcpExecute,anonymousReadback,beforeDispatch,logoutTimeoutMs=10000}) {
  const b=structuredClone(binding),raw=Buffer.from(creationRaw),created=decode(raw),actorRaw=Buffer.from(actorCreationRaw);
  if(created.actorId!==b.actorId||created.postId!==b.postId||!uuid(created.mediaId)||!uuid(b.moderatorId)
    ||hash(actorRaw)!==b.actorCreationReceiptSha256||!digest(b.ownerContextReceiptSha256)
    ||!digest(b.moderatorContextReceiptSha256)||typeof beforeDispatch!=='function'
    ||!Number.isInteger(logoutTimeoutMs)||logoutTimeoutMs<1||logoutTimeoutMs>30000
    ||![ownerCheckpoint,moderatorCheckpoint,mcpExecute,anonymousReadback].every(f=>typeof f==='function'))
    throw Error('D_CALLBACK_BINDING_INVALID');
  const retained=created.keys.find(k=>!k.startsWith('tmp/'));const used=new Set();
  const guard=signal=>{if(signal?.aborted||Date.now()>=Date.parse(b.deadlineUtc))throw Error('D_CALLBACK_STOPPED');};
  const invoke=async(phase,carrier,signal,checkpointDeadlineUtc=b.deadlineUtc)=>{
    guard(signal);
    if(used.has(phase))throw Error('D_CALLBACK_ALREADY_USED');used.add(phase);
    const requestId='d-'+phase.toLowerCase().replaceAll('_','-')+'-'+b.executionBindingSha256.slice(0,12);
    const p={executionBindingSha256:b.executionBindingSha256,actorId:b.actorId,postId:b.postId,mediaId:created.mediaId,
      moderatorId:b.moderatorId,retainedKey:retained,phase,requestId,
      deadlineUtc:new Date(Math.min(Date.parse(b.deadlineUtc),Date.parse(checkpointDeadlineUtc),
        Date.now()+(phase==='ACTOR_LOGOUT'?logoutTimeoutMs:120000))).toISOString(),
      verifiedContextReceiptSha256:phase==='POST_READBACK'?b.moderatorContextReceiptSha256:b.ownerContextReceiptSha256};
    const result=await carrier(buildDCheckpointCode(p),Object.freeze(p),signal);guard(signal);
    if(result?.binding!==b.executionBindingSha256||result.requestId!==requestId||result.state==='UNKNOWN')throw Error('D_CHECKPOINT_UNPROVEN');
    return result;
  };
  return Object.freeze({beforeDispatch,
    ownerDelete:async(postId,signal,deadline)=>{if(postId!==b.postId)throw Error('D_CALLBACK_TARGET_INVALID');return invoke('OWNER_DELETE',ownerCheckpoint,signal,deadline);},
    readPost:async(postId,signal,deadline)=>{
      if(postId!==b.postId)throw Error('D_CALLBACK_TARGET_INVALID');const post=await invoke('POST_READBACK',moderatorCheckpoint,signal,deadline);guard(signal);
      if(post.postId!==b.postId||post.mediaRows!==0||post.postState!=='deleted')throw Error('D_POST_READBACK_UNPROVEN');
      if(await beforeDispatch('ANONYMOUS_AFTER_DELETE')!==true)throw Error('D_CALLBACK_NOT_ADMITTED');guard(signal);
      const denial=await anonymousReadback(Object.freeze({mediaId:created.mediaId,stage:'after-hide',deadlineUtc:b.deadlineUtc}));
      guard(signal);
      if(denial?.status!=='PASS_DENIED'||denial.httpStatus!==404)throw Error('D_ANONYMOUS_DENIAL_UNPROVEN');
      return {...post,anonymousStatus:404};
    },
    deleteExactObjects:async(keys,signal)=>{
      guard(signal);
      if(keys.length!==1||keys[0]!==created.keys.find(k=>k.startsWith('tmp/'))||used.has('EXACT_OBJECT_DELETE'))throw Error('D_CALLBACK_TARGET_INVALID');
      used.add('EXACT_OBJECT_DELETE');const requestId='d-source-delete-'+b.executionBindingSha256.slice(0,12);
      const code=buildDObjectDeleteCode({...b,keys,createdKeys:created.keys,creationReceiptSha256:hash(raw),requestId});
      const result=await mcpExecute(code,{account_id:account},signal);guard(signal);
      if(result?.evidence?.requestId!==requestId||result.evidence.creationReceiptSha256!==hash(raw)
        ||result.evidence.executionBindingSha256!==b.executionBindingSha256)throw Error('D_DELETE_READBACK_UNPROVEN');
      return result;
    },
    finishActor:async(actorId,signal,deadline=b.deadlineUtc)=>{
      if(actorId!==b.actorId)throw Error('D_CALLBACK_TARGET_INVALID');let logoutEvidence;
      // A failed ordinary checkpoint does not authorize another login or retry.
      let timer;const logoutAbort=new AbortController(),logoutDeadline=new Date(Math.min(Date.parse(b.deadlineUtc),
        Date.parse(deadline),Date.now()+logoutTimeoutMs)).toISOString();
      try{logoutEvidence=await Promise.race([(async()=>{
        guard(signal);if(await beforeDispatch('ACTOR_GLOBAL_LOGOUT')!==true)throw Error();guard(signal);guard(logoutAbort.signal);
        if(Date.now()>=Date.parse(logoutDeadline))throw Error();
        return invoke('ACTOR_LOGOUT',ownerCheckpoint,logoutAbort.signal,logoutDeadline);
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>{logoutAbort.abort();reject(Error());},logoutTimeoutMs);})]);}
      catch{}finally{clearTimeout(timer);logoutAbort.abort();}
      guard(signal);
      return containDProductionActor({binding:b,actorCreationRaw:actorRaw,adminKey,logoutEvidence,
        beforeDispatch:async phase=>{guard(signal);const admitted=await beforeDispatch(phase);guard(signal);return admitted;}});
    }});
}
