import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {waitForStart} from './supervisor.mjs';import {GO} from './authorization.mjs';import {validateLocal,checkOAuth} from './preflight.mjs';
import {exactHttpsTransport} from './wire.mjs';import {createPrivateCapture} from './private-evidence.mjs';import {runAssetRead} from './reader.mjs';
import {validateDeployment} from 'file:///C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/read-only-policy.mjs';
await waitForStart();const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'artifacts');let timer;
let result={format:'group1-production-asset-evidence-safe-v1',status:'BLOCKED',firstFailure:'CHILD_PRECHECK_INCOMPLETE',counts:'UNKNOWN'};
try{
 const packetBytes=fs.readFileSync(path.join(root,'ASSET_READ_PACKET_NOT_AUTHORIZED.json')),bindingBytes=fs.readFileSync(path.join(root,'EXECUTION_BINDING_ASSET_READER.json'));
 const packet=JSON.parse(packetBytes),binding=JSON.parse(bindingBytes),auth=JSON.parse(fs.readFileSync(path.join(root,'AUTHORIZED_ASSET_READ.json')));
 validateLocal({auth,packet,packetBytes,binding,bindingBytes,go:GO,now:Date.now(),claimExists:false});
 if(fs.readFileSync(path.join(root,'ASSET_READ_ONCE.claim'),'utf8')!==packet.authorizationId+'\n')throw new Error('PARENT_CLAIM_MISMATCH');
 const start=Number(process.env.ASSET_READER_GO_STARTED_MS),workMs=start+240000-Date.now();
 if(!Number.isSafeInteger(start)||start<Date.parse(auth.authorizedAtUTC)||start>Date.now()||workMs<=0||start+300000>=Date.parse(auth.authorizationExpiresUTC))throw new Error('WORK_TIME_COVERAGE');
 const req=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');
 const c=req('smol-toml').parse(fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'));checkOAuth(c,Date.now());
 const capture=createPrivateCapture(binding.privateEvidenceDirectory,packet.authorizationId);
 const app=exactHttpsTransport(packet.appOrigin),api=exactHttpsTransport('https://api.cloudflare.com');
 const transport=(q,b)=>new URL(q.url).origin===packet.appOrigin?app(q,b):q.url===packet.fixedRequests[0].url?api(q,b):Promise.reject(new Error('TRANSPORT_SCOPE'));
 const remainingWorkMs=start+240000-Date.now();if(remainingWorkMs<=0)throw new Error('WORK_TIME_COVERAGE');
 const abort=new AbortController();timer=setTimeout(()=>abort.abort(),remainingWorkMs);
 result=await runAssetRead({origin:packet.appOrigin,deploymentURL:packet.fixedRequests[0].url,loginURL:packet.fixedRequests[1].url,requiredTarget:packet.requiredTarget,
   manifest:packet.manifest,budgets:packet.proposedReadBudgets,transport,providerHeaders:{accept:'application/json','accept-encoding':'identity',authorization:'Bearer '+c.oauth_token},capture,
   assertDeployment:r=>{const v=validateDeployment(r.status,r.headers,r.body);if(v.deploymentId!==packet.expectedPreviousDeploymentId)throw new Error('DEPLOYMENT_ID_DRIFT');return v},signal:abort.signal,workMs:remainingWorkMs});
 result.sourceCommit=packet.sourceSha;result.sourceCommitEvidence='FROZEN_BUILD_SOURCE_VERSION_LINK_NOT_A_DEPLOYMENT_SHA_FIELD';
 result.evidenceProtection='WINDOWS_DPAPI_CURRENT_USER_AND_OWNER_SYSTEM_ONLY_DACL';
}catch(e){result={...result,status:'BLOCKED',firstFailure:/^[A-Z][A-Z0-9_]{1,64}$/.test(e.safeCode||e.message)?e.safeCode||e.message:'CHILD_PRECHECK_FAILED'}}finally{clearTimeout(timer)}
try{fs.writeFileSync(path.join(root,'ASSET_READ_EXECUTION_SAFE.json'),JSON.stringify(result)+'\n',{flag:'wx'});if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r))}catch{result.status='BLOCKED'}
process.exitCode=result.status==='CONTENT_EVIDENCE_COLLECTED'?0:1;if(process.connected)process.disconnect();
