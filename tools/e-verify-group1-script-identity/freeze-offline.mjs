import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sha256,buildRoot,manifestPath,releaseReceiptPath,releaseIdentityPath} from '../e-verify-group1-script-binding/build-evidence.mjs';
import {scopeDigest,assertBoundFreePlan} from './execution/group1/free-plan-policy.mjs';
import {HUMAN_GATES,GO} from './execution/group1/authorization.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),group=path.join(here,'execution/group1'),root=path.join(group,'artifacts');
const priorRoot=path.resolve(here,'../e-verify-group1-script-binding/execution/group1/artifacts');
const consumedRoot=path.resolve(here,'../e-verify-group1-login-diagnostics/execution/group1/artifacts');
const ensure=(ok,code)=>{if(!ok)throw new Error(code)};
const read=file=>fs.readFileSync(file),load=file=>JSON.parse(read(file));
ensure(!fs.existsSync(root),'FRESH_ARTIFACTS_REQUIRED');
const oldBytes=read(path.join(priorRoot,'EXECUTION_BINDING_GROUP1.json')),old=JSON.parse(oldBytes);
ensure(sha256(oldBytes)==='98604720441aa0665e1c6b06e9d80c22c4f8ac6e8099e685bd6359f18bd60c39','PRIOR_BINDING_DRIFT');
for(const f of old.files)ensure(sha256(read(f.path))===f.sha256,'ORIGINAL_FROZEN_FILE_DRIFT');
const historyFiles=['AUTHORIZED_GROUP1.json','GROUP1_ONCE.claim','GROUP1_EXECUTION_SAFE.json','GROUP1_SUPERVISOR_SAFE.json'];
const historicalHashes=historyFiles.map(name=>({path:path.join(consumedRoot,name),sha256:sha256(read(path.join(consumedRoot,name)))}));
const historical=load(path.join(consumedRoot,'GROUP1_EXECUTION_SAFE.json'));
ensure(historical.firstFailure==='DIAGNOSTIC_ROUTE_FORBIDDEN'&&historical.authDispatches===0&&historical.catalogCasesPassed===0,'HISTORICAL_RESULT_DRIFT');
ensure(sha256(read(path.join(consumedRoot,'GROUP1_EXECUTION_SAFE.json')))==='4a3e0a03923fba0b79cd72a8a4b8e02b76f75151394d062783b0fc5ee37b9774','HISTORICAL_RECEIPT_DRIFT');
ensure(fs.readFileSync(path.join(consumedRoot,'GROUP1_ONCE.claim'),'utf8')==='e-verify-group1-openglasshub-20261013-login-diagnostic-v3\n','CONSUMED_CLAIM_DRIFT');
for(const name of ['gate.mjs','runner.mjs','child.mjs','entry.mjs','supervisor.mjs','bootstrap.mjs','job-broker.ps1','free-plan-policy.mjs','path-fingerprint.mjs'])
  ensure(sha256(read(path.join(group,name)))===sha256(read(path.join(priorRoot,'..',name))),'UNCHANGED_EXECUTION_BOUNDARY_DRIFT');
for(const name of ['wire.mjs','node-guard.mjs','budget.mjs','identity-rls.mjs'])
  ensure(sha256(read(path.join(group,'..',name)))===sha256(read(path.join(priorRoot,'../..',name))),'UNCHANGED_TRANSPORT_DRIFT');
const tests=['identity.test.mjs','browser-identity.test.mjs'];
const run=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...tests.map(x=>path.join(here,x))],{cwd:path.resolve(here,'../..'),encoding:'utf8',timeout:30000,maxBuffer:1048576,windowsHide:true});
const count=name=>Number(new RegExp('^# '+name+' (\\d+)$','m').exec(run.stdout||'')?.[1]??-1);
ensure(run.status===0&&count('tests')===15&&count('pass')===15&&count('fail')===0&&count('skipped')===0,'TARGETED_TESTS_FAILED');
const testResult={format:'group1-safe-script-identity-tests-v1',recordedAtUTC:new Date().toISOString(),total:15,passed:15,failed:0,skipped:0,
  realChromeLoopbackTests:5,productionHtmlFixture:false,unknownBuildNamesExercised:true,finalRunnerReceiptExercised:true,stdoutSha256:sha256(Buffer.from(run.stdout)),historicalTestsRerun:false,productionRequests:0,productionWrites:0};
