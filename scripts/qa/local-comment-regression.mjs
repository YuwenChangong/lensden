import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {catalogSteps} from '../../tools/e-verify-group1-login-diagnostics/execution/group1/rls.mjs';
import {verifyLocalCatalog} from './local-rls-assertions.mjs';

export async function runCommentRegression(h) {
  const {s,root,out,sql,report,localFetch,readTable,dbCount,browserApi,responseFor,goto,pages,newContext,postId,circleId,sessions}=h;
  const followup=process.env.OGH_E2E_COMMENT_FOLLOWUP==='1';
  const followupIds=new Set(['COMMENT_CREATE_A_UI','COMMENT_REPLY_A_UI','COMMENT_REPLY_B_UI','REACTION_AGGREGATES_BY_VIEWER','REACTION_PRIVATE_CIRCLE_DENIED','COMMENT_CROSS_USER_DELETE_DENIED','COMMENT_SOFT_DELETE_WITH_REPLY_UI','ADMIN_COMMENT_DELETE_UI','ADMIN_COMMENT_DELETE_API']);
  const check=(id,fn,family)=>!followup||followupIds.has(id)?h.check(id,fn,family):undefined;
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const scalar=async query=>(await sql(s,query)).stdout.trim().split(/\r?\n/)[0];
  const comment=async(body,status='published',moderation='published',parent=null,target=postId)=>scalar(`insert into public.comments(post_id,author_id,parent_id,body,status,moderation_status) values(${q(target)},${q(s.actors.A.id)},${parent?q(parent):'null'},${q(body)},${q(status)},${q(moderation)}) returning id;`);
  const seedId=await comment('Local regression seed '+s.runId);
  const before=await scalar("select coalesce(jsonb_agg(to_jsonb(p) order by policyname)::text,'[]') from pg_policies p where schemaname='public' and tablename='comment_reactions';");
  const hasRead=await scalar("select has_column_privilege('authenticated','public.comment_reactions','comment_id','SELECT');");
  await check('COMMENT_MIGRATION_RED_GREEN',async()=>{
    let preFix=null;
    if(hasRead==='f') {
      const r=await browserApi(pages.A,'/api/forum/comments?post_id='+postId);
      assert.equal(r.status,500);
      assert.equal(r.data.error,'permission denied for table comment_reactions');
      preFix={httpStatus:500,messageClass:'REACTION_TABLE_PERMISSION_DENIED'};
    }
    const file='20261015072723_restore_comment_reaction_application_privileges.sql';
    const migration=await fs.readFile(path.join(root,'supabase/migrations',file),'utf8');
    if(hasRead==='f') await sql(s,migration);
    const after=await scalar("select coalesce(jsonb_agg(to_jsonb(p) order by policyname)::text,'[]') from pg_policies p where schemaname='public' and tablename='comment_reactions';");
    assert.equal(after,before,'RLS_POLICY_CHANGED');
    assert.equal(await scalar("select relrowsecurity from pg_class where oid='public.comment_reactions'::regclass;"),'t');
    const r=await browserApi(pages.A,'/api/forum/comments?post_id='+postId);
    assert.equal(r.status,200,'COMMENT_GET_STILL_FAILS');
    return {preFix,postFixHttpStatus:200,rlsPoliciesUnchanged:true,migration:file,migrationSha256:createHash('sha256').update(migration).digest('hex')};
  },'migration');
  await check('REACTION_LEAST_PRIVILEGE_ACL',async()=>{
    const result=await scalar(`select
      has_column_privilege('anon','public.comment_reactions','comment_id','SELECT') and
      has_column_privilege('authenticated','public.comment_reactions','id','SELECT') and
      has_column_privilege('authenticated','public.comment_reactions','reaction_type','INSERT') and
      has_table_privilege('authenticated','public.comment_reactions','DELETE') and
      not has_any_column_privilege('anon','public.comment_reactions','INSERT') and
      not has_table_privilege('anon','public.comment_reactions','DELETE') and
      not has_any_column_privilege('authenticated','public.comment_reactions','UPDATE') and
      not has_column_privilege('authenticated','public.comment_reactions','created_at','INSERT') and
      not has_table_privilege('service_role','public.comment_reactions','SELECT');`);
    assert.equal(result,'t');return {noAnonymousWrite:true,noUpdateGrant:true,noTimestampInjection:true,noServiceRoleGrant:true};
  },'permissions');
  for(const actor of ['A','B','ADMIN']) await check('COMMENT_LIST_'+actor,async()=>{
    const r=await browserApi(pages[actor],'/api/forum/comments?post_id='+postId);
    assert.equal(r.status,200);assert.ok(r.data.comments.some(c=>c.id===seedId));
    assert.ok(r.data.comments.every(c=>typeof c.like_count==='number'&&typeof c.liked_by_me==='boolean'&&!Object.hasOwn(c,'reactions')));
    return {httpStatus:200,actualPublishedCommentVisible:true,aggregatesOnly:true};
  },'comments');
  const anonContext=await newContext(),anon=await anonContext.newPage();
  try {
    await goto(anon,'/posts/'+postId+'/');
    await check('COMMENT_LIST_ANON',async()=>{
      const r=await browserApi(anon,'/api/forum/comments?post_id='+postId);
      assert.equal(r.status,200);assert.ok(r.data.comments.some(c=>c.id===seedId));
      assert.ok(r.data.comments.every(c=>c.liked_by_me===false));return {httpStatus:200,publicCommentsOnly:true};
    },'comments');
  } finally {await anonContext.close();}
  const submit=async(p,body,parentId)=>{
    await goto(p,'/posts/'+postId+'/');
    if(parentId) await p.locator('#comment-'+parentId).getByRole('button',{name:/^Reply|^回复/}).click();
    const form=parentId?p.locator('.comment-reply-form .comment-form'):p.locator('.comment-form').first();
    await form.locator('textarea').fill(body);
    const waiting=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/comments'&&r.request().method()==='POST');
    await form.locator('button[type=submit]').click();const r=await waiting;
    assert.equal(r.status(),201,'COMMENT_WRITE_STATUS');
    const actor=p===pages.A?'A':'B';
    const id=await scalar(`select id from public.comments where post_id=${q(postId)} and author_id=${q(s.actors[actor].id)} and body=${q(body)};`);
    assert.match(id,/^[a-f0-9-]{36}$/);
    assert.equal(await dbCount('comments',`id=${q(id)} and ${parentId?'parent_id='+q(parentId):'parent_id is null'}`),1);
    await p.locator('#comment-'+id).waitFor();return id;
  };
  let aComment,aReply,bReply;
  await check('COMMENT_CREATE_A_UI',async()=>{aComment=await submit(pages.A,'Local A comment '+s.runId);return {uiAndDatabaseVerified:true};},'comments');
  await check('COMMENT_REPLY_A_UI',async()=>{assert.ok(aComment);aReply=await submit(pages.A,'Local A reply '+s.runId,aComment);return {uiAndParentRelationVerified:true};},'comments');
  await check('COMMENT_REPLY_B_UI',async()=>{assert.ok(aComment);bReply=await submit(pages.B,'Local B reply '+s.runId,aComment);return {uiAndOtherAuthorVerified:true};},'comments');
  const toggle=async(actor,liked,count)=>{
    const p=pages[actor];await goto(p,'/posts/'+postId+'/');
    const item=p.locator('#comment-'+seedId);
    const waiting=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/comments'&&r.request().method()==='PUT');
    await item.getByRole('button',{name:liked?'Like':'Unlike',exact:true}).click();
    const r=await waiting;assert.equal(r.status(),200,'REACTION_TOGGLE_HTTP_STATUS');
    const body=await r.json();assert.equal(body.liked,liked);assert.equal(body.like_count,count);
    assert.equal(await dbCount('comment_reactions',`comment_id=${q(seedId)}`),count);
    await item.getByRole('button',{name:liked?'Unlike':'Like',exact:true}).waitFor();
    return {uiAndDatabaseVerified:true,liked,likeCount:count};
  };
  await check('COMMENT_LIKE_A_UI',()=>toggle('A',true,1),'comments');
  await check('COMMENT_LIKE_B_UI',()=>toggle('B',true,2),'comments');
  const rest=async(actor,method,query,body)=>{
    const r=await localFetch('/rest/v1/comment_reactions?'+query,{method,headers:{apikey:s.status.ANON_KEY,...(actor==='anon'?{}:{Authorization:'Bearer '+sessions[actor].access_token}),'content-type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,data:await r.json().catch(()=>null)};
  };
  await check('REACTION_AGGREGATES_BY_VIEWER',async()=>{
    if(followup) for(const actor of ['A','B']) {
      const r=await rest(actor,'POST','select=id',{comment_id:seedId,user_id:s.actors[actor].id,reaction_type:'like'});
      assert.equal(r.status,201);
    }
    for(const actor of ['A','B','ADMIN']) {
      const r=await browserApi(pages[actor],'/api/forum/comments?post_id='+postId),row=r.data.comments.find(c=>c.id===seedId);
      assert.equal(r.status,200);assert.equal(row.like_count,2);assert.equal(row.liked_by_me,actor!=='ADMIN');
      assert.ok(!Object.hasOwn(row,'reactions'));
    }
    const c=await newContext(),p=await c.newPage();
    try {
      await goto(p,'/posts/'+postId+'/');const r=await browserApi(p,'/api/forum/comments?post_id='+postId),row=r.data.comments.find(c=>c.id===seedId);
      assert.equal(r.status,200);assert.equal(row.like_count,2);assert.equal(row.liked_by_me,false);
    } finally {await c.close();}
    return {fourViewerCountsVerified:true,likedByMeIdentityBound:true,anonymousGetsCountsNotRawReactions:true};
  },'comments');
  await check('REACTION_PRIVATE_CIRCLE_DENIED',async()=>{
    const id=await scalar(`insert into public.circles(slug,name,description,type,owner_id) values('rls-test-circle','RLS test private fixture','Local only','topic',${q(s.actors.A.id)}) returning id;`);
    const post=await scalar(`insert into public.posts(author_id,circle_id,type,title,body,status) values(${q(s.actors.A.id)},${q(id)},'question','Reserved fixture','Local only','published') returning id;`);
    const target=await comment('Reserved circle comment','published','published',null,post);
    await sql(s,`insert into public.comment_reactions(comment_id,user_id) values(${q(target)},${q(s.actors.A.id)});`);
    for(const actor of ['anon','A','B','ADMIN']) {
      const r=await rest(actor,'GET','select=comment_id,user_id&comment_id=eq.'+target);
      assert.equal(r.status,200);assert.deepEqual(r.data,[]);
      if(actor!=='anon') {
        const denied=await rest(actor,'POST','select=id',{comment_id:target,user_id:s.actors[actor].id,reaction_type:'unauthorized'});
        assert.equal(denied.status,403);assert.equal(denied.data.code,'42501');
      }
    }
    return {reservedPrivateCircleExcludedForAllFourViewers:true,selfInsertDenied:true,realRlsEnforced:true};
  },'permissions');
  for(const actor of ['A','B','ADMIN']) await check('REACTION_CROSS_USER_'+actor,async()=>{
    const other=actor==='A'?'B':'A';
    const row=await scalar(`select id from public.comment_reactions where comment_id=${q(seedId)} and user_id=${q(s.actors[other].id)};`);
    assert.match(row,/^[a-f0-9-]{36}$/);
    const inserted=await rest(actor,'POST','select=id',{comment_id:seedId,user_id:s.actors[other].id,reaction_type:'unauthorized'});
    assert.equal(inserted.status,403);assert.equal(inserted.data.code,'42501');
    const removed=await rest(actor,'DELETE','id=eq.'+row+'&select=id');
    assert.equal(removed.status,200);assert.deepEqual(removed.data,[]);
    const updated=await rest(actor,'PATCH','id=eq.'+row+'&select=id',{reaction_type:'unauthorized'});
    assert.equal(updated.status,403);assert.equal(updated.data.code,'42501');
    assert.equal(await dbCount('comment_reactions',`id=${q(row)} and reaction_type='like'`),1);
    return {forgedInsertDenied:true,crossUserDeleteRows:0,updateDenied:true,otherRowUnchanged:true,serviceRoleUsed:false};
  },'permissions');
  await check('REACTION_ANON_WRITE_DENIED',async()=>{
    const r=await rest('anon','POST','select=comment_id',{comment_id:seedId,user_id:s.actors.A.id,reaction_type:'unauthorized'});
    assert.equal(r.status,401);assert.equal(r.data.code,'42501');return {httpStatus:401,code:'42501'};
  },'permissions');
  const hiddenPost=await scalar(`insert into public.posts(author_id,circle_id,type,title,body,status) values(${q(s.actors.A.id)},${q(circleId)},'question','Local hidden fixture','Hidden local fixture','hidden') returning id;`);
  const hiddenTargets=[await comment('Hidden comment','hidden'),await comment('Pending comment','pending','pending_review'),await comment('Deleted comment','deleted'),await comment('Comment under hidden post','published','published',null,hiddenPost)];
  for(const id of hiddenTargets) await sql(s,`insert into public.comment_reactions(comment_id,user_id) values(${q(id)},${q(s.actors.A.id)});`);
  for(const actor of ['anon','A','B','ADMIN']) await check('REACTION_VISIBILITY_'+actor,async()=>{
    const r=await rest(actor,'GET','select=comment_id,user_id&comment_id=in.('+hiddenTargets.join(',')+')');
    assert.equal(r.status,200);assert.deepEqual(r.data,[]);
    if(actor!=='anon') {
      const denied=await rest(actor,'POST','select=id',{comment_id:hiddenTargets[0],user_id:s.actors[actor].id,reaction_type:'like'});
      assert.equal(denied.status,403);assert.equal(denied.data.code,'42501');
    }
    return {hiddenPendingDeletedAndHiddenPostExcluded:true,rlsEnforced:true,serviceRoleUsed:false};
  },'permissions');
  await check('COMMENT_UNLIKE_A_UI',()=>toggle('A',false,1),'comments');
  await check('COMMENT_UNLIKE_B_UI',()=>toggle('B',false,0),'comments');
  await check('COMMENT_CROSS_USER_DELETE_DENIED',async()=>{
    assert.ok(aComment);const r=await browserApi(pages.B,'/api/forum/comments?id='+aComment,'DELETE');
    assert.equal(r.status,403);assert.equal(await dbCount('comments',`id=${q(aComment)} and status='published'`),1);return {httpStatus:403,rowUnchanged:true};
  },'permissions');
  const deleteComment=async(actor,id)=>{
    const p=pages[actor];await goto(p,'/posts/'+postId+'/');
    await p.locator('#comment-'+id).getByRole('button',{name:actor==='ADMIN'?'Remove as moderator':'Delete',exact:true}).click();
    const waiting=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/comments'&&r.request().method()==='DELETE');
    await p.getByRole('alertdialog').getByRole('button',{name:/Confirm delet(?:e|ion)|确认删除/}).click();
    assert.equal((await waiting).status(),200);assert.equal(await dbCount('comments',`id=${q(id)} and status='deleted'`),1);
  };
  await check('COMMENT_SOFT_DELETE_WITH_REPLY_UI',async()=>{
    assert.ok(aComment&&bReply);
    const liked=await rest('B','POST','select=id',{comment_id:aComment,user_id:s.actors.B.id,reaction_type:'like'});
    assert.equal(liked.status,201);
    await deleteComment('A',aComment);
    const reactions=await rest('B','GET','select=id&comment_id=eq.'+aComment);
    assert.equal(reactions.status,200);assert.deepEqual(reactions.data,[]);
    await goto(pages.B,'/posts/'+postId+'/');
    const r=await browserApi(pages.B,'/api/forum/comments?post_id='+postId);
    assert.equal(r.status,200);
    const parentPresent=r.data.comments.some(c=>c.id===aComment&&c.status==='deleted');
    const replyPresent=r.data.comments.some(c=>c.id===bReply&&c.status==='published');
    if(!parentPresent||!replyPresent) {
      const e=Error('DELETED_PARENT_REPLY_THREAD_INCOMPLETE');
      e.safeEvidence={httpStatus:r.status,deletedParentVisibleToB:parentPresent,publishedReplyReturnedToB:replyPresent,
        databaseReplyStillPublished:await dbCount('comments',`id=${q(bReply)} and status='published'`)===1,
        browserReplyVisible:await pages.B.locator('#comment-'+bReply).count()>0,deletedCommentReactionsHidden:true};
      throw e;
    }
    return {uiSoftDeleteVerified:true,replySurvives:true,placeholderAndReactionReadHealthy:true};
  },'comments');
  await check('ADMIN_COMMENT_DELETE_UI',async()=>{
    await goto(pages.ADMIN,'/posts/'+postId+'/');
    const r=await browserApi(pages.ADMIN,'/api/forum/comments?post_id='+postId);
    assert.equal(r.status,200);const row=r.data.comments.find(c=>c.id===seedId);assert.ok(row);
    const role=await scalar(`select role from public.profiles where id=${q(s.actors.ADMIN.id)};`);assert.equal(role,'admin');
    if(!row.can_delete) {
      const e=Error('ADMIN_COMMENT_DELETE_UI_HIDDEN');e.safeEvidence={httpStatus:200,verifiedRole:'admin',apiCanDelete:false};throw e;
    }
    await deleteComment('ADMIN',seedId);return {existingAdminPermissionVerified:true};
  },'comments');
  await check('ADMIN_COMMENT_DELETE_API',async()=>{
    const r=await browserApi(pages.ADMIN,'/api/forum/comments?id='+seedId,'DELETE');assert.equal(r.status,200);
    assert.equal(await dbCount('comments',`id=${q(seedId)} and status='deleted'`),1);
    return {httpStatus:200,existingServerAdminPermissionVerified:true,notUiAcceptance:true};
  },'permissions');
  await check('POST_DELETE_UI',async()=>{
    const p=pages.A;await goto(p,'/posts/'+postId+'/');
    await p.getByRole('button',{name:/^Delete post$|^删除帖子$/}).click();
    const waiting=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/posts'&&r.request().method()==='DELETE');
    await p.getByRole('alertdialog').getByRole('button',{name:/Confirm delet(?:e|ion)|确认删除/}).click();
    assert.equal((await waiting).status(),200);assert.equal(await dbCount('posts',`id=${q(postId)} and status='deleted'`),1);
    return {realUiDeleteAndDatabaseVerified:true};
  });
  for(const actor of ['A','B']) await check('OWN_PRIVATE_RLS_'+actor,async()=>{
    const other=actor==='A'?'B':'A';
    const own=await readTable(actor,'legal_policy_acceptances','select=user_id&user_id=eq.'+s.actors[actor].id);
    const denied=await readTable(actor,'legal_policy_acceptances','select=user_id&user_id=eq.'+s.actors[other].id);
    assert.equal(own.status,200);assert.deepEqual(own.data.map(r=>r.user_id),[s.actors[actor].id]);
    assert.equal(denied.status,200);assert.deepEqual(denied.data,[]);
    return {ownRows:1,crossUserRows:0,serviceRoleUsed:false};
  },'additionalRls');
  await check('ANON_PRIVATE_RLS',async()=>{
    const r=await localFetch('/rest/v1/legal_policy_acceptances?select=user_id',{headers:{apikey:s.status.ANON_KEY}}),data=await r.json();
    assert.ok([401,403].includes(r.status));assert.equal(data.code,'42501');return {code:'42501',serviceRoleUsed:false};
  },'additionalRls');
  for(const step of catalogSteps().filter(x=>['RLS_ANON_LEGACY','RLS_ANON_AUDIT'].includes(x.id))) await check(step.id,async()=>{
    const r=await localFetch(step.path,{headers:{apikey:s.status.ANON_KEY}}),body=Buffer.from(await r.text());
    verifyLocalCatalog(step,{status:r.status,body});const data=JSON.parse(body);
    return {httpStatus:r.status,code:data.code,hintPresent:typeof data.hint==='string'&&data.hint.length>0,rowsReturned:false,serviceRoleUsed:false};
  },'original16Rls');
  const rlsPassed=report.results.filter(x=>x.family==='original16Rls'&&x.status==='PASS').length;
  await fs.writeFile(path.join(out,'COMMENT_SCOPE_SAFE.json'),JSON.stringify({
    scope:followup?'BOUNDED_DELETE_FOLLOWUP_LOCAL_ONLY':'TARGETED_LOCAL_ONLY',originalRls:{newlyRun:followup?0:2,newlyPassed:rlsPassed,unaffectedPriorPass:14,previousEvidence:'196ab48ea0aa',totalPassedWithReusedEvidence:14+rlsPassed},
    group1:{newlyClosed:rlsPassed===2?'RLS-01_LOCAL':null,totalLocalCases:6+(rlsPassed===2?1:0),total:14,otherSixReusedFromPriorEvidence:true},
    edit:{status:'BLOCKED',reason:'NO_OWNER_POST_OR_COMMENT_EDIT_UI_OR_CONTENT_UPDATE_API_IN_CURRENT_SOURCE'},
    media:{status:'BLOCKED',reason:'LOCAL_R2_NOT_CONFIGURED'},productionParity:'UNKNOWN',productionRequests:0,productionWrites:0
  },null,2)+'\n');
}
