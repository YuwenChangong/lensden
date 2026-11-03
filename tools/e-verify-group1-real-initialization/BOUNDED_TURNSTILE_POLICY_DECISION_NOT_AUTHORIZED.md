# Owner policy decision: bounded live Turnstile trust

DRAFT FOR OWNER DECISION. Not an execution authorization, Packet, UTC window,
Claim or GO. No SDK request or test was performed for this decision. No original
contract, gate, private budget, Production code/config or receipt is modified.

## Official evidence checked

Only these public documentation pages were read on2026-10-14:

- [Client rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/):
  explicit official api.js URL, render(), challenge/token lifecycle; live script
  must come from the specified URL, not a cached/self-hosted/proxied file.
- [CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/):
  nonce propagation to dynamically loaded resources, strict-dynamic support,
  official-origin script/frame directives. Pre-clearance involves a first-party
  cdn-cgi fetch and clearance cookie; this proposal excludes that behavior.
- [Testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/):
  Playwright may be treated as a bot; public dummy keys support controlled results
  and localhost. Dummy tokens are not Production authentication evidence.
- [E2E guidance](https://developers.cloudflare.com/turnstile/tutorials/excluding-turnstile-from-e2e-tests/):
  testing credentials belong only in isolated test environments, never Production.

The four reviewed documents do not provide an exhaustive, stable list of internal
challenge URLs or a request-count guarantee. NOT_FOUND is scoped to these sources,
not a claim that no further provider specification could ever exist. CSP guidance
is NOT itself a QA dispatch-budget, data-use or billing contract.

## Decision A

Keep an exhaustive concrete URL list: exact bootstrap can be tested, but no
source-supported stable policy covers the whole current dynamic challenge chain.
The official live-update requirement also prevents pretending a cached SDK is
the supported real runtime. Full repeatable real-init automation is not presently
feasible under A. Do not keep searching or run another first-icon diagnostic.

## Decision B: feasible design, not already implemented

Replace only this independent QA diagnostic's exhaustive third-party URL rule
with a per-run, frame- and initiator-bound supplier capability. First-party exact
resource paths/bytes and original GROUP_1 scope remain unchanged. This is a
controlled dynamic permission, NOT an exhaustive URL whitelist and NOT proof
that every allowed vendor operation is independently semantically reviewed.

Proposed admission requirements, all evaluated BEFORE forwarding:

1. Only HTTPS `challenges.cloudflare.com:443`; no sibling hosts, wildcard domains,
   URL credentials, alternate ports or redirects, including same-host redirects.
   Bootstrap is only GET of the exact official explicit-rendering URL.
2. Grant a capability only after source/origin/TLS/MIME/size checks on that live
   bootstrap and a recorded per-run SHA256. That hash identifies this download;
   it is NOT a preapproved fixed vendor hash or a complete source audit. Fetch
   fresh from the official URL without caching, mirroring, rewritten SDK or TLS
   exceptions. Existing route.fulfill code is not automatically a compliant live
   SDK transport; implementation must preserve the official loading requirement.
3. Bootstrap may originate only from the approved harness/validated app module.
   Dynamic requests need an active single-widget render grant plus a matching
   registered frame lineage or CDP script-initiator chain rooted in that bootstrap
   and its admitted descendants. Frame origin, Referer or a filename alone is
   insufficient. Missing/racing/unattributable proof means deny, not host-only
   fallback. Runtime child targets are compared against the exact transient
   target associated with that proof; sensitive values remain in memory only.
4. GET for script, registered child-document, stylesheet, image/font and fetch/xhr;
   POST only fetch/xhr from the attested widget chain. Other methods/types,
   unsolicited `other`, popups/main-frame navigations and outside-context browser
   traffic are denied. Dynamic path/query/body permission is limited to the widget
   capability; invalid encoding/control characters, auth envelopes or an unproven
   request fail closed. This new permission is expressly broader than concrete
   URLs and relies on the supplier not sending unintended traffic within its origin.
5. Service/Shared Workers, Worker, WebSocket, EventSource, WebTransport, RTC and
   independent Node exits remain blocked unless separately proven/approved. No
   disabling the deny proxy. Native browser traffic and all transport channels
   must be observable before forwarding; an opaque bypass is an implementation
   block, not permission to relax control. This may block legitimate vendor behavior.
6. No Cookie/Authorization/apikey, Supabase/OAuth credential, email/password or
   account Session forwarded. Response-cookie/redirect restrictions remain strict.
   No Siteverify or Auth API call, login, registration, mail or RLS. Pre-clearance
   and first-party cdn-cgi traffic are denied; do not alter the Production widget
   settings to make this diagnostic pass. Vendor cookies required for some behavior
   may cause a safe stop; no silent cookie exception.

## Proposed bounds; not new owner-approved budgets

- Original global650 and every owner class cap remain untouched.
- Live Turnstile admissions <= the existing class40, including bootstrap. Separate
  GET, POST, child-document/frame and background counters also charge the same
  combined40 and global650 atomically. Overlapping counters are NOT additive
  permission for40 of each class. Parent budgets remain authoritative.
- One active widget; unapproved background dispatch0, redirect following0,
  cross-host forwarding0. Existing2MiB per-response and32KiB request-envelope limits
  may be retained, never expanded automatically. Any relevant existing byte cap
  also applies. These limits do not guarantee a strict network-traffic or invoice cap.
- Proposed isolated run hard300s/work240s/cleanup60s; per-request timeouts bounded
  inside remaining work. Zero harness retry/reset/reload, no implicit second run.
  SDK-internal requests/retries are not invisible: each admission consumes caps;
  an ambiguous replay stops.40 is a retained safety ceiling, NOT observed need,
  guaranteed sufficiency or a documented provider limit.
- Isolated test phase: Production/Provider/Auth GETs0, test-secret/Siteverify calls0.
  Local application resources are served locally; this is NOT Production acceptance.

## Privacy, residual risk and outcomes

Allowing dynamic SDK descendants delegates more trust to the live supplier than
fixed URL/body hashes. Same-host compromise or supplier changes could use that
permission in unintended ways. Initiator/frame correlation is an engineering
constraint, not a cryptographic certificate of a request's business purpose.
Browser automation may be challenged/blocked, controls can stop required traffic,
and the ceilings do not promise completion. No Production identity/path recovery
is claimed. Vendor access/security/fingerprint records may be retained even for
official dummy keys; USD0 is not zero side effects or no internet.

The initial isolated harness contains NO real account credentials, authenticated
Session or private QA identity. This is stronger than trying to filter secrets
from opaque vendor traffic. In a later real login page a third-party script runs
with page privileges; initiator/host restrictions alone cannot guarantee secrecy
against a compromised supplier that encodes page data into allowed traffic.
Do not claim otherwise or silently extend isolated-test approval to Production
login. Later full GROUP_1 approval must explicitly retain that supplier-trust
boundary and any proven credential-isolation controls.

Keep fresh profiles. No HAR, raw console capture, request body/query values,
Cookie/header dumps, localStorage export, token or Session in files/receipts.
Token callbacks yield only boolean/count/status; never print/hash/persist the token.
Ephemeral runtime values die with the isolated context. Public SDK hashes and safe
origin/method/type/frame/initiator/rule/budget categories can be recorded. New
unknown request remains blocked predispatch; sensitive route identity is redacted,
not put in a shareable log. Drain Chrome/Job/network resources on stop/timeout.

Success of isolated testing means observed real SDK load/render/frame/callback
under an official TEST sitekey with controls intact. Partial means an observed
boundary/error or first denied dependency; no callback is not authentication PASS.
Inconclusive means no attributable target, privacy failure or setup/transport
failure; preserve receipt and stop. No automatic whitelist expansion or rerun.

## Minimal next step and four evidence levels

After owner approval of B, engineering can directly implement the isolated
adapter and targeted local safety checks, then freeze it. Actual official-SDK
network testing still needs a separate explicit execution approval/window/GO;
this design decision alone does not grant network access.

Use a localhost/loopback-only harness with official public test sitekeys and no
test secret or backend. Test keys may be supplied only in this dedicated harness,
never env.production, Production HTML/config or a Production Auth submission.
Use the existing integration structure where practical; no new framework or
server-side test-header bypass. Always-pass/fail cases are automated candidates;
an interactive test case needs the owner and still must not bypass the challenge.

Evidence must remain distinct:

- Offline Mock: validates controls only, not genuine SDK/challenge behavior.
- Official TEST sitekey + LIVE SDK: online isolated integration, not offline Mock
  and not proof of real Production widget, account, CAPTCHA or Auth/RLS acceptance.
- Production sitekey: new independently authorized real-widget observation with
  owner challenge handling; do not enable localhost for the real widget or swap
  a dummy key into Production. Real automated success is not guaranteed.
- Full GROUP_1: later fresh complete authorization/GO, genuine A/B/admin identities,
  Production sitekey and16 RLS reads. No test-token shortcut; historical v11 remains
  consumed and its rejected raw request identity remains UNKNOWN.

STRICT USD0 and existing Free-only evidence remain mandatory execution gates.
No new paid feature, overage acceptance or billing configuration is authorized.
Unknown chargeability means0 external dispatch, not a larger cost allowance.
Catalog held; GROUP_2/3/Public Beta not authorized; no default Version151 recovery.

## Exact owner decision requested

Approve ONLY the policy change described above and local engineering of the
isolated official-test-sitekey adapter, explicitly accepting supplier-dynamic
trust rather than fixed URL/hash identity. Preserve caps, privacy, fail-closed
stops and USD0. No network execution, Production change, current humanGates/UTC
approval or GO is included. If approved, implement and test once, not another
search for a fixed undocumented challenge URL dictionary.
