import fs from'node:fs';import path from'node:path';import {fileURLToPath}from'node:url';
import {ID,GO,GATES,sha}from'./authorization.mjs';import {SDK,TEST_SITEKEY}from'./scope.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'artifacts');fs.mkdirSync(out,{recursive:true});
const refresh=process.argv[2]==='--archive-unapproved-local-draft';
if(refresh){
 for(const n of ['AUTHORIZATION_APPROVED.json','NATIVE_PREFLIGHT_ONCE.json','NATIVE_ONCE.claim','NATIVE_SAFE.json','NATIVE_SUPERVISOR_SAFE.json'])if(fs.existsSync(path.join(out,n)))throw new Error('CANNOT_REFRESH_AUTHORIZED_OR_ATTEMPTED_INSTANCE');
 const a=JSON.parse(fs.readFileSync(path.join(out,'AUTHORIZATION_PENDING_NOT_AUTHORIZED.json')));if(a.authorizedAtUTC!==null||a.authorizationExpiresUTC!==null||Object.values(a.humanGates).some(x=>x!==null))throw new Error('CANNOT_REFRESH_CONFIRMED_DRAFT');
 const archive=path.join(out,'unapproved-local-draft-before-window-order-fix');fs.mkdirSync(archive);
 for(const n of ['GROUP1_FUTURE_EVIDENCE_PLAN.json','PACKET_NOT_AUTHORIZED.json','EXECUTION_BINDING.json','AUTHORIZATION_PENDING_NOT_AUTHORIZED.json','HUMAN_NATIVE_ISOLATED_MANUAL_AUTHORIZATION_NOT_AUTHORIZED.md','FREEZE_SAFE.json'])fs.copyFileSync(path.join(out,n),path.join(archive,n),fs.constants.COPYFILE_EXCL);
}
const oldPath=path.resolve(root,'../e-verify-turnstile-response-b2/artifacts/EXECUTION_BINDING.json'),old=JSON.parse(fs.readFileSync(oldPath));
if(sha(fs.readFileSync(oldPath))!=='536da169c1ec472181fb33cf7f7e1baaaae620d7913dd3dd9f2c24201a2d3592')throw new Error('B2_HISTORY_DRIFT');
for(const f of old.files)if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('FROZEN_HISTORY_FILE_DRIFT');
const groupPath=path.resolve(root,'../e-verify-group1-full650-chrome-v11/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json'),group=JSON.parse(fs.readFileSync(groupPath));
const matrixPath='C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/MANDATORY_ACCEPTANCE_MATRIX.json',matrix=JSON.parse(fs.readFileSync(matrixPath));
if(group.requiredCases.length!==14||group.catalogRestRequests.length!==16||matrix.cases.length!==50)throw new Error('EXISTING_SCOPE_MISMATCH');
const write=(n,v)=>fs.writeFileSync(path.join(out,n),typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:refresh?'w':'wx'});
const future={format:'native-group1-future-evidence-plan-v1',status:'NOT_AUTHORIZED',requiresIsolatedRealLiveSuccess:true,requiresFreshGroup1ContractApproval:true,
 sourcePacketSha256:sha(fs.readFileSync(groupPath)),matrixSha256:sha(fs.readFileSync(matrixPath)),productionIdentity:'LATEST_FROZEN_RECORD_NOT_CURRENT_PROVIDER_VERIFICATION',
 sourceSha:group.sourceSha,expectedVersion:group.expectedProductionVersion,actors:group.actors,loginActions:group.loginActions,
 scopedCases:group.requiredCases.map(id=>{const base=id.split(':')[0],m=matrix.cases.find(x=>x.id===base);if(!m)throw new Error('CASE_NOT_FOUND');return{id,originalCase:m.case,scopeQualifier:id.includes(':')?id.split(':')[1]:'ORIGINAL_FROZEN_SCOPE',
  status:'NOT_AUTHORIZED',requiredEvidence:['safe-case-evidence-id','actor-label','private-identity-match-boolean','expected-vs-observed','failure-category','logout-and-cleanup'],privateIdentifiersInReport:false}}),
 exactRlsSteps:group.catalogRestRequests,rlsRoleCounts:{anon:6,A:5,B:5},applicationPages:group.applicationPages,pageContentAssertions:group.pageContentAssertions,
 sourceIdentityAndRlsVerifiers:['../e-verify-group1-script-identity/execution/identity-rls.mjs','../e-verify-group1-script-identity/execution/group1/rls.mjs'],
 privateIdentityInputReused:true,privateIdentityInputReadThisTask:false,sessionToRlsAdapter:'DEFERRED_NOT_IMPLEMENTED_OR_AUTHORIZED',
 excluded:['registration','mail','password-recovery','forum-writes','media','admin-writes','catalog-writes','GROUP_2','GROUP_3','Public Beta']};
