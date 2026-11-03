# B2 one-response diagnostic (NOT AUTHORIZED)

Authorization ID: e-verify-turnstile-sdk-response-openglasshub-20261014-b2
Execution Binding SHA256: 536da169c1ec472181fb33cf7f7e1baaaae620d7913dd3dd9f2c24201a2d3592
Packet SHA256: 526b4ead89966a3cbe2c0766d5c9161d25ce30645d869d79b349c3d748984f17

1. Only one fresh browser-generated GET to https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit; localhost harness is local only. Exact HTTPS challenges.cloudflare.com:443 and original SDK/harness initiator proof; no host-only or arbitrary path fallback.
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
12. Five fresh owner gates and exact UTC approval required; then separate exact GO_E_VERIFY_TURNSTILE_SDK_RESPONSE_B2. One exclusive preflight/Claim; no replay of consumed B1 or silent preflight retry. No OAuth required. This pending file creates no valid authorization, Claim or GO.
13. Catalog ACTIVE; GROUP_2/GROUP_3/Public Beta NOT_AUTHORIZED; Version151 not default post-Hardening recovery. No Production access/full GROUP_1 permission or supplier-boundary expansion. Any future redirect contract change needs separate evidence and explicit owner approval.

## Five gates (currently null; never inherit B1 true)

- boundedVendorTrustAndResidualRiskAccepted: accept this exact one-response scope, mediation uncertainty and incomplete-response possibilities; reject any implicit redirect exception.
- isolatedOfficialTestKeyOnlyConfirmed: isolated no-account environment; existing dummy-key harness only, never executed SDK/test or Production authentication configuration, no secrets or business calls.
- freeOnlyZeroAdditionalCostConfirmed: current Free-only use, strictUSD0, no paid usage/overage or billing changes.
- diagnosticLogsAndPrivacyBoundaryAccepted: accepts supplier access/security logs and the exact safe metadata fields, not raw Location/credentials/body retention.
- operatorAvailableForEntireValidity: owner ready and continuously available for exact approved UTC window, stop and cleanup.

After owner gates/full contract/hash acceptance, propose actual UTC window and wait for explicit approval. Record separate AUTHORIZATION_APPROVED.json only then; stop for independent GO. No Claim or live network now.

```json
{
  "format": "isolated-turnstile-authorization-v1",
  "authorizationId": "e-verify-turnstile-sdk-response-openglasshub-20261014-b2",
  "packetSha256": "526b4ead89966a3cbe2c0766d5c9161d25ce30645d869d79b349c3d748984f17",
  "executionBindingSha256": "536da169c1ec472181fb33cf7f7e1baaaae620d7913dd3dd9f2c24201a2d3592",
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
