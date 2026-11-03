# Two-layer native Chrome manual acceptance (NOT AUTHORIZED)

## Layer1: isolated official test widget

One clean owned temporary Chrome profile, no extensions/sync, target in a fresh
incognito context, initially no cookies. Local127.0.0.1 HTTP serves only a nonce/CSP
harness and an empty data icon. No account inputs/private binding import, no
Production Sitekey/Secret or business endpoint. The existing official public
always-pass visible TEST Sitekey is fixed in the harness; no test secret.

Owner clicks Start once. A normal script element loads exact official api.js;
Chrome itself performs HTTP/TLS and SDK same-origin redirects. Node serves ONLY
loopback HTML, never retrieves, proxies, fulfills, modifies or stores SDK bytes.
The page uses explicit render(), disables response-field storage, harness retries,
expiry refresh/reset and retains only callback booleans. Internal supplier behavior
is not claimed globally bounded or disabled. Manual interaction is not guaranteed
by an always-pass test widget; use NOT_REQUIRED_BY_TEST_WIDGET honestly, never
mark a Production human challenge PASS. No Siteverify/pre-clearance/Auth/RLS.

The previously reviewed official rendering/CSP/testing guidance is reused; no new
official/SDK request was made while preparing this plan. Native-live compatibility
and actual Challenge behavior remain NOT_EXECUTED, not inferred from fixtures.

## Network classes: explicitly DIFFERENT from B1/B2/GROUP_1

| Class | Actual boundary |
| --- | --- |
| A: old hard controls | Node-mediated reviewed transport reservations/body caps remain historical evidence; neither transport nor hard650/40 is inherited. |
| B: observable, no global hard bound | Page/CDP status, request/redirect/frame events;40 observed supplier events or650 target events trigger SOFT stop/close. Events can precede/lag actual wire activity, duplicate across targets, miss browser/OS traffic; never report total Internet dispatches. No hard byte/invoice guarantee. |
| C: scoped actual blocking | Nonce/CSP, request-stage CDP Fetch in reviewed page/registered iframe targets, deny wrong origin/protocol/port/method/type/credentials/unregistered frames/Siteverify/main navigation/reload; pause child iframe targets for observation; disable extensions/SW/Worker/RTC/WebTransport/EventSource, close WS/popups/downloads; fixed Node egress guard. These are NOT OS-wide controls. |
| D: not enforced end-to-end | Browser/network-service/OS DNS, cert checks, background infrastructure, supplier internals, racing popup/new-target flows and all native egress not covered by target interception. Flags reduce some traffic, not proof of elimination. Browser native cookies/caches may exist transiently. No opaque CONNECT tunnel or TLS-intercept CA is introduced. |

Intended target surface is exact HTTPS challenges.cloudflare.com:443 plus current
loopback harness origin. SDK bootstrap exact; supplier child paths/query are a
registered-frame supplier capability, not an exhaustive URL allowlist. Native
GET/POST and same-origin redirects within registered observed chain are expressly
proposed new permissions. Unknown origins in observable targets are blocked; do
NOT claim all unknown browser/OS destinations globally blocked. No wildcard-host
permission, no production/test-system policy change. Third-party ephemeral cookies
are not forwarded/exported to other contexts; accepting native state is a new gate,
NOT the old B1 no-Set-Cookie policy. If these residuals are unacceptable, STOP.

## Manual steps after separate authorization and GO ONLY

1. Owner confirms trusted machine/network, no unreviewed proxy/extension/service,
   no cost-metered connection, official Free-only capability; no signed-in profile.
2. Frozen launcher checks identity/files/auth/window/unique Claim, then opens one
   headed Chrome QA window. No SDK request until Start; owner does not navigate
   elsewhere or open additional tabs. Debugging uses local CDP pipe, not public TCP.
3. Start once, observe SDK load, render and widget/frame. Perform ONLY widget
   interaction if requested; do not enter email/password or user data anywhere.
4. Owner explicitly clicks Widget visible, then either Interaction observed OR
   No interaction required. These are owner attestations, not automated truth.
   Callback argument is ignored, never copied/hashed/logged. Do not export HAR,
   traces, storage, raw console/network logs, tokens or unsanitized screenshots.
