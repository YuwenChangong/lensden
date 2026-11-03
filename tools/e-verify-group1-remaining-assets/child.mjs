import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {waitForStart} from './supervisor.mjs';import {GO} from './authorization.mjs';import {validateLocal,checkOAuth} from './preflight.mjs';
import {exactHttpsTransport} from './wire.mjs';import {createPrivateCapture} from './private-evidence.mjs';import {runRemainingRead} from './reader.mjs';import {loadReuse} from './reuse.mjs';
import {validateDeployment} from 'file:///C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/read-only-policy.mjs';
await waitForStart();const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'artifacts');let timer;
let result={status:'BLOCKED',firstFailure:'CHILD_PRECHECK_INCOMPLETE',counts:'UNKNOWN'};
try{
 const packetBytes=fs.readFileSync(path.join(root,'ASSET_READ_PACKET_NOT_AUTHORIZED.json')),bindingBytes=fs.readFileSync(path.join(root,'EXECUTION_BINDING_ASSET_READER.json'));
 const packet=JSON.parse(packetBytes),binding=JSON.parse(bindingBytes),auth=JSON.parse(fs.readFileSync(path.join(root,'AUTHORIZED_ASSET_READ.json')));
 validateLocal({auth,packet,packetBytes,binding,bindingBytes,go:GO,now:Date.now(),claimExists:false});
 if(fs.readFileSync(path.join(root,'ASSET_READ_ONCE.claim'),'utf8')!==packet.authorizationId+'\n')throw new Error('PARENT_CLAIM_MISMATCH');
 const start=Number(process.env.ASSET_READER_GO_STARTED_MS);
 if(!Number.isSafeInteger(start)||start<Date.parse(auth.authorizedAtUTC)||start>Date.now()||start+300000>=Date.parse(auth.authorizationExpiresUTC))throw new Error('WORK_TIME_COVERAGE');
 const req=createRequire(binding.sourceRoot+'/package.json'),c=req('smol-toml').parse(fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'));checkOAuth(c,Date.now());
 const reuse=loadReuse(),remaining=start+240000-Date.now();if(remaining<=20000)throw new Error('WORK_TIME_COVERAGE');
 const abort=new AbortController();timer=setTimeout(()=>abort.abort(),remaining);
 const capture=createPrivateCapture(binding.privateEvidenceDirectory,packet.authorizationId);
 const app=exactHttpsTransport(packet.appOrigin),api=exactHttpsTransport('https://api.cloudflare.com');
 const transport=(q,b)=>new URL(q.url).origin===packet.appOrigin?app(q,b):q.url===packet.fixedRequests[0].url?api(q,b):Promise.reject(new Error('TRANSPORT_SCOPE'));
 result=await runRemainingRead({origin:packet.appOrigin,deploymentURL:packet.fixedRequests[0].url,pages:packet.pages,requiredTarget:packet.requiredTarget,
  manifest:packet.manifest,edgeRules:packet.edgeRules,requiredRoots:packet.requiredRoots,htmlRequiredMarkers:packet.htmlRequiredMarkers,budgets:packet.proposedReadBudgets,reuse,transport,capture,
  providerHeaders:{accept:'application/json','accept-encoding':'identity',authorization:'Bearer '+c.oauth_token},
  assertDeployment:r=>{const v=validateDeployment(r.status,r.headers,r.body);if(v.deploymentId!==packet.expectedPreviousDeploymentId)throw new Error('DEPLOYMENT_ID_DRIFT');return v},signal:abort.signal,workMs:remaining});
 result.sourceCommit=packet.sourceSha;result.sourceCommitEvidence='EXISTING_FROZEN_BUILD_VERSION_LINK_NOT_A_DEPLOYMENT_FIELD';
}catch(e){result={...result,status:'BLOCKED',firstFailure:/^[A-Z][A-Z0-9_]{1,64}$/.test(e.message)?e.message:'CHILD_PRECHECK_FAILED'}}finally{clearTimeout(timer)}
try{fs.writeFileSync(path.join(root,'ASSET_READ_EXECUTION_SAFE.json'),JSON.stringify(result)+'\n',{flag:'wx'});if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r))}catch{result.status='BLOCKED'}
process.exitCode=result.status==='CONTENT_EVIDENCE_COLLECTED'?0:1;if(process.connected)process.disconnect();
