# Local Supabase / Playwright Execution Review

Date: 2026-10-15. Local acceptance only, not Production acceptance or release GO.

## Actual Results

- A/B/ADMIN real UI login, Node identity validation, page reload persistence,
  three-context identity separation and UI logout: 13/13 assertions PASS in
  the final bounded followup `196ab48ea0aa`.
- Original 16 reads: 14 PASS, 2 FAIL against the unchanged frozen response
  validator. The two failures returned HTTP401, PostgreSQL42501, no row array,
  permission-denied classification, empty details and a nonempty hint.
  Actual access was denied; strict old payload/hint requirements were not met.
  Do NOT erase these failures or call the frozen suite 16/16 PASS.
- Original plan contains 6 anonymous reads and 10 authenticated A/B reads,
  not 16 authenticated reads. Supplemental actual private-row checks passed:
  A sees own legal acknowledgement but not B's, B sees own but not A's;
  anonymous selection is denied with42501. Service-role reads are not used.
- Real UI/database assertions PASS: post creation, comment submission, post
  like, circle creation/edit, reporting, administrator hide and notification
  page/API read. Notification delivery across users is NOT proven.
- B's actual attempt to delete A's post returns403 and leaves the row unchanged.
- Feed shells/sort URLs, public product page and seven admin shells rendered;
  shell render does not prove ranking, full data correctness or all admin APIs.
- Desktop login and390/430px login/real authenticated Feed overflow checks PASS.
  Full media/focus/accessibility acceptance remains incomplete.
- Built application follows the real Privacy link successfully without Vite
  reload; no production code was changed to hide the development reload issue.

## Confirmed Local Repository Defect

Reproduction: create a published local post and comment, login as an ordinary
actor, then open the discussion or GET `/api/forum/comments?post_id=<owned-id>`.
Actual result: HTTP500, `permission denied for table comment_reactions`.

`src/pages/api/forum/comments.ts:450` unconditionally selects comment reaction
counts. `supabase/migrations/20260904054013_forward_reconcile_security_privileges.sql:43`
revokes select/insert/update/delete on that relation from anon, authenticated
and service_role. RLS policy existence does not supply the missing table grant.
The API's reaction-query error branch returns500, preventing comments/replies
from loading. This is a current-source local reproduction, NOT confirmation of
current Production ACL or a license to broaden it. No business code or grant
was changed. Review the intended authorization/grant contract before a fix.

## Remaining Gaps and Harness Limitations

- Reply cannot proceed because the actual comment-read endpoint fails above.
- Owner deletion did not complete. The test initially used role `dialog` while
  the real confirmation component uses `alertdialog`; the locator is corrected
  in source, but that correction has NOT been rerun and is NOT a deletion PASS.
- Post editing was not exercised; no owner edit entry was identified in the
  inspected forum components. This is an untested feature gap, not proof of a
  Production defect.
- Image/video upload/playback lacks local R2 signing/media configuration and
  remains BLOCKED. Local Supabase Storage existing alone is insufficient proof
  that the application's configured R2 workflow can execute.
- Production CAPTCHA, country resolution, failed-login/recovery cases, complete
  admin API coverage, sort correctness, notification delivery and comprehensive
  media/accessibility/error-state checks are not accepted by this evidence.

## Evidence Continuity

- `48d9fa1e5230`: initial fixture-type error, 14 read assertions passed; not a
  complete browser run. Error fixed only in local fixture SQL.
- `3a1507307390`: first full browser execution; missing local salt/RPC and test
  logout-name mismatch. Anonymous read evidence and unaffected page/layout/link
  results reused explicitly, not relabeled as newly executed.
- `f89e861ef1f0`: targeted local configuration followup; useful independent
  business assertions and logout passed, creation remained blocked by absent RPC.
- `196ab48ea0aa`: actual creation/comment/hide assertions passed after the exact
  local RPC dependency and existing outbound adapter were supplied. A response
  waiter rejection interrupted the run during owner-delete testing. Its already
  completed assertions are independently transcribed in
  `PARTIAL_EXECUTION_SUPPLEMENT_SAFE.json`, clearly NOT a runtime receipt.
- The bounded reply/delete followup used the still-owned instance, imported
  unchanged earlier evidence where relevant, and produced `RESULTS_SAFE.json`
  plus verified `CLEANUP_SAFE.json`. A response-waiter rejection handler prevents
  that harness failure from terminating later tests. No old receipt was edited.

For the original14-case scope, only AUTH-02/03/04, RLS-02/03/05 have sufficiently
complete LOCAL evidence here: 6/14. The runner's 8 local analogues include product
and admin shell checks; those are useful partial observations, not full closure
of RLS-04 or ADMIN-04. This review deliberately does not promote them. No original
Production GROUP_1 case is newly accepted by this local run.

## Cleanup and Next Action

All owned database containers/volumes, test users/rows, browser contexts, Worker,
DPAPI identities and temporary TLS keys were cleaned. Retained source/config is
local-only. The environment can be recreated with the two documented commands.
No Production Auth/GET/write/deploy, paid provider, push or Catalog thaw occurred.

Minimum next action: review the comment API / comment_reactions privilege
mismatch and approve a minimal source fix if appropriate. Do not automatically
change production RLS, grants or deploy anything. Public Beta remains NOT_AUTHORIZED.
