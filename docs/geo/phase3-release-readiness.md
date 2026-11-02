# Lensden GEO Phase 3 release decision packet

Assessment: November 2, 2026 (Pacific/Auckland). Scoped evidence only; [PUBLIC_BETA_CURRENT_STATE](../ops/PUBLIC_BETA_CURRENT_STATE.md) remains the sole progress/release baseline.

**Recommendation: HOLD production release; local type/release-validation blockers are resolved under the established ratchet policy.** No new debt waiver or all-application type refactor is required by that policy. The next decision is review and explicit authorization of a manual release from this candidate, with a local production rebuild and bounded verification. That decision has not been granted. Production CPU/RLS/crawler behavior remains unverified; the local maximum-row test is not a production capacity guarantee.

## Source and integration — VERIFIED

- Branch `codex/lensden-seo-geo-foundation`; starting HEAD `1db87e703cc0e17bcbb23becda283369983ef8f3`, Phase 2 source `ffda077619f0dd9bf01b5e942aec6eca570ff96f`. Phase 3 source HEAD `b78c6caa1d1612de64bb6e95c3eb4edd68c39cbe`; final packet HEAD is the documentation-only commit returned by `git rev-parse HEAD`.
- Producer remains `a00e7eb94e522c9aea2751e60f0233a34c372785`, an ancestor with no divergent committed changes. Its dirty current-state notes and classifier are untouched. Source changes do not overlap that classifier; the current-state document is the only dirty-path overlap and its newer producer history must be retained at any later integration. No merge/conflict resolution was attempted or authorized.
- The producer's latest notes still record brand/news and Public Beta LIVE. Fresh management GET confirms deployment `98d3dd51-cf6c-46d7-ab57-de1b5c6a0859`, version `ce3581f7-d069-4fb9-ab72-e89363a1fc43`, 100%. Serving identity remains Worker `lensden`, origin `https://lensden.ogh.workers.dev`, Cloudflare account `dcb374166b39234a499985145c075f50`. This is the existing pre-GEO release.
- Exactly three management GETs this round: deployment, script settings and Workers account settings. Only safe projections were retained; no binding values, account email or financial data were printed. `usage_model/default_usage_model=standard`, Logpush false, no tail consumers. Usage model is not subscription proof. Phase 2's billing 403 was reused, not retried; no token search or permission elevation.

## New changes — DONE

1. Existing forward foreign keys in the forum schema establish object-or-null embeds: posts.author_id/circle_id, comments.author_id/post_id, post_media.user_id/post_id and circles.owner_id. The new `joinedRecord` performs an object/non-array check. Existing admin posts/media/circles/queue and report previews use it without changing selects, filters, limits, auth guards or mutations. Unexpected arrays now yield null previews instead of fabricated owner/parent objects. No arbitrary first row is selected. Null and valid object behavior remains covered. The legacy missing-circle-status fallback retains its existing active default while representing its missing field honestly.
2. Report notification access narrows the actual target discriminator before reading a comment's post. Consent API dependencies use their existing verified-user interface; the dormant consent component's unused function alternative becomes the same token/error record. The component remains unreferenced by production pages/layouts; consent enforcement/removal is not reactivated or bypassed.
3. Local lexicon captures an already-guarded normalized term. Score summaries explicitly narrow finite numbers. OpenAI result types describe actual emitted allow versus moderation/error reasons; no decision, threshold, fail mode, model or provider call changed. No unsafe cast or diagnostic suppression was added.
4. Signed-media URL compatibility uses the installed SDK's public local `getPublicUrl` builder for relative results, replacing protected `.url` access. Current SDK absolute results remain unchanged. Existing signing paths/prefix checks, expiry and data-URL conversion assertions remain; only two test doubles now implement the public method. No real signing/storage request was performed.
5. Seven focused actual-handler/installed-SDK tests and an extension of the existing compiled-Worker test establish these boundaries and maximum-row/concurrent sitemap behavior. No dependency, infrastructure, schema, public metadata, catalog content, article or UI design change.

See [exact diagnostic dispositions](phase3-type-diagnostics.json) and the [exact Phase 3 changed-file manifest](phase3-changed-files.txt).

