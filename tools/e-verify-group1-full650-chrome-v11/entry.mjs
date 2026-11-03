import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {GO,claimOnce} from './authorization.mjs';import {validateLocal,loadDefaultOAuth,checkOAuth} from './policy.mjs';
import {runSupervised} from '../e-verify-group1-remaining-assets/supervisor.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),root=path.join(here,'artifacts');
const receipts=['GROUP1_LOCAL_FAILURE_SAFE.json','GROUP1_SUPERVISOR_SAFE.json','GROUP1_EXECUTION_SAFE.json','GROUP1_FINAL_SAFE.json'];
async function main(){
 if(process.argv.length!==3||process.argv[2]!==GO)throw new Error('EXACT_GO_REQUIRED');
 if(process.env.NODE_OPTIONS||process.env.NODE_PATH)throw new Error('NODE_OVERRIDE_FORBIDDEN');
 if(receipts.some(f=>fs.existsSync(path.join(root,f))))throw new Error('PRIOR_ATTEMPT_RECEIPT_EXISTS');
 const start=Date.now(),mono=performance.now(),claim=path.join(root,'GROUP1_ONCE.claim');
 const pb=fs.readFileSync(path.join(root,'GROUP1_PACKET_NOT_AUTHORIZED.json')),bb=fs.readFileSync(path.join(root,'EXECUTION_BINDING_GROUP1.json'));
 const packet=JSON.parse(pb),binding=JSON.parse(bb),auth=JSON.parse(fs.readFileSync(path.join(root,'AUTHORIZED_GROUP1.json')));
 validateLocal({auth,packet,binding,packetBytes:pb,bindingBytes:bb,go:process.argv[2],now:Date.now(),claimExists:fs.existsSync(claim)});
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:binding.sourceRoot,windowsHide:true,encoding:'utf8',timeout:5000});if(head.status!==0||head.stdout.trim()!==packet.sourceSha)throw new Error('SOURCE_HEAD_DRIFT');
 const credential=loadDefaultOAuth();checkOAuth(credential,Date.now());
 const remaining=1800000-Math.ceil(performance.now()-mono);if(remaining<=60000||Date.now()+remaining>=Date.parse(auth.authorizationExpiresUTC))throw new Error('EXECUTION_TIME_COVERAGE');
 claimOnce(claim,packet.authorizationId);
 const result=await runSupervised({entry:path.join(here,'child.mjs'),cwd:here,args:[],deadlineMs:remaining,graceMs:10000,reserveMs:60000,
   env:Object.fromEntries(['APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP','SystemRoot'].map(k=>[k,process.env[k]]).concat([['GROUP1_GO_STARTED_MS',String(start)]])),
   receiptPath:path.join(root,'GROUP1_SUPERVISOR_SAFE.json'),onMessage:event=>{if(event.type==='group1-stage')process.stdout.write('GROUP1_STAGE='+event.stage+'\n')}});
 const final={status:result.classification==='EXIT_ZERO'&&result.containment.closed&&!result.receiptMissing?'CHILD_COMPLETED':'BLOCKED',
   authorizationConsumed:true,claimCreated:true,supervisor:result,counts:result.receiptMissing?'UNKNOWN_SEE_PARTIAL_CHILD_RECEIPT':'SEE_CHILD_RECEIPT',providerWrites:0,retries:0,catalogHold:'ACTIVE',publicBetaGo:'NOT_AUTHORIZED'};
 fs.writeFileSync(path.join(root,'GROUP1_FINAL_SAFE.json'),JSON.stringify(final)+'\n',{flag:'wx'});
 process.stdout.write(JSON.stringify({status:final.status,cleanup:result.containment.closed?'PASS':'BLOCKED',receiptMissing:result.receiptMissing})+'\n');
 if(final.status!=='CHILD_COMPLETED')process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{
 const code=/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'LOCAL_PREFLIGHT_FAILURE';
 if(process.argv.length===3&&process.argv[2]===GO&&!receipts.some(f=>fs.existsSync(path.join(root,f)))){
   try{const claimed=fs.existsSync(path.join(root,'GROUP1_ONCE.claim'));fs.writeFileSync(path.join(root,'GROUP1_LOCAL_FAILURE_SAFE.json'),JSON.stringify({status:'BLOCKED',firstFailure:code,claimCreated:claimed,counts:claimed?'UNKNOWN_SEE_CHILD_AND_SUPERVISOR':0,providerWrites:0})+'\n',{flag:'wx'})}catch{}
 }
 process.stdout.write(JSON.stringify({status:'BLOCKED',firstFailure:code,productionResult:'NOT_ASSUMED'})+'\n');process.exitCode=1;
});
