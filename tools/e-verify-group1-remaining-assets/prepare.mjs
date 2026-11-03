import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {buildScope,SOURCE_ROOT} from './scope.mjs';import {analyzeBudgetAndCases} from './analysis.mjs';
import {ID,PAGES,CAPS,MARKERS,assertPacket,validateLocal} from './preflight.mjs';import {GO,HUMAN_GATES,verifyFiles} from './authorization.mjs';import {sha256} from './hash.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),root=path.join(here,'artifacts');
if(fs.existsSync(root))throw new Error('NEW_PENDING_INSTANCE_REQUIRED');
const priorPath=fileURLToPath(new URL('../e-verify-group1-production-binding/artifacts/EXECUTION_BINDING_PRODUCTION_ASSETS_OFFLINE_BLOCKED.json',import.meta.url));
if(sha256(fs.readFileSync(priorPath))!=='5f5a838041c71ba00c8f0f5debf85726666e42ce2294b0f6aad012e395e24477')throw new Error('PRIOR_REVIEW_BINDING_DRIFT');
const prior=JSON.parse(fs.readFileSync(priorPath));verifyFiles(prior.files);
if(execFileSync('git',['rev-parse','HEAD'],{cwd:SOURCE_ROOT,encoding:'utf8',windowsHide:true}).trim()!=='88680a6eaab8de4123199f16b325ec0a430b0b86')throw new Error('SOURCE_HEAD_DRIFT');
const scope=buildScope(),{budget,cases,ownerBudgets,packet:full}=analyzeBudgetAndCases(scope);
const readerBinding=JSON.parse(fs.readFileSync(new URL('../e-verify-group1-asset-reader-fresh-v8/artifacts/EXECUTION_BINDING_ASSET_READER.json',import.meta.url)));
const oldPacket=JSON.parse(fs.readFileSync(new URL('../e-verify-group1-asset-reader-fresh-v8/artifacts/ASSET_READ_PACKET_NOT_AUTHORIZED.json',import.meta.url)));
const searchedRoots=['C:/Temp/ogh-product-beta-development-20261013','C:/Temp/ogh-a-deploy-readiness-20261010',
 'C:/Temp/ogh-e-verify-production-acceptance-20261012','C:/Temp/ogh-e-verify-group1-free-plan-authorization-20261013',
 SOURCE_ROOT,'C:/Users/1/.codex/worktrees/e-verify-stateful-controls/OpenGlass Hub'];
const candidates=[],archives=[];let examined=0;
function scan(dir,depth=0){if(depth>16)throw new Error('ARCHIVE_SEARCH_DEPTH');for(const d of fs.readdirSync(dir,{withFileTypes:true})){
 if(++examined>150000)throw new Error('ARCHIVE_SEARCH_BOUND');if(['node_modules','.git','output','acceptance-input','private-input'].includes(d.name)||d.name.startsWith('.env'))continue;
 const p=path.join(dir,d.name);if(d.isDirectory())scan(p,depth+1);else if(d.isFile()){
  if(/\.(zip|tar|tgz)$/i.test(d.name))archives.push(p.replaceAll('\\','/'));
  if(/^(AdminDevicesDashboard|useAdminSession|catalog-compare-dom)\.[A-Za-z0-9_-]+\.js$/.test(d.name))candidates.push({path:p.replaceAll('\\','/'),sha256:sha256(fs.readFileSync(p)),classification:'LOCAL_BUILD_NOT_PRODUCTION_BYTE_PROOF'});
 }}}
for(const p of searchedRoots)scan(p);
const captureFiles=fs.readdirSync(readerBinding.privateEvidenceDirectory).filter(x=>x.endsWith('.dpapi')).length;
const inventory={searchedRoots,examinedEntries:examined,archiveCandidates:archives,resourceCandidates:candidates,
 protectedCaptureCount:captureFiles,protectedEvidence:'EXISTING_V8_LOGIN_PLUS23_ONLY',result:'NO_VERIFIED_PRODUCTION_ARCHIVE_FOR_REMAINING_ROOTS',
 productionSourceBuildLink:'REUSED_VERIFIED',sourceCommitEqualityIsNotByteEquality:true};