## Verification — VERIFIED with explicit limits

| Check | Outcome |
|---|---|
| Default tests | 74 PASS, including moderation/trusted admin/circle lifecycle; all security assertions retained |
| Signed-fixture MFA | 20/20 PASS; production requests/database connections 0; no new DB AAL2 acceptance inferred |
| New projection/storage suite | 7/7 PASS; RED fabricated array previews and protected SDK state access, then GREEN; all four handlers deny before a query |
| Existing report authorization | PASS; post/comment/circle/user ancestry, reporter identity and effect ordering preserved; real external operations 0 |
| Existing report and consent GET/POST suites | PASS via installed esbuild bundles and an external-fetch denial prelude; actor-bound writer/auth/error assertions retained |
| GEO/monitoring | 12/12 PASS |
| Final local Worker pipeline | UNIT/BUILD/RENDERED PASS; 12 compiled check groups, canonical/JSON-LD/HTML, redirect, sitemap and JS-disabled 390/430/1280px checks |
| XML and diff | XML parser PASS: runtime33, index2, static13 unique loopback URLs; git diff check PASS |
| Full Astro checker | Still exits 1; 55 reduced to 17 inherited diagnostics, not full PASS |
| Frozen ratchet | PASS: baseline177/current17/removed160/new0/changed diagnostic source lines0/unparsed0; manifest/toolchain/policy unchanged |

Evidence is under ignored `artifacts/qa/seo-geo-phase3` and `artifacts/qa/seo-geo`. The first new concurrency assertion incorrectly required exactly 120 reads on exhaustion; real cancellation stopped at 118. The corrected assertion enforces the ceiling and all-503/no-partial behavior. The initial ad-hoc regression launcher also needed a Windows file URL for Node's `--import`; its loader error is retained. Neither failed attempt is reported as PASS. The final compiled pipeline ran after the SDK correction. No production application/DB/R2 request, deployment, publication, push or merge occurred. Synthetic view RPCs and signing are local doubles.

Independent read-only review found no outstanding Critical, Important or Minor issues. One Minor ambiguity between the standalone and final-pipeline host timings was clarified with explicit receipt paths and independently read back. The reviewer inspected source, tests and recorded results without rerunning suites. Review declined to establish live authentication/RLS/provider behavior, deployment parity, billing/global zero charges, production CPU/memory/capacity/edge caching, crawler/WAF/indexing or release approval; those remain outside the local evidence claimed here.

## Type risk disposition — DONE / VERIFIED

38 diagnostics were removed: authentication/authorization 3, security/moderation 35. None remains in those inventory categories or in Phase 3 changed source paths. This says nothing about untested production behavior.

| Remaining category/path | Count | Active path and runtime risk |
|---|---:|---|
| SEO/shared: src/lib/device-catalog.ts | 13 | Its brand metadata is active in GEO, but the failing lines are legacy getBrandSummaries/getDeviceBySlug optional-field/null/narrow-union logic, not the brand-key lookup used by sitemap. Targeted production reference search found no external call sites for those legacy exports. Missing optional facts already use fallbacks. Catalog values stay frozen; no invented product facts or unrelated type remodel. |
| Other: src/lib/forum-feed.ts | 2 | Active feed page/API; legacy missing-view_count projection omits a primary-result member. Existing supportsViewCount fallback and publication/parent-circle filters remain. SDK inference does not establish production fallback schema; no query alteration made. |
| Other: src/lib/profile-data.ts | 1 | Active profile/user lookup; a case-insensitive/missing-banner fallback can reach an error access without compiler-proven non-null error. Rare schema/failure transitions remain a risk, not claimed harmless; unrelated to GEO and not required by the accepted ratchet. |
| Other: src/layouts/SiteLayout.astro | 1 | Legacy wrapper forwards untyped props without required title. Targeted reference search found no production imports; active GEO layouts render explicit props. |
| Authentication/authorization; security/moderation | 0 | Previous priority inventory is resolved locally; auth core and RLS remain unchanged. |

