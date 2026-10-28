import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sealBucketRuleBaseline,admitExactTmpReferences,tmpTargetFailureReceipt,
  projectBoundR2ObjectPage,buildFinitePrefixLockCandidate} from './legacy-tmp-lifecycle-safety.mjs';

// Fictitious local values only. This file has no transport or execution permit.
const account='dcb374166b39234a499985145c075f50';
const source=(kind='lock')=>({kind,account,bucket:'openglasshub-media',jurisdiction:'default',
  endpoint:`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/openglasshub-media/${kind}`,
  status:200,complete:true,redirected:false,targetVerified:true});
const raw=rules=>Buffer.from(JSON.stringify({success:true,result:{rules}}));
const rule=(id='fixture-lock')=>({id,enabled:true,prefix:'tmp/fictitious/',condition:{type:'Date',date:'2030-01-01T00:00:00Z'}});
const seal=(bytes,s=source())=>sealBucketRuleBaseline(bytes,s);
const row=(n=1)=>({media_id:`00000000-0000-4000-8000-00000000000${n}`,
  post_id:'11111111-1111-4111-8111-111111111111',
  storage_path:`tmp/22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111/fictitious-${n}.mp4`,
  size_bytes:'2018',post_status:'pending',moderation_status:'pending_review'});
const pair=()=>[row(),row(2)];
const rejects=f=>assert.throws(f,e=>/^PRIVATE_(RULE_BASELINE|TMP_TARGET_SCOPE)_UNPROVEN$/.test(e.message));

test('complete private rule baseline retains unrelated fields and hashes raw bytes',()=>{
  const input=Buffer.from('{"success":true,"result":{"future_field":{"opaque":true},"rules":[]}}');
  const r=seal(input);
  assert.deepEqual(r.configuration,{future_field:{opaque:true},rules:[]});
  assert.equal(r.rawResponseSha256,createHash('sha256').update(input).digest('hex'));
  assert.equal(r.productionAuthority,false);assert.equal(r.writeReady,false);
});

test('canonical hash ignores object property order, never rule array order or field values',()=>{
  const a=raw([rule('one'),rule('two')]);
  const b=Buffer.from(JSON.stringify({result:{rules:[{condition:rule().condition,prefix:rule().prefix,enabled:true,id:'one'},rule('two')]},success:true}));
  assert.equal(seal(a).configurationSha256,seal(b).configurationSha256);
  assert.notEqual(seal(a).rawResponseSha256,seal(b).rawResponseSha256);
  assert.notEqual(seal(a).configurationSha256,seal(raw([rule('two'),rule('one')])).configurationSha256);
  assert.notEqual(seal(a).configurationSha256,seal(raw([{...rule('one'),enabled:false},rule('two')])).configurationSha256);
});

test('own prototype-like and numeric configuration fields are not silently dropped',()=>{
  const a=seal(Buffer.from('{"success":true,"result":{"rules":[],"__proto__":{"retained":true},"2":false,"10":true}}'));
  const b=seal(Buffer.from('{"result":{"10":true,"2":false,"__proto__":{"retained":true},"rules":[]},"success":true}'));
  assert.equal(a.configurationSha256,b.configurationSha256);
  assert.equal(Object.hasOwn(a.configuration,'__proto__'),true);
  assert.notEqual(a.configurationSha256,seal(raw([])).configurationSha256);
});

test('incomplete, redirected, denied or wrong-target response cannot seal a baseline',()=>{
  for(const patch of [{complete:false},{redirected:true},{status:403},{targetVerified:false},
    {account:'other'},{bucket:'other'},{jurisdiction:'eu'},{kind:'settings'},
    {endpoint:source().endpoint+'?extra=true'}])rejects(()=>seal(raw([]),{...source(),...patch}));
});

test('invalid UTF8, JSON, failed envelope and oversized input stop without raw diagnostics',()=>{
  for(const bytes of [Buffer.alloc(0),Buffer.from([0xff]),Buffer.from('{bad'),raw(null),
    Buffer.from('{"success":false,"result":{"rules":[]}}'),Buffer.alloc(262145,32)])rejects(()=>seal(bytes));
});

test('rule limits and duplicate IDs stop; all allowed lock entries remain intact',()=>{
  assert.equal(seal(raw(Array.from({length:1000},(_,n)=>rule(`f${n}`)))).ruleCount,1000);
  rejects(()=>seal(raw(Array.from({length:1001},(_,n)=>rule(`f${n}`)))));
  rejects(()=>seal(raw(Array.from({length:129},(_,n)=>rule(`f${n}`))),source('lifecycle')));
  rejects(()=>seal(raw([rule(),rule()])));
  rejects(()=>seal(raw([{...rule(),enabled:'yes'}])));
});

