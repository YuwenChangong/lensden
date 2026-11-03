# Import real Search Console and Bing exports locally

Use the existing [monitoring schema and 20 queries](README.md). This is a manual CSV normalization process using the existing validator, not a new importer/service. No real exports have been supplied, and no measurements were created during preparation. Do not replace uncollected observations with sample numbers.

## 1. Export from existing owner access

Use the already verified **https://lensden.net/** property (or its existing verified parent property with an exact new-origin filter). Do not repeat verification or submission, request new billing access, call APIs or enable a bulk export service.

Choose one complete finalized 7-day window and retain the exact dates, provider timezone, country/device/search-surface filters and export time. Indexed-page measurements are dated snapshots, not 7-day sums. Preserve any incomplete/recent-data warning and keep the old workers.dev origin separate.

- **Google:** open the existing Performance report, select Web and the chosen range, and use Export > CSV. Retain its chart/date table, Pages table and filter/context files separately. Use available dedicated generative Search/Discover reports only when actually present in that account. For indexed pages, use Page indexing's indexed total/trend for the selected snapshot; example URL tables are not a complete indexed-URL inventory. See [Google's direct-export help](https://support.google.com/webmasters/answer/12919797).
- **Bing:** in the existing site's Search Performance, select the same dates and explicitly record the source selection (All, Web/Chat or another offered surface), then Download CSV. Keep page, query and chart exports distinct. Use existing Site Explorer/indexing data for an indexed snapshot and AI Performance data for actual citations only if offered. Do not relabel ordinary search impressions as citations. [Bing's Search Performance help](https://www.bing.com/webmasters/help/search-performance-c680da36) documents CSV download and source-dependent metrics.
- **AI citations/referrals:** if a report has no export, retain an authorized private screenshot/readback of its exact displayed value and context before manual entry. Missing access/tab/data is unavailable, not zero. No existing analytics export means no referral measurement; console clicks do not establish AI referral visits.

Keep raw exports immutable and private, for example under ignored `artifacts/qa/geo-search-import/raw/`. No files under `public/` or content collections. Record filenames and table/sheet/row references; optionally record local SHA-256 for later matching. Do not commit raw account data or share credentials. Retain sensitive query details only in private originals; normalized output is printed by the validator, so omit sensitive queries there.

## 2. Normalize to the unchanged schema

Make a working copy of the header-only `observations.csv` under ignored `artifacts/qa/geo-search-import/observations.csv`. Use a local CSV editor/worksheet and save UTF-8 CSV. Do not feed provider exports directly to the validator: report columns and layouts differ.

```csv
date,platform,report,metric,value,url,query,test_result,evidence,notes
```

| Actual source measurement | platform | metric | Suggested report |
|---|---|---|---|
| Google indexed total at a dated snapshot | google_search_console | indexed_pages | page_indexing |
| Google Web impressions, property total or one page | google_search_console | organic_impressions | web |
| Available Google dedicated generative-view impressions | google_search_console | ai_search_impressions | generative_search or generative_discover |
| Bing indexed total at a dated snapshot | bing_webmaster_tools | indexed_pages | site_explorer or search_performance |
| Bing search impressions under the actual selected source | bing_webmaster_tools | organic_impressions | search_performance |
| Actual Bing AI Performance citation total or cited-page row | bing_webmaster_tools | ai_citations | ai_performance |
| Existing analytics report's actual AI referral visits | analytics | ai_referral_visits | referral |

For each real source row:

1. `date`: ISO `YYYY-MM-DD`; use period end for performance totals, source day for daily rows, snapshot date for indexed totals. Preserve start/end/timezone in `notes`; do not silently reinterpret provider days as NZ days.
2. `value`: the verified non-negative integer count. Preserve a genuinely observed zero. Leave blank for unavailable/uncertain values and explain why. No percentages, averages, clicks, positions or estimates in a count field. Do not round abbreviated dashboard values such as `1.2K` into purported exact counts; obtain the underlying exact export or leave unavailable.
3. `url`: blank for property totals. For a page row, use its evidenced HTTPS canonical `https://lensden.net/...` URL, without query/fragment/credentials. Keep the original URL in private evidence. Do not silently transfer old-host data, guess a canonical mapping, or merge several exported URL rows after stripping query strings. If mapping is uncertain, defer that row.
4. `query`: blank for totals/page rows. Populate only for an actual nonsensitive query-level measurement and record that scope. `test_result`: blank for every console/analytics row. The existing manual-test enum is for actual Q01–Q20 attempts only; no queries were run here.
5. `evidence`: local relative path plus table/row or screenshot reference, traceable to the immutable original. `notes`: property, report name, source, aggregation scope (property/page/query/day/period), period, timezone, filters, export time, completeness/truncation caveats and any unavailable-value reason. If two reports differ in scope, keep that difference explicit.

Use the editor's CSV quoting: fields containing commas, quotes or line breaks must be quoted; an internal quote becomes two quotes. Do not change the header/order or add columns. Convert locale date/number formatting only after confirming what it means; do not blindly strip decimal separators.

## 3. Prevent false zeros and double counting

Google documents that unavailable `~`/`-` display values can become **0 in exported data**. Compare affected cells with the original report; keep uncertain exported zeros blank with a reason. Do not treat every zero as missing either. Google's export help also documents row limits and actual chart totals: a truncated table is not a full inventory.

- Prefer the report's actual selected-period property total. A daily chart may be summed only when every day is present, finalized, non-overlapping and matches that report/filter scope; document that derivation. Do not estimate a total from a truncated page/query table.
- Keep property totals and page/query breakdowns separate; never add them together. Do not sum query rows to reconstruct a total when anonymized/omitted queries exist.
- Do not add Google generative impressions to the overlapping Web total. Bing All-source impressions and its component surfaces also require separate scopes; citations are a different measure.
- Do not sum indexed-page snapshots over days or count exported example URLs as all indexed pages. A sitemap URL count is not an indexing metric.
- Before appending, compare date/platform/report/metric/url/query **and the period/filter/scope in notes** against existing observations. Skip exact duplicates; review corrections explicitly rather than appending a second copy as new growth. The validator does not deduplicate or validate provider totals for you.

## 4. Validate, review, then retain

From the repository root, run only the local parser:

```powershell
node scripts/geo-monitor.mjs --input "artifacts/qa/geo-search-import/observations.csv"
```

It accepts up to 2 MB, prints parsed observations, and reports `externalRequests: 0` and `writes: 0`. It does not import into a database, fetch a console, verify ownership, assess evidence quality, aggregate or append anything. For larger real files, split complete rows into separately reviewed normalized files; never silently truncate.

Review every parsed value against its source and inspect missing values as `null`. Confirm no secrets/sensitive queries appear in normalized output. Retain the normalized baseline and evidence privately; add only approved sanitized real observations to the tracked CSV when useful, preserving the same schema. Compare subsequent windows with identical scope. Leave `test-queries.csv` and the 20 prompts unchanged.

Readiness result: **process ready; real import NOT_PERFORMED; search/AI/referral measurements NOT_COLLECTED**. No paid API, new analytics, monitoring retry or fake example rows are needed.
