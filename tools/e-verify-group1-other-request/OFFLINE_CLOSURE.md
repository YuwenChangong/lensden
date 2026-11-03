# v11 LOGIN_A other-request closure

Status: historical request identity UNKNOWN; full GROUP_1 reauthorization BLOCKED.
This is local QA work, not a Production execution packet or authorization.

## Evidence and limits

The immutable v11 closure records APPLICATION/GET/BROWSER_RESOURCE/other,
NO_BOUND_RULE, UNAPPROVED_ROUTE, `/:unbound`, transport NOT_INVOKED. It does not
retain the original pathname. `/:unbound` is the diagnostic privacy fallback,
not evidence that the URL pathname was `/`. There is no recoverable raw path
in the reviewed receipts. The rejected request was not sent. Prior25 admissions
include one Deployment and24 completed application GETs; Auth0, RLS0/16.

The retained, hash-verified Production login HTML declares document icons at
`/gaze-icon-v6.svg`, `/gaze-icon-v6.ico`, `/gaze-icon-32-v6.png` and an Apple
touch-icon reference. Original real Chrome156 and the original QA adapter,
using this HTML and retained verified scripts/styles over loopback only,
produce24 application wire GETs then reject a declared icon as `other`.
The local first icon is `/gaze-icon-v6.svg`; Chromium also considers ICO/PNG
fallbacks. The request belongs to the application main frame. No usable
fetch-destination header was available; its value remains UNKNOWN.

This proves a local category-handling defect consistent with the historical
symptom and request count. It does NOT prove the historical Production request
was an icon or that its exact pathname was any of these candidates.
Hydration succeeded in the local retained-byte run; public script errors were
absent. Local inert CAPTCHA is NOT evidence of live Turnstile/Auth success.

## Minimal QA changes

- Keep the original gate,29 resource bindings,14 mappings,16 RLS steps,
  actor isolation,650/global and every class budget unchanged.
- In an independent browser copy only, parse public document-icon references
  AFTER the existing exact HTML/source/page validation. Only exact same-origin
  HTTPS GET/other, allowed actor/stage, main frame and no query/fragment,
  credentials or redirect may be excluded WITHOUT transport dispatch.
  No icon bytes are fetched or declared verified. Unknown `other` is denied.
- Preserve predispatch source/protocol/frame/typed-route/match evidence and
  the original rule/category in the safe receipt. Initiator is explicitly
  unavailable through this Playwright request API. Unknown paths have keyed
  per-run evidence IDs, never reversible ordinary-log pathname dictionaries.
- Optionally capture the first unknown same-origin LOGIN_A/A GET/other
  pathname only in a protected owner+SYSTEM directory, AES-GCM encrypted with
  an RSA key whose private part is DPAPI protected. No query/fragment,
  credentials, headers, body, Session or frame URL is persisted. Ordinary
  receipts expose only cipher hash/reference/status. Sensitive-looking paths
  remain PRIVACY_BLOCKED. Capture does not send or authorize the request.

The optional private sink is prepared before the original Node guard. Runtime
rejection uses only local FS/crypto; it does not spawn a client or Provider call.
Synthetic local integration keys are outside Git. No user credentials were read.

## Verification

Affected tests:12 policy/privacy/budget/replay checks plus3 unique real Chrome
loopback cases. Original defect reproduced; exact known icon exclusion keeps
hydration working; a new unknown icon remains rejected before dispatch and
produces protected correlation. Native Job closes/reaps and browser cleanup
passes. Earlier local test receipts remain immutable; selective repeats use
new artifact filenames. A normal disposal can label the old adapter receipt
CONTEXT_CLOSED, so success uses the pre-close observation status and absence of
a request rejection, not a fabricated null shutdown reason.

The engineering binding hashes this local work and retained evidence. It is
NOT a runnable Production binding or a new full GROUP_1 authorization.
Old v11 frozen files, approved authorization, Claim and receipts are unchanged.

## Only next action

Review `MINIMUM_OTHER_REQUEST_DIAGNOSTIC_SCOPE_NOT_AUTHORIZED.md` for a narrow
read-only observation of the missing Production request identity. It is a
scope proposal only, not an implemented/frozen production entry. A fresh
exactly bound diagnostic entry, independent owner approval/window and GO are
required before any future Production request. No full GROUP_1 retry is READY.
No automatic whitelist expansion, login, database/config change, rollback,
paid call, push, deployment or Catalog thaw is included.
