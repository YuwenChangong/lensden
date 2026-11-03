import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath}from'node:url';
import {ID,GO,GATES,sha}from'./authorization.mjs';
import {CAPS,SDK,TEST_SITEKEY}from'./gate.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..'),out=path.join(root,'artifacts');fs.mkdirSync(out,{recursive:true});
const write=(name,value)=>fs.writeFileSync(path.join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const files=fs.readdirSync(root).filter(f=>f.endsWith('.mjs')).map(f=>path.join(root,f));
const helpers=['../e-verify-group1-script-identity/execution/node-guard.mjs','../e-verify-group1-script-identity/execution/wire.mjs',
 '../e-verify-group1-remaining-assets/supervisor.mjs','../e-verify-group1-remaining-assets/bootstrap.mjs','../e-verify-group1-remaining-assets/job-broker.ps1'];
files.push(...helpers.map(f=>path.resolve(root,f)),process.execPath,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
// Reuse the existing reviewed Playwright dependency inventory, not its authorization.
const prior=JSON.parse(fs.readFileSync(path.resolve(root,'../e-verify-group1-full650-chrome-v11/artifacts/EXECUTION_BINDING_GROUP1.json')));
const chrome=prior.files.find(f=>f.path.toLowerCase()==='c:/program files/google/chrome/application/chrome.exe');
if(!chrome||sha(fs.readFileSync(chrome.path))!==chrome.sha256)throw new Error('FROZEN_CHROME_DRIFT');
const runtime=prior.files.filter(f=>f.path.includes('/node_modules/playwright'));
if(!runtime.length)throw new Error('PLAYWRIGHT_INVENTORY_MISSING');
for(const f of runtime){if(sha(fs.readFileSync(f.path))!==f.sha256)throw new Error('PLAYWRIGHT_RUNTIME_DRIFT');files.push(f.path)}
const packet={format:'isolated-turnstile-packet-v1',status:'PENDING_OWNER_APPROVAL',authorizationId:ID,liveRequestsAuthorized:false,
 policy:'SDK_WIDGET_FRAME_CAPABILITY_NOT_EXHAUSTIVE_PATH_WHITELIST',sdk:SDK,sitekey:TEST_SITEKEY,budgets:CAPS,
 hardDeadlineSeconds:300,workDeadlineSeconds:220,cleanupReserveSeconds:60,requestTimeoutSeconds:10,maxRequestBodyBytes:32768,maxResponseBodyBytes:2097152,
 maxAdditionalCostUSD:0,productionGetMax:0,authMax:0,rlsMax:0,siteverifyMax:0,preClearance:false,
 network:'EXACT_HTTPS_CHALLENGES_CLOUDFLARE_COM_443_ONLY',requestSources:'SDK_ROOTED_CDP_STACK_OR_VALIDATED_REGISTERED_FRAME',
 frameGetMax:40,combinedGetPostFrameMax:40,backgroundForwardMax:0,redirectMax:0,methods:['GET','POST'],
 tokenHandling:'CALLBACK_ARGUMENT_IGNORED_NO_STORAGE_NO_BUSINESS_HANDOFF',cookies:'NO_INPUT_NO_FORWARD_SET_COOKIE_RESPONSE_DENIED',
 mediation:'FRESH_NODE_STRICT_TLS_BYTES_FULFILLED_AT_ORIGINAL_BROWSER_URL_NOT_NATIVE_CHROME_TLS',
 compatibility:'VENDOR_RECOMMENDS_DIRECT_SDK_LOADING_MEDIATION_COMPATIBILITY_NOT_VERIFIED_ONLINE',
 residual:'AUTOMATION_VENDOR_UPDATES_COOKIE_OR_WORKER_REQUIREMENTS_AND_UNKNOWN_INITIATORS_MAY_BLOCK_COMPLETION',
 sideEffects:['VENDOR_IP_USER_AGENT_DEVICE_CHALLENGE_SECURITY_LOGS','EPHEMERAL_SUPPLIER_REQUEST_DATA'],
 humanGates:Object.fromEntries(GATES.map(k=>[k,null])),independentGo:GO,group1ProductionAuthorized:false,group2:false,group3:false,catalogHold:'ACTIVE',publicBetaGo:false};
write('PACKET_NOT_AUTHORIZED.json',packet);const packetHash=sha(fs.readFileSync(path.join(out,'PACKET_NOT_AUTHORIZED.json')));
const binding={format:'isolated-turnstile-binding-v1',authorizationId:ID,packetSha256:packetHash,nodePath:process.execPath,
 files:[...new Set(files)].sort().map(p=>({path:p.replaceAll('\\','/'),sha256:sha(fs.readFileSync(p))})),legacyAuthorizationReused:false};
write('EXECUTION_BINDING.json',binding);const bindingHash=sha(fs.readFileSync(path.join(out,'EXECUTION_BINDING.json')));
const pending={format:'isolated-turnstile-authorization-v1',authorizationId:ID,packetSha256:packetHash,executionBindingSha256:bindingHash,
 authorizedAtUTC:null,authorizationExpiresUTC:null,humanGates:packet.humanGates};
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json',pending);
write('HUMAN_ISOLATED_TURNSTILE_AUTHORIZATION_NOT_AUTHORIZED.md',`# Isolated Turnstile supplier-boundary authorization (NOT AUTHORIZED)

This is NOT GROUP_1 Production permission. Owner must separately approve this entire contract, the five gates, hashes and an exact UTC window. No approval or GO is inferred from local implementation permission.

Authorization ID: ${ID}
Execution Binding SHA256: ${bindingHash}
Packet SHA256: ${packetHash}

1. Only an ephemeral localhost harness with official TEST sitekey ${TEST_SITEKEY}; no account input, Production HTML, Sitekey, Secret, Supabase, Auth, RLS, Siteverify or business interfaces. Test keys never enter Production.
2. Exact bootstrap ${SDK}; fresh strict Node TLS retrieval, unmodified bytes delivered at the original URL, no disk SDK cache. This is mediated delivery, NOT native Chrome TLS or a vendor-certified load path. Official guidance discourages proxying/self-hosting; this compatibility remains unverified. If native delivery is necessary, STOP: do not open an opaque CONNECT bypass. No claim of Production equivalence.
3. Subsequent HTTPS traffic only to challenges.cloudflare.com:443 and only under this SDK instance/single widget/registered frame capability. This is a bounded supplier trust exception, NOT an exhaustive per-URL allowlist. Host alone never grants permission. CDP stacks and unique frame-parent correlation are mandatory; unavailable/ambiguous proof is denied.
4. GET for script/document/stylesheet/image/font/fetch/xhr; POST only proven widget-chain fetch/xhr. All methods share third-party40/global650 reservations before transport. GET<=40, POST<=40, frame documents<=40 are SUBLIMITS, never additive. Local harness and denied proxy attempts also consume global capacity. Failures/cancelled reservations are not refunded; no retries or second SDK/widget.
5. No redirects, other origins, unknown/other types, unregistered frames, popup/download, WebSocket, Service Worker, worker, WebRTC, WebTransport, EventSource or independent Node egress. Browser deny proxy never forwards; closed channels may prevent the real SDK completing. Unknown supplier behavior stays blocked, never auto-expanded.
6. Per HTTP request10 seconds, request body32768 bytes, response body2097152 bytes. Body caps bound accepted/retained bytes, NOT all socket bytes/network costs. Content-Length and streaming guards abort oversize bodies, statuses/MIME/cookies/location are validated before browser delivery.
7. Overall native Job Object supervisor300 seconds including startup/drain. Child work220 seconds, supervisor cleanup reserve60 seconds INSIDE hard deadline; scheduler stalls are not a real-time SLA. Actual start requires >310 seconds validity remaining. UTC validity<=60 minutes; no automatic extension.
8. Strict USD0, no paid usage/overage acceptance. Owner must confirm official test widget/free capability/no paid add-ons still apply. Free limits are finite; failures stop. No billing/config changes, no other provider dependency or paid API.
9. Third-party IP, User-Agent, device/challenge/security logs may be retained. SDK/frames are mutable supplier-controlled scripts with same-host capability, not source-audited assets. No user credentials or existing session/cookies; request cookie/auth headers and response Set-Cookie denied.
10. callback records ONLY boolean status; token argument is ignored. URL/query/body/frame stacks remain process-private and are erased on close; shared receipts use classifications/run-keyed opaque IDs, not raw URLs, token hashes, cookies, secrets or personal identifiers. No HAR/trace/screenshots.
11. First denial/error/expired window/byte or request limit stops all transport and closes resources. Result may be partial: SDK, render, frame, GET/POST and callback observations are distinct, never fabricated. No mutation or rollback/automatic repair.
12. Authorization and exact independent GO separate; one exclusive instance claim. Failed local preflight also closes this instance against silent retry. Old v11/diagnostic claims and authorizations immutable; no reuse. No OAuth required because no Provider management API is used.
13. Catalog held; no default Version151 post-Hardening recovery. GROUP_2/GROUP_3/Public Beta NOT AUTHORIZED. Applying supplier capability to full GROUP_1 requires isolated online evidence plus a separate reviewed contract approval and fresh GO.

## Five owner gates (all currently null)

- boundedVendorTrustAndResidualRiskAccepted: accepts clauses2-6 and9; mediated delivery uncertainty, non-exhaustive supplier trust and partial outcomes; no unsafe fallback.
- isolatedOfficialTestKeyOnlyConfirmed: confirms no Production/account/Secret inputs and no pre-clearance/Siteverify/business handoff.
- freeOnlyZeroAdditionalCostConfirmed: confirms current Free-only capability and USD0; no charge/overage acceptance.
- diagnosticLogsAndPrivacyBoundaryAccepted: accepts vendor security/device logs, token-status-only/private evidence boundary.
- operatorAvailableForEntireValidity: continuous owner attendance for exact approved window, challenge decisions, stop and cleanup; NEVER assume attendance true.

After explicit contract/gates approval, propose actual UTC window and wait for owner approval. Record a NEW AUTHORIZATION_APPROVED.json only then. No Claim before exact separate ${GO}. Run-online requires that command as its sole argument, and frozen runtime/file checks. No live operation is permitted by this pending file.

\`\`\`json
${JSON.stringify(pending,null,2)}
\`\`\`
`);
write('FREEZE_SAFE.json',{authorizationId:ID,executionBindingSha256:bindingHash,packetSha256:packetHash,templateSha256:sha(fs.readFileSync(path.join(out,'HUMAN_ISOLATED_TURNSTILE_AUTHORIZATION_NOT_AUTHORIZED.md'))),boundFiles:binding.files.length,
 humanGates:'PENDING',authorization:'NOT_AUTHORIZED',claimCreated:false,goIssued:false,productionRequests:0,thirdPartyLiveRequests:0});
console.log(JSON.stringify({bindingHash,packetHash,boundFiles:binding.files.length}));
