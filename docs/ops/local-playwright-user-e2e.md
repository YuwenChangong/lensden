# Disposable Local User E2E

Use this only from `C:/Temp/ogh-product-beta-development-20261013` with Windows
Docker Desktop, the pinned repository Supabase CLI, installed Chrome and OpenSSL.
No remote project link, Production environment, account, or key is required.

```powershell
node scripts/qa/run-local-user-e2e.mjs --prepare
node scripts/qa/run-local-user-e2e.mjs --run
```

Preparation creates a fresh owned project outside the repository, using ports
56320-56329 and a unique project ID. Supabase refuses port conflicts; it must
not reset or reuse another project. The 50-file historical mirror is unchanged;
five newer committed migrations are copied separately, giving 55 migrations.
All SQL executes through the exact fresh database container's Unix socket.
Reported API/database/Storage targets are required to be local. API clients use
only that newly-created target; inherited provider/database credentials are not
passed to child commands. Current Windows Docker context must use a named pipe.

Three random local actors are created through the owned instance's Auth admin
API. ADMIN uses the existing trusted `qa_grant_admin_role` function, not client
metadata. Credentials and local API keys are encrypted with the existing
CurrentUser DPAPI helper in `.local-e2e/<run-id>/state.dpapi`, with owner/SYSTEM
DACL. This directory is git-ignored. Never print it or export browser storage.

The fixture uses repository-public catalog data, not Production downloads.
Only xreal-air is published. The existing canonical catalog import helper's
local activation and hardening SQL reproduce the exact original read plan.
Legal acknowledgement rows are seeded; this is not legal-consent UI acceptance.

The canonical migrations omit `consume_forum_rate_limit`. The local fixture
therefore uses the existing R3-tested proposal SQL with fixed SHA256
`10a1848e33097a9bb79e5cb1f1107a86bac6c724b352a13948665b90559011bb`.
This is explicitly a LOCAL TEST DEPENDENCY, not a canonical migration, evidence
of Production parity, or permission to execute a proposal remotely. Its actual
quota implementation and service-only grants are retained, not replaced by an
always-allow mock. A random rate-limit salt and the freshly-generated local
service key are supplied only to the local server's in-memory bindings.

Astro uses its existing guarded `build-workers.mjs --local-config` entrypoint.
Wrangler runs the built application locally with watch/live reload disabled,
an owned temporary TLS certificate and no remote mode. Its outbound transport
reuses the existing hop-by-hop header/body adapter and rejects nonlocal targets.
Playwright runs headless, using three isolated contexts and loopback-only HTTP
routing. This is not a full-browser security-containment claim.

CAPTCHA is off only in this disposable configuration; no Production CAPTCHA
claim is possible. Moderation uses the application's existing `local_only_safe`
fallback, with no paid provider. External AI moderation is not accepted by this
test. RLS assertions use real anon/authenticated credentials, never service-role
HTTP queries. The frozen original 16-read validator is imported unchanged;
the current local adapter normalizes textual PostgREST hints only on401/403
SQLSTATE42501 denials. Status, exact relation/message and payload-shape checks
remain enforced. This is not a change to a frozen Production contract.

`--run` writes scoped safe results under `output/playwright/local-supabase-e2e`.
Tests can PASS, FAIL, BLOCKED or NOT_RUN. A missing local dependency does not
authorize changing Production, granting database access, or faking success.
Screenshots contain blank anonymous forms or synthetic local fixtures, not
real user credentials. Browser/context storage, HAR and raw auth traces are not
exported. Secret-value checks precede the final report write.

Cleanup stops only the exact owned project with `--no-backup`, verifies no owned
containers/volumes remain, and deletes encrypted identities and temporary TLS
keys. Source scripts and nonsecret generated config/migration mirror remain
reusable. After an interrupted process, clean the owned instance explicitly:

```powershell
node scripts/qa/run-local-user-e2e.mjs --cleanup
```

Development-only `OGH_E2E_REUSE_RUN=<same-task-run-id>` and `OGH_E2E_ONLY=<ids>`
support bounded followups. Every reused result retains its actual evidence run;
reuse is appropriate only when application source, relevant schema and fixture
semantics are unchanged. Never use those switches to imply a fresh full run.
No old Native QA authorization, Claim, control window or GO is used.

## Remaining Local UI and Media Scope

Reports P1-only mode uses the same runner and local lifecycle:

```powershell
node scripts/qa/run-local-user-e2e.mjs --prepare
$env:OGH_E2E_FINAL_SCOPE='1'
$env:OGH_E2E_FINAL_FOLLOWUP='reports'
node scripts/qa/run-local-user-e2e.mjs --run
Remove-Item Env:OGH_E2E_FINAL_SCOPE
Remove-Item Env:OGH_E2E_FINAL_FOLLOWUP
```

