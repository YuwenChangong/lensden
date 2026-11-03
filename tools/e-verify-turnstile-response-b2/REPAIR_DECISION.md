# B1 response diagnosis repair and minimum B2 decision

## Proven facts

B1 ONLINE_SAFE, ONLINE_FINAL_SAFE, ONLINE_SUPERVISOR_SAFE and hash-linked closure
retain no HTTP status or response headers. The transport held these in ephemeral
process memory only; Chrome/Node exited and no body/HAR/raw response was retained.
The original guard's OR condition proves only: HTTP3xx OR Location present.
Actual B1 status/location/redirect target and root cause remain UNKNOWN. No new
network request can retroactively prove the historical response.

Field collision is proven in frozen live-child: aggregate `status` assigned before
`...result`, whose `status` is the phase object. The parent compares that object
against a string, preventing success recognition. New v2 receipts separate
executionStatus, failureStage/failureCode, stageResults and cleanupStatus, with a
single compatibility parser and updated parent/child consumers. B1 untouched.

## Diagnostics, not policy change

New independent gate copy preserves request admission and response rejection
semantics. Adds bounded safe response journal. New transport copy calls header
observer immediately at response arrival, before Content-Length/encoding/body
failure. Failures before any valid status remain UNKNOWN. Location is parsed
only in memory into a finite origin class; no raw URL, query, credentials,
Cookie/Authorization, token, body, HAR/trace or console persistence.

Even200+Location and same-origin redirect are still denied. No automatic retry,
redirect following, CONNECT forwarding, host/initiator fallback or widening.
No evidence supports a redirect exception. Permitting any would require an
independent contract change, actual target evidence and owner approval; not B2.

## Minimum meaningful B2 scope (NOT AUTHORIZED)

One fresh browser-generated GET to the SAME exact official SDK URL, using the
same reviewed mediation/initiator chain. Hard supplier max1, GET1, POST0, frame0,
global650 preserved ceiling including localhost harness/denied native proxy.
No extra650 allocation and no change to full GROUP_1 budgets. Body32KiB/2MiB and
10s request bounds unchanged; supervisor300s/work220s/cleanup60s. Byte limits are
not strict wire/billing caps. Strict USD0/current Free-only evidence preserved.

Stop after headers/body classification: NEVER deliver or execute SDK bytes in
Chrome, call render, create widget/frame, receive callback or Siteverify. This
isolates the exact B1 stopping point, rather than repeating full SDK init or
GROUP_1. Fresh response metadata distinguishes all combinations of3xx/Location
and preheaders/stream failure; no exact Location target/path is saved or fetched.
Real Chrome/local HTTP tests prove reachability and receipt retention at this
point, not vendor behavior or future response equivalence. Connection failure
can still produce no headers; it will be recorded as such, not invented.

Five gates, UTC null and separate exact GO are mandatory. No valid authorization,
Claim or GO created by preparation. Existing B1 is consumed forever. B2 cannot
authorize redirects, real SDK init, Production, Auth/RLS or GROUP_2/3. After a
meaningful result, make a specific next decision based on actual safe metadata,
not another uninstrumented full GROUP_1 attempt.
