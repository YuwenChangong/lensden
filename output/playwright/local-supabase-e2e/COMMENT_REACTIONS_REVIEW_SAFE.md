# Comment Reaction Local Regression Review

2026-10-15. LOCAL only; no Production parity or release authorization.

## Repair and Evidence

The comments API correctly requests public comment reaction counts and a
viewer-specific liked flag. July migrations intentionally restrict SELECT to
published comment/post/visible-circle ancestry and mutations to auth.uid().
September privilege convergence revoked all relevant table grants, so RLS was
never reached. This is an ACL/migration-contract conflict, not a missing RLS
predicate or permission to query private data.

New migration `20261015072723_restore_comment_reaction_application_privileges.sql`
restores SELECT(comment_id,user_id) for anon; SELECT(id,comment_id,user_id,
reaction_type), INSERT(comment_id,user_id,reaction_type), DELETE for authenticated.
No UPDATE or service-role access, no anonymous writes, no policy modifications.
Public reactor IDs were already within the explicit SELECT policy's intended
scope; the application returns counts/self flags rather than raw reaction rows.

Run `4889c238ecf0`: the same API initially returned500 with the exact table
permission error, then returned200 after the migration. RLS policy snapshots
are identical. UI replies/likes/unlikes and backend rows passed. Initial
cross-delete test incorrectly used comment_id query instead of the API's id;
its400 failure remains in the original receipt, not relabeled a security FAIL.

Run `fb175138cd78`: fresh54-migration replay, corrected cross-delete request403
with unchanged row, extra public aggregate/private-circle checks, and bounded
soft-delete/admin followup. No full Auth13, old browser diagnostics or historical
Production suites rerun. Independent authentication was necessary to acquire
real local sessions for the targeted tests.

Latest unique Chrome assertions:35 PASS,2 FAIL (37 total). Local RLS assertion
unit checks9/9 PASS. RLS reads:2 newly executed42501 denials plus14 unaffected
historical PASS =16/16 LOCAL; not16 fresh reads, nor16 authenticated reads.
Additional private-row isolation remains3/3. GROUP_1 local original-case
coverage rises6 to7/14 through RLS-01 only; shell checks are not promoted.

## Remaining Confirmed Application Bugs

1. Deleted-parent thread disappears for B. After A creates a comment, A/B
   reply, and A soft-deletes the parent through the UI, B's GET200 returns B's
   published reply but not its deleted parent. The reply remains published in
   the database, yet is absent from the fresh browser DOM. Public comment RLS
   requires published parents except author/post-owner/staff branches, while
   CommentsSection renders replies only under returned parents. Deleted comment
   reactions are correctly hidden. No data loss or reaction permission leak.
   Sources: `supabase/migrations/20260713_comment_read_circle_visibility_authorization.sql`,
   `src/pages/api/forum/comments.ts:419`, `src/components/forum/CommentsSection.tsx:351`.
   Candidate next fix: preserve public reply-tree placeholders without exposing
   deleted bodies or private ancestry; requires a separately reviewed policy/API
   change, not an unconditional deleted-comment SELECT grant.
2. ADMIN comment-delete action absent. Real admin profile verified; GET200
   returns can_delete=false for another author's comment. The ADMIN DELETE API
   returns200 and the row becomes deleted. GET initializes myUserId from the
   already verified viewerUserId, then only looks up role under token &&
   !myUserId, leaving myRole null for a valid session.
   Source: `src/pages/api/forum/comments.ts:476`. Candidate minimum fix:
   independently load the verified viewer role before computing can_delete.
   Do not widen the server mutation policy. UI remains FAIL, not API-only PASS.

No business implementation changes made to these two newly found defects.
Post owner deletion PASSED through the real alertdialog and exact DB status.
Post/comment content editing has no inspected owner UI/update endpoint;
BLOCKED/feature gap, not a simulated edit PASS. Circle edit's previous evidence
is reused. R2 media remains BLOCKED; no paid resources created.

Selected prior business scope:10 prior PASS + completed reply + owner delete
=12 PASS; two newly found FAIL; edit/media2 BLOCKED. This is not comprehensive
forum acceptance: Feed ranking, notification delivery, all media/accessibility,
negative Auth/CAPTCHA and other original cases remain unaccepted.

## Security and Cleanup

Authenticated reactions reject forged users, cross-user deletion returns no
rows, UPDATE is42501, anonymous insert is42501. Hidden/pending/deleted and
hidden-post reactions return no rows. Reserved private/test-circle reactions
are denied to anon/A/B/ADMIN including attempted self insertion. No service-role
HTTP queries are counted as RLS evidence. Owner container SQL only seeds/asserts
local fixtures, while all security assertions use actual user/anon HTTP clients.

Both runs' sensitive-value checks PASS. Browser/Worker shutdown awaited, owned
containers and volumes absent, DPAPI identities/pointer and temporary TLS keys
deleted; loopback4328/56321/56322 no longer listening. Reusable config retained.
No Production request/Auth/write/deploy/push, no old authorization reuse, no
Catalog thaw. Production parity UNKNOWN; migration is committed locally only.
The existing local-only rate-limit dependency does not establish remote parity.

Official permission reference: [Supabase Postgres roles](https://supabase.com/docs/guides/database/postgres/roles).
