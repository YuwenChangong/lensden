import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'artifacts');
const sourceRoot='C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub';
const priorRoot=path.resolve(here,'../e-verify-group1-script-identity/execution/group1/artifacts');
const deploymentRoot='C:/Temp/ogh-a-deploy-readiness-20261010/final-recovery151-authorization';
const hash=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(p),load=p=>JSON.parse(read(p));
const ensure=(v,c)=>{if(!v)throw new Error(c)};
ensure(!fs.existsSync(root),'FRESH_PLAN_ARTIFACTS_REQUIRED');
const oldBindingBytes=read(path.join(priorRoot,'EXECUTION_BINDING_GROUP1.json')),old=JSON.parse(oldBindingBytes);
ensure(hash(oldBindingBytes)==='86277764550654fd96d4102e7b4bf17d752e8bd04e267bd5a2397df2850d410f','PRIOR_BINDING_DRIFT');
for(const f of old.files)ensure(hash(read(f.path))===f.sha256,'FROZEN_HISTORY_DRIFT');
const receipt=load(path.join(priorRoot,'GROUP1_EXECUTION_SAFE.json'));
ensure(hash(read(path.join(priorRoot,'GROUP1_EXECUTION_SAFE.json')))==='cffacd0b0708b8d4b5b1c24cc506fb284eb31157dd664683cdd94b2d0eefcdff','V5_RECEIPT_DRIFT');
const oldPacket=load(path.join(priorRoot,'GROUP1_PACKET_NOT_AUTHORIZED.json'));
const observed=receipt.diagnostics.firstRejection.scriptIdentity;
ensure(receipt.firstFailure==='DIAGNOSTIC_ROUTE_FORBIDDEN'&&observed.status==='PUBLIC_REFERENCE_UNMATCHED'
  &&observed.publicPathname==='/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js'
  &&observed.contentVerified===false&&receipt.authDispatches===0,'OBSERVED_PATH_DRIFT');
ensure(fs.readFileSync(path.join(priorRoot,'GROUP1_ONCE.claim'),'utf8')===oldPacket.authorizationId+'\n','CONSUMED_CLAIM_DRIFT');
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8',windowsHide:true,timeout:5000}).trim();
ensure(sourceSha===oldPacket.sourceSha,'LOCAL_CANDIDATE_DRIFT');
const sourceFiles=['astro.config.mjs','package.json','package-lock.json','scripts/build-workers.mjs','scripts/lib/workers-build-environment.mjs',
  'scripts/lib/workers-runtime-vars.mjs','src/pages/login/index.astro','src/components/site/SiteHeader.astro','src/components/settings/SettingsPage.tsx',
  'src/lib/supabase-browser.ts','src/middleware.ts'];
const dirty=execFileSync('git',['status','--porcelain','--',...sourceFiles],{cwd:sourceRoot,encoding:'utf8',windowsHide:true,timeout:5000}).trim();
ensure(!dirty,'REVIEWED_BUILD_INPUT_DRIFT');
const release=load(path.join(deploymentRoot,'A_DEPLOY_FINAL_SMOKE_CLOSURE_RESUMED_SAFE.json'));
const identity=load(path.join(deploymentRoot,'A_DEPLOY_READ_ONLY_ACCEPTANCE_FINAL_SAFE.json'));
ensure(release.aDeploy==='PASS'&&release.buildSourceSha===sourceSha&&identity.build.sourceSha===sourceSha
  &&release.expectedVersion===oldPacket.expectedProductionVersion&&identity.build.version===oldPacket.expectedProductionVersion,'PRODUCTION_SOURCE_IDENTITY_DRIFT');
