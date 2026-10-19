# Media Recovery Protection: Local Acceptance

Decision: `MEDIA_LOCAL_RECOVERY_ACCEPTANCE_PASS`. This is a synthetic byte-recovery
milestone, not Production backup verification or permission to activate a gate.
Source baseline: `3da5ad8bf177d95d029203c30cb3b594f396fb86`, on isolated branch
`codex/public-beta-media-recovery-protection-20261019`. Other checkouts, the running
Production source, and frozen recovery candidates are not presumed identical.
Exact examined source pins and acceptance evidence are in
`media-recovery-protection.safe.json` beside this report.

## Actual Application Scope

| System / object class | Observed references and access contract |
| --- | --- |
| R2 post videos | `r2-server.ts` signs PUTs into `tmp/<user>/<post>/<uuid>-<filename>`; `post_media.storage_path` retains the key. The website proxy checks post/moderation/circle visibility before fetching the configured public R2 base. This does not make a direct bucket URL private. |
| Supabase Storage post images, thumbnails, fallback videos | `CreatePostForm.tsx` and `storage-tus.ts` actually upload to `post-media`; video fallback remains allowed by the application contract. Keys include user/post identifiers. `post_media.storage_path`, `url`, `thumbnail_url` and media metadata must match the database snapshot. |
| Supabase Storage profile and editorial images | `profile-media.ts`, `circle-cover.ts` and `news-media.ts` use `post-media` prefixes `profile-avatars/`, `profile-banners/`, `circle-covers/`, `news-covers/`, `news-content/`. References live in `profiles.avatar_url/banner_url`, `circles.image_path`, `news_articles.cover_image_url/content`. |
| R2 catalog images | Catalog validation permits `PUBLIC_R2_PUBLIC_BASE_URL` and repository `/images/` or `/assets/` paths. References include `devices.product_image_url`, `official_image_url`, `media.imageUrl`, `media.images[].url`. The catalog R2 origin/bucket must be mapped independently; it is not assumed to equal the post-video bucket. |
| Repository / third-party URLs | Classify separately: tracked static assets require retained source/build artifacts; unmanaged HTTPS links have no independently verified byte protection. No blanket new platform recovery requirement is inferred. |

`20260524_forum_phase3_post_media.sql` declares `post-media` private. Signed Storage
URLs and the authorized media proxy are observed code paths, not proof of current
Production bucket policies. Real Storage recovery also needs `storage.objects`
ownership/user metadata, bucket definitions, grants and RLS reconciled with Auth
and application rows. None was queried or restored by this task.

`MODERATION_ASSETS` may provide a lexicon with local source/emergency fallbacks;
it is configuration, not a user-media byte class. Its binding is not assumed to
share an R2 media bucket. The examined upload/delete paths provide no independently
verifiable retained media backup. Provider retention/versioning/backups and actual
Production object counts remain UNKNOWN. `tmp/` may contain live referenced video:
do not apply blanket prefix expiry. Existing cleanup behavior is not a backup.

## Minimal Local Workflow and Evidence

The two new `scripts/qa/media-recovery-local*` files deliberately expose only a
bounded synthetic filesystem workflow, not cloud adapters. Reuse the existing
hash-pinned AES-256-GCM/scrypt envelope helper at
`C:/Temp/ogh-manual-backup-preparation-20261010-v5/backup-core.mjs`; it is unchanged.
The test also requires the already installed Playwright/Chromium at
`C:/Temp/ogh-product-beta-development-20261013/node_modules/playwright/index.mjs`
solely to generate a nonsecret H.264 MP4. No new dependencies were installed.

1. Create 11 synthetic objects and 10 managed database-shaped reference projections.
   Include an unreferenced object so physical inventory is not reference-only.
   Classify repository and unmanaged URL references separately; do not claim their
   bytes were restored. These are not actual database rows or FK/RLS validation.
2. Enumerate the exact bounded filesystem inventory, keys, provider/bucket mapping,
   content metadata and per-object SHA-256. Reject unknown files, omitted inventory,
   unsafe paths, symlinks/hardlinks and bound violations. Bounds: 64 objects,
   64 KiB each, 2 MiB total bytes, 4 MiB archive, 256 references. Production-sized
   completeness and provider pagination are not implemented or claimed.
3. Encrypt bytes, inventory and references; retain only encrypted archive and wrapped
   data-key envelope in an independent directory. Exclusive creation, file fsync,
   readback and authenticated replay are checked. Windows ACL is restricted to the
   current user and SYSTEM. This is not tamper-proof or offsite storage; a synthetic
   passphrase exists in memory only, not a proven durable real key-retention plan.
