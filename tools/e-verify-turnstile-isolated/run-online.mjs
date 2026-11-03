import fs from 'node:fs';
import {fileURLToPath}from'node:url';
import {runSupervised}from'../e-verify-group1-remaining-assets/supervisor.mjs';
import {validate,ID,GO,claimOnce}from'./authorization.mjs';
import {verifyFrozen}from'./binding.mjs';
const cwd=fileURLToPath(new URL('./',import.meta.url)),directory=cwd+'artifacts';
if(process.argv.length!==3||process.argv[2]!==GO)throw new Error('INDEPENDENT_GO_REQUIRED');
// Even a failed local preflight is not silently retried in this instance.
fs.writeFileSync(directory+'/ONLINE_PREFLIGHT_ONCE.json',JSON.stringify({authorizationId:ID,startedUTC:new Date().toISOString(),networkRequests:0}),{flag:'wx'});
const b=verifyFrozen(directory),auth=JSON.parse(fs.readFileSync(directory+'/AUTHORIZATION_APPROVED.json'));
validate(auth,{...b,now:Date.now(),go:process.argv[2],claimExists:fs.existsSync(directory+'/ONLINE_ONCE.claim')});
claimOnce(directory+'/ONLINE_ONCE.claim');
const s=await runSupervised({entry:'live-child.mjs',cwd,deadlineMs:300000,graceMs:10000,reserveMs:60000,workMs:220000,
 receiptPath:directory+'/ONLINE_SUPERVISOR_SAFE.json',env:Object.fromEntries(['SystemRoot','APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});
const child=fs.existsSync(directory+'/ONLINE_SAFE.json')?JSON.parse(fs.readFileSync(directory+'/ONLINE_SAFE.json')):null;
fs.writeFileSync(directory+'/ONLINE_FINAL_SAFE.json',JSON.stringify({authorizationId:ID,authorizationConsumed:true,
 status:s.classification==='EXIT_ZERO'&&s.containment.closed&&child?.status==='OBSERVED_ISOLATED_VENDOR_CHAIN'?'ISOLATED_DIAGNOSTIC_COMPLETE':'BLOCKED',
 childReceiptPresent:!!child,containmentClosed:s.containment.closed,productionRequests:0,productionWrites:0,
 fullGroup1Authorized:false,publicBetaGo:false},null,2),{flag:'wx'});
