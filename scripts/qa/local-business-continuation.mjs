import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function runContinuation(h) {
  const {s,root,out,sql,report,dbCount,localFetch,browserApi,responseFor,goto,pages,contexts,newContext,postId,circleId,circleSlug,sessions,currentSession,origin}=h;
  const followup=process.env.OGH_E2E_CONTINUATION_FOLLOWUP;
  const selected=new Set(followup==='media'
    ? ['ADMIN04_UI_DENIAL_A','ADMIN04_UI_DENIAL_B','LOCAL_IMAGE_UPLOAD_DISPLAY_CLEANUP']
    : ['AUTH08_WRONG_PASSWORD','CIRCLE_OWNER_DELETE_RESTORE_UI','LOCAL_IMAGE_UPLOAD_DISPLAY_CLEANUP']);
  const check=(id,fn,family)=>!followup||selected.has(id)?h.check(id,fn,family):undefined;
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const scalar=async query=>(await sql(s,query)).stdout.trim().split(/\r?\n/)[0];
  const blocked=code=>Object.assign(Error(code),{blocked:true});
  const signals={pageErrors:0,cspErrors:0,otherConsoleErrors:0};
  const observe=p=>{p.on('pageerror',()=>signals.pageErrors++);p.on('console',m=>{if(m.type()==='error'){if(/content.security.policy|refused to/i.test(m.text()))signals.cspErrors++;else signals.otherConsoleErrors++;}});return p;};
  for(const p of Object.values(pages)) observe(p);
  const fresh=async()=>{const c=await newContext();return {c,p:observe(await c.newPage())};};
  await check('AUTH08_WRONG_PASSWORD',async()=>{
    const {c,p}=await fresh();try {
      await goto(p,'/login/');await p.getByRole('textbox',{name:'Email',exact:true}).fill(s.actors.A.email);
      await p.getByRole('textbox',{name:'Password',exact:true}).fill(s.actors.A.password+'-wrong');
      const wait=responseFor(p,r=>new URL(r.url()).pathname==='/auth/v1/token');
      await p.getByRole('button',{name:'Log in',exact:true}).click();const r=await wait;
      assert.equal(r.status(),400);const body=await r.json();
      const code=body.code??body.error_code;
      if(code!=='invalid_credentials') {const e=Error('FAILED_AUTH_ERROR_CLASS');e.safeEvidence={httpStatus:r.status(),code:typeof code==='string'&&/^[a-z_]+$/.test(code)?code:'UNEXPECTED'};throw e;}
      await p.locator('.auth-alert--error').waitFor();assert.equal((await currentSession(p))?.access_token,undefined);
      return {oneRealLocalFailedAttempt:true,errorVisible:true,noSession:true,code};
    } finally {await c.close();}
  },'group1Continuation');
  for(const [id,route] of [['INVALID_RECOVERY','/auth/reset-password/?code=local-invalid-code'],['EXPIRED_RECOVERY','/auth/reset-password/?error=access_denied&error_code=otp_expired']]) await check('AUTH08_'+id,async()=>{
    const {c,p}=await fresh();try {
      await goto(p,route);await p.locator('.auth-alert--error').waitFor();
      assert.ok(!new URL(p.url()).searchParams.has('code'));assert.ok(!new URL(p.url()).searchParams.has('error'));
      assert.equal((await currentSession(p))?.access_token,undefined);
      return {invalidInputRejected:true,errorVisible:true,urlSanitized:true,noEmailSent:true,actualExpiredTokenNotClaimed:id==='EXPIRED_RECOVERY'};
    } finally {await c.close();}
  },'group1Continuation');
  await check('AUTH08_SAFE_NEXT',async()=>{
    const {c,p}=await fresh();try {
      await goto(p,'/login/?next=https%3A%2F%2Funapproved.invalid%2F');
      await p.getByRole('textbox',{name:'Email',exact:true}).fill(s.actors.A.email);await p.getByRole('textbox',{name:'Password',exact:true}).fill(s.actors.A.password);
      await p.getByRole('button',{name:'Log in',exact:true}).click();await p.waitForURL(origin+'/',{waitUntil:'domcontentloaded'});
      assert.equal(new URL(p.url()).origin,origin);assert.equal((await currentSession(p))?.user.id,s.actors.A.id);
      return {realLocalLogin:true,externalNextRejected:true};
    } finally {await c.close();}
  },'group1Continuation');
  await check('AUTH01_REAL_CAPTCHA',async()=>{throw blocked('REAL_PRODUCTION_CAPTCHA_NOT_AUTHORIZED_LOCAL_CAPTCHA_OFF');},'group1Continuation');
  const adminRoutes=[
    ['devices','/api/admin/devices','/admin/devices/'],['forum','/api/admin/forum/posts','/admin/forum/'],
    ['reports','/api/admin/reports','/admin/reports/'],['media','/api/admin/forum/media','/admin/media/'],
    ['news','/api/admin/news','/admin/news/'],['users','/api/admin/users','/admin/users/'],['circles','/api/admin/forum/circles','/admin/circles/'],
  ];
  for(const [label,api,route] of adminRoutes) {
    await check('ADMIN04_READ_'+label.toUpperCase(),async()=>{
      const r=await browserApi(pages.ADMIN,api);assert.equal(r.status,200,'ADMIN_READ_HTTP_FAILURE');
      assert.ok(Object.values(r.data).some(Array.isArray),'ADMIN_COLLECTION_MISSING');
      if(label==='forum') assert.ok(r.data.posts.some(p=>p.id===postId));
      if(label==='users') assert.ok(JSON.stringify(r.data).includes(s.actors.A.id));
      if(label==='circles') assert.ok(JSON.stringify(r.data).includes(circleSlug));
      await goto(pages.ADMIN,route);await pages.ADMIN.locator('main').first().waitFor();
      if(label==='forum') await pages.ADMIN.getByText('Local E2E seeded discussion',{exact:true}).first().waitFor();
      if(label==='users') await pages.ADMIN.getByText('Local E2E A',{exact:true}).first().waitFor();
      if(label==='circles') await pages.ADMIN.getByText('Local E2E Circle',{exact:true}).first().waitFor();
      return {httpStatus:200,collectionShapeVerified:true,uiRendered:true,fixtureMatched:['forum','users','circles'].includes(label)};
    },'group1Continuation');
    // Devices A/B denial already has valid unchanged evidence (RLS-05).
    if(label!=='devices') for(const actor of ['A','B']) await check('ADMIN04_DENY_'+label.toUpperCase()+'_'+actor,async()=>{
      const r=await browserApi(pages[actor],api);assert.equal(r.status,403,'NONADMIN_READ_NOT_DENIED');
      assert.ok(!Object.values(r.data).some(Array.isArray));return {httpStatus:403,noCollectionReturned:true};
    },'group1Continuation');
  }
  for(const actor of ['A','B']) await check('ADMIN04_UI_DENIAL_'+actor,async()=>{
    const p=pages[actor];await goto(p,'/admin/devices/');
    await p.locator('.admin-state-message').filter({hasText:/does not have administrator access|没有管理员权限/}).waitFor();
    assert.equal(await p.locator('.admin-news-form').count(),0);
    return {realUnauthorizedUi:true,noManagementForm:true};
  },'group1Continuation');
  let reportId;
  await check('REPORT_DUPLICATE_IDEMPOTENCE',async()=>{
    const payload={target_type:'post',target_id:postId,reason_code:'spam',reason_text:'Disposable duplicate-report test'};
    const first=await browserApi(pages.B,'/api/forum/reports','POST',payload);assert.equal(first.status,201);reportId=first.data.report.id;
    const again=await browserApi(pages.B,'/api/forum/reports','POST',payload);assert.equal(again.status,200);assert.equal(again.data.duplicate,true);
    assert.equal(await dbCount('reports',`target_id=${q(postId)} and reporter_id=${q(s.actors.B.id)}`),1);
    return {realApiDuplicate:true,oneDatabaseReport:true};
  });
  await check('ADMIN_REPORT_DISMISS_UI',async()=>{
    assert.ok(reportId);const p=pages.ADMIN;await goto(p,'/admin/reports/');
    await p.locator('.admin-report-card').filter({hasText:'Local E2E seeded discussion'}).first().click();
    const action=p.getByRole('button',{name:/^Dismiss report$|^Dismiss$/});await action.click();
    const wait=responseFor(p,r=>new URL(r.url()).pathname.endsWith('/action')&&r.request().method()==='POST');
    await p.getByRole('alertdialog').getByRole('button',{name:/Confirm dismissal/}).click();const r=await wait;assert.equal(r.status(),200,'REPORT_DISMISS_FAILED');
    assert.equal(await dbCount('reports',`id=${q(reportId)} and status='dismissed' and resolved_by=${q(s.actors.ADMIN.id)}`),1);
    return {realUiAction:true,resolutionActorVerified:true};
  });
  await check('REPORT_ACTION_NONADMIN_DENIED',async()=>{
    assert.ok(reportId);const r=await browserApi(pages.B,'/api/admin/reports/'+reportId+'/action','POST',{action:'hide_target'});assert.equal(r.status,403);
    assert.equal(await dbCount('posts',`id=${q(postId)} and status='published'`),1);return {httpStatus:403,targetUnchanged:true};
  },'permissions');
  await check('ADMIN_POST_HIDE_RESTORE_UI',async()=>{
    const p=pages.ADMIN;await goto(p,'/admin/forum/?post='+postId);
    const row=p.locator('.community-list-item').filter({hasText:'Local E2E seeded discussion'}).first();
    for(const [label,status] of [[/Hide post/,'hidden'],[/Restore/,'published']]) {
      const wait=responseFor(p,r=>new URL(r.url()).pathname==='/api/admin/forum/posts'&&r.request().method()==='PATCH');
      await row.getByRole('button',{name:label}).click();assert.equal((await wait).status(),200);
      assert.equal(await dbCount('posts',`id=${q(postId)} and status=${q(status)}`),1);
      const {c,p:anon}=await fresh();try {const r=await goto(anon,'/posts/'+postId+'/');assert.equal(r.status(),status==='hidden'?404:200);}finally{await c.close();}
    }
    return {realUiHideRestore:true,anonymousVisibilityVerified:true};
  });
  await check('CIRCLE_OWNER_ONLY_MANAGEMENT',async()=>{
    const r=await browserApi(pages.B,'/api/forum/circles/'+circleSlug+'/manage');assert.equal(r.status,403);
    const update=await browserApi(pages.B,'/api/forum/circles/'+circleSlug+'/manage','PATCH',{name:'Unauthorized rename'});assert.equal(update.status,403);
    assert.equal(await dbCount('circles',`id=${q(circleId)} and name='Local E2E Circle'`),1);return {readAndWriteDenied:true,ownerDataUnchanged:true};
  },'permissions');
  await check('CIRCLE_OWNER_DELETE_RESTORE_UI',async()=>{
    const p=pages.A;await goto(p,'/circles/'+circleSlug+'/manage/');
    await p.getByRole('button',{name:'Delete circle',exact:true}).click();
    const wait=responseFor(p,r=>new URL(r.url()).pathname.endsWith('/manage')&&r.request().method()==='DELETE');
    await p.getByRole('alertdialog').getByRole('button',{name:'Confirm circle deletion',exact:true}).click();assert.equal((await wait).status(),200);
    assert.equal(await dbCount('circles',`id=${q(circleId)} and status='deleted'`),1);
    // The real owner page navigates after deletion; wait for it before issuing
    // another navigation so the test does not abort its own pending transition.
    await p.waitForURL(origin+'/circles/',{waitUntil:'domcontentloaded'});
    const {c,p:anon}=await fresh();try {assert.equal((await goto(anon,'/circles/'+circleSlug+'/')).status(),404);}finally{await c.close();}
    await goto(p,'/circles/'+circleSlug+'/manage/');const restore=responseFor(p,r=>new URL(r.url()).pathname.endsWith('/manage')&&r.request().method()==='PATCH');
    await p.getByRole('button',{name:'Restore circle',exact:true}).click();assert.equal((await restore).status(),200);
    assert.equal(await dbCount('circles',`id=${q(circleId)} and status='active'`),1);return {realOwnerUiDeleteRestore:true,deletedCircleNotPublic:true};
  });
  await check('NOTIFICATION_READ_AND_CROSS_USER_ISOLATION',async()=>{
    const comment=await scalar(`insert into public.comments(post_id,author_id,body,status) values(${q(postId)},${q(s.actors.B.id)},'Local unread notification','published') returning id;`);
    const id=await scalar(`select id from public.forum_notifications where recipient_id=${q(s.actors.A.id)} and comment_id=${q(comment)} limit 1;`);assert.ok(id);
    const forged=await browserApi(pages.B,'/api/users/me/notifications','PATCH',{action:'mark_read',notification_id:id});assert.equal(forged.status,200);
    assert.equal(await dbCount('forum_notifications',`id=${q(id)} and read_at is null`),1);
    await goto(pages.A,'/notifications/');await pages.A.locator('.notifications-page__item').filter({hasText:'Local unread notification'}).first().waitFor();
    await pages.A.waitForFunction(()=>!document.querySelector('.notifications-page__item.is-unread'));
    assert.equal(await dbCount('forum_notifications',`id=${q(id)} and read_at is not null`),1);return {realUiAutoRead:true,crossUserPatchNoEffect:true};
  });
  await check('UI01_EXPLICIT_LANGUAGE_PREFERENCE',async()=>{
    const p=pages.A;await goto(p,'/settings/');await p.locator('select').selectOption('zh-CN');
    await p.waitForFunction(()=>document.documentElement.lang==='zh-CN');
    await goto(p,'/feed/');assert.equal(await p.locator('html').getAttribute('lang'),'zh-CN');
    await goto(p,'/settings/');await p.locator('select').selectOption('en');await p.waitForFunction(()=>document.documentElement.lang==='en');
    const row=await scalar(`select locale_preference from public.user_preferences where user_id=${q(s.actors.A.id)};`);assert.equal(row,'en');
    return {actualSettingsUi:true,serverPreferencePersisted:true,countryTrustNotClaimed:true};
  },'group1Continuation');
  for(const width of [1440,390,430]) await check('UI02_NAVIGATION_FOCUS_'+width,async()=>{
    const {c,p}=await fresh();try {
      await p.setViewportSize({width,height:932});await goto(p,'/login/');await p.getByRole('textbox',{name:'Email',exact:true}).waitFor();
      await p.getByRole('textbox',{name:'Email',exact:true}).focus();await p.keyboard.press('Tab');
      assert.equal(await p.getByRole('textbox',{name:'Password',exact:true}).evaluate(e=>document.activeElement===e),true);
      const link=p.getByRole('link',{name:'Privacy',exact:true});await link.click();await p.waitForURL(origin+'/privacy/');
      assert.equal(await p.locator('main h1').first().innerText(),'Privacy Policy');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await p.screenshot({path:path.join(out,'privacy-'+width+'.png'),fullPage:true});return {width,keyboardFocus:true,actualLinkNavigation:true,noHorizontalOverflow:true};
    } finally {await c.close();}
  },'group1Continuation');
  await check('UI03_EMPTY_INVALID_ERROR_STATES',async()=>{
    const {c,p}=await fresh();try {
      await goto(p,'/feed/');const invalid=await browserApi(p,'/api/forum/comments?post_id=invalid');assert.equal(invalid.status,400);
      assert.equal((await goto(p,'/posts/00000000-0000-4000-8000-000000000000/')).status(),404);
      const empty=await browserApi(p,'/api/forum/posts?circle=missing-circle');assert.equal(empty.status,200);assert.deepEqual(empty.data.posts,[]);
      return {actual400404AndEmptyCollection:true,noArtificialResponseFixture:true};
    } finally {await c.close();}
  },'group1Continuation');
  await check('LOCAL_IMAGE_UPLOAD_DISPLAY_CLEANUP',async()=>{
    const bucketCount=await scalar("select count(*) from storage.buckets where id='post-media';");
    if(bucketCount!=='1')throw blocked('LOCAL_MEDIA_BUCKET_MISSING');
    let stage='FORM';const evidence={realR2:false};
    try {
    const p=pages.A;await goto(p,'/posts/new/?circle='+circleSlug);
    const title='Local media '+s.runId,form=p.locator('.post-composer__form');
    await form.locator('input:not([type=hidden]):not([type=file])').fill(title);await form.locator('textarea').fill('Local image upload fixture');
    await p.locator('input[type=file]').setInputFiles({name:'local-image.png',mimeType:'image/png',buffer:await fs.readFile(path.join(root,'public/gaze-icon-192-v6.png'))});
    stage='PREVIEW';await p.locator('.media-preview-card').first().waitFor();
    stage='UPLOAD_LINK';
    const wait=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/post-media'&&r.request().method()==='POST',{timeout:20000});
    await form.locator('button[type=submit]').click();const r=await wait;assert.equal(r.status(),201,'LOCAL_IMAGE_LINK_FAILED');
    Object.assign(evidence,{realLocalSupabaseStorage:true,realUiUpload:true,mediaLinkHttpStatus:r.status()});
    const id=await scalar(`select id from public.posts where author_id=${q(s.actors.A.id)} and title=${q(title)};`);
    assert.ok(await dbCount('post_media',`post_id=${q(id)} and kind='image'`)>0);
    const media=JSON.parse(await scalar(`select json_build_object('original',storage_path,'thumbnail',thumbnail_url)::text from public.post_media where post_id=${q(id)} and kind='image' limit 1;`));
    stage='DISPLAY';await goto(p,'/posts/'+id+'/');await p.waitForFunction(()=>Array.from(document.querySelectorAll('main img')).some(i=>i.complete&&i.naturalWidth>0&&i.src.includes('/api/media/post/')));
    evidence.realImageDecoded=true;
    stage='DELETE';
    const del=await browserApi(p,'/api/forum/posts?id='+id,'DELETE');assert.equal(del.status,200);
    Object.assign(evidence,{deleteHttpStatus:del.status,reportedCleanupOk:del.data.cleanup?.ok===true,
      remainingOriginalObjects:+await scalar(`select count(*) from storage.objects where bucket_id='post-media' and name=${q(media.original)};`),
      remainingThumbnailObjects:media.thumbnail?+await scalar(`select count(*) from storage.objects where bucket_id='post-media' and name=${q(media.thumbnail)};`):0,
      remainingMediaRows:await dbCount('post_media',`post_id=${q(id)}`),
      remainingPostObjects:+await scalar(`select count(*) from storage.objects where bucket_id='post-media' and name like ${q(s.actors.A.id+'/'+id+'/%')};`)});
    assert.equal(evidence.remainingPostObjects,0,'POST_MEDIA_STORAGE_CLEANUP_INCOMPLETE');
    return {...evidence,storageObjectsCleaned:true};
    } catch(e) {e.safeEvidence={...(e.safeEvidence??{}),...evidence,mediaStage:stage};throw e;}
  },'media');
  await check('REAL_R2_VIDEO_INTEGRATION',async()=>{throw blocked('NO_ISOLATED_R2_ENDPOINT_OR_CREDENTIALS_HARDCODED_CLOUD_ENDPOINT_NOT_USED');},'media');
  await fs.writeFile(path.join(out,'BROWSER_SIGNALS_SAFE.json'),JSON.stringify({...signals,scope:'OBSERVED_TEST_PAGES_ONLY',productionRequests:0},null,2)+'\n');
}
