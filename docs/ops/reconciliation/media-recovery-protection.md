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

NEXT_SINGLE_ACTION: owner review of the bounded real-media inventory and
independent-retention scope above before any separate Production access approval.
