import {SharedBudget} from './gate.mjs';
import {catalogSteps} from './rls.mjs';
import {openGroup1Browser} from './browser.mjs';
import {installNodeGuard} from '../node-guard.mjs';
export async function runLoginDiagnostic({privateBinding,appOrigin,supabaseOrigin,staticManifest,transport,deployment,assertDeployment,
 openBrowser=openGroup1Browser,installGuard=installNodeGuard,onStage=()=>{},signal,observationMs=10000}={}){
 validatePrivateBinding(privateBinding);
 if(typeof transport!=='function'||typeof deployment!=='function'||typeof assertDeployment!=='function'||!Number.isSafeInteger(observationMs)||observationMs<0||observationMs>10000)throw new Error('DIAGNOSTIC_CAPABILITY_INVALID');
 const caps={...privateBinding.budget,allBrowserHttpDispatchesMax:Math.min(10,privateBinding.budget.allBrowserHttpDispatchesMax),applicationMutationDispatchesMax:0,cleanupMutationDispatchesMax:0,supabaseAuthDispatchesMax:0,supabaseRestReadDispatchesMax:0,supabaseRestWriteDispatchesMax:0,turnstileHttpDispatchesMax:Math.min(8,privateBinding.budget.turnstileHttpDispatchesMax),ownerSessionRefreshRequestsMax:0};
 const budget=new SharedBudget(caps);let browser,pre=null,post=null,firstFailure=null,clean=true,providerGETs=0,nodeBlocked=0;
 const check=()=>{if(signal?.aborted)throw new Error('WORK_DEADLINE')};
 const abort=()=>{budget.stop();void browser?.close()};signal?.addEventListener('abort',abort,{once:true});
 const dep=async()=>{check();budget.reserve(['allBrowserHttpDispatchesMax']);providerGETs++;return assertDeployment(await deployment())};
 try{
  browser=await openBrowser({caps,actor:'A',binding:privateBinding.accounts.A,appOrigin,supabaseOrigin,staticPaths:staticManifest.map(x=>x.path),staticManifest,transport,budget,headless:true,workMs:240000,readOnlyLoginDiagnostic:true});
  installGuard(()=>{nodeBlocked++;budget.stop()});pre=await dep();check();onStage('LOGIN_A');
  // No credential input, CAPTCHA solving, login permit or mutation is armed.
  await browser.navigate('/login/?next=%2Fproducts%2F');
  const until=performance.now()+observationMs;
  while(performance.now()<until){check();const r=browser.receipt();if(r.firstFailure)throw new Error(r.firstFailure);await new Promise(r=>setTimeout(r,25))}
  check();const r=browser.receipt();if(r.firstFailure)throw new Error(r.firstFailure);if(r.inFlight!==0)throw new Error('DIAGNOSTIC_INFLIGHT_NOT_SETTLED');
  post=await dep();if(pre.deploymentId!==post.deploymentId)throw new Error('DEPLOYMENT_CHANGED');
 }catch(error){firstFailure=safe(error);budget.stop()}
 finally{signal?.removeEventListener('abort',abort);try{await browser?.close()}catch{clean=false}}
 return{format:'e-verify-group1-login-diagnostic-safe-v1',status:!firstFailure&&clean?'DIAGNOSTIC_COMPLETE':'BLOCKED',firstFailure,providerGETs,
  diagnostics:browser?.receipt().diagnostics??null,counts:budget.receipt(),preDeployment:pre,postDeployment:post,cleanup:clean?'PASS':'BLOCKED',
  nodeBypassAttemptsBlocked:nodeBlocked,authDispatches:0,catalogCasesPassed:0,loginVerified:false,fullEVerify:'INCOMPLETE',publicBetaGo:'NOT_AUTHORIZED',retries:0};
}

