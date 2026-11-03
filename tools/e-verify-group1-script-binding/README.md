# LOGIN_A script evidence closure

Scoped QA tool; the sole release baseline remains
`docs/ops/PUBLIC_BETA_CURRENT_STATE.md`.

Historical receipt is `/:unbound`, not a proven `/` request. It contains no
pathname hash. The 67 exact local JS/CSS files and 207 literal dependency edges
are complete against the existing candidate manifest, but matching source SHA
does not prove byte-identical Cloudflare Builds output. No script name can be
recovered from the historical receipt. No allowlist fix is justified yet.

The independent copy changes safe diagnostic pathname evidence only. For
application-origin LOGIN_A GET/script requests, SHA256 is calculated over
`group1-script-path-v1\0` plus WHATWG URL pathname, never query values, host,
credentials, headers or body. Unknown raw paths remain redacted. The finite local
index can match the fingerprint exactly; no match means UNKNOWN, not a guessed
filename or permission to dispatch.

`build-evidence.mjs` checks the existing build and dependency graph without
rebuilding. `browser-path.test.mjs` uses real Chrome, original compiled chunks,
Astro island runtime and loopback-only transport. Its constructed island shell
is NOT retained Production HTML or Production login evidence. No real CAPTCHA
is solved. The old 123/35/9/43 test sets are not rerun.

Full GROUP_1 retry stays BLOCKED. The new pending packet is diagnostic-only:
8 browser GETs, 2 Deployment GETs, total10, hard300/work240/cleanup60, no Auth or
Supabase transport. This limit is not represented as sufficient for all login
dependencies. Unknown requests still stop before dispatch. Existing owner
budgets, static paths/bytes, gate, wire and process containment are unchanged.
No UTC window or human gate is preapproved; new approval and independent
`GO_E_VERIFY_GROUP1_SCRIPT_FINGERPRINT_DIAGNOSTIC_V1` are required.

To compare a future safely retained pathname hash offline:
`inspectBuild({scriptPathSha256: actualReceiptHash})`. The original v3 receipt
cannot retroactively acquire that hash. Never reuse its consumed Claim.
