# Owner steps before a GEO release

No manual action is needed to complete local development. Nothing in this packet authorizes deployment, DNS, WAF, database changes, article publication or a public-beta gate replay.

Release update (November2,2026): the separately owner-authorized manual release is complete; see the [production receipt](controlled-release-2026-11-02.md). Version63a5910c-0414-46e9-88cf-38b5a9ec65cb is active100%; six bounded sequential checks passed and the one dynamic map contained70 unique public URLs. No immediate owner action is required to close that release. Inspect existing CPU/error metrics during ordinary traffic because aggregate CPU P50/P99 exceeded the nominal Free allowance, without observed errors; sitemap-specific/sustained headroom remains unverified. Search-console submission and draft publication are separate choices. Historical Phase3 HOLD wording below describes the state before the explicit release grant.

Phase 3: [release decision packet](phase3-release-readiness.md). Default74/MFA20/GEO12/new regressions7 and compiled-Worker12 groups pass. Full checking retains17 errors, but the actual frozen-debt gate passes with zero new errors; no new debt waiver is required. Owner's November2 dashboard readback confirms Workers Free and Supabase Free. The inherited billing403 is not retried. Hosted Builds consumption and R2 usage/charges/hard stops stay unknown; no push/merge/hosted build or R2 operation is authorized. The smallest next action is review and explicit authorization of the manual local-build/Worker-release path and bounded live checks. Current loopback dist is unusable for release. [Phase 2](phase2-release-readiness.md) is historical evidence.

## Next release and production verification

- [x] Review this branch from the current Lensden production source lineage; exactbb2bb5ff candidate deployed. Producer's newer dirty notes/classifier preserved.
- [x] Resolve the inherited test-runner failure locally; all 74 default checks and 20 signed-fixture MFA checks pass. Production auth source and security assertions are preserved.
- [x] Satisfy the existing type-debt gate:17 retained diagnostics,new0,changed anchors0. Authentication/security inventory errors are0. Retain Public Beta/security/auth gates in docs/ops/PUBLIC_BETA_CURRENT_STATE.md; this is not a full type-check PASS or release GO.
- [x] Receive explicit authorization and perform one normal manual release with owner-confirmed Free plans, local build and no paid fallback. No push/merge/hosted build or R2 data operation occurred; existing bindings retained.
- [x] Rebuild through the normal production flow and verify the actual artifact before activation. Historical loopback test dist was replaced by that production build; no future release/reuse authorization is implied.
- [x] Run the authorized bounded HTML/robots/sitemap/canonical and available CPU/error readback: six sequential200 responses, one dynamic map, no media/news/post requests. Aggregate metrics report0errors; sustained CPU margin and full RLS/crawler acceptance remain unverified. No limit increase or paid fallback.
- [ ] Validate sitemap identity sets against eligible records, server caps, stable ordering and cached response behavior. Watch for 503 (missing credentials, schema/grant mismatch, count instability, >5,000 rows/table, >20 pages/table, shared 40-fetch ceiling, 10-second deadline, XML limit). Retries and redirects are disabled. HTTP max-age alone does not establish edge caching. Do not solve a 503 by widening grants or returning a cached partial map. Add bounded sharding/cache under a separate scoped change when data exceeds the envelope.
- [ ] Separate editorial action: review three English drafts and verify model/region/source freshness before publication approval. This is not a prerequisite to shipping the technical foundation. Set publication/update metadata only at the actual editorial events; publish through the existing workflow.

## Google Search Console

Actual property ownership, verification tokens and existing submission status are NOT_VERIFIED. Use the current configured origin `https://lensden.ogh.workers.dev` unless production evidence establishes a different approved origin.

1. Sign in to [Search Console](https://search.google.com/search-console). Select an existing verified property or add a URL-prefix property for that exact HTTPS origin. The shared workers.dev parent is not a domain you control. Do not add DNS records for someone else's parent.
2. Choose an offered ownership method from [Google's verification help](https://support.google.com/webmasters/answer/9008080). If a public HTML file/tag is needed, supply the actual owner token through a separately reviewed change and a normal authorized release; never invent a token or overwrite another owner's token. A tag belongs on the actual CommunityLayout homepage, not only Starlight's head.
3. After release, submit `/sitemap-index.xml` (now references `/sitemap.xml` for dynamic content). Inspect `/`, `/products/`, one published device, one guide, `/news/`, and `/about/`. Request indexing selectively; submission is not proof of indexing.
4. Record Page Indexing snapshots, Web performance and dedicated Generative AI Search/Discover reports separately when accessible. The [June 2026 announcement](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports) is newer than legacy instructions that only mention the Web total. Do not add AI impressions to the overlapping Web total. Record report unavailability as unknown.

## Bing Webmaster Tools

1. Sign in to [Bing Webmaster Tools](https://www.bing.com/webmasters/), choose an existing property or add the same approved origin. Import from an already verified Search Console account only if the owner approves the requested access, or use the offered XML/tag method. See [Bing site verification](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b).
2. If a verification file/tag is required, provide the exact token through the same release review. No DNS/security change is implied.
3. Submit the sitemap index, inspect crawl/index eligibility and record AI Performance citation data separately from search impressions. The [official report description](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/) distinguishes citations from visits and page rank. Property access and actual data are NOT_VERIFIED.

## Cloudflare crawler access review (read-only checklist)

- [ ] Establish which Worker/zone and origin actually serve the approved hostname; a workers.dev site may not have the same zone controls as a custom domain. Record unavailable controls as NOT_APPLICABLE.
- [ ] Review existing Free plan/quota information and available Security Events/AI Crawl Control views without enabling paid features, log export, storage or new analytics.
- [ ] Inspect blocks/challenges for independently verified Googlebot, Bingbot and OAI-SearchBot on eligible public HTML and sitemap/robots paths. A spoofed user-agent is insufficient evidence. Use existing verified-bot classification and official operator IP verification; don't globally disable bot protection.
- [ ] Review rule order, bot fight/super-bot settings if present, managed challenges, rate limits and AI crawler policy separately. Preserve auth/admin/API restrictions. Capture rule identifiers and evidence locally without account secrets; no WAF/DNS changes are authorized here.
- [ ] Search discovery and model training are independent. The repository preserves the inherited wildcard training preference; an owner-approved GPTBot training choice belongs in a separate robots group. See [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots) and [Cloudflare verified bots](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/). Do not infer current access from robots alone.
- [ ] Review robots/noindex interactions: disallowed URLs cannot reliably expose a noindex tag to crawlers. Existing disallows are retained as instructed; if a private URL is already indexed, use owner search-console removal and a separately reviewed crawl policy. Robots is not access control.

Priority after verification: real Search Console/Bing baseline; editorial review and first approved article; evidence-quality repairs; stable editorial timestamps; bounded published community-post discovery only after verifying anonymous parent-circle eligibility and volume. Existing brand comparisons are interactive, so standalone editorial comparisons require actual approved content before sitemap inclusion.
