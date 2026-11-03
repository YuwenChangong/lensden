import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {reviewV9} from './review.mjs';import {sha} from '../e-verify-group1-production-binding/semantic.mjs';import {normalizedHtmlHash} from './html-policy.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),out=path.join(here,'artifacts');
if(fs.existsSync(out))throw new Error('OFFLINE_FREEZE_ALREADY_EXISTS');
const reviewed=await reviewV9();
const testFiles=['adapter.test.mjs','gate.test.mjs','html-policy.test.mjs','review.test.mjs','integration.test.mjs'].map(f=>path.join(here,f));
const start=Date.now();
const stdout=execFileSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...testFiles],{windowsHide:true,encoding:'utf8',timeout:220000,maxBuffer:2000000});
if(!/^# tests 25$/m.test(stdout)||!/^# pass 25$/m.test(stdout)||!/^# fail 0$/m.test(stdout))throw new Error('TARGETED_TESTS_INCOMPLETE');
const normalPath=/OFFLINE_TRACE_SAFE_PATH=([^\r\n]+)/.exec(stdout)?.[1],measurementPath=/COUNTERFACTUAL_TRACE_SAFE_PATH=([^\r\n]+)/.exec(stdout)?.[1];
if(!normalPath||!measurementPath)throw new Error('TRACE_MISSING');
const normal=JSON.parse(fs.readFileSync(normalPath)),measurement=JSON.parse(fs.readFileSync(measurementPath));
if(normal.result.status!=='BLOCKED'||normal.admittedGlobal!==500||measurement.result.status!=='PASS'||!measurement.measurementOnly||measurement.productionCompatible!==false||measurement.approvedGlobalMax!==500)throw new Error('BUDGET_TRACE_CONTRADICTION');
const v9root=fileURLToPath(new URL('../e-verify-group1-remaining-assets/artifacts/',import.meta.url));
const prior=JSON.parse(fs.readFileSync(v9root+'EXECUTION_BINDING_ASSET_READER.json'));
const privatePath='C:/Users/1/AppData/Local/OpenGlassHub/acceptance-input/e-verify-20261012/STATEFUL_PRIVATE_BINDING_WORKING.json';
const privateBytes=fs.readFileSync(privatePath),privateHash=sha(privateBytes),budgets=JSON.parse(privateBytes).budget;
if(budgets.allBrowserHttpDispatchesMax!==500||budgets.openaiAndProviderCostUSDMax!==0)throw new Error('OWNER_BUDGET_DRIFT');
const files=new Map(prior.files.map(f=>[f.path,f]));
const add=p=>{p=path.resolve(p).replaceAll('\\','/');files.set(p,{path:p,sha256:sha(fs.readFileSync(p))})};
for(const n of fs.readdirSync(here)){const p=path.join(here,n);if(fs.statSync(p).isFile())add(p)}
add(process.execPath);add(privatePath);
for(const f of ['ASSET_READ_EXECUTION_SAFE.json','ASSET_READ_FINAL_SAFE.json','ASSET_READ_SUPERVISOR_SAFE.json','AUTHORIZED_ASSET_READ.json','ASSET_READ_ONCE.claim'])add(v9root+f);
for(const f of files.values())if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('FROZEN_INPUT_CHANGED');
fs.mkdirSync(out);
const write=(name,value)=>{const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n'),p=path.join(out,name);fs.writeFileSync(p,bytes,{flag:'wx'});add(p);return sha(bytes)};
write('V9_PROVENANCE_REVIEW_SAFE.json',reviewed.safe);
write('VERIFIED_GROUP1_STATIC_MANIFEST.json',{format:'group1-complete-static-evidence-v1',version:reviewed.safe.version,source:reviewed.safe.source,assets:reviewed.safe.assets,
 html:[...reviewed.html].map(([route,body])=>({route,bytes:body.length,sha256:sha(body),normalizedCodeAndMarkupSha256:normalizedHtmlHash(body)})),productionAuthorization:'NOT_AUTHORIZED'});
write('NORMAL_OWNER500_CHROME_TRACE_SAFE.json',normal);
write('COUNTERFACTUAL_LOOPBACK_MEASUREMENT_SAFE.json',measurement);
write('TARGETED_TESTS_SAFE.json',{tests:25,passed:25,failed:0,stdoutSha256:sha(Buffer.from(stdout)),durationMs:Date.now()-start,
 normalFullFlow:'BLOCKED_AT_OWNER500',counterfactualFlow:'MOCK_PASS_NOT_PRODUCTION_COMPATIBLE',oldSuitesRerun:false,productionRequests:0,productionWrites:0});
const budgetReport={format:'group1-budget-closure-v1',status:'OWNER_BUDGET_DECISION_REQUIRED',approvedMax:500,approvedBudgets:budgets,privateBindingSha256:privateHash,
 actualOfflineDispatchCount:normal.actualOfflineDispatchCount,normalGlobalAdmissions:normal.admittedGlobal,normalFirstFailure:normal.result.firstFailure,
 firstBudgetRejection:normal.result.requestDiagnostics.map(d=>d?.firstRejection).find(d=>d?.rejectionCategory==='BUDGET_EXCEEDED'),
 normalIdentities:normal.result.identitiesVerified,normalCatalogMocks:normal.result.catalogCasesPassed,normalNegativeAuthMocks:normal.result.negativeAuthPassed,
 counterfactualFixtureMax:measurement.fixtureAdmissionMax,counterfactualGlobalAdmissions:measurement.admittedGlobal,counterfactualPhysicalDispatches:measurement.actualOfflineDispatchCount,
 measuredScenarioGap:measurement.admittedGlobal-500,minimumProductionIncrease:'UNKNOWN_NOT_THIS_FIXTURE_GAP',
 boundedRefreshAllowance:{max:budgets.ownerSessionRefreshRequestsMax,fixtureUsed:measurement.result.counts.ownerSessionRefreshRequestsMax},
 boundedTurnstileAllowance:{max:budgets.turnstileHttpDispatchesMax,fixtureUsed:measurement.result.counts.turnstileHttpDispatchesMax},
 cleanupReserveSeconds:60,executionHardSeconds:1800,executionWorkSeconds:1740,unknownDynamicRequests:'Managed challenge/refresh/background/logout timing remain Production-unverified; hard caps stop, not completion guarantees',
 ownerBudgetsChanged:false,privateBindingReady:true,fullGroup1Authorization:'BLOCKED',authorizationId:null,packetSha256:null,claimCreated:false,goIssued:false,
 oauthCheck:'DEFERRED_UNTIL_OWNER_BUDGET_GATE_CLOSED_BEFORE_ANY_NEW_UTC_APPROVAL',requiredScopes:['account:read','workers_scripts:write'],oauthRemainingStrictlyGreaterThanSeconds:1860,
 productionRequests:0,productionWrites:0,catalogHold:'ACTIVE',publicBetaGo:'NOT_AUTHORIZED'};
write('BUDGET_CLOSURE_SAFE.json',budgetReport);
const binding={format:'group1-v9-offline-engineering-binding-v1',status:'BLOCKED_OWNER_BUDGET_NOT_PRODUCTION_AUTHORIZATION',source:reviewed.safe.source,version:reviewed.safe.version,
 original14MappingsPreserved:true,authenticatedRLSRequests:16,ownerBudgetsChanged:false,newAuthorizationId:null,packetCreated:false,claimCreated:false,goIssued:false,
 files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),nodePath:process.execPath,privateBindingSha256:privateHash,
 maxAdditionalCostUSD:0,productionRequests:0,productionWrites:0,catalogHold:'ACTIVE',publicBetaGo:'NOT_AUTHORIZED'};
const digest=write('EXECUTION_BINDING_OFFLINE_BLOCKED.json',binding);
console.log(JSON.stringify({provenAssets:29,targetedTests:'25/25',engineeringBindingSha256:digest,requestBudget:'INSUFFICIENT_FOR_MEASURED_SCENARIO',approvedMax:500,
 measuredGlobalAdmissions:measurement.admittedGlobal,measuredScenarioGap:measurement.admittedGlobal-500,productionMinimumIncrease:'UNKNOWN',newPacket:'NOT_CREATED_BLOCKED',productionRequests:0,productionWrites:0}));
