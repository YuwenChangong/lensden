# Authorized GEO publication and QA cleanup — execution receipt

November 2, 2026. **Publication VERIFIED; QA cleanup DONE and VERIFIED after the owner completed normal staff MFA.** This receipt covers the owner's exact four cleanup targets and three original drafts. [PUBLIC_BETA_CURRENT_STATE](../ops/PUBLIC_BETA_CURRENT_STATE.md) remains the current progress authority.

## Cleanup completion — November 2, 2026, 21:19 NZDT

This completion supersedes the historical MFA-blocked checkpoint below. The
existing staff endpoint accepted the moderator session after normal MFA. No
role, assurance, legal-consent or permission checks were bypassed.

| Exact target | Before | Verified after | Logical deletion time, NZDT |
|---|---|---|---|
| Post `fba0a005-1008-4fe5-8899-52c23efd2bfb` | published, comments0, media0 | deleted; title, author and circle IDs retained |21:11:20 |
| Circle `a2aecbee-6b9b-48c8-a5c7-7597bb9a53b3` / `fullopenai-677480-daily` | active, posts0, comments0 | deleted, report actioned |21:15:00 |
| Circle `ed595c9f-75fc-4b82-ada8-f5e38c596063` / `cv-677480-circle` | active, posts0, comments0 | deleted, report actioned |21:15:37 |
| Circle `06b4eb20-07fa-417e-b62b-e87eb0087381` / `qa0a39aa70-f4d5-40e1` | active,4 nonpublic QA posts, comments0 | deleted; all4 child rows retained |21:16:24 |

Post: used the existing exact-post admin logical DELETE after confirming zero
media/comments. The cleanup helper therefore had no objects or media rows to
remove; no R2 operation was performed. This handler changes status only and does
not append `moderation_actions`: the post's count remains0, not a fabricated
new audit event. Existing author identity and history are preserved. Its
before/after staff UI snapshots, result screenshot and database readbacks are
retained in the ignored evidence directory. No extra audit-repair write was made.

Circles: used existing report creation followed by staff `hide_target`, whose
established circle behavior is logical `status=deleted`. Exact report IDs:
`925d476b-4b22-4b68-ab3c-91ef832e137d` (FULLOPENAI),
`a5395748-a667-4049-86b3-faf61a6910a4` (CV), and
`33be0379-ee68-468e-944c-6b94ac5a6579` (QA). Each is actioned with the staff
resolver, handling note, creation event and `hide_target` event verified in
`report_events`. No notification, media cleanup, purge or cascade occurs in this
circle action. Only these targets and their scoped report/audit records were
mutated through the application; no direct production SQL write was used.

Retained-video readback matches the earlier receipt exactly: hidden /
hidden_by_admin, media1, audit rows4, media metadata fingerprint
`7b1ad4d268813f7d69eab7044b159cbe`. The three already-deleted child posts retain
their deleted states; no repeated action. Full deletion/purge was deliberately
not performed, preserving the hidden video and its evidence. No user/profile
or legitimate community was removed; Brilliant Labs and Rokid remain eligible.

Eight sequential anonymous verification requests at21:19:27–21:19:29 NZDT:
homepage/feed/circle list/sitemap200 and each of the four removed details404.
All targets absent from listings. Sitemap70 unique URLs; compared with the
post-publication map, the only differences are exactly the three removed circle
URLs (added0). All three published article canonicals remain exactly once.
These deleted-detail requests cannot enter the published-post view-count path.
No media was fetched by this verification script. Staff UI reads were limited
to the exact target pages and existing console; the CV page displayed its
existing cover, without any R2 object or lifecycle operation by this task.

Evidence: `artifacts/qa/geo-publish/cleanup-completed.json`,
`cleanup-live-receipt.json`, eight `cleanup-live-*.txt` responses, before/after
staff snapshots, `post-deleted.jpg` and `qa-circle-deleted.jpg`. No additional
build/deployment, Git push/merge, schema/security change or paid service.
Publication's existing deployment and tests below remain applicable.
**No further owner action is required for this authorized scope.**

## Published articles — VERIFIED

