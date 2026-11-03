import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {runSupervised} from '../e-verify-group1-remaining-assets/supervisor.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
async function run(mode,deadlineMs=100000){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-group1-v9-')),output=path.join(dir,'mock.safe.json');let started=false;
 const supervisor=await runSupervised({entry:path.join(here,'mock-child.mjs'),cwd:here,args:[output,mode],deadlineMs,graceMs:3000,reserveMs:5000,
   env:Object.fromEntries(['APPDATA','LOCALAPPDATA','USERPROFILE','SystemRoot','TEMP','TMP'].map(k=>[k,process.env[k]])),receiptPath:path.join(dir,'supervisor.safe.json'),onMessage:e=>{if(e.type==='phase')started=true}});
 return {supervisor,started,output,result:fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):null};
}
test('actual scoped Chrome+SDK flow uses saved500 cap, reaches3 identities/16RLS, stops before over-budget dispatch',async()=>{
 const r=await run('normal');assert.equal(r.supervisor.classification,'EXIT_ZERO');assert.equal(r.supervisor.containment.closed,true);assert.equal(r.supervisor.receiptMissing,false);
 assert.equal(r.result.result.status,'BLOCKED');assert.equal(r.result.result.counts.allBrowserHttpDispatchesMax,500);
 assert.equal(r.result.result.identitiesVerified,3);assert.equal(r.result.result.catalogCasesPassed,16);assert.equal(r.result.result.negativeAuthPassed,2);
 assert.ok(r.result.result.requestDiagnostics.some(d=>d?.firstRejection?.rejectionCategory==='BUDGET_EXCEEDED'));
 assert.equal(r.result.result.postDeployment,null);assert.equal(r.result.providerFixtureGETs,1);
 assert.equal(r.result.proxyForwardedRequests,0);assert.ok(r.result.actualOfflineDispatchCount<=500);assert.equal(r.result.result.cleanup,'PASS');
 assert.doesNotMatch(JSON.stringify(r.result),/SYNTHETIC_ACCESS|SYNTHETIC_REFRESH|SYNTHETIC_ONLY|qa-[ab]@|00000000-0000/);
 process.stdout.write('OFFLINE_TRACE_SAFE_PATH='+r.output+'\n');
});
test('wrong login UUID is refused before identity/RLS and all Chrome contexts close',async()=>{
 const r=await run('wrong-identity');assert.equal(r.supervisor.classification,'EXIT_ZERO');assert.equal(r.supervisor.containment.closed,true);
 assert.equal(r.result.result.firstFailure,'SESSION_IDENTITY');assert.equal(r.result.result.identitiesVerified,0);assert.equal(r.result.result.catalogCasesPassed,0);assert.equal(r.result.result.cleanup,'PASS');
});
test('small global budget stops actual concurrent initialization before four dispatches',async()=>{
 const r=await run('low-budget');assert.equal(r.supervisor.classification,'EXIT_ZERO');assert.equal(r.supervisor.containment.closed,true);
 assert.equal(r.result.result.counts.allBrowserHttpDispatchesMax,3);assert.ok(r.result.actualOfflineDispatchCount<=3);assert.equal(r.result.result.counts.supabaseAuthDispatchesMax,0);
});
test('native hard deadline drains a genuinely launched Chrome process tree',async()=>{
 const r=await run('hang',22000);assert.equal(r.started,true);assert.equal(r.supervisor.classification,'TIMEOUT');assert.equal(r.supervisor.containment.closed,true);assert.equal(r.supervisor.reaped,true);assert.equal(r.result,null);
});
test('loopback-only counterfactual measurement never changes or approves owner500',async()=>{
 const r=await run('measurement');assert.equal(r.supervisor.classification,'EXIT_ZERO');assert.equal(r.supervisor.containment.closed,true);
 assert.equal(r.result.result.status,'PASS');assert.equal(r.result.result.identitiesVerified,3);assert.equal(r.result.result.catalogCasesPassed,16);assert.equal(r.result.result.negativeAuthPassed,3);
 assert.equal(r.result.providerFixtureGETs,2);assert.equal(r.result.measurementOnly,true);assert.equal(r.result.productionCompatible,false);assert.equal(r.result.approvedGlobalMax,500);
 assert.equal(r.result.savedOwnerCapsUnchanged,true);assert.equal(r.result.productionRequests,0);assert.equal(r.result.proxyForwardedRequests,0);
 process.stdout.write('COUNTERFACTUAL_TRACE_SAFE_PATH='+r.output+'\n');
});
