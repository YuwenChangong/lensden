# Lensden GEO controlled manual production release

**RELEASE_VERIFIED — for the explicitly authorized bounded release checks.** Activated once; all six sequential live checks passed. No rollback criterion was observed. This does not establish indexing, AI citations, sustained CPU capacity, complete RLS acceptance or crawler identity/access.

Release time: November 2, 2026, 13:25:24 NZDT / 00:25:24 UTC. Current progress authority remains [PUBLIC_BETA_CURRENT_STATE](../ops/PUBLIC_BETA_CURRENT_STATE.md); this is the scoped release receipt.

## Source, deployment and rollback

| Item | Verified value |
|---|---|
| Reviewed/deployed source HEAD | `bb2bb5ff791b9397c42f0f5eebb268e50f23eb2a` |
| Phase 3 application source commit | `b78c6caa1d1612de64bb6e95c3eb4edd68c39cbe` |
| Branch / Worker | `codex/lensden-seo-geo-foundation` / `lensden` |
| Production origin | https://lensden.ogh.workers.dev |
| Active version / traffic | `63a5910c-0414-46e9-88cf-38b5a9ec65cb`, version166,100% |
| Active deployment | `733c49ac-2e70-4122-84c0-480a453fd1f6` |
| Release annotation | `Lensden SEO/GEO bb2bb5ff source b78c6caa` |
| Retained rollback version | `ce3581f7-d069-4fb9-ab72-e89363a1fc43`, previous version165 |
| Previous deployment | `98d3dd51-cf6c-46d7-ab57-de1b5c6a0859` |
| Rollback status | Prepared before activation; not executed because critical checks passed and available metrics report no errors |

Producer branch remained a00e7eb9, an ancestor with no committed divergence. Its dirty current-state notes and classifier were preserved and independently hash-read back unchanged. The release used the reviewed candidate rather than historical main; no push, merge, reset, rebase or cherry-pick occurred. This receipt's later documentation-only commit is not the deployed source HEAD.

## Mandatory preflight and artifact — VERIFIED

- Exact reviewed HEAD and clean candidate source verified before build/activation. Existing production auth/assurance/TOTP, Wrangler source configuration and dependency/lockfile contracts match producer source. Package differences are the already-reviewed GEO script additions, not dependency changes. No unrelated producer change entered the artifact.
- Fresh `npm run test:astro-check-ratchet` PASS: baseline177/current17/removed160/new0/changed diagnostic source lines0/unparsed0. Full checker retains17 historical errors; the existing ratchet policy is unchanged. Applicable Phase 3 default74/MFA20/GEO12/targeted7 and compiled-Worker12 evidence remains source-applicable; no completed production gate replay.
- The owner's current November2 Workers Free / no Workers Paid and Supabase Free dashboard evidence remained applicable; no plan, add-on, resource or paid fallback was enabled. The inherited subscriptions403 was not retried. R2 Paid unknowns remained confined to forbidden R2 operations.
- One normal production `npm run build` completed through the existing build-workers process, using production configuration. Node fetch/HTTP(S) guard allowed local transport only; denied external attempts0. Before build, the preload path's Windows escaping caused a loader-only failure; the application build had not started. The corrected relative preload path produced the successful build. Both logs are retained; no failed attempt is called a build PASS.
- Actual production artifact checked locally with intercepted synthetic REST reads: homepage/About/guide/sitemap200, production canonicals and schemas, external calls0/writes0/R2 operations0. This check used a separate local runtime config; it did not replace the production artifact with a loopback build.
- Artifact manifest:368 files,8,601,315 bytes, SHA256 `e1dc89658b418b06cdd54bf47b90e7c45725af3b35aaf7bf1d7c8660328a7b87`. Actual files still matched after activation. Name `lensden`, main `entry.mjs`, no_bundle true, compatibility2026-05-17/nodejs_compat. Production sitemap/robots origins verified; no loopback output was deployed.
- Existing bindings retained: SESSION namespace c6d05834ec1d4d3780d8495236496887, MODERATION_ASSETS bucket openglasshub-media, ASSETS and IMAGES. No migrations, new routes, new services, Logpush or tail consumers. Generated vars were emptied, then the established command used `--keep-vars`; secrets are retained by Wrangler. Post-deploy readback against the previous version found zero binding differences, all15 plaintext settings equal and secret binding names preserved. Secret values were neither read nor printed.
- Manual CLI only: `node node_modules/wrangler/bin/wrangler.js deploy --config dist/server/wrangler.json --keep-vars --message "Lensden SEO/GEO bb2bb5ff source b78c6caa"`. Existing Workers Assets uploaded three changed files: robots.txt and the two static sitemap files;80 assets were already uploaded. This is Workers Assets, not R2 object storage. No Git operation triggered hosted Builds.
- Rollback version existence and current100% activation were read before deployment. The prepared exact rollback command targets the prior version with `wrangler rollback ... --name lensden --yes`. No resource/schema migration complicates that reversal. [Cloudflare rollback behavior](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) applies to Worker versions; no rollback or resource access was needed here.

## Bounded live verification — VERIFIED