write('GROUP1_FUTURE_EVIDENCE_PLAN.json',future);
const packet={format:'native-turnstile-isolated-manual-packet-v1',authorizationId:ID,status:'PENDING_OWNER_APPROVAL',liveRequestsAuthorized:false,
 layer:'ISOLATED_ONLY',sdk:SDK,officialTestSitekey:TEST_SITEKEY,firstParty:'EPHEMERAL_HTTP_127_0_0_1_CURRENT_PORT_HARNESS_ONLY',
 thirdPartyIntendedOrigin:'https://challenges.cloudflare.com:443',initialSdk:'EXACT_URL',subsequentVendorTargets:'REGISTERED_TARGET_SUPPLIER_CAPABILITY_NOT_EXHAUSTIVE_PATH_ALLOWLIST',
 nativeVendorRedirects:'EXPLICIT_NEW_SAME_ORIGIN_GET_POST_CHAIN_PERMISSION_NOT_B2_REUSE',networkBoundaryEnforcement:'PARTIAL',
 old65040HardCapInherited:false,observedVendorSoftStop:40,observedTargetSoftStop:650,hardGlobalNetworkRequestMax:'NOT_GUARANTEED',
 hardNetworkBytesMax:'NOT_GUARANTEED',unobservedNativeBrowserOrOsTraffic:'UNKNOWN_NOT_OS_SANDBOXED',
 hardDeadlineSeconds:600,childWorkSeconds:520,supervisorWorkSeconds:540,cleanupReserveSeconds:60,minimumStartWindowRemainingStrictlyGreaterThanSeconds:610,
 maxAdditionalCostUSD:0,costEvidence:'REUSE_OWNER_ATTESTED_FREE_TURNSTILE_NO_NEW_PROVIDER_AUDIT',
 connectionCostEvidence:'PENDING_OWNER_UNMETERED_TRUSTED_NETWORK_CONFIRMATION_NOT_RISK_WAIVER',
 cookies:'START_EMPTY_ISOLATED_INCOGNITO_VENDOR_TRANSIENT_STATE_POSSIBLE_NO_EXPORT_NO_REAL_USER_SESSION',
 profile:'NEW_EMPTY_OWNED_TEMP_PLUS_INCOGNITO_TARGET_NOT_DEFAULT_USER_PROFILE',sdkDelivery:'NATIVE_CHROME_NO_NODE_TLS_OR_SDK_FULFILL',
 success:'SDK_RENDER_FRAME_CALLBACK_OWNER_ATTESTATION_FINISH_CLEANUP_PROFILE_REMOVAL_NATIVE_JOB_DRAIN',
 automaticTestKeyInteraction:'MAY_NOT_REQUIRE_HUMAN_CHALLENGE_NOT_PRODUCTION_CAPTCHA_PASS',
 artifacts:'SAFE_ENUMS_BOOLEANS_COUNTS_STATUS_CODES_NO_RAW_URL_HEADERS_TOKENS_STORAGE_HAR_OR_TRACE',
 humanGates:Object.fromEntries(GATES.map(k=>[k,null])),authorizedAtUTC:null,authorizationExpiresUTC:null,independentGo:GO,
 authCalls:0,siteverifyCalls:0,rlsCalls:0,productionRequests:0,productionWrites:0,fullGroup1Authorized:false,group2:false,group3:false,catalogHold:'ACTIVE',publicBetaGo:false};