const evidence=load(path.join(priorRoot,'SCRIPT_BUILD_EVIDENCE_SAFE.json'));
ensure(evidence.missingLocalStaticBindings.length===0&&evidence.missingLiteralImports.length===0&&evidence.nonliteralImports.length===0,'LOCAL_GRAPH_NOT_CLOSED');
for(const f of [...old.files,...historicalHashes])ensure(sha256(read(f.path))===f.sha256,'HISTORY_OR_INPUT_CHANGED_DURING_TESTS');
fs.mkdirSync(root,{recursive:true});
const save=(name,value)=>{const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');fs.writeFileSync(path.join(root,name),bytes,{flag:'wx'});return sha256(bytes)};
save('TARGETED_TESTS_SAFE.json',testResult);
save('REUSED_SCRIPT_BUILD_EVIDENCE_SAFE.json',evidence);
const packet=load(path.join(priorRoot,'GROUP1_PACKET_NOT_AUTHORIZED.json'));
const originalBudget=JSON.stringify(packet.ownerBudgets),originalStatic=JSON.stringify(packet.staticManifest);
packet.authorizationId='e-verify-group1-openglasshub-20261013-safe-script-identity-diagnostic-v5';
packet.approvalBoundary='2_NEW_SAFE_PUBLIC_SCRIPT_IDENTITY_ADDENDUM_REQUIRED';
packet.diagnosticLogging={scope:'APPLICATION_A_LOGIN_A_GET_SCRIPT_ONLY',algorithm:'SHA256',prefix:'group1-script-path-v1\u0000',
  queryAndFragmentValuesExcluded:true,credentialsExcluded:true,exactPublicPathnameAllowedOnlyWith:'FINITE_REVIEWED_STEM_EIGHT_CHAR_BUILD_HASH_AND_VERIFIED_PUBLIC_REFERENCE',
  referenceSources:['VALIDATED_LOGIN_HTML','VERIFIED_BOUND_SCRIPT_IMPORT'],outcomes:['MANIFEST_MATCH','PUBLIC_REFERENCE_UNMATCHED','PRIVACY_BLOCKED'],
  unknownPrivatePathsRetained:false,referenceLimit:256,contentVerified:false,networkWhitelistChanged:false};
packet.proposedContractChanges=[...packet.proposedContractChanges,'Conditional exact public script identity from validated page or verified import; unfamiliar/private paths remain PRIVACY_BLOCKED; no network scope expansion'];
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
for(const f of [manifestPath,releaseReceiptPath,releaseIdentityPath,...historicalHashes.map(x=>x.path),path.join(priorRoot,'EXECUTION_BINDING_GROUP1.json'),path.join(priorRoot,'HUMAN_SCRIPT_FINGERPRINT_DIAGNOSTIC_NOT_AUTHORIZED.md')])paths.add(f);
for(const name of ['TARGETED_TESTS_SAFE.json','REUSED_SCRIPT_BUILD_EVIDENCE_SAFE.json','OWNER_FREE_PLAN_EVIDENCE.json','GROUP1_PACKET_NOT_AUTHORIZED.json'])paths.add(path.join(root,name));
const binding={...old,status:'OFFLINE_SAFE_PUBLIC_SCRIPT_IDENTITY_DIAGNOSTIC_READY_NOT_AUTHORIZED',packetSha256:packetHash,
  priorUnapprovedBindingSha256:sha256(oldBytes),scope:'LOGIN_A_SAFE_PUBLIC_SCRIPT_IDENTITY_DIAGNOSTIC_ONLY',fullGroup1RetryReady:false,
  files:[...paths].sort().map(file=>({path:file,sha256:sha256(read(file))}))};
const bindingHash=save('EXECUTION_BINDING_GROUP1.json',binding);
const auth={format:'e-verify-group1-authorization-v1',authorizationId:packet.authorizationId,packetSha256:packetHash,executionBindingSha256:bindingHash,
  authorizedAtUTC:null,authorizationExpiresUTC:null,humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,null]))};
save('HUMAN_GROUP1_AUTHORIZATION_NOT_AUTHORIZED.json',auth);
const template=fs.readFileSync(path.join(here,'AUTHORIZATION_NOT_AUTHORIZED.template.md'),'utf8')
  .replaceAll('{{AUTHORIZATION_ID}}',packet.authorizationId).replaceAll('{{PACKET_SHA256}}',packetHash).replaceAll('{{EXECUTION_BINDING_SHA256}}',bindingHash)
  .replace('{{AUTHORIZATION_JSON}}','```json\n'+JSON.stringify(auth,null,2)+'\n```').replace('{{ENTRY_PATH}}',path.join(group,'entry.mjs'));
fs.writeFileSync(path.join(root,'HUMAN_SAFE_SCRIPT_IDENTITY_DIAGNOSTIC_NOT_AUTHORIZED.md'),template,{flag:'wx'});
save('SCRIPT_IDENTITY_CLOSURE_SAFE.json',{format:'group1-safe-script-identity-closure-v1',recordedAtUTC:new Date().toISOString(),historicalScriptIdentified:false,
  rejectionRootCause:'UNKNOWN_REQUEST_IDENTITY_OMITTED_BY_PRIOR_SAFE_JOURNAL',normalizationDefect:'NO_ROOT_REWRITE_FOUND',networkPolicyBroadened:false,
  missingKnownLocalBindings:0,localBuildAssets:67,localLiteralDependencyEdges:evidence.literalDependencyEdges,deployedBuildByteMatch:'UNKNOWN',
  fullGroup1RetryReady:false,unknownPublicBuildNameIdentification:true,privacyBlockedPathsAreNotClaimedIdentified:true,
  minimalFix:'VERIFIED_PUBLIC_REFERENCE_IDENTITY_AND_FINGERPRINT_ONLY_NO_ADMISSION_CHANGE',tests:testResult,
  originalFrozenFilesUnchanged:true,privateBindingUnchanged:true,historicalFiles:historicalHashes,authorizationId:packet.authorizationId,
  packetSha256:packetHash,executionBindingSha256:bindingHash,authorizationTemplateSha256:sha256(Buffer.from(template)),requiredGo:GO,
  productionAuthorization:'NOT_AUTHORIZED',claimCreated:false,goIssued:false,productionRequests:0,productionWrites:0,catalogHold:'ACTIVE'});
console.log(JSON.stringify({targetedTests:'15/15_PASS',historicalFilesUnchanged:true,networkPolicyBroadened:false,localDependencies:evidence.literalDependencyEdges,
  fullGroup1RetryReady:false,diagnosticPacketReady:true,authorizationId:packet.authorizationId,executionBindingSha256:bindingHash,packetSha256:packetHash,
  authorizationTemplateSha256:sha256(Buffer.from(template)),productionRequests:0,productionWrites:0}));
