import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,realpath,rm} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { planTmpLifecycleRead, evaluateTmpLifecycleRisk } from './legacy-tmp-lifecycle-safety.mjs';

const source={bucket:'openglasshub-media',jurisdiction:'default',complete:true,targetVerified:true};
const rule=(prefix='tmp/',extra={})=>({id:'offline-rule',enabled:true,conditions:{prefix},deleteObjectsTransition:{condition:{type:'Age',maxAge:86400}},...extra});
const plan=(rules=[])=>planTmpLifecycleRead({success:true,result:{rules}},source);
const risk=(p,total=1,matched=[])=>evaluateTmpLifecycleRisk(p,{databaseReadVerified:true,total,published:total,orphan:0,matched});

test('referenced tmp covered by an enabled age deletion is blocked',()=>{
  const p=plan([rule()]);assert.equal(p.status,'READY');assert.equal(risk(p,1,[{index:0,refs:1}]).risk,'BLOCKED');
});
test('all-object prefix includes tmp; longer prefix needs exact aggregate matching',()=>{
  assert.deepEqual(plan([rule('')]).prefixes,['tmp/']);
  const p=plan([rule('tmp/only-a/')]);assert.deepEqual(p.prefixes,['tmp/only-a/']);
  assert.equal(risk(p,2,[{index:0,refs:1}]).risk,'BLOCKED');
  assert.equal(risk(p,2,[{index:0,refs:0}]).risk,'UNKNOWN');
});
test('disabled or unrelated deletion never proves all media safe',()=>{
  for(const p of [plan([rule('tmp/',{enabled:false})]),plan([rule('retained/')])]){
    assert.equal(risk(p).risk,'UNKNOWN');assert.equal(risk(p).lifecycleDeletionRisk,'NO_MATCHED_DELETION');
  }
});
test('multipart abort and storage-class transition are not completed-object deletion',()=>{
  const p=plan([{id:'offline-abort',enabled:true,conditions:{prefix:''},abortMultipartUploadsTransition:{condition:{type:'Age',maxAge:86400}},storageClassTransitions:[{condition:{type:'Age',maxAge:86400},storageClass:'InfrequentAccess'}]}]);
  assert.deepEqual(p.prefixes,[]);assert.equal(risk(p).lifecycleDeletionRisk,'NO_MATCHED_DELETION');
});
test('date deletion remains a future expiry risk, not proof of past byte loss',()=>{
  const p=plan([rule('tmp/',{deleteObjectsTransition:{condition:{type:'Date',date:'2030-01-01T00:00:00Z'}}})]);
  const r=risk(p,1,[{index:0,refs:1}]);assert.equal(r.risk,'BLOCKED');assert.equal(r.pastByteLoss,'NOT_PROVEN');
});
test('zero references is safe only for the bounded current tmp scope',()=>{
  const r=risk(plan([rule()]),0,[{index:0,refs:0}]);assert.equal(r.risk,'SAFE');assert.equal(r.scope,'CURRENT_TMP_VIDEO_REFERENCES_ONLY');assert.equal(r.allHistoricalMediaVerified,false);
});
test('unknown target, incomplete response, denied request and malformed shapes fail closed',()=>{
  for(const p of [planTmpLifecycleRead({success:true,result:{rules:[]}}, {...source,complete:false}),planTmpLifecycleRead({success:true,result:{rules:[]}}, {...source,bucket:'other'}),planTmpLifecycleRead({success:false},source),planTmpLifecycleRead({success:true,result:{}},source),plan([rule('tmp/',{conditions:{}})]),plan([rule('tmp/',{conditions:{prefix:'tmp/',unknownFilter:true}})])])assert.equal(risk(p).risk,'UNKNOWN');
});
test('invalid deletion conditions and unknown rule extensions fail closed',()=>{
  for(const r of [rule('tmp/',{deleteObjectsTransition:{condition:{type:'Age',maxAge:-1}}}),rule('tmp/',{deleteObjectsTransition:{condition:{type:'Date',date:'not-a-date'}}}),rule('tmp/',{deleteObjectsTransition:{condition:{type:'Other'}}}),rule('tmp/',{futureDeletionAction:{enabled:true}})])assert.equal(plan([r]).status,'UNKNOWN');
});
test('missing, duplicate, inconsistent or unverified aggregates are unknown',()=>{
  const p=plan([rule()]);
  for(const evidence of [{databaseReadVerified:false,total:1,published:1,orphan:0,matched:[{index:0,refs:1}]},{databaseReadVerified:true,total:1,published:2,orphan:0,matched:[]},{databaseReadVerified:true,total:1,published:1,orphan:0,matched:[]},{databaseReadVerified:true,total:1,published:1,orphan:0,matched:[{index:0,refs:0},{index:0,refs:1}]},{databaseReadVerified:true,total:1,published:1,orphan:0,matched:[{index:0,refs:2}]}])assert.equal(evaluateTmpLifecycleRisk(p,evidence).risk,'UNKNOWN');
});
test('safe decimal bigint counts parse; oversized or noninteger counts do not',()=>{
  const p=plan();assert.equal(risk(p,'0').risk,'SAFE');for(const n of ['9007199254740992','1.5',-1,NaN])assert.equal(risk(p,n).risk,'UNKNOWN');
});
test('duplicate prefixes are queried once and output does not retain rule IDs or prefixes',()=>{
  const p=plan([rule('tmp/private-marker/'),rule('tmp/private-marker/',{id:'other'})]);assert.deepEqual(p.prefixes,['tmp/private-marker/']);
  const r=risk(p,1,[{index:0,refs:1}]);assert(!JSON.stringify(r).includes('private-marker'));assert(!JSON.stringify(r).includes('offline-rule'));
});
test('bound read stays finite and cannot obtain authority or call a network',()=>{
  assert.equal(plan(Array.from({length:129},()=>rule())).status,'UNKNOWN');
  const r=risk(plan());assert.equal(r.productionAuthority,false);
});

