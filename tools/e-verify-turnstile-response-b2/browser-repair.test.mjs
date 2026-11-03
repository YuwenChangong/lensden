import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs';
import path from'node:path';
import {fileURLToPath}from'node:url';
import {runSupervised}from'../e-verify-group1-remaining-assets/supervisor.mjs';
import {readReceipt,finalizeReceipt}from'./receipts.mjs';
const cwd=path.dirname(fileURLToPath(import.meta.url)),out=path.join(cwd,'artifacts','offline-'+Date.now());fs.mkdirSync(out,{recursive:true});
for(const mode of ['ok','redirect','location200','body-failure'])test('real Chrome response-only repair '+mode,async()=>{
 const file=path.join(out,mode+'.json'),s=await runSupervised({entry:'offline-child.mjs',args:[mode,file],cwd,deadlineMs:60000,graceMs:3000,reserveMs:5000,
 receiptPath:path.join(out,mode+'-supervisor.json'),env:Object.fromEntries(['SystemRoot','APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});
 assert.equal(s.classification,'EXIT_ZERO');assert.equal(s.containment.closed,true);
 const r=readReceipt(JSON.parse(fs.readFileSync(file)));assert.equal(r.fixtureHits,1);assert.equal(r.wireDispatches,1);assert.equal(r.counts.thirdParty,1);assert.equal(r.counts.POST,0);
 assert.equal(r.stageResults.renderStarted,false);assert.equal(r.stageResults.callback,false);assert.equal(r.registeredFrames,0);assert.equal(r.cleanupStatus,'PASS');assert.equal(r.proxyForwardedRequests,0);
 assert.ok(!JSON.stringify(r).includes('PRIVATE_SENTINEL'));const m=r.responses[0];
 assert.equal(m.HTTP_STATUS_CODE,mode==='redirect'?302:200);
 if(mode==='ok'){assert.equal(r.executionStatus,'SDK_RESPONSE_OBSERVED');assert.equal(finalizeReceipt(r,s).executionStatus,'SDK_RESPONSE_DIAGNOSTIC_COMPLETE')}
 else{assert.equal(r.executionStatus,'BLOCKED');assert.equal(r.failureCode,mode==='body-failure'?'BODY_INCOMPLETE':'REDIRECT_OR_LOCATION');assert.equal(finalizeReceipt(r,s).executionStatus,'BLOCKED')}
},{timeout:65000});