4. Delete the source before a fresh Node process restores into a separate directory.
   Compare exact object set, bytes, keys, metadata and reference snapshot digest.
   Public/private scope flags are preserved as metadata; cloud ACL enforcement,
   real Storage ownership/policies, and provider API restore are NOT tested.
5. Detect restored corruption, missing objects, metadata drift, unlisted files,
   omitted inventory, missing referenced keys, reference-snapshot drift, wrong
   passphrase and archive ciphertext corruption before target creation. Finally
   remove all exact owned synthetic directories, archive/envelope and restored bytes.

Final targeted result: **3/3 PASS**, including the full isolated acceptance and nine
named negative categories. Generated H.264 MP4: **2018 bytes**. Syntax checks are
**2/2 PASS**. The initial missing-implementation RED run, intermediate receipt-path
assertion failure, and final-review multiline-news RED/fix are disclosed in the
scoped receipt. Multiline news images now resolve without allowing unsafe control
characters; this does not expand the site's standalone Markdown image grammar. No historical
GoTrue, R2 CRUD/playback, migrations, full RLS or UI suites were repeated. No
application build was needed: application source, dependencies and migrations did
not change. No independent code approval is claimed for this new local helper.

Sanitized acceptance receipt:
`C:/Temp/ogh-media-recovery-local-20261019-final.safe.json`

SHA-256: `dc8b9650b17e7c871f08c23859bb7baedebd9b1d26fb7fd84aecda04b44b1bb8`.
The earlier `ogh-media-recovery-local-20261019-acceptance.safe.json` remains unchanged;
its separate hash is recorded, not substituted for the final source-bound evidence.

The browser context was offline with requests aborted and no Production targets
or provider clients in this execution path. Host networking was not disabled.
All observed child processes and browser resources closed in the successful run;
this fixture does not extend the frozen Windows Job supervisor contract.

## Remaining Production Protection Gate

The existing Application Recovery matrix correctly leaves Storage/R2 object bytes
outside database recovery. It and all frozen V2.3 evidence remain untouched.
Historical local GoTrue acceptance and the owner-reported cleanup-delta review are
preserved, not rerun or expanded into a complete Production recovery approval.

To prove real media protection, a separately authorized scope must provide a
complete bounded provider inventory (including pagination and unreferenced keys),
independently retained encrypted bytes, original required provider metadata and
ownership/access configuration, and reconciled database media references. Database
and object snapshots need quiescence or explicit non-atomic consistency handling;
this quiescent local fixture does not solve concurrent provider mutations.

Then verify an independently isolated provider destination, object hashes and
metadata, legitimate/private access behavior, missing references and orphan policy.
No new cloud resource is authorized here. If no existing free isolated destination
or current no-additional-cost evidence is available, that step must remain BLOCKED.
The encrypted archive and recovery key must have independent durable retention,
with the recovery passphrase separately retained and an owner-verified recovery
procedure; keeping replicas in the same bucket is not enough.

Current actual media/database recoverability remains NOT_VERIFIED. This milestone
alone does not authorize Production access, gate activation, main integration,
push, deployment, Catalog thaw or Public Beta GO. GROUP1 stays 10/14, UI02 stays
LOCAL_PARTIAL_PASS, UI03 stays BLOCKED, and Production parity stays UNKNOWN.

## Owner Action Packet: Real Inventory and Retention Gate

2026-10-19: `AWAITING_OWNER_AUTHORIZATION`. Inspected candidate is local commit
`2d64d0b243e44b1a219aa0fb417b19bf0196b747`; its 16 application source pins, helper,
test source and acceptance receipt still match. No tests were repeated. The local
helper is synthetic-only (64 KiB/object, 2 MiB total); it is NOT a ready Production
exporter. Neither this packet nor prior authorizations permit a Production read.

### Exact Proposed Single Operation (Not Executed)

- Owner must bind the Cloudflare account, jurisdiction, exact Production R2 bucket
  names and origin-to-bucket mapping: aliases `R2_MEDIA` and, only if distinct,
  `R2_CATALOG`. At most two distinct buckets. Names remain UNCONFIRMED here; do not
  substitute the historical `ogh-e2e-video-20261016` bucket, discover other buckets,
  assume a shared bucket, or include the nonmedia `MODERATION_ASSETS` binding.
  Owner must separately reconfirm intended Supabase Production project (historically
  `xcbnxzjlsvtgzixurcof`) and the exact `post-media` bucket. No endpoint or secret
  is loaded from local test configuration for this purpose.
