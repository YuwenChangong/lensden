# Safe LOGIN_A script identity evidence

This is a scoped QA tool, not another project status baseline. Read
`docs/ops/PUBLIC_BETA_CURRENT_STATE.md` for actual release state.

The prior fingerprint-only design could not identify a pathname absent from the
local dictionary. This independent revision does not broaden network admission.
It adds public identity evidence BEFORE rejecting unknown script requests:

- MANIFEST_MATCH: exact path already in the frozen local manifest.
- PUBLIC_REFERENCE_UNMATCHED: a changed eight-character build hash for a finite
  reviewed local script stem; the same-origin pathname is explicitly referenced
  by the validated anonymous login HTML or a byte-verified bound script import.
- PRIVACY_BLOCKED: no sufficient public reference/path proof. Raw pathname stays
  absent; fingerprint alone is not represented as an actionable identification.

Safe paths must match `/_astro/<reviewed-stem>.<8-character-build-hash>.js`,
with no encoded path, nested segment, arbitrary identity or UUID. Stems come only
from the original67 manifest paths. Credentials in URLs reject disclosure.
Query/fragment values, headers, bodies, cookies, tokens and sessions never leave
memory. Source parsers retain at most256 safe references. No unknown script is
fetched to acquire its name or inspect its content.

Reference proof shows that the anonymous page or a verified dependency requests
that public path; it does NOT prove deployed static bytes, script legitimacy,
side-effect freedom or permission to dispatch. No dictionary match or safe
syntax can authorize a request. An unfamiliar stem or non-static route remains
PRIVACY_BLOCKED and must not start another identical production probe.

Only new affected tests run: unknown production chunk names, dynamic import,
modulepreload, privacy filtering, gate refusal, final Runner JSON, static-hash
failure and replay protection. All browser requests go to local loopback Mock,
not Production. Previous17/35/123/9/43 test evidence is reused unchanged.

The new pending contract stays browser8/Deployment2/global10, hard300/work240/
cleanup60, USD0, no credentials/Auth/RLS/writes. All gates and UTC remain null.
Independent new authorization and GO are mandatory; original v3 is consumed and
v4 fingerprint-only packet was never authorized. Neither can be reused.

After a future independently approved diagnostic:
A. Public path identified: offline source/build correlation and purpose/privacy/
   side-effect review, then exact QA binding change and focused tests; only then
   prepare a new full GROUP_1 approval. Never allow merely because it is same-origin.
B. Unapproved script: keep blocked, report origin/reference and reason, no retry.
C. PRIVACY_BLOCKED: keep blocked and identify the missing public-path/provenance
   evidence; require protected owner review or trusted deployed manifest, not an
   identical fingerprint-only probe.
