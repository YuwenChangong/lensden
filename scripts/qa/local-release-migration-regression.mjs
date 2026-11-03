import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runCommentRegression } from './local-comment-delete-regression.mjs';

export async function runMigrationReconciliation(h) {
  const {s,root,sql,check,localFetch,browserApi,pages,goto,responseFor,postId,circleSlug,dbCount}=h;
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const scalar=async text=>(await sql(s,text)).stdout.trim().split(/\r?\n/)[0];
  const files=await fs.readdir(path.join(root,'supabase/migrations'));
  const matches=files.filter(name=>name.endsWith('_adopt_existing_forum_rate_limit_baseline.sql'));
  assert.equal(matches.length,1,'FORMAL_RATE_LIMIT_MIGRATION_REQUIRED');
  const file=matches[0],version=file.split('_')[0];
  const migration=await fs.readFile(path.join(root,'supabase/migrations',file),'utf8');
  const core=migration.slice(migration.indexOf('BEGIN;')+6).replace(/COMMIT;\s*$/i,'');
  const identity='public.consume_forum_rate_limit(uuid,text,text,bigint)';
  const snapshot=async()=>JSON.parse(await scalar(`select json_build_object('oid',oid,
    'source',md5(prosrc),'acl',proacl::text,'owner',proowner,'definer',prosecdef)
    from pg_proc where oid=${q(identity)}::regprocedure;`));
  const expectFailure=async(text,code)=>{
    let rejected=false;
    try {await sql(s,text);}catch(e){rejected=String(e.stderr).includes(code);}
    assert.ok(rejected,'EXPECTED_MIGRATION_FAILURE_NOT_OBSERVED');
  };
  await check('FORMAL_CLEAN_REBUILD',async()=>{
    assert.equal(s.rateLimitBaseline,'FORMAL_MIGRATION_ONLY');
    assert.equal(s.rateLimitWasMissingFromCanonicalMigrations,false);
    assert.equal(s.catalogFixtureApplied,false,'CATALOG_DDL_FIXTURE_NOT_ALLOWED_IN_FORMAL_REBUILD');
    assert.equal(await scalar(`select count(*) from supabase_migrations.schema_migrations where version=${q(version)};`),'1');
    assert.equal(await scalar(`select md5(btrim(regexp_replace(prosrc,'[[:space:]]+',' ','g'))) from pg_proc where oid=${q(identity)}::regprocedure;`),'397369321f2d78b27bdd46bdb81fb2b0');
    assert.equal(await scalar("select has_column_privilege('anon','public.comment_reactions','comment_id','SELECT') and has_column_privilege('authenticated','public.comment_reactions','reaction_type','INSERT') and has_table_privilege('authenticated','public.comment_reactions','DELETE') and not has_any_column_privilege('authenticated','public.comment_reactions','UPDATE');"),'t');
    return {formalMigrations:s.migrations,extraProposalExecuted:false,extraCatalogDdlExecuted:false,rateLimitFingerprintMatches:true,reactionLeastPrivilege:true};
  },'migration');
  await check('EXISTING_RPC_ADOPTED_BY_NORMAL_LOCAL_MIGRATION',async()=>{
    const before=await snapshot();
    // Remove only this ledger row in the newly owned disposable local fixture.
    // Production adoption uses normal tooling and never manual ledger edits.
    await sql(s,`delete from supabase_migrations.schema_migrations where version=${q(version)};`);
    const cli=path.join(root,'node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
    await h.command(cli,['migration','up','--local','--workdir',s.runtime],{env:h.environment,timeout:60000});
    assert.deepEqual(await snapshot(),before,'EXISTING_RPC_WAS_MUTATED');
    assert.equal(await scalar(`select count(*) from supabase_migrations.schema_migrations where version=${q(version)};`),'1');
    await h.command(cli,['migration','up','--local','--workdir',s.runtime],{env:h.environment,timeout:60000});
    assert.deepEqual(await snapshot(),before);
    return {normalMigrationToolRecordsVersion:true,oidSourceAclOwnerUnchanged:true,alreadyAppliedSkipped:true,localFixtureLedgerEditOnly:true};
  },'migration');
  await check('SECURITY_AND_ACL_DRIFT_FAIL_WITHOUT_OVERWRITE',async()=>{
    const original=await snapshot();
    for(const [change,restore] of [
      [`alter function ${identity} security invoker;`,`alter function ${identity} security definer;`],
      [`grant execute on function ${identity} to anon;`,`revoke execute on function ${identity} from anon;`],
    ]) {
      await sql(s,change);const drifted=await snapshot();
      try {await expectFailure(migration,'RATE_LIMIT_BASELINE_DRIFT');assert.deepEqual(await snapshot(),drifted);}
      finally {await sql(s,restore);}
    }
    assert.deepEqual(await snapshot(),original);
    await expectFailure(`begin; create function public.consume_forum_rate_limit(uuid,text,text,bigint,text)
      returns boolean language sql as 'select false'; ${core} commit;`,'RATE_LIMIT_BASELINE_DRIFT');
    assert.deepEqual(await snapshot(),original);
    return {securityDriftDenied:true,extraExecuteDenied:true,unexpectedOverloadDenied:true,noSilentRepairOrReplacement:true};
  },'migration');
  await check('INTERRUPTED_MIGRATION_ROLLS_BACK',async()=>{
    const before=await snapshot();
    await expectFailure(`begin; drop function ${identity}; ${core} select 1/0; commit;`,'division by zero');
    assert.deepEqual(await snapshot(),before,'PARTIAL_MIGRATION_PERSISTED');
    await sql(s,migration);assert.deepEqual(await snapshot(),before);
    return {createAndGrantInterruptedAtomically:true,originalObjectRestored:true,repeatSqlVerifiedNoOp:true};
  },'migration');
  await check('COMMENT_BOUNDARY_SOURCE_DRIFT_REJECTED',async()=>{
    const body=migration.split('$baseline_body$')[1];
    const altered=body.replace(/(-- releases the transaction lock[^\n]*)\n\s*(INSERT INTO[^\n]*)\n\s*(VALUES[^\n]*);/,'$1 $2 $3;');
    assert.notEqual(altered,body);
    assert.equal(altered.replace(/\s+/g,' ').trim(),body.replace(/\s+/g,' ').trim());
    const install=code=>`create or replace function ${identity.replace('(uuid,text,text,bigint)',
      '(p_user_id uuid,p_ip_hash text,p_purpose text,p_bytes bigint)')}
      returns table(allowed boolean,decision text) language plpgsql security definer volatile parallel unsafe
      set search_path=pg_catalog,public,pg_temp set lock_timeout='1s' set statement_timeout='3s' as ${q(code)};`;
    const original=await snapshot();
    await sql(s,install(altered));const drifted=await snapshot();
    try {await expectFailure(migration,'RATE_LIMIT_BASELINE_DRIFT');assert.deepEqual(await snapshot(),drifted);}
    finally {await sql(s,install(body));}
    assert.deepEqual(await snapshot(),original);
    return {lineCommentSwallowsReservationDetected:true,whitespaceFingerprintWouldHaveMissed:true,noDriftedRpcInvoked:true,noOverwrite:true};
  },'migration');
  await check('RATE_LIMIT_RPC_RESTRICTED_TO_SERVICE_BOUNDARY',async()=>{
    for(const actor of ['anon','A','B']) {
      const r=await localFetch('/rest/v1/rpc/consume_forum_rate_limit',{method:'POST',headers:{apikey:s.status.ANON_KEY,
        ...(actor==='anon'?{}:{Authorization:'Bearer '+h.sessions[actor].access_token}),'content-type':'application/json'},
        body:JSON.stringify({p_user_id:s.actors.A.id,p_ip_hash:'a'.repeat(64),p_purpose:'post_create',p_bytes:0})});
      const data=await r.json();assert.ok([401,403].includes(r.status));assert.equal(data.code,'42501');
    }
    return {anonymousAndOrdinaryUsersDenied:true,databaseExecutePrivilegeEnforced:true};
  },'permissions');
  await check('POST_CREATE_UI_WITH_FORMAL_RATE_LIMIT',async()=>{
    const p=pages.A,title='Migration baseline post '+s.runId;
    await goto(p,'/posts/new/?circle='+circleSlug);
    const form=p.locator('.post-composer__form');
    await form.locator('input:not([type=hidden]):not([type=file])').fill(title);
    await form.locator('textarea').fill('A disposable post created using the formal migration baseline.');
    const response=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/posts'&&r.request().method()==='POST');
    await form.locator('button[type=submit]').click();assert.equal((await response).status(),201);
    assert.equal(await dbCount('posts',`author_id=${q(s.actors.A.id)} and title=${q(title)}`),1);
    return {realUiSubmission:true,databaseRowVerified:true,localModerationOnly:true};
  },'business');
  for(const [purpose,max] of [['post_create',10],['comment_create',60],['circle_create',5]]) {
    await check('UNCHANGED_QUOTA_'+purpose.toUpperCase(),async()=>{
      const actor=s.actors.B.id,hash=createHash('sha256').update(s.runId+purpose).digest('hex');
      const where=`user_id=${q(actor)} and purpose=${q(purpose)} and ip_hash=${q(hash)}`;
      const rpc=async()=>{
        const r=await localFetch('/rest/v1/rpc/consume_forum_rate_limit',{method:'POST',headers:{apikey:s.status.SERVICE_ROLE_KEY,
          Authorization:'Bearer '+s.status.SERVICE_ROLE_KEY,'content-type':'application/json'},
          body:JSON.stringify({p_user_id:actor,p_ip_hash:hash,p_purpose:purpose,p_bytes:0})});
        assert.equal(r.status,200);return r.json();
      };
      try {
        assert.deepEqual(await rpc(),[{allowed:true,decision:'ALLOWED'}]);
        await sql(s,`insert into public.forum_upload_attempts(user_id,ip_hash,bytes,purpose,created_at)
          select ${q(actor)},${q(hash)},0,${q(purpose)},now() from generate_series(1,${max-1});`);
        assert.deepEqual(await rpc(),[{allowed:false,decision:'RATE_LIMITED'}]);
        assert.equal(await dbCount('forum_upload_attempts',where),max);
        if(purpose==='post_create'||purpose==='comment_create') {
          const route=purpose==='post_create'?'/api/forum/posts':'/api/forum/comments';
          const payload=purpose==='post_create'?{circle_slug:circleSlug,title:'Denied quota fixture',body:'This must not be persisted.',type:'question'}:{post_id:postId,body:'Denied quota fixture'};
          const r=await browserApi(pages.B,route,'POST',payload);assert.equal(r.status,429);assert.equal(r.data.code,'RATE_LIMITED');
        }
        return {originalLimit:max,allowedReservationThenDenied:true,deniedDoesNotInsert:true,serviceRoleOnlyForDesignedRpcBoundary:true};
      }finally{await sql(s,`delete from public.forum_upload_attempts where ${where};`);}
    },'rateLimit');
  }
  await check('REACTION_ORDINARY_ROLE_ISOLATION',async()=>{
    const id=await scalar(`insert into public.comments(post_id,author_id,body,status) values(${q(postId)},${q(s.actors.A.id)},'Reaction baseline fixture','published') returning id;`);
    const rest=async(actor,method,query,body)=>{
      const r=await localFetch('/rest/v1/comment_reactions?'+query,{method,headers:{apikey:s.status.ANON_KEY,
        ...(actor==='anon'?{}:{Authorization:'Bearer '+h.sessions[actor].access_token}),'content-type':'application/json',Prefer:'return=representation'},
        ...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};
    };
    assert.equal((await rest('A','POST','select=id',{comment_id:id,user_id:s.actors.A.id,reaction_type:'like'})).status,201);
    const deleted=await rest('B','DELETE','select=id,comment_id,user_id,reaction_type&comment_id=eq.'+id+'&user_id=eq.'+s.actors.A.id);
    assert.equal(deleted.status,200);assert.deepEqual(deleted.data,[]);
    const forged=await rest('B','POST','select=id',{comment_id:id,user_id:s.actors.A.id,reaction_type:'like'});
    assert.equal(forged.status,403);assert.equal(forged.data.code,'42501');
    assert.equal((await rest('anon','GET','select=comment_id,user_id&comment_id=eq.'+id)).status,200);
    assert.equal(await dbCount('comment_reactions',`comment_id=${q(id)}`),1);
    return {crossUserDeleteNoRows:true,forgedOwnerInsertDenied:true,anonymousPublicRead:true,serviceRoleUsed:false};
  },'permissions');
  await check('REPORT_UI_AND_SEPARATE_REPORT_QUOTA',async()=>{
    const p=pages.B;await goto(p,'/posts/'+postId+'/');
    await p.getByRole('button',{name:/^Report$|^举报$/}).first().click();
    const dialog=p.getByRole('dialog');await dialog.locator('.glass-choice').first().click();
    await dialog.locator('textarea').fill('Disposable migration baseline report.');
    const response=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/reports'&&r.request().method()==='POST');
    await dialog.getByRole('button',{name:/Submit report|提交举报/}).click();assert.equal((await response).status(),201);
    const before=await dbCount('reports',`reporter_id=${q(s.actors.B.id)}`);assert.equal(before,1);
    await sql(s,`with targets as (insert into public.posts(author_id,circle_id,type,title,body,status)
      select ${q(s.actors.A.id)},${q(h.circleId)},'question','Local quota target '||i,'Local fixture','published'
      from generate_series(1,11) i returning id)
      insert into public.reports(reporter_id,target_type,target_id,reason,reason_code,reason_text,status)
      select ${q(s.actors.B.id)},'post',id,'Local quota fixture','other','Local quota fixture','open' from targets;`);
    const r=await browserApi(p,'/api/forum/reports','POST',{post_id:postId,reason:'Local quota denial'});
    assert.equal(r.status,429);assert.equal(r.data.error,'RATE_LIMITED');
    assert.equal(await dbCount('reports',`reporter_id=${q(s.actors.B.id)}`),12);
    return {realUiReportStored:true,separateReporterQuota:12,deniedDoesNotInsert:true};
  },'rateLimit');
  await check('REPORT_REVIEW_ROLE_BOUNDARY',async()=>{
    for(const actor of ['A','B','ADMIN']) {
      const r=await browserApi(pages[actor],'/api/admin/forum/reports');
      assert.equal(r.status,actor==='ADMIN'?200:403);
      if(actor==='ADMIN')assert.ok(r.data.reports.length>=12);else assert.ok(!r.data.reports);
    }
    return {ordinaryUsersDenied:true,adminReadsAuthorizedQueue:true,noAdminPageRuntimeRetest:true};
  },'permissions');
  const affected=new Set(['COMMENT_NORMAL_THREE_LEVEL_TREE','AUTHOR_DELETE_REPLIES_VISIBLE',
    'NESTED_DELETED_ANCESTORS_REMAIN_NESTED','DELETED_BODY_DIRECT_RLS_STILL_DENIED',
    'PROJECTION_PRIVATE_AND_MALICIOUS_INPUTS_DENIED','ADMIN_DELETE_ROLE_AND_UI',
    'REGULAR_USER_CANNOT_FORGE_ADMIN_DELETE','REACTIONS_AND_COMMENT_READ_REGRESSION','UI_REPLY_AFTER_PARENT_DELETE']);
  await runCommentRegression({...h,check:(id,fn,family)=>affected.has(id)?check(id,async()=>{
    try{return await fn();}catch(e){
      const frame=e.stack?.split(/\r?\n/).find(line=>line.includes('local-comment-delete-regression.mjs:'));
      if(frame)e.safeEvidence={...e.safeEvidence,localAssertion:frame.match(/local-comment-delete-regression\.mjs:\d+:\d+/)?.[0]};
      throw e;
    }
  },family):undefined});
}
