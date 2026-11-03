import fs from'node:fs';import {fileURLToPath}from'node:url';import {runSupervised}from'../e-verify-group1-remaining-assets/supervisor.mjs';
import {verifyFrozen}from'./binding.mjs';import {validate,claimOnce,ID,GO}from'./authorization.mjs';
import {createProfile,cleanupProfile}from'./profile.mjs';
const cwd=fileURLToPath(new URL('./',import.meta.url)),d=cwd+'artifacts';
if(process.argv.length!==3||process.argv[2]!==GO)throw new Error('INDEPENDENT_GO_REQUIRED');
fs.writeFileSync(d+'/NATIVE_PREFLIGHT_ONCE.json',JSON.stringify({authorizationId:ID,startedUTC:new Date().toISOString()}),{flag:'wx'});
const b=verifyFrozen(d),a=JSON.parse(fs.readFileSync(d+'/AUTHORIZATION_APPROVED.json'));validate(a,{...b,now:Date.now(),go:process.argv[2],claimExists:fs.existsSync(d+'/NATIVE_ONCE.claim')});claimOnce(d+'/NATIVE_ONCE.claim');
const profile=createProfile();fs.writeFileSync(d+'/NATIVE_PROFILE_LOCAL_ONLY.json',JSON.stringify({profilePath:profile,notForSharing:true}),{flag:'wx',mode:0o600});
const s=await runSupervised({entry:'live-child.mjs',args:[profile],cwd,deadlineMs:600000,workMs:540000,graceMs:10000,reserveMs:60000,
 receiptPath:d+'/NATIVE_SUPERVISOR_SAFE.json',env:Object.fromEntries(['SystemRoot','APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});
const r=fs.existsSync(d+'/NATIVE_SAFE.json')?JSON.parse(fs.readFileSync(d+'/NATIVE_SAFE.json')):null;
let profileRemoved=false;if(s.containment.closed&&s.reaped)try{profileRemoved=cleanupProfile(profile)}catch{}
fs.writeFileSync(d+'/NATIVE_FINAL_SAFE.json',JSON.stringify({authorizationId:ID,authorizationConsumed:true,
 outcome:s.classification==='EXIT_ZERO'&&s.containment.closed&&s.reaped&&profileRemoved&&r?.cleanupStatus==='PASS'&&r.outcome==='ISOLATED_OBSERVATION_COMPLETE'?'ISOLATED_OBSERVATION_COMPLETE':'BLOCKED',
 cleanupStatus:r?.cleanupStatus||'UNKNOWN',nativeContainmentClosed:s.containment.closed,profileRemoved,profileErasureGuarantee:'NO_SECURE_ERASURE_OR_OS_LOG_DELETION_CLAIM',
 oldHardCapsInherited:false,unobservedBrowserOrOsTraffic:'UNKNOWN',productionRequests:0,productionWrites:0,fullGroup1Authorized:false,publicBetaGo:false},null,2),{flag:'wx'});
