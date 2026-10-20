# R2 Retention Final Offline Integration

Base `cde5f4f2ce2b91db8164a7c252c1ea5f03ab0d14`, isolated branch
`codex/public-beta-critical-blockers-20261020`. Owner authorized the one-claim
design and browser correction, including consumed failed/ambiguous claims.
This supersedes the earlier schema STOP for local implementation ONLY.
Historical proposals, review reports, SQL hashes and receipts remain unchanged.

## P1-A: Durable Claim Before Copy

New local migration `20261020000000_post_media_r2_copy_claims.sql` adds one table,
no privileged RPC, service-role bypass or change to application-table policies.
Its post primary key allows one committed claim per post. Authenticated clients
can INSERT only post_id/user_id/mime_type and SELECT their own live claims. UUID,
destination and creation time are DB-generated; callers cannot set them. UPDATE,
DELETE and TRUNCATE are not granted. Unknown default table grants abort migration.
The existing video partial unique index and original 57 migration files remain
unchanged; new version validation passes against the exact historical baseline.

The real attach handler preserves auth, legal consent, user safety, owner and
media validation. Allowed post states are pending/published, exactly those the
create-post handler writes. Hidden/deleted posts and multiple-video batches are
rejected before claiming. An existing video also prevents a new copy. The normal
TUS fallback/images do not need an R2 claim.

Only a successful NEW PostgREST INSERT/SELECT response with matching claim UUID,
actor/post/MIME/generated destination permits CopyObject. The claim request has
an 8-second abort signal; error, absent response, thrown response or identity
mismatch cannot copy. A claim conflict returns an unresolved/consumed error, not
an upsert, renewed lease, reset, second destination or successful-retry assertion.
No SELECT of an existing claim can obtain copying permission. The exact DB key
is passed into the retainer; it no longer generates another random key.

Source HEAD, 150 MiB bound, MIME/size matching, ETag-conditional copy, destination
HEAD and no SDK retry remain. A failed or ambiguous copy can still have completed
remotely: neither it nor a later cover reset/INSERT/moderation failure automatically
deletes the destination. Claim and possible references are preserved. No automatic
object cleanup, claim cleanup or reconciliation worker was added. Explicit user
deletion paths and their shared-reference safeguards remain unchanged.

The guarantee is AT MOST ONE AUTOMATIC COPY ATTEMPT for a committed post claim,
not distributed atomicity or eventual success. Only the invocation acknowledging
a newly committed claim may copy. If an unacknowledged INSERT actually rolled
back, no copy was dispatched by that invocation; if it committed, subsequent
INSERTs conflict. The server never retries to resolve that uncertainty, and the
browser preserves the draft pending reconciliation. HTTP cancellation does not
prove that PostgreSQL or R2 work rolled back. No claim of global account storage
budget, direct-database enforcement, real R2 behavior or Production parity.

## Claim Retention And Privacy

Unlike the historical proposal, the actual migration stores NO source object key,
filename, content, email, token or request payload. The live mapping consists of
post/actor UUIDs, claim UUID, MIME, generated destination and timestamp, needed
while the object/reference outcome remains live or unresolved. One row per post;
no cascading foreign key, TTL or reuse after post/account deletion.

After separately authorized private reconciliation proves a deleted post/account
has no outstanding mapping obligation, an authorized table owner can minimize the
row by setting user_id, claim_id and mime_type to NULL. The generated destination
then becomes NULL too. Only post_id and timestamp remain as an indefinite consumed
tombstone. Clients cannot perform this operation, insert a null tombstone, remove
it or reclaim it. Native PostgreSQL tests prove minimization and failed re-claim
even after post recreation. No production privacy cleanup or object deletion was
performed. Tombstones must not be dropped as routine cleanup/rollback. Unresolved
or legally required mapping retention must be handled explicitly before scrubbing;
there is no claim that deleting an account already performs this reconciliation.

## P1-B: No Destructive Ambiguous Browser Rollback

The actual composer serializes media before its dispatch boundary. Once media
fetch is invoked, lost response, non-OK moderation result, malformed JSON or an
incomplete success result preserves the post identifier and both media backends.
It does not call post DELETE or Storage remove. A Chinese/English unresolved
message links the original post; a ref plus disabled submit prevents another
submission from that unresolved composer. This browser guard is not the durable
server claim and does not promise state retention across browser reloads.
Proven pre-dispatch failures retain the original safe rollback path. The existing
post DELETE endpoint, moderation, visibility, playback and TUS implementation
were not redesigned. Styles/design system are unchanged.