write('PACKET_NOT_AUTHORIZED.json',packet);const packetHash=sha(fs.readFileSync(path.join(out,'PACKET_NOT_AUTHORIZED.json')));
const runtime=old.files.filter(f=>f.path.includes('/node_modules/playwright')||f.path.endsWith('.exe')).map(f=>f.path);
const helpers=['../e-verify-group1-remaining-assets/supervisor.mjs','../e-verify-group1-remaining-assets/bootstrap.mjs','../e-verify-group1-remaining-assets/job-broker.ps1','../e-verify-group1-script-identity/execution/node-guard.mjs',
 '../e-verify-group1-script-identity/execution/identity-rls.mjs','../e-verify-group1-script-identity/execution/group1/rls.mjs',
 '../e-verify-group1-full650-chrome-v11/artifacts/OWNER_FREE_PLAN_EVIDENCE.json'].map(p=>path.resolve(root,p));
const files=[...runtime,...helpers,process.execPath,groupPath,matrixPath,path.join(out,'GROUP1_FUTURE_EVIDENCE_PLAN.json'),
 ...fs.readdirSync(root).filter(n=>/\.(?:mjs|md)$/.test(n)).map(n=>path.join(root,n))];
const binding={format:'native-manual-binding-v1',authorizationId:ID,packetSha256:packetHash,nodePath:process.execPath,
 files:[...new Set(files.map(p=>p.replaceAll('\\','/')))].sort().map(p=>({path:p,sha256:sha(fs.readFileSync(p))})),oldB2FrozenFilesUnchanged:old.files.length,oldAuthorizationsReused:false};
