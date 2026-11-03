import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';
import {runSupervised} from '../e-verify-group1-remaining-assets/supervisor.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
test('retained Production bytes initialize in real Chrome up to denied genuine third-party bootstrap, never a mock',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogh-real-init-')),out=path.join(dir,'initialization.safe.json');
 const supervisor=await runSupervised({entry:path.join(here,'observe-child.mjs'),cwd:here,args:[out],deadlineMs:90000,graceMs:3000,reserveMs:5000,
  env:Object.fromEntries(['APPDATA','LOCALAPPDATA','USERPROFILE','SystemRoot','TEMP','TMP'].map(k=>[k,process.env[k]])),receiptPath:path.join(dir,'supervisor.safe.json')});
 fs.mkdirSync(path.join(here,'artifacts'),{recursive:true});let prefix='natural';for(let i=2;['-initialization.safe.json','-supervisor.safe.json'].some(s=>fs.existsSync(path.join(here,'artifacts',prefix+s)));i++)prefix='natural-'+i;
 fs.copyFileSync(path.join(dir,'supervisor.safe.json'),path.join(here,'artifacts',prefix+'-supervisor.safe.json'),fs.constants.COPYFILE_EXCL);
 if(fs.existsSync(out))fs.copyFileSync(out,path.join(here,'artifacts',prefix+'-initialization.safe.json'),fs.constants.COPYFILE_EXCL);
 assert.equal(supervisor.classification,'EXIT_ZERO');assert.equal(supervisor.containment.closed,true);assert.equal(supervisor.reaped,true);
 const r=JSON.parse(fs.readFileSync(out));assert.equal(r.status,'PARTIAL_THIRD_PARTY_REAL_BYTES_UNAVAILABLE');assert.equal(r.boundaryObserved,true);
 assert.equal(r.inertMockUsed,false);assert.equal(r.injectedUnknownUsed,false);assert.equal(r.thirdPartyResponseProvided,false);
 assert.ok(r.actualChromeRequests.some(q=>q.observationCategory==='C_REAL_THIRD_PARTY_BYTES_UNAVAILABLE'&&q.disposition==='ABORT_WITHOUT_MOCK_OR_NETWORK'));
 assert.ok(r.actualChromeRequests.some(q=>q.observationCategory==='B_ICON_CANCELLED'));assert.ok(r.cdpRequests.some(q=>q.originClass==='TURNSTILE'&&q.reviewedInitiatorModules.length>0));
 assert.ok(r.dom.islands.length>0&&r.dom.islands.every(i=>i.hydrated));assert.equal(r.dom.credentialFieldsEmpty,true);assert.equal(r.dom.captchaUnavailableUi,true);
 assert.equal(r.dom.turnstileGlobalAvailable,false);assert.equal(r.dom.captchaFrameCount,0);assert.equal(r.dom.authStorageEntryCount,0);
 assert.equal(r.beforeCloseFirstFailure,null);assert.equal(r.authDispatches,0);assert.equal(r.restDispatches,0);assert.equal(r.turnstileRealDispatches,0);
 assert.equal(r.unknownNaturalRequests,0);assert.equal(r.loopbackResponses.length,24);
 assert.equal(r.proxyBudgetExceeded,false);assert.ok(r.proxyRequests.every(q=>q.forwarded===false));
 assert.equal(r.cleanup,'PASS');assert.equal(r.productionRequests,0);assert.equal(r.productionWrites,0);assert.ok(r.globalAdmissions<=650);
 assert.ok(r.finalGlobalAdmissions>=r.globalAdmissions&&r.finalGlobalAdmissions<=650);
 assert.doesNotMatch(JSON.stringify(r),/offline@example|"url"\s*:|"headers"\s*:|"session"\s*:/);
});