const localEvidence=load(path.join(priorRoot,'REUSED_SCRIPT_BUILD_EVIDENCE_SAFE.json'));
ensure(localEvidence.localStaticFilesVerified===67&&localEvidence.literalDependencyEdges===207,'LOCAL_GRAPH_EVIDENCE_DRIFT');
const oldHeader=oldPacket.staticManifest.find(x=>x.path==='/_astro/SiteHeader.astro_astro_type_script_index_0_lang.DaQNT1ww.js');
ensure(oldHeader&&hash(read(path.join(sourceRoot,'dist/client',oldHeader.path)))===oldHeader.sha256,'LOCAL_HEADER_BYTES_DRIFT');
ensure(!fs.existsSync(path.join(sourceRoot,'dist/client',observed.publicPathname)),'UNREVIEWED_PRODUCTION_CANDIDATE_FILE');
const run=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join(here,'read-plan.test.mjs')],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1048576});
const count=n=>Number(new RegExp('^# '+n+' (\\d+)$','m').exec(run.stdout||'')?.[1]??-1);
ensure(run.status===0&&count('tests')===11&&count('pass')===11&&count('fail')===0,'READ_PLAN_TEST_FAILED');
fs.mkdirSync(root,{recursive:true});
const save=(name,o)=>{const bytes=Buffer.from(JSON.stringify(o,null,2)+'\n');fs.writeFileSync(path.join(root,name),bytes,{flag:'wx'});return hash(bytes)};
const tests={scope:'OFFLINE_READ_PLAN_ADMISSION_ONLY_NOT_PRODUCTION_EXECUTOR',tests:11,passed:11,failed:0,stdoutSha256:hash(Buffer.from(run.stdout)),historicalTestsRerun:false,productionRequests:0};
save('TARGETED_READ_PLAN_TESTS_SAFE.json',tests);
const analysis={format:'group1-production-asset-provenance-analysis-v1',productionSourceCommit:sourceSha,sourceCommitMatch:'PASS',
  buildId:release.buildId,productionVersion:oldPacket.expectedProductionVersion,sourceBuildConfigsAndLockfileCommittedUnchanged:true,
  buildConfigMatch:'UNKNOWN_CLOUD_BUILD_ENVIRONMENT_AND_INSTALL_RESULT_NOT_RETAINED',assetManifestMatch:'BLOCKED_OBSERVED_PATH_MISMATCH',
  deployedAssetBytesVerified:false,productionScriptPath:observed.publicPathname,productionScriptBytes:'UNKNOWN_NOT_READ',
  productionScriptSha256:'UNKNOWN_NOT_READ',localHeader:oldHeader,localHeaderSource:'SAME_COMMIT_OFFLINE_FROZEN_BUILD',
  headerSourceOperation:'IMPORT_SETTINGS_NAVIGATION_AND_REGISTER_UI_EVENT_LISTENERS;UNKNOWN_COMPILED_SCRIPT_NOT_PROVEN_EQUIVALENT',
  localResources:67,localLiteralDependencyEdges:207,productionLoginHtmlSaved:false,
  mismatchRootCause:'EXACT_PRODUCTION_SCRIPT_PATH_DIFFERS_FROZEN_LOCAL_MANIFEST;UNDERLYING_BUILD_INPUT_OR_CHUNK_DIFFERENCE_UNKNOWN',
  missingEvidence:'ACTUAL_PRODUCTION_SCRIPT_BYTES_AND_COMPLETE_REFERENCED_LOGIN_ASSET_GRAPH',
  minimalQaBindingFix:'BLOCKED_NO_BLIND_PATH_ALIAS',fullGroup1BudgetSufficient:'UNKNOWN',
  productionRequests:0,productionWrites:0,catalogHold:'ACTIVE'};