write('EXECUTION_BINDING.json',binding);const bindingHash=sha(fs.readFileSync(path.join(out,'EXECUTION_BINDING.json')));
const pending={format:'native-turnstile-manual-authorization-v1',authorizationId:ID,executionBindingSha256:bindingHash,packetSha256:packetHash,authorizedAtUTC:null,authorizationExpiresUTC:null,humanGates:packet.humanGates};
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json',pending);
write('HUMAN_NATIVE_ISOLATED_MANUAL_AUTHORIZATION_NOT_AUTHORIZED.md',`# Native Chrome isolated manual scope (NOT AUTHORIZED)

Authorization ID: ${ID}
Execution Binding SHA256: ${bindingHash}
Packet SHA256: ${packetHash}

This is a NEW manual acceptance contract, not B1/B2 or full GROUP_1 authorization. Full operational/evidence details in ../MANUAL_ACCEPTANCE_PLAN.md are frozen by the binding.

1. Only the loopback QA page, official TEST Sitekey ${TEST_SITEKEY} and exact initial SDK ${SDK}; no account credentials/Production keys/private binding input. No Auth/RLS/Siteverify/pre-clearance/business API or Production access.
2. Chrome native script loading, official TLS validation and same-origin vendor redirects, not Node TLS fetch/SDK proxy/route.fulfill. This explicitly differs from B1/B2 redirect denial; old consumed authorizations do NOT permit it. No unknown-origin permission or TLS-intercept certificate.
3. Observable registered page/iframe requests are subject to origin/protocol/port/method/type/frame and credential controls. Supplier GET/POST/dynamic paths/query within exact vendor origin are a supplier capability, not fixed-URL proof. Same-origin native redirects may continue only in observed allowed chain. Outside-target browser/OS traffic coverage is NOT guaranteed.
4. NETWORK_BOUNDARY=PARTIAL. Neither old global650 nor vendor40 is inherited as a hard network limit.40 observed vendor events/650 target events are SOFT stop triggers, not actual all-browser dispatch caps. Native buffers/bytes/timeouts/internal SDK behavior are not the old Node body10s/2MiB enforcement. Owner explicitly accepts this scope difference, never a false hard-limit assertion.
5. New empty owned temporary profile plus fresh incognito target, extensions/sync disabled and initially no cookies. Native supplier cookies/cache/transient challenge state may occur only in isolated browser memory/context; never export them or load real sessions. No claim that all OS/background services are disabled. Trusted machine/network and no unreviewed proxy/extensions/services require genuine owner confirmation.
6. One Start/render, no manual reload/retry/reset or profile reuse. Owner completes only test-widget interaction if requested. Always-pass official test key may need no human challenge; mark NOT_REQUIRED_BY_TEST_WIDGET rather than Production CAPTCHA PASS. SDK-internal behavior is not claimed globally disabled.
7. SDK load/render/frame/callback plus owner visibility/interaction choice/Finish and cleanup/profile deletion/native drain required for isolated completion. Missing stages remain partial/incomplete; any boundary/error/timeout/privacy/cost uncertainty stops. Never claim full GROUP_1/E_VERIFY/Public Beta from this result.
8.600s total native supervisor including launch/drain, child520s, supervisor work540s, cleanup reserve60s inside total. Actual start >610s remaining, UTC authorization<=60min, no automatic extension. OS scheduling is not a real-time SLA.
9. USD0 strictly. Reuse existing owner Free Turnstile evidence, no paid provider/upgrade/payment/overage acceptance. Owner must ALSO confirm trusted unmetered/no-additional-charge connection; if unknown, execution BLOCKED, not best-effort billing control.
10. Supplier may retain IP/User-Agent/device/access/security logs. Only typed booleans/enums/counts/status codes and safe stop categories retained locally. Token callback argument ignored, response-field disabled; no token/hash, raw URL/query/header/body, Cookie/Session, fingerprint values, HAR/trace/storage export or raw screenshots. DevTools inspection must not export sensitive data.
11. First unexpected error/origin/prompt/popup/download/data/cost event stops; no fallback. Close browser/context/server and drain native Job. Remove only exact recorded owned profile after close/drain, not user profile. No secure erase or provider/OS-log removal guarantee; cleanup ambiguity blocks success. Local profile-path cleanup record is LOCAL_ONLY, not shared evidence.
12. All six owner gates below, full contract/hash acceptance and exact UTC approval required; then separate ${GO}. One preflight/Claim; no effective authorization/Claim/GO now. No OAuth required. Failure never silently retries this instance. Old B1/B2/v11 remain consumed, untouched.
13. Catalog ACTIVE; no default Version151 post-Hardening recovery; GROUP_2/3 and Public Beta unapproved. Layer2 requires actual Layer1 live evidence and separate full GROUP_1 manual scope approval/private identity verification. Original14 cases/16 RLS and residual obligations preserved but NOT authorized by this packet.

## Exact human gates (all null)

- nativePartialControlsAndSoftStopAccepted: accepts clauses2-4 and6, native supplier redirect/state scope and non-inherited hard network/byte caps; no hidden risk waiver.
- isolatedNoCredentialsOfficialTestKeyConfirmed: confirms isolated QA environment only, no production/account/Secret/Session inputs, no Siteverify or business calls.
- zeroCostFreeScopeAndUnmeteredConnectionConfirmed: genuine current no-paid-provider AND no-additional-charge network facts; uncertainty means BLOCKED, no paid risk acceptance.
- vendorEphemeralStateAndSafeEvidenceAccepted: accepts native transient vendor state and third-party security/device logs, while prohibiting token/storage/raw-data exports.
- trustedEnvironmentAndCleanupReady: trusted machine/network, no unreviewed extension/proxy/background service; can stop and complete exact-profile/Job cleanup without touching real user profiles.
- operatorAvailableForEntireValidity: owner ready for entire exact separately approved UTC window, manual widget observations, failures and cleanup.

After these confirmations, read trusted actual UTC and propose a window for separate explicit approval. Only then record formal approval; stop and wait for exact independent GO. Do not issue Production/SDK requests during authorization preparation.

\`\`\`json
${JSON.stringify(pending,null,2)}
\`\`\`
`);
write('FREEZE_SAFE.json',{authorizationId:ID,executionBindingSha256:bindingHash,packetSha256:packetHash,
 templateSha256:sha(fs.readFileSync(path.join(out,'HUMAN_NATIVE_ISOLATED_MANUAL_AUTHORIZATION_NOT_AUTHORIZED.md'))),boundFiles:binding.files.length,
 manualContract:'PENDING_OWNER_APPROVAL',humanGates:'6_PENDING',utcWindow:null,claimCreated:false,goIssued:false,
 costExecutionGate:'BLOCKED_PENDING_OWNER_CONNECTION_FACT',networkBoundary:'PARTIAL',old65040HardCapInherited:false,
 productionRequests:0,thirdPartyLiveRequests:0,productionWrites:0});
console.log(JSON.stringify({authorizationId:ID,bindingHash,packetHash,boundFiles:binding.files.length,originalGroup1Cases:future.scopedCases.length,originalRlsSteps:future.exactRlsSteps.length}));