if(archives.length)throw new Error('ARCHIVE_CANDIDATE_REQUIRES_OFFLINE_REVIEW');
const target=oldPacket.requiredTarget;
const packet={format:'group1-consolidated-remaining-asset-read-v1',readerPolicyVersion:'STRICT_MODULE_PARSE_V2',htmlReferencePolicy:'REJECT_BASE_CASE_INSENSITIVE_TOKENS_AND_CSS_IMPORTS',authorizationId:ID,status:'PENDING_OWNER_APPROVAL',
 sourceSha:full.sourceSha,buildId:oldPacket.buildId,expectedProductionVersion:full.expectedProductionVersion,
 accountId:full.accountId,worker:full.worker,appOrigin:full.appOrigin,expectedPreviousDeploymentId:oldPacket.expectedPreviousDeploymentId,
 fixedRequests:[oldPacket.fixedRequests[0],...PAGES.map(p=>({url:full.appOrigin+p,method:'GET'}))],pages:PAGES,requiredTarget:target,htmlRequiredMarkers:MARKERS,
 manifest:scope.manifest,edgeRules:scope.edgeRules,requiredRoots:scope.requiredRoots,remainingSlots:scope.remainingSlots,reusedAssets:scope.reusedAssets,
 scopeSha256:sha256(Buffer.from(JSON.stringify({manifest:scope.manifest,edgeRules:scope.edgeRules,requiredRoots:scope.requiredRoots}))),
 inlineContingency:scope.inlineContingency,proposedReadBudgets:CAPS,historicalReadCeiling:70,
 amendment:{htmlGetMax:{old:1,new:3},assetGetMax:{old:67,new:7},totalGetMax:{old:70,new:12},
  details:'New independent contract; no login GET or existing23 asset GET;6 missing slots plus1 explicitly referenced inline-to-external contingency.'},
 ownerOriginalGlobalRequestCeiling:ownerBudgets.allBrowserHttpDispatchesMax,ownerBudgetSha256:sha256(Buffer.from(JSON.stringify(ownerBudgets))),
 existingFreeProofSha256:oldPacket.existingFreeProofSha256,zeroCostPolicy:oldPacket.zeroCostPolicy,
 executionLimitSeconds:300,workLimitSeconds:240,cleanupReserveSeconds:60,maxAuthorizationValiditySeconds:3600,
 oauthRemainingSecondsStrictlyGreaterThan:360,authDispatchMax:0,rlsReadsMax:0,productionWritesMax:0,thirdPartyHTTPMax:0,retries:0,redirectFollowing:0,
 publicPageSSR:'Products pages invoke existing anonymous catalog SELECT/PostgREST reads incl pagination; not zero internal reads, no direct RLS test or Auth request.',
 fullGroup1Authorized:false,group2Authorized:false,group3Authorized:false,catalogHold:'ACTIVE',publicBetaGo:'NOT_AUTHORIZED',
 humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,null])),authorizedAtUTC:null,authorizationExpiresUTC:null,proposedGo:GO};
assertPacket(packet);fs.mkdirSync(root);
const save=(name,obj)=>{const b=Buffer.from(JSON.stringify(obj,null,2)+'\n');fs.writeFileSync(path.join(root,name),b,{flag:'wx'});return sha256(b)};
save('ARCHIVE_SEARCH_SAFE.json',inventory);save('GROUP1_BUDGET_EVIDENCE.json',budget);save('GROUP1_14_CASE_RESOURCE_MATRIX.json',cases);
const packetHash=save('ASSET_READ_PACKET_NOT_AUTHORIZED.json',packet);
const testOut=execFileSync(process.execPath,['--test','--test-reporter=tap',path.join(here,'reader.test.mjs'),path.join(here,'contract.test.mjs')],
 {encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:2000000});
