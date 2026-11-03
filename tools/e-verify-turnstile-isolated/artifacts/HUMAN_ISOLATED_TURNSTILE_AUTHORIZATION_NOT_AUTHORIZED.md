# Isolated Turnstile supplier-boundary authorization (NOT AUTHORIZED)

This is NOT GROUP_1 Production permission. Owner must separately approve this entire contract, the five gates, hashes and an exact UTC window. No approval or GO is inferred from local implementation permission.

Authorization ID: e-verify-turnstile-isolated-openglasshub-20261014-b1
Execution Binding SHA256: cf89bfda28134b8a2a28ea82949e04023c1820d7ceb5b8bf6af158d8ce528431
Packet SHA256: 80418264782a7cbc6f2fd6d5c2e80d894ea37281426d1c0c231aa97d761974d8

1. Only an ephemeral localhost harness with official TEST sitekey 1x00000000000000000000AA; no account input, Production HTML, Sitekey, Secret, Supabase, Auth, RLS, Siteverify or business interfaces. Test keys never enter Production.
2. Exact bootstrap https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit; fresh strict Node TLS retrieval, unmodified bytes delivered at the original URL, no disk SDK cache. This is mediated delivery, NOT native Chrome TLS or a vendor-certified load path. Official guidance discourages proxying/self-hosting; this compatibility remains unverified. If native delivery is necessary, STOP: do not open an opaque CONNECT bypass. No claim of Production equivalence.
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

After explicit contract/gates approval, propose actual UTC window and wait for owner approval. Record a NEW AUTHORIZATION_APPROVED.json only then. No Claim before exact separate GO_E_VERIFY_TURNSTILE_ISOLATED_TEST_V1. Run-online requires that command as its sole argument, and frozen runtime/file checks. No live operation is permitted by this pending file.

```json
{
  "format": "isolated-turnstile-authorization-v1",
  "authorizationId": "e-verify-turnstile-isolated-openglasshub-20261014-b1",
  "packetSha256": "80418264782a7cbc6f2fd6d5c2e80d894ea37281426d1c0c231aa97d761974d8",
  "executionBindingSha256": "cf89bfda28134b8a2a28ea82949e04023c1820d7ceb5b8bf6af158d8ce528431",
  "authorizedAtUTC": null,
  "authorizationExpiresUTC": null,
  "humanGates": {
    "boundedVendorTrustAndResidualRiskAccepted": null,
    "isolatedOfficialTestKeyOnlyConfirmed": null,
    "freeOnlyZeroAdditionalCostConfirmed": null,
    "diagnosticLogsAndPrivacyBoundaryAccepted": null,
    "operatorAvailableForEntireValidity": null
  }
}
```