All three source-reviewed drafts were used directly, with original files retained unchanged. Published copies are in the existing English editorial directory and served by the existing guide layout. Changes are limited to those three MDX files, their guide loader/publication metadata, guide-index links and sitemap inclusion. No new CMS, dependencies, schema, UI redesign or additional article.

| Article | Public canonical URL | Status |
|---|---|---|
| USB-C compatibility, scoped to XREAL One/One Pro | https://lensden.net/guides/usb-c-display-glasses-compatibility/ | VERIFIED |
| Comparing XR display specifications | https://lensden.net/guides/xr-display-specifications/ | VERIFIED |
| 3DoF versus 6DoF | https://lensden.net/guides/3dof-6dof-tracking/ | VERIFIED |

Actual editorial publication decision/metadata for all three: **2026-11-02T06:43:07Z** (19:43:07 NZDT). Production activation: **2026-11-02T06:47:59.621488Z** (19:47:59 NZDT). These are distinct events; the metadata timestamp is not represented as the exact activation time. Live verification completed at06:49:43.675Z.

Primary-source checks retained XREAL model/connection/power/adapter conditions, distinguished Apple's historical2023 introduction from the current M5-generation specification, and labeled Microsoft's tracking guide as archived Windows Mixed Reality documentation. Only final scope/source/editorial wording was adjusted; the articles were not regenerated from memory. Internal links resolve to existing routes and passed bounded production checks. No new personal author/byline or hands-on claim was invented; Article schema has no author. Existing site-wide creator metadata was preserved.

Each article returned200 with one matching canonical, a distinct title/description, English article language, a visible publication date and matching Article/OG publication metadata. No duplicate Starlight article route was created. The dynamic sitemap has **73 unique URLs**, including each new canonical exactly once. The sitemap index still points to that dynamic map. QA-circle entries remain present because cleanup has not succeeded.

## Deployment — DONE and VERIFIED

| Item | Evidence |
|---|---|
| Deployed source | `c9acc8458ab0ae5fd7a5f15bdc622716f205aff7`, current production lineage from0a1b3e01 |
| Active Worker version | `43ac9bb4-f336-4f37-a917-6639acc0ec82`,100% |
| Deployment ID | `35ed60e2-0390-41a5-98ae-443db14c9a1c` |
| Retained rollback version | `f5ab8d21-8aa6-4b32-a33f-22899c73d3cf`; not invoked |
| Procedure | Existing generated-artifact Wrangler manual deploy with `--keep-vars`; no push/merge/hosted build |
| Configuration | All27 bindings compare equal between old/new immutable versions; secrets retained, values not read. Existing apex/www and workers.dev/preview flags preserved |
| Assets | No changed asset files uploaded; Worker module publication only. No R2 object operation |
| Artifact |374 files;8,626,462 bytes; manifest SHA-256 `11e0d9db0384ae3f24275838968e8d8bf857e263ebc9f8691ec43150da468a1f` |

The normal production build passed with an external-network guard. An initial attempt was stopped before dispatch when Astro telemetry tried to send; telemetry was then disabled for the successful build. No guard was weakened. The guard log preserves that failed attempt rather than calling it a clean first build.

## Historical checkpoint before MFA completion — BLOCKED, none removed

Fresh authorized database reads reconfirmed the owner's exact IDs, slugs, statuses and counts. After the owner signed in, the existing staff endpoint still returned **403, “Verify your authenticator at /admin/security/ before continuing.”** No permission, role, MFA factor or policy was changed to bypass it. The remaining input is a successfully verified existing staff session, not renewed cleanup approval.

| Exact target | Before | Latest readback at07:05:04.636948Z | Execution status |
|---|---|---|---|
| Post `fba0a005-1008-4fe5-8899-52c23efd2bfb`, title `QA 验收测试，请忽略` | published; moderation published; comments0; media0 | Same; moderation audit rows0 | BLOCKED; still public |
| Circle `06b4eb20-07fa-417e-b62b-e87eb0087381`, `qa0a39aa70-f4d5-40e1` | active;4 QA posts; comments0 | active | BLOCKED |
| Circle `ed595c9f-75fc-4b82-ada8-f5e38c596063`, `cv-677480-circle` | active; posts0; comments0 | active | BLOCKED |
| Circle `a2aecbee-6b9b-48c8-a5c7-7597bb9a53b3`, `fullopenai-677480-daily` | active; posts0; comments0 | active | BLOCKED |

