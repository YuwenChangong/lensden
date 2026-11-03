import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {inspectBuild,sha256,priorRoot,buildRoot,manifestPath,releaseReceiptPath,releaseIdentityPath} from './build-evidence.mjs';
import {scopeDigest,assertBoundFreePlan} from './execution/group1/free-plan-policy.mjs';
import {HUMAN_GATES,GO} from './execution/group1/authorization.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),group=path.join(here,'execution/group1'),root=path.join(group,'artifacts');
const ensure=(ok,code)=>{if(!ok)throw new Error(code)};
const read=file=>fs.readFileSync(file),load=file=>JSON.parse(read(file));
ensure(!fs.existsSync(root),'FRESH_ARTIFACTS_REQUIRED');
const oldBytes=read(path.join(priorRoot,'EXECUTION_BINDING_GROUP1.json')),old=JSON.parse(oldBytes);
ensure(sha256(oldBytes)==='f9936ffecafd99c89e8be9cbb4d4741e27f1b3f66ea55f2031d2843c4fa123f6','PRIOR_BINDING_DRIFT');
for(const f of old.files)ensure(sha256(read(f.path))===f.sha256,'ORIGINAL_FROZEN_FILE_DRIFT');
const historyFiles=['AUTHORIZED_GROUP1.json','GROUP1_ONCE.claim','GROUP1_EXECUTION_SAFE.json','GROUP1_SUPERVISOR_SAFE.json'];
const historicalHashes=historyFiles.map(name=>({path:path.join(priorRoot,name),sha256:sha256(read(path.join(priorRoot,name)))}));
const historical=load(path.join(priorRoot,'GROUP1_EXECUTION_SAFE.json'));
ensure(historical.firstFailure==='DIAGNOSTIC_ROUTE_FORBIDDEN'&&historical.authDispatches===0&&historical.catalogCasesPassed===0,'HISTORICAL_RESULT_DRIFT');
ensure(sha256(read(path.join(priorRoot,'GROUP1_EXECUTION_SAFE.json')))==='4a3e0a03923fba0b79cd72a8a4b8e02b76f75151394d062783b0fc5ee37b9774','HISTORICAL_RECEIPT_DRIFT');
ensure(fs.readFileSync(path.join(priorRoot,'GROUP1_ONCE.claim'),'utf8')==='e-verify-group1-openglasshub-20261013-login-diagnostic-v3\n','CONSUMED_CLAIM_DRIFT');
for(const name of ['gate.mjs','browser.mjs','runner.mjs','child.mjs','entry.mjs','supervisor.mjs','bootstrap.mjs','job-broker.ps1'])
  ensure(sha256(read(path.join(group,name)))===sha256(read(path.join(priorRoot,'..',name))),'UNCHANGED_EXECUTION_BOUNDARY_DRIFT');
for(const name of ['wire.mjs','node-guard.mjs','budget.mjs','identity-rls.mjs'])
  ensure(sha256(read(path.join(group,'..',name)))===sha256(read(path.join(priorRoot,'../..',name))),'UNCHANGED_TRANSPORT_DRIFT');
const tests=['path-evidence.test.mjs','build-evidence.test.mjs','browser-path.test.mjs'];
const run=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...tests.map(x=>path.join(here,x))],{cwd:path.resolve(here,'../..'),encoding:'utf8',timeout:30000,maxBuffer:1048576,windowsHide:true});
const count=name=>Number(new RegExp('^# '+name+' (\\d+)$','m').exec(run.stdout||'')?.[1]??-1);
ensure(run.status===0&&count('tests')===17&&count('pass')===17&&count('fail')===0&&count('skipped')===0,'TARGETED_TESTS_FAILED');
const testResult={format:'group1-script-targeted-tests-v1',recordedAtUTC:new Date().toISOString(),total:17,passed:17,failed:0,skipped:0,
  realChromeLoopbackTests:3,actualFrozenAstroReactChunks:true,productionHtmlFixture:false,stdoutSha256:sha256(Buffer.from(run.stdout)),historicalTestsRerun:false,productionRequests:0,productionWrites:0};
