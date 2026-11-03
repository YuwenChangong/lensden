import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function runThumbnailRegression(h) {
  const {s,root,out,sql,dbCount,localFetch,readTable,browserApi,responseFor,goto,pages,newContext,circleSlug,sessions,origin,localFaults}=h;
  const followup=process.env.OGH_E2E_THUMBNAIL_FOLLOWUP;
  const selected=new Set(followup==='delete'
    ? ['THUMBNAIL_UPLOAD_AND_BOTH_VARIANTS','OWNER_MEDIA_DELETE_UI_OBJECTS_AND_ROWS','OWNER_MEDIA_DELETE_REPEAT_IDEMPOTENT']
    : ['THUMBNAIL_UPLOAD_AND_BOTH_VARIANTS','COMMENTS_LOADING_AND_READ_AFTER_MEDIA_UPLOAD','OWNER_MEDIA_DELETE_UI_OBJECTS_AND_ROWS','OWNER_MEDIA_DELETE_REPEAT_IDEMPOTENT','DELETED_MEDIA_AND_COMMENTS_FRESH_ACCESS_DENIED','AUTHENTICATED_PRIVATE_ROW_RLS_UNCHANGED']);
  const check=(id,fn,family)=>!followup||selected.has(id)?h.check(id,fn,family):undefined;
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const scalar=async query=>(await sql(s,query)).stdout.trim().split(/\r?\n/)[0];
  const need=value=>{if(!value)throw Object.assign(Error('DEPENDENT_MEDIA_FIXTURE_UNAVAILABLE'),{blocked:true});return value;};
  const objects=async media=>({
    original:+await scalar(`select count(*) from storage.objects where bucket_id='post-media' and name=${q(media.storage_path)};`),
    thumbnail:+await scalar(`select count(*) from storage.objects where bucket_id='post-media' and name=${q(media.thumbnail_url)};`),
    rows:await dbCount('post_media',`post_id=${q(media.post_id)}`),
  });
  async function upload(label) {
    const p=pages.A,title='Local thumbnail '+label+' '+s.runId;
    await goto(p,'/posts/new/?circle='+circleSlug);
    const form=p.locator('.post-composer__form');
    await form.locator('input:not([type=hidden]):not([type=file])').fill(title);
    await form.locator('textarea').fill('Disposable real local thumbnail regression');
    await p.locator('input[type=file]').setInputFiles({name:'local-thumbnail.png',mimeType:'image/png',buffer:await fs.readFile(path.join(root,'public/gaze-icon-192-v6.png'))});
    await p.locator('.media-preview-card').first().waitFor();
    const wait=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/post-media'&&r.request().method()==='POST',{timeout:20000});
    await form.locator('button[type=submit]').click();assert.equal((await wait).status(),201);
    const media=JSON.parse(await scalar(`select row_to_json(m)::text from (select pm.id,pm.post_id,pm.storage_path,pm.thumbnail_url from public.post_media pm join public.posts p on p.id=pm.post_id where p.author_id=${q(s.actors.A.id)} and p.title=${q(title)} limit 1) m;`));
    assert.ok(media.thumbnail_url&&media.thumbnail_url!==media.storage_path);
    await p.waitForURL(origin+'/posts/'+media.post_id+'/',{waitUntil:'domcontentloaded'});
    await p.evaluate(async id=>{for(const variant of ['display','thumb']){const img=new Image();img.src='/api/media/post/'+id+'?variant='+variant;await img.decode();if(!img.naturalWidth)throw Error('LOCAL_IMAGE_NOT_DECODED');}},media.id);
    assert.deepEqual(await objects(media),{original:1,thumbnail:1,rows:1});
    return media;
  }
  let normal,failed,admin,commentId;
  await check('THUMBNAIL_UPLOAD_AND_BOTH_VARIANTS',async()=>{normal=await upload('normal');return {realComposer:true,realStorageObjects:2,displayDecoded:true,thumbnailDecoded:true,realR2:false};},'media');
  await check('MEDIA_CROSS_USER_DELETE_DENIED',async()=>{
    const m=need(normal);
    assert.equal((await browserApi(pages.B,'/api/forum/posts?id='+m.post_id,'DELETE')).status,403);
    assert.equal((await browserApi(pages.B,'/api/admin/forum/media?id='+m.id,'DELETE')).status,403);
    const headers={apikey:s.status.ANON_KEY,Authorization:'Bearer '+sessions.B.access_token,'content-type':'application/json'};
    const storage=await localFetch('/storage/v1/object/post-media',{method:'DELETE',headers,body:JSON.stringify({prefixes:[m.storage_path,m.thumbnail_url]})});
    assert.ok([200,403].includes(storage.status));if(storage.status===200)assert.deepEqual(await storage.json(),[]);
    const row=await localFetch('/rest/v1/post_media?id=eq.'+m.id,{method:'DELETE',headers:{...headers,Prefer:'return=representation'}});
    assert.equal(row.status,200);assert.deepEqual(await row.json(),[]);
    assert.deepEqual(await objects(m),{original:1,thumbnail:1,rows:1});
    return {ownerApi403:true,adminApi403:true,ordinaryAuthenticatedStorageAndRowDenied:true,objectsAndRowsUnchanged:true};
  },'permissions');
  await check('MEDIA_LAYOUT_390_430',async()=>{
    const m=need(normal),p=pages.A;
    for(const width of [390,430]){await p.setViewportSize({width,height:932});await goto(p,'/posts/'+m.post_id+'/');
      await p.waitForFunction(()=>Array.from(document.querySelectorAll('main img')).some(i=>i.complete&&i.naturalWidth>0&&i.src.includes('/api/media/post/')));
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await p.screenshot({path:path.join(out,'thumbnail-'+width+'.png'),fullPage:true});}
    await p.setViewportSize({width:1440,height:1000});return {widths:[390,430],realImageDecoded:true,noHorizontalOverflow:true,completeAccessibilityNotClaimed:true};
  },'group1Continuation');
  await check('COMMENTS_LOADING_AND_READ_AFTER_MEDIA_UPLOAD',async()=>{
    const m=need(normal);commentId=await scalar(`insert into public.comments(post_id,author_id,body,status) values(${q(m.post_id)},${q(s.actors.A.id)},'Thumbnail regression comment','published') returning id;`);
    const c=await newContext(),p=await c.newPage();let release,arrived;
    const held=new Promise(r=>release=r),seen=new Promise(r=>arrived=r);
    await c.route('**/api/forum/comments?*',async route=>{arrived();await held;await route.continue().catch(()=>{});});
    try {await goto(p,'/posts/'+m.post_id+'/');await p.locator('#comments').scrollIntoViewIfNeeded();
      await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(Error('COMMENTS_REQUEST_NOT_OBSERVED')),10000))]);
      await p.locator('.comment-empty').filter({hasText:/Loading comments/}).waitFor();release();
      await p.locator('#comment-'+commentId).getByText('Thumbnail regression comment',{exact:true}).waitFor();
      const denied=await browserApi(pages.B,'/api/forum/comments?id='+commentId,'DELETE');assert.equal(denied.status,403);
      assert.equal(await dbCount('comments',`id=${q(commentId)} and status='published'`),1);
      return {realPendingRequestAndLoadingUi:true,realResponseRendered:true,otherAuthorDelete403:true};
    } finally {release();await c.close();}
  },'comments');
  await check('OWNER_MEDIA_DELETE_UI_OBJECTS_AND_ROWS',async()=>{
    const m=need(normal),p=pages.A;await goto(p,'/posts/'+m.post_id+'/');
    await p.getByRole('button',{name:'Delete post',exact:true}).click();
    // Capture the real local response before the UI's immediate Feed navigation.
    // No fabricated response, remote target, redirect or automatic retry.
    let resolve,reject;const wait=new Promise((yes,no)=>{resolve=yes;reject=no;});wait.catch(()=>{});
    const target=url=>url.origin===origin&&url.pathname==='/api/forum/posts';
    await p.route(target,async route=>{
      if(route.request().method()!=='DELETE')return route.fallback();
      try {const upstream=await route.fetch({maxRedirects:0,maxRetries:0,timeout:10000});
        const response={status:upstream.status(),body:await upstream.json()};
        await route.fulfill({response:upstream});resolve(response);
      } catch(e){reject(e);await route.abort().catch(()=>{});}
    });
    let response;
    try {await p.getByRole('alertdialog').getByRole('button',{name:/Confirm delet(?:e|ion)/}).click();response=await wait;}
    finally {await p.unroute(target);}
    const {status,body}=response,state=await objects(m);
    const evidence={httpStatus:status,cleanupOk:body.cleanup?.ok??null,objectResults:body.cleanup?.deletedObjects?.length??null,deletedRows:body.cleanup?.deletedRows??null,
      failedObjects:body.cleanup?.deletedObjects?.filter(o=>o.status==='failed').length??null,remainingOriginal:state.original,remainingThumbnail:state.thumbnail,remainingMediaRows:state.rows};
    try {assert.equal(status,200);assert.equal(body.cleanup.ok,true);
      assert.equal(body.cleanup.deletedObjects.length,2);assert.equal(body.cleanup.deletedRows,1);
      assert.deepEqual(state,{original:0,thumbnail:0,rows:0});
      await p.waitForURL(origin+'/feed/',{waitUntil:'domcontentloaded'});
      return {...evidence,realUiDelete:true};
    } catch(e){e.safeEvidence=evidence;throw e;}
  },'media');
  await check('OWNER_MEDIA_DELETE_REPEAT_IDEMPOTENT',async()=>{
    const m=need(normal),r=await browserApi(pages.A,'/api/forum/posts?id='+m.post_id,'DELETE');
    assert.equal(r.status,200);assert.equal(r.data.cleanup.ok,true);assert.equal(r.data.cleanup.deletedRows,0);
    assert.deepEqual(await objects(m),{original:0,thumbnail:0,rows:0});return {repeatHttp200:true,noAdditionalObjectsOrRows:true};
  },'media');
  await check('DELETED_MEDIA_AND_COMMENTS_FRESH_ACCESS_DENIED',async()=>{
    const m=need(normal),c=await newContext(),p=await c.newPage();try {
      assert.equal((await goto(p,'/posts/'+m.post_id+'/')).status(),404);
      for(const route of ['/api/media/post/'+m.id,'/api/media/post/'+m.id+'?variant=thumb','/api/forum/comments?post_id='+m.post_id]) {
        const status=await p.evaluate(async route=>(await fetch(route,{cache:'no-store'})).status,route);assert.equal(status,404);
      }
      return {freshContext:true,noCacheFetch:true,postMediaComments404:true,storageObjectRowsAbsent:true,externalCachePurgeNotClaimed:true};
    } finally {await c.close();}
  },'permissions');
  await check('THUMBNAIL_PARTIAL_FIXTURE_UPLOAD',async()=>{failed=await upload('partial');return {realUiUpload:true,bothObjectsExist:true};},'media');
  await check('ADMIN_SHARED_OBJECTS_RETAINED',async()=>{
    const m=need(failed),duplicate=await scalar(`insert into public.post_media(post_id,user_id,kind,storage_path,thumbnail_url) select post_id,user_id,kind,storage_path,thumbnail_url from public.post_media where id=${q(m.id)} returning id;`);
    const r=await browserApi(pages.ADMIN,'/api/admin/forum/media?id='+duplicate,'DELETE');assert.equal(r.status,200);assert.equal(r.data.cleanup.ok,true);
    assert.ok(r.data.cleanup.deletedObjects.every(o=>o.status==='retained_shared'));
    assert.deepEqual(await objects(m),{original:1,thumbnail:1,rows:1});return {realAdminDelete:true,otherReferenceRetained:true,bothObjectsPreserved:true};
  },'media');
  await check('THUMBNAIL_PARTIAL_FAILURE_TRUTHFUL',async()=>{
    const m=need(failed);localFaults.failThumbnailDelete=true;
    try {const r=await browserApi(pages.A,'/api/forum/posts?id='+m.post_id,'DELETE');
      assert.equal(r.status,200);assert.equal(r.data.ok,true);assert.equal(r.data.cleanup.ok,false);
      assert.ok(r.data.cleanup.errors.length>0);assert.equal(r.data.cleanup.deletedRows,0);
      assert.deepEqual(await objects(m),{original:0,thumbnail:1,rows:1});
      assert.equal(await dbCount('posts',`id=${q(m.post_id)} and status='deleted'`),1);
      return {injectedLocalStorage503:true,postDeleted:true,cleanupOk:false,failedThumbnailRetained:true,metadataPreservedForRetry:true};
    } finally {localFaults.failThumbnailDelete=false;}
  },'media');
  await check('THUMBNAIL_PARTIAL_FAILURE_EXPLICIT_RETRY',async()=>{
    const m=need(failed),r=await browserApi(pages.A,'/api/forum/posts?id='+m.post_id,'DELETE');
    if(!r.data.cleanup?.ok){const e=Error('PARTIAL_RETRY_NOT_COMPLETE');e.safeEvidence={httpStatus:r.status,failedObjects:r.data.cleanup?.deletedObjects?.filter(o=>o.status==='failed').length??null};throw e;}
    assert.equal(r.status,200);assert.ok(r.data.cleanup.deletedObjects.some(o=>o.status==='already_missing'));
    assert.deepEqual(await objects(m),{original:0,thumbnail:0,rows:0});
    return {explicitOwnerRetry:true,originalAlreadyMissing:true,thumbnailActuallyDeleted:true,mediaRowRemoved:true};
  },'media');
  await check('ADMIN_SINGLE_MEDIA_DELETE_ORIGINAL_AND_THUMBNAIL',async()=>{
    admin=await upload('admin');const r=await browserApi(pages.ADMIN,'/api/admin/forum/media?id='+admin.id,'DELETE');
    assert.equal(r.status,200);assert.equal(r.data.cleanup.ok,true);assert.equal(r.data.cleanup.deletedObjects.length,2);
    assert.deepEqual(await objects(admin),{original:0,thumbnail:0,rows:0});
    const postDelete=await browserApi(pages.ADMIN,'/api/admin/forum/posts?id='+admin.post_id,'DELETE');assert.equal(postDelete.status,200);assert.equal(postDelete.data.cleanup.ok,true);
    return {realAdminMediaDelete:true,bothObjectsAndRowAbsent:true,subsequentAdminPostDeleteIdempotent:true};
  },'media');
  await check('AUTHENTICATED_PRIVATE_ROW_RLS_UNCHANGED',async()=>{
    for(const actor of ['A','B']){const own=await readTable(actor,'legal_policy_acceptances','select=user_id&user_id=eq.'+s.actors[actor].id);
      const cross=await readTable(actor,'legal_policy_acceptances','select=user_id&user_id=eq.'+s.actors[actor==='A'?'B':'A'].id);
      assert.equal(own.status,200);assert.deepEqual(own.data.map(r=>r.user_id),[s.actors[actor].id]);assert.equal(cross.status,200);assert.deepEqual(cross.data,[]);}
    return {realAuthenticatedRls:true,ownRowsVisible:true,crossUserRowsHidden:true,serviceRoleUsed:false};
  },'permissions');
}