An attempt to create an exact-circle cleanup report through the existing UI returned `report target circle 06b4eb20-07fa-417e-b62b-e87eb0087381 not found`. Readback confirms zero matching report rows. It was not retried after the staff403, and no target mutation occurred. This does not establish that the authenticated deletion workflow will succeed after MFA; resolve the session first and respect any subsequent permission failure.

Retained evidence — VERIFIED: QA video post `3516d117-b1a8-4a44-a497-9350466b59ec` remains hidden/hidden_by_admin with one media reference and four existing moderation-action rows. Its media-metadata fingerprint is unchanged across the captured readbacks: `7b1ad4d268813f7d69eab7044b159cbe`. Related posts `d1449619-ec81-46b2-89be-364fa196a7c4`, `7199bf70-8afa-4448-ab93-cc56cc15f191` and `5230791d-10e1-41c1-bd95-99e8093b22ae` remain deleted; no action was duplicated. No R2 object or retained media metadata was removed. Full historical audit completeness is NOT_VERIFIED; existing rows were retained.

No legitimate content, account or profile was removed. No cleanup succeeded, so public-listing/sitemap exclusion of these four targets remains **BLOCKED**, not VERIFIED. The post is still in the saved post-release homepage and all three circles remain in its sitemap. This is reported explicitly rather than treating confirmed fixture identity as deletion evidence.

Resume only the remaining cleanup after the normal MFA session succeeds. Prefer established logical status changes; keep the hidden video/media and already-deleted related rows untouched. The admin post DELETE handler includes media cleanup, so it must not be used on retained-media records. Existing audited moderation/report workflows must retain their permission checks and before/after evidence; no direct privileged SQL update or destructive cascade is authorized as a substitute. Do not redeploy the already verified articles to complete cleanup.

## Checks and limits

- **VERIFIED:**12 existing SEO/measurement tests pass. Existing Astro diagnostic ratchet passes:17 retained errors,new0,changed anchors0. This is not a full zero-error type check.
- **VERIFIED:** compiled artifact checked at eight local routes with intercepted synthetic reads, external attempts0, production requests0, database writes0 and R2 operations0. The pre-change article check correctly returned404; the changed artifact returns200.
- **VERIFIED:** all three article layouts at390px and430px have no horizontal overflow; existing styles/layout retained. A live USB-C article screenshot is saved locally.
- **VERIFIED:**14 sequential production HTML/XML checks, all200: three new articles, guide index, sitemap index/map, homepage, product list, existing Brilliant Labs Frame device detail, forum feed, news list, developer page and two linked guides. No news/post detail request or view-count probe. Additional browser reads were confined to the article, relevant staff/circle pages and existing dashboards; no media download or R2 object request was performed.
- **VERIFIED, bounded dashboard evidence:** existing last24-hour Metrics view showed new version15 invocations, errors0, median CPU10.03ms; displayed exceeded-memory0 and exceeded-CPU0. No new logging/analytics or rate-limited API retry. This small snapshot does not prove sustained CPU headroom or sitemap-specific CPU; those remain NOT_VERIFIED.
- **DONE:** no paid service/resource/upgrade/fallback, migration, hosted build, Git push/merge, DNS/WAF change, media lifecycle change or direct production SQL write. Workers dashboard preflight showed2,392/100,000 daily requests and displayed billable usage$0.00. No claim about unrelated R2 billing is inferred from that display.

Local evidence: `artifacts/qa/geo-publish/` contains build/test logs, unchanged-draft hashes, compiled/runtime and responsive receipts,14 live responses, deployment manifest/readback, existing metrics UI snapshot and exact cleanup readbacks. These ignored artifacts are local evidence, not public article content.

**Historical required action (now completed):** select an existing verified authenticator at https://lensden.net/admin/security/, enter its current code in the site, and click **Verify session**. Do not send the code in chat. The existing authorization remains sufficient for the exact cleanup once authentication succeeds; no new general release/GEO approval is needed.
