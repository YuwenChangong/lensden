# Comment Delete Fixes - Local Evidence Review

2026-10-15. Scoped LOCAL evidence, not Production acceptance or deployment GO.

## Product and Security Contract

The supplied P1 review and actual comments endpoint confirm both defects.
`docs/forum-phase2-rls-test-matrix.md` explicitly permits moderator/admin comment
delete; existing DELETE validates auth.getUser, public.profiles.role and RLS.
`docs/forum-admin-mvp.md` confirms server-derived staff authorization.
Existing UI strings promise deleted placeholders with replies; the owner's
current requirements explicitly preserve authorized descendants and redact
deleted content. No new administrator mutation permission is needed or granted.

No independent Forum MVP editing PRD was found. The early general
`PRD-OpenGlass-Hub-MVP.md` excludes the whole forum/auth/database; later forum
implementation, comments validation/admin notes and current owner instructions
establish the current comment scope. They do not establish a mandatory owner
post/comment content editor. EDIT_FEATURE_PRD_STATUS=UNKNOWN, not OUT_OF_SCOPE
by inference. No unapproved editor built. R2 media remains BLOCKED.

## Minimal Repair

Raw deleted rows remain protected by unchanged comment RLS. New migration
`20261015074931_safe_deleted_comment_placeholders.sql` adds an explicitly
sanitized ancestry lookup using a fixed-namespace privileged function. This
does not authorize deleted-body SELECT: output contains ONLY id/post_id/
parent_id/created_at/updated_at, with no author/body/media. Public published
seed comments, published parent post and canonical-public active circle are
rechecked inside the function. Arbitrary supplied IDs cannot bypass that check.
It accepts1..1000 IDs, walks at most32 ancestor levels with cycle checks,
returns at most1000 metadata rows, and revokes PUBLIC/service-role execution.
Anon/authenticated execute grants expose this limited public projection only.
This is a deliberately reviewed derivative-data interface, not a service-role
API workaround, whole-row grant, RLS disable or broad new private-data access.

GET uses one read-only projection call, not N+1 queries; redacts deleted body
and author, retains parent IDs and stable creation order. UI no longer promotes
every deleted intermediate node to a root. Returned data and cycle guards bound
the render path. The final source removes an arbitrary32-level UI cutoff so
32 projected ancestors do not themselves suppress a legitimate visible leaf;
the SQL bound remains unchanged. Actual browser coverage is3/4 levels, not an
exhaustive proof of arbitrarily deep or large discussions.

Viewer role now comes from the already verified identity's database profile.
`delete_as_staff` differentiates existing moderator/admin removal from author
Delete. Confirmation, failure feedback and success status use existing glass UI;
forged frontend roles do not affect backend authorization. Immediate deleted
state clears body/author rather than merely hiding their markup.

## Actual Execution

- `91bb82f2e6bf`: built application + actual A/B/ADMIN sessions. Parent redaction,
  B/anon reply visibility, raw-body RLS, private/cross-post/oversize projection
  refusals, staff deletion, forged-role403, UI failure feedback, mobile390/430,
  reactions and four-level UI reply passed. Two normal/nested DOM assertions
  failed; originals retained. Its initial owned54-migration DB received only
  the new exact migration locally; no shared database changed.
- `8fabb7f99a1e`: fresh55 migrations. Feed latest/hot order and actual signed-in
  public product data passed. DOM checks and notification assumption still
  failed. No false whole-run PASS; no old receipt changes.
- `80445973a09e`: nested ancestry and real reply notification delivery passed
  after correcting descendant scoping and the notification payload assumption.
  API exposes safe preview/href, not raw comment_id. Normal DOM count still
  raced initial React re-render; failure retained.
- `e3413471ee47`: only normal tree plus necessary session prerequisites executed.
  One atomic browser snapshot waits for all4 nodes and verifies parent nesting
  together, instead of separate wait/count calls across an initial re-render.
  A/B/anonymous three-level normal tree passed.

Latest unique scoped assertions19/19 PASS, not the sum of repeated prerequisites.
Three affected existing scripts passed: comment read circle visibility, reaction
visibility authorization and creation circle authorization. Guarded local build
passed, including final UI cycle-bound edit. Existing Markdown/:global warnings
are not newly confirmed functional defects. The final bound-only edit does not
alter the3/4-level browser cases, whose applicable evidence is reused.
390/430px screenshots inspected: existing glass confirmation, distinct moderator
copy, visible buttons, no horizontal overflow; real deletions updated DB status.

Notification continuation proves B's UI-created reply produced a database row
for A and appeared in A's API and actual notification page. Feed continuation
uses newest and separately hot fixtures: expected first row equals API first
post equals actual first DOM card, for both sort modes. It is not merely a
successful page shell or URL change.

Signed-in public product detail matches the published device DB name to real
page h1/content; source uses the anonymous SSR client. LOCAL RLS-04 now has
data-level runtime evidence, raising original-case local coverage7 to8/14.
Historical Auth13 and Catalog16 retained, not repeated. No Production case PASS.

## Remaining Scope and Cleanup

Remaining original cases: AUTH-01 requires real Production CAPTCHA; AUTH-08
bounded negative/recovery paths are partially locally executable but not complete;
ADMIN-04 broader read API/denial matrix remains incomplete; UI-01 country trust
cannot be promoted from local preference checks; UI-02 media/full accessibility
incomplete; UI-03 complete console/CSP/error/loading/link evidence incomplete.
No new full GROUP_1 authorization or QA executor was created.

Selected business ledger: prior12 PASS, repaired thread + administrator action2,
new notification delivery + Feed ordering2 =16 PASS,0 FAIL,2 BLOCKED (editing
contract and R2 media). This does not imply comprehensive forum acceptance.
No remaining confirmed comment bug in this scope; untested features are not PASS.

All4 owned databases/volumes/users/rows removed, CurrentUser DPAPI identities
and pointer deleted, TLS files deleted, browser/Worker shutdown awaited and
local application/database listeners absent. Reusable nonsecret configs kept.
No Production request/Auth/write, third-party live request, deployment, push,
paid service or Catalog thaw. Production parity UNKNOWN; migration local only.
Existing local rate-limit fixture remains a disclosed environment dependency.

Permission design reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
