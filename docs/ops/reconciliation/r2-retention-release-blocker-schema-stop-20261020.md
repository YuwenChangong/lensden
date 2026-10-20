# R2 Retention: Required Schema Decision

Base: `808525e3dd221ef667fa7aa2ae8a1be087f90a64`. Offline source analysis only.
Independent review: `CHANGES_REQUIRED`, owner-supplied Downloads report
`OpenGlass_Hub_R2_Retention_808525e3_Independent_Code_Review_20261020.md`.
Report SHA-256: `7144f8a99991677b40128f9374b28562ecc37437b2dbabea29864144ea3a3ebf`.

## Stop Condition Reached

No safe existing durable source/post claim was established. Per the owner's
explicit schema-change stop instruction, this revision contains ONLY unexecuted
SQL proposals and evidence. No application correction, migration registration,
database execution, test run or guarded build was performed. P1-A and P1-B remain
unfixed; the Public Beta retention release gate remains BLOCKED. Existing tests
are historical evidence, not acceptance of these proposals.

`r2-server.ts:82` generates a new random destination for every invocation;
`post-media.ts:398-405` copies before inserting. Important qualification to the
review: `20260531_forum_phase6_upload_guardrails.sql:38-40` already proposes a
one-video-per-post partial unique index. It can reject duplicate video ROWS,
but only AFTER extra copies exist. The handler retains destinations once INSERT
was attempted, including an index violation. Thus this index cannot prevent
copy amplification. Production index parity was not queried or assumed.

`consume_forum_rate_limit` in `20261016061618` records attempts/bytes, not source,
destination, status or an ownership claim. Its transaction lock ends at RPC
commit, not at R2 copy/attach completion. Neither it nor an extra pre-copy SELECT,
SDK maxAttempts, deterministic overwrites or an in-memory lock supplies the
missing durable cross-request exclusion. Existing account/post/upload quotas
must remain enabled; their live state and overall storage sufficiency are not
proved by this offline work.

## Minimal P1-A Prerequisite Proposal

`r2-retention-copy-claim.PROPOSAL_NOT_AUTHORIZED.sql` adds one table, using the
existing authenticated PostgREST path, no new privileged RPC or service client.
Its primary key admits one immutable claim per post; the generated UUID target
retains the actor/post namespace. Caller INSERT grants exclude claim UUID,
destination and timestamps. SELECT is self-only; UPDATE/DELETE/TRUNCATE are not
granted. No cascading FK, expiring lease or automatic cleanup can reopen a claim.
Unexpected default table grants abort the transaction. Effective role membership,
column privileges and actual RLS still need separate migration review/validation.

Required FUTURE application protocol (NOT implemented or proven here):

1. Keep all current authentication, legal consent, safety, post ownership and
   media validation. Reject an existing video or claim before R2 work. Attempt
   one plain INSERT returning the new claim. Never upsert or retry the INSERT.
2. Only an unambiguously successful newly inserted claim permits this invocation
   to make ONE CopyObject call to its exact generated destination. Preserve source
   HEAD, size/type bounds, ETag condition and destination verification. An existing
   claim obtained by SELECT is evidence, NEVER permission to copy again.
3. Unique conflict, lost claim response, timeout, HEAD/copy/verification failure or
   unknown insert outcome fails closed. Keep the claim consumed. A concurrent or
   sequential replay must perform zero copies, even with changed source/MIME.
   No automatic reclaim, replacement key, destructive deletion or duplicate submit.
4. Verified retained key precedes media INSERT. Retain the existing one-video
   index. An ambiguous media INSERT/moderation result preserves claim, object and
   possible row. A replay may only report an existing verified reference or an
   unresolved outcome; it cannot reconstruct permission to copy or insert blindly.
5. Failed pre-insert cleanup, if attempted, cannot delete an already-bound object
   or release the claim. No speculative cleanup of an uncertain commit. Post/user
   deletion does not reset the copy budget. Retention of tombstones and exceptional
   reconciliation require explicit policy, not an automatic retry path.