save('PROVENANCE_ANALYSIS_SAFE.json',analysis);
const slots=new Map();for(const x of oldPacket.staticManifest){const m=/^\/_astro\/(.+)\.[A-Za-z0-9_-]+\.(js|css)$/.exec(x.path);ensure(m,'FINITE_RESOURCE_NAME_REQUIRED');const key=m[1]+'.'+m[2];const item=slots.get(key)||{stem:m[1],extension:m[2],multiplicity:0,localReferences:[]};item.multiplicity++;item.localReferences.push(x);slots.set(key,item)}
const packet={format:'group1-production-asset-content-read-scope-proposal-v1',authorizationId:'e-verify-group1-openglasshub-20261013-production-assets-proof-v6',
  status:'READ_SCOPE_PROPOSAL_ONLY_NOT_AN_EXECUTION_AUTHORIZATION',sourceSha,buildId:release.buildId,expectedProductionVersion:oldPacket.expectedProductionVersion,
  accountId:oldPacket.accountId,worker:oldPacket.worker,appOrigin:oldPacket.appOrigin,expectedPreviousDeploymentId:receipt.preDeployment.deploymentId,
  fixedRequests:[{role:'DEPLOYMENT_PRE_AND_POST',method:'GET',url:'https://api.cloudflare.com/client/v4/accounts/'+oldPacket.accountId+'/workers/scripts/'+oldPacket.worker+'/deployments',maxBodyBytes:131072,maxRequests:2},
    {role:'LOGIN_HTML_NOT_EXECUTED',method:'GET',url:oldPacket.appOrigin+'/login/?next=%2Fproducts%2F',maxBodyBytes:2097152,maxRequests:1},
    {role:'REQUIRED_SCRIPT_CONTENT_PROOF',method:'GET',url:oldPacket.appOrigin+observed.publicPathname,maxBodyBytes:2097152,expectedSha256:null}],
  conditionalDependencyScope:{basis:'EXACT_CURRENT_LOGIN_HTML_AND_LITERAL_PARENT_MODULE_REFERENCES_ONLY',method:'GET',stage:'ASSET_PROVENANCE_READ',
    resourceTypes:['script','stylesheet'],origin:oldPacket.appOrigin,finiteStemSlots:[...slots.values()],maxResourcesIncludingRequiredScript:67,
    rawWildcardAdmission:false,unknownQueryOrPrivatePathAllowed:false,blindLocalManifestProbeAllowed:false,unsupportedImportOrPrivateReference:'STOP_BLOCKED'},
  proposedReadBudgets:{totalGETMax:70,htmlGETMax:1,assetGETMax:67,providerDeploymentGETMax:2,concurrencyMax:4,hardSeconds:300,workSeconds:240,
    cleanupReserveSeconds:60,perRequestSeconds:15,maxHeaderBytes:8192,maxAssetBytes:2097152,anonymousAggregateBytesMax:16777216},
  maxAuthorizationValiditySeconds:3600,oauthRemainingSecondsStrictlyGreaterThan:360,ownerOriginalGlobalRequestCeiling:oldPacket.ownerBudgets.allBrowserHttpDispatchesMax,
  expectedAssetHashes:'UNKNOWN_BEFORE_READ;ACTUAL_HASH_OBSERVATION_NOT_SOURCE_PASS',privateCaptureRequired:true,
  existingFreeProofSha256:hash(read(path.join(priorRoot,'OWNER_FREE_PLAN_EVIDENCE.json'))),zeroCostPolicy:{MAX_ADDITIONAL_COST_USD:0,PAID_USAGE_AUTHORIZED:false},
  authDispatchMax:0,rlsReadsMax:0,productionWritesMax:0,retries:0,redirectFollowing:0,thirdPartyHTTPMax:0,
  fullGroup1Authorized:false,group2Authorized:false,group3Authorized:false,catalogHold:'ACTIVE',publicBetaGo:'NOT_AUTHORIZED',
  humanGates:Object.fromEntries(['subsetBoundary2AndResidualCasesAccepted','authSecurityLogSideEffectsAccepted','manualTurnstileAndPrivateIdentityReady','catalogHoldAndPostHardeningRecoveryAccepted','operatorAvailableForEntireValidity'].map(k=>[k,null])),
  authorizedAtUTC:null,authorizationExpiresUTC:null,proposedGo:'GO_E_VERIFY_GROUP1_PRODUCTION_ASSET_PROOF_V1',
  executionReadiness:'NOT_EXECUTABLE_UNTIL_EXACT_READER_ENTRY_AND_PRIVATE_CAPTURE_ARE_BOUND'};
