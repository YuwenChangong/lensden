import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function runFinalScope(h) {
  if(process.env.OGH_E2E_FINAL_FOLLOWUP==='reports') {
    const {runReportsRegression}=await import('./local-reports-regression.mjs');
    return runReportsRegression(h);
  }
  const {s,out,sql,goto,pages,newContext,browserApi,responseFor,circleSlug,dbCount,origin}=h;
  const uiOnly=process.env.OGH_E2E_FINAL_FOLLOWUP==='ui';
  const followup=process.env.OGH_E2E_FINAL_FOLLOWUP==='1';
  const selected=new Set(['LOCAL_SYNTHETIC_VIDEO_FIXTURE','LOCAL_VIDEO_UPLOAD_PLAYBACK_AND_RANGE','LOCAL_VIDEO_DELETE_AND_FRESH_DENIAL','UI03_AUTHENTICATED_CORE_ASSET_CSP_CONSOLE_MATRIX']);
  const check=(id,fn,family)=>uiOnly?(id.startsWith('UI03_ROUTE_')||id==='UI03_NOTIFICATION_STATES'||id==='UI02_CORE_CONTENT_VIEWPORTS'?h.check(id,fn,family):undefined):!followup||selected.has(id)?h.check(id,fn,family):undefined;
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const scalar=async query=>(await sql(s,query)).stdout.trim().split(/\r?\n/)[0];
  const blocked=code=>Object.assign(Error(code),{blocked:true});
  const hash=b=>createHash('sha256').update(b).digest('hex');
  let videoBytes,videoMedia;
  await check('LOCAL_SYNTHETIC_VIDEO_FIXTURE',async()=>{
    const value=await pages.A.evaluate(async()=>{
      if(!globalThis.MediaRecorder||!MediaRecorder.isTypeSupported('video/webm;codecs=vp8'))return null;
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
      const ctx=canvas.getContext('2d'),stream=canvas.captureStream(12),chunks=[];
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
      const done=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>reject(Error('SYNTHETIC_VIDEO_RECORD_FAILED'));
        recorder.onstop=async()=>{const data=new Uint8Array(await new Blob(chunks).arrayBuffer());resolve(btoa(String.fromCharCode(...data)));};});
      let frame=0;recorder.start();
      const timer=setInterval(()=>{ctx.fillStyle=frame++%2?'#167d89':'#e9eded';ctx.fillRect(0,0,160,90);},80);
      await new Promise(r=>setTimeout(r,1000));clearInterval(timer);recorder.stop();
      try{return await done;}finally{for(const track of stream.getTracks())track.stop();}
    });
    if(!value)throw blocked('LOCAL_BROWSER_VIDEO_ENCODER_UNAVAILABLE');videoBytes=Buffer.from(value,'base64');
    assert.ok(videoBytes.length>100&&videoBytes.length<65536);
    return {source:'LOCAL_SYNTHETIC_CANVAS',bytes:videoBytes.length,sha256:hash(videoBytes),externalMediaCopied:false};
  },'media');
  await check('LOCAL_VIDEO_UPLOAD_PLAYBACK_AND_RANGE',async()=>{
    if(!videoBytes)throw blocked('LOCAL_VIDEO_FIXTURE_UNAVAILABLE');
    const evidence={stage:'FORM',ticketStatus:null,ticketCode:null,mediaLinkStatus:null};
    const observeTicket=async r=>{if(new URL(r.url()).pathname==='/api/forum/external-video-upload'&&r.request().method()==='POST') {
      evidence.ticketStatus=r.status();const d=await r.json().catch(()=>({}));
      evidence.ticketCode=typeof d.error==='string'&&/^[A-Z_]{2,70}$/.test(d.error)?d.error:'REDACTED_OR_NONE';
    }};
    pages.A.on('response',observeTicket);
    try {
    const p=pages.A,title='Local video final '+s.runId;await goto(p,'/posts/new/?circle='+circleSlug);
    const form=p.locator('.post-composer__form');await form.locator('input:not([type=hidden]):not([type=file])').fill(title);
    await form.locator('textarea').fill('Disposable local video playback check');
    await p.locator('input[type=file]').setInputFiles({name:'local-test.webm',mimeType:'video/webm',buffer:videoBytes});
    evidence.stage='PREVIEW';
    await p.locator('.media-preview-card').first().waitFor();
    evidence.stage='UPLOAD_LINK';
    const linked=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/post-media'&&r.request().method()==='POST',{timeout:20000});
    await form.locator('button[type=submit]').click();
    const outcome=await Promise.race([linked.then(r=>({r})),p.locator('.auth-alert--error').waitFor().then(()=>({error:true}))]);
    if(outcome.error)throw blocked('LOCAL_VIDEO_UPLOAD_DEPENDENCY_REJECTED');
    const r=outcome.r;evidence.mediaLinkStatus=r.status();
    if(r.status()!==201)throw Object.assign(Error('LOCAL_VIDEO_LINK_FAILED'),{safeEvidence:{httpStatus:r.status()}});
    videoMedia=JSON.parse(await scalar(`select row_to_json(m)::text from (select pm.id,pm.post_id,pm.storage_path from public.post_media pm join public.posts p on p.id=pm.post_id where p.author_id=${q(s.actors.A.id)} and p.title=${q(title)} and pm.kind='video' limit 1) m;`));
    assert.ok(!videoMedia.storage_path.startsWith('tmp/'));
    evidence.stage='PLAYBACK';
    await p.waitForURL(origin+'/posts/'+videoMedia.post_id+'/',{waitUntil:'domcontentloaded'});
    const video=p.locator('main video').first();await video.waitFor();await video.scrollIntoViewIfNeeded();
    await video.evaluate(v=>{v.muted=true;});await video.focus();await video.press('Space');
    await p.waitForFunction(()=>{const v=document.querySelector('main video');return v&&v.currentTime>0.1&&v.readyState>=2&&!v.error;});
    await video.evaluate(v=>v.pause());
    const transfer=await p.evaluate(async id=>{const r=await fetch('/api/media/post/'+id,{headers:{Range:'bytes=0-31'},cache:'no-store'});
      return {status:r.status,contentRange:r.headers.get('content-range'),contentType:r.headers.get('content-type'),bytes:Array.from(new Uint8Array(await r.arrayBuffer()))};},videoMedia.id);
    assert.ok([200,206].includes(transfer.status));assert.ok(transfer.contentType?.startsWith('video/'));
    const bytes=Buffer.from(transfer.bytes);
    if(transfer.status===200)assert.equal(hash(bytes),hash(videoBytes));
    else {assert.equal(bytes.length,32);assert.equal(transfer.contentRange,'bytes 0-31/'+videoBytes.length);}
    assert.equal(+await scalar(`select count(*) from storage.objects where bucket_id='post-media' and name=${q(videoMedia.storage_path)};`),1);
    await p.screenshot({path:path.join(out,'local-video-playback.png'),fullPage:true});
    return {realComposer:true,realBrowserPlayback:true,storage:'LOCAL_SUPABASE_FALLBACK',realR2:false,rangeStatus:transfer.status,
      rangeBehavior:transfer.status===206?'PARTIAL_206':'FULL_200_SERVER_IGNORED_RANGE',receivedBytes:bytes.length,sourceBytes:videoBytes.length};
    } catch(e) {e.safeEvidence={...(e.safeEvidence??{}),...evidence,realR2:false};throw e;}
    finally {pages.A.off('response',observeTicket);}
  },'media');
  await check('LOCAL_VIDEO_DELETE_AND_FRESH_DENIAL',async()=>{
    if(!videoMedia)throw blocked('LOCAL_UPLOADED_VIDEO_UNAVAILABLE');
    const r=await browserApi(pages.A,'/api/forum/posts?id='+videoMedia.post_id,'DELETE');assert.equal(r.status,200);assert.equal(r.data.cleanup.ok,true);
    assert.equal(await dbCount('post_media',`post_id=${q(videoMedia.post_id)}`),0);
    assert.equal(+await scalar(`select count(*) from storage.objects where bucket_id='post-media' and name=${q(videoMedia.storage_path)};`),0);
    const status=await pages.A.evaluate(async id=>(await fetch('/api/media/post/'+id,{cache:'no-store'})).status,videoMedia.id);assert.equal(status,404);
    return {realLocalStorageDeleted:true,mediaRows:0,freshMedia404:true,realR2:false};
  },'media');
  const observations={documents:0,assets:0,assetHttpErrors:0,failedAssets:0,cspErrors:0,pageErrors:0,consoleNetworkErrors:0,otherConsoleErrors:0};
  const classifyError=text=>{if(/content.security.policy|refused to/i.test(text))observations.cspErrors++;
    else if(/failed to load resource|WebSocket connection/i.test(text))observations.consoleNetworkErrors++;else observations.otherConsoleErrors++;};
  await check('UI03_NORMAL_CORE_ASSET_CSP_CONSOLE_MATRIX',async()=>{
    const c=await newContext(),p=await c.newPage();
    p.on('pageerror',()=>observations.pageErrors++);p.on('console',m=>{if(m.type()==='error')classifyError(m.text());});
    const types=new Set(['script','stylesheet','font','image']);
    p.on('response',r=>{if(types.has(r.request().resourceType())){observations.assets++;if(r.status()>=400)observations.assetHttpErrors++;}});
    p.on('requestfailed',r=>{if(types.has(r.resourceType()))observations.failedAssets++;});
    try {for(const route of ['/login/','/feed/','/products/','/products/xreal/xreal-air/','/privacy/','/circles/'+circleSlug+'/']) {
      const r=await goto(p,route);assert.equal(r.status(),200);await p.locator('main').first().waitFor();
      await p.waitForLoadState('networkidle',{timeout:10000});observations.documents++;
    }
    assert.ok(observations.assets>0);
    const errors=observations.assetHttpErrors+observations.failedAssets+observations.cspErrors+observations.pageErrors+observations.consoleNetworkErrors+observations.otherConsoleErrors;
    if(errors)throw Object.assign(blocked('CORE_RESOURCE_OR_CONSOLE_EVIDENCE_NOT_CLEAN'),{safeEvidence:{...observations,requiresClassification:true}});
    return {...observations,scope:'SIX_LOCAL_CORE_ROUTES_NOT_PRODUCTION'};
    } finally {await c.close();}
  },'group1Continuation');
  const authenticated={documents:0,assets:0,assetHttpErrors:0,failedAssets:0,cspErrors:0,pageErrors:0,consoleNetworkErrors:0,otherConsoleErrors:0};
  await check('UI03_AUTHENTICATED_CORE_ASSET_CSP_CONSOLE_MATRIX',async()=>{
    const types=new Set(['script','stylesheet','font','image']);
    for(const p of [pages.A,pages.ADMIN]) {
      p.on('pageerror',()=>authenticated.pageErrors++);
      p.on('console',m=>{if(m.type()!=='error')return;const t=m.text();if(/content.security.policy|refused to/i.test(t))authenticated.cspErrors++;
        else if(/failed to load resource|WebSocket connection/i.test(t))authenticated.consoleNetworkErrors++;else authenticated.otherConsoleErrors++;});
      p.on('response',r=>{if(types.has(r.request().resourceType())){authenticated.assets++;if(r.status()>=400)authenticated.assetHttpErrors++;}});
      p.on('requestfailed',r=>{if(types.has(r.resourceType()))authenticated.failedAssets++;});
    }
    const routes=[['A','/settings/'],['A','/posts/'+h.postId+'/'],...['devices','forum','reports','media','news','users','circles'].map(n=>['ADMIN','/admin/'+n+'/'])];
    for(const [actor,route] of routes){const p=pages[actor],r=await goto(p,route);assert.equal(r.status(),200);await p.locator('main').first().waitFor();
      if(route.startsWith('/posts/'))await p.locator('#comments').scrollIntoViewIfNeeded();
      await p.waitForLoadState('networkidle',{timeout:10000});authenticated.documents++;
    }
    if(Object.entries(authenticated).some(([key,value])=>!['documents','assets'].includes(key)&&value>0))throw Object.assign(blocked('AUTHENTICATED_CORE_RESOURCE_OR_CONSOLE_NOT_CLEAN'),{safeEvidence:authenticated});
    return {...authenticated,scope:'NINE_LOCAL_AUTHENTICATED_CORE_ROUTES_NOT_PRODUCTION'};
  },'group1Continuation');
  if(uiOnly) {
    const routes=[['A','SETTINGS','/settings/',null],['A','POST','/posts/'+h.postId+'/',null],
      ['ADMIN','DEVICES','/admin/devices/','/api/admin/devices'],['ADMIN','FORUM','/admin/forum/','/api/admin/forum/posts'],
      ['ADMIN','REPORTS','/admin/reports/','/api/admin/reports'],['ADMIN','MEDIA','/admin/media/','/api/admin/forum/media'],
      ['ADMIN','NEWS','/admin/news/','/api/admin/news'],['ADMIN','USERS','/admin/users/','/api/admin/users'],
      ['ADMIN','CIRCLES','/admin/circles/','/api/admin/forum/circles']];
    for(const [actor,label,route,api] of routes) await check('UI03_ROUTE_'+label,async()=>{
      const p=pages[actor],evidence={actor,routeClass:label,stage:'NAVIGATION',assets:0,assetErrors:0,pageErrors:0,consoleErrors:0,apiRequests:0,apiStatus:null,localReadCap:12,capTriggered:false};
      const types=new Set(['script','stylesheet','font','image']);
      const onResponse=r=>{if(types.has(r.request().resourceType())){evidence.assets++;if(r.status()>=400)evidence.assetErrors++;}};
      const onError=()=>evidence.pageErrors++;
      const onConsole=m=>{if(m.type()==='error')evidence.consoleErrors++;};
      const matcher=u=>u.origin===origin&&u.pathname===api;
      const guard=async r=>{if(r.request().method()==='GET'&&++evidence.apiRequests>evidence.localReadCap){evidence.capTriggered=true;return r.abort();}return r.continue();};
      p.on('response',onResponse);p.on('pageerror',onError);p.on('console',onConsole);
      if(api)await p.route(matcher,guard);
      try {
        const first=api?responseFor(p,r=>new URL(r.url()).origin===origin&&new URL(r.url()).pathname===api&&r.request().method()==='GET',{timeout:8000}):null;
        assert.equal((await goto(p,route)).status(),200);await p.locator('main').first().waitFor();
        evidence.stage='HYDRATION';
        if(route.startsWith('/posts/'))await p.locator('#comments').scrollIntoViewIfNeeded();
        await p.waitForFunction(()=>!document.querySelector('astro-island[client="load"][ssr]'),{},{timeout:8000});
        if(first){evidence.apiStatus=(await first).status();assert.equal(evidence.apiStatus,200);}
        evidence.stage='BOUNDED_OBSERVATION';await p.waitForTimeout(1200);
        if(evidence.capTriggered)throw Error('REPEATED_LOCAL_READS_EXCEEDED_BOUND');
        assert.equal(evidence.assetErrors+evidence.pageErrors+evidence.consoleErrors,0,'CORE_BROWSER_ERRORS');
        evidence.stage='COMPLETE';return {...evidence,localOnly:true,networkIdleNotUsed:true,completeBusinessWorkflowNotClaimed:true};
      } catch(e){e.safeEvidence={...evidence};throw e;}
      finally {
        await p.goto('about:blank').catch(()=>{});
        if(api)await p.unroute(matcher,guard);
        p.off('response',onResponse);p.off('pageerror',onError);p.off('console',onConsole);
      }
    },'group1Continuation');
    await check('UI03_NOTIFICATION_STATES',async()=>{
      const p=pages.A,matcher=u=>u.origin===origin&&u.pathname==='/api/users/me/notifications';
      let release,entered;const gate=new Promise(r=>release=r),observed=new Promise(r=>entered=r);
      const hold=async r=>{entered();await gate;return r.continue();};
      await p.route(matcher,hold);
      try {
        await goto(p,'/notifications/');await Promise.race([observed,p.waitForTimeout(8000).then(()=>{throw blocked('NOTIFICATION_REQUEST_NOT_OBSERVED');})]);
        await p.locator('main .community-empty').first().waitFor();
        assert.match(await p.locator('main .community-empty').first().innerText(),/loading/i);
        release();await p.locator('.notifications-page .community-empty').waitFor();
        assert.equal(await dbCount('forum_notifications',`recipient_id=${q(s.actors.A.id)}`),0);
        assert.match(await p.locator('.notifications-page .community-empty').innerText(),/no notifications/i);
      } finally {release();await p.unroute(matcher,hold);}
      const failure=r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'LOCAL_TEST_UNAVAILABLE'})});
      await p.route(matcher,failure);
      try {await goto(p,'/notifications/');await p.getByText(/could not load notifications|failed to load notifications|unable to load notifications/i).waitFor();}
      finally {await p.goto('about:blank');await p.unroute(matcher,failure);}
      return {loadingHeldRealLocalRequest:true,emptyVerifiedInOwnedDatabase:true,errorFixtureHttpStatus:503,errorIsDeliberateFixtureNotBackendFailure:true};
    },'group1Continuation');
    await check('UI02_CORE_CONTENT_VIEWPORTS',async()=>{
      const c=await newContext(),p=await c.newPage(),measurements=[];
      try {for(const width of [1440,390,430]) {
        await p.setViewportSize({width,height:932});
        for(const [label,route] of [['FEED','/feed/'],['PRODUCT','/products/xreal/xreal-air/'],['CIRCLE','/circles/'+circleSlug+'/']]) {
          assert.equal((await goto(p,route)).status(),200);await p.locator('main').waitFor();
          await p.waitForFunction(()=>!document.querySelector('astro-island[client="load"][ssr]'));
          const m=await p.evaluate(()=>({horizontalOverflow:document.documentElement.scrollWidth>innerWidth,mainLandmarks:document.querySelectorAll('main').length,
            missingImageAlt:document.querySelectorAll('main img:not([alt])').length,unlabeledButtons:Array.from(document.querySelectorAll('main button')).filter(b=>b.getClientRects().length&&!b.textContent.trim()&&!b.getAttribute('aria-label')&&!b.getAttribute('title')).length}));
          assert.equal(m.horizontalOverflow,false);assert.equal(m.mainLandmarks,1);assert.equal(m.missingImageAlt,0);assert.equal(m.unlabeledButtons,0);
          measurements.push({width,routeClass:label,...m});
          if(label==='PRODUCT')await p.screenshot({path:path.join(out,'product-content-'+width+'.png'),fullPage:true});
        }
      }return {measurements,videoCoverage:false,fullAccessibilityAuditNotClaimed:true};}
      finally {await c.close();}
    },'group1Continuation');
  }
  await fs.writeFile(path.join(out,'CORE_BROWSER_SIGNALS_SAFE.json'),JSON.stringify({anonymous:observations,authenticated,rawUrlsOrMessagesSaved:false,productionRequests:0},null,2)+'\n');
  await check('UI02_LOCAL_KEYBOARD_FORMS_AND_LANDMARKS',async()=>{
    const c=await newContext(),p=await c.newPage();try {for(const width of [1440,390,430]) {
      await p.setViewportSize({width,height:932});await goto(p,'/login/');
      assert.equal(await p.getByRole('main').count(),1);
      const email=p.getByRole('textbox',{name:'Email',exact:true}),password=p.getByRole('textbox',{name:'Password',exact:true});
      await email.focus();await p.keyboard.press('Tab');assert.equal(await password.evaluate(e=>document.activeElement===e),true);
      await p.getByRole('button',{name:'Log in',exact:true}).click();
      await p.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(e=>e.validity.valueMissing&&e.validationMessage));
      const invalid=await p.locator('input:invalid').count();assert.ok(invalid>0);
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.equal(await p.locator('main img:not([alt])').count(),0);
    }
    return {widths:[1440,390,430],namedFormsAndKeyboard:true,mainLandmark:true,emptySubmissionRejected:true,completeAccessibilityAuditNotClaimed:true};
    } finally {await c.close();}
  },'group1Continuation');
}
