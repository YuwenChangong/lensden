import test from 'node:test';
import assert from 'node:assert/strict';
import {planTmpLifecycleRead, evaluateTmpLifecycleRisk} from './legacy-tmp-lifecycle-safety.mjs';

const source={bucket:'openglasshub-media',jurisdiction:'default',complete:true,targetVerified:true};
const abort=()=>({id:'offline-abort',enabled:true,conditions:{},abortMultipartUploadsTransition:{condition:{type:'Age',maxAge:604800}}});
const deletion=()=>({id:'offline-delete',enabled:true,conditions:{prefix:'tmp/'},deleteObjectsTransition:{condition:{type:'Age',maxAge:86400}}});
const plan=rules=>planTmpLifecycleRead({success:true,result:{rules}},source);

test('an abort-only rule without prefix cannot mask completed-object deletion',()=>{
  const p=plan([abort(),deletion()]);
  assert.equal(p.status,'READY');assert.deepEqual(p.prefixes,['tmp/']);
  const result=evaluateTmpLifecycleRisk(p,{databaseReadVerified:true,total:2,published:0,orphan:0,matched:[{index:0,refs:2}]});
  assert.equal(result.risk,'BLOCKED');assert.equal(result.pastByteLoss,'NOT_PROVEN');
});

test('abort-only filter omission is not a completed-object expiry or all-media safety proof',()=>{
  const p=plan([abort()]);assert.equal(p.status,'READY');assert.deepEqual(p.prefixes,[]);
  const result=evaluateTmpLifecycleRisk(p,{databaseReadVerified:true,total:2,published:0,orphan:0,matched:[]});
  assert.equal(result.risk,'UNKNOWN');assert.equal(result.allHistoricalMediaVerified,false);
});

test('deletion or storage-class actions still require an explicit valid prefix',()=>{
  for(const change of [r=>r.deleteObjectsTransition=deletion().deleteObjectsTransition,
    r=>r.storageClassTransitions=[{condition:{type:'Age',maxAge:86400},storageClass:'InfrequentAccess'}]]){
    const r=abort();change(r);assert.equal(plan([r]).status,'UNKNOWN');
  }
  const r=deletion();r.conditions={};assert.equal(plan([r]).status,'UNKNOWN');
});

test('malformed abort conditions or unknown filters/actions remain fail closed',()=>{
  for(const change of [r=>r.abortMultipartUploadsTransition={condition:{type:'Other'}},
    r=>r.abortMultipartUploadsTransition={condition:{type:'Age',maxAge:-1}},
    r=>r.conditions={unrecognized:true},r=>r.conditions={prefix:null},
    r=>r.unrecognizedAction={},r=>delete r.abortMultipartUploadsTransition]){
    const r=abort();change(r);assert.equal(plan([r]).status,'UNKNOWN');
  }
});

test('shape-only historical diagnostics cannot be promoted to a complete lifecycle response',()=>{
  const p=planTmpLifecycleRead({successConfirmed:true,resultType:'object',ruleCount:2},source);
  assert.equal(p.status,'UNKNOWN');assert.equal(p.productionAuthority,false);
  assert.equal(evaluateTmpLifecycleRisk(p,{databaseReadVerified:true,total:2,published:0,orphan:0,matched:[]}).risk,'UNKNOWN');
});
