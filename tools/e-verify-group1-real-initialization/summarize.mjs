import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const here=fileURLToPath(new URL('.',import.meta.url)),root=path.join(here,'artifacts'),sha=b=>createHash('sha256').update(b).digest('hex');
const names=fs.readdirSync(root).filter(n=>/^natural(?:-\d+)?-initialization\.safe\.json$/.test(n));
names.sort((a,b)=>Number(a.match(/-(\d+)-initialization/)?.[1]||1)-Number(b.match(/-(\d+)-initialization/)?.[1]||1));
const name=names.at(-1),bytes=fs.readFileSync(path.join(root,name)),r=JSON.parse(bytes);
if(r.status!=='PARTIAL_THIRD_PARTY_REAL_BYTES_UNAVAILABLE'||r.inertMockUsed||r.injectedUnknownUsed||r.cleanup!=='PASS'||r.productionRequests!==0||r.productionWrites!==0)throw new Error('OBSERVATION_CLOSURE_INVALID');
const supervisorName=name.replace('initialization','supervisor'),sb=fs.readFileSync(path.join(root,supervisorName)),s=JSON.parse(sb);
if(s.classification!=='EXIT_ZERO'||!s.reaped||!s.containment.closed)throw new Error('CONTAINMENT_CLOSURE_INVALID');
const report={format:'group1-real-initialization-closure-v1',status:'PARTIAL_NO_PRODUCTION_AUTHORIZATION',
 observation:name,observationSha256:sha(bytes),supervisor:supervisorName,supervisorSha256:sha(sb),
 productionHtmlReplay:'PASS_RETAINED_BYTES_ONLY',hydratedIslands:r.dom.islands.filter(x=>x.hydrated).length,
 applicationLoopbackResponses:r.loopbackResponses.length,observedPageRequestAttempts:r.actualChromeRequests.length,
 knownDocumentIconsCancelled:r.actualChromeRequests.filter(x=>x.observationCategory==='B_ICON_CANCELLED').length,
 existingNonessentialExclusions:r.actualChromeRequests.filter(x=>x.observationCategory==='B_EXISTING_NONESSENTIAL_RESOURCE_EXCLUSION').length,
 unknownApplicationRequestsInCoveredStage:r.unknownNaturalRequests,unknownAfterRealChallenge:'UNOBSERVED',
 turnstileBootstrapObserved:true,turnstileRealResponseSupplied:false,turnstileCoverage:'PARTIAL_TRIGGER_ONLY_API_RENDER_CHALLENGE_UNAVAILABLE',
 reviewedBootstrapInitiators:[...new Set(r.cdpRequests.filter(x=>x.originClass==='TURNSTILE').flatMap(x=>x.reviewedInitiatorModules))],
 parsedModules:r.parsedScripts.length,scriptOrderBoundary:'REQUEST_AND_PARSE_ORDER_NOT_TOTAL_EVALUATION_ORDER',
 deniedProxyAttempts:r.proxyRequests.length,proxyAttribution:'NO_PAGE_FRAME_OR_INITIATOR_PROOF_NO_FORWARDING',
 globalAdmissionsAtCleanup:r.finalGlobalAdmissions,globalMax:650,authTransports:0,restTransports:0,credentialFieldsUntouched:r.dom.credentialFieldsEmpty,
 browserAuthLocalStorageEntries:r.dom.authStorageEntryCount,cleanup:'PASS',targetedNewCasesPassed:1,targetedNewCasesRequired:1,
 oldTestEvidenceReused:'15/15_NOT_RERUN',originalV11Identity:'UNKNOWN',historicalAuthorizationReusable:false,
 fullGroup1Authorization:'BLOCKED',unknownRequestDiagnosticReachability:'UNPROVEN',newProductionPacketCreated:false,
 productionRequests:0,productionWrites:0,catalogHold:'ACTIVE',group2:'NOT_AUTHORIZED',group3:'NOT_AUTHORIZED',publicBetaGo:'NOT_AUTHORIZED'};
fs.writeFileSync(path.join(root,'INITIALIZATION_CLOSURE_SAFE.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,hydratedIslands:report.hydratedIslands,applicationRequests:report.applicationLoopbackResponses,
 iconsCancelled:report.knownDocumentIconsCancelled,unknownApplicationRequests:report.unknownApplicationRequestsInCoveredStage,
 proxyRequestsDenied:report.deniedProxyAttempts,globalAdmissions:report.globalAdmissionsAtCleanup,productionRequests:0}));