Exactly six sequential GETs with redirect following disabled, no login/cookies,20-second deadlines and2MB response ceilings. A local single-use sentinel prevents accidentally rerunning the smoke. No browser/subresource loads, refresh loop, crawler spoof, stress test, R2/media request, news/post GET or production database mutation was performed.

| Route | HTTP / bytes | Checks |
|---|---|---|
| `/` | 200 /23,495 | One title/canonical, correct HTTPS root origin, WebSite + Organization JSON-LD |
| `/robots.txt` | 200 /748 | Googlebot/Bingbot/OAI-SearchBot named rules, admin restriction, production sitemap origin |
| `/sitemap-index.xml` | 200 /267 | XML parser PASS; exactly the static and dynamic production sitemap references |
| `/sitemap.xml` | 200 /6,149 | Exactly one controlled request; XML parser PASS,70 unique HTTPS public URLs, no query/fragment/private/admin/API/auth/user/post entries; canonical Lensden news permalink present, old permalink absent |
| `/about/` | 200 /31,111 | Correct canonical, WebSite + Organization JSON-LD |
| `/guides/ar-ai-xr-glasses-difference/` | 200 /44,110 | Correct canonical, WebSite/Organization/Article/BreadcrumbList JSON-LD |

Dynamic map contains33 product/brand URLs,8 news URLs,9 circles and7 guides, plus the other existing public routes. These are sitemap URL counts, not independent database entity counts or proof of every RLS policy. Successful response emitted public max-age=3600; actual edge-cache hits remain NOT_VERIFIED. No resource-limit or5xx response occurred. Final management readback confirmed the new version still100% active, workers.dev enabled and preview-URL settings retained.

## Available CPU/error evidence and limitation

One read-only [Workers GraphQL metrics query](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/) scoped to `lensden`,00:25:24–00:27:29.277UTC,limit10, returned one success group:5 requests,0 errors,17 subrequests. No new logging/analytics service was enabled. A separate schema-only introspection verified that the CPU quantile fields are microseconds.

Reported aggregate CPU: P50=26,784µs (26.784ms), P99=53,071µs (53.071ms). These exceed the nominal Free10ms allowance, so **sustained Free CPU headroom is NOT_VERIFIED**. The metrics are for the Worker window, not a sitemap-specific trace; delayed/sampled aggregates and directly served assets need not match the six controlled HTTP calls one-for-one. Do not label the sitemap's222ms client wall time as CPU time. Wrangler's16ms startup report is also not request CPU.

[Cloudflare documents CPU rollover](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#cpu-time-per-execution) allowing higher quantiles without invocation errors and notes recent metrics can lag. The observed statuses were success, not exceededResources; no critical smoke or rollback condition was met. No extra requests, repeated metrics polling, higher limits, plan upgrade or paid fallback were used to obtain a better-looking result. No steady-traffic capacity guarantee is made.

## Cost, privacy and remaining NOT_VERIFIED items

The authorized path used the existing Free Worker and Free Supabase project, a local build and manual activation. Hosted build minutes and paid Builds consumption were NOT_APPLICABLE to this path. There was no R2 data-plane read/write/list, paid-provider invocation, migration, new resource, DNS/WAF change, article publication or DB-write operation. Source audit established the chosen homepage/guide/About/sitemap paths avoid view-count RPCs and media fetching; only HTML/XML/text was fetched. Secret/config preservation was read back without exposing values.

Global account charges, unrelated R2 consumption and Supabase organization-wide aggregate usage remain NOT_VERIFIED; local action counts are not a billing statement. The existing owner-confirmed Free plans support this release's scoped no-paid-fallback boundary. No inherited authorization failure was retried or credential store searched.

Still NOT_VERIFIED: sitemap-specific/steady CPU and heap margin, independent full RLS eligibility/parity, authenticated/admin production behavior, actual edge caching, verified search crawler/WAF decisions, Search Console/Bing ownership/submission/index coverage, and AI citations. Source-applicable security tests were reused; no claim of fresh production auth/security acceptance is made.

## Search readiness and exact next owner actions

Technical sitemap/robots/canonical/schema delivery is live and verified within this scope. The existing [owner search-console instructions](owner-actions.md) remain applicable: use the exact HTTPS URL-prefix property on workers.dev, retain real verification tokens, and submit `/sitemap-index.xml` through an already verified Search Console/Bing property when the owner chooses. No search-console write or draft publication was performed, and indexing/citation success is not inferred from deployment.

No immediate owner action is needed to complete this authorized release. For ongoing Free-plan availability, inspect the existing `lensden` Metrics > CPU/Errors dashboard during ordinary traffic; if resource failures arise, stop the affected work and use the retained rollback under the applicable release authority rather than increasing limits. This is not a request for a load test or another deployment. Search-console submission and editorial draft publication remain separate owner decisions.

Evidence: ignored `artifacts/qa/seo-geo-release/` contains preflight/rollback recipe, production build and network-guard logs, full artifact manifest, local-artifact receipt, activation/readback, single-use six-request HTML/XML receipts, XML validation and Worker metrics/unit evidence. No artifact or credential is committed by this documentation closeout.