test('new aggregate SQL runs read-only on owned local PG17 and treats prefix metacharacters literally',{timeout:60000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'ogh-lifecycle-aggregate-')),data=path.join(dir,'data');
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(k)));
  const listener=net.createServer();await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const command=(bin,args)=>new Promise((resolve,reject)=>{
    const child=spawn(bin,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill();},20000);child.stdout.resume();child.stderr.resume();
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);child.stdout.destroy();child.stderr.destroy();if(code!==0||timedOut)reject(Error('OWNED_LOCAL_PG_COMMAND_FAILED'));else resolve();});
  });
  let started=false,client;
  try{
    await command('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
    await command('pg_ctl',['-D',data,'-l',path.join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','-t','15','start']);started=true;
    client=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000,statement_timeout:8000});await client.connect();
    assert.match((await client.query('SHOW server_version')).rows[0].server_version,/^17\./);
    await client.query(`CREATE TABLE public.posts(id integer PRIMARY KEY,status text,moderation_status text);
      CREATE TABLE public.post_media(post_id integer,kind text,storage_path text);
      INSERT INTO public.posts VALUES(1,'published','published'),(2,'draft','pending');
      INSERT INTO public.post_media VALUES(1,'video','tmp/a/one'),(2,'video','tmp/a/two'),(99,'video','tmp/percent%_literal/three'),(1,'video','retained/four'),(1,'image','tmp/image');`);
    const sql=await readFile(new URL('./legacy-tmp-lifecycle-aggregate.READONLY.sql',import.meta.url),'utf8');
    await client.query('BEGIN READ ONLY');
    assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
    const row=(await client.query(sql,[['tmp/','tmp/a/','tmp/percent%_literal/','tmp/not-present/']])).rows[0];
    assert.equal(Number(row.total),3);assert.equal(Number(row.published),1);assert.equal(Number(row.orphan),1);
    assert.deepEqual(row.matched,[{index:0,refs:3},{index:1,refs:2},{index:2,refs:1},{index:3,refs:0}]);
    assert.deepEqual(Object.keys(row).sort(),['matched','orphan','published','total']);
    assert.deepEqual((await client.query(sql,[[]])).rows[0].matched,[]);
    await client.query('ROLLBACK');
  }finally{
    if(client)await client.end();
    if(started)await command('pg_ctl',['-D',data,'-m','immediate','-w','-t','10','stop']);
    const absolute=await realpath(dir),base=await realpath(os.tmpdir()),relative=path.relative(base,absolute);
    assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'OWNED_TMP_DELETE_SCOPE');
    await rm(absolute,{recursive:true,force:false});
  }
});