- One serial operation, maximum 180 seconds total, zero retries. Existing trusted
  clients only, no installs or cloud configuration changes. Strict TLS certificate
  and hostname checks, exact endpoint allowlist, no redirects, ambient credential
  discovery, application routes, public object URLs or auto-reconnecting clients.
- R2: only S3 `ListObjectsV2`, no `ListBuckets`, `HEAD`, object `GET`, version-list,
  signed URLs or multipart calls. Empty prefix and no delimiter enumerate the
  entire authorized bucket, including unreferenced keys. `MaxKeys=1000`; at most
  10 pages and 10,000 objects per bucket per pass, two passes, 40 total requests.
  Follow only returned continuation tokens; require terminal `IsTruncated=false`.
  Abort on repeated/missing token, duplicate key, malformed response, invalid size,
  incomplete page traversal, changed key/size/ETag/modified-time tuples between
  passes, or any permission/network failure. No SDK automatic retries (`maxAttempts=1`).
  Request timeout 10 seconds; bounded response 2 MiB/page. Abort at any bound rather
  than silently truncating or requesting more. Keys/tokens and tuple digests stay
  in private process memory only, not receipts, stderr, traces or ordinary logs.
- Supabase: one existing SELECT-only database connection, one authentication
  attempt, one preapproved aggregate SELECT below, then ROLLBACK/disconnect. No
  Auth/admin login, Storage download, user/business-table query or business RPC.
  Connection timeout 10 seconds; the transaction limits below are local, not
  persistent configuration changes. Result maximum one row/4 KiB application data;
  client watchdog also enforces the operation deadline. No automatic reconnect.
- Permission precondition: existing R2 Object Read only restricted to the exact
  buckets (it technically permits downloads, but this operation forbids them).
  Supabase requires CONNECT, schema USAGE and only required SELECT columns on
  `storage.objects(id,bucket_id,metadata)` and `storage.buckets(id)`, with full
  visibility of the authorized bucket independently established from current
  grant/RLS evidence. RLS returning a subset or invoking an unreviewed function is
  not proof of complete safe visibility. Do not use an ordinary user/anon listing,
  a write-capable service credential, grant privileges or create an account to
  bypass a missing permission. If existing permissions cannot meet this scope,
  STOP before querying; no credential issuance is authorized by this packet.

Proposed SQL text (review material only; never executed in this task):

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
WITH limited AS MATERIALIZED (
  SELECT id, metadata
  FROM storage.objects
  WHERE bucket_id = 'post-media'
  ORDER BY id
  LIMIT 10001
), sizes AS (
  SELECT CASE WHEN (metadata->>'size') ~ '^[0-9]{1,20}$'
    THEN (metadata->>'size')::numeric ELSE NULL END AS n
  FROM limited
)
SELECT
  (SELECT count(*) FROM storage.buckets WHERE id = 'post-media') AS bucket_rows,
  count(*) AS observed_rows,
  count(*) > 10000 AS truncated,
  count(*) FILTER (WHERE n IS NULL) AS invalid_sizes,
  CASE WHEN count(*) <= 10000 AND count(*) FILTER (WHERE n IS NULL) = 0
    THEN coalesce(sum(n), 0) ELSE NULL END AS catalog_total_bytes