export const EXECUTION_SECONDS=1800,WORK_SECONDS=1740;
export const actorPlan=Object.freeze(['A','B','ADMIN']);
export const requiredCases=Object.freeze(['AUTH-01','AUTH-02','AUTH-03','AUTH-04','AUTH-08:bounded-nonmail-partial','RLS-01','RLS-02','RLS-03','RLS-04','RLS-05','ADMIN-04:devices-read-partial','UI-01:core-partial','UI-02:core-partial','UI-03:core-partial']);
const safe=e=>/^[A-Z0-9_]{1,64}$/.test(e?.message)?e.message:'GROUP1_EXECUTION_FAILURE';
export function validatePrivateBinding(privateBinding){
 const b=privateBinding;
 if(!b?.accounts||!b?.budget||actorPlan.some(a=>{const x=b.accounts[a];return !x||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x.userId)||typeof x.email!=='string'||!x.email.includes('@')||(a==='ADMIN'?['exists','ownerControlled']:['exists','ownerControlled','dedicatedQA','legalConsentCurrent']).some(k=>x[k]!==true)||x.applicationRole!==(a==='ADMIN'?'admin':'user')})||new Set(actorPlan.map(a=>b.accounts[a].userId)).size!==3)throw new Error('PRIVATE_ACTOR_BINDING_INVALID');
 if(!Number.isSafeInteger(b.budget.executionSecondsMax)||b.budget.executionSecondsMax<EXECUTION_SECONDS)throw new Error('OWNER_TIME_BUDGET_INSUFFICIENT');
 return true;
}
// All browsers launch without navigation before ordinary Node egress is locked.
// Production access is possible only through the separately authorized fixed child.
export async function runGroup1({privateBinding,appOrigin,supabaseOrigin,staticManifest,transport,deployment,assertDeployment,
 pageAssertions={},openBrowser=openGroup1Browser,installGuard=installNodeGuard,onStage=()=>{},manualWaitMs=300000,signal}={}){
 validatePrivateBinding(privateBinding);if(typeof transport!=='function'||typeof deployment!=='function'||typeof assertDeployment!=='function')throw new Error('FIXED_CAPABILITIES_REQUIRED');
 const budget=new SharedBudget(privateBinding.budget),instances=[],results=[];let pre=null,post=null,rls=0,auth=0,negative=0,firstFailure=null,clean=true,nodeBlocked=0;
 const stage=value=>{try{onStage(value)}catch{throw new Error('STAGE_OBSERVER_FAILED')}};
 const check=()=>{if(signal?.aborted)throw new Error('WORK_DEADLINE')};
 const dep=async()=>{check();budget.reserve(['allBrowserHttpDispatchesMax']);const r=await deployment();return assertDeployment(r)};
 const closeAll=async()=>{await Promise.all(instances.map(async x=>{try{await x.browser.close()}catch{clean=false}}))};
 const abort=()=>{budget.stop();void closeAll()};signal?.addEventListener('abort',abort,{once:true});
 try{
  for(const [actor,kind]of [...actorPlan.map(a=>[a,'success']),['A','invalid-captcha'],['A','missing-captcha'],['A','wrong-password']]){
   check();const browser=await openBrowser({caps:privateBinding.budget,actor,binding:privateBinding.accounts[actor],appOrigin,supabaseOrigin,staticPaths:staticManifest.map(x=>x.path),staticManifest,pageAssertions,transport,budget,headless:false,workMs:WORK_SECONDS*1000});instances.push({actor,kind,browser});
  }
  installGuard(()=>{nodeBlocked++;budget.stop()});pre=await dep();
  for(const x of instances){
   check();stage(x.kind==='success'?`LOGIN_${x.actor}`:x.kind==='invalid-captcha'?'NEGATIVE_CAPTCHA':x.kind==='missing-captcha'?'NEGATIVE_MISSING_CAPTCHA':'NEGATIVE_PASSWORD');
   x.browser.permitLogin(x.kind);await x.browser.navigate('/login/?next=%2Fproducts%2F');
   // Owner enters credentials and completes real Turnstile in this visible tab.
   if(x.kind!=='success'){await x.browser.waitForNegative(manualWaitMs);negative++;await x.browser.close();continue}
   await x.browser.waitForSession(manualWaitMs);await x.browser.waitForLanding();check();await x.browser.verifyActor();auth++;
   for(const step of catalogSteps().filter(s=>s.actor===x.actor||(x.actor==='A'&&s.actor==='anon'))){check();await x.browser.catalog(step.id);rls++}
   await x.browser.navigate('/products/xreal/xreal-air/');await x.browser.page.waitForSelector('[data-product-detail]');
   await x.browser.adminRead();await x.browser.navigate('/admin/devices/');await x.browser.assertAdminUi();
   await x.browser.logout();results.push({actor:x.actor,identity:'PASS',catalogCases:x.actor==='ADMIN'?0:x.actor==='A'?11:5,adminRead:x.actor==='ADMIN'?'ALLOWED':'DENIED',logout:'PASS'});
   await x.browser.close();
  }
  check();post=await dep();if(pre.deploymentId!==post.deploymentId)throw new Error('DEPLOYMENT_CHANGED');
  if(rls!==16||auth!==3||negative!==3)throw new Error('REQUIRED_STEPS_MISSING');stage('FINISHED');
 }catch(e){firstFailure=safe(e);budget.stop()}
 finally{signal?.removeEventListener('abort',abort);await closeAll()}
 return {format:'e-verify-group1-safe-v1',status:!firstFailure&&clean?'PASS':'BLOCKED',firstFailure,requestDiagnostics:instances.map(x=>x.browser.receipt().diagnostics),actors:results,identitiesVerified:auth,negativeAuthPassed:negative,catalogCasesPassed:rls,catalogCasesRequired:16,preDeployment:pre,postDeployment:post,counts:budget.receipt(),nodeBypassAttemptsBlocked:nodeBlocked,cleanup:clean?'PASS':'BLOCKED',retries:0,credentialValuesRecorded:false,fullEVerify:'INCOMPLETE',publicBetaGo:'NOT_AUTHORIZED'};
}
