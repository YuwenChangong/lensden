import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync,execFileSync} from 'node:child_process';
import {sha256} from './hash.mjs';import {assertPacket,validateLocal} from './preflight.mjs';import {GO,HUMAN_GATES,verifyFiles} from './authorization.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'artifacts'),priorRoot=path.resolve(here,'../e-verify-group1-asset-provenance/artifacts');
const priorBindingPath=path.join(priorRoot,'OFFLINE_READ_PLAN_BINDING_NOT_AUTHORIZED.json'),priorPacketPath=path.join(priorRoot,'PRODUCTION_ASSET_READ_SCOPE_PACKET_NOT_AUTHORIZED.json');
const read=p=>fs.readFileSync(p),load=p=>JSON.parse(read(p)),check=(v,c)=>{if(!v)throw new Error(c)};
check(!fs.existsSync(root),'FRESH_ARTIFACTS_REQUIRED');
check(sha256(read(priorBindingPath))==='2eab397cc8ca17591d6cf0aa52ef839a585b5ad452421582bfb5e9c24462bb17','PRIOR_BINDING_DRIFT');
check(sha256(read(priorPacketPath))==='95fddd76f69291362eab8e6b9d1401ed4ece14dae87d89c317731eca6f7060db','PRIOR_PACKET_DRIFT');
const old=load(priorBindingPath),prior=load(priorPacketPath);verifyFiles(old.files);
const sourceRoot='C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub';
check(execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8',windowsHide:true,timeout:5000}).trim()===prior.sourceSha,'SOURCE_HEAD_DRIFT');
const tests=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...['reader.test.mjs','control.test.mjs','adapter.test.mjs'].map(f=>path.join(here,f))],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:1048576});
const count=n=>Number(new RegExp('^# '+n+' (\\d+)$','m').exec(tests.stdout||'')?.[1]??-1);
check(tests.status===0&&count('tests')===31&&count('pass')===31&&count('fail')===0,'TARGETED_TESTS_FAILED');
fs.mkdirSync(root);const save=(name,value)=>{const b=Buffer.from(JSON.stringify(value,null,2)+'\n');fs.writeFileSync(path.join(root,name),b,{flag:'wx'});return sha256(b)};
const packet={...prior,format:'group1-production-asset-content-read-packet-v1',authorizationId:'e-verify-group1-openglasshub-20261013-production-asset-reader-v7',status:'PENDING_INDEPENDENT_OWNER_APPROVAL',
 executionLimitSeconds:300,workLimitSeconds:240,cleanupReserveSeconds:60,manifest:prior.conditionalDependencyScope.finiteStemSlots.flatMap(s=>s.localReferences),requiredTarget:new URL(prior.fixedRequests[2].url).pathname,
 evidenceCapture:'DPAPI_CURRENT_USER_OWNER_SYSTEM_DACL;NO_PLAINTEXT_LOGS',executionReadiness:'EXACT_READER_FROZEN_NOT_AUTHORIZED',proposedGo:GO,
 evidenceAcceptance:'CONTENT_EVIDENCE_COLLECTED_IS_NOT_SOURCE_PROVENANCE_OR_FULL_GROUP1_PASS',literalCssImports:'ONLY_UNAMBIGUOUS_LITERAL_IMPORT_IN_ALREADY_READ_STYLESHEET',
 byteLimitBoundary:'ACCEPTED_PERSISTED_BYTES_NOT_ABSOLUTE_WIRE_BYTES_OR_BILL_CAP',postDeploymentAfterFailure:false,localFailureReceiptPreventsReplay:true};