test('exactly two linked canonical tmp references admitted only to private output',()=>{
  const r=admitExactTmpReferences(pair());
  assert.deepEqual(r.privateTargets,pair());
  assert.equal(r.safeSummary.admittedReferences,2);
  assert.equal(r.safeSummary.objectExistence,'UNKNOWN');
  assert.equal(r.safeSummary.protection,'NOT_APPLIED');
  assert.equal(r.safeSummary.productionAuthority,false);
  const safe=JSON.stringify(r.safeSummary);
  for(const privateValue of [row().media_id,row().post_id,row().storage_path])assert(!safe.includes(privateValue));
});

test('underflow and overflow stop before inspecting or adopting any target',()=>{
  rejects(()=>admitExactTmpReferences([]));rejects(()=>admitExactTmpReferences([row()]));
  const overflow=[row(),row(2),{}];
  Object.defineProperty(overflow,2,{get(){throw Error('THIRD_ROW_MUST_NOT_BE_INSPECTED');}});
  rejects(()=>admitExactTmpReferences(overflow));
});

test('duplicate identity/key, unlinked posts, unknown fields and malformed sizes stop',()=>{
  for(const patch of [{media_id:row().media_id},{storage_path:row().storage_path},
    {post_id:'invalid'},{post_id:'33333333-3333-4333-8333-333333333333'},
    {size_bytes:'9007199254740992'},{size_bytes:null},{post_status:null},
    {moderation_status:undefined},{unexpected:'not-approved'}]){
    const rows=pair();Object.assign(rows[1],patch);rejects(()=>admitExactTmpReferences(rows));
  }
});

test('encoded, traversing, empty-segment, non-tmp and overlong keys are rejected unchanged',()=>{
  for(const key of ['tmp/a/../b','tmp//b','tmp/a%2fb','tmp/a?token=x','retained/a','tmp/'+'a'.repeat(1025)]){
    const rows=pair();rows[1].storage_path=key;rejects(()=>admitExactTmpReferences(rows));
  }
});

test('baseline preparation cannot call providers or create execution state',()=>{
  const old=globalThis.fetch;let calls=0;
  globalThis.fetch=()=>{calls++;throw Error('OFFLINE_ONLY');};
  try{seal(raw([]));admitExactTmpReferences(pair());assert.equal(calls,0);}finally{globalThis.fetch=old;}
});

test('diagnostic distinguishes each failing constraint without disclosing values',()=>{
  const cases=[['COLUMNS',{extra:'PRIVATE_VALUE'}],['MEDIA_ID',{media_id:'PRIVATE_VALUE'}],
    ['POST_ID',{post_id:'PRIVATE_VALUE'}],['DUPLICATE_MEDIA_ID',{media_id:row().media_id}],
    ['KEY_NONCANONICAL',{storage_path:'tmp/PRIVATE_VALUE?secret'}],
    ['DUPLICATE_KEY',{storage_path:row().storage_path}],['SIZE',{size_bytes:null}],
    ['POST_STATE',{post_status:null}],['MODERATION_STATE',{moderation_status:null}],
    ['KEY_POST_LINK',{post_id:'33333333-3333-4333-8333-333333333333'}]];
  for(const [reason,patch]of cases){
    const rows=pair();Object.assign(rows[1],patch);
    assert.throws(()=>admitExactTmpReferences(rows),e=>{
      assert.equal(e.message,'PRIVATE_TMP_TARGET_SCOPE_UNPROVEN');
      assert.deepEqual({...e},{admissionCheck:reason,returnedRowCount:2});
      assert(!JSON.stringify(e).includes('PRIVATE_VALUE'));return true;
    });
  }
});

test('diagnostic count overflow still never inspects third row or accepts extra targets',()=>{
  const rows=[row(),row(2),null];Object.defineProperty(rows,2,{get(){throw Error('DO_NOT_READ');}});
  assert.throws(()=>admitExactTmpReferences(rows),e=>e.admissionCheck==='ROW_COUNT'&&e.returnedRowCount===3);
  assert.throws(()=>admitExactTmpReferences(null),e=>e.admissionCheck==='ROW_COUNT'&&e.returnedRowCount==='OVERFLOW_OR_INVALID');
});

