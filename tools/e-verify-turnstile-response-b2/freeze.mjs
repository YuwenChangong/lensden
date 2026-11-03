import fs from'node:fs';
import path from'node:path';
import {fileURLToPath}from'node:url';
import {ID,GO,GATES,sha}from'./authorization.mjs';
import {CAPS,SDK}from'./gate.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'artifacts');fs.mkdirSync(out,{recursive:true});
const priorPath=path.resolve(root,'../e-verify-turnstile-isolated/artifacts/EXECUTION_BINDING.json');
const prior=JSON.parse(fs.readFileSync(priorPath));if(sha(fs.readFileSync(priorPath))!=='cf89bfda28134b8a2a28ea82949e04023c1820d7ceb5b8bf6af158d8ce528431')throw new Error('HISTORY_BINDING_DRIFT');
for(const f of prior.files)if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('HISTORY_FILE_DRIFT');
const files=[...prior.files.map(f=>f.path),priorPath,...fs.readdirSync(root).filter(n=>/\.(?:mjs|md)$/.test(n)).map(n=>path.join(root,n)),
 path.resolve(root,'../e-verify-turnstile-isolated/artifacts/ONLINE_SAFE.json'),path.resolve(root,'../e-verify-turnstile-isolated/artifacts/B1_GO_CLOSURE_SAFE.json'),
 path.resolve(root,'../e-verify-turnstile-isolated/artifacts/AUTHORIZATION_APPROVED.json')];
