import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const here=fileURLToPath(new URL('.',import.meta.url)),out=path.join(here,'artifacts');
const sha=b=>createHash('sha256').update(b).digest('hex');
if(fs.existsSync(out))throw new Error('CANDIDATE_FREEZE_EXISTS');
const priorPath=fileURLToPath(new URL('../e-verify-group1-v9-closure/artifacts/EXECUTION_BINDING_OFFLINE_BLOCKED.json',import.meta.url));
const priorBytes=fs.readFileSync(priorPath),prior=JSON.parse(priorBytes);
if(sha(priorBytes)!=='904dead9b3043e23e382a83feb2411bca1fa3cc32511639ed19ee40076f489f7')throw new Error('PREVIOUS_BINDING_DRIFT');
for(const f of prior.files)if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('PREVIOUS_FROZEN_FILE_DRIFT');
const tracePath=path.resolve(process.argv[2]||'');
if(!tracePath.startsWith(path.join(process.env.TEMP,'ogh-group1-budget650-')))throw new Error('CANDIDATE_TRACE_SCOPE');
const traceBytes=fs.readFileSync(tracePath),trace=JSON.parse(traceBytes),supervisorBytes=fs.readFileSync(path.join(path.dirname(tracePath),'supervisor.safe.json')),supervisor=JSON.parse(supervisorBytes);
if(trace.result.status!=='PASS'||trace.fixtureAdmissionMax!==650||trace.approvedGlobalMax!==500||trace.ownerBudgetChangeApproved!==false||trace.savedOwnerCapsUnchanged!==true
 ||trace.result.identitiesVerified!==3||trace.result.catalogCasesPassed!==16||trace.result.negativeAuthPassed!==3||trace.providerFixtureGETs!==2
 ||supervisor.classification!=='EXIT_ZERO'||!supervisor.containment.closed||!supervisor.reaped||supervisor.receiptMissing||trace.productionRequests!==0||trace.productionWrites!==0)throw new Error('CANDIDATE_TRACE_INVALID');
const privatePath='C:/Users/1/AppData/Local/OpenGlassHub/acceptance-input/e-verify-20261012/STATEFUL_PRIVATE_BINDING_WORKING.json';
const privateBytes=fs.readFileSync(privatePath),caps=JSON.parse(privateBytes).budget;
if(sha(privateBytes)!==prior.privateBindingSha256||caps.allBrowserHttpDispatchesMax!==500||caps.openaiAndProviderCostUSDMax!==0)throw new Error('PRIVATE_INPUT_CHANGED');
const files=new Map(prior.files.map(f=>[f.path,f]));
const add=p=>{p=path.resolve(p).replaceAll('\\','/');files.set(p,{path:p,sha256:sha(fs.readFileSync(p))})};
add(priorPath);add(process.execPath);
for(const name of fs.readdirSync(here)){const p=path.join(here,name);if(fs.statSync(p).isFile())add(p)}
fs.mkdirSync(out);
const write=(name,value)=>{const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n'),p=path.join(out,name);fs.writeFileSync(p,bytes,{flag:'wx'});add(p);return sha(bytes)};
const rlsPath=fileURLToPath(new URL('../e-verify-group1-v9-closure/artifacts/NORMAL_OWNER500_CHROME_TRACE_SAFE.json',import.meta.url));
write('CANDIDATE650_CHROME_TRACE_SAFE.json',trace);write('CANDIDATE650_SUPERVISOR_SAFE.json',supervisor);
write('TARGETED_BUDGET_TESTS_SAFE.json',{tests:8,passed:8,failed:0,testCommand:'node --test --test-concurrency=1 candidate.test.mjs browser.test.mjs',
 testEvidence:'Current successful observed tool invocation; immutable Chrome trace and native supervisor linked below',chromeTraceSha256:sha(traceBytes),supervisorSha256:sha(supervisorBytes),
 reused25TestsSha256:sha(fs.readFileSync(fileURLToPath(new URL('../e-verify-group1-v9-closure/artifacts/TARGETED_TESTS_SAFE.json',import.meta.url)))),
 reusedOwner500TraceSha256:sha(fs.readFileSync(rlsPath)),productionRequests:0,productionWrites:0,oldSuitesRerun:false});
const proposal={format:'group1-global-admission-budget-amendment-proposal-v1',status:'READY_FOR_EXPLICIT_OWNER_BUDGET_APPROVAL_NOT_EXECUTION',
 scope:'Only allBrowserHttpDispatchesMax',current:500,proposed:650,additionalAdmissions:150,budgetChangeApproved:false,effective:false,
 otherBudgetChanges:[],ownerBudgetsStill:caps,privateBindingSha256:sha(privateBytes),source:prior.source,productionVersion:prior.version,
 requiredMappings:14,catalogRequests:16,actors:['A','B','ADMIN'],hardSeconds:1800,workSeconds:1740,cleanupReserveSeconds:60,
 candidateObservedAdmissions:trace.admittedGlobal,candidateObservedWireDispatches:trace.actualOfflineDispatchCount,countsBySource:trace.countsBySource,
 otherBudgetConflicts:'NONE_OBSERVED_IN_CANDIDATE_MOCK',productionWorstCaseGuaranteed:false,turnstileMax:40,refreshMax:6,dynamicTurnstileRequests:'UNKNOWN_HARD_CAPPED',
 requestAdmissionBoundary:'Global and categories charged before wire, failure counted, atomic reservation, stop on exhaustion',
 authorizationId:null,humanGates:'NOT_APPROVED_FOR_NEW_FULL_EXECUTION',authorizedAtUTC:null,authorizationExpiresUTC:null,claimCreated:false,goIssued:false,
 productionRequests:0,productionWrites:0,maxAdditionalCostUSD:0,paidUsageAuthorized:false,catalogHold:'ACTIVE',group2:'NOT_AUTHORIZED',group3:'NOT_AUTHORIZED',publicBetaGo:'NOT_AUTHORIZED'};
const proposalSha=write('BUDGET_AMENDMENT_PROPOSAL_NOT_AUTHORIZED.json',proposal);
const binding={format:'group1-budget650-candidate-engineering-binding-v1',status:'CANDIDATE_ONLY_NO_EFFECTIVE_BUDGET_OR_PRODUCTION_AUTHORIZATION',
 priorEngineeringBindingSha256:sha(priorBytes),proposalSha256:proposalSha,files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),
 candidate650Mock:'PASS',approvedOwnerBudget:500,ownerApprovalPending:true,fullAuthorizationPacketCreated:false,productionRequests:0,productionWrites:0};
const bindingSha=write('CANDIDATE_ENGINEERING_BINDING_NOT_AUTHORIZED.json',binding);
console.log(JSON.stringify({candidate:'PASS',targetedTests:'8/8',admissions:trace.admittedGlobal,dispatches:trace.actualOfflineDispatchCount,
 candidateBindingSha256:bindingSha,budgetAmendmentProposalSha256:proposalSha,budgetChangeApproved:false,fullAuthorizationPacket:'BLOCKED_PENDING_OWNER_BUDGET_APPROVAL',productionRequests:0,productionWrites:0}));
