import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {sha} from '../e-verify-group1-production-binding/semantic.mjs';
import {reviewV9} from '../e-verify-group1-v9-closure/review.mjs';
import {ID,GO,HUMAN_GATES} from './authorization.mjs';
import {scopeDigest} from 'file:///C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/free-plan-policy.mjs';
import {assertPacket,readPrivateVersion} from './policy.mjs';
import {check} from 'file:///C:/Temp/ogh-e-verify-production-acceptance-20261012/stateful-owner-intake/check-complete-binding-local.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),out=path.join(here,'artifacts');
if(fs.existsSync(out))throw new Error('FULL650_PREPARATION_ALREADY_EXISTS');
const priorRoot=fileURLToPath(new URL('../e-verify-group1-budget650/artifacts/',import.meta.url)),candidateBytes=fs.readFileSync(priorRoot+'CANDIDATE_ENGINEERING_BINDING_NOT_AUTHORIZED.json'),candidate=JSON.parse(candidateBytes);
if(sha(candidateBytes)!=='9199ef067bfd30b37efca2bd5e715dfe592bd309e050af03180b58d676ae2e37')throw new Error('CANDIDATE_BINDING_DRIFT');
for(const f of candidate.files)if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('HISTORICAL_INPUT_CHANGED');
const privateRoot=path.join(process.env.LOCALAPPDATA,'OpenGlassHub','acceptance-input','e-verify-20261012'),oldPath=path.join(privateRoot,'STATEFUL_PRIVATE_BINDING_WORKING.json'),newPath=path.join(privateRoot,'STATEFUL_PRIVATE_BINDING_GROUP1_650_V1.json');
const oldBytes=fs.readFileSync(oldPath),newBytes=fs.readFileSync(newPath),old=JSON.parse(oldBytes),next=JSON.parse(newBytes);
if(sha(oldBytes)!=='fadbb0ffde9e4a7dcbcf232143738f547e0a70ef7750983beab6bafc44095678'||sha(newBytes)!=='950e185df3a3658ce990def5061cc39a63e571443292fabf141a99e5b9de98a3')throw new Error('PRIVATE_VERSION_CHANGED');
const differences=[];
function compare(a,b,route){if(a===b)return;if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))compare(a[k],b[k],route?route+'.'+k:k);return}differences.push(route)}
compare(old,next,'');if(JSON.stringify(differences)!=='["budget.allBrowserHttpDispatchesMax"]'||old.budget.allBrowserHttpDispatchesMax!==500||next.budget.allBrowserHttpDispatchesMax!==650)throw new Error('PRIVATE_AMENDMENT_NOT_SINGLE_FIELD');
const checked=check(next,false);if(checked.ownerMissingFieldNames.length||checked.invalidFieldNames.length||checked.reservedForActualApproval.length!==3)throw new Error('PRIVATE_METADATA_INVALID');
const review=await reviewV9();
const fullRoot='C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/artifacts/';
const originalPacketBytes=fs.readFileSync(fullRoot+'GROUP1_PACKET_NOT_AUTHORIZED.json'),originalProofBytes=fs.readFileSync(fullRoot+'OWNER_FREE_PLAN_EVIDENCE.json');
if(sha(originalPacketBytes)!=='8bb232165198cd74a79f59758d2b318186bb6aefc63cf8d4360d0faedb31ccac')throw new Error('ORIGINAL_PACKET_CHANGED');
const packet=JSON.parse(originalPacketBytes),proof=JSON.parse(originalProofBytes);
if(packet.freePlanProofSha256!==sha(originalProofBytes))throw new Error('ORIGINAL_FREE_PROOF_CHANGED');
packet.authorizationId=ID;packet.ownerBudgets=next.budget;packet.staticManifest=review.safe.assets;
packet.proposedContractChanges=[...packet.proposedContractChanges,
 'Owner approved exactly global500->650 on2026-10-14; all other budgets and capabilities unchanged',
 'Replace unproven local67 static assets with29 exact source-reviewed Production captures; unknown assets denied',
 'Use current offline-tested same-session/navigation merge only for exact own summary/preferences/notifications GET; every browser request charged; cached failed outcome stops',
 'Accepted identity-bound refresh advances authenticated GET replay generation only; explicit identity is invalidated, all Mutation replay rules unchanged',
 'Source-defined locale generation/provenance/source props normalized only; code, resources, other props and locale/preference/text pinned',
 'Validate preference adoption response before arming one products reload; landing requires hydration/preference/quiet boundary, not unconditional reload',
 'New unique full650 ID/entry/authorization/Claim/receipt namespace and independent GO; all consumed prior attempts preserved'];