Only4 real session/context prerequisites and11 affected reports checks, not
Auth13/business23/RLS16. Real reporter API creates one disposable record;
admin review/dismiss actions and resolver/status are checked against owned SQL.
Idle measurement retains the earlier1200ms contract and records elapsed time
and actual list-request deltas. Initial Auth callbacks may start up to2 loads;
that does not permit ongoing idle requests. There is no new poller or retry.
The independent request listener counts even intercepted/aborted local fixtures;
the12-read phase guard is not the basis of idle PASS (all latest denials0).
Real reload, filter supersession, explicit503 UI/recovery, unmount, three widths
and genuine cross-tab signout/login/role recheck remain distinct evidence.

`OGH_E2E_ONLY` can select named affected checks for a bounded followup; retain
`REPORTS_REAL_LOCAL_FIXTURE` when a report is needed. NOT_RUN checks do not
invalidate applicable previous results. Role recheck intentionally logs B into
the ADMIN test Profile only after signing ADMIN out; other A/B contexts must
remain unchanged. No raw Session/token export, HAR, cookies or R2 config read.
Historical failures remain in their original run directories. Latest reports
loop closure is not a claim that the separately observed ordinary-page500 is
resolved; see `REPORTS_P1_REVIEW_SAFE.md`.

```powershell
node scripts/qa/run-local-user-e2e.mjs --prepare
$env:OGH_E2E_FINAL_SCOPE='1'
node scripts/qa/run-local-user-e2e.mjs --run
Remove-Item Env:OGH_E2E_FINAL_SCOPE
```

Uses the existing disposable loopback lifecycle and real built Astro application,
not a new platform. Necessary three UI logins/context isolation are prerequisites;
Auth13, Catalog16 and previous business/comment matrices are not rerun. Generates
a small synthetic VP8 video in memory, tries the actual composer, and independently
checks anonymous/authenticated core resources and keyboard/form behavior.
`OGH_E2E_FINAL_FOLLOWUP=1` selects the video dependency and authenticated matrix
only; it is a separate bounded receipt, not a full rerun or automatic retry.
`OGH_E2E_FINAL_FOLLOWUP=ui` skips video and earlier passing anonymous/form checks.
It tests9 authenticated routes separately, notification loading/real empty state/
explicit local503 UI handling, and Feed/product/circle content at1440/390/430.
No Auth13, business23 or RLS16 rerun;4 session/context prerequisites are required.

Authenticated resource checks wait for actual client-load hydration and the
expected local API response, then observe a bounded1200ms rather than requiring
networkidle for stateful dashboards. Each exact local list endpoint permits at
most12 GETs in that route observation; subsequent attempts are locally aborted
and fail the check. This is a local test safety bound, not a production policy.
Attempt counters include blocked attempts; they are not server-dispatch counts.
Deliberately injected notification503 is labeled a fixture, not a backend defect.
No raw URLs/console messages/session snapshots are saved.

Current runner has NO authorized real R2 target mode: process/provider credentials
are not inherited into the local app, and external requests are denied. A video
ticket500 or missing local dependency is BLOCKED, not real R2 failure/PASS.
Playback/Range/deletion require an actual upload; no fake signing or success
responses are supplied. Images/thumbnails still use real local Supabase Storage.

Scoped per-run GROUP1 arrays are not the cumulative ledger. Preserve prior
applicable10/14 and16/16 local RLS evidence; partial UI checks do not close the
remaining Production CAPTCHA/country/media/accessibility/resource requirements.
See `ISOLATED_R2_REVIEW_SAFE.md` and `docs/r2-media-cleanup.md` for current blocked
prerequisites, honest result scopes and minimal manual isolated-bucket setup.

## Targeted Thumbnail Cleanup

```powershell
node scripts/test-media-cleanup.mjs
node scripts/test-forum-posts-authorization.mjs
node scripts/qa/run-local-user-e2e.mjs --prepare
$env:OGH_E2E_THUMBNAIL='1'
node scripts/qa/run-local-user-e2e.mjs --run
Remove-Item Env:OGH_E2E_THUMBNAIL
```

Same disposable local lifecycle; only necessary real UI logins, image uploads,
original/thumbnail decode, owner/admin deletion, shared-reference preservation,
actual Storage/database assertions, partial failure/retry and affected RLS checks.
`OGH_E2E_THUMBNAIL_FOLLOWUP=1` narrows to owner deletion/comments; `delete`
narrows to the real upload, owner UI delete and idempotent repeat only. These
are scoped independent receipts, not implicit retries or a full historical rerun.

