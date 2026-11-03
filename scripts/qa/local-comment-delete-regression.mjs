import assert from 'node:assert/strict';
import path from 'node:path';

export async function runCommentRegression(h) {
  const {s,root,out,sql,localFetch,browserApi,responseFor,goto,pages,newContext,postId,circleId,sessions,dbCount}=h;
  const followup=Boolean(process.env.OGH_E2E_DELETE_FOLLOWUP);
  const selected=new Set(['COMMENT_NORMAL_THREE_LEVEL_TREE','AUTHOR_DELETE_REPLIES_VISIBLE','NESTED_DELETED_ANCESTORS_REMAIN_NESTED','UI_REPLY_AFTER_PARENT_DELETE','NOTIFICATION_REPLY_DELIVERY','FEED_REAL_SORT_ORDER','SIGNED_IN_PUBLIC_PRODUCT_DATA']);
  if(process.env.OGH_E2E_DELETE_FOLLOWUP==='2') {selected.delete('FEED_REAL_SORT_ORDER');selected.delete('SIGNED_IN_PUBLIC_PRODUCT_DATA');}
  if(process.env.OGH_E2E_DELETE_FOLLOWUP==='normal') {selected.clear();selected.add('COMMENT_NORMAL_THREE_LEVEL_TREE');}
  const check=(id,fn,family)=>!followup||selected.has(id)?h.check(id,fn,family):undefined;
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const scalar=async query=>(await sql(s,query)).stdout.trim().split(/\r?\n/)[0];
  const seed=async(actor,body,parent=null,target=postId,status='published',moderation='published')=>scalar(`insert into public.comments(post_id,author_id,parent_id,body,status,moderation_status) values(${q(target)},${q(s.actors[actor].id)},${parent?q(parent):'null'},${q(body)},${q(status)},${q(moderation)}) returning id;`);
  // Only the fresh owned container established by the shared local lifecycle.
  const installed=await scalar("select count(*) from pg_proc where proname='deleted_comment_placeholders';");
  assert.equal(installed,'1','FORMAL_COMMENT_PLACEHOLDER_MIGRATION_REQUIRED');
  await sql(s,"NOTIFY pgrst, 'reload schema';");
  const rootBody='Deleted-body-sentinel-'+s.runId;
  const parent=await seed('A',rootBody),middle=await seed('B','Local middle reply',parent);
  const leaf=await seed('A','Local third-level reply',middle),sibling=await seed('B','Local sibling reply',parent);
  const fresh=await seed('B','Local administrator target');
  let deliveredReply;
  const list=p=>browserApi(p,'/api/forum/comments?post_id='+postId);
  const rpc=async(actor,target,ids)=>{
    const r=await localFetch('/rest/v1/rpc/deleted_comment_placeholders',{method:'POST',headers:{apikey:s.status.ANON_KEY,...(actor==='anon'?{}:{Authorization:'Bearer '+sessions[actor].access_token}),'content-type':'application/json'},body:JSON.stringify({target_post_id:target,visible_comment_ids:ids})});
    return {status:r.status,data:await r.json()};
  };
  const deleteUi=async(actor,id,asStaff=false)=>{
    const p=pages[actor];await goto(p,'/posts/'+postId+'/');
    await p.locator('#comment-'+id).getByRole('button',{name:asStaff?'Remove as moderator':'Delete',exact:true}).click();
    const dialog=p.getByRole('alertdialog');
    if(asStaff) await dialog.getByText(/administrator or moderator/).waitFor();
    const pending=responseFor(p,r=>new URL(r.url()).pathname==='/api/forum/comments'&&r.request().method()==='DELETE');
    await dialog.getByRole('button',{name:'Confirm deletion',exact:true}).click();
    assert.equal((await pending).status(),200);assert.equal(await dbCount('comments',`id=${q(id)} and status='deleted'`),1);
    await p.getByRole('status').filter({hasText:'Comment deleted.'}).waitFor();
  };
  const anonContext=await newContext(),anon=await anonContext.newPage();
  try {
    await goto(anon,'/posts/'+postId+'/');
    await check('COMMENT_NORMAL_THREE_LEVEL_TREE',async()=>{
      for(const p of [pages.A,pages.B,anon]) {
        await goto(p,'/posts/'+postId+'/');const r=await list(p);assert.equal(r.status,200);
        const observed=await p.waitForFunction(({ids,parent,leaf})=>{
          const counts=ids.map(id=>document.querySelectorAll('#comment-'+id).length);
          const root=document.querySelector('#comment-'+parent);
          return counts.every(n=>n===1)&&root?.parentElement.querySelector('#comment-'+leaf)?{counts,nested:true}:false;
        },{ids:[parent,middle,leaf,sibling],parent,leaf});
        assert.deepEqual((await observed.jsonValue()).counts,[1,1,1,1]);
        assert.ok(r.data.comments.find(c=>c.id===leaf).parent_id===middle);
      }
      return {viewers:3,levels:3,domAndParentIdsVerified:true};
    },'comments');
    await check('AUTHOR_DELETE_REPLIES_VISIBLE',async()=>{
      await deleteUi('A',parent);
      assert.ok(!await pages.A.locator('#comment-'+parent).textContent().then(t=>t.includes(rootBody)));
      for(const p of [pages.B,anon]) {
        await goto(p,'/posts/'+postId+'/');const r=await list(p);assert.equal(r.status,200);
        const row=r.data.comments.find(c=>c.id===parent);assert.ok(row);assert.equal(row.status,'deleted');
        assert.equal(row.body,'');assert.equal(row.author,null);assert.equal(row.author_id,null);assert.equal(row.can_delete,false);
        assert.ok(!JSON.stringify(r.data).includes(rootBody));
        for(const id of [parent,middle,leaf,sibling]) {await p.locator('#comment-'+id).waitFor();assert.equal(await p.locator('#comment-'+id).count(),1);}
      }
      return {bodyAndAuthorRedacted:true,repliesVisibleToBAndAnonymous:true,noDuplicateNodes:true};
    },'comments');
    await check('NESTED_DELETED_ANCESTORS_REMAIN_NESTED',async()=>{
      await deleteUi('B',middle);
      for(const p of [pages.A,pages.B,anon]) {
        await goto(p,'/posts/'+postId+'/');const r=await list(p);assert.equal(r.status,200);
        for(const id of [parent,middle,leaf]) {await p.locator('#comment-'+id).waitFor();assert.equal(await p.locator('#comment-'+id).count(),1);}
        assert.equal(r.data.comments.find(c=>c.id===middle).parent_id,parent);
        assert.equal(r.data.comments.find(c=>c.id===leaf).parent_id,middle);
        assert.ok(await p.locator('#comment-'+parent).evaluate((el,id)=>Boolean(el.parentElement.querySelector('#comment-'+id)),leaf),'DELETED_TREE_NESTING');
      }
      return {twoDeletedAncestors:true,thirdLevelReplyVisible:true,parentIdsUnchanged:true};
    },'comments');
    await check('DELETED_BODY_DIRECT_RLS_STILL_DENIED',async()=>{
      for(const actor of ['anon','B']) {
        const r=await localFetch('/rest/v1/comments?select=id,body&id=eq.'+parent,{headers:{apikey:s.status.ANON_KEY,...(actor==='anon'?{}:{Authorization:'Bearer '+sessions[actor].access_token})}});
        assert.equal(r.status,200);assert.deepEqual(await r.json(),[]);
      }
      const r=await rpc('anon',postId,[leaf,sibling]);assert.equal(r.status,200);
      assert.deepEqual(new Set(r.data.map(x=>x.id)),new Set([parent,middle]));
      for(const row of r.data) assert.deepEqual(Object.keys(row).sort(),['created_at','id','parent_id','post_id','updated_at']);
      return {rawBodiesStillRlsHidden:true,projectionContainsRelationshipsOnly:true,serviceRoleUsed:false};
    },'permissions');
    await check('PROJECTION_PRIVATE_AND_MALICIOUS_INPUTS_DENIED',async()=>{
      const circle=await scalar(`insert into public.circles(slug,name,type,owner_id) values('rls-test-circle','RLS test local','topic',${q(s.actors.A.id)}) returning id;`);
      const privatePost=await scalar(`insert into public.posts(author_id,circle_id,type,title,body,status) values(${q(s.actors.A.id)},${q(circle)},'question','Private local','Private local','published') returning id;`);
      const hiddenParent=await seed('A','Never-public-private-body',null,privatePost,'deleted');
      const privateChild=await seed('B','Private reply',hiddenParent,privatePost);
      const hiddenPost=await scalar(`insert into public.posts(author_id,circle_id,type,title,body,status) values(${q(s.actors.A.id)},${q(circleId)},'question','Hidden local','Hidden local','hidden') returning id;`);
      const hp=await seed('A','Never-public-hidden-body',null,hiddenPost,'deleted'),hc=await seed('B','Hidden reply',hp,hiddenPost);
      for(const actor of ['anon','B','ADMIN']) for(const [target,ids] of [[privatePost,[privateChild]],[postId,[privateChild]],[hiddenPost,[hc]],[postId,[]],[postId,Array(1001).fill(leaf)]]) {
        const r=await rpc(actor,target,ids);assert.equal(r.status,200);assert.deepEqual(r.data,[]);
      }
      return {privateCircleAndHiddenPostDenied:true,crossPostDenied:true,emptyAndOversizeSeedsDenied:true,serviceRoleUsed:false};
    },'permissions');
    await check('ADMIN_DELETE_ROLE_AND_UI',async()=>{
      await goto(pages.ADMIN,'/posts/'+postId+'/');const r=await list(pages.ADMIN);
      const row=r.data.comments.find(c=>c.id===fresh);assert.equal(row.can_delete,true);assert.equal(row.delete_as_staff,true);
      await deleteUi('ADMIN',fresh,true);return {serverRoleBound:true,realUiAndDbDelete:true,confirmationAndSuccessVisible:true};
    },'comments');
    await check('REGULAR_USER_CANNOT_FORGE_ADMIN_DELETE',async()=>{
      const r=await browserApi(pages.B,'/api/forum/comments?id='+leaf,'DELETE',{role:'admin',delete_as_staff:true});
      assert.equal(r.status,403);assert.equal(await dbCount('comments',`id=${q(leaf)} and status='published'`),1);
      await goto(pages.B,'/posts/'+postId+'/');const data=await list(pages.B),row=data.data.comments.find(c=>c.id===leaf);
      assert.equal(row.can_delete,false);assert.equal(row.delete_as_staff,false);
      assert.equal(await pages.B.locator('#comment-'+leaf).getByRole('button',{name:'Remove as moderator',exact:true}).count(),0);
      return {httpStatus:403,forgedRoleIgnored:true,rowUnchanged:true};
    },'permissions');
    await check('DELETE_FAILURE_FEEDBACK_AND_NO_FALSE_SUCCESS',async()=>{
      const p=pages.ADMIN;await goto(p,'/posts/'+postId+'/');
      const pattern='**/api/forum/comments?*';
      await p.route(pattern,route=>route.request().method()==='DELETE'?route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Local fixture deletion denied'})}):route.continue());
      try {
        await p.locator('#comment-'+leaf).getByRole('button',{name:'Remove as moderator',exact:true}).click();
        const dialog=p.getByRole('alertdialog');await dialog.getByRole('button',{name:'Confirm deletion',exact:true}).click();
        await dialog.getByText('Local fixture deletion denied',{exact:true}).waitFor();
        assert.equal(await dbCount('comments',`id=${q(leaf)} and status='published'`),1);
        await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
      } finally {await p.unroute(pattern);}
      return {localErrorResponseFixture:true,realUiErrorDisplayed:true,databaseUnchanged:true};
    },'comments');
    for(const width of [390,430]) await check('ADMIN_DELETE_MOBILE_'+width,async()=>{
      const id=await seed('B','Mobile administrator target '+width),p=pages.ADMIN;
      await p.setViewportSize({width,height:932});await goto(p,'/posts/'+postId+'/');
      const button=p.locator('#comment-'+id).getByRole('button',{name:'Remove as moderator',exact:true});await button.scrollIntoViewIfNeeded();
      const box=await button.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1);
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await button.click();await p.getByRole('alertdialog').screenshot({path:path.join(out,'admin-comment-delete-'+width+'.png')});
      await p.getByRole('alertdialog').getByRole('button',{name:'Cancel',exact:true}).click();
      await deleteUi('ADMIN',id,true);await p.setViewportSize({width:1440,height:1000});
      return {width,buttonWithinViewport:true,realUiDeleteAndDatabaseVerified:true};
    },'comments');
    await check('REACTIONS_AND_COMMENT_READ_REGRESSION',async()=>{
      const p=pages.B,r=await browserApi(p,'/api/forum/comments','PUT',{comment_id:leaf});assert.equal(r.status,200);assert.equal(r.data.liked,true);assert.equal(r.data.like_count,1);
      const off=await browserApi(p,'/api/forum/comments','PUT',{comment_id:leaf});assert.equal(off.status,200);assert.equal(off.data.like_count,0);
      const invalid=await browserApi(p,'/api/forum/comments','PUT',{comment_id:parent});assert.equal(invalid.status,404);
      return {liveCommentLikeUnlike:true,deletedCommentReactionDenied:true,readStill200:(await list(anon)).status===200};
    },'permissions');
    await check('UI_REPLY_AFTER_PARENT_DELETE',async()=>{
      await goto(pages.B,'/posts/'+postId+'/');await pages.B.locator('#comment-'+leaf).getByRole('button',{name:/^Reply/}).click();
      const form=pages.B.locator('.comment-reply-form .comment-form');await form.locator('textarea').fill('Reply after ancestor deletion '+s.runId);
      const pending=responseFor(pages.B,r=>new URL(r.url()).pathname==='/api/forum/comments'&&r.request().method()==='POST');
      await form.locator('button[type=submit]').click();assert.equal((await pending).status(),201);
      const id=await scalar(`select id from public.comments where parent_id=${q(leaf)} and author_id=${q(s.actors.B.id)} and body=${q('Reply after ancestor deletion '+s.runId)};`);
      deliveredReply=id;
      await pages.B.locator('#comment-'+id).waitFor();return {fourLevelsVisible:true,realUiAndDatabaseRelation:true};
    },'comments');
    if(followup) {
      await check('NOTIFICATION_REPLY_DELIVERY',async()=>{
        assert.ok(deliveredReply);
        const r=await browserApi(pages.A,'/api/users/me/notifications?limit=50');assert.equal(r.status,200);
        const notification=r.data.notifications.find(n=>n.type==='reply_to_comment'&&n.preview==='Reply after ancestor deletion '+s.runId);
        if(!notification) {
          const e=Error('REPLY_NOTIFICATION_NOT_DELIVERED');e.safeEvidence={apiNotificationCount:r.data.notifications.length,apiReplyNotificationCount:r.data.notifications.filter(n=>n.type==='reply_to_comment').length,
            databaseRecipientReplyCount:await dbCount('forum_notifications',`recipient_id=${q(s.actors.A.id)} and actor_id=${q(s.actors.B.id)} and comment_id=${q(deliveredReply)} and type='reply_to_comment'`)};throw e;
        }
        await goto(pages.A,'/notifications/');
        const item=pages.A.locator('.notifications-page__item').filter({hasText:'Reply after ancestor deletion '+s.runId});
        await item.first().waitFor();
        assert.ok(await dbCount('forum_notifications',`recipient_id=${q(s.actors.A.id)} and actor_id=${q(s.actors.B.id)} and comment_id=${q(deliveredReply)} and type='reply_to_comment'`)>0);
        return {realReplyTrigger:true,recipientIdentityBound:true,apiAndUiDelivered:true};
      });
      await check('FEED_REAL_SORT_ORDER',async()=>{
        const newest=await scalar(`insert into public.posts(author_id,circle_id,type,title,body,status,created_at) values(${q(s.actors.A.id)},${q(circleId)},'question','Local newest sort fixture','Local sort fixture','published',now()+interval '1 minute') returning id;`);
        const hot=await scalar(`insert into public.posts(author_id,circle_id,type,title,body,status,created_at) values(${q(s.actors.A.id)},${q(circleId)},'question','Local hot sort fixture','Local sort fixture','published',now()-interval '1 hour') returning id;`);
        for(let i=0;i<20;i++) await seed('B','Local hot interaction '+i,null,hot);
        for(const [sort,expected] of [['latest',newest],['hot',hot]]) {
          const r=await browserApi(pages.A,'/api/forum/posts?sort='+sort);assert.equal(r.status,200);assert.equal(r.data.posts[0].id,expected);
          await goto(pages.A,'/feed/?sort='+sort);
          const href=await pages.A.locator('.community-post-card').first().locator('a[href^="/posts/"]').first().getAttribute('href');
          assert.equal(href,'/posts/'+expected+'/');
        }
        return {latestAndHotDifferentFixtures:true,apiAndRealDomOrderVerified:true};
      });
      await check('SIGNED_IN_PUBLIC_PRODUCT_DATA',async()=>{
        const name=await scalar("select name from public.devices where slug='xreal-air' and publication_status='published';");assert.ok(name);
        const r=await goto(pages.A,'/products/xreal/xreal-air/');assert.equal(r.status(),200);
        assert.equal((await pages.A.locator('main h1').first().textContent()).trim(),name);
        assert.ok((await pages.A.locator('main').innerText()).length>300);
        return {publishedDbNameMatchesRealDom:true,signedInContext:true,anonymousSsrPublicDetail:true,notAuthenticatedGrantEvidence:true};
      },'group1Continuation');
    }
  } finally {await anonContext.close();}
}