This is an AT-MOST-ONE AUTOMATIC COPY ATTEMPT proposal, not an atomic transaction
across PostgreSQL and R2 or guaranteed eventual publication. At the existing
150 MiB verified-source limit it bounds this new automatic-copy path to one
destination per post, including failures/replays; it does not bound all account
uploads, existing media, HTTP requests, DB load or unrelated object creation.
Existing per-account post creation and shared-IP upload quotas remain required;
additional account/storage budgeting must be assessed with the future integration,
not silently changed here. A crash after claim commit may leave no copy at all.
Ambiguous outcomes and changed-source retries remain blocked for reconciliation.
Owner acceptance is needed for this conservative availability tradeoff: even a
failed attempt consumes the post's automatic copy opportunity. Video replacement
or reopening a claim is NOT authorized or covered. No claim of functionality
equivalence or complete P1-A remediation is made without implementation/tests.

## P1-B: Confirmed, Still Unfixed At Schema Stop

`CreatePostForm.tsx:664-689` dispatches media attach; its catch at `723-729`
removes Supabase uploads and calls post DELETE even on an unknown outcome.
`posts.ts:473-506` can then delete attached objects. A lost response or committed
media insert followed by moderation-update failure can reach this branch.
The server-only uncertain-insert guard is therefore not an end-to-end guarantee.

Required future minimal correction: serialize payload before dispatch; maintain
an explicit dispatch boundary. Definitely pre-dispatch failures may clean up
provably unbound uploads/post. Once fetch has been invoked, unknown outcomes,
500s and lost responses must preserve both backends and the created post. Show
a localized unresolved-publication message with the known post reference and
prevent automatic re-submission; do not retry or delete as recovery. Browser
state is NOT the durable P1-A protection. No posts DELETE endpoint redesign.

Required focused regressions, NOT RUN: sequential and overlapping same-source
POSTs, changed-source replay, lost claim reply, copy/verification failure, lost
media INSERT reply, committed insert plus moderation failure, browser lost
response for R2 AND Supabase fallback, and definitely pre-dispatch cleanup. Prove
at most one copy and no DELETE/storage.remove after ambiguous attach. Run the
affected existing retention/cleanup tests and guarded build only after code is
implemented under the separately approved schema scope.

## P2: Direct Database Boundary And Separate Proposal

`20260713_post_bound_media_provenance.sql:44,50-70,72-96` permits authenticated
owned/post-bound tmp video writes through provenance RLS, independently of the
Worker API. This is a SOURCE contract, not verified current Production policy.
No repository-only Worker/browser patch can close direct database writes.

`r2-retention-no-new-tmp.PROPOSAL_NOT_AUTHORIZED.sql` proposes a separate additive
CHECK NOT VALID, not an RLS rewrite. It rejects new tmp video inserts/updates,
including staff/service writes, without blocking SELECT or deleting old rows.
Canonical Supabase fallback keys remain structurally allowed. Existing tmp rows
FAIL even unrelated updates such as cover reset: this compatibility blocker MUST
be resolved or explicitly scoped before approval. No VALIDATE, data rewrite or
automatic legacy-media repair is proposed. Global enforcement remains NOT_ACTIVE.

The CHECK behavior follows [PostgreSQL 17 ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html);
role/owner bypass limits follow [PostgreSQL 17 RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
Only public documentation was accessed, never Production. Supabase changelog
markdown could not be fetched (unsupported content type); no provider behavior
or managed-runtime compatibility is inferred from that unavailable document.

## Release Boundary

Both proposals are outside `supabase/migrations`; no existing migration/hash,
frozen artifact, lifecycle rule, application source or historical receipt changed.
They are untested proposals, not independently approved migrations or releases.
No automatic production rollback: dropping a populated claim table could reopen
copy amplification. Disable the future copy path first and retain claims/object
references for separately authorized reconciliation, never delete to resolve doubt.

NEXT_SINGLE_ACTION=OWNER_REVIEW_OF_MINIMAL_SCHEMA_DEPENDENCY_AND_FAIL_CLOSED_RETRY_TRADEOFF.
After that decision, implementation and focused local validation are still needed
BEFORE any separate Production migration authorization. UI03_ROOT_CAUSE=UNKNOWN;
LEGACY_TMP_MEDIA=NOT_VERIFIED; DATABASE_BACKUP_RECOVERABILITY=NOT_VERIFIED;
PRODUCTION_CONNECTIONS=0;PRODUCTION_WRITES=0;MIGRATIONS_EXECUTED=0;
DEPLOYMENTS=0;REMOTE_PUSH=0;CATALOG_HOLD=ACTIVE;PUBLIC_BETA_GO=NOT_AUTHORIZED.