const count=Number(/^# tests (\d+)$/m.exec(testOut)?.[1]);if(count!==33||!/^# pass 33$/m.test(testOut)||!/^# fail 0$/m.test(testOut))throw new Error('NEW_TARGETED_TESTS_FAILED');
save('TARGETED_TESTS_SAFE.json',{tests:count,passed:count,failed:0,outputSha256:sha256(Buffer.from(testOut)),scope:'NEW_CONSOLIDATED_READER_AND_CONTRACT_ONLY',
 historical34TestsReused:true,historical123TestsReused:true,productionRequests:0,productionWrites:0,fullGroup1Browser:'BLOCKED_NOT_CLAIMED'});
const paths=new Set([...prior.files.map(f=>f.path),priorPath,...scope.sourceInputs]);
for(const name of fs.readdirSync(here))if(/\.(mjs|md|ps1)$/.test(name))paths.add(path.join(here,name));
for(const name of fs.readdirSync(root))paths.add(path.join(root,name));
const binding={format:'group1-consolidated-remaining-assets-binding-v1',status:'READY_FOR_OWNER_APPROVAL_NOT_AUTHORIZED',authorizationId:ID,packetSha256:packetHash,
 sourceRoot:SOURCE_ROOT,freeEvidencePath:readerBinding.freeEvidencePath,releaseIdentityPath:readerBinding.releaseIdentityPath,
 privateEvidenceDirectory:path.join(process.env.LOCALAPPDATA,'OpenGlassHub','asset-evidence',ID),entry:path.join(here,'entry.mjs'),child:path.join(here,'child.mjs'),
 nodePath:process.execPath,go:GO,priorReviewedAssetsBindingSha256:sha256(fs.readFileSync(priorPath)),
 files:[...paths].sort().map(p=>({path:p.replaceAll('\\','/'),sha256:sha256(fs.readFileSync(p))})),priorClaimsAndAuthorizations:'CONSUMED_NEVER_REUSED',fullGroup1Ready:false};
const bindingHash=save('EXECUTION_BINDING_ASSET_READER.json',binding);
const pending={format:'e-verify-group1-authorization-v1',authorizationId:ID,packetSha256:packetHash,executionBindingSha256:bindingHash,
 authorizedAtUTC:null,authorizationExpiresUTC:null,humanGates:packet.humanGates};save('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json',pending);
const clauses=[
 'Bind only account '+full.accountId+', Worker '+full.worker+', origin '+full.appOrigin+', Version '+full.expectedProductionVersion+'100%, Recovery1510%, Deployment '+oldPacket.expectedPreviousDeploymentId+'. Build/source link is the existing frozen receipt, not a Deployment Git-SHA field. Pre/post must match; no continuous-observation claim.',
 'Only two exact Deployment GETs at '+packet.fixedRequests[0].url+'. Each API body <=131072 bytes. Strict status/JSON/schema/version/traffic/Location checks before ignoring response Set-Cookie. Default OAuth only, no refresh, enumeration or extra Provider request.',
 'Read exactly these anonymous HTML targets at most once each: '+PAGES.map(p=>full.appOrigin+p).join(', ')+'. No query or redirect. HTTP200, complete UTF8 HTML, no response Cookie/Location, identity encoding. Require source-defined brand-module/product-detail/AdminDevicesDashboard markers, not an HTML fallback. Do not reread login or the23 verified assets. Products HTML inherently invokes existing anonymous SSR catalog reads/pagination; zero RLS here means no direct or authenticated RLS test, not zero server SELECTs.',
 'Only7 explicitly listed conditional resource slots,6 known missing plus the frozen ProductDetail285-byte inline-script contingency ONLY if actual detail HTML externalizes it. New URLs require an explicit approved-page/parent literal reference AND exact origin/GET/public eight-character hash grammar/finite stem/type/multiplicity/edge rule. HTML base elements are unsupported and rejected; HTML type/rel tokens and CSS import names are case-insensitive. No whole-site wildcard, guess, third-party fetch or unbounded traversal. Known23 reused bytes must match protected evidence before first network request; alternate paths for their occupied slots stop.',
 'At most12 GETs=3 HTML+7 new resources+2 Deployment, below the old70 ceiling. This explicitly changes old HTML category1 to3; assets67 to7 and total70 to12. Concurrency<=4, headers8192, per-object2097152 bytes, anonymous aggregate16777216 bytes, per-request/read15 seconds. All failed admissions count; atomic full-object reservations before dispatch. Body limits are not a physical network-bandwidth or billing hard cap.',
 'Actual GO starts hard300/work240/cleanup60 seconds, including prechecks and launch. Explicit UTC validity<=60 minutes and must cover complete execution. Retain per-request/evidence margin and final clean postcheck. No wait-window padding, retry, redirect, relaunch, reconnect or time extension.',
 'No browser/JavaScript execution, credential input, Auth submission, direct Supabase/PostgREST/RLS test, Turnstile, media, business API or third-party HTTP. Known Turnstile loader reference excluded without download; unknown external source stops. Normal access/security records may persist and are not cleaned.',
 'JS/CSS require HTTP200, allowed MIME, no Location/Set-Cookie/HTML fallback, bounded complete UTF8 identity bytes and actual SHA256. Full JS module syntax parsing rejects HTML fallback even if MIME is misleading. Parent graph is recorded. CONTENT_EVIDENCE_COLLECTED is NOT source safety, full GROUP_1 PASS or permission to auto-whitelist. Future offline source/inline-code review must pass before execution binding repair.',
 'Capture new raw HTML/source ONLY in the bound new owner/SYSTEM-only directory, DPAPI CurrentUser encrypted with new authorization-specific entropy, exclusive files and ciphertext hashes. No raw body, Cookie, Token, Session, query or private identity enters Git/ordinary logs. Reused23 captures remain immutable; no recapture/download.',
 'Before Claim/network verify this new ID/schema, all five explicit true gates, exact separate GO, packet/binding/files/source-head, reviewed evidence/free proof, storage and time. OAuth required scopes account:read/workers_scripts:write, remaining strictly>360 seconds; no token printing, auto-refresh or elevation. Local metadata is not remote identity proof. One exclusive Claim; any receipt/Claim prevents replay, including preflight failures.',
 'First error, unsupported edge, drift, ambiguity, parse/type/encoding/budget/time/storage failure stops new dispatches and cancels/drains outstanding reads. No extra post-Deployment after failure. Missing child receipt counts UNKNOWN, never zero. Native Job supervisor must contain/reap process tree and close resources; abnormal cleanup blocks success. No live repair or automatic full GROUP_1 continuation.',
 'MAX_ADDITIONAL_COST_USD=0 and PAID_USAGE_AUTHORIZED=false. Reuse owner-attested Workers/Supabase Free/no applicable add-ons and documented Free evidence. Unknown paid path or known drift stops; no upgrades, purchases, payment changes or risk waiver. Preserve all old evidence/Claims. Catalog queues/writes/retries held; Version151 never default recovery after Hardening.',
 'This is a new evidence-only subset amendment requiring fresh full-contract/gate/UTC approval then separate GO. No full GROUP_1, GROUP_2/3, login/mail/media/admin mutations, SQL/RLS/role/config/Secret changes, push/build/deploy, traffic switch, recovery, Catalog thaw or Public Beta GO. Full GROUP_1 remains separately unapproved and total-flow budget UNKNOWN.'
];
const gates=[
 ['subsetBoundary2AndResidualCasesAccepted','Approve this exact evidence-only amendment,3 HTML/7 conditional slots/12 GET, finite appendix, and residual full GROUP_1 obligations.'],
 ['authSecurityLogSideEffectsAccepted','Accept public access/security records and protected new raw evidence; public products SSR reads existing Catalog, no direct Auth/RLS test.'],
 ['manualTurnstileAndPrivateIdentityReady','Reader uses no QA credential or CAPTCHA; original private identities unchanged. Default OAuth available only for exact Deployment GETs.'],
 ['catalogHoldAndPostHardeningRecoveryAccepted','Catalog held, current recovery materials/permissions available, no Version151 default after Hardening.'],
 ['operatorAvailableForEntireValidity','Owner confirms actual UTC interval and continuous execution/cleanup supervision.']];
let text='# GROUP_1 Consolidated Remaining Asset Evidence v9 - NOT AUTHORIZED\n\nAUTHORIZATION_ID='+ID+'\nPACKET_SHA256='+packetHash+'\nEXECUTION_BINDING_SHA256='+bindingHash+'\n\n## Thirteen Execution Conditions\n\n'+clauses.map((s,i)=>(i+1)+'. '+s).join('\n\n')+
 '\n\n## Five Pending Human Gates\n\n'+gates.map(([k,v])=>'- `'+k+'`: '+v).join('\n')+
 '\n\n## Exact Initial URLs\n\n'+packet.fixedRequests.map(x=>'- GET '+x.url).join('\n')+
 '\n\n## Conditional Resource Slots (not URLs to probe)\n\n'+scope.remainingSlots.map(x=>'- `'+x.path.replace(/\.[A-Za-z0-9_-]+\.(js|css)$/,(_,e)=>'.<observed8charhash>.'+e)+'`:1; Production bytes/hash UNKNOWN; only explicit finite-edge reference authorizes GET.').join('\n')+
 '\n\n## Pending Authorization JSON\n\n```json\n'+JSON.stringify(pending,null,2)+'\n```\n\nAll gates/times null. Separate approved file AUTHORIZED_ASSET_READ.json requires its own SHA. Prior IDs/GO/Claims never reusable.\n\nIndependent GO (only after valid authorization): `'+GO+'`.\nEntry: `'+binding.entry+'`.\n\nFull GROUP_1 and production Auth/RLS remain BLOCKED, never inferred PASS from this collection.\n';
fs.writeFileSync(path.join(root,'HUMAN_CONSOLIDATED_ASSET_READ_NOT_AUTHORIZED.md'),text,{flag:'wx'});
// Validate a transient fixture only; never persist true gates, a live UTC or Claim.
validateLocal({auth:{...pending,authorizedAtUTC:'2026-10-13T00:00:00Z',authorizationExpiresUTC:'2026-10-13T00:30:00Z',humanGates:Object.fromEntries(HUMAN_GATES.map(k=>[k,true]))},
 packet,packetBytes:fs.readFileSync(path.join(root,'ASSET_READ_PACKET_NOT_AUTHORIZED.json')),binding,bindingBytes:fs.readFileSync(path.join(root,'EXECUTION_BINDING_ASSET_READER.json')),go:GO,now:Date.parse('2026-10-13T00:01:00Z'),claimExists:false});
verifyFiles(prior.files);verifyFiles(binding.files);
save('PREPARATION_SAFE.json',{branch:'B',status:'READY_FOR_OWNER_APPROVAL',tests:count+'/'+count,authorizationId:ID,
 executionBindingSha256:bindingHash,packetSha256:packetHash,templateSha256:sha256(Buffer.from(text)),
 fullGroup1Ready:false,fullGroup1Budget:'UNKNOWN',ownerBudgetsChanged:false,humanGates:'ALL_NULL',utc:'NULL',claimCreated:false,goIssued:false,
 productionRequests:0,productionWrites:0,catalogHold:'ACTIVE'});
console.log(JSON.stringify({branch:'B',tests:count+'/'+count,readPacket:'READY_FOR_OWNER_APPROVAL',bindingHash,packetHash,templateHash:sha256(Buffer.from(text)),
 totalGETMax:12,fullGroup1:'BLOCKED',fullGroup1Budget:'UNKNOWN',productionRequests:0,productionWrites:0}));
