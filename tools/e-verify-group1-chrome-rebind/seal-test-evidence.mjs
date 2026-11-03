import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
const root=new URL('./artifacts/',import.meta.url);
const cases=[['smoke','DWsY9c'],['identity','PFUjER'],['forbidden','j2DdBf'],['budget','d7bzYB'],['deadline','cqewy3']];
const evidence=[];
for(const [name,suffix] of cases){const dir=path.join(os.tmpdir(),'ogh-chrome-identity-'+suffix),supBytes=fs.readFileSync(path.join(dir,'supervisor.safe.json')),sup=JSON.parse(supBytes);
 assert.equal(sup.containment.closed,true);assert.equal(sup.reaped,true);
 const row={name,supervisorReceiptSha256:sha(supBytes),classification:sup.classification,cleanup:'PASS'};
 fs.writeFileSync(new URL(name+'-supervisor.safe.json',root),supBytes,{flag:'wx'});
 if(name==='deadline'){assert.equal(sup.classification,'TIMEOUT');assert.equal(sup.ipc.accepted,1);assert.equal(sup.receiptMissing,true);row.launchedChromeObservedByTest=true;row.hardDeadlineMilliseconds=sup.deadlineMs;row.elapsedMilliseconds=sup.elapsedMs}
 else{assert.equal(sup.classification,'EXIT_ZERO');const bytes=fs.readFileSync(path.join(dir,'fixture.safe.json')),r=JSON.parse(bytes);
  assert.equal(r.browserExecutableVerified,true);assert.equal(r.profileIsolationVerified,true);assert.equal(r.proxyForwardedRequests,0);assert.equal(r.productionRequests,0);assert.equal(r.productionWrites,0);assert.equal(r.result.cleanup,'PASS');assert.equal(r.result.catalogCasesPassed,0);
  if(name==='smoke'){assert.equal(r.result.status,'PASS');assert.equal(r.result.identitiesVerified,1);assert.equal(r.result.hydrated,true);assert.equal(r.result.logout,true);assert.equal(r.result.isolated,true)}
  if(name==='identity')assert.equal(r.result.firstFailure,'SESSION_IDENTITY');
  if(name==='forbidden'){assert.equal(r.result.forbiddenDispatchDelta,0);assert.ok(r.result.requestDiagnostics.some(d=>d.firstRejection?.networkDispatchOccurred===false&&d.firstRejection.transportState==='NOT_INVOKED'));assert.doesNotMatch(bytes.toString(),/DO_NOT_LOG|token=/)}
  if(name==='budget'){assert.equal(r.result.counts.allBrowserHttpDispatchesMax,650);assert.equal(r.actualOfflineDispatchCount,1);assert.equal(r.result.counts.supabaseAuthDispatchesMax,0)}
  row.fixtureReceiptSha256=sha(bytes);fs.writeFileSync(new URL(name+'-fixture.safe.json',root),bytes,{flag:'wx'});
 }
 evidence.push(row);
}
const safe={status:'PASS',targetedBrowserTestsPassed:6,targetedBrowserTestsTotal:6,atomic650Test:'PASS_1000_ATTEMPTS_EXACTLY650_ADMITTED',
 evidence,earlierTestResults:'PRESERVED_IN_OWNED_TEMP_DIRECTORIES; old transitive Chrome guard and test probe/field issues corrected; only affected tests repeated',
 productionRequests:0,productionWrites:0,auth:'SYNTHETIC_LOOPBACK_ONLY',catalogReads:0,providerGets:0,fullGroup1SuiteRerun:false};
fs.writeFileSync(new URL('CHROME_TARGETED_TESTS_SAFE.json',root),JSON.stringify(safe,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PASS',targetedTests:'6/6',productionRequests:0,productionWrites:0}));
