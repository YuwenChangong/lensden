import {SharedBudget} from '../e-verify-group1-v9-closure/gate.mjs';
import {installNodeGuard} from '../e-verify-group1-script-identity/execution/node-guard.mjs';

// Browser-version regression only: no Catalog matrix, negative Auth suite or admin writes.
export async function runChromeSubset(options){
 const {privateBinding,openBrowser,signal}=options;
 const budget=new SharedBudget(privateBinding.budget),instances=[];
 const mode=process.env.CHROME_TEST_MODE||'smoke';let failure=null,identities=0,logout=false,isolated=false,hydrated=false;
 let beforeForbidden=0,afterForbidden=0;
 try{
  for(const actor of ['A','B','ADMIN'])instances.push({actor,browser:await openBrowser({...options,caps:privateBinding.budget,actor,binding:privateBinding.accounts[actor],budget,workMs:60000})});
  installNodeGuard();
  const a=instances[0].browser,b=instances[1].browser;
  if(mode==='budget'){for(let i=0;i<649;i++)budget.reserve(['allBrowserHttpDispatchesMax'])}
  a.permitLogin('success');await a.navigate('/login/?next=%2Fproducts%2F');
  await a.page.waitForSelector('input[type=email]');
  for(let i=0;i<100;i++){hydrated=await a.page.evaluate(()=>[...document.querySelectorAll('astro-island')].every(x=>!x.hasAttribute('ssr')));if(hydrated||a.receipt().firstFailure)break;await new Promise(r=>setTimeout(r,50))}
  if(mode==='forbidden'){
   beforeForbidden=a.receipt().wireDispatches;
   await a.page.evaluate(async()=>{try{await fetch('https://not-approved.example.invalid/secret-route?token=DO_NOT_LOG')}catch{}});
   await new Promise(r=>setTimeout(r,200));afterForbidden=a.receipt().wireDispatches;
   failure=a.receipt().firstFailure;
  }else{
   await a.waitForSession();await a.waitForLanding();await a.verifyActor();identities++;
   if(mode==='wrong-identity')throw new Error('WRONG_IDENTITY_NOT_REFUSED');
   await a.logout();logout=true;
   await b.navigate('/login/?next=%2Fproducts%2F');await b.page.waitForSelector('input[type=email]');
   isolated=!b.receipt().sessionPresent&&await b.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.endsWith('-auth-token')).length===0);
   if(!isolated)throw new Error('ISOLATION_FAILED');
   const forbiddenChannels=await b.page.evaluate(()=>['RTCPeerConnection','WebTransport','Worker','SharedWorker','EventSource'].every(k=>typeof globalThis[k]==='undefined'));
   if(!forbiddenChannels)throw new Error('CHANNEL_NOT_BLOCKED');
  }
  if(signal?.aborted)throw new Error('WORK_DEADLINE');
 }catch(e){failure=instances.map(x=>x.browser.receipt().firstFailure).find(Boolean)||(/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'OFFLINE_SUBSET_FAILURE')}
 let clean=true;for(const {browser} of instances)try{await browser.close()}catch{clean=false}
 return {status:!failure&&clean?'PASS':'BLOCKED',firstFailure:failure,identitiesVerified:identities,catalogCasesPassed:0,negativeAuthPassed:0,counts:budget.receipt(),
  actors:instances.map(({actor,browser})=>({actor,closed:browser.receipt().closed})),cleanup:clean?'PASS':'BLOCKED',hydrated,logout,isolated,
  forbiddenDispatchDelta:afterForbidden-beforeForbidden,requestDiagnostics:instances.map(x=>x.browser.receipt().diagnostics),credentialValuesRecorded:false};
}
