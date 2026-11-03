# GROUP_1 Auth integration: counterexample closes the HARD candidate

Status: BLOCKED. Offline engineering only; no executable production authorization,
approved UTC, Claim or GO. Previous v12/standard/v11 freezes remain unchanged.

## Exact source and controlled outlet

Production source88680a6eaab8de4123199f16b325ec0a430b0b86 AuthPanel uses Supabase
signInWithPassword with the acquired CAPTCHA option and SDK signOut. Its browser
client persists Session and enables automatic refresh. It is not same-origin Auth.
The pinned destination is https://xcbnxzjlsvtgzixurcof.supabase.co:

| Operation | Method / exact path | Actor / phase | Charges |
| --- | --- | --- | --- |
| Positive/negative login | POST /auth/v1/token?grant_type=password | A/B/ADMIN positive; A three approved negatives; one armed login | global/Auth/Mutation |
| Refresh | POST /auth/v1/token?grant_type=refresh_token | Same context and stored actor Session, SESSION_actor | global/Auth/Mutation/refresh |
| Logout | POST /auth/v1/logout or /auth/v1/logout?scope=global | Same bearer and armed LOGOUT_actor | global/Auth/Mutation |
| Identity | GET /auth/v1/user | Existing private fixed reader after capture | global/Auth |
| Profile/RLS | Original exact projections and16 steps | Existing private identity/role validation | global/REST read |

ControlledAuth reuses Group1Gate, SharedBudget and response verification. It pins
context, actor, main-frame fetch/xhr, stage, Origin, public key and finite paths.
The supplied fixed bounded transport is called only AFTER atomic admission.
Wrong source, route, identity, unarmed/replayed request or exceeded class cap
cannot use this outlet. Refresh follows the original private refresh value;
logout uses the exact Session bearer. Unknown Cookie, Set-Cookie, Location,
redirect, invalid CORS response or Session envelope fail closed. Failure is charged;
abort/close destroys reader state and never retries ambiguous operations.
Private request/response content is process-only, not receipt/CLI/IPC output.

Nine new deterministic helper tests PASS; they are NOT native Production Auth,
real SDK/CAPTCHA, SameSite/CORS equivalence or a complete14-case runner proof.
The old memory handoff/16 mappings remain verified offline, not rerun here.

## Actual browser counterexample

One new affected-boundary test runs the real standard Chrome, normal Dedicated
Worker/SharedWorker, Service Workers blocked, isolated Profile and existing Job
supervisor. Every network target is an owned loopback fixture; a deny proxy and
non-loopback DNS exclusion prevent external access. No credentials or SDK used.

A deny-ALL HTTP rule for the fixture Auth origin is stronger than the proposed
finite Auth interceptor. Main-frame POST and Dedicated Worker POST were intercepted
and stopped. SharedWorker POST to the exact fixture password endpoint still
reached the server once. Native Worker WebSocket upgrade reached it twice despite
the context socket-deny rule; main-page socket was intercepted. This demonstrates
an Auth HTTP predispatch bypass, not merely missing postdispatch observability.
The server returned403; no real login, Session or business side effect occurred.

Evidence: artifacts/auth-outlet-1791972013493/BYPASS_PROBE_SAFE.json and
SUPERVISOR_SAFE.json. Profile removed, browser/job closed and child reaped.
10/10 targeted tests PASS means helper assertions and the counterexample were
successfully measured. It does NOT mean Auth bypass prevention passed.
There is no claim that Cloudflare caused this traffic, that Production attempted
this bypass, or that the old unsupported-browser/root-cause identity was recovered.

## Bounded exit, not a new containment project

AUTH_BYPASS_PREVENTION=BLOCKED, complete AUTH_PRE_DISPATCH_BOUNDARY=BLOCKED.
Do not expose this helper or attachAuthRoutes as a usable production runner.
Do not revive Worker deletion, trusted-Worker patches, proxies, SDK relay, network
probing or simply replace a hash. General native-browser650/40 remains non-HARD.
14-case mapping and16 RLS steps are preserved; zero complete safe execution entries.
All caps/roles/Boundary2/residual obligations/USD0/Catalog/recovery rules unchanged.

Single minimal alternative for an explicit owner contract decision: native Chrome
manual Auth, refresh and logout remain MONITOR_ONLY, including original Auth40,
refresh6, Mutation50 and browser650 observation thresholds; fixed Node identity/RLS
GETs remain HARD with memory-only, context-bound, freshly verified identity.
No numeric increase, valid CAPTCHA fabrication, new business scope or production
configuration change. This gives up the specifically required whole-browser Auth
predispatch guarantee and must be independently accepted before further integration.
It is NOT applied/authorized here. If that residual risk is unacceptable, stop
GROUP_1 under current constraints; do not create another ineffective authorization.
