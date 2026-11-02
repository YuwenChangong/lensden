# Manual SEO and AI-search measurement

No metrics have been collected. observations.csv intentionally contains only its header. Blank value means unavailable, never zero. The 20 queries are test prompts, not claims that Lensden ranks or is cited. Run tests manually in existing free interfaces, within their limits; no paid AI API or automated scheduled requests.

Current baseline scope: **https://lensden.net/** following the authorized domain cutover. Keep old-host observations separate. See the [post-launch report](../post-launch-2026-11-02.md) for owner registration steps, content findings and the six-measurement baseline. Use the first complete finalized 7-day reporting window, then compare equivalent weekly windows. Record page-level rows separately from property totals; do not sum both. Unrun queries produce no observation rows.

## Workflow

For real dashboard files, follow [the local export/import instructions](import-exports.md), including Google's unavailable-value-to-zero caveat, exact field mapping and source reconciliation. Provider CSVs cannot be passed directly to the normalized parser. No export or metric has been fabricated.

1. Export authorized Google Search Console, Bing Webmaster Tools, or existing analytics data manually. Keep raw exports outside public directories; remove account identifiers and sensitive query strings. Do not commit raw exports.
2. Map each measurement to one row in observations.csv. This is a normalized input format, not a claim that all providers export identical columns. Preserve report name, date, measurement scope and local evidence reference. Use HTTPS canonical page URLs without query strings; leave url blank for property-wide observations.
3. Run `node scripts/geo-monitor.mjs --input docs/geo/monitoring/observations.csv`. It reads a local file up to 2 MB, validates, and prints distinct observations; it makes no request or write. It intentionally does not sum overlapping reports or treat missing values as zero.
4. Weekly, compare the same metric/platform/report/date-window/scope. Document gaps and changes before drawing conclusions. Indexed pages are a snapshot, not a sum over days. Citation counts are not visits, impressions, rankings or endorsements.

| platform | metric | report examples | interpretation |
|---|---|---|---|
| google_search_console | indexed_pages | page_indexing | property snapshot, source report and scope required |
| google_search_console | organic_impressions | web | Web total includes AI surfaces; not a non-AI estimate |
| google_search_console | ai_search_impressions | generative_search / generative_discover | dedicated AI report; do not add to Web total |
| bing_webmaster_tools | indexed_pages / organic_impressions | site_explorer / search_performance | preserve source definitions and date range |
| bing_webmaster_tools | ai_citations | ai_performance | citations across the report's supported experiences |
| analytics | ai_referral_visits | referral | use only an existing authorized analytics source; preserve session/visit definition |
| manual_ai_search | manual_citation_test | manual | value blank; test_result cited / not_cited / inconclusive |

`date` is the observation or period-end date (YYYY-MM-DD); put period start, timezone, country, device, search surface and aggregation scope in notes. A manual test records platform/model/interface in report/notes, exact query, locale, date, cited URL in url, and a local evidence reference. A visible direct Lensden citation is `cited`; a completed answer without one is `not_cited`; an inaccessible interface, failed answer, unclear attribution, or uncertain navigation-only link is `inconclusive`. Do not extrapolate the 20 tests to population metrics.

Source interfaces checked 2026-11-02: Google's [Generative AI report announcement](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports) describes separate AI views that overlap the overall report. Bing's [AI Performance announcement](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/) describes total citations and cited pages. Actual owner-property availability and measurements remain NOT_VERIFIED. AI referral attribution may be missing or stripped; record unknowns rather than infer AI visits from all direct traffic.
