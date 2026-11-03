# Single alternative: standard-capability isolated manual Chrome

OWNER DECISION DRAFT ONLY. NOT an executable authorization Packet or live approval.

## Purpose and intended scope

Keep only Layer1: owner-driven local QA page, official public TEST Sitekey,
exact official SDK bootstrap, normal Chrome TLS/native loading, one widget and
one Start. No Production identities/keys, Auth, RLS, Siteverify, business API,
credentials, account inputs or pre-clearance. No automation evasion or challenge
result/token spoofing, no SDK rewriting, no Node SDK transport/redirect loop.

Use a new clean isolated owned Profile/context with normal browser capabilities,
including native Dedicated Worker. Do not delete/fake browser capability globals.
No existing account/session/profile, extensions, sync or paid proxy. Preserve
Chrome sandbox/TLS security; no new unreviewed binary or system configuration.

## Explicit changed boundary requiring approval

Compared with v1/fresh-v2, the QA script would no longer remove the six capability
globals. Standard browser capabilities are not inherently a credential-free
network sandbox. Vendor frame/Worker code, dynamic fetch, nested execution and
other native channels cannot be promised registered-frame-only or pre-dispatch
blocked by the reviewed CDP mechanism. Harness CSP is NOT an inherited global
policy for every vendor frame/Worker.

Worker/third-party network enforcement: MONITOR_ONLY, not HARD. Existing scoped
page controls may remain where compatible, but must never be represented as
covering Worker/background/OS egress. Intended application surface stays current
loopback and official vendor; unknown observable destinations cause soft Stop,
not a guarantee that no request has already occurred.40/650 observations remain
soft triggers with incomplete coverage, never wire/invoice/byte caps. No claim
SDK internal retries or all background requests are disabled.

This is a material permission/risk change, NOT covered by consumed authorizations
or the owner's approval of trusted-frame-only Worker restoration. If the owner
requires hard unknown-origin denial, this alternative is also BLOCKED.

## Retained constraints and future acceptance requirements

USD0: reuse Free Turnstile plus owner-attested trusted no-incremental-charge
connection; no paid services/configuration/account inputs. No waiver of unknown
charges. New cost uncertainty stops, not best-effort acceptance.
Same600s total incl cleanup,520s child/540s supervisor/60s reserve, UTC<=60min
and >610s at actual start. No manual reload/reset/retry or profile reuse.
Vendor IP/device/security logs and transient state may persist; safe booleans/
enums/counts/status only. No raw token/hash/URL/query/headers/Cookie/Session/HAR/
storage/fingerprint/screenshot export. Callback token must be ignored.
Owner manually observes Start/widget/interaction choice/Finish or Stop. SDK,
render, Frame, callback, explicit observations and cleanup/Job drain/profile
removal all required for isolated completion; otherwise partial/BLOCKED.
No promise normal capabilities will cure the vendor rejection.

Approval of this draft would permit only the specifically described next stage;
it does not by itself approve a live run. A new reviewed implementation/binding,
explicit six gates (updated for this boundary), exact UTC approval and independent
GO are required before live execution. No automatic fresh instance now.
Catalog ACTIVE; full GROUP_1 BLOCKED, GROUP_2/3/Public Beta NOT_AUTHORIZED;
Version151 is not a default post-Hardening recovery target.