FROM sizes;
ROLLBACK;
```

For Supabase require `bucket_rows=1`, `truncated=false`, `invalid_sizes=0` and the
proven full-visibility prerequisite. A zero sum with unknown/missing size metadata
must not become a zero-byte PASS. Absent columns/schema or rejected SQL stop this
operation; no modified query/retry is automatically permitted. Permission evidence
is still MISSING now; this SQL is a specification, not a validated live schema.

For both systems: receipts contain only resource aliases, counts, byte totals,
request/page counts, terminal-page/visibility flags, start/end UTC and sanitized
first-failure class. No keys, paths, UUIDs, owners, ETags, private hashes, metadata
values, credentials or response dumps. Failed or capped counts are labeled partial
lower bounds and do not satisfy the gate. R2 terminal traversal means scoped live
listed objects, not account-wide inventory or an atomic snapshot. Two equal passes
detect some changes but cannot prove atomicity; require an owner-coordinated quiet
media interval without this tool changing Production. Supabase results establish
only a consistent Storage metadata-catalog snapshot, not underlying bytes, missing
files or inaccessible backend orphans. No cross-provider or DB/reference atomicity
is asserted. Real counts and bytes remain UNKNOWN until a separately approved run.

### Minimum Independent Retention Contract (Owner Decisions Pending)

| Item | Minimum contract / outstanding decision |
| --- | --- |
| Destination | Owner names an EXISTING owner-controlled offline disk/device outside source buckets, repository, temporary folders and source-host failure domain; verify capacity and access controls before copying. No new account/service/purchase. No actual destination has been approved. |
| Encryption and custody | Reuse the existing authenticated AES-256-GCM + wrapped random data-key contract, with TLS on provider reads. Encrypt object keys, metadata and references too. Owner names a key custodian and separately retained recovery passphrase/availability method; no secrets in chat/Git/logs, no sole unwrapped key or passphrase alongside the archive. The local test did not verify durable real key custody. |
| Integrity and consistency | Retain a complete manifest with provider/bucket/key mapping, byte length/SHA-256, content/custom HTTP metadata, Storage ownership and bucket/access-policy definitions plus matching DB reference snapshot. Reconcile all managed references, duplicates, missing and unreferenced objects; no automatic orphan deletion. Preserve source snapshots under an agreed quiet interval or explicitly fail inconsistent capture. ETag is not a substitute for content SHA-256. |
| Retention and deletion | Owner chooses duration, privacy/erasure handling and refresh/RPO. Proposal for decision, NOT an active policy: pre-release snapshot retained at least 30 days and through the approved rollback window. Disconnect/protect the independent copy against application deletion; no automatic pruning or overwrite of the last accepted copy. ACL/read-only attributes alone are not immutable storage. |
| Restore | Separately authorize a fresh isolated local destination: decrypt/authenticate, restore bytes and required metadata, verify complete manifest and DB references, then provider access/ownership behavior where relevant. Never restore to Production/its Preview. Keep the sole retained encrypted backup; cleanup only disposable restore copies after evidence. |
| Existing helper boundary | Reuse tested crypto/hash/reference contracts, not its synthetic limits/paths as a real-media exporter. Provider capture/replay and capacity acceptance remain unimplemented/unverified. Inventory results must establish feasible byte bounds and existing tooling before a separately reviewed, minimal real-byte execution path can be authorized. No new framework is proposed here. |

Essential Public Beta protection is the non-reconstructible media actually used by
posts/profiles/circles/news/catalog and its required reference/access metadata.
Keep thumbnails unless a verified regeneration contract is accepted. Unmanaged
external embeds, disposable caches/transforms, unused providers and managed-platform
internals are not automatically additional release requirements. No evidence here
establishes existing independent Production backup, retention or versioning.

### Cost Gate and Required Owner Response

No reliable dollar estimate for real backup is possible with UNKNOWN counts/bytes,
destination and current provider allowance. Do not infer zero cost from read-only.
R2 listing consumes operation allowance: budget all 40 requests conservatively as
Class A and require current applicable unused allowance with margin. Confirm that
the exact authorized buckets' listing charges qualify for the Standard free tier;
unknown pricing/class eligibility blocks the request, not just the later download.
An unused allowance in a different account or for a different class is not proof.
Supabase catalog responses consume database/shared-pooler Egress. Current account/organization
usage must cover these bounds, with zero upgrade/add-on/overage permitted; historical
rounded screenshots are not a live reservation. Infrequent Access retrieval and
future object reads may add cost even when R2 egress is free. No byte-download cost
is approved now. Existing offline storage could have zero incremental service cost
only after the owner confirms available equipment/capacity and all provider costs.

Public official references checked, not project APIs:
[R2 S3 listing](https://developers.cloudflare.com/r2/api/s3/api/),
[bucket-scoped permissions](https://developers.cloudflare.com/r2/api/tokens/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Storage metadata versus bytes](https://supabase.com/docs/guides/storage/schema/design),
[Supabase Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

NEXT_SINGLE_ACTION: owner returns ONE scoped decision identifying the exact
Production account/jurisdiction/R2 bucket allowlist and Supabase project/bucket,
existing read-only permission evidence, current zero-additional-cost evidence,
quiet inventory interval, independent destination, retention duration/RPO and key
custody. Explicitly authorize only the bounded metadata operation above if these
conditions are accepted. Do not provide credential values. Until then:
`PRODUCTION_INVENTORY_AUTHORIZATION=NOT_GRANTED`, counts/bytes UNKNOWN, status
`AWAITING_OWNER_AUTHORIZATION`; real media/database recoverability NOT_VERIFIED.
