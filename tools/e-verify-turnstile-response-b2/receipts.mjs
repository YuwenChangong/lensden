import {validSafeResponse}from'./response-diagnostics.mjs';
const booleans=v=>v&&['renderStarted','renderReturned','callback'].every(k=>typeof v[k]==='boolean');
const code=x=>typeof x==='string'&&/^[A-Z0-9_]{1,64}$/.test(x)?x:null;
const executionStates=new Set(['BLOCKED','SDK_RESPONSE_OBSERVED','OBSERVED_ISOLATED_VENDOR_CHAIN']);
export function makeReceipt(result,{responseOnly=false}={}){
 const stages=booleans(result.status)?result.status:{renderStarted:false,renderReturned:false,callback:false};
 const cleanupStatus=result.cleanup===true?'PASS':'FAILED';
 const failureCode=code(result.firstFailure)||(cleanupStatus==='FAILED'?'CLEANUP_FAILED':null);
 const complete=!responseOnly&&!failureCode&&cleanupStatus==='PASS'&&stages.renderStarted&&stages.renderReturned&&stages.callback&&result.registeredFrames>=1;
 const responseObserved=responseOnly&&result.sdkResponseObserved===true&&!failureCode&&cleanupStatus==='PASS'&&!Object.values(stages).some(Boolean)&&result.registeredFrames===0;
 const {status,firstFailure,cleanup,...rest}=result;
 return{...rest,format:'isolated-turnstile-safe-v2',executionStatus:complete?'OBSERVED_ISOLATED_VENDOR_CHAIN':responseObserved?'SDK_RESPONSE_OBSERVED':'BLOCKED',
  failureStage:failureCode||!complete&&!responseObserved?(cleanupStatus==='FAILED'&&!result.firstFailure?'CLEANUP':stages.renderStarted?'WIDGET_INIT':'SDK_LOAD'):null,
  failureCode:failureCode||(!complete&&!responseObserved?'TARGET_NOT_OBSERVED':null),stageResults:{renderStarted:stages.renderStarted,renderReturned:stages.renderReturned,callback:stages.callback},cleanupStatus,
  responses:Array.isArray(result.responses)?result.responses:[]};
}
export function readReceipt(raw){
 if(raw?.format==='isolated-turnstile-safe-v2'){
  if(!executionStates.has(raw.executionStatus)||!booleans(raw.stageResults)||Object.keys(raw.stageResults).length!==3||!['PASS','FAILED'].includes(raw.cleanupStatus)||!Array.isArray(raw.responses)||raw.responses.length>40||!raw.responses.every(validSafeResponse)||raw.failureCode!==null&&!code(raw.failureCode)||![null,'SDK_LOAD','WIDGET_INIT','CLEANUP'].includes(raw.failureStage))throw new Error('RECEIPT_SCHEMA');
  if(raw.executionStatus==='BLOCKED'&&!code(raw.failureCode))throw new Error('RECEIPT_SCHEMA');
  if(raw.executionStatus!=='BLOCKED'&&(raw.failureCode!==null||raw.cleanupStatus!=='PASS'))throw new Error('RECEIPT_SCHEMA');
  if(raw.executionStatus==='OBSERVED_ISOLATED_VENDOR_CHAIN'&&(!Object.values(raw.stageResults).every(Boolean)||raw.registeredFrames<1))throw new Error('RECEIPT_SCHEMA');
  if(raw.executionStatus==='SDK_RESPONSE_OBSERVED'&&raw.sdkResponseObserved!==true)throw new Error('RECEIPT_SCHEMA');
  return structuredClone(raw);
 }
 if(raw?.format==='isolated-turnstile-safe-v1'){
  const result=makeReceipt(raw);return{...result,historicalFormat:raw.format,historicalResponseMetadata:'NOT_RETAINED'};
 }
 throw new Error('RECEIPT_SCHEMA');
}
export function finalizeReceipt(child,supervisor){
 let parsed=null;try{if(child)parsed=readReceipt(child)}catch{}
 const containment=supervisor?.classification==='EXIT_ZERO'&&supervisor?.containment?.closed===true&&supervisor?.reaped===true;
 return{format:'isolated-turnstile-final-v2',executionStatus:containment&&parsed?.executionStatus==='SDK_RESPONSE_OBSERVED'&&parsed.cleanupStatus==='PASS'?'SDK_RESPONSE_DIAGNOSTIC_COMPLETE':'BLOCKED',
  failureCode:parsed?.failureCode||(!parsed?'CHILD_RECEIPT_MISSING_OR_INVALID':!containment?'SUPERVISOR_OR_CONTAINMENT_FAILED':parsed.cleanupStatus!=='PASS'?'CLEANUP_FAILED':parsed.executionStatus!=='SDK_RESPONSE_OBSERVED'?'REQUIRED_TARGET_NOT_OBSERVED':null),
  failureStage:parsed?.failureStage||(!containment?'SUPERVISOR':null),stageResults:parsed?.stageResults||null,
  cleanupStatus:parsed?.cleanupStatus||'UNKNOWN',containmentClosed:supervisor?.containment?.closed===true,childReceiptPresent:!!child,
  responses:parsed?.responses||[],productionRequests:0,productionWrites:0,fullGroup1Authorized:false,publicBetaGo:false};
}
