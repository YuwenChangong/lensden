# Native Chrome isolated manual scope (NOT AUTHORIZED)

Authorization ID: e-verify-native-turnstile-manual-openglasshub-20261014-v1
Execution Binding SHA256: 3de16445b5ca449c847a81fbf080b132a55d7d0edaf523290275266096d0d386
Packet SHA256: 3b09b0d2fe08647c7112ae701aea6aa655e5023519df6c93d65b646a6b8dee39

This is a NEW manual acceptance contract, not B1/B2 or full GROUP_1 authorization. Full operational/evidence details in ../MANUAL_ACCEPTANCE_PLAN.md are frozen by the binding.

1. Only the loopback QA page, official TEST Sitekey 1x00000000000000000000AA and exact initial SDK https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit; no account credentials/Production keys/private binding input. No Auth/RLS/Siteverify/pre-clearance/business API or Production access.
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
12. All six owner gates below, full contract/hash acceptance and exact UTC approval required; then separate GO_E_VERIFY_NATIVE_CHROME_ISOLATED_MANUAL_V1. One preflight/Claim; no effective authorization/Claim/GO now. No OAuth required. Failure never silently retries this instance. Old B1/B2/v11 remain consumed, untouched.
13. Catalog ACTIVE; no default Version151 post-Hardening recovery; GROUP_2/3 and Public Beta unapproved. Layer2 requires actual Layer1 live evidence and separate full GROUP_1 manual scope approval/private identity verification. Original14 cases/16 RLS and residual obligations preserved but NOT authorized by this packet.

## Exact human gates (all null)

- nativePartialControlsAndSoftStopAccepted: accepts clauses2-4 and6, native supplier redirect/state scope and non-inherited hard network/byte caps; no hidden risk waiver.
- isolatedNoCredentialsOfficialTestKeyConfirmed: confirms isolated QA environment only, no production/account/Secret/Session inputs, no Siteverify or business calls.
- zeroCostFreeScopeAndUnmeteredConnectionConfirmed: genuine current no-paid-provider AND no-additional-charge network facts; uncertainty means BLOCKED, no paid risk acceptance.
- vendorEphemeralStateAndSafeEvidenceAccepted: accepts native transient vendor state and third-party security/device logs, while prohibiting token/storage/raw-data exports.
- trustedEnvironmentAndCleanupReady: trusted machine/network, no unreviewed extension/proxy/background service; can stop and complete exact-profile/Job cleanup without touching real user profiles.
- operatorAvailableForEntireValidity: owner ready for entire exact separately approved UTC window, manual widget observations, failures and cleanup.

After these confirmations, read trusted actual UTC and propose a window for separate explicit approval. Only then record formal approval; stop and wait for exact independent GO. Do not issue Production/SDK requests during authorization preparation.

```json
{
  "format": "native-turnstile-manual-authorization-v1",
  "authorizationId": "e-verify-native-turnstile-manual-openglasshub-20261014-v1",
  "executionBindingSha256": "3de16445b5ca449c847a81fbf080b132a55d7d0edaf523290275266096d0d386",
  "packetSha256": "3b09b0d2fe08647c7112ae701aea6aa655e5023519df6c93d65b646a6b8dee39",
  "authorizedAtUTC": null,
  "authorizationExpiresUTC": null,
  "humanGates": {
    "nativePartialControlsAndSoftStopAccepted": null,
    "isolatedNoCredentialsOfficialTestKeyConfirmed": null,
    "zeroCostFreeScopeAndUnmeteredConnectionConfirmed": null,
    "vendorEphemeralStateAndSafeEvidenceAccepted": null,
    "trustedEnvironmentAndCleanupReady": null,
    "operatorAvailableForEntireValidity": null
  }
}
```