Only this mode's local outbound fixture can deliberately return503 for a
thumbnail DELETE to its exact owned loopback Storage API. It never fakes a
successful deletion, never contacts R2 and always restores the fault switch.
The normal owner UI test captures its actual local DELETE response with standard
Playwright route.fetch/fulfill before the UI immediately navigates; original
response is preserved, redirects/retries disabled, credentials stay in memory.
Comments are client:visible: the loading test actually scrolls them into view,
holds a real local request, then releases its real backend response.

No Auth13/Catalog16/comment19 rerun. See `THUMBNAIL_CLEANUP_REVIEW_SAFE.md` and
the associated summary for scoped outcomes and still-blocked real R2 integration.

## Forum Business Continuation

```powershell
node scripts/qa/run-local-user-e2e.mjs --prepare
$env:OGH_E2E_CONTINUATION='1'
node scripts/qa/run-local-user-e2e.mjs --run
Remove-Item Env:OGH_E2E_CONTINUATION
```

Reuses the same local-only lifecycle and real built application. Executes
nonmail negative Auth inputs, admin read/denial, reports/moderation, circle
delete/restore, notification read isolation, locale/navigation and actual local
Supabase image upload/display/deletion. Necessary UI logins are prerequisites,
not a rerun of Auth13, Catalog16 or comment19. No Production CAPTCHA, actual
expired recovery token, real R2/video or external moderation PASS is implied.

`OGH_E2E_CONTINUATION_FOLLOWUP=1` narrows to failed-password/circle/media
investigation; `media` runs the media lifecycle and A/B forbidden admin UI only.
These are bounded separate receipts, not automatic retries or a passing full
suite. Media cleanup records only aggregate counts/booleans, never object paths,
tokens or raw response errors. The outer runner always destroys its exact owned
database and credentials even when a test fails. See the scoped continuation
review for the latest actual thumbnail-cleanup failure and cumulative evidence.
Per-run legacy GROUP1 summaries are not a cumulative evidence ledger: tests
omitted by a scoped mode cannot invalidate prior applicable evidence. The review
explicitly maps reused and new outcomes without rewriting old receipts.

## Targeted Comment Deletion and Continuation

```powershell
node scripts/qa/run-local-user-e2e.mjs --prepare
$env:OGH_E2E_COMMENT_DELETE='1'
node scripts/qa/run-local-user-e2e.mjs --run
Remove-Item Env:OGH_E2E_COMMENT_DELETE
```

Uses the same isolated bootstrap and real built application. Tests parent
deletion, nested placeholders, raw-body RLS/privacy, administrator UI deletion,
forged-role denial, failure feedback, mobile390/430 and reaction regression.
Only necessary real logins acquire sessions; Auth13 and Catalog16 are not rerun.
The sanitized ancestry migration must be included in the local migration replay;
the initial54-migration test applied it only to its exact owned container.

`OGH_E2E_DELETE_FOLLOWUP=1` runs tree dependencies plus notification delivery,
Feed sort order and signed-in public product data continuation. `2` narrows that
followup to tree/notification; `normal` verifies only normal multi-level DOM
tree visibility. Results are independent scoped receipts, not a full suite
rerun. Fresh runs use55 committed migrations. See `COMMENT_DELETE_REVIEW_SAFE.md`
for historical assertion failures and their bounded followup evidence.

## Targeted Comment Regression

Reuse the same local lifecycle, application build and browser setup:

```powershell
node scripts/qa/run-local-user-e2e.mjs --prepare
$env:OGH_E2E_COMMENT_REGRESSION='1'
node scripts/qa/run-local-user-e2e.mjs --run
Remove-Item Env:OGH_E2E_COMMENT_REGRESSION
node --test scripts/qa/local-rls-assertions.test.mjs
```

This mode runs only necessary UI logins, comment/reply/reaction/delete checks,
three private-row checks and the two affected anonymous read assertions.
It does not rerun the full positive Auth13 or historical page matrix. The
reaction migration must already be committed for fresh `--prepare` replay.
During the initial P1 proof only, the owned pre-fix database received the exact
new migration after reproducing500; later fresh databases replay it normally.

`OGH_E2E_COMMENT_FOLLOWUP=1` narrows that mode to the documented delete followup
and its necessary fixture creation. This is not a full regression or automatic
evidence reuse. Original runner results remain immutable. See the scoped
comment review for the two historical application failures; the later deletion
repair review records their closure. The retained reaction runner's staff button
locator follows the new distinct moderator label. Do not suppress failures or
interpret successful cleanup as a passing business suite.

CLI lifecycle reference: [Supabase local development](https://supabase.com/docs/guides/local-development/cli/getting-started).