5. Finish only if observations genuinely agree; Stop on any unexpected error,
   origin, prompt, data request, paid feature, privacy concern or uncertainty.
   No reset/reload/retry, profile reuse, fallback proxy or auto security exception.
6. Close contexts/browser/loopback server; native Job must drain. Delete ONLY the
   recorded owned temp directory after close/drain. Parent performs exact-profile
   cleanup after abnormal child exit only when native process drain is proven.
   No secure-erasure/OS-log/Cloudflare-log deletion claim. Ambiguous cleanup blocks.

New isolated limit:600s TOTAL supervisor, child520s, supervisor work540s and
cleanup reserve60s INSIDE total; authorization<=60min and >610s remaining at start.
No real-time OS scheduling guarantee. SDK request timeout/internal retry behavior
is native, NOT inherited Node10s or2MiB enforcement. These are explicit contract
differences, not increased old GROUP_1 budgets. Owner must accept before execution.

## Evidence and success

Only native-turnstile-manual-safe-v1 typed booleans/enums/counts/status codes:
SDK loaded, render entered/returned, vendor frame observed, callback occurred,
owner visibility/interaction choice, Finish, safe error/stop code, independent
cleanup/profile deletion/native containment. No headers/URL/path/query/body,
Cookie/Session/account information, token hashes or fingerprint values retained.
Observed response codes include redirects without storing Location. Raw CDP event
objects exist only transiently in process memory and are not collected/exported.

COMPLETE requires SDK/render/frame/callback, explicit owner visible/interaction
choice/Finish, successful cleanup/profile removal and native process drain.
PARTIAL/INCOMPLETE retains reached stages without inventing missing ones. Any
boundary/privacy/error/timeout/cleanup failure BLOCKED. Test widget completion is
not a Production CAPTCHA/identity/GROUP_1 or Public Beta result.

USD0 is nonnegotiable. Reuse OWNER_ATTESTED Turnstile Free evidence; no paid API,
other billable platform, payment/plan/config change is authorized. NEW connection
cost and trusted-environment facts need owner confirmation; unknown chargeability
keeps execution BLOCKED. This is NOT acceptance of a positive/unverified bill.

## Layer2: future full GROUP_1, NOT AUTHORIZED

Requires actual Layer1 live evidence and another explicit subset/manual contract,
approved Production origin/version and fresh identity/cost/window/GO gates. Never
inherit B1/B2/native-isolated claims, approvals or obsolete scopes. The generated
GROUP1_FUTURE_EVIDENCE_PLAN.json retains exact14 mappings, original login actions,
page assertions and16 RLS requests/expected results; no matrix redesign.

A/B/ADMIN identity must privately match exact saved UUID/email/application role
before use; private inputs remain local and do not enter this first-layer runner.
Separate clean contexts per actor; no Session sharing. Owner manually obtains
real Production CAPTCHA and logs in/out under the FUTURE scope. Positive/negative
Auth attempts are precisely original loginActions, not registration/mail/recovery.
Session refresh and auth security records are side effects, not anonymous reads.

Each original case needs safe evidence ID, actor label, expected-vs-observed status,
assertion result, console/network error category, session isolation/logout result
and cleanup. Identity match is boolean only, not UUID/email. Each of16 RLS steps
needs exact source step ID/actor/status/content-denial assertion; responses/session
headers only in protected runtime memory, no token transfer to chat/JSON/DevTools
exports. A reviewed private session-to-fetch adapter would be separately bound;
it is NOT implemented/approved by this isolated plan.

Original16 requests are anon6, A5, B5, not16 authenticated positive reads. A/B
invoker projections are expected to deny; legacy/audit may be empty-or-deny.
Signed-in product pages use anonymous SSR and must work separately. Do not label
expected direct denial a bug or infer all website access from a successful login.
No new direct authenticated-published GET is silently added. Preserve exact
verifyGroup1Catalog/verifyIdentity rules, partial ADMIN/UI scope and residual50-case
obligations. Login alone cannot pass GROUP_1; isolation alone cannot pass E_VERIFY.

Catalog held; no default Version151 post-Hardening recovery; GROUP_2/3/Public Beta
unapproved. No Production login, data mutation, admin write, email, media, database,
deploy, push or provider configuration change authorized by this plan.
