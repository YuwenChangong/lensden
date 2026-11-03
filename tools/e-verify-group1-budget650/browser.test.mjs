import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {runSupervised} from '../e-verify-group1-remaining-assets/supervisor.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
test('candidate650 finishes the unchanged real Chrome/SDK scoped mock without changing owner500',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-group1-budget650-')),output=path.join(dir,'candidate.safe.json');
 const s=await runSupervised({entry:path.join(here,'candidate-child.mjs'),cwd:here,args:[output],deadlineMs:100000,graceMs:3000,reserveMs:5000,
  env:Object.fromEntries(['APPDATA','LOCALAPPDATA','USERPROFILE','SystemRoot','TEMP','TMP'].map(k=>[k,process.env[k]])),receiptPath:path.join(dir,'supervisor.safe.json')});
 assert.equal(s.classification,'EXIT_ZERO');assert.equal(s.containment.closed,true);assert.equal(s.reaped,true);assert.equal(s.receiptMissing,false);
 const r=JSON.parse(fs.readFileSync(output));assert.equal(r.result.status,'PASS');assert.equal(r.result.cleanup,'PASS');assert.equal(r.result.identitiesVerified,3);assert.equal(r.result.catalogCasesPassed,16);assert.equal(r.result.negativeAuthPassed,3);assert.equal(r.providerFixtureGETs,2);
 assert.equal(r.fixtureAdmissionMax,650);assert.equal(r.approvedGlobalMax,500);assert.equal(r.savedOwnerCapsUnchanged,true);assert.equal(r.productionCompatible,false);assert.equal(r.ownerBudgetChangeApproved,false);
 assert.ok(r.admittedGlobal<=650);assert.ok(r.result.counts.supabaseAuthDispatchesMax<=40);assert.ok(r.result.counts.supabaseRestReadDispatchesMax<=80);assert.ok(r.result.counts.turnstileHttpDispatchesMax<=40);assert.ok(r.result.counts.ownerSessionRefreshRequestsMax<=6);
 assert.equal(r.proxyForwardedRequests,0);assert.equal(r.productionRequests,0);assert.equal(r.productionWrites,0);assert.equal(r.result.counts.openaiAndProviderCostUSDMax,0);assert.equal(r.result.counts.applicationMutationDispatchesMax<=50,true);
 assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_ACCESS|SYNTHETIC_REFRESH|SYNTHETIC_ONLY|qa-[ab]@|00000000-0000/);
 process.stdout.write('CANDIDATE_TRACE_SAFE_PATH='+output+'\n');
});
