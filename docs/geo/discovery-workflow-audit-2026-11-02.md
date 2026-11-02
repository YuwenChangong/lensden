# Automatic SEO/GEO discovery audit — 2026-11-02

Routine per-URL indexing requests are not part of Lensden's publishing workflow.
The existing sitemap and crawlable links provide automatic discovery signals.
This does not guarantee crawl timing, indexing, ranking or AI citations.
[Google distinguishes discovery from indexing](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview).

Scope: current source at baseline `53cf882c`, application release `c9acc845`,
origin **https://lensden.net**. The existing release receipt records Worker
`43ac9bb4-f336-4f37-a917-6639acc0ec82`; deployment was not repeated or refreshed.
Read-only audit preceded local edits. Existing same-day anonymous responses and
cleanup receipts were reused; new production website requests were **0**.
Cloudflare configuration was inspected through read-only control-plane calls.

## PASS/FAIL matrix

Verdicts describe the deployed-source audit; local corrections are explicitly
separate. NOT_VERIFIED means insufficient evidence, not a demonstrated block.

| Check | Verdict | Evidence and limit |
|---|---|---|
| 1. New public guides/news/devices/circles/posts discoverable automatically | **PASS, with forum limitation below** | Released non-draft guides enter the existing sitemap; English articles also enter the SSR guide index. Published news/devices and active public circles are queried at sitemap request time. Device brands must exist in the current brand catalog. Eligible posts enter server-rendered latest feed/circle cards; posts are **not** sitemap entries. |
| 2. Sitemap responds to publication, updates and logical deletion | **PASS for included inventory** | Dynamic map reads current anonymous publication/status filters. Static map/index regenerate during a normal source-content release and already reference the dynamic map. No rebuild needed for database content. Meaningful updates keep the URL present; timestamp limitations are below. Response advertises `max-age=3600`, with no event-driven cache purge; changes need not be instantaneous. |
| 3. Sitemap canonical/public eligibility | **PASS for enforced states** | Same-origin HTTPS apex URLs, no query/fragment/private routes; known news alias normalized; device route validation; drafts excluded; news published/device publication published/circle active. Anonymous RLS also applies. Deduplication and XML escaping are present. Test classification is separately FAIL below. |
| 4. Supported `lastmod` accuracy | **FAIL → corrected locally** | English guides ignored supported `lastUpdated`. Circle `updated_at` misses changes to the posts displayed on its page. Local fix emits valid English-guide `lastUpdated` and omits misleading circle timestamps. Existing docs use explicit `lastUpdated`; news/device timestamps remain intentionally omitted because they do not reliably represent editorial/spec changes. No request/build-time timestamp invented. |
| 5. Crawlable internal links and continuation | **FAIL for a forum edge case → corrected locally** | Guide/news/product/circle listings and forum cards are SSR anchors. Latest feed previously filtered hidden-circle candidates before deciding whether another page existed, and hid pagination on empty filtered pages. This could prematurely terminate discovery. Local fix preserves database page boundaries and continuation without revealing excluded posts. |
| 6a. Robots and application authentication | **PASS** | Googlebot, Bingbot and OAI-SearchBot share public Allow/private Disallow rules. Production-origin sitemap lines are present in the released artifact and saved domain-cutover verification. Public pages have no login gate; error/private pages are noindex. |
| 6b. Real crawler passage through Cloudflare | **NOT_VERIFIED** | Fresh bot settings show Fight Mode off and AI/search/crawler blocking protections disabled. Listed zone ruleset is the apex/HTTPS redirect; zone IP access rules empty. Security level medium and Browser Integrity Check on. No verified-bot traffic/security-event evidence was obtained, so configuration does not prove successful real bot crawls or exclude every inherited/account/managed mitigation. No security controls weakened. |
| 7. Existing IndexNow implementation | **FAIL / absent, optional** | No IndexNow client, endpoint, event hook, key file or dependency found in application/source/config/scripts/public assets. Sitemap discovery works without it. External account/CDN integrations outside inspected evidence remain NOT_VERIFIED. |
| 8. Proposed notification safety | **PASS as proposal only** | Bounded, deduplicated, post-commit, eligibility-checked, fail-open design below. Not implemented, deployed or invoked. |
| 9. Never advertise draft/private/removed/test/noncanonical URLs | **PASS for enforced states; FAIL for universal test exclusion** | Draft/private/removed/canonical filters exist. Previously authorized QA circles disappeared automatically from the saved map after logical deletion: 73→70 URLs; all three legitimate new articles remained once. However an active/published fixture can still qualify: only three specific test slugs and an `rls test` name rule are excluded. No universal fixture marker/policy exists. No new moderation, name regex or content classification was imposed. |

## Already automated

- `astro.config.mjs` publishes `/sitemap-index.xml` and the fixed public static
  inventory; `src/pages/sitemap.xml.ts` supplies dynamic/editorial URLs.
- `src/lib/seo-sitemap.ts` uses anonymous GETs, exact-count pagination,
  5,000 rows/table and a shared 40-fetch/10-second ceiling, no retries/redirect
  amplification. Errors return503/no-store rather than a partial successful map.
  These are bounds, not proof of future CPU/usage headroom. There is no sharding
  beyond these limits; growth requires a separate evidence-backed change.