The [complete JSON inventory](phase3-type-diagnostics.json) retains exact paths/locations/messages for all 17 and dispositions for all 38 repairs. No full-check PASS or general runtime-safety claim is made.

## Actual release policy — VERIFIED

[Astro Check Baseline Ratchet](../ops/astro-check-baseline-ratchet.md) and [Candidate Typecheck Gate Repair](../ops/reconciliation/release-candidate-typecheck.md) define the existing gate: real checker, frozen toolchain/manifest, zero new diagnostics, nonincreasing debt, and no edits at retained diagnostic anchors. It explicitly is not a zero-error compiler gate. No tracked CI workflow exists here. The QA release profile exposes a separate opt-in release validation flow; it does not add a zero-error compiler requirement or authorize deployment. Current source satisfies the established type gate; asking for an additional owner waiver of these 17 would invent a requirement.

Source-applicable completed Public Beta/security acceptance is retained. Fresh affected local auth/admin/report tests validate changed inputs. No changed authentication enforcement, migration, RLS or production binding is proposed, so there is no evidence-based reason to replay H/B1/D/E_VERIFY/DB AAL2/Catalog gates. This does not consume an old authorization or grant a new production GO. The separately authorized normal production build/artifact and bounded release readback remain unperformed.

## Cost evidence and exact boundaries

The owner supplied current dashboard readback on November 2, 2026; it was not independently observed through this OAuth session. Do not interpret any unknown below as zero.

