# Lensden SEO and GEO foundation — local implementation

Phase 2 update (2026-11-02): see the [release decision packet](phase2-release-readiness.md) and [Phase 2 manifest](phase2-changed-files.txt). The default test-runner blocker is resolved (74 checks pass); full type diagnostics decreased from 56 to 55 with zero new diagnostics. Sitemap requests now share a 40-physical-fetch ceiling and 10-second deadline with retries and redirects disabled. Deployment identity was read back, but billing/capacity remains unverified after a 403. Production release recommendation: HOLD. The Phase 1 assessment/results below are retained as historical evidence; current progress/release authority remains [PUBLIC_BETA_CURRENT_STATE](../ops/PUBLIC_BETA_CURRENT_STATE.md).

Assessment date: 2026-11-02 (Pacific/Auckland). Source base: a00e7eb94e522c9aea2751e60f0233a34c372785. Candidate branch: codex/lensden-seo-geo-foundation. No deployment or publication was performed. Read [owner-actions.md](owner-actions.md) before any launch activity.

The original `D:/OpenGlass Hub` checkout is an older OpenGlass UI branch with unrelated dirty files. Inspection identified the current Lensden lineage in the auth-a-containment-time-v2 worktree. This candidate uses a separate managed worktree from its committed HEAD; unrelated classifier and current-state-note edits were not copied. Earlier names remain in internal identifiers and historical records intentionally.

## Before and after assessment

Labels apply to repository/local evidence unless explicitly stated otherwise. Production behavior is NOT_VERIFIED in this task.

