import {assertBoundFreePlan} from './free-plan-policy.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {validateAuthorization,verifyFiles,claimOnce,GO} from './authorization.mjs';import {runSupervised} from './supervisor.mjs';
import {sha256} from '../budget.mjs';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
export function preflight({auth,packet,binding,packetBytes,bindingBytes,go,now,claimExists,credential}){
 validateAuthorization(auth,{packet,packetSha256:sha256(packetBytes),bindingSha256:sha256(bindingBytes),go,now,claimExists});
 assertBoundFreePlan(packet);verifyFiles(binding.files);
 if(typeof credential?.oauth_token!=='string'||!credential.oauth_token||!Array.isArray(credential.scopes)||!credential.scopes.includes('workers_scripts:write')||!credential.scopes.includes('account:read')||Date.parse(credential.expiration_time)<=now+(packet.executionLimitSeconds+60)*1000)throw new Error('OAUTH_COVERAGE_OR_SCOPE');
 return true;
}
async function main(){
 if(process.argv.length!==3||process.argv[2]!==GO)throw new Error('EXACT_GO_REQUIRED');
 const root=path.join(here,'artifacts'),authPath=path.join(root,'AUTHORIZED_GROUP1.json'),claim=path.join(root,'GROUP1_ONCE.claim');
 const packetBytes=fs.readFileSync(path.join(root,'GROUP1_PACKET_NOT_AUTHORIZED.json')),bindingBytes=fs.readFileSync(path.join(root,'EXECUTION_BINDING_GROUP1.json'));
 const packet=JSON.parse(packetBytes),binding=JSON.parse(bindingBytes),auth=JSON.parse(fs.readFileSync(authPath));
 validateAuthorization(auth,{packet,packetSha256:sha256(packetBytes),bindingSha256:sha256(bindingBytes),go:process.argv[2],now:Date.now(),claimExists:fs.existsSync(claim)});verifyFiles(binding.files);
 assertBoundFreePlan(packet);
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:binding.sourceRoot,windowsHide:true,encoding:'utf8',timeout:5000});if(head.status!==0||head.stdout.trim()!==packet.sourceSha)throw new Error('SOURCE_HEAD_DRIFT');
 const req=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json'),toml=req('smol-toml');
 const oauthPath=path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml');
 const credential=toml.parse(fs.readFileSync(oauthPath,'utf8'));
 preflight({auth,packet,binding,packetBytes,bindingBytes,go:process.argv[2],now:Date.now(),claimExists:fs.existsSync(claim),credential});
 // Credential-derived values are discarded; child rereads the same default file privately.
 claimOnce(claim,packet.authorizationId);
 const result=await runSupervised({entry:path.join(here,'child.mjs'),args:[],cwd:here,deadlineMs:packet.executionLimitSeconds*1000,graceMs:10000,reserveMs:60000,env:{APPDATA:process.env.APPDATA,TEMP:process.env.TEMP,TMP:process.env.TMP,SystemRoot:process.env.SystemRoot},receiptPath:path.join(root,'GROUP1_SUPERVISOR_SAFE.json'),onMessage:event=>{if(event.type==='group1-stage')process.stdout.write('GROUP1_STAGE='+event.stage+'\n')}});
 process.stdout.write(JSON.stringify({supervisor:result.classification,cleanup:result.containment.closed?'PASS':'BLOCKED',receiptMissing:result.receiptMissing})+'\n');
 if(result.classification!=='EXIT_ZERO'||!result.containment.closed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{process.stdout.write(JSON.stringify({status:'BLOCKED',firstFailure:/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'LOCAL_PREFLIGHT_FAILURE',productionResult:'NOT_ASSUMED'})+'\n');process.exitCode=1});