| Evidence | Status and consequence |
|---|---|
| Workers Free Active; Workers Paid not subscribed; today0/100,000 requests; observability0/200,000 | VERIFIED owner dashboard evidence at that snapshot. The [official limits](https://developers.cloudflare.com/workers/platform/limits/) give Free100,000 requests/day,10ms CPU/invocation,50 external subrequests,128MB/isolate and6 simultaneous outgoing connections. Free quota/resource exhaustion fails rather than authorizing an upgrade. |
| GitHub integration, main production branch, automatic builds enabled | VERIFIED owner evidence. Push/merge can trigger a production build/deploy and remain forbidden. Current build minutes/paid Builds usage NOT_VERIFIED. |
| Supabase organization Free; dashboard displays Spend Cap Enabled; Oct7-Nov7 cycle | VERIFIED owner evidence. [Supabase cost control](https://supabase.com/docs/guides/platform/cost-control) says Free usage is not charged; Spend Cap is a Pro feature covering selected items, so the displayed label is not an account-wide paid-service guarantee. No upgrades/add-ons are proposed. |
| Lensden project DB0.037GB, storage0.006GB, egress0.005GB, cached egress0GB, MAU8, realtime peak4/messages0, Edge Functions0; five historical invoices$0 each | VERIFIED owner-reported project snapshot and historical invoices. Organization aggregate usage/current invoice NOT_VERIFIED. [Quotas apply across the organization](https://supabase.com/docs/guides/platform/billing-on-supabase); these project figures do not prove aggregate egress headroom or current account-wide charges. |
| R2 Paid, renewing Nov30; usage, actual charges and hard-stop/no-overage protection unknown | VERIFIED subscription only; R2 operations BLOCKED_COST_UNVERIFIED. Binding presence is not an R2 request. Sitemap, its middleware and these local tests do not call R2. This is not a new request to audit unrelated R2 finances. |
| Billing/subscriptions API | BLOCKED_BY_ACCOUNT_ACCESS, inherited403; not retried. Owner readback resolves current Worker/Supabase plan evidence without elevating access. |

**VERIFIED_ZERO_COST_BOUNDARY:** this round's isolated local build/tests and a narrowly scoped Free Worker/Free Supabase public sitemap path under the reported current plans, with no paid fallback, R2/media operation, provider moderation call or new resource. This is a scoped boundary, not proof of total Cloudflare account charges. Production execution still needs its own explicit authorization and the reported plans must remain applicable.

**NOT_APPLICABLE to the proposed manual path:** hosted Workers Builds minutes. Build locally and deploy the reviewed generated Worker through the established manual release flow, with no Git push/merge/provider build trigger. [Hosted Builds has separate allowances/pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/); unknown minutes would matter if a later plan chose that service. Do not enable it or change its controls here.

Before deployment genuinely required: reviewed candidate/producer reconciliation, an authorized normal local production rebuild and explicit manual release scope using the reported Free plans with no paid fallback. Live verification must exclude cost-uncertain R2/media calls. Current R2 usage/invoice/hard-stop evidence is required for R2 operations, not for local GEO work or a release plan that performs none. Organization aggregate usage remains useful for availability planning; under the confirmed Free organization it is not a newly invented paid-overage blocker. No repeated dashboard request is needed to finish this packet.

## Sitemap cost/capacity — VERIFIED locally / NOT_VERIFIED in production

- Source audit: sitemap creates one anonymous client/transport shared by its three table readers. Middleware only resolves locale from headers/cookies and passes XML through. There are no auth refreshes, view RPCs, R2, image transforms, KV session access or other outbound service calls on this path. Astro sessions are lazy; unused sessions do not persist. The compiled outbound trace confirms only the three REST paths during the capacity fixture. Internal binding usage is distinct from external fetch count; no new cache or storage binding was added.
- Each invocation allows at most40 physical GETs, three readers concurrently, no retries/redirect follow,20pages/5,000rows per table and a shared10-second deadline. Controlled read/count/budget failures yield generic503/no-store, never partial200. Platform CPU/memory termination can instead produce Cloudflare1102; it cannot be claimed caught as the endpoint's503.
- Maximum synthetic data:15,000 records =>30 physical reads,15,031 unique URLs,967,028 XML bytes. The final pipeline (`artifacts/qa/seo-geo-phase3/compiled-worker-final.log`) updates `artifacts/qa/seo-geo/rendered-receipt.json`: host wall time116ms; four concurrent requests completed with120 reads and host wall385ms. The earlier standalone `artifacts/qa/seo-geo-phase3/rendered-final.log` measured183/428ms before the final SDK correction/rebuild. Three concurrent exhaustion cases used118 reads (ceiling120), all503 with zero partial maps. These demonstrate amplification: N uncached requests can consume up to40N reads; the transport is not an account-wide rate limiter.
- Successful responses emit public max-age=3600, failures no-store. Actual edge caching/hit ratio is NOT_VERIFIED; a cache header does not mean one database refresh/hour. No speculative Cache API/KV infrastructure was added, and failure maps are never cached as successful output.
- CPU and peak Worker heap are NOT_VERIFIED measurements. Serialization/validation and row/Map/XML copies scale with record count; concurrent invocations share the isolate's memory. The bounded local run completed without resource termination, but its wall times include local IPC/mock transport and do not prove compliance with Free10ms CPU. Retain the limits and use a bounded post-release sitemap response/available invocation CPU/error readback; if actual data exceeds capacity, stop/rollback under that release scope and investigate the measured path. Do not widen limits or upgrade to conceal failure.

## Smallest remaining owner actions and next authorized step

1. **OWNER_ACTION_REQUIRED:** review this candidate and explicitly authorize the exact manual release path from this source lineage, including retention of producer notes/classifier, one normal local production rebuild, manual Worker activation and a bounded HTTP/metrics readback. No push/merge into main, hosted build, R2/media exercise, schema/write operation or article publication is implied. A news/post GET can write its existing view counter; omit those requests unless the later grant explicitly includes that effect.
2. Within that separately authorized window, validate actual sitemap status/completeness/canonical origin and available CPU/resource-error evidence using existing Free controls; retain current security gates and plan settings. No stress test is needed. RLS/crawler/WAF behavior remains NOT_VERIFIED until an authorized bounded check; no WAF/DNS change is requested. A normal production artifact must be rebuilt; current dist is synthetic loopback output and must never be deployed.

The next action authorized **now** is local owner/reviewer inspection of this packet and exact source diff. Further fixture/schema investigation can continue locally without credentials. The inherited type gate and current Worker/Supabase plan evidence no longer justify a generic billing/type HOLD; the remaining HOLD is the explicit release boundary plus unperformed normal artifact/live validation, with production performance disclosed as an availability risk. R2-only unknowns remain isolated to R2 operations. No additional manual dashboard task is required for this local closeout.