- Guide/source content changes take effect in their normal authorized release.
  Database publication/status changes need no special indexing task. Public
  discovery links are in `src/pages/{guides,news,products,circles,feed}/` and
  `src/components/community/PostCard.astro`.
- Removed URLs stop being advertised; crawler recrawls and existing search-result
  removal remain asynchronous. No removal/indexing notification was sent.

## Missing automation and optional enhancements

Missing: reliable semantic-revision timestamps for news/spec/circle-page changes,
and universal fixture classification. Keep fixtures draft/hidden using existing
workflows; do not treat title/name patterns as proof against legitimate content.
Updating guide `lastUpdated` remains an editorial responsibility after meaningful
changes. Current three published English articles have no `lastUpdated`, so the
fix invents none. Google recommends accurate significant-change timestamps.
[Lastmod guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Optional: a bounded forum-post sitemap could supplement existing SSR links, but
needs its own eligibility/capacity evidence; do not expand the existing transport
or add community queries casually. Recommended/hot feeds cap candidates at200;
latest pagination is the archive path. New Chinese guides enter the sitemap but
their guide-index promotion is currently curated, not automatically enumerated.

Optional IndexNow design, **disabled and proposal-only**:

1. Use the [free protocol](https://www.bing.com/indexnow), no paid indexing vendor.
   A real host key file and notification activation require separate approval.
2. Emit only after a successful public publication or meaningful content update;
   source guides use the successful normal release's changed-file inventory.
   Never emit for views/likes, failed writes, drafts, private/test/removed content,
   aliases, query variants or unchanged bodies. Deletion notifications remain
   excluded under this task's explicit policy, although the protocol supports them.
3. Recheck authoritative public eligibility and exact canonical origin before
   dispatch. Fixtures require an explicit approved classification mechanism first.
4. Deduplicate by canonical URL plus semantic revision; coalesce changes for at
   least5minutes. Proposed admission caps:20 URLs/batch,10 batches/day,200 URLs/day,
   3-second request timeout, one shared participating endpoint, no redirects.
   These are local design limits, not claimed provider quotas.
5. Publication never awaits or depends on notification delivery. Bound pending
   work and expiry; at most one later retry for transient failure, inside all
   caps; honor Retry-After and stop on key/validation failures. No retry storm or
   paid fallback. Revalidate eligibility before any retry.
6. Durable dedup/outbox state, scheduling and retry delivery are **not currently
   implemented**. Reuse an admitted existing mechanism only after proving zero
   additional charges, including shared DB/storage/Worker use; otherwise leave
   notifications off. In-memory dedup is insufficient across Worker instances.
   No new queue/database/cron/logging service is authorized by this proposal.

An IndexNow200 acknowledges receipt, not indexing. It is not a general Google
submission channel or an AI-citation guarantee.
[Protocol and ownership requirements](https://www.indexnow.org/documentation).
Allowing OAI-SearchBot supports search eligibility but does not guarantee selection.
[OpenAI crawler documentation](https://developers.openai.com/api/docs/bots).

## Local corrections and validation

Changed only sitemap date handling, latest-feed page-boundary handling and the
existing pagination visibility condition. No design/CSS, RLS, schema, security,
resource, publication or production-data change. No runtime IndexNow code added.

- New focused pagination regressions:2 failures before correction;3/3 pass after.
  Existing SEO/measurement tests plus these tests: **15/15 PASS**.
- Actual sitemap handler compiled with synthetic content/database boundaries:
  valid guide lastmod, omitted unreliable dates, draft/deleted/known-test filtering,
  and fresh-request unpublication/deletion checks **PASS**; external attempts0.
- Existing local build command **PASS**, loopback config and outbound guard.
  Initial relative-config invocation rejected locally; absolute config succeeded.
  Current ignored `dist/` is a loopback test artifact, not a production release.
- Updated compiled feed with synthetic REST responses: an entirely filtered first
  page retains a plain next-page link to a public post with JavaScript disabled.
  **390/430px PASS**, screenshots inspected, no horizontal overflow. External
  attempts0, database writes0, R2 operations0, production requests0.
- Diagnostic ratchet **PASS**,17 retained errors/new0. No claim of zero type debt.
- Local evidence: `artifacts/qa/discovery-audit/` contains synthetic-handler and
  rendered receipts, screenshots, build/test/type logs and Cloudflare policy
  snapshot. They do not prove production RLS or real crawler traffic.

## Exact remaining owner actions

1. Authorize a later normal deployment if these three local corrections should
   go live. Nothing was deployed/pushed/merged by this audit.
2. Only if not already satisfied, confirm the existing new-origin Search Console/
   Bing property and existing sitemap-index submission once; preserve completed
   verification. No routine per-URL requests or repeated sitemap resubmission.
3. Keep future QA fixtures outside public publication states; use the existing
   reviewed moderation workflow for exceptions. No additional cleanup proposed.

Real crawler passage remains NOT_VERIFIED until existing ordinary-traffic or
search-console evidence is available; inspect any concrete challenge/error before
proposing a narrowly scoped security change. IndexNow can remain off. Crawl timing,
index selection, ranking and AI citations are external decisions; retain the
existing20-query/real-export measurement framework without fabricated metrics.
