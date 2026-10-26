import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sealBucketRuleBaseline,admitExactTmpReferences} from './legacy-tmp-lifecycle-safety.mjs';

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
