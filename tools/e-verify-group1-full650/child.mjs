import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {waitForStart} from '../e-verify-group1-remaining-assets/supervisor.mjs';
import {GO,validateAuthorization,verifyFiles} from './authorization.mjs';
import {assertPacket,readPrivateVersion,loadDefaultOAuth,checkOAuth} from './policy.mjs';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
import {reviewV9} from '../e-verify-group1-v9-closure/review.mjs';
import {makeBrowserFactory,runBoundGroup1} from '../e-verify-group1-v9-closure/adapter.mjs';
import {exactHttpsTransport} from '../e-verify-group1-script-binding/execution/wire.mjs';
import {validateDeployment,validatePublic,DEPLOYMENT} from 'file:///C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/read-only-policy.mjs';
await waitForStart();const here=fileURLToPath(new URL('.',import.meta.url)),root=path.join(here,'artifacts');let timer;
let result={status:'BLOCKED',firstFailure:'CHILD_PRECHECK_NOT_COMPLETED',counts:'UNKNOWN'};
try{
 const pb=fs.readFileSync(path.join(root,'GROUP1_PACKET_NOT_AUTHORIZED.json')),bb=fs.readFileSync(path.join(root,'EXECUTION_BINDING_GROUP1.json'));
 const packet=JSON.parse(pb),binding=JSON.parse(bb),auth=JSON.parse(fs.readFileSync(path.join(root,'AUTHORIZED_GROUP1.json')));
 validateAuthorization(auth,{packet,packetSha256:sha(pb),bindingSha256:sha(bb),go:GO,now:Date.now(),claimExists:false});assertPacket(packet,binding);verifyFiles(binding.files);
 if(fs.readFileSync(path.join(root,'GROUP1_ONCE.claim'),'utf8')!==packet.authorizationId+'\n')throw new Error('PARENT_CLAIM_MISMATCH');
 const start=Number(process.env.GROUP1_GO_STARTED_MS);if(!Number.isSafeInteger(start)||start<Date.parse(auth.authorizedAtUTC)||start>Date.now()||start+1800000>=Date.parse(auth.authorizationExpiresUTC))throw new Error('WORK_TIME_COVERAGE');
 const privateBinding=readPrivateVersion(binding,packet),credential=loadDefaultOAuth();checkOAuth(credential,Date.now());
 const review=await reviewV9();if(JSON.stringify(review.safe.assets)!==JSON.stringify(packet.staticManifest))throw new Error('STATIC_REVIEW_DRIFT');
 const workRemaining=start+1740000-Date.now();if(workRemaining<=0)throw new Error('WORK_DEADLINE');
 const abort=new AbortController();timer=setTimeout(()=>abort.abort(),workRemaining);
 const transports=new Map([packet.appOrigin,packet.supabaseOrigin,'https://challenges.cloudflare.com'].map(o=>[o,exactHttpsTransport(o)])),provider=exactHttpsTransport('https://api.cloudflare.com');
 const transport=(q,bounds)=>{const wire=transports.get(new URL(q.url).origin);if(!wire)throw new Error('TRANSPORT_SCOPE');return wire(q,bounds)};
 const pageAssertions=Object.fromEntries(packet.pageContentAssertions.map(target=>[new URL(target.url).pathname,r=>validatePublic(target,r.status,r.headers,r.body)]));
 const htmlHashes=Object.fromEntries([...review.html].map(([route,body])=>[route,[sha(body)]]));
 const factory=makeBrowserFactory({manifest:packet.staticManifest,htmlHashes,reviewedHtmlBodies:review.html});
 const openBrowser=options=>factory({...options,workMs:Math.min(workRemaining,options.workMs)});
 result=await runBoundGroup1({privateBinding,appOrigin:packet.appOrigin,supabaseOrigin:packet.supabaseOrigin,staticManifest:packet.staticManifest,transport,pageAssertions,signal:abort.signal,
   openBrowser,
   deployment:()=>provider({url:DEPLOYMENT,method:'GET',headers:{accept:'application/json',authorization:'Bearer '+credential.oauth_token},body:Buffer.alloc(0)},{maxBytes:131072,timeoutMs:15000,signal:abort.signal}),
   assertDeployment:r=>{const d=validateDeployment(r.status,r.headers,r.body);if(d.activeVersion!==packet.expectedProductionVersion||d.activeTraffic!==100||d.recoveryTraffic!==0)throw new Error('PRODUCTION_IDENTITY_DRIFT');return d},
   onStage:stage=>{if(process.connected)process.send({type:'group1-stage',stage},()=>{})}}, {manifest:packet.staticManifest,htmlHashes,openBrowser});
}catch(e){result={...result,status:'BLOCKED',firstFailure:/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'CHILD_PRECHECK_FAILURE'}}finally{clearTimeout(timer)}
try{fs.writeFileSync(path.join(root,'GROUP1_EXECUTION_SAFE.json'),JSON.stringify({...result,catalogHold:'ACTIVE',fullEVerify:'INCOMPLETE',publicBetaGo:'NOT_AUTHORIZED'})+'\n',{flag:'wx'});if(process.connected)await new Promise(r=>process.send({type:'receipt',status:'complete'},r))}catch{result.status='BLOCKED'}
process.exitCode=result.status==='PASS'?0:1;if(process.connected)process.disconnect();