test('diagnostic does not change valid target projection or provide execution permission',()=>{
  const r=admitExactTmpReferences(pair());assert.deepEqual(r.privateTargets,pair());
  assert.equal(r.safeSummary.productionAuthority,false);assert.equal(r.safeSummary.objectExistence,'UNKNOWN');
  assert.equal(r.safeSummary.protection,'NOT_APPLIED');
});

test('receipt projection persists only bounded admission diagnostics through serialization',()=>{
  const e=Object.assign(Error('PRIVATE_TMP_TARGET_SCOPE_UNPROVEN'),{
    admissionCheck:'SIZE',returnedRowCount:2,privateKey:'DO_NOT_SAVE',rows:pair()});
  const receipt={status:'BLOCKED',...tmpTargetFailureReceipt(e)};
  assert.deepEqual(JSON.parse(JSON.stringify(receipt)),{
    status:'BLOCKED',admissionCheck:'SIZE',returnedRowCount:2,rootCause:'UNKNOWN'});
  assert.equal(Object.hasOwn(receipt,'rows'),false);
});

test('receipt projection never promotes arbitrary errors or unbounded values',()=>{
  const unknown={admissionCheck:'UNKNOWN',returnedRowCount:'UNKNOWN',rootCause:'UNKNOWN'};
  assert.deepEqual(tmpTargetFailureReceipt(null),unknown);
  assert.deepEqual(tmpTargetFailureReceipt(Object.assign(Error('PRIVATE_VALUE'),{
    admissionCheck:'SIZE',returnedRowCount:2})),unknown);
  for(const n of [-1,4,NaN,'2','PRIVATE_VALUE']) {
    const r=tmpTargetFailureReceipt({message:'PRIVATE_TMP_TARGET_SCOPE_UNPROVEN',
      admissionCheck:'PRIVATE_VALUE',returnedRowCount:n});
    assert.deepEqual(r,unknown);
  }
});

test('final closure: exact metadata identity never defaults missing fields or version',()=>{
  const key='tmp/fictitious/video.mp4';
  const s={account,bucket:'openglasshub-media',jurisdiction:'default',status:200,complete:true,
    redirected:false,targetVerified:true,prefix:key,perPage:2,pagination:false};
  const response={success:true,result:[{key,size:2018,storage_class:'Standard',
    etag:'0'.repeat(32),last_modified:'2026-10-28T00:00:00Z'}],result_info:{is_truncated:false}};
  const p=projectBoundR2ObjectPage(response,s,key);
  assert.equal(p.state,'EXISTS');assert.equal(p.storageClass,'Standard');
  assert.equal(p.suffixCollision,'NONE_OBSERVED');assert.equal(p.version,'UNKNOWN');
  assert(!JSON.stringify(p).includes(key));
  const missing=projectBoundR2ObjectPage({...response,result:[{key}]},s,key);
  assert.equal(missing.sizeBytes,'UNKNOWN');assert.equal(missing.storageClass,'UNKNOWN');
  const ia=projectBoundR2ObjectPage({...response,result:[{key,storage_class:'InfrequentAccess'}]},s,key);
  assert.equal(ia.storageClass,'InfrequentAccess');assert.equal(ia.productionAuthority,false);
  const invalidDate=projectBoundR2ObjectPage({...response,result:[{key,last_modified:'2026-02-31T00:00:00Z'}]},s,key);
  assert.equal(invalidDate.lastModifiedUtc,'UNKNOWN');
});

test('final closure: absence requires explicit terminal listing and distinguishes suffixes',()=>{
  const key='tmp/fictitious/video.mp4';
  const s={account,bucket:'openglasshub-media',jurisdiction:'default',status:200,complete:true,
    redirected:false,targetVerified:true,prefix:key,perPage:2,pagination:false};
  const page=(result,info)=>({success:true,result,result_info:info});
  assert.equal(projectBoundR2ObjectPage(page([],undefined),s,key).state,'UNKNOWN');
  assert.equal(projectBoundR2ObjectPage(page([],{is_truncated:true}),s,key).state,'UNKNOWN');
  assert.equal(projectBoundR2ObjectPage(page([],{is_truncated:false,cursor:'more'}),s,key).state,'UNKNOWN');
  assert.equal(projectBoundR2ObjectPage(page([],{is_truncated:false}),s,key).state,'NOT_FOUND');
  assert.equal(projectBoundR2ObjectPage(page([],{is_truncated:false,count:1}),s,key).state,'UNKNOWN');
  assert.equal(projectBoundR2ObjectPage(page([],{is_truncated:false,count:-1}),s,key).state,'UNKNOWN');
  const suffix=projectBoundR2ObjectPage(page([{key:key+'.extra'}],{is_truncated:false}),s,key);
  assert.equal(suffix.state,'NOT_FOUND');assert.equal(suffix.suffixCollision,'OBSERVED');
  const partial=projectBoundR2ObjectPage(page([{key}],{is_truncated:true,cursor:'more'}),s,key);
  assert.equal(partial.state,'EXISTS');assert.equal(partial.suffixCollision,'UNKNOWN');
});

