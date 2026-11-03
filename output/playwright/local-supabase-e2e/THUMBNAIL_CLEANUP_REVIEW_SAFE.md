# Thumbnail Cleanup P1 Local Repair

Owner-authorized LOCAL product repair, base13f30322. No Production execution,
database migration, deployment, old authorization reuse or external media access.
This is scoped evidence; PUBLIC_BETA_CURRENT_STATE.md remains the only baseline.

## Proven Cause and Classification

The immutable prior run4b4666800249 recorded actual Storage metadata:
original0, thumbnail1, media rows0 after DELETE200/cleanup.ok=true. Thus A is
proven (object not deleted), not B (record remained) or merely C (browser cache).
D applies to incomplete cleanup being reported complete, but not because a
thumbnail deletion request failed: no such request was ever made. All three
delete callers selected no thumbnail_url; the shared helper handled one object
and then removed the row containing the missing key.

Current CreatePostForm really generates a separate thumbnail, uploads both via
local Supabase TUS and links both keys. This is not evidence of a real R2 orphan.
R2 was not configured/contacted in the reproducer or this repair.

## Minimal Product Changes

- Author/admin post DELETE and admin media DELETE select thumbnail_url/user_id/
  post_id along with previous fields.
- Shared helper processes deduplicated original and thumbnail. Both must be
  canonical keys bound to the media's owner/post; temporary R2 keys retain their
  existing adapter. Unknown/legacy-unbound keys fail closed, not guessed deletion.
  The R2 transport adapter and provider credentials/configuration are unchanged.
- Exact RLS-visible references outside the deletion batch prevent deletion of
  shared objects; status retained_shared and warning explain deliberate retention.
  The current upload/delivery contract does not authorize arbitrary cross-post
  sharing. This is not a global reference-lock or all-legacy-data compatibility
  claim; unsupported ownership remains a reported failure, not permission to
  destroy another object's key.
- Managed-object failure or uncertainty sets cleanup.ok=false. An empty Storage
  removal result is not accepted without an object-info missing response. Only
  completed media rows are removed; failed rows preserve keys for explicit retry.
  Unacknowledged row deletion is also reported incomplete.
- Owner DELETE may explicitly resolve an already-deleted target for retry, still
  requiring actor/staff ownership, legal consent, safety and active/public-circle
  checks. Default read/moderation behavior for deleted posts stays denied.

No RLS/grant/role change, service-role cleanup, asynchronous queue, automatic
retry, restored publication, UI hiding workaround or new proxy architecture.

## Contract Semantics

Top-level HTTP200/ok=true/status=deleted still means post soft deletion succeeded.
cleanup.ok is separate: required managed-object/reference cleanup completed.
Partial failure keeps top-level success, nested false and errors, as before.
Statuses deleted/already_missing/retained_shared/skipped/failed distinguish
completed, known missing, intentional retention and unsuccessful operations.
External unmanaged links retain old skipped/DB-only semantics; no claim to
delete third-party objects. Unknown managed state cannot yield complete cleanup.