packet.freePlanScopeSha256=scopeDigest(packet);
proof.scopeSha256=packet.freePlanScopeSha256;proof.reboundFromProofSha256=sha(originalProofBytes);proof.reboundEvidence='DERIVED_OFFLINE_SAME_OWNER_ATTESTED_FREE_SERVICES_NO_NEW_PROVIDER_OBSERVATION';
const proofBytes=Buffer.from(JSON.stringify(proof,null,2)+'\n');packet.freePlanProofSha256=sha(proofBytes);
const files=new Map(candidate.files.map(f=>[f.path,f]));
const add=p=>{p=path.resolve(p).replaceAll('\\','/');files.set(p,{path:p,sha256:sha(fs.readFileSync(p))})};
for(const name of fs.readdirSync(here)){const p=path.join(here,name);if(fs.statSync(p).isFile())add(p)}
add(newPath);add(process.execPath);add(fullRoot+'GROUP1_PACKET_NOT_AUTHORIZED.json');add(fullRoot+'OWNER_FREE_PLAN_EVIDENCE.json');
add('C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013/execution/group1/free-plan-policy.mjs');
for(const f of ['check-complete-binding-local.mjs','../stateful-binding-preparation/check-private-metadata-offline.mjs'])add(path.resolve('C:/Temp/ogh-e-verify-production-acceptance-20261012/stateful-owner-intake',f));
const allNull=Object.fromEntries(HUMAN_GATES.map(k=>[k,null]));
fs.mkdirSync(out);
const write=(name,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n'),p=path.join(out,name);fs.writeFileSync(p,bytes,{flag:'wx'});add(p);return sha(bytes)};
write('OWNER_FREE_PLAN_EVIDENCE.json',proofBytes);
write('BUDGET_AMENDMENT_APPLIED_SAFE.json',{budgetAmendment:'APPLIED',approvedBy:'EXPLICIT_OWNER_MESSAGE',approvalScope:'BUDGET_ONLY_NOT_PRODUCTION_AUTHORIZATION',
 changedFieldNames:differences,oldGlobalMax:500,newGlobalMax:650,otherFieldsUnchanged:true,oldPrivateSha256:sha(oldBytes),newPrivateSha256:sha(newBytes),
 oldVersionPreserved:true,originalTemplatePreserved:true,optionalCircleFields:'UNCHANGED_NULL',formalAuthorizationFields:'UNCHANGED_NULL',privateValuesPrinted:false,productionRequests:0,productionWrites:0});
const packetSha=write('GROUP1_PACKET_NOT_AUTHORIZED.json',packet);
const binding={format:'e-verify-group1-full650-execution-binding-v1',status:'READY_FOR_OWNER_APPROVAL_NOT_AUTHORIZED',authorizationId:ID,packetSha256:packetSha,
 sourceRoot:'C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub',nodePath:process.execPath,
 privateBindingPath:newPath,privateBindingSha256:sha(newBytes),preservedOldPrivateBindingPath:oldPath,preservedOldPrivateBindingSha256:sha(oldBytes),
 priorCandidateBindingSha256:sha(candidateBytes),files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),
 independentGo:GO,productionAuthorization:'NOT_AUTHORIZED',claimCreated:false,goIssued:false,productionRequests:0,productionWrites:0};
