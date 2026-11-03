# v18 Abort Causality Review - Offline Only

ERR_ABORTED_CLASSIFICATION=C
FIRST_FAILURE_CAUSAL_ORDER=PROVEN_FOR_QA_STOP_AND_CLOSE_ONLY
REQUEST_IDENTITY=UNKNOWN
MINIMAL_FIX=BLOCKED
NEXT_GROUP1_PACKET=BLOCKED

## Evidence and Ordering

Original v18 EXECUTION_SAFE.json, FINAL_SAFE.json, SUPERVISOR_SAFE.json,
GO_CLOSURE_SAFE.json and owner supplement are preserved. The source was read
against the still-matching 362-file freeze. No live precheck was performed.

The recorded order is partial, not a recovered timestamped network trace:

1. Owner Start received once; navigation displayed the production login page.
2. The application page's requestfailed listener recorded GET/fetch/OTHER,
   net::ERR_ABORTED, responseStatus=null, while closing=false and not excludedIcon.
3. That listener synchronously calls stop(NATIVE_REQUEST_FAILED). stop preserves
   the first failure, stops the shared budget, and immediately enters close().
4. close() sets closing=true BEFORE closing context/browser. Later cleanup
   requestfailed callbacks cannot set a new failure through the guarded branch.
5. The runner observes the failure, catches it and closes all remaining contexts.
   Supervisor reports EXIT_NONZERO, 20156ms, no timeout, child reaped/Job closed.

Thus this recorded first failure preceded the QA close entry, not vice versa.
This does NOT exclude earlier browser-internal/owner/page/frame cancellation.
No recorded request identity, monotonic event timestamps, navigation epoch,
frame unload relation, initiator or close event stream can establish that cause.
The tolerated external GET and failed GET have no saved shared request ID.

The child deadline AbortController is passed to Node/runner, not to page fetch.
The supervisor did not time out. Reviewed media/icons are marked excluded BEFORE
route.abort(). Negative Auth abort paths operate on exact POST, not this GET.
Other browser/frame cancellation mechanisms remain UNKNOWN, not disproved.
The response-status map only records selected Supabase Auth responses. Its null
for this OTHER request is NOT proof of no HTTP response or no network dispatch.
No original host/path/token is recoverable; no new private capture is introduced.

## Targeted Checks

Final local run: artifacts/run-1792041358964/TARGETED_SAFE.json, 8/8 PASS.
Four tests execute the frozen stop/requestfailed code with deterministic events;
four use the actual unchanged v18 browser adapter and current Chrome in isolated
local fixtures. Explicit AbortController cancellation produces the same error
and fatal stop. A simulated connection reset and illegal POST remain fatal;
cleanup guard and first-failure preservation are verified. Context/channel
cleanup succeeds. Ordinary navigation did NOT reproduce the cancellation;
automatic frame unload attribution remains UNPROVEN, not claimed as covered.

The three preceding local attempts are retained, not counted as passes:
run-1792041250150 had an incorrect zero-proxy-attempt assertion; Chrome background
CONNECT attempts were denied by the local non-forwarding proxy, not external GETs.
run-1792041275558 failed to reproduce the presumed navigation cancellation.
run-1792041319997 also failed that presumption and one control-page navigation.
No frozen production execution code was changed to obtain the final result.
Fixtures use DNS denial, a loopback reject-only proxy, and local route fulfillment;
no SDK, Production, provider endpoint or real credentials are used.

## Sole Proposed Alternative - Owner Decision Required

Do not exempt this historical GET or all ERR_ABORTED errors. Leave v18 consumed
and stopped. No next full authorization Packet is generated.

The simpler alternative is owner-operated standard Chrome authentication with
the existing isolated accounts/profiles and protected in-memory Session bridge,
followed by the unchanged HARD Node identity checks and 16 fixed RLS reads.
A separately approved contract would treat generic browser requestfailed events
as non-success, unresolved observations rather than immediately destroying the
authentication window. This is a real stop-policy change, NOT proof of benign
cancellation, and has NOT been implemented or approved by this review.

Owner must explicitly accept delayed detection of real third-party/network
failures. An unresolved error never authorizes a new Origin/method/Node request
or counts as a passed case. CAPTCHA/login success, actor identity, expected Auth
responses and required read results remain mandatory; observable credential
leakage, wrong actor, unexpected Mutation, unsafe cost, owner Stop, category
threshold/deadline and cleanup failures must still stop. Browser monitoring and
40/650 are soft, incomplete; no hidden-traffic or fee hard-cap claim is added.
No raw HAR/DevTools credential export, account recollection, SDK probe or new
network interception infrastructure is needed. Separate full contract approval,
fresh binding/authorization/window and independent GO are prerequisites.

PRODUCTION_REQUESTS=0
THIRD_PARTY_LIVE_REQUESTS=0
PRODUCTION_WRITES=0
MAX_ADDITIONAL_COST_USD=0
CATALOG_HOLD=ACTIVE
GROUP_2=NOT_AUTHORIZED
GROUP_3=NOT_AUTHORIZED
PUBLIC_BETA_GO=NOT_AUTHORIZED