Storage acknowledgement plus independent real local Storage/database and fresh
delivery checks support the observed outcome. No global CDN/browser cache purge,
physical disk secure-erasure or real R2 completion guarantee is asserted.
Supabase's documented remove requires SELECT and DELETE permissions; no grants
were widened: [Storage remove](https://supabase.com/docs/reference/javascript/storage-from-remove),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
The installed SDK implements object info; both behavior and actual local absence
are tested, not assumed from an HTTP200 alone. Changelog markdown fetch was
unavailable through the documentation reader; no package/CLI upgrade was made.

## Targeted Evidence

- test-media-cleanup.mjs:22/22 deterministic cases PASS. Real in-memory object
  deletion, deduplication, shared retention, foreign key rejection, partial
  thumbnail failure/explicit retry, uncertain delete, lookup/network/row failure,
  unknown storage and mocked R2 success/404/failure. R2 fixtures are NOT live R2.
  Source assertions cover all3 caller SELECTs; structured missing is distinguished
  from403 whose message merely contains "not found".
- test-forum-posts-authorization.mjs:PASS, including default deleted-target denial,
  explicit retry and unchanged deleted/QA-circle rejection. Existing missing
  cloudflare:workers test harness was repaired using the shared plugin; initial
  harness failure is not a product permission failure.

| Real Chrome run | Raw scoped result | Cleanup |
| --- | --- | --- |
| c0e21a8b53a6 | 15 PASS/2 FAIL | PASS |
| abc372c406e3 | 9 PASS/1 FAIL | PASS |
| 4be87124e2d9 | 7 PASS | PASS |

Latest unique17/17 PASS, including4 necessary session/context prerequisites.
Earlier failures/receipts remain unchanged. Comments are client:visible and
required actual scroll before waiting for the real loading request; that scope
then PASS. Early UI delete failures lacked a precise retained error category;
do not invent a historical protocol code. The real UI immediately navigates to
Feed, so final local test captures the upstream response before forwarding it
unchanged through Playwright route.fetch/fulfill, no redirects/retries. No fake
successful response or application navigation change.

Proven actual runtime outcomes:

- Real composer upload creates original+thumbnail; both variants decode.
- Actual owner UI DELETE200, cleanup.ok=true,2 object results,1 row removed;
  database original0/thumbnail0/media rows0. Explicit repeat200, no further effects.
- Fresh anonymous post, media, thumb and comments requests404 after deletion,
  bypassing browser cache; not a Production CDN cache assertion.
  The old raw fixture field physicalObjectsAbsent refers to its Storage metadata/
  API checks, not secure backing-disk erasure; future script field names say so.
- Injected local thumbnail Storage503: top-level post deleted, cleanup.ok=false,
  original0/thumbnail1/row1. Explicit owner retry recognizes original missing,
  removes thumbnail and row, cleanup.ok=true. No provider request or fake delete.
- ADMIN single-media delete preserves both objects when another record references
  them. Real ADMIN normal media delete removes both; subsequent admin post delete
  remains successful with no objects left.
- B cannot delete A via author/admin API or direct ordinary-auth Storage/row
  operations; actual objects/row unchanged. A/B private reads own1/other0 use
  ordinary authenticated Sessions, not service role. Comment read/loading and
  other-author DELETE403 preserve existing boundaries.
- Real image layout/overflow PASS at390/430; screenshots inspected. No complete
  accessibility or full UI-02 PASS inferred.

Original Auth13/comment19/Catalog16 evidence reused, not rerun. Selected cumulative
business23 PASS/0 FAIL/1 BLOCKED/1 DEFERRED; thumbnail lifecycle replaces the one
old FAIL with PASS, security/retry checks are not inflated into new business cases.
Original GROUP1 remains10/14 LOCAL. AUTH-01 needs Production CAPTCHA; UI-01 lacks
trusted Provider-country proof; UI-02 full media/accessibility incomplete; UI-03
adds real loading evidence but complete console/CSP classification is incomplete.
Editors stay DEFERRED_PUBLIC_BETA, not PASS. No unrelated confirmed app bug added.

## Minimal Remaining R2 Integration Scope (Not Executed)

Prefer an already existing dedicated QA bucket and isolated media endpoint in the
existing Free account, bucket-scoped read/write credentials protected locally,
no Production key/bucket. If no such isolated target exists, owner must separately
approve its setup within existing Free resources; no automatic creation/purchase.
Do not reuse the Production R2 base URL. Local Supabase/actors remain disposable.

Future explicitly approved scope: at most2 small synthetic objects (image and
valid MP4; at most1MiB each), at most12 total R2 object requests, e.g. PUT2,
HEAD2, GET/Range4, DELETE2, absence HEAD2. Count every attempt, no automatic retry;
reserve cleanup before work. Actual backend signing, video playback/Range and
post-delete absence must be observed, not simulated. If ordinary browser/player
requests would exceed that bound, stop or obtain an explicit revised scope first.
Only the dedicated approved endpoint/prefix may be added to that future local
outbound configuration. This task makes no such network change or authorization.

Existing Free-service evidence is reused, not re-audited here. Future setup must
establish the isolated target, remaining free allowance and no additional network/
service charge risk before execution. Missing isolation, credentials, media
endpoint or zero-cost assurance means BLOCKED. Current REAL_R2_INTEGRATION=BLOCKED.
No standalone complex authorization executor is needed or prepared.

## Cleanup and Release

All three exact owned projects/containers/volumes, users/data/media, DPAPI state,
TLS keys and browser/worker processes cleaned; receipts PASS. Final container
inventory empty and active state pointer absent. Reusable configuration/scripts
retained. Production requests/writes/deployments0; no push; Catalog ACTIVE,
USD0, Public Beta NOT_AUTHORIZED. Production parity UNKNOWN: these local fixes
are not deployed and the existing local rate-limit proposal fixture remains.
