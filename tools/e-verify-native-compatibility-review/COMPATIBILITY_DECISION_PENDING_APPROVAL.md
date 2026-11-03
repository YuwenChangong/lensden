# Offline compatibility findings and pending control decision

## Evidence and limits

Owner explicitly observed "browser unsupported" INSIDE the Cloudflare Challenge
Frame, not the QA harness or OpenGlass Hub. Exact code UNKNOWN; other messages
not remembered. Never infer an error code. Fresh-v2 receipt independently proves
SDK loaded, render returned, one vendor Frame and no success callback, followed
by HUMAN_ABORT and cleanup PASS. Fresh-v2 remains consumed.

Actual frozen init script, parsed with Acorn, is executed in a new OFFLINE Chrome
fixture. Same pinned executable and non-fixture launch flags; headless fixture,
loopback cross-origin frame, not actual Cloudflare content/production-equivalent.
Reject-only local proxy, non-loopback DNS disabled, exact local request gate,
Node guard and native Job containment. No official SDK or online access.

8/8 targeted offline checks PASS in artifacts/offline-1791965741491. No historical
suite rerun. Original artifacts/offline-1791965621177 retained: an initial test
incorrectly expected Worker fetch to bypass page Fetch; observed interception
falsified that hypothesis. The revised check records actual request classification
without pretending to prove all-worker egress control.

## Proven local facts, not vendor root cause

- Native Worker/SharedWorker constructors exist in this Chrome fixture.
- Frozen addInitScript deletes and permanently locks six APIs in both main page
  and cross-origin iframe: Worker, SharedWorker, EventSource, RTC and WebTransport.
- Main harness CSP independently blocks worker-src. A separately served child
  document has its own CSP; do not assume harness worker-src protects vendor realm.
- Worker-only LOCAL experiment leaves other five removals intact; its child Worker
  runs and issues one local fetch. Current page Fetch observed it as XHR with a
  registered frame, and NativeScope classified it VENDOR_WIDGET_FLOW.
- Current live auto-attach filter includes iframe targets, excludes Worker targets.
  This is a supervision gap to assess, NOT proof all Worker requests bypass Fetch.
- serviceWorkers:block, clean context, no extensions/sync, existing native flags
  stay unchanged. No proof Turnstile requires Service Worker or any specific API.
- Profile removed and native Job drained. Background attempts reached only the
  rejecting LOOPBACK proxy; no upstream forwarding. No raw URLs/credentials/tokens
  in receipts. Existing native all-browser traffic guarantees are not upgraded.

Vendor root cause UNKNOWN. Worker involvement POSSIBLE. These findings establish
an artificial browser-capability difference, not Turnstile compatibility success.

## Minimal candidate, NOT applied or approved

Only consider restoring Dedicated Worker in a verified, registered vendor
challenge frame. Keep harness worker-src:none; keep SharedWorker/Service Worker,
RTC/EventSource/WebTransport restrictions and other existing controls.

New capability/risk: vendor worker code/background computation, its own realm,
network operations and possibly nested channels. Existing page initScript does
not automatically restrict Worker globals. Host trust alone is insufficient.

Required replacement controls BEFORE any live use:
1. Prove worker owner/context/frame association; pause new worker target before
   execution and register it. Reject unprovable targets or unsupported interception.
2. Bind worker script/creation origin and trustworthy vendor chain, not arbitrary
   blob/data/URL execution. If provenance cannot be established, stay BLOCKED.
3. Prove pre-dispatch worker egress controls, credential exclusion, unknown-origin
   denial, redirects, WS/other channels, nested-worker denial and cleanup. Preserve
   native soft40/650 semantics, deadlines and USD0; do not invent a hard cap.
4. Dedicated-worker offline tests must prove these controls before any separately
   approved contract/instance/UTC/GO. No promise the vendor then accepts the browser.

Decision: restoring constructors alone is NOT a demonstrated safe fix. Owner
approval is needed before implementing this candidate security-boundary change.
No new live authorization Packet, Claim, GO or Production change created.
