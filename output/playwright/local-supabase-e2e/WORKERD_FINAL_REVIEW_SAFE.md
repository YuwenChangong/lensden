# Final Bounded Workerd Investigation

2026-10-16; sourcea22b61ed. Scoped evidence, not another progress baseline.

## Authorization and Method

Exactly1 new owner-authorized local reproduction: `fc32d3d0ff45`, same guarded
Astro build, HTTPS4328, local Supabase55 migrations, ordinary isolated A/B/ADMIN
contexts and original minimal prefix. Result4 prerequisites PASS/1 target FAIL.
No retry, broad regression, business23/RLS16/idle/Turnstile suite or R2 access.

Historical receipts lacked child output/lifecycle evidence. Miniflare source
filters internal logs containing native hex stacks, so previous zero counters
were insufficient. A temporary Node diagnostics_channel child_process observer
attached only to this parent's workerd children before startup. Local --version
confirmed output observation; it was not another website reproduction.

Native stdout/stderr, child exit/close events, existing Wrangler error/runtime
events and cause chains were observed. Only bounded redacted matching messages,
stream byte counts, stage/order, process identifiers and resource snapshots were
saved. No stdin configuration, environment/argument values, request bodies,
credentials, Cookie/Authorization values or raw private URL were exported.
Temporary instrumentation removed afterward; QA/app/dependency/runtime files
match the task baseline. No new platform, proxy or permanent observer.

## Actual Native Evidence

- Two workerd children. Process1 stdout9912 bytes; process2 stdout0; stderr0 each.
-28 native messages, all SETUP. Actual error class:

```text
error accepting tls connection
kj/compat/tls.c++:82: failed: OpenSSL error
SSL routines:OPENSSL_internal:SSLV3_ALERT_CERTIFICATE_UNKNOWN
```

This symbolic name does not prove use of SSLv3. The messages lack an identifying
connection/request link to the target failure. No such message occurs in B_PAGE.
They are NOT proven to cause500, and do not justify certificate bypass/TLS changes.

## Ordered Failure and Lifecycle

Times are milliseconds relative to the run's diagnostic origin, not UTC.

| Time | Observed event |
| --- | --- |
| 10034 | A page begins; subsequently shell200/denial state |
| 10258 | A admin list denial begins;403 required |
| 10313 | A admin action denial begins;403 required |
| 10367 | B GET /admin/reports/ begins |
| 10399 | ProxyController wrapped error;cause ends Network connection lost. |
| 10403 | HTTP500 observed;both workerd children still alive,exitCode null |
| 10422 | Independent direct Worker comparison200;not replacement browser PASS |
| 10422 | Cleanup starts |
| 10639 | Process1 exits SIGKILL during cleanup;streams closed |
| 10651 | Process2 exits SIGKILL during cleanup;streams closed |

45 events, no capture truncation. No unexpected process exit, replacement or
fatal/OOM message. The SIGKILLs are expected cleanup, not evidence of native crash.
This excludes an observed process death before500, not every isolate/connection
failure. Cause chains provide no deeper native exception or application stack.
The outer wrapper message is empty and its cause contains Network connection lost;
previous counters matching only the outer message could therefore remain0. This
explains a diagnostic gap, not the downstream connection failure itself.

Host free memory2589MiB at startup/1726MiB at500; Node RSS289MiB at startup.
No custom runner resource limits. These snapshots do not measure all workerd
limits or prove the absence of memory pressure; do not infer an OOM/resource cause.

## Final Decision and Stop

WORKERD_RAW_ERROR=CAPTURED (SETUP TLS alerts only;not proven target cause)
DOWNSTREAM_DISCONNECT_CAUSE=UNKNOWN
PRECONDITION_SEQUENCE_CAUSALITY=UNKNOWN
ROOT_CAUSE_CLASS=UNKNOWN
MINIMAL_FIX=BLOCKED
UI03_LOCAL_RUNTIME_UNRESOLVED

No application/RLS/GRANT/Auth/SSR, dependency, certificate or transport change.
Miniflare service.fetch/proxy stack is not a proven workerd internal root cause.
Do not retry-to-green or substitute historical B-only200 for the failed sequence.
Normal HTML shell200, client permission denial and protected API403 are distinct;
this500 does not fulfill the page denial contract or prove an authorization bypass.

Diagnostic disposition UI03 BLOCKED; raw target FAIL500 retained. Existing admin,
reporter, RLS and idle evidence reused; Production UNKNOWN, local GROUP1 still10/14.
No further workerd investigation under this one-attempt authorization. Continue
independent R2 isolation preparation and other Beta work without expanding access.

## Cleanup

Owned local Supabase containers/volumes/accounts/fixtures, DPAPI credentials and
TLS files removed;browser/worker processes closed;active pointer/ports absent.
Both native process close events captured. Unrelated local projects untouched.
Production/third-party requests/writes0, no R2 access/deployment/push; USD0,
Catalog ACTIVE and Public Beta not authorized. Original receipts unchanged.
