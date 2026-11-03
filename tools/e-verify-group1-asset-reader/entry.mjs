import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
import {GO,claimOnce} from './authorization.mjs';import {validateLocal,checkOAuth} from './preflight.mjs';import {probeProtectedCapture} from './private-evidence.mjs';import {runSupervised} from './supervisor.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'artifacts');
async function main(){
 const started=Date.now(),mono=performance.now();if(process.argv.length!==3||process.argv[2]!==GO)throw new Error('EXACT_GO_REQUIRED');
 if(process.env.NODE_OPTIONS||process.env.NODE_PATH)throw new Error('NODE_OVERRIDE_FORBIDDEN');
 const packetBytes=fs.readFileSync(path.join(root,'ASSET_READ_PACKET_NOT_AUTHORIZED.json')),bindingBytes=fs.readFileSync(path.join(root,'EXECUTION_BINDING_ASSET_READER.json'));
 const packet=JSON.parse(packetBytes),binding=JSON.parse(bindingBytes),auth=JSON.parse(fs.readFileSync(path.join(root,'AUTHORIZED_ASSET_READ.json'))),claim=path.join(root,'ASSET_READ_ONCE.claim');
 validateLocal({auth,packet,packetBytes,binding,bindingBytes,go:process.argv[2],now:Date.now(),claimExists:fs.existsSync(claim)});
 if(['ASSET_READ_LOCAL_FAILURE_SAFE.json','ASSET_READ_EXECUTION_SAFE.json','ASSET_READ_SUPERVISOR_SAFE.json','ASSET_READ_FINAL_SAFE.json'].some(f=>fs.existsSync(path.join(root,f))))throw new Error('PRIOR_EXECUTION_RECEIPT_EXISTS');
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:binding.sourceRoot,encoding:'utf8',windowsHide:true,timeout:5000});
 if(head.status!==0||head.stdout.trim()!==packet.sourceSha)throw new Error('SOURCE_HEAD_DRIFT');
 const req=createRequire('C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json');
 const credential=req('smol-toml').parse(fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'));checkOAuth(credential,Date.now());
 if(path.resolve(binding.privateEvidenceDirectory)!==path.resolve(process.env.LOCALAPPDATA,'OpenGlassHub','asset-evidence',packet.authorizationId)||fs.existsSync(binding.privateEvidenceDirectory))throw new Error('PRIVATE_CAPTURE_TARGET');
 probeProtectedCapture(packet.authorizationId);
 const remaining=Math.floor(300000-(performance.now()-mono));if(remaining<=60000||Date.now()+remaining>=Date.parse(auth.authorizationExpiresUTC))throw new Error('EXECUTION_TIME_COVERAGE');
 claimOnce(claim,packet.authorizationId);
 const result=await runSupervised({entry:path.join(here,'child.mjs'),args:[],cwd:here,deadlineMs:remaining,graceMs:10000,reserveMs:60000,
   env:{APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,USERPROFILE:process.env.USERPROFILE,TEMP:process.env.TEMP,TMP:process.env.TMP,SystemRoot:process.env.SystemRoot,ASSET_READER_GO_STARTED_MS:String(started)},
   receiptPath:path.join(root,'ASSET_READ_SUPERVISOR_SAFE.json')});
 const final={format:'asset-reader-parent-safe-v1',status:result.classification==='EXIT_ZERO'&&result.containment.closed&&!result.receiptMissing?'CHILD_COMPLETED':'BLOCKED',
   firstFailure:result.receiptMissing?'CHILD_RECEIPT_MISSING':result.classification,authorizationConsumed:true,claimCreated:true,
   requestCounts:result.receiptMissing?'UNKNOWN_SEE_PARTIAL_CHILD_RECEIPT':'SEE_CHILD_RECEIPT',supervisor:result,providerWrites:0,retries:0,catalogHold:'ACTIVE'};
 fs.writeFileSync(path.join(root,'ASSET_READ_FINAL_SAFE.json'),JSON.stringify(final)+'\n',{flag:'wx'});
 process.stdout.write(JSON.stringify({status:final.status,classification:result.classification,receiptMissing:result.receiptMissing,cleanup:result.containment.closed?'PASS':'BLOCKED'})+'\n');
 if(final.status!=='CHILD_COMPLETED')process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{
 const code=/^[A-Z][A-Z0-9_]{1,64}$/.test(e.message)?e.message:'LOCAL_PREFLIGHT_FAILED';
 if(process.argv.length===3&&process.argv[2]===GO){try{fs.writeFileSync(path.join(root,'ASSET_READ_LOCAL_FAILURE_SAFE.json'),JSON.stringify({status:'BLOCKED',firstFailure:code,claimCreated:fs.existsSync(path.join(root,'ASSET_READ_ONCE.claim')),requestCounts:fs.existsSync(path.join(root,'ASSET_READ_ONCE.claim'))?'UNKNOWN_SEE_SUPERVISOR_AND_CHILD':0,providerWrites:0,retries:0})+'\n',{flag:'wx'})}catch{}}
 process.stdout.write(JSON.stringify({status:'BLOCKED',firstFailure:code,productionOutcome:'NOT_ASSUMED'})+'\n');process.exitCode=1;
});
