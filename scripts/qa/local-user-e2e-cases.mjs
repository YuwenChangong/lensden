import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { unstable_startWorker } from 'wrangler';
import { catalogSteps } from '../../tools/e-verify-group1-login-diagnostics/execution/group1/rls.mjs';
import { randomBytes } from 'node:crypto';
import { sanitizeSupabaseStartDiagnosticText } from './local-disposable-supabase-replay.mjs';
import { buildOutboundFetchInit } from '../lib/locale-v2-outbound-bridge.mjs';
import { verifyLocalCatalog } from './local-rls-assertions.mjs';

export async function runCases({s,root,environment,command,sql}) {
  const ticketOffline=process.env.OGH_E2E_R2_TICKET_OFFLINE==='1';
  const migrationReconciliation=process.env.OGH_E2E_MIGRATION_RECONCILIATION==='1';
  const realR2=ticketOffline||process.env.OGH_E2E_REAL_R2==='1';
  const commentDelete=process.env.OGH_E2E_COMMENT_DELETE==='1';
  const thumbnail=process.env.OGH_E2E_THUMBNAIL==='1';
  const finalScope=process.env.OGH_E2E_FINAL_SCOPE==='1';
  const continuation=process.env.OGH_E2E_CONTINUATION==='1';
  const commentRegression=migrationReconciliation||realR2||finalScope||thumbnail||continuation||commentDelete||process.env.OGH_E2E_COMMENT_REGRESSION==='1';
  if(migrationReconciliation&&realR2)throw Error('LOCAL_MIGRATION_SCOPE_FORBIDS_REAL_R2');
  const out = path.join(root,'output/playwright/local-supabase-e2e',s.runId);
  await fs.mkdir(out,{recursive:true});
  const report = {environment:'DISPOSABLE_LOCAL_SUPABASE_REAL_ASTRO_REAL_AUTH',runId:s.runId,results:[],group1:[],
    productionRequests:0,productionWrites:0,productionAuthOperations:0,productionDeployments:0,externalRequestsBlocked:0,
    captcha:'LOCAL_OFF_ONLY_NOT_PRODUCTION_CAPTCHA',databaseIsolation:'PASS',migrationCount:s.migrations,cleanup:'NOT_RUN',
    localRateLimitFixture:{canonicalRpcWasMissing:s.rateLimitWasMissingFromCanonicalMigrations??false,source:s.rateLimitFixtureSha256??null,baseline:s.rateLimitBaseline??null,productionParity:'NOT_CLAIMED'}};
  const previousId=process.env.OGH_E2E_REUSE_RUN;
  const previous=previousId&&/^[a-f0-9]{12}$/.test(previousId)?JSON.parse(await fs.readFile(path.join(root,'output/playwright/local-supabase-e2e',previousId,'RESULTS_SAFE.json'),'utf8')):null;
  const only=process.env.OGH_E2E_ONLY?.split(',');
  const runtimeFaults={crossRequestIo:0,hangingPromise:0,networkConnectionLost:0,proxyNetworkConnectionLost:0,fatalRuntime:0};
  if(finalScope)report.runtimeFaultCategories=runtimeFaults;
  let worker,browser,r2;
  const clients={},sessions={},pages={},contexts={};
  const localFaults={failThumbnailDelete:false};
  let createdPostId;
  const q = v => "'"+String(v).replaceAll("'","''")+"'";
  const block = reason => Object.assign(Error(reason),{blocked:true});
  async function check(id, fn, family='business') {
    if(only&&family!=='auth'&&!only.includes(id)) {
      const old=previous?.results.find(x=>x.id===id);if(old)report.results.push({...old,evidenceRun:old.evidenceRun??previous.runId,reusedThisTaskOnly:true});
      else report.results.push({id,family,status:'NOT_RUN',reason:'TARGETED_FOLLOWUP_ONLY'});return;
    }
    if(previous&&['original16Rls','additionalRls','pages','ui'].includes(family)) {
      const old=previous.results.find(x=>x.id===id);if(old){report.results.push({...old,evidenceRun:previous.runId,reusedThisTaskOnly:true});return;}
    }
    try { const evidence=await fn(); report.results.push({id,family,status:'PASS',...evidence}); }
    catch(e) { report.results.push({id,family,status:e.blocked||e.name==='TimeoutError'?'BLOCKED':'FAIL',reason:e.name==='TimeoutError'?'UI_OR_LOCAL_OPERATION_TIMEOUT':e.message?.match(/^[A-Z][A-Z0-9_:-]{1,100}$/)?.[0]??'ASSERTION_FAILED',
      ...(e.actual!==undefined && ['number','boolean'].includes(typeof e.actual)?{actual:e.actual,expected:e.expected}:{} ),...(e.safeEvidence??{})}); }
    console.log(JSON.stringify(report.results.at(-1)));
  }
  const passed = id => report.results.find(x=>x.id===id)?.status==='PASS';
  async function localFetch(target,options={}) {
    const url = new URL(target,s.status.API_URL);
    assert.equal(url.origin,new URL(s.status.API_URL).origin,'LOCAL_TARGET_REQUIRED');
    return fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});
  }
  async function readTable(actor,table,query) {
    if (!sessions[actor]) throw block('AUTH_SESSION_UNAVAILABLE');
    const r=await localFetch('/rest/v1/'+table+'?'+query,{headers:{apikey:s.status.ANON_KEY,Authorization:'Bearer '+sessions[actor].access_token}});
    return {status:r.status,data:await r.json()};
  }
  async function dbCount(table,where) { return +(await sql(s,`select count(*) from public.${table} where ${where};`)).stdout.trim(); }
  try {
    if(realR2) {
      const {createIsolatedR2Run}=await import('./local-real-r2-cases.mjs');
      r2=await createIsolatedR2Run({root,s,report,offline:ticketOffline});
    }
    for (const [actor,identity] of commentRegression?[]:Object.entries(s.actors)) {
      await check('REAL_NODE_AUTH_'+actor,async()=>{
        const client=createClient(s.status.API_URL,s.status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
        const {data,error}=await client.auth.signInWithPassword({email:identity.email,password:identity.password});
        assert.ok(!error&&data.session,'AUTH_LOGIN_FAILED');
        assert.equal(data.user.id,identity.id,'AUTH_IDENTITY_MISMATCH');
        clients[actor]=client;sessions[actor]=data.session;
        return {realLocalAuth:true,expectedIdentityVerified:true,serviceRoleUsed:false};
      },'auth');
    }
    for (const step of commentRegression?[]:catalogSteps()) {
      await check(step.id,async()=>{
        if (step.actor!=='anon'&&!sessions[step.actor]) throw block('AUTH_SESSION_UNAVAILABLE');
        const response=await localFetch(step.path,{headers:{apikey:s.status.ANON_KEY,...(step.actor==='anon'?{}:{Authorization:'Bearer '+sessions[step.actor].access_token})}});
        const body=Buffer.from(await response.text());
        try { verifyLocalCatalog(step,{status:response.status,body}); }
        catch(e) { const data=JSON.parse(body); e.safeEvidence={httpStatus:response.status,permissionCode:typeof data.code==='string'?data.code:null,rows:Array.isArray(data)?data.length:null,
          detailEmpty:data.details==null||data.details==='',hintEmpty:data.hint==null||data.hint==='',messageClass:/permission denied/.test(data.message??'')?'PERMISSION_DENIED':'OTHER'};throw e; }
        return {httpStatus:response.status,contentAndPolicyAssertion:true,actor:step.actor,serviceRoleUsed:false};
      },'original16Rls');
    }
    for (const a of Object.values(s.actors)) await sql(s,`select public.record_current_legal_policy_acceptance(${q(a.id)},'2026-07','2026-07','2026-07','2026-07',16::smallint,'legacy_account_gate');`);
    for (const actor of commentRegression?[]:['A','B']) await check('OWN_PRIVATE_RLS_'+actor,async()=>{
      const other=actor==='A'?'B':'A';
      const own=await readTable(actor,'legal_policy_acceptances','select=user_id&user_id=eq.'+s.actors[actor].id);
      const denied=await readTable(actor,'legal_policy_acceptances','select=user_id&user_id=eq.'+s.actors[other].id);
      assert.equal(own.status,200);assert.deepEqual(own.data.map(r=>r.user_id),[s.actors[actor].id]);
      assert.equal(denied.status,200);assert.deepEqual(denied.data,[]);
      return {ownRows:1,crossUserRows:0,databaseRlsEnforced:true,serviceRoleUsed:false};
    },'additionalRls');
    if(!commentRegression) await check('ANON_PRIVATE_RLS',async()=>{
      const r=await localFetch('/rest/v1/legal_policy_acceptances?select=user_id',{headers:{apikey:s.status.ANON_KEY}}),data=await r.json();
      assert.ok([401,403].includes(r.status)&&data.code==='42501','ANON_PRIVATE_POLICY_DENIAL');
      return {httpStatus:r.status,permissionCode:data.code};
    },'additionalRls');
    const circleSlug='e2e-'+s.runId;
    const circleId=(await sql(s,`with added as (insert into public.circles(slug,name,description,type,owner_id) values(${q(circleSlug)},'Local E2E Circle','Disposable local test fixture','topic',${q(s.actors.A.id)}) on conflict(slug) do nothing returning id) select id from added union all select id from public.circles where slug=${q(circleSlug)} limit 1;`)).stdout.trim().split('\n')[0];
    const postId=(await sql(s,`insert into public.posts(author_id,circle_id,type,title,body,status) values(${q(s.actors.A.id)},${q(circleId)},'question','Local E2E seeded discussion','A disposable local discussion for real browser interactions.','published') returning id;`)).stdout.trim().split('\n')[0];
    if(only) {
      createdPostId=(await sql(s,`select id from public.posts where author_id=${q(s.actors.A.id)} and title=${q('Local E2E '+s.runId+' created post')} and status='published' limit 1;`)).stdout.trim();
      await sql(s,`insert into public.comments(post_id,author_id,body,status) values(${q(postId)},${q(s.actors.A.id)},'Local seeded comment for a targeted reply check.','published');`);
    }
    report.fixtureScope={oneOwnedCircle:true,onePublishedPost:true,productionDataCopied:false,legalAcknowledgementsSeededNotUiTested:true};
    console.log('LOCAL_APPLICATION_BUILD=STARTED');
    const origin='https://127.0.0.1:4328';
    const vars={SITE_ORIGIN:origin,SUPABASE_URL:s.status.API_URL,PUBLIC_SUPABASE_URL:s.status.API_URL,SUPABASE_ANON_KEY:s.status.ANON_KEY,PUBLIC_SUPABASE_ANON_KEY:s.status.ANON_KEY,AUTH_CAPTCHA_MODE:'off',MODERATION_PROVIDER_UNAVAILABLE_POLICY:'local_only_safe'};
    report.moderation='EXISTING_LOCAL_ONLY_SAFE_POLICY_NOT_EXTERNAL_PROVIDER_ACCEPTANCE';
    const config=path.join(s.runtime,'local-worker.json'),key=path.join(s.runtime,'local-key.pem'),cert=path.join(s.runtime,'local-cert.pem');
    await fs.writeFile(config,JSON.stringify({name:'ogh-local-e2e',compatibility_date:'2026-05-17',compatibility_flags:['nodejs_compat'],vars}));
    await command('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','1','-keyout',key,'-out',cert,'-subj','/CN=Owned Local E2E','-addext','subjectAltName=IP:127.0.0.1']);
    await command(process.execPath,['scripts/build-workers.mjs','--local-config',config],{timeout:180000});
    console.log('LOCAL_APPLICATION_BUILD=PASS');
    worker=await unstable_startWorker({config:path.join(root,'dist/server/wrangler.json'),envFiles:[],build:{bundle:false},
      bindings:Object.fromEntries(Object.entries({...vars,...r2?.bindings,SUPABASE_SERVICE_ROLE_KEY:s.status.SERVICE_ROLE_KEY,RATE_LIMIT_SALT:randomBytes(32).toString('hex')}).map(([name,value])=>[name,{type:'plain_text',value}])),
      dev:{remote:false,watch:false,liveReload:false,persist:false,inspector:false,logLevel:'none',
        ...(finalScope?{structuredLogsHandler(log){const value=JSON.stringify(log);
          if(/Cannot perform I\/O|I\/O.*different request/i.test(value))runtimeFaults.crossRequestIo++;
          if(/never generate a response|hanging Promise/i.test(value))runtimeFaults.hangingPromise++;
          if(/Network connection lost/i.test(value))runtimeFaults.networkConnectionLost++;
          if(/fatal|access violation/i.test(value))runtimeFaults.fatalRuntime++;
        }}:{}),server:{hostname:'127.0.0.1',port:4328,secure:true,httpsKeyPath:key,httpsCertPath:cert},
        async outboundService(request) {
          const url=new URL(request.url);
          if(r2?.isTarget(url))return r2.workerFetch(request);
          if(url.origin!==new URL(s.status.API_URL).origin){report.externalRequestsBlocked++;return new Response('LOCAL_OUTBOUND_DENIED',{status:599});}
          if(thumbnail&&localFaults.failThumbnailDelete&&request.method==='DELETE'&&url.pathname==='/storage/v1/object/post-media') {
            const body=await request.clone().json();
            if(body.prefixes?.some(p=>typeof p==='string'&&p.split('/').at(-1).startsWith('thumb-'))) {
              return Response.json({message:'LOCAL_THUMBNAIL_DELETE_FAILURE',statusCode:'503',error:'ServiceUnavailable'},{status:503});
            }
          }
          return fetch(url,await buildOutboundFetchInit(request));
        }}});
    if(finalScope)worker.raw.on('error',event=>{
      if(event.source==='ProxyController'&&/Network connection lost/i.test(event.cause?.message??''))runtimeFaults.proxyNetworkConnectionLost++;
    });
    await worker.ready; await worker.url;
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});
    async function newContext(width=1440) {
      const c=await browser.newContext({viewport:{width,height:1000},locale:'en-US',ignoreHTTPSErrors:true,serviceWorkers:'block'});
      c.setDefaultTimeout(10000);
      await c.route('**/*',route=>{const u=new URL(route.request().url());if(r2?.isTarget(u))return r2.browserFetch(route);if([origin,new URL(s.status.API_URL).origin].includes(u.origin))return route.continue();report.externalRequestsBlocked++;return route.abort();});
      return c;
    }
    const storageKey='sb-'+new URL(s.status.API_URL).hostname.split('.')[0]+'-auth-token';
    async function currentSession(p) { return p.evaluate(k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}},storageKey); }
    async function goto(p,route) { const r=await p.goto(origin+route,{waitUntil:'domcontentloaded',timeout:20000});if(r?.status()>=500){
      const text=await r.text(),e=Error('APPLICATION_HTTP_'+r.status());
      const diagnostic=text.match(/(?:TypeError|ReferenceError|Error):[^\n<]{1,160}/)?.[0];
      const exceptionFrames=text.split(/\r?\n/).filter(line=>/^\s*at [\w.$<>\[\] :/\\()@-]+:\d+:\d+\)?\s*$/.test(line))
        .filter(line=>line.includes(root)||line.includes(root.replaceAll('\\','/'))||line.includes('node:internal/'))
        .slice(0,20).map(line=>line.trim().replaceAll(root,'<repo>').replaceAll(root.replaceAll('\\','/'),'<repo>'));
      const request=r.request(),headers=await request.allHeaders(),redirectPaths=[];
      for(let item=request;item;item=item.redirectedFrom())redirectPaths.unshift(new URL(item.url()).origin===origin?new URL(item.url()).pathname:'[NONLOCAL]');
      const requestComparison={browser:{protocol:new URL(request.url()).protocol,hostMatchesLocalOrigin:new URL(request.url()).host===new URL(origin).host,
        path:new URL(request.url()).pathname,method:request.method(),headerNames:Object.keys(headers).sort(),cookiePresent:!!headers.cookie,authorizationHeaderPresent:!!headers.authorization},
        direct:{protocol:new URL(origin).protocol,hostMatchesLocalOrigin:true,path:new URL(origin+route).pathname,method:'GET',explicitHeaderNames:[],cookiePresent:false,authorizationHeaderPresent:false},
        runtimeConfiguration:'SAME_RUNNING_WORKER',browserIdentity:'ISOLATED_AUTH_CONTEXT_NOT_SENT_AS_BEARER_ON_HTML_NAVIGATION'};
      const stackClasses=['ProxyWorker','Miniflare','undici','workerd','AdminReportsPanel','renderToReadableStream','supabase','wrangler'].filter(k=>text.includes(k));
      let directStatus=null;
      if(finalScope&&route==='/admin/reports/') {
        try {
          const direct=await worker.fetch(origin+route,{signal:AbortSignal.timeout(5000)});directStatus=direct.status;await direct.text();
        } catch { /* Keep the original navigation failure, not the diagnostic probe failure. */ }
      }
      e.safeEvidence={httpStatus:r.status(),stackClasses,...(process.env.OGH_E2E_REPORTS_STACK?{exceptionFrames,responseBytes:Buffer.byteLength(text),
        errorResponseIsHtml:/<html[\s>]/i.test(text),redirectPaths,requestComparison}:{}),directWorkerStatus:directStatus,
        ...(diagnostic?{diagnostic:sanitizeSupabaseStartDiagnosticText(diagnostic)}:{})};throw e;
    }return r; }
    async function assertResponse(r,label) {
      if(r.ok())return;
      const d=await r.json().catch(()=>({})),e=Error(label);
      const msg=typeof d.error==='string'?d.error:typeof d.message==='string'?d.message:'';
      e.safeEvidence={httpStatus:r.status(),code:typeof d.code==='string'?d.code:null,message:sanitizeSupabaseStartDiagnosticText(msg).slice(0,140)};throw e;
    }
    // Native fetch does not inherit Playwright's local-certificate trust.
    // Browser-side API reads keep secrets in the isolated browser/Node memory only.
    async function browserApi(p,route,method='GET',body) {
      return p.evaluate(async({k,route,method,body})=>{const t=JSON.parse(localStorage.getItem(k)||'null')?.access_token;const r=await fetch(route,{method,headers:{Authorization:'Bearer '+t,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};},{k:storageKey,route,method,body});
    }
    function responseFor(p,predicate,options={}) {
      const waiting=p.waitForResponse(predicate,{timeout:10000,...options});
      waiting.catch(()=>{});return waiting;
    }
    for(const actor of ['A','B','ADMIN']) {
      contexts[actor]=await newContext();pages[actor]=await contexts[actor].newPage();
      const p=pages[actor],identity=s.actors[actor];
      await check('BROWSER_LOGIN_'+actor,async()=>{
        await goto(p,'/login/?next=%2Fsettings%2F');
        await p.getByRole('textbox',{name:'Email',exact:true}).fill(identity.email);
        await p.getByRole('textbox',{name:'Password',exact:true}).fill(identity.password);
        await p.getByRole('button',{name:'Log in',exact:true}).click();
        await p.waitForURL(origin+'/settings/',{waitUntil:'domcontentloaded',timeout:15000});
        const session=await currentSession(p);assert.equal(session?.user?.id,identity.id,'BROWSER_IDENTITY_MISMATCH');
        const r=await localFetch('/auth/v1/user',{headers:{apikey:s.status.ANON_KEY,Authorization:'Bearer '+session.access_token}}),user=await r.json();
        assert.equal(r.status,200);assert.equal(user.id,identity.id);
        return {realUiFormSubmitted:true,serverIdentityVerified:true,captcha:'LOCAL_OFF_NOT_PRODUCTION'};
      },'auth');
      if(!commentRegression) await check('BROWSER_PERSISTENCE_'+actor,async()=>{
        if(!passed('BROWSER_LOGIN_'+actor))throw block('BROWSER_LOGIN_NOT_PASSED');
        await p.reload({waitUntil:'domcontentloaded'});assert.equal((await currentSession(p))?.user?.id,identity.id);
        return {reloadKeepsExpectedSession:true};
      },'auth');
    }
    await check('THREE_CONTEXT_ISOLATION',async()=>{
      for(const actor of ['A','B','ADMIN'])assert.equal((await currentSession(pages[actor]))?.user?.id,s.actors[actor].id,'CONTEXT_IDENTITY_MISMATCH');
      assert.equal(new Set(Object.values(contexts)).size,3);return {independentContexts:3,expectedIdentities:3};
    },'auth');
    if(commentRegression) {
      for(const actor of ['A','B','ADMIN']) sessions[actor]=await currentSession(pages[actor]);
      const module=await import(migrationReconciliation?'./local-release-migration-regression.mjs':realR2?'./local-real-r2-cases.mjs':finalScope?'./local-final-scope-cases.mjs':thumbnail?'./local-thumbnail-regression.mjs':continuation?'./local-business-continuation.mjs':commentDelete?'./local-comment-delete-regression.mjs':'./local-comment-regression.mjs');
      const run=migrationReconciliation?module.runMigrationReconciliation:ticketOffline?module.runOfflineTicketCase:realR2?module.runRealR2Cases:finalScope?module.runFinalScope:thumbnail?module.runThumbnailRegression:continuation?module.runContinuation:module.runCommentRegression;
      await run({s,root,out,environment,command,sql,check,report,localFetch,readTable,dbCount,browserApi,responseFor,goto,pages,contexts,newContext,postId,circleId,circleSlug,sessions,currentSession,storageKey,origin,localFaults,r2,worker});
      return {failed:report.results.some(x=>x.status==='FAIL')||Boolean(report.environmentBlocker)};
    }
    for(const actor of ['A','B','ADMIN']) await check('ADMIN_API_'+actor,async()=>{
      if(!passed('BROWSER_LOGIN_'+actor))throw block('BROWSER_LOGIN_NOT_PASSED');
      const r=await browserApi(pages[actor],'/api/admin/devices');assert.equal(r.status,actor==='ADMIN'?200:403,'ADMIN_PERMISSION_STATUS');
      if(actor!=='ADMIN')assert.ok(!r.data.devices,'ADMIN_DATA_LEAK');
      return {httpStatus:r.status,expectedRole:actor==='ADMIN'?'admin':'user',backendPermissionChecked:true};
    },'permissions');
    const a=pages.A,b=pages.B;
    if(passed('BROWSER_LOGIN_A')) {
      await check('POST_CREATE_UI',async()=>{
        await goto(a,'/posts/new/?circle='+circleSlug);
        const form=a.locator('.post-composer__form');await form.locator('input:not([type=hidden]):not([type=file])').fill('Local E2E '+s.runId+' created post');
        await form.locator('textarea').fill('A genuine local browser publication test with disposable content.');
        const response=responseFor(a,r=>new URL(r.url()).pathname==='/api/forum/posts'&&r.request().method()==='POST',{timeout:15000});
        await form.locator('button[type=submit]').click();const r=await response;
        await assertResponse(r,'POST_CREATE_HTTP_FAILURE');
        assert.equal(await dbCount('posts',`author_id=${q(s.actors.A.id)} and title=${q('Local E2E '+s.runId+' created post')}`),1,'POST_NOT_PERSISTED');
        createdPostId=(await sql(s,`select id from public.posts where author_id=${q(s.actors.A.id)} and title=${q('Local E2E '+s.runId+' created post')};`)).stdout.trim();
        return {uiSubmitted:true,backendRowVerified:true,httpStatus:r.status(),moderationNotBypassed:true};
      });
      await check('COMMENT_UI',async()=>{
        await goto(a,'/posts/'+postId+'/');const form=a.locator('.comment-form').first();
        await form.locator('textarea').fill('Local E2E comment '+s.runId);
        const response=responseFor(a,r=>new URL(r.url()).pathname==='/api/forum/comments'&&r.request().method()==='POST');
        await form.locator('button[type=submit]').click();const r=await response;await assertResponse(r,'COMMENT_HTTP_FAILURE');
        assert.equal(await dbCount('comments',`post_id=${q(postId)} and body=${q('Local E2E comment '+s.runId)}`),1);
        return {uiSubmitted:true,backendRowVerified:true};
      });
      await check('REPLY_UI',async()=>{
        await goto(a,'/posts/'+postId+'/');
        const read=await browserApi(a,'/api/forum/comments?post_id='+postId);
        if(read.status!==200){const e=Error('COMMENT_READ_HTTP_FAILURE');e.safeEvidence={httpStatus:read.status,message:sanitizeSupabaseStartDiagnosticText(String(read.data.error??'')).slice(0,140)};throw e;}
        const reply=a.getByRole('button',{name:/^Reply|^回复/}).first();await reply.click();
        const form=a.locator('.comment-reply-form .comment-form');await form.locator('textarea').fill('Local E2E nested reply '+s.runId);
        const response=responseFor(a,r=>new URL(r.url()).pathname==='/api/forum/comments'&&r.request().method()==='POST');
        await form.locator('button[type=submit]').click();await assertResponse(await response,'REPLY_HTTP_FAILURE');
        assert.equal(await dbCount('comments',`post_id=${q(postId)} and parent_id is not null and body=${q('Local E2E nested reply '+s.runId)}`),1);return {uiReplyAndDatabaseParentVerified:true};
      });
      await check('LIKE_UI',async()=>{
        await goto(a,'/posts/'+postId+'/');const like=a.locator('button[title="Like"],button[title="点赞"]').first();
        await like.click();await a.waitForFunction(()=>document.querySelector('.community-social-actions button')?.getAttribute('aria-pressed')==='true');
        assert.equal(await dbCount('post_votes',`post_id=${q(postId)} and user_id=${q(s.actors.A.id)}`),1);return {uiPressedAndBackendVoteVerified:true};
      });
      await check('CIRCLE_CREATE_UI',async()=>{
        await goto(a,'/circles/new/');const form=a.locator('form.create-circle-form');
        await form.locator('input:not([type=hidden]):not([type=file])').fill('Local E2E '+s.runId);
        await form.locator('textarea').fill('Disposable browser-created circle.');
        const response=responseFor(a,r=>new URL(r.url()).pathname==='/api/forum/circles'&&r.request().method()==='POST');
        await form.locator('button[type=submit]').click();await assertResponse(await response,'CIRCLE_CREATE_HTTP_FAILURE');
        assert.equal(await dbCount('circles',`name=${q('Local E2E '+s.runId)} and owner_id=${q(s.actors.A.id)}`),1);return {uiCreatedAndOwnerVerified:true};
      });
      await check('CIRCLE_EDIT_UI',async()=>{
        await goto(a,'/circles/'+circleSlug+'/manage/');
        const panel=a.locator('.circle-manage-panel').first();await panel.locator('input[type=text],input:not([type])').first().fill('Local E2E edited '+s.runId);
        await panel.locator('textarea').fill('Edited through the real owner interface.');
        const response=responseFor(a,r=>new URL(r.url()).pathname.endsWith('/manage')&&r.request().method()==='PATCH');
        await panel.getByRole('button',{name:/Save circle|保存圈子/}).click();await assertResponse(await response,'CIRCLE_EDIT_HTTP_FAILURE');
        assert.equal(await dbCount('circles',`id=${q(circleId)} and name=${q('Local E2E edited '+s.runId)}`),1);return {uiEditedAndDatabaseVerified:true};
      });
      await check('OTHER_USER_POST_DELETE_DENIED',async()=>{
        if(!passed('BROWSER_LOGIN_B'))throw block('BROWSER_LOGIN_B_NOT_PASSED');
        const before=await dbCount('posts',`id=${q(postId)} and status='published'`);
        const r=await browserApi(b,'/api/forum/posts?id='+postId,'DELETE');assert.equal(r.status,403,'CROSS_USER_DELETE_NOT_DENIED');
        assert.equal(await dbCount('posts',`id=${q(postId)} and status='published'`),before);return {httpStatus:r.status,originalRowUnchanged:true};
      },'permissions');
      await check('NOTIFICATIONS_UI',async()=>{
        await goto(a,'/notifications/');await a.locator('main').first().waitFor();
        const r=await browserApi(a,'/api/users/me/notifications?limit=50');if(r.status===404)throw block('NOTIFICATION_ROUTE_NEEDS_MAPPING');
        assert.equal(r.status,200);return {pageAndBackendRead:true,deliveryNotYetProven:true};
      });
      await check('REPORT_UI',async()=>{
        await goto(b,'/posts/'+postId+'/');await b.getByRole('button',{name:/^Report$|^举报$/}).first().click();
        const dialog=b.getByRole('dialog');await dialog.locator('.glass-choice').first().click();await dialog.locator('textarea').fill('Disposable local report for moderation testing.');
        const response=responseFor(b,r=>new URL(r.url()).pathname.includes('/reports')&&r.request().method()==='POST');
        await dialog.getByRole('button',{name:/Submit report|提交举报/}).click();await assertResponse(await response,'REPORT_HTTP_FAILURE');
        assert.equal(await dbCount('reports',`reporter_id=${q(s.actors.B.id)} and target_id=${q(postId)}`),1);return {realUiReportAndDatabaseVerified:true};
      });
      await check('ADMIN_HIDE_POST_UI',async()=>{
        const p=pages.ADMIN;await goto(p,'/posts/'+postId+'/');await p.getByRole('button',{name:/^Hide post$|^隐藏帖子$/}).click();
        const dialog=p.getByRole('dialog'),response=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/posts'&&r.request().method()==='PATCH',{timeout:12000});
        await dialog.getByRole('button',{name:/Confirm hide|确认隐藏/}).click();await assertResponse(await response,'ADMIN_HIDE_HTTP_FAILURE');
        assert.equal(await dbCount('posts',`id=${q(postId)} and status='hidden'`),1);return {realUiModerationAndDatabaseVerified:true};
      });
      await check('POST_DELETE_UI',async()=>{
        if(!createdPostId)throw block('CREATED_POST_UNAVAILABLE');
        await goto(a,'/posts/'+createdPostId+'/');await a.getByRole('button',{name:/^Delete post$|^删除帖子$/}).click();
        const dialog=a.getByRole('alertdialog'),response=responseFor(a,r=>new URL(r.url()).pathname==='/api/forum/posts'&&r.request().method()==='DELETE');
        await dialog.getByRole('button',{name:/Confirm delet(?:e|ion)|确认删除/}).click();await assertResponse(await response,'POST_DELETE_HTTP_FAILURE');
        assert.equal(await dbCount('posts',`id=${q(createdPostId)} and status='deleted'`),1);return {realUiDeleteAndDatabaseVerified:true};
      });
      for(const width of [390,430])await check('FEED_LAYOUT_'+width,async()=>{
        await a.setViewportSize({width,height:932});await goto(a,'/feed/');
        assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'FEED_HORIZONTAL_OVERFLOW');
        await a.screenshot({path:path.join(out,'feed-'+width+'.png'),fullPage:true,mask:[a.getByText(/@example\.invalid/)]});
        await a.setViewportSize({width:1440,height:1000});return {width,realAuthenticatedFeed:true,noHorizontalOverflow:true};
      });
    }
    for(const route of ['/','/feed/?sort=latest','/feed/?sort=hot','/products/','/products/xreal/xreal-air/','/circles/'+circleSlug+'/','/admin/devices/','/admin/forum/','/admin/reports/','/admin/media/','/admin/news/','/admin/users/','/admin/circles/'])await check('PAGE_'+route,async()=>{
      const p=route.startsWith('/admin/')?pages.ADMIN:pages.A;const r=await goto(p,route);assert.equal(r.status(),200);await p.locator('main').first().waitFor();return {httpStatus:200,pageRendered:true};
    },'pages');
    for(const width of [1440,390,430])await check('RESPONSIVE_'+width,async()=>{
      const c=await newContext(width),p=await c.newPage();try{await goto(p,'/login/');await p.getByRole('button',{name:'Log in',exact:true}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'HORIZONTAL_OVERFLOW');await p.screenshot({path:path.join(out,'login-'+width+'.png'),fullPage:true});return {width,noHorizontalOverflow:true};}finally{await c.close();}
    },'ui');
    await check('REAL_LINK_NAVIGATION_NO_HMR',async()=>{
      const c=await newContext(),p=await c.newPage();try{await goto(p,'/login/');await Promise.all([p.waitForURL(origin+'/privacy/',{waitUntil:'domcontentloaded'}),p.getByRole('link',{name:'Privacy',exact:true}).click()]);assert.equal(await p.locator('main h1').first().textContent(),'Privacy Policy');return {realLinkClick:true,viteHmrAbsent:true};}finally{await c.close();}
    },'ui');
    for(const actor of ['A','B','ADMIN'])await check('LOGOUT_'+actor,async()=>{
      if(!passed('BROWSER_LOGIN_'+actor))throw block('BROWSER_LOGIN_NOT_PASSED');const p=pages[actor];await goto(p,'/settings/');
      await p.getByRole('button',{name:/^Logout$|^Log out$|^Sign out$|^退出登录$/}).click();await p.waitForFunction(k=>!JSON.parse(localStorage.getItem(k)||'null')?.access_token,storageKey);
      return {uiLogout:true,browserSessionRemoved:true};
    },'auth');
    for(const [id,reason] of Object.entries({POST_EDIT_UI:'UI_WORKFLOW_NOT_YET_EXECUTED',IMAGE_VIDEO_UPLOAD:'LOCAL_R2_SIGNING_AND_MEDIA_SERVICE_NOT_CONFIGURED'}))report.results.push({id,family:'business',status:'BLOCKED',reason});
  } catch(e) {
    report.environmentBlocker=e.message?.match(/^[A-Z][A-Z0-9_:-]{1,100}$/)?.[0]??'LOCAL_RUNTIME_SETUP_FAILED';
    report.sqlDiagnostic=e.stderr?.match(/ERROR:\s+([^\r\n]+)/)?.[1]?.replace(/'[^']*'|"[^"]*"|[a-f0-9]{8}-[a-f0-9-]{27}/gi,'[LOCAL_IDENTIFIER]').slice(0,160);
    console.log(JSON.stringify({environmentBlocker:report.environmentBlocker,sqlDiagnostic:report.sqlDiagnostic}));
  } finally {
    if(r2)await r2.finalize();
    if(browser)await browser.close();if(worker)await worker.dispose();
    for(const client of Object.values(clients))await client.auth.signOut();
    report.cleanup='BROWSERS_AND_WORKER_CLOSED_DATABASE_CLEANUP_BY_CALLER';
    const packet=JSON.parse(await fs.readFile(path.join(root,'tools/e-verify-group1-manual-recovery-v19/artifacts/PACKET_NOT_AUTHORIZED.json'),'utf8'));
    const requirements={
      'AUTH-02':['BROWSER_LOGIN_A','BROWSER_PERSISTENCE_A','LOGOUT_A'], 'AUTH-03':['BROWSER_LOGIN_B','BROWSER_PERSISTENCE_B','LOGOUT_B','THREE_CONTEXT_ISOLATION'],
      'AUTH-04':['BROWSER_LOGIN_ADMIN','ADMIN_API_ADMIN','LOGOUT_ADMIN'], 'RLS-01':catalogSteps().filter(x=>x.actor==='anon').map(x=>x.id),
      'RLS-02':catalogSteps().filter(x=>x.actor!=='anon'&&['legacy','audit'].includes(x.kind)).map(x=>x.id),
      'RLS-03':catalogSteps().filter(x=>x.actor!=='anon'&&!['legacy','audit'].includes(x.kind)).map(x=>x.id),
      'RLS-04':['PAGE_/products/xreal/xreal-air/'], 'RLS-05':['ADMIN_API_A','ADMIN_API_B','ADMIN_API_ADMIN'],
      'ADMIN-04:devices-read-partial':['PAGE_/admin/devices/','PAGE_/admin/forum/','PAGE_/admin/reports/','PAGE_/admin/media/','PAGE_/admin/news/','PAGE_/admin/users/','PAGE_/admin/circles/'],
      'UI-02:core-partial':['RESPONSIVE_1440','RESPONSIVE_390','RESPONSIVE_430','FEED_LAYOUT_390','FEED_LAYOUT_430','CONTENT_MEDIA_FOCUS_ACCESSIBILITY_COMPLETE'], 'UI-03:core-partial':['REAL_LINK_NAVIGATION_NO_HMR','CONSOLE_CSP_EMPTY_LOADING_STATES_COMPLETE']};
    report.group1=packet.caseMappings.map(c=>({id:c.caseId,scope:'LOCAL_ANALOGUE_ONLY_NOT_PRODUCTION_ACCEPTANCE',status:requirements[c.caseId]?.every(passed)?'PASS':'BLOCKED',
      reason:c.caseId==='AUTH-01'?'REAL_PRODUCTION_CAPTCHA_NOT_TESTED':!requirements[c.caseId]?'CASE_EVIDENCE_NOT_COMPLETE':undefined}));
    report.summary={results:report.results.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{}),originalRls16Passed:report.results.filter(x=>x.family==='original16Rls'&&x.status==='PASS').length,
      originalRlsPlan:{anonymous:6,authenticatedAandB:10},group1LocalAnaloguesPassed:report.group1.filter(x=>x.status==='PASS').length};
    const forbidden=Object.values(s.actors).flatMap(a=>[a.email,a.password]).concat(s.status.SERVICE_ROLE_KEY,s.status.ANON_KEY).filter(Boolean);
    const serialized=JSON.stringify(report,null,2);
    if(forbidden.some(value=>serialized.includes(value)))throw Error('SAFE_REPORT_SECRET_REJECTED');
    report.sensitiveValueCheck='PASS';
    await fs.writeFile(path.join(out,'RESULTS_SAFE.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({artifact:path.relative(root,out),summary:report.summary,productionRequests:0,productionWrites:0}));
  }
  return {failed:report.results.some(x=>x.status==='FAIL')};
}
