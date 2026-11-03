# GROUP_1 LOGIN_A Denial Diagnostics

Read `docs/ops/PUBLIC_BETA_CURRENT_STATE.md` first. This is a scoped QA patch,
not another current-state document, Production authorization or live Auth result.

## Evidence and Plan

- [x] Preserve the consumed free-plan-v2 authorization, Claim and both receipts.
- [x] Trace `gate.reserve -> browser catch -> runner -> child receipt`.
- [x] Reproduce missing diagnostics RED, then implement bounded predispatch logging.
- [x] Test the real Chrome route adapter with production AuthPanel/SDK and local mocks.
- [x] Freeze only the changed diagnostic scope; leave Production business code alone.

Historical cause remains UNKNOWN. The original receipt records only
UNAPPROVED_REQUEST at LOGIN_A, five admissions, no Auth dispatch, no RLS cases,
one successful Deployment GET and successful cleanup. It has no raw request
identity; no HAR/trace/private browser log was captured. It cannot prove a favicon,
asset query, Turnstile route, background fetch or any particular denied URL.
Offline synthetic reproduction is not evidence that its URL caused the live failure.

The confirmed defect is lost diagnostic context: gate.mjs threw a common error;
browser.mjs stopped with just its code; runner.mjs omitted browser diagnostics.
The new journal classifies without changing the gate's admission decisions.
gate.mjs, wire.mjs, node-guard.mjs, supervisor.mjs and the Job broker remain byte-identical.

## Changed Boundary

The independent copy adds a safe journal to browser dispatch and propagates it
through the runner's final receipt even after close. Full GROUP_1 remains blocked.
The new child can run ONLY the smaller LOGIN_A initialization diagnostic:

- One isolated headless A context; no credential input or manual challenge solving.
- Only the original login URL and manifest-bound script/style GETs, plus the
  originally bounded Turnstile GET capability; at most eight browser GETs.
- Before/after exact Deployment GETs, at most two; global dispatch cap ten.
- No Supabase wire capability, Auth, REST, login submission, refresh, logout or write.
- 300-second hard bound, 240-second work bound, 60-second cleanup reserve;
  at most ten seconds observation after DOM content loaded; OAuth >360 seconds.
- On any denial, budget issue, transport/response exception or drift, stop without
  post-Deployment. Never start additional probes or broaden a route automatically.
- A clean diagnostic is DIAGNOSTIC_COMPLETE, not login PASS or full GROUP_1 PASS.

This smaller scope/time/budget is an explicit new subset contract, not an automatic
reuse of the consumed 1800-second authorization. A new exact independent GO and
owner approval of real UTC times/all gates are mandatory. No valid approval is
created by preparation or tests. The original 14 mappings / 16 RLS reads are
retained as obligations, but are NOT dispatched or claimed complete here.

## Safe Evidence

At most 32 whitelisted events: stage, A/B/ADMIN/anon label, source category,
known host or redacted unknown host, method, known normalized route or redacted
unknown route, query presence/count only, resource type, rule ID, rejection/budget
category, redirect/repeated-request relation and transport/completion state.
No headers, bodies, private IDs/emails, dynamic challenge fragments, query values,
credentials, tokens, cookies or Sessions enter the journal. Known static filenames
come only from the frozen manifest. A transport invocation is NOT proof of an
actual socket write; the state explicitly says so. Completed responses are counted
separately from admissions/attempts. Failure does not reset the counters.

Run only the scoped local tests with Node's test runner. Browser network uses the
existing deny-only loopback proxy and controlled loopback fixture transport, never
Production. No package installation, cloud CI, paid API or deployment is needed.
