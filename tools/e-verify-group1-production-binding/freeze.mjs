import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reviewEvidence} from './review.mjs';
import {sha} from './semantic.mjs';

const here=fileURLToPath(new URL('.',import.meta.url)),out=path.join(here,'artifacts');
if(fs.existsSync(out))throw new Error('OFFLINE_FREEZE_ALREADY_EXISTS');
const {safe}=await reviewEvidence();
const result=execFileSync(process.execPath,['--test','--test-reporter=tap',path.join(here,'provenance.test.mjs'),path.join(here,'browser.test.mjs')],
 {encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:2000000});
const count=Number(/^# tests (\d+)$/m.exec(result)?.[1]);
if(count!==34||!/^# pass 34$/m.test(result)||!/^# fail 0$/m.test(result))throw new Error('TARGETED_TESTS_NOT_COMPLETE');
const old=JSON.parse(fs.readFileSync(new URL('../e-verify-group1-asset-reader-fresh-v8/artifacts/EXECUTION_BINDING_ASSET_READER.json',import.meta.url)));
const files=new Map(old.files.map(f=>[f.path,f]));
const add=p=>{p=path.resolve(p).replaceAll('\\','/');files.set(p,{path:p,sha256:sha(fs.readFileSync(p))})};
function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){if(d.name==='node_modules'||d.name==='artifacts')continue;const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else if(d.isFile())add(p)}}
walk(here);
const seen=new Set();
function packageClosure(name,from){
 const req=createRequire(from);let resolved;
 try{resolved=req.resolve(name+'/package.json')}catch{
  let dir=path.dirname(req.resolve(name));
  while(!fs.existsSync(path.join(dir,'package.json'))){const parent=path.dirname(dir);if(parent===dir)throw new Error('PACKAGE_BINDING_UNRESOLVED');dir=parent}
  resolved=path.join(dir,'package.json');
 }
 const packagePath=fs.realpathSync(resolved);
 if(seen.has(packagePath))return;seen.add(packagePath);walk(path.dirname(packagePath));
 const meta=JSON.parse(fs.readFileSync(packagePath));for(const dep of Object.keys(meta.dependencies||{}))packageClosure(dep,packagePath);
}
const releasePackage='C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub/package.json';
for(const name of ['@babel/parser','@babel/traverse'])packageClosure(name,releasePackage);
for(const f of ['ASSET_READ_EXECUTION_SAFE.json','ASSET_READ_SUPERVISOR_SAFE.json','ASSET_READ_FINAL_SAFE.json','ASSET_READ_GO_CLOSURE_SAFE.json','EXECUTION_BINDING_ASSET_READER.json'])
 add(fileURLToPath(new URL('../e-verify-group1-asset-reader-fresh-v8/artifacts/'+f,import.meta.url)));
add('C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json');
for(const f of files.values())if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('FREEZE_INPUT_CHANGED');
fs.mkdirSync(out);
const write=(name,obj)=>{const body=Buffer.from(JSON.stringify(obj,null,2)+'\n');fs.writeFileSync(path.join(out,name),body,{flag:'wx'});add(path.join(out,name));return sha(body)};
const reportSha=write('PRODUCTION_RESOURCE_REVIEW_SAFE.json',safe);
write('VERIFIED_LOGIN_STATIC_MANIFEST.json',{format:'verified-production-login-static-assets-v1',source:safe.source,version:safe.version,
 productionAuthorization:'NOT_AUTHORIZED',stages:['LOGIN_A','LOGIN_B','LOGIN_ADMIN','NEGATIVE_CAPTCHA','NEGATIVE_MISSING_CAPTCHA','NEGATIVE_PASSWORD'],assets:safe.assets});
write('TARGETED_TESTS_SAFE.json',{tests:count,passed:count,failed:0,isolatedChrome:true,rawProductionHtmlExecuted:false,
 stdoutSha256:sha(Buffer.from(result)),productionRequests:0,productionWrites:0,oldTestsRerun:false});
const binding={format:'group1-verified-login-assets-engineering-binding-v1',status:'FULL_GROUP1_BLOCKED_NOT_PRODUCTION_AUTHORIZATION',
 source:safe.source,version:safe.version,reviewSha256:reportSha,files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),
 blocker:safe.fullGroup1Blocker,newAuthorizationId:null,packetCreated:false,claimCreated:false,goIssued:false,
 ownerBudgetsChanged:false,maxAdditionalCostUSD:0,productionRequests:0,productionWrites:0,catalogHold:'ACTIVE',publicBetaGo:'NOT_AUTHORIZED'};
const bindingSha=write('EXECUTION_BINDING_PRODUCTION_ASSETS_OFFLINE_BLOCKED.json',binding);
console.log(JSON.stringify({targetedTests:count+'/'+count,verifiedAssets:safe.assets.length,fullGroup1:'BLOCKED',bindingSha256:bindingSha,
 authorizationPacket:'NOT_CREATED_BLOCKED',productionRequests:0,productionWrites:0}));