assertPacket(packet);const packetHash=save('ASSET_READ_PACKET_NOT_AUTHORIZED.json',packet);
const testRecord={format:'group1-asset-reader-targeted-offline-tests-v1',tests:count('tests'),passed:count('pass'),failed:count('fail'),outputSha256:sha256(Buffer.from(tests.stdout)),realLoopbackHttp:true,realDpapiCapture:true,realWindowsJobContainment:true,historicalTestsRerun:false,defaultOAuthRead:false,productionRequests:0,productionWrites:0};
save('TARGETED_OFFLINE_TESTS_SAFE.json',testRecord);
const paths=new Set(old.files.map(f=>f.path));paths.add(priorBindingPath);paths.add(priorPacketPath);
paths.add(path.join(priorRoot,'HUMAN_PRODUCTION_ASSET_READ_SCOPE_NOT_AUTHORIZED.md'));
for(const name of fs.readdirSync(here))if(/\.(mjs|md|ps1)$/.test(name))paths.add(path.join(here,name));
function addTree(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())addTree(p);else if(e.isFile())paths.add(p);else throw new Error('DEPENDENCY_LINK_FORBIDDEN')}}
for(const name of ['postcss','nanoid','picocolors','source-map-js'])addTree(path.join(sourceRoot,'node_modules',name));
for(const name of ['parse5','es-module-lexer','entities','smol-toml'])addTree(path.join(sourceRoot,'node_modules',name));
paths.add(path.join(root,'ASSET_READ_PACKET_NOT_AUTHORIZED.json'));paths.add(path.join(root,'TARGETED_OFFLINE_TESTS_SAFE.json'));
const v5=path.resolve(here,'../e-verify-group1-script-identity/execution/group1/artifacts');
const freeEvidencePath=path.join(v5,'OWNER_FREE_PLAN_EVIDENCE.json'),releaseIdentityPath='C:/Temp/ogh-a-deploy-readiness-20261010/final-recovery151-authorization/A_DEPLOY_READ_ONLY_ACCEPTANCE_FINAL_SAFE.json';
paths.add(freeEvidencePath);paths.add(releaseIdentityPath);paths.add('C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/read-only-policy.mjs');
const binding={format:'group1-production-asset-reader-execution-binding-v1',status:'EXECUTABLE_PENDING_OWNER_APPROVAL',authorizationId:packet.authorizationId,packetSha256:packetHash,sourceRoot,freeEvidencePath,releaseIdentityPath,
 privateEvidenceDirectory:path.join(process.env.LOCALAPPDATA,'OpenGlassHub','asset-evidence',packet.authorizationId),
 entry:path.join(here,'entry.mjs'),child:path.join(here,'child.mjs'),nodePath:process.execPath,go:GO,
 priorOfflinePlanBindingSha256:sha256(read(priorBindingPath)),priorConsumedHistoryRetained:true,
 files:[...paths].sort().map(p=>({path:p,sha256:sha256(read(p))}))};
const bindingHash=save('EXECUTION_BINDING_ASSET_READER.json',binding);
const pending={format:'e-verify-group1-authorization-v1',authorizationId:packet.authorizationId,packetSha256:packetHash,executionBindingSha256:bindingHash,authorizedAtUTC:null,authorizationExpiresUTC:null,humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,null]))};
save('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json',pending);
const finite='## Finite Conditional Stem/Type Slots\n\nNot a wildcard and not a list of URLs to probe. Actual HTML/parent reference plus every condition above is required before GET.\n\n'+packet.conditionalDependencyScope.finiteStemSlots.map(s=>'- `'+s.stem+'.<observed-build-hash>.'+s.extension+'`: '+s.multiplicity+' slot(s)').join('\n');
const text=read(path.join(here,'AUTHORIZATION_NOT_AUTHORIZED.template.md')).toString().replace('{{ID}}',packet.authorizationId).replace('{{PACKET}}',packetHash).replace('{{BINDING}}',bindingHash).replace('{{AUTH_JSON}}','```json\n'+JSON.stringify(pending,null,2)+'\n```').replace('{{FINITE_LIST}}',finite).replace('{{ENTRY}}',binding.entry);
fs.writeFileSync(path.join(root,'HUMAN_PRODUCTION_ASSET_READ_AUTHORIZATION_NOT_AUTHORIZED.md'),text,{flag:'wx'});
// Synthetic in-memory approval validates the frozen schema only; no effective authorization file is created.
const synthetic={...pending,authorizedAtUTC:'2026-10-13T00:00:00Z',authorizationExpiresUTC:'2026-10-13T00:15:00Z',humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,true]))};
validateLocal({auth:synthetic,packet,packetBytes:read(path.join(root,'ASSET_READ_PACKET_NOT_AUTHORIZED.json')),binding,bindingBytes:read(path.join(root,'EXECUTION_BINDING_ASSET_READER.json')),go:GO,now:Date.parse('2026-10-13T00:01:00Z'),claimExists:false});verifyFiles(old.files);
const result={format:'asset-reader-offline-preparation-safe-v1',executorReady:true,tests:'31/31_PASS',executionBindingSha256:bindingHash,packetSha256:packetHash,templateSha256:sha256(Buffer.from(text)),frozenFiles:binding.files.length,oldFrozenFilesUnchanged:true,
 defaultOAuthRead:false,effectiveAuthorizationCreated:false,claimCreated:false,goIssued:false,productionRequests:0,productionWrites:0,catalogHold:'ACTIVE',fullGroup1Ready:false};
save('PREPARATION_SAFE.json',result);console.log(JSON.stringify(result));
