import {creationTimeEvidence} from './auth-a-creation-time-v2.mjs';
export const EXACT_A=Object.freeze({
 project:'xcbnxzjlsvtgzixurcof',id:'23c3c903-0687-4c6d-840c-f7f8a0d442db',
 email:'ogh-a-20a58bce-af26-41fc-8c8e-d5429cac0119@example.invalid',
 namespace:'ogh-pbeta-core-20261023-20a58bce-af26-41fc-8c8e-d5429cac0119',
 createdAt:'2026-10-23T06:14:43.159Z',
 comparisonPrecision:'UTC_MILLISECONDS_FROM_BOUND_RECEIPT',
 receiptPins:Object.freeze({
  actorJournal:'6dcbbf3c3f86762d3bfaaba7ccb6eb22948d5df0bb589eeb67d7f5e289783e97',
  creationRequest:'7545bb8651fff642c743666e600cc67c4436c6b7fd083b2e9c6dda7b4ff145be',
  creationResponse:'21e43c1316518de8354cb2eb89e2044779d68eb1ab3fc31d3a82300415fa7953',
  priorIdentityRead:'b532b6f86bdf4eddb1623b67ae5a3e4f64c2b66eff9cefb89ccae08023632f67',
  priorIdentityRequest:'a205d2c31e5d4f6b87f729f801b2632c489c5a7ba5b4e649ede665dfdcf94060',
  v2IdentityRead:'2d2ab08f89164694d80f0d87bd4b2cf2fc206db0bf6ec9761d938cca6b829b4e',
  v2CreationTime:'9f0b27846bb1b73777ea9bc072a60105c6d6874899d195f022be271c5d6d6c11',
  v2Stop:'192c545e4e5bc7d4e91ac5ec320b107cac1987b0146aa0200e747f41eff4b2b2'
 })
});
export function exactTimestampAdmission(user,context){
 const original=creationTimeEvidence(user,context?.window);
 const e={...original,OWNER_EXACT_TIMESTAMP_EXCEPTION_APPROVED:context?.ownerExceptionApproved===true,OWNER_EXACT_TIMESTAMP_EXCEPTION_APPLIED:false,EXACT_ACCOUNT_TIME_ADMISSION_RESULT:'FAIL',EXACT_ACCOUNT_TIME_ADMISSION_REASON:null,EXPECTED_SERVER_CREATED_AT_UTC:EXACT_A.createdAt};
 function reject(result,reason){e.EXACT_ACCOUNT_TIME_ADMISSION_RESULT=result;e.EXACT_ACCOUNT_TIME_ADMISSION_REASON=reason;return e;}
 if(context?.ownerExceptionApproved!==true)return reject('FAIL','EXACT_EXCEPTION_NOT_APPROVED');
 if(context.approvedPrecision!==EXACT_A.comparisonPrecision)return reject('FAIL','EXACT_PRECISION_NOT_APPROVED');
 if(context.project!==EXACT_A.project||context.expectedCreatedAt!==EXACT_A.createdAt||user?.id!==EXACT_A.id||user?.email!==EXACT_A.email||user?.user_metadata?.qa_namespace!==EXACT_A.namespace)return reject('FAIL','EXACT_IDENTITY_OR_POLICY_MISMATCH');
 if(!Object.entries(EXACT_A.receiptPins).every(([name,hash])=>context.receiptHashes?.[name]===hash))return reject('FAIL','EXACT_RECEIPT_HASH_MISMATCH');
 if(original.LOCAL_CREATION_WINDOW_UTC===null)return reject('UNKNOWN','CREATION_RECEIPT_BOUNDARIES_UNVERIFIED');
 if(original.CREATED_AT_PARSE_RESULT!=='VALID_EXPLICIT_TIMEZONE')return reject('UNKNOWN',original.CREATION_TIME_FAILURE_REASON);
 // Preserve full nonsecret input; admission uses only the separately approved receipt precision.
 e.PROVIDER_CREATED_AT_FULL_PRECISION_INPUT=user.created_at;
 e.EXACT_CREATED_AT_COMPARISON_PRECISION=EXACT_A.comparisonPrecision;
 const fraction=/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(user.created_at)?.[1]??'';
 const submillisecond=fraction.padEnd(3,'0').slice(3);
 e.FULL_PRECISION_INSTANT_EQUALITY=original.PROVIDER_CREATED_AT_UTC===EXACT_A.createdAt&&!/[1-9]/.test(submillisecond);
 if(original.PROVIDER_CREATED_AT_UTC!==EXACT_A.createdAt)return reject('FAIL','EXACT_SERVER_CREATED_AT_MISMATCH');
 e.OWNER_EXACT_TIMESTAMP_EXCEPTION_APPLIED=true;
 e.EXACT_ACCOUNT_TIME_ADMISSION_RESULT='PASS';
 e.EXACT_ACCOUNT_TIME_ADMISSION_REASON='OWNER_BOUND_EXACT_TIMESTAMP_ONLY_NOT_CLOCK_CORRECTION';
 return e;
}
export function approvalExecutionWindow(receivedUTC,now){
 const start=typeof receivedUTC==='string'?Date.parse(receivedUTC):NaN;
 if(!Number.isFinite(start)||new Date(start).toISOString()!==receivedUTC||!Number.isFinite(now)||now<start||now>=start+2700000)throw Error('OWNER_APPROVAL_WINDOW_NOT_ADMITTED');
 return {windowStartUTC:receivedUTC,windowEndUTC:new Date(start+3600000).toISOString(),latestAdmissionUTC:new Date(start+2700000).toISOString()};
}
