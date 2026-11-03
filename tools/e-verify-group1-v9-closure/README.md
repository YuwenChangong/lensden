# GROUP_1 v9 offline closure

Engineering-only candidate, not a Production entry, approval Packet, Claim or GO.
Original frozen files, private inputs and consumed authorizations are unchanged.

## Evidence

`review.mjs` verifies the v9 ciphertext/plaintext receipts and nine protected files,
the frozen2005-file input set, matching pre/post Deployment identity and the
existing Build/source receipt (not an invented Deployment source-SHA field).
It reuses the23 previously reviewed assets and reviews six additions. Four new
assets have exact frozen bytes; AdminDevicesDashboard has a scoped AST match;
GlassConfirmDialog is an exact hash-pinned import-order-only review. It cannot
apply to another byte pair. The285-byte detail inline script matches the frozen
server artifact; no seventh external resource was needed. All29 literal resource
references close, but arbitrary runtime branches/Production Auth remain unverified.

## Minimal QA changes

The new browser/gate copies preserve the frozen originals. They add:

- Exact29-resource Host/GET/version/type/actor/stage admission and body SHA checks.
- Same-context/navigation/session merging of only the three already approved
  own-summary/preferences/notification GETs. Every merged browser request still
  consumes global admission. No Mutation, identity or RLS request is cached.
  Cache entries clear on navigation and accepted Session changes. Cookie/header
  validation remains; different credentials cannot share a response.
- Authenticated GET replay generations advance only after an identity-bound,
  budgeted login/refresh. Same-generation GET and all Mutation replay rules remain.
  A refresh invalidates explicit identity verification; it cannot silently restore
  Catalog/admin permission.
- A validated preference response may arm the one already allowed products-page
  reload even when it finishes on the login page. Landing no longer demands a
  reload when an already-adopted preference legitimately requires none. It still
  requires the products marker, hydration, valid preference and a quiet boundary.
- HTML structural evidence permits only finite serialized locale generation,
  provenance and source metadata changes. Code, resource URLs, other props,
  locale/preference/text and page identity remain pinned. This is not arbitrary
  HTML or inline-code admission.

## Real offline path and budget finding

`full-flow-fixture.mjs` uses the reviewed Production JS/CSS on a synthetic shell,
real Chrome, Astro/React hydration and the actual Supabase SDK. Physical HTTP goes
only to127.0.0.1; Chrome's deny proxy forwards nothing, and the unchanged Node guard
locks alternate egress before the runner starts. Accounts/tokens are synthetic;
only numeric budgets are read from the protected owner input. No raw captured
HTML is executed and no Production credentials or identities enter the fixture.

Normal execution uses the saved500 global cap and stops in the last negative
authentication initialization. Three identities,16 RLS mocks and two negative
Auth cases finish; the last negative and post-Deployment do not. That is a real
BLOCKED result, not full GROUP_1 PASS.

An explicitly counterfactual loopback-only measurement uses a local800 ceiling
to count the complete mocked flow. It does not change the saved owner500 or make
that flow Production-compatible. See `artifacts/BUDGET_CLOSURE_SAFE.json` for the
actual measured dispatch/admission counts, exact scenario gap and trace hashes.
They are not a proven Production minimum or a guarantee about Managed Turnstile,
refresh timing, logout reload scheduling or other runtime request counts.

The mandatory safety tests include wrong UUID/role, cached credential/cookie
rejection, exact assets, old/unknown resources, replay/expiry, redirects, atomic
and concurrent pre-dispatch limits, refresh restrictions and actual Chrome/Node
Job hard-deadline drain. The unchanged123/43/33/9 suites are reused, not rerun.

## Current boundary

Full GROUP_1 authorization stays BLOCKED pending an explicit owner global-budget
decision and its eventual exact refreeze. No new authorization ID/Packet/UTC/GO is
minted; source/private fields and USD0 are unchanged. The future full contract
retains14 mappings,16 RLS reads, five fresh human gates, Boundary2 residuals,
1800/1740/60-second limits and local OAuth scopes account:read/workers_scripts:write
with remaining strictly>1860 seconds before an actual new UTC approval.

Catalog remains held; GROUP_2/3 and Public Beta are not authorized. Version151 is
not a post-Hardening default recovery target. Local mock success never proves live
Auth/CAPTCHA/RLS or full E_VERIFY acceptance.
