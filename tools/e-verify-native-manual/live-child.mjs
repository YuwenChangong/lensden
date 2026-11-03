import fs from'node:fs';import {fileURLToPath}from'node:url';import {waitForStart}from'../e-verify-group1-remaining-assets/supervisor.mjs';
import {runNative}from'./native-browser.mjs';import {verifyFrozen}from'./binding.mjs';import {validate,ID,GO}from'./authorization.mjs';
await waitForStart();const d=fileURLToPath(new URL('./artifacts/',import.meta.url)),b=verifyFrozen(d),a=JSON.parse(fs.readFileSync(d+'/AUTHORIZATION_APPROVED.json'));
if(fs.readFileSync(d+'/NATIVE_ONCE.claim','utf8')!==ID+'\n')throw new Error('CLAIM_IDENTITY');validate(a,{...b,now:Date.now(),go:GO,claimExists:false});
const r=await runNative({profilePath:process.argv[2]});fs.writeFileSync(d+'/NATIVE_SAFE.json',JSON.stringify({...r,authorizationId:ID},null,2),{flag:'wx'});
await new Promise(r=>process.send({type:'receipt',status:'complete'},r));process.disconnect();