const write=(n,v)=>fs.writeFileSync(path.join(out,n),typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const packet={format:'isolated-turnstile-packet-v1',status:'PENDING_OWNER_APPROVAL',authorizationId:ID,liveRequestsAuthorized:false,
 sdk:SDK,method:'GET',budgets:{...CAPS,thirdParty:1,GET:1,POST:0,document:0},sdkExecutionAllowed:false,dynamicRequestsAllowed:false,
 hardDeadlineSeconds:300,workDeadlineSeconds:220,cleanupReserveSeconds:60,requestTimeoutSeconds:10,maxRequestBodyBytes:32768,maxResponseBodyBytes:2097152,
 maxAdditionalCostUSD:0,productionGetMax:0,authMax:0,rlsMax:0,siteverifyMax:0,preClearance:false,
 purpose:'CLASSIFY_ONE_FRESH_SDK_RESPONSE_WITHOUT_SCRIPT_EXECUTION_OR_REDIRECT_FOLLOWING',
 responseGuard:'UNMODIFIED_REJECT_ANY_HTTP_3XX_OR_LOCATION_HEADER',
 evidence:'SAFE_STATUS_AND_LOCATION_CLASSIFICATION_AT_HEADERS_BEFORE_BODY_VALIDATION',
 unknownHistoricalB1Response:'NOT_RECOVERABLE_NO_RETROACTIVE_INFERENCE',
 mediation:'SAME_BROWSER_INITIATOR_NODE_STRICT_TLS_NO_OPAQUE_CONNECT',
 sideEffects:['VENDOR_IP_USER_AGENT_ACCESS_AND_SECURITY_LOGS'],
 humanGates:Object.fromEntries(GATES.map(k=>[k,null])),authorizedAtUTC:null,authorizationExpiresUTC:null,independentGo:GO,
 oldAuthorizationReused:false,group1ProductionAuthorized:false,group2:false,group3:false,catalogHold:'ACTIVE',publicBetaGo:false};
write('PACKET_NOT_AUTHORIZED.json',packet);const packetHash=sha(fs.readFileSync(path.join(out,'PACKET_NOT_AUTHORIZED.json')));
const binding={format:'isolated-turnstile-binding-v1',authorizationId:ID,packetSha256:packetHash,nodePath:process.execPath,
 previousImmutableB1BindingSha256:sha(fs.readFileSync(priorPath)),files:[...new Set(files.map(p=>p.replaceAll('\\','/')))].sort().map(p=>({path:p,sha256:sha(fs.readFileSync(p))})),
 historyPurpose:'HASH_VERIFICATION_AND_COMPATIBILITY_ONLY_NOT_AUTHORIZATION_REUSE'};
write('EXECUTION_BINDING.json',binding);const bindingHash=sha(fs.readFileSync(path.join(out,'EXECUTION_BINDING.json')));
const pending={format:'isolated-turnstile-authorization-v1',authorizationId:ID,packetSha256:packetHash,executionBindingSha256:bindingHash,authorizedAtUTC:null,authorizationExpiresUTC:null,humanGates:packet.humanGates};
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json',pending);
write('HUMAN_B2_SDK_RESPONSE_AUTHORIZATION_NOT_AUTHORIZED.md',`# B2 one-response diagnostic (NOT AUTHORIZED)

Authorization ID: ${ID}
Execution Binding SHA256: ${bindingHash}
Packet SHA256: ${packetHash}

1. Only one fresh browser-generated GET to ${SDK}; localhost harness is local only. Exact HTTPS challenges.cloudflare.com:443 and original SDK/harness initiator proof; no host-only or arbitrary path fallback.
2. Supplier dispatch max1, GET1, POST0, frame0; local/denied proxy admissions count under existing global650 ceiling. Original GROUP_1/B1 budgets are not changed. Reservations before dispatch, failures not refunded, no retry or second attempt.
3. Observe HTTP status and safe Location presence/origin classification immediately when headers arrive; retain across encoding/body failure. Before valid headers, fields remain UNKNOWN/null. A future response cannot prove historical B1 status.
4. Unchanged fail-closed response policy: ANY HTTP3xx OR Location header is rejected, including200+Location and same-origin targets. No redirect following, Location-target request, automatic exception or CONNECT forwarding. Approving this contract does not approve redirects.
5. Do not deliver/execute returned SDK in Chrome. No render/widget/Challenge Frame/callback, no Production Sitekey, credential, Session, Cookie, Auth, RLS, Siteverify, pre-clearance or business call. No product/database/config changes.
6. Same fresh Node strict TLS mediator/browser initiator path, not native Chrome TLS or vendor-certified SDK loading. No full SDK compatibility claim; actual response might change or fail before headers. Mediator redirects are never followed.
7. Each request10s, request body32768 bytes, accepted response body2097152 bytes; actual streaming/Content-Length guarded. Caps do not bound every network packet or external bill. Never retain raw SDK bytes in files/HAR/trace.
8. Total native Job deadline300s including launch/cleanup, work220s and cleanup reserve60s inside deadline. UTC validity<=60min, actual start strictly >310s remaining. No automatic window extension.
9. Strict USD0, Free-only capability/no paid add-ons, no overage acceptance or billing modifications. Supplier may retain IP, User-Agent, access/security logs. No additional provider or paid API.
10. Receipts contain only status codes/classes, booleans, finite Location-origin classes, bounded error codes and existing safe request classifications. No full Location, path/query, token, cookie, auth header, raw body or account data. Same-host class NEVER grants permission.
11. First error/denial/budget/timeout stops and closes resources. executionStatus/failureStage/failureCode/stageResults/cleanupStatus separate. Explained redirect stays BLOCKED; diagnostic value and successful SDK initialization are different. Cleanup cannot hide execution failure, nor vice versa.
12. Five fresh owner gates and exact UTC approval required; then separate exact ${GO}. One exclusive preflight/Claim; no replay of consumed B1 or silent preflight retry. No OAuth required. This pending file creates no valid authorization, Claim or GO.
13. Catalog ACTIVE; GROUP_2/GROUP_3/Public Beta NOT_AUTHORIZED; Version151 not default post-Hardening recovery. No Production access/full GROUP_1 permission or supplier-boundary expansion. Any future redirect contract change needs separate evidence and explicit owner approval.

## Five gates (currently null; never inherit B1 true)

- boundedVendorTrustAndResidualRiskAccepted: accept this exact one-response scope, mediation uncertainty and incomplete-response possibilities; reject any implicit redirect exception.
- isolatedOfficialTestKeyOnlyConfirmed: isolated no-account environment; existing dummy-key harness only, never executed SDK/test or Production authentication configuration, no secrets or business calls.
- freeOnlyZeroAdditionalCostConfirmed: current Free-only use, strictUSD0, no paid usage/overage or billing changes.
- diagnosticLogsAndPrivacyBoundaryAccepted: accepts supplier access/security logs and the exact safe metadata fields, not raw Location/credentials/body retention.
- operatorAvailableForEntireValidity: owner ready and continuously available for exact approved UTC window, stop and cleanup.

After owner gates/full contract/hash acceptance, propose actual UTC window and wait for explicit approval. Record separate AUTHORIZATION_APPROVED.json only then; stop for independent GO. No Claim or live network now.

\`\`\`json
${JSON.stringify(pending,null,2)}
\`\`\`
`);
write('FREEZE_SAFE.json',{authorizationId:ID,executionBindingSha256:bindingHash,packetSha256:packetHash,
 templateSha256:sha(fs.readFileSync(path.join(out,'HUMAN_B2_SDK_RESPONSE_AUTHORIZATION_NOT_AUTHORIZED.md'))),boundFiles:binding.files.length,
 historicalB1BoundFilesUnchanged:prior.files.length,authorization:'NOT_AUTHORIZED',humanGates:'PENDING',utcWindow:null,claimCreated:false,goIssued:false,productionRequests:0,thirdPartyLiveRequests:0});
console.log(JSON.stringify({authorizationId:ID,bindingHash,packetHash,boundFiles:binding.files.length,unchangedHistoricalB1Files:prior.files.length}));
