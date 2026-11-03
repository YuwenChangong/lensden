import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyFiles} from '../e-verify-group1-full650-chrome-v11/authorization.mjs';

const here=fileURLToPath(new URL('.',import.meta.url)),artifacts=path.join(here,'artifacts');
const old=fileURLToPath(new URL('../e-verify-group1-full650-chrome-v11/artifacts/',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const check=(value,code)=>{if(!value)throw new Error(code)};
const read=name=>fs.readFileSync(path.join(old,name));
const bindingBytes=read('EXECUTION_BINDING_GROUP1.json'),binding=JSON.parse(bindingBytes);
check(sha(bindingBytes)==='c5578e592aa950764fcae09ebca458bd48aa3f16d5a07a27bb63afdda6ce8b5a','OLD_BINDING_HASH');
check(sha(read('GROUP1_PACKET_NOT_AUTHORIZED.json'))==='a6a356005f43b92dc16625ec3109324a08c6d8dd8fa2b88eca23333ef3a54ed8','OLD_PACKET_HASH');
check(sha(read('GROUP1_V11_GO_CLOSURE_SAFE.json'))==='ecd280d46cef12da269a3d5fa5f353c7ef142d70e1b198becf7e50c47e3e5340','OLD_CLOSURE_HASH');
check(sha(read('GROUP1_EXECUTION_SAFE.json'))==='f9ab908543f4463113e4a0dc4c1d8dbc31f7ac52dea5c87053c741461277e70d','OLD_CHILD_HASH');
check(sha(read('AUTHORIZED_GROUP1.json'))==='3e3ed030dc164a430d1aec75d98418aad3f326ae2606a70aeefc139702d2e2e5','OLD_APPROVAL_HASH');
verifyFiles(binding.files);
check(sha(fs.readFileSync(binding.privateBindingPath))===binding.privateBindingSha256,'PRIVATE_VERSION_DRIFT');
check(sha(fs.readFileSync(binding.preservedOldPrivateBindingPath))===binding.preservedOldPrivateBindingSha256,'PRIVATE_ORIGINAL_DRIFT');
const closure=JSON.parse(read('GROUP1_V11_GO_CLOSURE_SAFE.json')),packet=JSON.parse(read('GROUP1_PACKET_NOT_AUTHORIZED.json'));
check(closure.authorizationConsumed&&closure.claimCreated&&fs.existsSync(path.join(old,'GROUP1_ONCE.claim')),'OLD_CONSUMPTION_STATE');
check(closure.rejectedRequest.normalizedRoute==='/:unbound'&&closure.rejectedRequest.resourceType==='other'&&closure.rejectedRequest.networkDispatchOccurred===false,'OLD_FAILURE_FACTS');
check(packet.staticManifest.length===29&&packet.requiredCases.length===14&&packet.catalogRestRequests.length===16&&packet.ownerBudgets.allBrowserHttpDispatchesMax===650,'OLD_SCOPE_COUNTS');

function latest(mode){
 const names=fs.readdirSync(artifacts).filter(n=>new RegExp('^'+mode+'(?:-\\d+)?-local\\.safe\\.json$').test(n));
 names.sort((a,b)=>(Number(a.match(/-(\d+)-local/)?.[1]||1)-Number(b.match(/-(\d+)-local/)?.[1]||1)));
 check(names.length>0,'LOCAL_CASE_MISSING');const name=names.at(-1);return {name,receipt:JSON.parse(fs.readFileSync(path.join(artifacts,name)))};
}
const original=latest('original'),observed=latest('observed'),unknown=latest('unknown');
for(const run of [original,observed,unknown])check(run.receipt.cleanup==='PASS'&&run.receipt.productionRequests===0&&run.receipt.productionWrites===0&&run.receipt.authDispatches===0&&run.receipt.rlsDispatches===0,'LOCAL_SIDE_EFFECT_OR_CLEANUP');
check(original.receipt.browserReceipt.firstFailure==='UNAPPROVED_REQUEST'&&original.receipt.browserReceipt.diagnostics.firstRejection.resourceType==='other','LOCAL_REPRODUCTION');
check(original.receipt.wireRequests.length===24,'LOCAL_REQUEST_CORRELATION');
check(observed.receipt.status==='OBSERVATION_COMPLETE'&&observed.receipt.hydrated&&observed.receipt.scriptErrorCodes.length===0&&!observed.receipt.browserReceipt.diagnostics.firstRejection,'LOCAL_EXCLUSION_REGRESSION');
check(unknown.receipt.browserReceipt.diagnostics.firstRejection.networkDispatchOccurred===false&&unknown.receipt.browserReceipt.diagnostics.preDispatchContext.firstRejected.privateCorrelation.status==='ENCRYPTED_PATH_ONLY','LOCAL_UNKNOWN_STILL_BLOCKED');

const summary={format:'group1-other-request-offline-closure-v1',status:'HISTORICAL_IDENTITY_UNKNOWN_FULL_REAUTHORIZATION_BLOCKED',
 originalBindingVerifiedFiles:binding.files.length,originalFrozenFilesUnchanged:true,privateInputsUnchanged:true,oldAuthorizationConsumed:true,oldClaimPreserved:true,
 historicalRejection:closure.rejectedRequest,originalRequestIdentity:'UNKNOWN_NOT_RETAINED',historicalRootCause:'UNKNOWN',
 localReproduction:'PASS',localOnlyCandidateIcons:original.receipt.observedOther.filter(r=>r.htmlReferenceMatch).map(r=>r.publicPathname),
 candidateBoundary:'LOCAL_MATCHING_SYMPTOM_AND_COUNT_NOT_PROOF_OF_HISTORICAL_REQUEST',localCompletedApplicationGets:original.receipt.wireRequests.length,
 iconHandling:'EXACT_VALIDATED_HTML_REFERENCE_EXCLUDED_WITHOUT_TRANSPORT_NOT_NEW_DOWNLOAD_PERMISSION',
 staticResourceBindings:29,originalMappings:14,rlsSteps:16,globalAdmissionMax:650,allBudgetsUnchanged:true,
 targetedPolicyTests:12,uniqueRealChromeCases:3,targetedTestsPassed:15,targetedTestsRequired:15,
 localCaseReceipts:[original.name,observed.name,unknown.name],localHydration:'PASS',liveAuth:'NOT_VERIFIED',liveRls:'NOT_VERIFIED',
 unknownRequestPredispatchBlocking:'PASS',privateCorrelation:'ENCRYPTED_PATH_ONLY_PROTECTED_DIRECTORY_NO_QUERY_HEADER_SESSION',
 fullGroup1Authorization:'BLOCKED',productionDiagnostic:'SCOPE_DRAFT_ONLY_NOT_FROZEN_NOT_AUTHORIZED',
 productionRequests:0,productionWrites:0,providerRequests:0,catalogHold:'ACTIVE',publicBetaGo:'NOT_AUTHORIZED'};
fs.writeFileSync(path.join(artifacts,'OFFLINE_CLOSURE_SAFE.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
const files=walk(here).map(file=>({path:path.relative(here,file).replaceAll('\\','/'),sha256:sha(fs.readFileSync(file))})).sort((a,b)=>a.path.localeCompare(b.path));
const frozen={format:'group1-other-request-local-engineering-binding-v1',status:'OFFLINE_ONLY_NOT_A_PRODUCTION_EXECUTION_BINDING',
 sourceBindingSha256:sha(bindingBytes),fullGroup1Authorization:'BLOCKED',productionEntryFrozen:false,files,
 productionRequests:0,productionWrites:0,goIssued:false,claimCreated:false};
const bytes=Buffer.from(JSON.stringify(frozen,null,2)+'\n');fs.writeFileSync(path.join(artifacts,'EXECUTION_BINDING_OFFLINE_ONLY.json'),bytes,{flag:'wx'});
console.log(JSON.stringify({offlineBindingSha256:sha(bytes),boundLocalFiles:files.length,oldBindingsUnchanged:binding.files.length,scopeChanged:false,productionRequests:0,productionWrites:0}));
