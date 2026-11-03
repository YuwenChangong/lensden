import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import {fileURLToPath}from'node:url';
import {runSupervised}from'../e-verify-group1-remaining-assets/supervisor.mjs';
const cwd=path.dirname(fileURLToPath(import.meta.url)),out=path.join(cwd,'artifacts','offline-'+Date.now());fs.mkdirSync(out,{recursive:true});
for(const mode of ['normal','redirect','unknown','wait','proxy-error'])test('Chrome native HTTP fixture '+mode,async()=>{
 const file=path.join(out,mode+'.json'),s=await runSupervised({entry:'offline-child.mjs',args:[mode,file],cwd,deadlineMs:60000,graceMs:3000,reserveMs:5000,
 receiptPath:path.join(out,mode+'-supervisor.json'),env:Object.fromEntries(['SystemRoot','APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});
 assert.equal(s.classification,'EXIT_ZERO');assert.equal(s.containment.closed,true);const r=JSON.parse(fs.readFileSync(file));
 assert.equal(r.sdkHits,1);assert.equal(r.forbiddenHits,0);assert.equal(r.cleanupStatus,'PASS');assert.equal(r.profileRemoved,true);assert.equal(r.oldHardCapsInherited,false);assert.equal(r.fixtureOnly,true);
 assert.ok(!JSON.stringify(r).includes('DISCARDED_FAKE_TOKEN'));assert.ok(!JSON.stringify(r).includes('PRIVATE_TOKEN'));
 if(['normal','redirect','proxy-error'].includes(mode)){assert.equal(r.outcome,'ISOLATED_OBSERVATION_COMPLETE');assert.ok(r.frameHits>=1);assert.equal(r.stageResults.callback,true)}
 if(mode==='unknown')assert.equal(r.outcome,'BLOCKED');
 if(mode==='wait'){assert.equal(r.outcome,'BLOCKED');assert.equal(r.stopReason,'WORK_DEADLINE')}
 if(mode==='redirect')assert.ok(r.vendorResponseStatusCodes.includes(302));
},{timeout:65000});