const packetHash=save('PRODUCTION_ASSET_READ_SCOPE_PACKET_NOT_AUTHORIZED.json',packet);
const paths=new Set(old.files.map(x=>x.path));
for(const name of fs.readdirSync(here))if(/\.(mjs|md)$/.test(name))paths.add(path.join(here,name));
for(const name of sourceFiles)paths.add(path.join(sourceRoot,name));
for(const name of ['AUTHORIZED_GROUP1.json','GROUP1_ONCE.claim','GROUP1_EXECUTION_SAFE.json','GROUP1_SUPERVISOR_SAFE.json','EXECUTION_BINDING_GROUP1.json'])paths.add(path.join(priorRoot,name));
for(const name of ['A_DEPLOY_FINAL_SMOKE_CLOSURE_RESUMED_SAFE.json','A_DEPLOY_READ_ONLY_ACCEPTANCE_FINAL_SAFE.json'])paths.add(path.join(deploymentRoot,name));
for(const name of ['TARGETED_READ_PLAN_TESTS_SAFE.json','PROVENANCE_ANALYSIS_SAFE.json','PRODUCTION_ASSET_READ_SCOPE_PACKET_NOT_AUTHORIZED.json'])paths.add(path.join(root,name));
const binding={format:'group1-production-asset-offline-read-plan-binding-v1',status:'READ_PLAN_ONLY_NOT_EXECUTION_ENTRY',packetSha256:packetHash,
  priorConsumedExecutionBindingSha256:hash(oldBindingBytes),sourceSha,fullGroup1Ready:false,productionReaderFrozen:false,
  files:[...paths].sort().map(file=>({path:file,sha256:hash(read(file))}))};
const bindingHash=save('OFFLINE_READ_PLAN_BINDING_NOT_AUTHORIZED.json',binding);
const list='## Finite stems, types and multiplicity (not an HTTP wildcard)\n\n'+[...slots.values()].map(x=>'- `'+x.stem+'.<observed-build-hash>.'+x.extension+'`: '+x.multiplicity+' slot(s)').join('\n');
const text=fs.readFileSync(path.join(here,'READ_SCOPE_NOT_AUTHORIZED.template.md'),'utf8')
  .replace('{{AUTHORIZATION_ID}}',packet.authorizationId).replace('{{PACKET_SHA256}}',packetHash).replace('{{BINDING_SHA256}}',bindingHash).replace('{{FINITE_RESOURCE_LIST}}',list);
fs.writeFileSync(path.join(root,'HUMAN_PRODUCTION_ASSET_READ_SCOPE_NOT_AUTHORIZED.md'),text,{flag:'wx'});
save('READ_PLAN_PREPARATION_SAFE.json',{scopeProposalReady:true,executableReaderReady:false,fullGroup1Ready:false,productionBytesVerified:false,
  packetSha256:packetHash,offlineReadPlanBindingSha256:bindingHash,templateSha256:hash(Buffer.from(text)),tests,
  oldQaAllowlistChanged:false,oldFrozenFilesUnchanged:true,privateBindingUnchanged:true,authorizationConsumed:false,claimCreated:false,goIssued:false,
  productionRequests:0,productionWrites:0});
console.log(JSON.stringify({sourceCommit:sourceSha,productionProvenance:'BLOCKED',ctContentVerified:false,tests:'11/11_PASS_OFFLINE_READ_POLICY_ONLY',
  readScopePacketSha256:packetHash,offlineReadPlanBindingSha256:bindingHash,templateSha256:hash(Buffer.from(text)),readerExecutable:false,fullGroup1Ready:false,productionRequests:0,productionWrites:0}));
