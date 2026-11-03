# Forum MVP Scope and Local Continuation Review

Scope: owner-approved local E2E and product-scope decision, based on482e7f86.
This is scoped evidence, not a second project baseline, Production acceptance or
permission to deploy. Only QA scripts/docs changed. No application/schema fix.

## Editing Decision

No distinct authoritative Forum MVP PRD was found in the reviewed repository.
`PRD-OpenGlass-Hub-MVP.md` v1.1 Draft describes the earlier static site and
explicitly excludes forum/Auth/database. It cannot be represented as a current
forum editor requirement. Later `docs/forum-admin-mvp.md` defines moderation,
`docs/forum-phase4b-comments-mvp-validation.md` documents comments, and
`docs/forum-phase2-rls-test-matrix.md` permits own-row updates. None requires
published post/comment content editing UI before first Public Beta.

Current owner decision therefore applies: DEFERRED_PUBLIC_BETA, NOT PASS.
No editor feature code, PRD rewrite or permission removal. Circle management and
administrator moderation are existing separate capabilities, not author editing.

## Actual Runs

| Run | Scope | Raw outcome | Cleanup |
| --- | --- | --- | --- |
| d4a4ea23aa5a | initial continuation | 37 PASS/3 FAIL/2 BLOCKED | PASS |
| 97b0f4713f7c | wrong password, circle navigation, media | 6 PASS/1 FAIL | PASS |
| 4b4666800249 | A/B admin forbidden UI, exact media evidence | 6 PASS/1 FAIL | PASS |

Each run includes4 necessary real UI login/context checks. All use disposable
local Auth/DB/Storage and real built Astro with headless Chrome,55 migrations.
Raw receipts are unchanged. Latest unique assertions:41 PASS/1 FAIL/2 BLOCKED,
44 total, not49 concatenated passes. Historical Auth13/comment19/Catalog16
and private-row3/3 evidence remain applicable and were not rerun.

Two initial test defects were corrected, not application defects: GoTrue uses
`code` for invalid credentials; owner circle deletion auto-navigates, so the
test must await that navigation before issuing another. Both real followups
PASS. One followup pageerror and22/2/4 other console errors remain unclassified
counts in safe receipts. They are not evidence of whole-site console cleanliness.

## Original GROUP1 Local Mapping

Previously closed8: AUTH-02/03/04 and RLS-01/02/03/04/05, reused unchanged.
Newly closed scoped LOCAL analogues:

- AUTH-08 bounded nonmail: real wrong password400/invalid_credentials, error UI
  and no Session; invalid recovery input; provider otp_expired error-input UI;
  query sanitization; real login rejects an external next URL. Actual expired
  token verification, password recovery email and Production CAPTCHA NOT tested.
- ADMIN-04 read-only: seven ADMIN APIs200 with collection shapes, seven pages
  render; forum/users/circles display known seeded rows. Twelve A/B API403s plus
  old devices403 evidence; actual A/B devices UI refuses management and no form
  is rendered. No Catalog mutation or unauthorized operation.

Total10/14 LOCAL ONLY. Four remain BLOCKED: AUTH-01 Production CAPTCHA;
UI-01 trusted-country precedence (explicit zh/en preference does PASS);
UI-02 complete media/accessibility scope; UI-03 complete loading and console/CSP
classification. Real keyboard focus/link navigation/overflow at1440/390/430
and actual400/404/empty200 states PASS as partial evidence, not entire cases.
All three new Privacy screenshots were inspected; no overlap observed in scope.

## Business Ledger

Prior16 PASS retained. Six distinct new scenarios PASS:

1. Duplicate reports create exactly one DB row.
2. ADMIN dismisses via real UI; resolver and final status match DB.
3. Nonadmin report action403 leaves the published post unchanged.
4. Nonowner circle manage GET/PATCH403 leaves data unchanged.
5. Owner actual UI deletes/restores circle; anonymous deleted page404.
6. Actual notification read updates recipient only; forged cross-user PATCH has
   no DB effect.

Existing post-hide evidence is extended by real restore and anonymous404/200;
not counted as a seventh new scenario. Selected cumulative business22 PASS,
1 FAIL,1 BLOCKED,1 DEFERRED. This is not exhaustive forum acceptance.

## Confirmed Local Bug: Orphan Thumbnail on Post Delete

Repro: A creates an image post through the real composer, which generates and
uploads an independent thumbnail. Media link201, actual decoded image PASS.
A then deletes the owned post via the existing real DELETE API.

Final run records DELETE200, reported cleanup.ok=true, original objects0,
thumbnail objects1, media rows0, total remaining post-folder objects1. This is
a real application failure, not an HTTP-only assertion or unavailable R2 test.

Source correlation:

- `src/components/forum/CreatePostForm.tsx` uploads original and separate
  thumbnail, storing `storage_path` and `thumbnail_url`.
- `src/pages/api/forum/posts.ts` DELETE selects only id/kind/storage_path/url,
  marks the post deleted, then calls deletePostMediaObjects.
- `src/lib/server/media-cleanup.ts` PostMediaLike and deleteMediaObject handle
  one resolved path; thumbnail_url is absent. The DB media row is then deleted,
  losing the linkage while the thumbnail remains.
- `docs/forum-admin-mvp.md` requires storage cleanup and no silent success for
  media deletion. The owner delete implementation itself advertises cleanup.

Root cause of the observed thumbnail residual is source-supported. Do NOT
claim public deleted-image leakage: that delivery path was not queried after
deletion. Do NOT claim every backend or R2 path has the same result. Minimal
next owner-approved fix: include/manage canonical owned thumbnail paths using
existing storage authorization, preserve privacy/RLS, regress actual deletion
and truthful partial-cleanup reporting. No product change made in this task.

## Media and Remaining Release Gaps

Two existing media route/authorization fixture scripts PASS:
`test-media-upload-guard-authorization.mjs` and
`test-post-media-delivery-authorization.mjs`. LOCAL_MEDIA_MOCK_PASS applies only
to those fixture routes, not real R2 or full upload/playback/cleanup.
Real local Supabase image upload/display PASS; complete lifecycle FAIL as above.
No isolated R2 credentials/endpoint found; actual R2 client endpoint is hardcoded
to cloud. It was not contacted. REAL_R2_INTEGRATION remains BLOCKED, including
real R2 video playback/cleanup. No paid resource or Production fallback.

Production parity UNKNOWN: local canonical migrations omit consume_forum_rate_limit;
the already-reviewed local-only proposal fixture remains necessary. All later
local fixes/migrations are not deployed. External moderation and actual Production
Auth/CAPTCHA/remaining acceptance are not verified by these runs.

## Cleanup and Safety

Three cleanup receipts confirm exact owned databases/containers/volumes,
synthetic users/rows, DPAPI credentials and TLS keys removed; browsers/workers
closed. Final direct Docker inventory empty, active-run pointer absent.
Reusable configs/scripts retained. No Production/third-party request, write,
deployment, paid service, old authorization reuse or push. Catalog ACTIVE;
Public Beta and Production GROUP2/3 remain NOT_AUTHORIZED.
