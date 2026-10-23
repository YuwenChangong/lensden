import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {creationRequestWindow,creationTimeEvidence,CREATION_TIME_TOLERANCE_MS} from './auth-a-creation-time-v2.mjs';
const base='C:/Temp/ogh-public-beta-core-acceptance-20261023';
const root='C:/Users/1/AppData/Local/OpenGlassHub/core-acceptance-20261023-20a58bce';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const need=(x,c)=>{if(!x)throw Error(c);};
const id='23c3c903-0687-4c6d-840c-f7f8a0d442db';
const actorEmail='ogh-a-20a58bce-af26-41fc-8c8e-d5429cac0119@example.invalid';
const namespace='ogh-pbeta-core-20261023-20a58bce-af26-41fc-8c8e-d5429cac0119';
let p,binding,admin,management,started,reads=0,writes=0,logReads=0,banVerified=false,pre,post,creationWindow;
const ownerFile=path.join(root,'AUTH_A_CONTAINMENT.v2.owner.safe.json');
function save(name,v){const b=Buffer.from(JSON.stringify(v,null,2)+'\n'),f=path.join(root,name),fd=fs.openSync(f,'wx',0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}need(fs.readFileSync(f).equals(b),'EVIDENCE_READBACK');}
function gate(){need(Date.now()>=Date.parse(p.windowStartUTC)&&Date.now()<Date.parse(p.windowEndUTC),'WINDOW');need(Date.now()-started<90000,'OVERALL_DEADLINE');}
function userProjection(v,stage){
 const u=v.user??v;
 need(u.id===id&&u.email===actorEmail&&u.user_metadata?.qa_namespace===namespace,'ACTOR_IDENTITY_MISMATCH');
 const time=creationTimeEvidence(u,creationWindow);
 const transport=JSON.parse(fs.readFileSync(path.join(root,'containment-v2-'+stage+'.http.safe.json')));
 save('containment-v2-'+stage+'.creation-time.safe.json',{binding,actorId:id,...time,providerResponseDateUTC:transport.providerResponseDateUTC,localGetRequestUTC:transport.localRequestUTC,localGetResponseUTC:transport.utc,clockEvidenceScope:'CURRENT_RESPONSE_DATE_ONLY_NOT_HISTORICAL_CREATION_CLOCK_PROOF_NO_SKEW_ADJUSTMENT'});
 need(time.CREATION_TIME_VALIDATION_RESULT==='PASS','CREATION_TIME_'+time.CREATION_TIME_VALIDATION_RESULT);
 return {identityMatch:true,emailConfirmed:!!u.email_confirmed_at,emailConfirmationEvidence:u.email_confirmed_at?'CONFIRMED_TIMESTAMP':'NO_TIMESTAMP_NOT_HISTORICAL_CAUSE',lastSignInPresent:!!u.last_sign_in_at,lastSignInExplicitlyAbsent:Object.hasOwn(u,'last_sign_in_at')&&u.last_sign_in_at===null,bannedUntil:u.banned_until??null};
}
async function call(label,method,url,secret,body,isLog=false){
 gate();need(!fs.existsSync(path.join(root,'containment-v2-'+label+'.used')),'STAGE_ALREADY_CONSUMED');
 if(isLog)need(++logReads<=1,'LOG_BUDGET');else if(method==='GET')need(++reads<=2,'AUTH_READ_BUDGET');else need(method==='PUT'&&++writes<=1,'BAN_BUDGET');
 const localRequestUTC=new Date().toISOString();
 save('containment-v2-'+label+'.used',{binding,label,method,utc:localRequestUTC,retries:0});
 const headers={Authorization:'Bearer '+secret};if(!isLog)headers.apikey=secret;if(body)headers['Content-Type']='application/json';
 let r;try{r=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(Math.min(10000,90000-(Date.now()-started)))});}catch{throw Error('REQUEST_'+label.toUpperCase()+'_UNCONFIRMED');}
 let n=0;const chunks=[];for await(const chunk of r.body){n+=chunk.length;need(n<=(isLog?32768:131072),'RESPONSE_BOUNDS');chunks.push(chunk);}
 let v;try{v=JSON.parse(Buffer.concat(chunks));}catch{throw Error('INVALID_RESPONSE_JSON');}
 const known=new Set(['email_not_confirmed','invalid_credentials','captcha_failed','user_banned','validation_failed','unexpected_failure']);
 const errorCode=[v?.error_code,v?.code,v?.error].find(x=>typeof x==='string'&&known.has(x))??null;
 const providerDate=Date.parse(r.headers.get('date'));
 save('containment-v2-'+label+'.http.safe.json',{binding,label,status:r.status,errorCode,localRequestUTC,providerResponseDateUTC:Number.isFinite(providerDate)?new Date(providerDate).toISOString():null,utc:new Date().toISOString(),bodyPersisted:false});
 need(r.ok,'HTTP_'+r.status+'_'+label.toUpperCase());return v;
}
try{
 need(fs.existsSync(ownerFile),'FRESH_OWNER_APPROVAL_REQUIRED');
 const b=fs.readFileSync(path.join(base,'AUTH_A_CONTAINMENT.v2.NOT_AUTHORIZED.json'));binding=sha(b);p=JSON.parse(b);
 const owner=JSON.parse(fs.readFileSync(ownerFile));
 need(owner.independentlyVerifiedActualOwnerMessage===true&&owner.AUTH_A_CONTAINMENT_V2_BINDING_SHA256===binding&&Object.entries(p.ownerApprovalRequired).every(([k,v])=>owner[k]===v),'EXACT_OWNER_APPROVAL');
 need(sha(fs.readFileSync(fileURLToPath(import.meta.url)))===p.localExecutorSHA256,'EXECUTOR_IDENTITY');
 need(sha(fs.readFileSync(new URL('./auth-a-creation-time-v2.mjs',import.meta.url)))===p.creationTimeHelperSHA256&&p.creationEvidence.toleranceMs===CREATION_TIME_TOLERANCE_MS,'TIME_HELPER_IDENTITY');
 for(const e of [p.creationEvidence.request,p.creationEvidence.response])need(sha(fs.readFileSync(e.path))===e.sha256,'CREATION_RECEIPT_HASH');
 creationWindow=creationRequestWindow(JSON.parse(fs.readFileSync(p.creationEvidence.request.path)),JSON.parse(fs.readFileSync(p.creationEvidence.response.path)),p.parentBinding);
 need(creationWindow.verified,'CREATION_RECEIPT_BOUNDARIES_UNVERIFIED');
 need(p.project==='xcbnxzjlsvtgzixurcof'&&p.authOrigin==='https://xcbnxzjlsvtgzixurcof.supabase.co'&&p.managementOrigin==='https://api.supabase.com'&&p.actor.id===id&&p.actor.email===actorEmail&&p.actor.namespace===namespace,'FIXED_TARGET');
 need(sha(fs.readFileSync(p.actor.journalPath))===p.actor.journalSHA256,'ACTOR_JOURNAL_HASH');
 need(sha(fs.readFileSync(path.join(base,'AUTH_A_LOGIN_ERROR_QUERY.NOT_AUTHORIZED.sql')))===p.logQuerySHA256,'QUERY_IDENTITY');
 started=Date.now();gate();need(Date.now()<Date.parse(p.latestAdmissionUTC),'ADMISSION_DEADLINE');
 save('containment-v2-execution.used',{binding,utc:new Date().toISOString(),retries:0});
 admin=process.env.QA_SUPABASE_SERVICE_ROLE_KEY;need(process.env.QA_SUPABASE_URL===p.authOrigin&&typeof admin==='string','EXISTING_ADMIN_SOURCE');
 let claims;try{claims=JSON.parse(Buffer.from(admin.split('.')[1],'base64url'));}catch{throw Error('ADMIN_CLAIMS_UNVERIFIED');}
 need(claims.ref===p.project&&claims.role==='service_role'&&(!claims.exp||claims.exp*1000>Date.now()),'ADMIN_PROJECT_ROLE');
 const endpoint=p.authOrigin+'/auth/v1/admin/users/'+id;
 pre=userProjection(await call('precheck','GET',endpoint,admin),'precheck');save('containment-v2-precheck.state.safe.json',{binding,...pre});
 const minUntil=Date.now()+876000*3600000-120000;
 need(p.operations[1].body.ban_duration==='876000h','EXACT_BAN_DURATION');
 if(!(Date.parse(pre.bannedUntil)>=minUntil))userProjection(await call('ban','PUT',endpoint,admin,{ban_duration:'876000h'}),'ban');
 post=userProjection(await call('readback','GET',endpoint,admin),'readback');need(Date.parse(post.bannedUntil)>=minUntil,'BAN_READBACK_NOT_CONFIRMED');
 banVerified=true;save('containment-v2-ban.safe.json',{binding,status:'BAN_VERIFIED',actorId:id,...post,existingAccessJwtRevocation:'NOT_PROVEN_BY_BAN',utc:new Date().toISOString()});
 let related=false,authCode='UNKNOWN';
 try{
 management=process.env.SUPABASE_ACCESS_TOKEN;need(typeof management==='string'&&management.length>0,'EXISTING_LOG_READ_ACCESS_UNAVAILABLE');
 const url=new URL(p.managementOrigin+p.operations[3].path);url.searchParams.set('sql',fs.readFileSync(path.join(base,'AUTH_A_LOGIN_ERROR_QUERY.NOT_AUTHORIZED.sql'),'utf8'));url.searchParams.set('iso_timestamp_start',p.operations[3].iso_timestamp_start);url.searchParams.set('iso_timestamp_end',p.operations[3].iso_timestamp_end);
 const logs=await call('logs','GET',url,management,undefined,true);need(!logs.error&&Array.isArray(logs.result),'LOG_QUERY_RESULT');need(logs.result.length<5,'LOG_RESULT_TRUNCATION_UNRESOLVED');
 const rows=logs.result,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 const known=new Set(['email_not_confirmed','invalid_credentials','captcha_failed','user_banned','email_provider_disabled','validation_failed','bad_json','unexpected_failure','over_request_rate_limit','invalid_grant']);
 related=rows.length>0&&rows.every(v=>uuid.test(v.request_id??'')&&known.has(v.error_code)&&Number(v.status)===400&&v.method==='POST'&&['/token','/auth/v1/token'].includes(v.path)&&v.grant_type==='password'&&Date.parse(v.timestamp)>=Date.parse('2026-10-23T06:15:20Z')&&Date.parse(v.timestamp)<=Date.parse('2026-10-23T06:15:25Z'))&&new Set(rows.map(v=>v.request_id)).size===1&&new Set(rows.map(v=>v.error_code)).size===1;
 save('containment-v2-diagnosis.safe.json',{binding,authErrorCode:related?rows[0].error_code:'UNKNOWN',requestCorrelation:related?rows[0].request_id:null,correlationBasis:related?'EXACT_SYNTHETIC_IDENTITY_QUERY_PATH_GRANT_STATUS_WINDOW_UNIQUE_PROVIDER_REQUEST':'NOT_ESTABLISHED',rows:rows.length,rawLogsPersisted:false,rootCause:related?'PROVIDER_ERROR_CODE_OBSERVED_NOT_PROOF_OF_SPECIFIC_PASSWORD_DEFECT':'UNKNOWN'});
 authCode=related?rows[0].error_code:'UNKNOWN';
 }catch(e){
  const reason=/^[A-Z][A-Z0-9_]+$/.test(e.message??'')?e.message:'HISTORICAL_DIAGNOSIS_UNAVAILABLE';
  save('containment-v2-diagnosis.failure.safe.json',{binding,authErrorCode:'UNKNOWN',reason,banVerified,additionalRequests:0,retries:0});
 }
 let credentialStatus='PROTECTED_RETAINED';
 if(pre.lastSignInExplicitlyAbsent&&post.lastSignInExplicitlyAbsent){
  gate();const evidence=JSON.parse(fs.readFileSync(path.join(root,'request-A-login.safe.json')));need(evidence.status===400,'PRIOR_LOGIN_EVIDENCE');
  need(fs.readdirSync(root).filter(n=>/^credentials-\d+\.dpapi$/.test(n)).length===2,'CREDENTIAL_ENVELOPE_SCOPE');
  for(const entry of p.localCredentialCleanup.files){need(path.dirname(entry.path).replaceAll('\\','/')===root&&!fs.lstatSync(entry.path).isSymbolicLink(),'CREDENTIAL_TARGET');need(sha(fs.readFileSync(entry.path))===entry.sha256,'CREDENTIAL_HASH');}
  save('containment-v2-credential-unlink-admission.safe.json',{binding,banVerified:true,lastSignInAbsent:true,hashesMatched:true,decryption:0,utc:new Date().toISOString()});
  for(const entry of p.localCredentialCleanup.files)fs.unlinkSync(entry.path);
  need(p.localCredentialCleanup.files.every(v=>!fs.existsSync(v.path)),'CREDENTIAL_UNLINK_UNCONFIRMED');credentialStatus='EXACT_CIPHERTEXT_FILES_UNLINKED_NO_DECRYPTION_NOT_FORENSIC_ERASURE';
 }
 save('AUTH_A_CONTAINMENT.v2.EXECUTION.safe.json',{binding,status:'CONTAINMENT_COMPLETE',syntheticADisableStatus:'VERIFIED',authFailureRootCause:authCode,banVerified,credentialStatus,authReads:reads,banUpdates:writes,logReads,loginAttempts:0,accountCreations:0,retries:0,rawRecordsPersisted:false,publicBetaGo:'NOT_AUTHORIZED'});
 console.log(JSON.stringify({status:'CONTAINMENT_COMPLETE',syntheticADisableStatus:'VERIFIED',banVerified,credentialStatus,authErrorCode:authCode,authReads:reads,banUpdates:writes,logReads,loginAttempts:0,retries:0}));
}catch(e){
 const reason=/^[A-Z][A-Z0-9_]+$/.test(e.message??'')?e.message:'CONTAINMENT_UNCONFIRMED';
 if(binding)save('AUTH_A_CONTAINMENT.v2.failure.safe.json',{binding,reason,banVerified,credentialStatus:'PROTECTED_RETAINED_OR_PARTIAL_UNLINK_UNKNOWN_CHECK_EXACT_FILES',authReads:reads,banUpdates:writes,logReads,loginAttempts:0,retries:0});
 console.log(JSON.stringify({status:'BLOCKED',reason,banVerified,authReads:reads,banUpdates:writes,logReads,loginAttempts:0,retries:0}));process.exitCode=1;
}finally{admin=null;management=null;}