assertPacket(packet,binding);readPrivateVersion(binding,packet);
const bindingSha=write('EXECUTION_BINDING_GROUP1.json',binding);
const pending={format:'e-verify-group1-authorization-v1',authorizationId:ID,packetSha256:packetSha,executionBindingSha256:bindingSha,authorizedAtUTC:null,authorizationExpiresUTC:null,humanGates:allNull};
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json',pending);
const originalContract=fs.readFileSync(fullRoot+'HUMAN_GROUP1_FREE_PLAN_AUTHORIZATION_NOT_AUTHORIZED.md','utf8');
let contract=originalContract.replaceAll('e-verify-group1-openglasshub-20261013-free-plan-v2',ID)
 .replaceAll('8bb232165198cd74a79f59758d2b318186bb6aefc63cf8d4360d0faedb31ccac',packetSha)
 .replaceAll('bb9976a44d58f71a2f3a2f156a3394bb3b68a5032a4da7b893ddcac05e0489a3',bindingSha)
 .replaceAll('GO_E_VERIFY_GROUP1_V1',GO).replace('67 frozen script/style paths','29 reviewed Production script/style paths')
 .replace('1175 implementation',String(binding.files.length)+' implementation')
 .replace('all client/browser admissions 500','all client/browser admissions 650').replace('in the 500 global cap','in the 650 global cap')
 .replace('and the unchanged owner budgets','and the owner-approved650 global budget; other budgets unchanged')
 .replace('in the unchanged protected input','in a new protected budget version preserving the original500 input')
 .replaceAll("C:\\Temp\\ogh-e-verify-group1-free-plan-authorization-20261013\\execution\\group1\\entry.mjs",path.join(here,'entry.mjs'))
 .replaceAll("C:\\Program Files\\nodejs\\node.exe",process.execPath);
contract+='\n## Current QA Binding Closure Addendum (requires full owner approval)\n\n'+
 'The only approved budget amendment is global500->650; existing private input500 is preserved, and this entry uses the protected650 version. The650 cap is not a Production completion guarantee. Candidate8/8, source/runtime25/25 and original123/43/9 evidence are reused; no Production replay.\n\n'+
 'Static resources are exactly29 captured/reviewed Production paths and bytes, not the old unproven67-file local build. All stages/actors/resource types/versions and unknown-request pre-dispatch blocking remain. No whole-site wildcard. HTML must match reviewed code/markup; only source-defined locale generation/provenance/source metadata may normalize, never code/resources/private props/text/locale/preference. A different production page body stops rather than being accepted from HTTP200.\n\n'+
 'The already approved own summary/preferences/notification GETs may share one successful result per same navigation and Session; all browser attempts still count. No Auth/identity/RLS/Mutation is cached. Header/Cookie/private identity checks apply; navigation or accepted Session change clears reuse. The original one admin/me duplicate within1000ms rule remains unchanged. A budgeted identity-bound refresh creates only a new authenticated GET replay generation and invalidates explicit identity verification; Mutation replay identity is unchanged. A validated preference response can arm the single products reload even if it finishes on login; landing still verifies page marker/hydration/preference/quiet state without demanding a reload that source behavior does not require.\n\n'+
 'These are offline QA corrections, not production business changes. Parent->unchanged frozen Native Job supervisor/bootstrap->new child->existing full14-case runner->new reviewed adapter/browser/gate is the only chain. No historical entry/Claim/GO state is reused. No receipt after failure may be overwritten or retried. The new independent command is `'+GO+'`.\n\n'+
 'OAuth local scopes account:read/workers_scripts:write and remaining strictly>1860s must pass before approving the actual UTC window and again at GO. No OAuth auto-login/refresh or remote identity claim from local metadata. All five gates and both UTC fields remain null. This budget approval is not acceptance of this full addendum or a Production GO.\n';
const templateSha=write('HUMAN_FULL_GROUP1_650_AUTHORIZATION_NOT_AUTHORIZED.md',Buffer.from(contract));
console.log(JSON.stringify({status:'READY_FOR_OWNER_APPROVAL',budgetAmendment:'APPLIED',otherBudgetsUnchanged:true,authorizationId:ID,executionBindingSha256:bindingSha,packetSha256:packetSha,templateSha256:templateSha,humanGates:'5_NULL',utcWindow:'NULL',go:'NOT_ISSUED',claimCreated:false,productionRequests:0,productionWrites:0}));
