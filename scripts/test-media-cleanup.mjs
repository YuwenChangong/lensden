import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';

const owner='00000000-0000-4000-8000-000000000001',post='00000000-0000-4000-8000-000000000002';
const id='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004';
const original=owner+'/'+post+'/image.png',thumb=owner+'/'+post+'/thumb.png';
const row=(overrides={})=>({id,user_id:owner,post_id:post,kind:'image',storage_path:original,thumbnail_url:thumb,url:null,...overrides});
let r2Result={ok:true,httpStatus:204},r2Calls=[];
globalThis.__mediaCleanupR2=async p=>{r2Calls.push(p.objectKey);return r2Result;};
const vite=await createServer({logLevel:'error',appType:'custom',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true},plugins:[{
  name:'offline-r2-delete-fixture',enforce:'pre',
  load(p){if(p.replaceAll('\\','/').endsWith('/src/lib/r2-server.ts'))return 'export const deleteR2Object = p => globalThis.__mediaCleanupR2(p);';},
}]});
let passed=0;
function fixture(rows=[row()],options={}) {
  const objects=new Set([original,thumb]),removed=[];
  const client={
    from(table){assert.equal(table,'post_media');const filters=[];let deleting=false,ids;
      const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},
        not(k,op,v){assert.equal(k,'id');assert.equal(op,'in');const excluded=v.slice(1,-1).split(',');filters.push(r=>!excluded.includes(r.id));return q;},
        limit(){return q;},delete(){deleting=true;return q;},in(k,v){ids=v;filters.push(r=>v.includes(r[k]));return q;},
        then(resolve,reject){return Promise.resolve().then(()=>{
          if(!deleting&&options.lookupError)return {data:null,error:{message:'denied'}};
          if(deleting&&options.rowError)return {data:null,error:{message:'denied'}};
          const matched=rows.filter(r=>filters.every(f=>f(r)));
          if(deleting&&!options.rowNoEffect)for(const r of matched)rows.splice(rows.indexOf(r),1);
          return {data:deleting&&options.rowNoEffect?[]:matched.map(r=>({id:r.id})),error:null};
        }).then(resolve,reject);},
      };return q;
    },
    storage:{from(bucket){assert.equal(bucket,'post-media');return {
      async remove(paths){const [p]=paths;removed.push(p);
        if(options.throwPath===p)throw Error('network');
        if(options.deleteError)return {data:null,error:options.deleteError};
        if(options.failPath===p)return {data:null,error:{status:503,message:'fixture failure'}};
        if(options.missingError)return {data:null,error:{status:404,message:'missing'}};
        if(options.noEffect)return {data:[],error:null};
        const existed=objects.delete(p);return {data:existed?[{name:p}]:[],error:null};
      },
      async info(p){if(options.infoError)return {data:null,error:{status:503}};
        return objects.has(p)?{data:{name:p},error:null}:{data:null,error:{status:404}};},
    };}},
  };return {client,objects,removed,rows};
}
try {
  const {deletePostMediaObjects,deleteMediaObject}=await vite.ssrLoadModule('/src/lib/server/media-cleanup.ts');
  const run=async(name,fn)=>{await fn();passed++;console.log(JSON.stringify({case:name,status:'PASS'}));};
  const clean=async(f,rows=f.rows)=>deletePostMediaObjects({client:f.client,env:{},mediaRows:[...rows],deleteRows:true});
  await run('all_delete_callers_include_bound_thumbnail',async()=>{for(const route of ['src/pages/api/forum/posts.ts','src/pages/api/admin/forum/posts.ts','src/pages/api/admin/forum/media.ts']){const source=await readFile(route,'utf8');assert.ok(source.includes('.select("id,kind,storage_path,url,thumbnail_url,user_id,post_id")'));}});
  await run('original_and_thumbnail_and_row',async()=>{const f=fixture(),r=await clean(f);assert.equal(r.ok,true);assert.equal(f.objects.size,0);assert.equal(f.rows.length,0);assert.equal(r.deletedObjects.length,2);});
  await run('same_key_deduplicated',async()=>{const f=fixture([row({thumbnail_url:original})]);await clean(f);assert.deepEqual(f.removed,[original]);});
  await run('shared_thumbnail_retained_single_delete',async()=>{const first=row(),f=fixture([first,row({id:other,storage_path:thumb,thumbnail_url:null})]);const r=await deleteMediaObject({client:f.client,env:{},media:first});assert.equal(r.ok,true);assert.ok(f.objects.has(thumb));assert.ok(r.deletedObjects.some(o=>o.status==='retained_shared'));});
  await run('shared_original_retained',async()=>{const first=row(),f=fixture([first,row({id:other,thumbnail_url:original})]);const r=await deleteMediaObject({client:f.client,env:{},media:first});assert.equal(r.ok,true);assert.ok(f.objects.has(original));});
  await run('invalid_thumbnail_no_deletion',async()=>{for(const path of ['other/post/thumb.png',original+'?secret=x','https://untrusted.invalid/a',owner+'/'+post+'/..']){const f=fixture([row({thumbnail_url:path})]);const r=await clean(f);assert.equal(r.ok,false);assert.equal(f.removed.length,0);assert.equal(f.rows.length,1);}});
  await run('partial_thumbnail_failure_retains_row',async()=>{const f=fixture(undefined,{failPath:thumb}),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.objects.has(original),false);assert.equal(f.objects.has(thumb),true);assert.equal(f.rows.length,1);assert.equal(r.deletedRows,0);});
  await run('explicit_retry_idempotent_missing_original',async()=>{const options={failPath:thumb},f=fixture(undefined,options);await clean(f);delete options.failPath;const r=await clean(f);assert.equal(r.ok,true);assert.equal(f.objects.size,0);assert.equal(f.rows.length,0);assert.ok(r.deletedObjects.some(o=>o.status==='already_missing'));});
  await run('repeated_empty_batch',async()=>{const f=fixture();await clean(f);const r=await clean(f);assert.equal(r.ok,true);assert.equal(r.deletedRows,0);});
  await run('unconfirmed_empty_delete_not_success',async()=>{const f=fixture(undefined,{noEffect:true}),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.rows.length,1);assert.equal(f.objects.size,2);});
  await run('absence_check_failure_not_success',async()=>{const f=fixture(undefined,{noEffect:true,infoError:true}),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.rows.length,1);});
  await run('structured_missing_is_idempotent',async()=>{const f=fixture(undefined,{missingError:true});f.objects.clear();const r=await clean(f);assert.equal(r.ok,true);assert.equal(f.rows.length,0);assert.ok(r.deletedObjects.every(o=>o.status==='already_missing'));});
  await run('not_found_text_with_403_not_success',async()=>{const f=fixture(undefined,{deleteError:{status:403,message:'not found or not permitted'}}),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.rows.length,1);assert.equal(f.objects.size,2);});
  await run('reference_query_failure_no_delete',async()=>{const f=fixture(undefined,{lookupError:true}),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.removed.length,0);assert.equal(f.rows.length,1);});
  await run('storage_exception_retains_row',async()=>{const f=fixture(undefined,{throwPath:thumb}),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.rows.length,1);});
  await run('database_delete_failure',async()=>{const f=fixture(undefined,{rowError:true}),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.rows.length,1);});
  await run('database_no_effect_not_success',async()=>{const f=fixture(undefined,{rowNoEffect:true}),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.rows.length,1);});
  await run('partial_batch_only_completed_rows_removed',async()=>{const second=row({id:other,storage_path:owner+'/'+post+'/other.png',thumbnail_url:null});const f=fixture([row(),second],{failPath:thumb});f.objects.add(second.storage_path);const r=await clean(f);assert.equal(r.ok,false);assert.deepEqual(f.rows.map(x=>x.id),[id]);assert.equal(r.deletedRows,1);});
  await run('r2_success_and_missing_semantics',async()=>{for(const value of [{ok:true,httpStatus:204},{ok:true,httpStatus:404,code:'NoSuchKey'}]){r2Result=value;r2Calls=[];const media=row({kind:'video',storage_path:'tmp/'+owner+'/'+post+'/video.mp4',thumbnail_url:null}),f=fixture([media]);const r=await clean(f);assert.equal(r.ok,true);assert.equal(r2Calls.length,1);assert.equal(r.deletedObjects[0].status,value.httpStatus===204?'deleted':'already_missing');}});
  await run('r2_failure_keeps_metadata',async()=>{r2Result={ok:false,httpStatus:403,error:'denied'};const f=fixture([row({kind:'video',storage_path:'tmp/'+owner+'/'+post+'/video.mp4',thumbnail_url:null})]),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.rows.length,1);});
  await run('retained_r2_key_and_supabase_thumbnail_use_their_own_backends',async()=>{r2Result={ok:true,httpStatus:204};r2Calls=[];const key=owner+'/'+post+'/r2-retained-'+other+'.mp4',f=fixture([row({kind:'video',storage_path:key})]);const r=await clean(f);assert.equal(r.ok,true);assert.deepEqual(r2Calls,[key]);assert.deepEqual(f.removed,[thumb]);assert.equal(f.rows.length,0);});
  await run('shared_retained_r2_video_is_not_deleted',async()=>{r2Result={ok:true,httpStatus:204};r2Calls=[];const key=owner+'/'+post+'/r2-retained-'+other+'.mp4',first=row({kind:'video',storage_path:key,thumbnail_url:null}),f=fixture([first,{...first,id:other}]);const r=await deleteMediaObject({client:f.client,env:{},media:first});assert.equal(r.ok,true);assert.equal(r2Calls.length,0);assert.equal(r.deletedObjects[0].status,'retained_shared');});
  await run('foreign_primary_and_url_never_deleted',async()=>{for(const overrides of [{storage_path:other+'/'+post+'/foreign.png',thumbnail_url:null},{kind:'video_link',storage_path:null,url:'https://untrusted.invalid/tmp/'+other+'/'+post+'/foreign.mp4',thumbnail_url:null}]){r2Calls=[];const f=fixture([row(overrides)]),r=await clean(f);assert.equal(r.ok,false);assert.equal(f.removed.length,0);assert.equal(r2Calls.length,0);assert.equal(f.rows.length,1);}});
  await run('unknown_storage_not_complete',async()=>{const f=fixture([row({storage_path:null,thumbnail_url:null})]);assert.equal((await clean(f)).ok,false);assert.equal(f.rows.length,1);});
  console.log(JSON.stringify({targetedMediaCleanup:{PASS:passed,total:passed},realR2:false,productionRequests:0,networkRequests:0}));
} finally {delete globalThis.__mediaCleanupR2;await vite.close();}
