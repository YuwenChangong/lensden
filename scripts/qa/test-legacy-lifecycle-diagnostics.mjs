import test from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleFailureEvidence,lifecycleResponseShape} from './legacy-tmp-lifecycle-safety.mjs';

test('retains the allowlisted assertion first line, never the value diff',()=>{
  let error;try{assert.equal('PRIVATE_RULE_VALUE','READY','LIFECYCLE_RULE_SHAPE_UNPROVEN');}catch(e){error=e;}
  const r=lifecycleFailureEvidence(error,'VALIDATE');
  assert.equal(r.code,'LIFECYCLE_RULE_SHAPE_UNPROVEN');assert.equal(r.phase,'VALIDATE');
  assert(!JSON.stringify(r).includes('PRIVATE_RULE_VALUE'));
});
test('unknown error text, cause and phase are never copied',()=>{
  const r=lifecycleFailureEvidence(Object.assign(Error('private token'),{cause:Error('private url')}),'private phase');
  assert.deepEqual(r,{phase:'UNKNOWN',code:'READONLY_STAGE_FAILED_UNCLASSIFIED',rootCause:'UNKNOWN'});
});
test('known network codes are distinct from rule and receipt failures',()=>{
  assert.equal(lifecycleFailureEvidence(Object.assign(Error('hidden'),{cause:{code:'ECONNRESET'}}),'BODY').code,'ECONNRESET');
  assert.equal(lifecycleFailureEvidence(Error('PRIVATE_RECEIPT_READBACK'),'RECEIPT').code,'PRIVATE_RECEIPT_READBACK');
});
test('shape evidence omits rule IDs, prefixes, error bodies and unknown field names',()=>{
  const r=lifecycleResponseShape({success:true,result:{rules:[{id:'PRIVATE_ID',enabled:true,conditions:{prefix:'tmp/PRIVATE/'},PRIVATE_EXTENSION:'secret'}]},errors:[{message:'private'}]});
  assert.equal(r.ruleCount,1);assert.equal(r.rules[0].unknownRuleFields,true);
  assert(!JSON.stringify(r).includes('PRIVATE'));assert(!JSON.stringify(r).includes('secret'));
});
test('missing or unexpected result shape remains observable without accepting it',()=>{
  assert.equal(lifecycleResponseShape({success:true,result:[]}).resultType,'array');
  assert.equal(lifecycleResponseShape({success:true,result:{}}).rulesType,'missing');
  assert.equal(lifecycleResponseShape(null).successConfirmed,false);
});
test('shape projection remains bounded and never emits raw extra values',()=>{
  const r=lifecycleResponseShape({success:false,result:{rules:Array.from({length:129},()=>({conditions:{prefix:'private'}}))}});
  assert.equal(r.ruleCountOverLimit,true);assert.equal(r.rules.length,0);
  assert(!JSON.stringify(r).includes('private'));
});
