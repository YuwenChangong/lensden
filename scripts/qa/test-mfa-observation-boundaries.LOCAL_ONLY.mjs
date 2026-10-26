import test from 'node:test';
import assert from 'node:assert/strict';
import {installMfaStepupObservation} from './mfa-stepup-observation.mjs';

function fixture(failure=null){
 const handlers=new Map();let resolveChallenge,resolveVerify;
 const button={disabled:false,contains:node=>node===button},input={validity:{valid:true}},fieldset={disabled:false};
 for(const node of [button,input])Object.defineProperty(node,'value',{get(){throw Error('SECRET_MUST_NOT_BE_READ');}});
 const form={isConnected:true,querySelector:q=>q.startsWith('button')?button:input,closest:()=>fieldset,
  addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:(name,fn)=>{if(handlers.get(name)===fn)handlers.delete(name);}};
 const result=name=>({error:failure?.[name]??null});const auth={mfa:{challenge:()=>new Promise(r=>resolveChallenge=()=>r(result('challenge'))),verify:()=>new Promise(r=>resolveVerify=()=>r(result('verify')))},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
 const o=installMfaStepupObservation(form,auth);
 return {o,auth,form,button,input,fieldset,handlers,emit:(name,trusted=true,target=name==='invalid'?input:button)=>handlers.get(name)?.({isTrusted:trusted,target}),
  settleChallenge:()=>resolveChallenge(),settleVerify:()=>resolveVerify()};
}

test('bounded form diagnostics expose booleans, never code/factor values or global no-request claims',()=>{
 const f=fixture();try{f.button.disabled=true;f.input.validity.valid=false;f.fieldset.disabled=true;
  const s=f.o.snapshot();assert.equal(s.formState.verifyButtonDisabled,true);assert.equal(s.formState.codeValid,false);assert.equal(s.formState.fieldsetDisabled,true);assert.equal(s.observedStep,'NOT_SUBMITTED');assert.equal(s.observationScope,'BOUND_FORM_AND_WRAPPED_SDK_ONLY');assert.equal(s.actualNetworkDispatches,'UNKNOWN');
 }finally{f.o.detach();}assert.equal(f.handlers.size,0);
});
test('trusted click and invalid events explain no-submit without inventing a challenge',()=>{
 const f=fixture();try{f.emit('click');f.emit('invalid');const s=f.o.snapshot();assert.equal(s.uiEvents.trustedVerifyClicks,1);assert.equal(s.uiEvents.invalidCodeObserved,true);assert.equal(s.submitEvent,'UNKNOWN');assert.equal(s.challenge.invocations,0);}finally{f.o.detach();}
});
test('detached form is a real observer boundary, not NOT_SUBMITTED certainty',()=>{
 const f=fixture();try{f.form.isConnected=false;const s=f.o.snapshot();assert.equal(s.blocked,'MFA_OBSERVATION_FORM_DETACHED');assert.equal(s.observedStep,'UNKNOWN');assert.equal(s.cleanup,'PASS');assert.equal(f.handlers.size,0);}finally{f.o.detach();}
});
test('actual pending calls distinguish challenge and verify start from SDK verification success',async()=>{
 const f=fixture();try{f.emit('submit');const challenge=f.auth.mfa.challenge();assert.equal(f.o.snapshot().observedStep,'CHALLENGE_STARTED');f.settleChallenge();await challenge;
  const verify=f.auth.mfa.verify();assert.equal(f.o.snapshot().observedStep,'VERIFY_STARTED');f.settleVerify();await verify;
  assert.equal(f.o.snapshot().observedStep,'VERIFIED');assert.equal(f.o.snapshot().workerAal,'UNKNOWN');
 }finally{f.o.detach();}
});
test('actual returned challenge and verify errors have distinct stages',async()=>{
 const error={code:'mfa_verification_failed',status:400};
 const f=fixture({challenge:error});try{f.emit('submit');const c=f.auth.mfa.challenge();f.settleChallenge();await c;assert.equal(f.o.snapshot().observedStep,'CHALLENGE_FAILED');}finally{f.o.detach();}
 const g=fixture({verify:error});try{g.emit('submit');const c=g.auth.mfa.challenge();g.settleChallenge();await c;
  const v=g.auth.mfa.verify();g.settleVerify();await v;assert.equal(g.o.snapshot().observedStep,'VERIFY_FAILED');
 }finally{g.o.detach();}
});

test('explicit cleanup cannot certify a verified result after the bound form detaches',async()=>{
 const f=fixture();try{f.emit('submit');const c=f.auth.mfa.challenge();f.settleChallenge();await c;
  const v=f.auth.mfa.verify();f.settleVerify();await v;f.form.isConnected=false;
  const s=f.o.detach();assert.equal(s.blocked,'MFA_OBSERVATION_FORM_DETACHED');assert.equal(s.observedStep,'UNKNOWN');assert.equal(s.cleanup,'PASS');
 }finally{f.o.detach();}
});

test('deadline cleanup also fails closed when the form has detached',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 try{f.form.isConnected=false;t.mock.timers.tick(120000);const s=f.o.snapshot();assert.equal(s.active,false);assert.equal(s.blocked,'MFA_OBSERVATION_FORM_DETACHED');assert.equal(s.observedStep,'UNKNOWN');}
 finally{f.o.detach();t.mock.timers.reset();}
});

test('invalid events from another control are not attributed to the code input',()=>{
 const f=fixture();try{f.emit('invalid',true,f.button);assert.equal(f.o.snapshot().uiEvents.invalidCodeObserved,false);
  f.emit('invalid',true,f.input);assert.equal(f.o.snapshot().uiEvents.invalidCodeObserved,true);
 }finally{f.o.detach();}
});
