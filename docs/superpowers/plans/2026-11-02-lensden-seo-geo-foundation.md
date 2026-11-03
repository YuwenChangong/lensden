# Lensden SEO and GEO foundation implementation plan

> Execute inline using the executing-plans and verification-before-completion skills. The owner's attached 2026-11-02 brief is the specification and authorization for safe local implementation.

Goal: make eligible existing content discoverable and evidence-aligned without publishing, deploying, changing database/security policy, or using paid services.

Architecture: extend existing Astro 7.2.10 SSR layouts and anonymous public readers. Keep React islands, routes, locale behavior, release gates and dependencies. Drafts and measurement files live only under docs/geo, outside content collections. Reuse existing product SSR compiler for testing.

## Tasks

- [x] 1. Record source-backed baseline, privacy boundaries and current identity. Preserve unrelated dirty work by using a managed worktree from a00e7eb9.
- [x] 2. Write failing behavioral tests for canonical safety, private/error indexing, evidence-only Product and Article/Breadcrumb schema, bounded sitemap collection, XML escaping and completeness. Implement reusable src/lib/seo.ts and src/lib/seo-sitemap.ts; integrate existing layouts and routes. Keep inherited training preferences. Missing guides return a real 404.
- [x] 3. Correct SSR sitemap route discovery using content IDs/slugs, published device identity-only reads, persistent news timestamps, bounded pagination and 503/no-store on incomplete reads. Exclude community post URLs pending a bounded, verified publication projection; retain anonymous active-circle eligibility. No new schema or grants.
- [x] 4. Add reusable five-kind editorial template, three source-supported unpublished English drafts, blank monitoring CSV and 20 manual queries. Verify official documentation with bounded browsing; do not fetch production application routes (GETs can write view counters).
- [x] 5. Run local build with loopback synthetic configuration, Astro check and debt ratchet, focused tests, existing npm test, SSR HTML and browser layouts at 390/430/desktop, and diff checks. Review privacy, source parity, limits, and failure handling; record exact failures and owner actions in docs/geo/README.md.

## Review focus

Off-origin/query-bearing canonicals; drafts or private routes emitted as indexable; structured data adding unsupported facts; REST server caps silently truncating sitemaps; unstable timestamps or unavailable DB producing a cached partial sitemap; missing guide redirects hiding a 404; escaped JSON-LD and XML with hostile strings. Validate actual SSR output in addition to pure helpers.

## Decisions

Extend existing layout and data paths rather than new infrastructure or a separate SEO subsystem. Do not auto-materialize query-based comparison pages: current brand comparison islands lack independently published editorial comparisons. No external Search Console/Bing/Cloudflare account actions are required for local work.

## Progress

Baseline npm test: FAIL before edits, ERR_MODULE_NOT_FOUND for src/lib/server/admin-assurance from the inherited extensionless Node import. Preserve and report; continue independent work per owner's execution policy.

Implementation complete locally. Final review: fresh read-only reviewer; no Critical issues. Fixed both Important findings with RED/GREEN: canonical legacy-news mapping and omission of unknown publication dates. Added count-change/exhaustion/duplicate coverage. Search canonical regression fixed and existing suite PASS.

Ruling: preserve the established noindex search base canonical while continuing to exclude search from sitemap; removing it broke an explicit existing regression contract. Cost if wrong: search engines may handle noindex/canonical differently; production remains owner-verified.
Ruling: omit unreliable device/news lastmod rather than mislabel a view-counter or partial-record timestamp. Cost if wrong: slower freshness discovery until a real editorial timestamp is available.
Ruling: leave community posts out of sitemap pending bounded anonymous parent-circle visibility proof; existing public circles remain included. Cost if wrong: slower discovery of approved posts, not privacy expansion.
Ruling: keep the candidate local on its branch, without merge/push/deploy or publication, per the owner's release controls.
