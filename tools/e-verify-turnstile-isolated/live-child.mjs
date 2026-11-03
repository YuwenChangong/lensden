import fs from 'node:fs';
import {fileURLToPath}from'node:url';
import {waitForStart}from'../e-verify-group1-remaining-assets/supervisor.mjs';
import {exactHttpsTransport}from'../e-verify-group1-script-identity/execution/wire.mjs';
import {runIsolatedBrowser}from'./browser.mjs';
import {ORIGIN}from'./gate.mjs';
import {validate,ID,GO}from'./authorization.mjs';
import {verifyFrozen}from'./binding.mjs';
await waitForStart();
const directory=fileURLToPath(new URL('./artifacts/',import.meta.url));
const binding=verifyFrozen(directory),a=JSON.parse(fs.readFileSync(directory+'/AUTHORIZATION_APPROVED.json'));
if(fs.readFileSync(directory+'/ONLINE_ONCE.claim','utf8')!==ID+'\n')throw new Error('CLAIM_IDENTITY');
validate(a,{...binding,now:Date.now(),go:GO,claimExists:false});
const start=Date.now(),transport=exactHttpsTransport(ORIGIN);
const result=await runIsolatedBrowser({transport,headless:false,workMs:220000,observeMs:210000});
const complete=!result.firstFailure&&result.status.renderStarted&&result.status.renderReturned&&result.status.callback&&result.registeredFrames>=1&&result.cleanup;
fs.writeFileSync(directory+'/ONLINE_SAFE.json',JSON.stringify({format:'isolated-turnstile-safe-v1',authorizationId:ID,
 status:complete?'OBSERVED_ISOLATED_VENDOR_CHAIN':'BLOCKED',...result,elapsedMs:Date.now()-start,
 productionRequests:0,productionWrites:0,productionEquivalent:false,originalV11Identity:'UNKNOWN'},null,2),{flag:'wx'});
await new Promise(r=>process.send({type:'receipt',status:'complete'},r));process.disconnect();
