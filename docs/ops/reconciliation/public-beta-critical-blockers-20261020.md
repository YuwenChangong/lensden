# Public Beta Critical Blocker Sprint

2026-10-20. Isolated branch codex/public-beta-critical-blockers-20261020, based on
53ef39e7617eaf5f5c309a0b798be0cc4be85d9c. Local implementation only, no push/deploy.
Existing dirty checkouts and frozen Recovery/Catalog evidence were not modified.

## UI-03: Root Cause Still Unproven

Affected route: GET /admin/reports/. Source: src/pages/admin/reports/index.astro,
CommunityLayout and client-loaded AdminReportsPanel. Middleware assigns locale;
the source does not establish a missing-locale, permission or application exception.

Existing authoritative sanitized evidence was read, not rerun:
C:/Temp/openglass-product-detail-main-release-v1/output/playwright/local-supabase-e2e/
REPORTS_HTTP500_STACK_REVIEW_SAFE.md and WORKERD_FINAL_SUMMARY_SAFE.json.
Historical local sequence: A shell200/forbidden UI, list GET403, action POST403,
then B GET /admin/reports/500. A separate B-only case200 does not close that failure.
The actual boundary is Miniflare entry.worker.js:4733 service.fetch rejection,
converted at4735-4736 to plain500 with Network connection lost. Both workerd
processes were alive; neither a crash nor an application/root cause was proved.

These are local receipts with Production requests0, NOT proof of a Production
normal-user/admin500. Exact missing evidence is the failed-request-correlated
downstream exception/disconnect cause (and serving deployment identity if the
failure is Production). No application fix, new reproduction or UI03 test PASS
is claimed. Required normal-user denial AND administrator functionality remain
unwaived. UI03_CORRECTION=BLOCKED_UNPROVEN_CAUSE; UI03_TARGETED_TESTS=NOT_RUN.

## R2: Newly Attached Videos No Longer Persist Under tmp

Confirmed source chain: external-video-upload.ts issues post-bound tmp tickets;
CreatePostForm PUTs the object and submits its storage_path; post-media.ts previously
inserted that tmp path unchanged. Playback and deletion already recognized tmp.
The retained earlier management observation of tmp-expire-1d supplies the risk;
no current bucket listing, rule change or actual loss is inferred here.

Now, after existing auth/consent/safety/ownership/path validation and BEFORE any
cover reset or media insert, the handler HEADs the exact source, checks bounded
size/type, and server-side copies with CopySourceIfMatch. A fresh destination is
<actor>/<post>/r2-retained-<random UUID>.<mp4|webm|mov>, retaining the existing
canonical DB/RLS path contract without any migration. HEAD destination must match
the CopyObject ETag and source size/type before either modern or legacy-column
insertion can persist the final reference. No live byte-hash/backup proof is claimed.

All shared feed, public proxy and owner/staff deletion paths recognize the retained
R2 marker. Supabase video fallback and thumbnail backend remain unchanged; public
views use the existing visibility-checked proxy. Shared-reference deletion checks
remain in force. Direct client/DB writes bypassing this API are not constrained by
a new database policy: existing RLS was deliberately not changed.

Failures: missing/mutated/invalid source or failed copy cannot create a tmp DB row.
Copy operations have15s abort budget and no SDK retry. Only a newly generated,
not-yet-DB-bound destination is eligible for2s best-effort compensation. Batch
failure before INSERT also compensates earlier new destinations. After INSERT
dispatch, an error/lost reply can hide a committed row: KEEP retained objects,
never destructively assume rollback. Such outcomes may leave durable orphans and
require explicit reference reconciliation before deletion. Remote copy completion
after an abort is not disproved by a compensating DELETE; uncertainty is logged
without keys/provider output. No automatic orphan sweeper/framework was introduced.
Temporary upload sources remain under the existing lifecycle, not explicitly
deleted while legacy references may exist. This is not independent media backup.

SDK runtime correction: the initial actual-workerd positive test failed with
ReferenceError on the SDK browser XML parser's DOMParser dependency. The existing
R2 resolver now maps only @aws-sdk/xml-builder's parser import to its bundled
plain-JS parser; no dependency installation/version change or application-wide
polyfill. Final actual-workerd success and HTTP200 embedded-error cases both pass.
This new copy-path issue is NOT evidence of the historical UI03 root cause.

Official API basis: R2 supports CopyObject and source ETag conditions
([Cloudflare S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/)).
HTTP200 alone is not copy success; SDK parsing plus destination verification is
required ([CopyObject response semantics](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html)).
Only public docs were accessed, never provider/account or bucket endpoints.

## Focused Verification and Remaining Scope

- node --test scripts/test-r2-video-retention.mjs:35/35 PASS,0 skipped.
  Fake clients plus actual workerd SDK with local outbound-service fixtures;
  signed fake metadata/copy/delete requests never reach real R2.
- node scripts/test-media-cleanup.mjs:24/24 PASS, including retained R2 + Supabase
  thumbnail routing and shared retained-video protection.
- Existing test-post-media-provenance-authorization.mjs:PASS.
- Existing test-post-media-delivery-authorization.mjs:PASS.
- Three changed JavaScript files node --check:3/3 PASS; git diff --check:PASS.
- Existing build-workers.mjs --local-config C:/Temp/ogh-critical-blockers-local-build-20261020.toml:
  PASS with loopback/synthetic-only config and sanitized child environment.
  Final emitted R2 chunk has no DOMParser dependency. Existing CSS :global and
  Markdown deprecation warnings remain; build is not a zero-error typecheck claim.
- No old Recovery/Auth/R2 integration/UI03 suite replay. No Production DB, media,
  roles, migrations, lifecycle/configuration, build/deployment or remote push.

Existing published tmp references are NOT migrated by this patch. Whether they
still exist or suffered expiry requires separately authorized scoped assessment;
no object is claimed lost, restored or recovered. Independently review this code
before any separately authorized release/live acceptance. UI03 remains BLOCKED.

PRODUCTION_WRITES=0;PRODUCTION_CONNECTIONS=0;DEPLOYMENTS=0;REMOTE_PUSH=0;
CATALOG_HOLD=ACTIVE;PUBLIC_BETA_GO=NOT_AUTHORIZED.
NEXT_SINGLE_ACTION=INDEPENDENT_DELTA_REVIEW_OF_R2_RETENTION_CORRECTION.