| Area | Before | After | Evidence / limit |
|---|---|---|---|
| Brand identity and origin strategy | VERIFIED_COMPLETE | VERIFIED_COMPLETE | site-origin.ts CURRENT_SITE_ORIGIN = https://lensden.ogh.workers.dev; config.site derives from it; environment override validated as HTTPS origin |
| Actual deployed origin/version/custom domains | NOT_VERIFIED | NOT_VERIFIED | recent inspected current-state notes report Lensden LIVE; no live application/provider request here; no assumption that notes prove current state |
| Framework and rendering | VERIFIED_COMPLETE | VERIFIED_COMPLETE | package/installed Astro 7.2.10, Cloudflare adapter 14.2.6, React 6.0.5 integration; static base configuration with locale-ssr-routes forcing page SSR and Starlight prerender:false; React islands retained |
| Initial device HTML | VERIFIED_COMPLETE | VERIFIED_COMPLETE | ProductDetail.astro renders title/prose/specs/sources/links; existing contract retains 36/36 fixture fields in en/zh-CN; compiled Worker checks and JS-disabled browser pass |
| Device evidence architecture | VERIFIED_COMPLETE | VERIFIED_COMPLETE | existing anonymous public projections, structured states, units/context/region/variant/confidence/verified_at; no schema or query expansion on detail path |
| Limitations and claim/source presentation | PARTIALLY_IMPLEMENTED | VERIFIED_COMPLETE | existing key_limitations now render if supplied; known specs link to matching public evidence; unknown measurement contexts remain visible |
| Metadata and canonical basics | PARTIALLY_IMPLEMENTED | VERIFIED_COMPLETE | existing CommunityLayout OG/Twitter preserved, canonical fallback for eligible routes, query stripped, private/errors noindex with X-Robots-Tag; existing noindex search base canonical preserved; no duplicate title/description in rendered test |
| Missing guide status | VERIFIED_GAP | VERIFIED_COMPLETE | guides/[slug].astro previously redirected unknown entries to index; now uses 404 rewrite, explicit 404 response and noindex; draft:true guide refused |
| 410 removal registry | NOT_APPLICABLE | NOT_APPLICABLE | no verified permanently removed public record set; no invented tombstones or URL migrations; ordinary missing resources remain 404 |
| robots search crawler rules | PARTIALLY_IMPLEMENTED | VERIFIED_COMPLETE | Googlebot/Bingbot/OAI-SearchBot share exactly the wildcard restrictions in one group; retained previous restrictions; private profile/settings/logout paths added |
| AI training preference | VERIFIED_COMPLETE | VERIFIED_COMPLETE | inherited wildcard behavior preserved; no training opt-out fabricated; independent future owner decision documented |
| Sitemap dynamic routes | PARTIALLY_IMPLEMENTED | VERIFIED_COMPLETE | prior 200-row news/circle caps, uncapped device REST response and slug-only docs loop could omit pages; current docs IDs/slugs + bounded exact-count paginated public identity reads; index points to runtime map |
| Sitemap private/redirect exclusion | VERIFIED_GAP | VERIFIED_COMPLETE | plugin fixed-route inventory could advertise admin/auth/redirect routes; explicit static-public filter, runtime canonical eligibility, no profile/auth/admin/API entries; known legacy news row maps to its existing canonical permalink |
| Sitemap availability | PARTIALLY_IMPLEMENTED | VERIFIED_COMPLETE | prior partial/empty success possible on some errors; now missing binding/read/count/cap/invalid identity yields redacted 503/no-store instead of cached partial success |
| Reliable lastmod | PARTIALLY_IMPLEMENTED | PARTIALLY_IMPLEMENTED | actual docs lastUpdated and circle timestamps used; omit device dates without normalized-content timestamp and news updated_at affected by view-count writes; no build time or source-access date used as lastmod |
| Product structured data | VERIFIED_GAP | VERIFIED_COMPLETE | Product + BreadcrumbList; only source-linked non-conflicting KNOWN structured properties; no offers/reviews/ratings/prices/availability added |
| News/guide Article structured data | VERIFIED_GAP | VERIFIED_COMPLETE | visible headline/summary/canonical; actual publication date for news; guide update only when supplied and visibly rendered; no source_name misrepresented as author |
| Community structured data | PARTIALLY_IMPLEMENTED | VERIFIED_COMPLETE | replaced inherited raw unescaped Article JSON with safely serialized DiscussionForumPosting, published+moderation-published guard and public display name only; no duplicate Article or raw author ID in new schema |
| Starlight identity/social metadata | PARTIALLY_IMPLEMENTED | VERIFIED_COMPLETE | existing canonical/OG retained, known editorial guide aliases canonicalized, missing Twitter/image/Org/WebSite added without duplicate tags |
| Community post sitemap | NOT_VERIFIED | NOT_VERIFIED | deliberately omitted pending bounded public visibility/parent-circle projection and volume review; active public circles remain on existing anonymous/RLS path; no new posts crawl query |
| Standalone comparison pages | NOT_APPLICABLE | NOT_APPLICABLE | current comparisons are brand-page React interactions/query state, not separately published editorial pages; no thin comparison URL generation |
| Content templates/drafts | VERIFIED_GAP | VERIFIED_COMPLETE | five reusable templates and three source-reviewed English drafts under docs/geo; outside content collection and unpublished |
| Monitoring framework | VERIFIED_GAP | VERIFIED_COMPLETE | blank normalized CSV, local read-only validator, 20 English queries; missing values remain null, no fabricated metrics, no paid API |
| Search Console/Bing integration evidence | NOT_VERIFIED | NOT_VERIFIED | historical source instructions exist; no checked-in verification token found in inspected layouts/config; actual property ownership/submission/indexing/AI data require owner access |
| Cloudflare crawler/security evidence | NOT_VERIFIED | NOT_VERIFIED | local config and operator history inspected; current WAF/bot decisions and quotas not read from provider; checklist only, no security changes |
| Production/Public Beta gate | NOT_VERIFIED | NOT_VERIFIED | existing docs/ops/PUBLIC_BETA_CURRENT_STATE.md remains authority for the actual release process; GEO adds no authorization or production GO |

## Implementation and boundaries

The new helpers derive metadata from existing visible content; public readers remain anonymous. Product pages make no additional public query. The sitemap avoids the former full device/spec read and requests only identity columns from published devices. It reads at most 5,000 rows and 20 pages per table (devices, circles, news), subject to Phase 2's shared 40-fetch ceiling and 10-second deadline. Successful responses emit public max-age=3600; this does not prove a provider/edge cache hit or one database refresh per hour. This is bounded request work, not proof of a billing allowance. Do not raise limits or add infrastructure without review.