test('final closure: denied wrong-target duplicate overflow and oversized metadata fail closed',()=>{
  const key='tmp/fictitious/video.mp4';
  const s={account,bucket:'openglasshub-media',jurisdiction:'default',status:200,complete:true,
    redirected:false,targetVerified:true,prefix:key,perPage:2,pagination:false};
  const good={success:true,result:[{key}],result_info:{is_truncated:false}};
  for(const patch of [{status:403},{complete:false},{redirected:true},{targetVerified:false},
    {account:'wrong'},{prefix:key+'.other'},{perPage:3},{pagination:true}])
    assert.equal(projectBoundR2ObjectPage(good,{...s,...patch},key).state,'UNKNOWN');
  for(const patch of [{success:false},{errors:[{code:1000}]},{result_info:{per_page:3,is_truncated:false}},
    {result:[{key},{key}]},{result:[{key},{key:key+'a'},{key:key+'b'}]},
    {result:[{key:'other/key'}]},{result:[{key,custom_metadata:{oversized:'x'.repeat(65536)}}]}])
    assert.equal(projectBoundR2ObjectPage({...good,...patch},s,key).state,'UNKNOWN');
});

test('final closure: finite draft preserves every original rule field and order',()=>{
  const baseline=seal(Buffer.from(JSON.stringify({success:true,result:{future_field:{keep:true},
    rules:[rule('original-one'),{...rule('original-two'),enabled:false,future_field:'keep'}]}})));
  const before=JSON.stringify(baseline);
  const p=buildFinitePrefixLockCandidate({baseline,expectedConfigurationSha256:baseline.configurationSha256,
    keys:['tmp/fictitious/a.mp4','tmp/fictitious/b.mp4'],ruleIds:['ogh-legacy-one','ogh-legacy-two'],
    nowUtc:'2026-10-28T10:00:00.000Z',expiryUtc:'2026-11-04T12:00:00.000Z'});
  assert.deepEqual(p.configuration.rules.slice(0,2),baseline.configuration.rules);
  assert.deepEqual(p.configuration.future_field,{keep:true});
  assert.equal(JSON.stringify(baseline),before);assert.equal(p.preservedRuleCount,2);
  assert.equal(p.addedRuleCount,2);assert.equal(p.productionAuthority,false);assert.equal(p.writeReady,false);
  assert.deepEqual(p.configuration.rules.slice(2).map(r=>r.prefix),['tmp/fictitious/a.mp4','tmp/fictitious/b.mp4']);
});

test('final closure: finite draft rejects drift expired overlong overlapping or colliding rules',()=>{
  const baseline=seal(raw([rule('ogh-legacy-existing')]));
  const args={baseline,expectedConfigurationSha256:baseline.configurationSha256,
    keys:['tmp/fictitious/a.mp4'],ruleIds:['ogh-legacy-one'],
    nowUtc:'2026-10-28T10:00:00.000Z',expiryUtc:'2026-11-04T12:00:00.000Z'};
  for(const patch of [{expectedConfigurationSha256:'0'.repeat(64)},
    {expiryUtc:'2026-10-28T09:00:00.000Z'},{expiryUtc:'2026-11-20T12:00:00.000Z'},
    {ruleIds:['ogh-legacy-existing']},{keys:['tmp/fictitious/a.mp4','tmp/fictitious/a.mp4-extra'],ruleIds:['ogh-legacy-one','ogh-legacy-two']},
    {keys:['tmp/fictitious/../a']},{keys:[]},{keys:['tmp/fictitious/a.mp4','tmp/fictitious/a.mp4'],ruleIds:['ogh-legacy-one','ogh-legacy-two']}])
    assert.throws(()=>buildFinitePrefixLockCandidate({...args,...patch}),/FINITE_PREFIX_LOCK_CANDIDATE_UNPROVEN/);
});
