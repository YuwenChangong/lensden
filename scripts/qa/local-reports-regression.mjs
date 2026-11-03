import assert from 'node:assert/strict';
import path from 'node:path';

export async function runReportsRegression(h) {
  const {s,sql,check,pages,contexts,goto,browserApi,responseFor,currentSession,postId,out,origin}=h;
  const p=pages.ADMIN,q=v=>"'"+String(v).replaceAll("'","''")+"'";
  if(process.env.OGH_E2E_REPORTS_STACK) {
    await h.check('REPORTS_B_HTTP500_STACK',async()=>{
      if(process.env.OGH_E2E_REPORTS_STACK==='sequence') {
        const fixture=await browserApi(pages.B,'/api/forum/reports','POST',{target_type:'post',target_id:postId,reason_code:'spam',reason_text:'Disposable exact-stack fixture'});
        assert.equal(fixture.status,201);
        assert.equal((await goto(pages.A,'/admin/reports/')).status(),200);
        await pages.A.locator('.admin-state-message.admin-error').waitFor();
        assert.equal((await browserApi(pages.A,'/api/admin/reports')).status,403);
        assert.equal((await browserApi(pages.A,'/api/admin/reports/'+fixture.data.report.id+'/action','POST',{action:'hide_target'})).status,403);
      }
      const response=await goto(pages.B,'/admin/reports/');assert.equal(response.status(),200);
      await pages.B.locator('.admin-state-message.admin-error').waitFor();
      assert.equal(await pages.B.locator('.admin-reports-toolbar').count(),0);
      return {actor:'B',method:'GET',path:'/admin/reports/',htmlStatus:response.status(),forbiddenUi:true};
    },'reports');
    return;
  }
  const scalar=async query=>(await sql(s,query)).stdout.trim().split(/\r?\n/)[0];
  const matcher=u=>u.origin===origin&&u.pathname==='/api/admin/reports';
  const metrics={listRequests:0,listResponses:0,listFailed:0,deniedByLocalGuard:0};
  let base=0,reportId;
  const onRequest=r=>{if(matcher(new URL(r.url()))&&r.method()==='GET')metrics.listRequests++;};
  const guard=async route=>{if(route.request().method()==='GET') {
    if(metrics.listRequests-base>12){metrics.deniedByLocalGuard++;return route.abort();}
  }return route.continue();};
  const onResponse=r=>{if(matcher(new URL(r.url()))&&r.request().method()==='GET')metrics.listResponses++;};
  const onFailed=r=>{if(matcher(new URL(r.url()))&&r.method()==='GET')metrics.listFailed++;};
  await p.route(matcher,guard);p.on('request',onRequest);p.on('response',onResponse);p.on('requestfailed',onFailed);
  const run=async(id,fn,family='reports')=>{base=metrics.listRequests;const before={...metrics};
    await check(id,async()=>{const evidence=await fn();assert.equal(metrics.deniedByLocalGuard,0,'UNEXPECTED_REPORTS_READ_LOOP');
      return {...evidence,listRequestDelta:metrics.listRequests-before.listRequests,listResponseDelta:metrics.listResponses-before.listResponses,
        localGuardDenied:metrics.deniedByLocalGuard};},family);};
  const ready=async()=>{await p.locator('.admin-reports-toolbar').waitFor();await p.waitForLoadState('networkidle',{timeout:8000});};
  const idle=async(ms=5000)=>{const count=metrics.listRequests,start=performance.now();await p.waitForTimeout(ms);
    assert.equal(metrics.listRequests-count,0,'IDLE_REPORTS_READ_LOOP');return {observationMs:Math.round(performance.now()-start),idleListRequests:0};};
  const statusSelect=()=>p.locator('.admin-reports-filters select').first();
  const confirmAction=async(label,confirm)=>{await p.getByRole('button',{name:label,exact:true}).click();
    const response=responseFor(p,r=>new URL(r.url()).pathname==='/api/admin/reports/'+reportId+'/action'&&r.request().method()==='POST');
    await p.getByRole('alertdialog').getByRole('button',{name:confirm,exact:true}).click();assert.equal((await response).status(),200);};
  try {
    await run('REPORTS_REAL_LOCAL_FIXTURE',async()=>{
      const b=pages.B;await goto(b,'/posts/'+postId+'/');
      await b.getByRole('button',{name:/^Report$|^举报$/}).first().click();
      const dialog=b.getByRole('dialog');await dialog.locator('.glass-choice').first().click();
      await dialog.locator('textarea').fill('Disposable reports regression');
      const response=responseFor(b,r=>new URL(r.url()).pathname==='/api/forum/reports'&&r.request().method()==='POST');
      await dialog.getByRole('button',{name:/Submit report|提交举报/}).click();
      const r=await response;assert.equal(r.status(),201);reportId=(await r.json()).report.id;assert.ok(reportId);
      await dialog.waitFor({state:'hidden'});
      assert.equal(+await scalar(`select count(*) from public.reports where id=${q(reportId)} and reporter_id=${q(s.actors.B.id)};`),1);
      return {realReporterUi:true,realReporterApi:true,isolatedDataOnly:true,dbReporterVerified:true};
    });
    await run('REPORTS_REPORTER_ROW_ISOLATION',async()=>{
      assert.ok(reportId,'REPORT_FIXTURE_REQUIRED');
      const bPost=await scalar(`insert into public.posts(author_id,circle_id,type,title,body,status) values(${q(s.actors.B.id)},${q(h.circleId)},'question','Local reporter isolation','Disposable report target','published') returning id;`);
      const a=await browserApi(pages.A,'/api/forum/reports','POST',{target_type:'post',target_id:bPost,reason_code:'spam',reason_text:'Disposable private report'});
      assert.equal(a.status,201);const aId=a.data.report.id;
      try {
      for(const actor of ['A','B','ADMIN']) {
        const ownId=actor==='A'?aId:reportId,otherId=actor==='A'?reportId:aId;
        const own=await h.readTable(actor,'reports','select=id&id=eq.'+ownId);
        const other=await h.readTable(actor,'reports','select=id&id=eq.'+otherId);
        assert.equal(own.status,200);assert.deepEqual(own.data.map(r=>r.id),[ownId]);
        assert.equal(other.status,200);assert.deepEqual(other.data.map(r=>r.id),actor==='ADMIN'?[otherId]:[]);
      }
      const anon=await h.localFetch('/rest/v1/reports?select=id&id=eq.'+reportId,{headers:{apikey:s.status.ANON_KEY}}),body=await anon.json();
      assert.ok(anon.status===200?Array.isArray(body)&&body.length===0:[401,403].includes(anon.status)&&body.code==='42501');
      return {ordinaryJwtAndAnonKeyOnly:true,ownRows:1,crossReporterRows:0,adminBothRows:true,anonPrivateRows:0,
        ownReportPage:'NOT_IMPLEMENTED_NO_NEW_PRODUCT_SCOPE',databaseRlsEnforced:true};
      } finally {
        await sql(s,`delete from public.report_events where report_id=${q(aId)};delete from public.reports where id=${q(aId)};delete from public.posts where id=${q(bPost)};`);
      }
    },'permissions');
    await run('REPORTS_INITIAL_LOAD_AND_IDLE',async()=>{
      assert.equal((await goto(p,'/admin/reports/')).status(),200);
      await p.locator('.admin-report-card').filter({hasText:'Local E2E seeded discussion'}).waitFor();
      await p.locator('.admin-detail-panel').first().waitFor();await ready();
      assert.ok(metrics.listRequests-base>=1&&metrics.listRequests-base<=2,'INITIAL_LIST_LOAD_NOT_BOUNDED');
      return {...await idle(),initialListRequests:metrics.listRequests-base,serverBuiltApplication:true,developmentStrictModeNotUsed:true};
    });
    await run('REPORTS_UNRELATED_RENDER_FOCUS_NO_REFETCH',async()=>{
      await p.locator('.admin-search-field input').fill('Local');await p.locator('.admin-note-field textarea').fill('Local draft note');
      await p.bringToFront();await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
      const evidence=await idle();assert.equal(metrics.listRequests-base,0);
      await p.locator('.admin-search-field input').fill('');return {...evidence,localSearchAndNoteRender:true,focusEvent:true};
    });
    await run('REPORTS_MANUAL_BROWSER_REFRESH',async()=>{
      await p.reload({waitUntil:'domcontentloaded'});await ready();await p.locator('.admin-report-card').waitFor();
      assert.ok(metrics.listRequests-base>=1&&metrics.listRequests-base<=2);return {...await idle(),realBrowserReload:true};
    });
    await run('REPORTS_SUPERSEDED_FILTER_READ',async()=>{
      let release,enter;const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r);
      const delayed=u=>matcher(u)&&u.searchParams.get('status')==='reviewing';
      const hold=async r=>{enter();await gate;await r.continue().catch(()=>{});};
      await p.route(delayed,hold);
      try {await statusSelect().selectOption('reviewing');await Promise.race([entered,p.waitForTimeout(8000).then(()=>{throw Error('DELAYED_FILTER_NOT_OBSERVED');})]);
        await statusSelect().selectOption('open');await p.locator('.admin-report-card').waitFor();release();await ready();
        assert.equal(await p.locator('.admin-report-card').count(),1);assert.equal(await statusSelect().inputValue(),'open');
        return {...await idle(),staleFilterCannotReplaceCurrentList:true,failedReadsObserved:metrics.listFailed};
      } finally {release();await p.unroute(delayed,hold);}
    });
    await run('REPORTS_ERROR_NO_AUTO_RETRY_AND_MANUAL_RECOVERY',async()=>{
      let injected=0;const failure=async r=>{injected++;await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'LOCAL_REPORTS_TEST_FAILURE'})});};
      await p.route(matcher,failure);
      try {await p.reload({waitUntil:'domcontentloaded'});await p.locator('.admin-error').filter({hasText:'LOCAL_REPORTS_TEST_FAILURE'}).waitFor();
        await p.waitForLoadState('networkidle',{timeout:8000});const initialFailures=injected;
        assert.ok(initialFailures>=1&&initialFailures<=2,'REPORTS_INITIAL_ERROR_NOT_BOUNDED');
        await idle();assert.equal(injected,initialFailures,'REPORTS_ERROR_RETRY_LOOP');
      } finally {await p.unroute(matcher,failure);}
      await p.reload({waitUntil:'domcontentloaded'});await p.locator('.admin-report-card').waitFor();await ready();
      return {...await idle(),deliberate503FixtureCount:injected,realManualRecovery:true,fixtureNotBackendFailure:true};
    });
    await run('REPORTS_REVIEW_AND_DISMISS_UPDATES',async()=>{
      await confirmAction('Mark in review','Confirm in review');await ready();
      assert.equal(await scalar(`select status from public.reports where id=${q(reportId)};`),'reviewing');
      await statusSelect().selectOption('reviewing');await p.locator('.admin-report-card').waitFor();await ready();
      await confirmAction('Dismiss report','Confirm dismissal');await ready();
      assert.equal(await scalar(`select status from public.reports where id=${q(reportId)};`),'dismissed');
      assert.equal(+await scalar(`select count(*) from public.reports where id=${q(reportId)} and resolved_by=${q(s.actors.ADMIN.id)};`),1);
      assert.equal(await p.locator('.admin-report-card').count(),0);
      await statusSelect().selectOption('all');await p.locator('.admin-report-card').waitFor();await ready();
      return {...await idle(),actualUiActions:2,dbStatusAndResolverVerified:true,openQueueUpdated:true};
    });
    await run('REPORTS_ORDINARY_USERS_DENIED',async()=>{
      const evidence={actor:'A',stage:'PAGE',pageHttpStatus:null,readHttpStatus:null,actionHttpStatus:null};
      const originalStatus=await scalar(`select status from public.reports where id=${q(reportId)};`);
      try {
      for(const actor of ['A','B']) {
        evidence.actor=actor;evidence.stage='PAGE';
        evidence.pageHttpStatus=null;evidence.readHttpStatus=null;evidence.actionHttpStatus=null;
        evidence.pageHttpStatus=(await goto(pages[actor],'/admin/reports/')).status();assert.equal(evidence.pageHttpStatus,200);
        await pages[actor].locator('.admin-state-message.admin-error').waitFor();
        assert.equal(await pages[actor].locator('.admin-reports-toolbar').count(),0);
        evidence.stage='API_READ';const read=await browserApi(pages[actor],'/api/admin/reports');evidence.readHttpStatus=read.status;assert.equal(read.status,403);
        assert.equal(Array.isArray(read.data.reports),false);
        evidence.stage='API_ACTION';const action=await browserApi(pages[actor],'/api/admin/reports/'+reportId+'/action','POST',{action:'hide_target'});evidence.actionHttpStatus=action.status;assert.equal(action.status,403);
      }
      assert.equal(await scalar(`select status from public.posts where id=${q(postId)};`),'published');
      assert.equal(await scalar(`select status from public.reports where id=${q(reportId)};`),originalStatus);
      return {actors:['A','B'],readAndAction403:true,noPrivateList:true,targetUnchanged:true,realServerAuthorization:true};
      } catch(e){e.safeEvidence={...(e.safeEvidence??{}),...evidence};throw e;}
    },'permissions');
    await run('REPORTS_MOBILE_DIALOG_AND_KEYBOARD',async()=>{
      for(const width of [1440,390,430]) {
        await p.setViewportSize({width,height:932});await statusSelect().focus();await p.keyboard.press('Tab');
        assert.equal(await p.locator('.admin-reports-filters select').nth(1).evaluate(e=>e===document.activeElement),true);
        assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await p.getByRole('button',{name:'Mark in review',exact:true}).click();
        const dialog=p.getByRole('alertdialog');await dialog.waitFor();
        const box=await dialog.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1);
        await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
        await p.screenshot({path:path.join(out,'reports-'+width+'.png'),fullPage:true,mask:[p.locator('.admin-user-line'),p.locator('.admin-meta-grid code')]});
      }
      assert.equal(await scalar(`select status from public.reports where id=${q(reportId)};`),'dismissed');
      return {widths:[1440,390,430],dialogEscapeNoAction:true,keyboardFilterFocus:true,overflow:false};
    },'group1Continuation');
    await run('REPORTS_UNMOUNT_DURING_READ',async()=>{
      let release,enter;const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r);
      const delayed=u=>matcher(u)&&u.searchParams.get('status')==='open';
      const hold=async r=>{enter();await gate;await r.continue().catch(()=>{});};await p.route(delayed,hold);
      try {await statusSelect().selectOption('open');await Promise.race([entered,p.waitForTimeout(8000).then(()=>{throw Error('UNMOUNT_READ_NOT_OBSERVED');})]);
        assert.equal((await goto(p,'/feed/')).status(),200);release();await p.waitForLoadState('networkidle',{timeout:8000});
        const evidence=await idle();await goto(p,'/admin/reports/');await ready();await statusSelect().selectOption('all');await ready();
        return {...evidence,unmountWhileReadPending:true,remountSucceeded:true};
      } finally {release();await p.unroute(delayed,hold);}
    });
    await run('REPORTS_AUTH_CHANGE_AND_ROLE_RECHECK',async()=>{
      const aux=await contexts.ADMIN.newPage();
      const evidence={stage:'REPORTS_PAGE'};
      const signOut=async()=>{evidence.stage='SIGN_OUT';await goto(aux,'/settings/');await aux.locator('.locale-settings').getByRole('button',{name:'Logout',exact:true}).click();
        await p.waitForFunction(k=>!localStorage.getItem(k),h.storageKey,{timeout:8000});};
      const login=async actor=>{evidence.stage='LOGIN_'+actor;await goto(aux,'/login/?next=%2Fsettings%2F');await aux.getByRole('textbox',{name:'Email',exact:true}).fill(s.actors[actor].email);
        await aux.getByRole('textbox',{name:'Password',exact:true}).fill(s.actors[actor].password);await aux.getByRole('button',{name:'Log in',exact:true}).click();
        await aux.waitForURL(origin+'/settings/',{waitUntil:'domcontentloaded'});
      };
      try {await goto(p,'/admin/reports/');await ready();await statusSelect().selectOption('all');await ready();
        await signOut();evidence.stage='PARENT_SIGNED_OUT';await p.waitForFunction(()=>!document.querySelector('.admin-reports-toolbar'));
        await login('ADMIN');await p.locator('.admin-reports-toolbar').waitFor();await ready();const normal=await idle();
        assert.equal((await currentSession(p))?.user?.id,s.actors.ADMIN.id);
        await signOut();const count=metrics.listRequests;await login('B');await p.locator('.admin-state-message.admin-error').waitFor();
        assert.equal((await currentSession(p))?.user?.id,s.actors.B.id);assert.equal(metrics.listRequests-count,0);
        assert.equal(await p.locator('.admin-reports-toolbar').count(),0);
        for(const actor of ['A','B'])assert.equal((await currentSession(pages[actor]))?.user?.id,s.actors[actor].id);
        return {...normal,realCrossTabSignOutSignIn:true,adminRecoveryVerified:true,ordinaryAccountRecheckDenied:true,otherContextsUnchanged:true,noRawSessionExport:true};
      } catch(e){e.safeEvidence={...(e.safeEvidence??{}),...evidence};throw e;}
      finally {await aux.close();}
    },'permissions');
  } finally {await p.goto('about:blank').catch(()=>{});await p.unroute(matcher,guard);p.off('request',onRequest);p.off('response',onResponse);p.off('requestfailed',onFailed);}
}