`lastmod` is optional when a true significant-update time cannot be established. In particular, a view counter is not an editorial update, and normalized spec updates need not update the device row. [Google's guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) calls for accurate significant-modification dates; [its lastmod clarification](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping) permits omission when uncertain. Dates are never generated from this build or draft preparation.

Schema.org vocabulary validity does not guarantee a Google rich result or AI citation. Product offers and reviews are intentionally absent because no supporting commercial/review evidence was established. Anonymous forum authors are omitted when no public display name exists; do not invent an identity to satisfy a rich-result recommendation.

## Reproduce local verification

Use the already installed dependencies. No install, database container, provider credential, deployment or paid service is required.

```powershell
npm run test:seo-geo
npm run test:seo-geo:local
npm run geo:validate
node scripts/test-public-product-detail-reader.mjs
node --experimental-strip-types scripts/test-product-detail-contract.mjs
node scripts/test-public-news-detail-api-safety.mjs
npm run test:astro-check-ratchet
git diff --check
```

The local runner creates a synthetic loopback build configuration, passes only OS environment variables to children, disables telemetry/update checks, and invokes the existing build-workers local-config path. It then runs the actual compiled Worker with intercepted synthetic REST responses. No Supabase/Cloudflare/Brevo production call or database write is performed. The inherited news/post view RPCs in that test are intercepted and return in memory; they are not real writes. Browser requests are restricted to the local server. Test artifacts/logs/screenshots are under ignored artifacts/qa/seo-geo. The test runner accepts no deployment or remote-target arguments.

The resulting dist is a loopback test artifact, not a production release artifact. An authorized normal release must rebuild from reviewed source with its existing release configuration; never deploy this local test output.

## Results and failures

- Focused behavioral tests: 9/9 PASS (canonical/private/error policy, evidence and conflict filtering, JSON script escaping, schema date handling, sitemap safety/bounds/server caps and CSV validation).
- Existing public product reader: PASS. Existing actual-Astro product detail contract: PASS, 36 full + 5 preview fixture fields retained in both languages, 404/301/503 cases preserved.
- Existing search regression suite: PASS, including noindex search base canonical/og:url and Terms canonical. The first candidate run caught canonical suppression; the narrow existing contract was restored and retested.
- Existing public news detail safety/fallback suite: PASS, malformed/draft/unsafe URL/private-ID cases checked without a real network/database.
- Local Worker build: PASS. Compiled Worker checks: PASS for product/news/discussion/guide/about initial HTML, one metadata set, canonical query stripping, published dates (missing publication stays absent, never draft creation), no duplicate forum Article, guide 404, dynamic sitemap 200/503 and robots.
- Chromium with JavaScript disabled: PASS at 390, 430, 1280 pixels; no document/body horizontal overflow; source section and product heading visible; screenshots captured. This is synthetic local content, not real device acceptance or production evidence.
- XML parser: PASS on runtime map (33 fixture/local URLs), sitemap index (2 references) and generated fixed map (13 URLs); same origin and unique URLs confirmed. These are local test counts, not production counts or monitoring metrics.
- Astro check: FAIL with 56 inherited errors, 0 warnings at the checker summary. Existing debt ratchet: PASS, baseline 177/current 56, removed 121, new 0, changed diagnostic source lines 0. Do not report full type checking as green.
- `npm test`: FAIL before implementation at extensionless src/lib/server/admin-assurance import from admin-auth.ts (ERR_MODULE_NOT_FOUND). This prevents the default moderation/admin suite from running; unrelated auth source was preserved. This remains a release-validation limitation.
- No external application/provider operations, deployment, DNS/WAF/security-policy changes, schema writes or article publication. Public documentation browsing was used for source verification. Account billing and live search metrics were not queried and remain NOT_VERIFIED.
- Independent review: no Critical findings. Two Important findings (legacy-news sitemap alias and nullable publication timestamp) were fixed with failing-then-passing tests. Count-change, duplicate and exact request-budget exhaustion cases were added. Existing robots restrictions were also checked with a second parser; blanket Allow was moved after disallows to preserve restrictions for first-match parsers as well as longest-match crawlers. A final type-check caught optional Astro.response.status in the search preservation condition; the default is now explicitly 200.

The focused tests and local render checks do not prove live RLS, index coverage, crawler access, free-tier capacity, existing analytics attribution or Public Beta readiness. No new dependency or infrastructure was introduced.

## Content and launch packet

- [Device quality contract](device-quality.md)
- [Five authoring templates](templates/device-comparison.md), [explainer](templates/technical-explainer.md), [buying guide](templates/buying-guide.md), [industry analysis](templates/industry-analysis.md), [research report](templates/data-research-report.md)
- Unpublished drafts: [USB-C compatibility](drafts/usb-c-display-glasses-compatibility.md), [3DoF/6DoF](drafts/3dof-6dof-tracking.md), [display specification comparisons](drafts/xr-display-specifications.md)
- [Monitoring method](monitoring/README.md), [blank observations](monitoring/observations.csv), [20 queries](monitoring/test-queries.csv)
- [Owner checklist and search-engine setup](owner-actions.md)
- [Exact changed file manifest](changed-files.txt)

Immediate owner action: none for local work. Toward launch: review the candidate and inherited validation blockers; confirm zero-cost capacity and authorize a normal release; verify production access/eligibility; verify existing Search Console/Bing ownership and submit the sitemap; review drafts before publication; start manual measurement with real observations. Operations requiring owner credentials or release/content approval remain pending, without blocking the completed local foundation.