## P2: Still Open

Direct authenticated DB writes may still bind tmp paths under the existing
provenance RLS. Actual Production policy parity remains unverified. The old
`post_media_no_new_tmp_video` CHECK proposal is NOT registered or executed:
CHECK NOT VALID rejects unrelated updates to existing tmp rows too.

A separate later candidate could reject INSERT/new or moved tmp bindings while
allowing UPDATE of an unchanged legacy (kind, storage_path, post_id, user_id)
tuple. It would need its own targeted policy/trigger review and authorization;
none is implemented or declared safe here. P2 is OPEN, not silently waived.

## Observed Focused Verification

- `node --test scripts/test-r2-video-retention.mjs scripts/test-create-post-ambiguous-submit.mjs`:
  58/58 PASS (50 retention/route/Worker SDK + 8 browser cases). The original
  35-case suite was extended; automatic-compensation assertions were changed to
  preservation, and the old multiple-video-copy case now rejects before copying.
  Historical source/tests remain in the base commit, not overwritten as evidence.
- Sequential success/replay, overlapping route calls, changed-source replay,
  committed claim with lost/thrown response, malformed claim, copy failure,
  copy completed with lost response, lost media INSERT reply, post-insert
  moderation failure and Supabase fallback all covered. Fake route transports
  are NOT offered as database atomicity proof.
- Browser tests execute actual component submit/rollback AST bodies with fake
  nonsecret dependencies. They cover lost response, post-insert moderation500
  and malformed201 with R2/Supabase, unresolved repeat denial, pre-dispatch cleanup
  and successful fallback. No real browser/provider acceptance is claimed.
- `node scripts/test-media-cleanup.mjs`: existing 24/24 PASS.
- `node scripts/test-r2-copy-claim-local.mjs`: 22/22 checks PASS. Exact new migration
  applied to real PostgreSQL17 from existing image17.6.1.165; actual PostgREST16.1
  executed pending/published INSERT/SELECT and rejected replays/cross-user claims.
  Two actual SQL sessions and two actual concurrent PostgREST requests each
  produced one committed row and one unique conflict. RLS, column INSERT grants,
  private SELECT, forbidden mutations and privacy tombstones were checked.
- The SQL fixture has minimal posts/auth/RLS dependencies, NOT the complete
  managed Supabase project or a replay of all migrations. It does not prove live
  grants, managed-role inheritance, existing policies/indexes or Production data
  compatibility. Both disposable containers used existing images with pull=never,
  no external network interface, host ports, mounts or real credentials; PostgREST
  shared container loopback only. Removal and absence were confirmed.
- Changed JavaScript syntax: 3/3 PASS. Migration version validation PASS,
  58 files, exact historical duplicate groups preserved. `git diff --check`: PASS.
- Guarded `build-workers.mjs --local-config C:/Temp/ogh-critical-blockers-local-build-20261020.toml`:
  PASS, synthetic/loopback-only configuration. Existing Markdown deprecation,
  CSS :global and empty-prerender warnings remain; not a clean typecheck claim.

Source hashes and observed counts: `r2-retention-final-offline-integration.safe.json`.
No full recovery/Auth/UI suite, Production request, real bucket operation,
Production migration, deployment, remote push or new broad review bundle.

## Release Gate

Local integration complete, pending scoped independent delta review. Production
remains BLOCKED: new migration is not authorized/applied, no live acceptance is
claimed, P2 remains open and existing media/UI03/recovery blockers are unchanged.
Future release must apply the separately approved exact migration BEFORE the new
application; absent claim infrastructure fails closed rather than copying anyway.
Old Workers ignore the additive table and do not gain this new protection merely
because a migration exists. Do not drop populated claims to roll back or retry.

NEXT_SINGLE_ACTION=SCOPED_INDEPENDENT_DELTA_REVIEW_OF_CLAIM_MIGRATION_AND_BROWSER_CORRECTION.
MIGRATIONS_EXECUTED_PRODUCTION=0;PRODUCTION_CONNECTIONS=0;PRODUCTION_WRITES=0;
DEPLOYMENTS=0;REMOTE_PUSH=0;LEGACY_TMP_MEDIA=NOT_VERIFIED;UI03_ROOT_CAUSE=UNKNOWN;
CATALOG_HOLD=ACTIVE;PUBLIC_BETA_GO=NOT_AUTHORIZED.
