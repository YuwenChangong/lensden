import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath}from'node:url';
import {runSupervised}from'../e-verify-group1-remaining-assets/supervisor.mjs';
const cwd=path.dirname(fileURLToPath(import.meta.url));
const outputs=path.join(cwd,'artifacts','offline-'+Date.now());fs.mkdirSync(outputs,{recursive:true});
for(const mode of ['normal','wronghost','invalidmethod','popup','budget','unobserved','nodebypass','redirect','websocket','timeout'])test('real Chrome loopback '+mode,async()=>{
 const output=path.join(outputs,mode+'.json');
 const s=await runSupervised({entry:'offline-child.mjs',args:[mode,output],cwd,deadlineMs:60000,graceMs:3000,reserveMs:5000,
  receiptPath:path.join(outputs,mode+'-supervisor.json'),env:Object.fromEntries(['SystemRoot','APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});
 assert.equal(s.classification,'EXIT_ZERO');assert.equal(s.containment.closed,true);
 const r=JSON.parse(fs.readFileSync(output));assert.equal(r.cleanup,true);assert.equal(r.proxyForwardedRequests,0);assert.ok(r.fixtureHits<=r.wireDispatches);assert.ok(r.counts.thirdParty<=40);assert.ok(r.counts.global<=650);
 const raw=JSON.stringify(r);for(const forbidden of ['PRIVATE_SENTINEL','DISCARDED_FAKE_TOKEN','secret?token'])assert.ok(!raw.includes(forbidden));
 if(['normal','unobserved'].includes(mode)){assert.equal(r.firstFailure,null);assert.equal(r.status.callback,true);assert.ok(r.registeredFrames>=1);assert.equal(r.fixtureHits,r.wireDispatches)}
 else if(mode==='budget'){assert.equal(r.firstFailure,'BUDGET_EXCEEDED');assert.equal(r.counts.thirdParty,40)}
 else assert.ok(r.firstFailure);
},{timeout:65000});
test('hard deadline kills real Chrome descendant and drains Job',async()=>{
 const s=await runSupervised({entry:'hang-child.mjs',cwd,deadlineMs:12000,workMs:1500,graceMs:3000,reserveMs:4000,receiptPath:path.join(outputs,'deadline-supervisor.json'),
  env:Object.fromEntries(['SystemRoot','APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});
 assert.equal(s.classification,'TIMEOUT');assert.equal(s.reaped,true);assert.equal(s.containment.closed,true);
},{timeout:15000});
