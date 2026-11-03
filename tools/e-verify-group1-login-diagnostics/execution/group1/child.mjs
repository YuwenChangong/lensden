import {assertBoundFreePlan} from './free-plan-policy.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {waitForStart} from './supervisor.mjs';import {runLoginDiagnostic} from './runner.mjs';import {validateAuthorization,verifyFiles,GO} from './authorization.mjs';
import {exactHttpsTransport} from '../wire.mjs';import {sha256} from '../budget.mjs';
import {validateDeployment,validatePublic,DEPLOYMENT} from 'file:///C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/read-only-policy.mjs';
await waitForStart();
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'artifacts');
let result={format:'e-verify-group1-safe-v1',status:'BLOCKED',firstFailure:'CHILD_PRECHECK_NOT_COMPLETED',counts:'UNKNOWN'},timer;
try{
 const packetBytes=fs.readFileSync(path.join(root,'GROUP1_PACKET_NOT_AUTHORIZED.json')),bindingBytes=fs.readFileSync(path.join(root,'EXECUTION_BINDING_GROUP1.json'));
 const packet=JSON.parse(packetBytes),binding=JSON.parse(bindingBytes),auth=JSON.parse(fs.readFileSync(path.join(root,'AUTHORIZED_GROUP1.json')));
 validateAuthorization(auth,{packet,packetSha256:sha256(packetBytes),bindingSha256:sha256(bindingBytes),go:GO,now:Date.now(),claimExists:false});
 // The parent claim must exist for this exact ID; never mint a child/second claim.
 if(fs.readFileSync(path.join(root,'GROUP1_ONCE.claim'),'utf8')!==packet.authorizationId+'\n')throw new Error('PARENT_CLAIM_MISMATCH');verifyFiles(binding.files);
 assertBoundFreePlan(packet);
 const privateBytes=fs.readFileSync(binding.privateBindingPath);if(sha256(privateBytes)!==binding.privateBindingSha256)throw new Error('PRIVATE_BINDING_DRIFT');const privateBinding=JSON.parse(privateBytes);
 if(privateBinding.candidateHead!==packet.sourceSha||privateBinding.productionVersion!==packet.expectedProductionVersion)throw new Error('PRIVATE_TARGET_DRIFT');
 const req=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');const credential=req('smol-toml').parse(fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'));
 if(typeof credential.oauth_token!=='string'||Date.parse(credential.expiration_time)<=Date.now()+(packet.executionLimitSeconds+60)*1000||!credential.scopes?.includes('workers_scripts:write')||!credential.scopes?.includes('account:read'))throw new Error('OAUTH_COVERAGE_OR_SCOPE');
 const abort=new AbortController();timer=setTimeout(()=>abort.abort(),packet.workLimitSeconds*1000);
 const origins=[packet.appOrigin,'https://challenges.cloudflare.com'];const transports=new Map(origins.map(o=>[o,exactHttpsTransport(o)]));const provider=exactHttpsTransport('https://api.cloudflare.com');
 const transport=(request,bounds)=>{const wire=transports.get(new URL(request.url).origin);if(!wire)throw new Error('TRANSPORT_SCOPE');return wire(request,bounds)};
 const pageAssertions={};for(const target of packet.pageContentAssertions)pageAssertions[new URL(target.url).pathname]=r=>validatePublic(target,r.status,r.headers,r.body);
 result=await runLoginDiagnostic({privateBinding,appOrigin:packet.appOrigin,supabaseOrigin:packet.supabaseOrigin,staticManifest:packet.staticManifest,transport,signal:abort.signal,
  deployment:()=>provider({url:DEPLOYMENT,method:'GET',headers:{accept:'application/json',authorization:'Bearer '+credential.oauth_token},body:Buffer.alloc(0)},{maxBytes:131072,timeoutMs:15000,signal:abort.signal}),
  assertDeployment:r=>validateDeployment(r.status,r.headers,r.body),onStage:stage=>{if(process.connected)process.send({type:'group1-stage',stage},()=>{})}});
}catch(e){result={...result,status:'BLOCKED',firstFailure:/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:e.safeCode||'CHILD_PRECHECK_FAILURE'}}
finally{clearTimeout(timer)}
try{fs.writeFileSync(path.join(root,'GROUP1_EXECUTION_SAFE.json'),JSON.stringify({...result,catalogHold:'ACTIVE',fullEVerify:'INCOMPLETE',publicBetaGo:'NOT_AUTHORIZED'})+'\n',{flag:'wx',mode:0o600});if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r))}catch{result.status='BLOCKED'}
process.exitCode=result.status==='DIAGNOSTIC_COMPLETE'?0:1;if(process.connected)process.disconnect();