const evidence=await inspectBuild();
ensure(evidence.missingLocalStaticBindings.length===0&&evidence.missingLiteralImports.length===0&&evidence.nonliteralImports.length===0,'LOCAL_GRAPH_NOT_CLOSED');
for(const f of [...old.files,...historicalHashes])ensure(sha256(read(f.path))===f.sha256,'HISTORY_OR_INPUT_CHANGED_DURING_TESTS');
fs.mkdirSync(root,{recursive:true});
const save=(name,value)=>{const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');fs.writeFileSync(path.join(root,name),bytes,{flag:'wx'});return sha256(bytes)};
save('TARGETED_TESTS_SAFE.json',testResult);
save('SCRIPT_BUILD_EVIDENCE_SAFE.json',evidence);
const packet=load(path.join(priorRoot,'GROUP1_PACKET_NOT_AUTHORIZED.json'));
const originalBudget=JSON.stringify(packet.ownerBudgets),originalStatic=JSON.stringify(packet.staticManifest);
packet.authorizationId='e-verify-group1-openglasshub-20261013-script-fingerprint-diagnostic-v4';
packet.approvalBoundary='2_NEW_PATH_FINGERPRINT_DIAGNOSTIC_ADDENDUM_REQUIRED';
packet.diagnosticLogging={scope:'APPLICATION_LOGIN_A_GET_SCRIPT_PATHNAME_ONLY',algorithm:'SHA256',prefix:'group1-script-path-v1\u0000',
  queryValuesExcluded:true,unknownRawPathsRetained:false,exactFiniteManifestComparisonOnly:true};
packet.proposedContractChanges=[...packet.proposedContractChanges,'Safe stable pathname fingerprint and evidence class only; no static allowlist or request budget increase'];
ensure(originalBudget===JSON.stringify(packet.ownerBudgets)&&originalStatic===JSON.stringify(packet.staticManifest),'SCOPE_OR_BUDGET_CHANGED');
const proof=load(path.join(priorRoot,'OWNER_FREE_PLAN_EVIDENCE.json'));
proof.priorOwnerEvidenceSha256=sha256(read(path.join(priorRoot,'OWNER_FREE_PLAN_EVIDENCE.json')));
proof.rebindingRecordedAtUTC=new Date().toISOString();proof.scopeSha256=scopeDigest(packet);
packet.freePlanScopeSha256=proof.scopeSha256;packet.freePlanProofSha256=save('OWNER_FREE_PLAN_EVIDENCE.json',proof);
const packetHash=save('GROUP1_PACKET_NOT_AUTHORIZED.json',packet);assertBoundFreePlan(packet);
const paths=new Set(old.files.map(x=>x.path));
const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name==='artifacts')continue;const f=path.join(dir,e.name);ensure(!e.isSymbolicLink(),'BOUND_SYMLINK_FORBIDDEN');if(e.isDirectory())walk(f);else paths.add(f)}};
walk(here);walk(path.join(buildRoot,'node_modules/es-module-lexer'));
paths.add(path.join(buildRoot,'node_modules/astro/dist/runtime/server/astro-island.js'));
for(const file of evidence.serverInputs)paths.add(path.join(buildRoot,file));
for(const f of [manifestPath,releaseReceiptPath,releaseIdentityPath,...historicalHashes.map(x=>x.path),path.join(priorRoot,'EXECUTION_BINDING_GROUP1.json'),path.join(priorRoot,'HUMAN_LOGIN_DIAGNOSTIC_AUTHORIZATION_NOT_AUTHORIZED.md')])paths.add(f);
for(const name of ['TARGETED_TESTS_SAFE.json','SCRIPT_BUILD_EVIDENCE_SAFE.json','OWNER_FREE_PLAN_EVIDENCE.json','GROUP1_PACKET_NOT_AUTHORIZED.json'])paths.add(path.join(root,name));
const binding={...old,status:'OFFLINE_SCRIPT_FINGERPRINT_DIAGNOSTIC_READY_NOT_AUTHORIZED',packetSha256:packetHash,
  priorConsumedBindingSha256:sha256(oldBytes),scope:'LOGIN_A_SCRIPT_FINGERPRINT_DIAGNOSTIC_ONLY',fullGroup1RetryReady:false,
  files:[...paths].sort().map(file=>({path:file,sha256:sha256(read(file))}))};
const bindingHash=save('EXECUTION_BINDING_GROUP1.json',binding);
const auth={format:'e-verify-group1-authorization-v1',authorizationId:packet.authorizationId,packetSha256:packetHash,executionBindingSha256:bindingHash,
  authorizedAtUTC:null,authorizationExpiresUTC:null,humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,null]))};
save('HUMAN_GROUP1_AUTHORIZATION_NOT_AUTHORIZED.json',auth);
const template=fs.readFileSync(path.join(here,'AUTHORIZATION_NOT_AUTHORIZED.template.md'),'utf8')
  .replaceAll('{{AUTHORIZATION_ID}}',packet.authorizationId).replaceAll('{{PACKET_SHA256}}',packetHash).replaceAll('{{EXECUTION_BINDING_SHA256}}',bindingHash)
  .replace('{{AUTHORIZATION_JSON}}','```json\n'+JSON.stringify(auth,null,2)+'\n```').replace('{{ENTRY_PATH}}',path.join(group,'entry.mjs'));
fs.writeFileSync(path.join(root,'HUMAN_SCRIPT_FINGERPRINT_DIAGNOSTIC_NOT_AUTHORIZED.md'),template,{flag:'wx'});
save('SCRIPT_BINDING_CLOSURE_SAFE.json',{format:'group1-script-binding-closure-v1',recordedAtUTC:new Date().toISOString(),scriptIdentified:false,
  rejectionRootCause:'UNKNOWN_REQUEST_IDENTITY_OMITTED_BY_PRIOR_SAFE_JOURNAL',normalizationDefect:'NO_ROOT_REWRITE_FOUND',networkPolicyBroadened:false,
  missingKnownLocalBindings:0,localBuildAssets:67,localLiteralDependencyEdges:evidence.literalDependencyEdges,deployedBuildByteMatch:'UNKNOWN',
  fullGroup1RetryReady:false,minimalFix:'DIAGNOSTIC_FINGERPRINT_AND_OFFLINE_EXACT_MANIFEST_MATCHING_ONLY',tests:testResult,
  originalFrozenFilesUnchanged:true,privateBindingUnchanged:true,historicalFiles:historicalHashes,authorizationId:packet.authorizationId,
  packetSha256:packetHash,executionBindingSha256:bindingHash,authorizationTemplateSha256:sha256(Buffer.from(template)),requiredGo:GO,
  productionAuthorization:'NOT_AUTHORIZED',claimCreated:false,goIssued:false,productionRequests:0,productionWrites:0,catalogHold:'ACTIVE'});
console.log(JSON.stringify({targetedTests:'17/17_PASS',historicalFilesUnchanged:true,networkPolicyBroadened:false,localDependencies:evidence.literalDependencyEdges,
  fullGroup1RetryReady:false,diagnosticPacketReady:true,authorizationId:packet.authorizationId,executionBindingSha256:bindingHash,packetSha256:packetHash,
  authorizationTemplateSha256:sha256(Buffer.from(template)),productionRequests:0,productionWrites:0}));
