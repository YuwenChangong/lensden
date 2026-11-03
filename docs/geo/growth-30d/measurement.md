# Fixed first-30-day measurement routine
Prepared 2026-11-03; period November 3–December 2, 2026 (30 calendar days, Pacific/Auckland). **No automation or paid API.**

Keep the existing 20-query file and normalized observations schema unchanged. Use this fixed subset, copied exactly from the existing framework:
| ID | Exact prompt |
|---|---|
| Q04 | What should I verify before using XREAL One glasses with my phone? |
| Q07 | How should I compare XREAL One and XREAL One Pro using verified specifications? |
| Q11 | What is the difference between panel brightness and eye brightness in AR glasses? |
| Q15 | Does a USB-C connector guarantee compatibility with display glasses? |
| Q16 | What should I verify before using AR glasses with an HDMI game console? |
| Q18 | What SDK and permission limits should developers check before choosing AR glasses? |

## Sampling, not a ranking or citation-rate estimate
One manual baseline and one day-30 repeat: six prompts in each of Google, Bing, ChatGPT Search, Gemini and Perplexity. Maximum 30 completed attempts per window; no automatic retries or prompt variants. Respect each free interface's availability and stop on a limit. No need to sign up, subscribe or purchase access for this task.

For each attempt retain exact query, time/timezone, locale, engine/interface/model when shown, whether web search was enabled, visible result/answer and actual cited Lensden URL if any. Do not give the model the Lensden URL or tell it to cite Lensden. A personalized answer is a dated sample, not a population metric.

- Google/Bing ordinary result visibility: keep a private SERP observation with result URL and position only when actually observed. It is not an AI citation. Use console exports for normalized impressions/index metrics.
- Actual AI answer with a visible source link to Lensden: manual_ai_search / manual_citation_test, blank numeric value, test_result=cited. Completed AI answer without that citation: not_cited. Failed/unavailable search or unclear attribution: inconclusive.
- Distinguish Gemini's displayed citation panel from merely mentioning a brand. Do not count an answer that only repeats supplied context.
- ChatGPT/Gemini/Perplexity observations do not establish Google or Bing index coverage.

Use [the existing import workflow](../monitoring/import-exports.md) for real GSC/Bing exports, retaining report scope and timezones. Compare complete, equivalent 7-day windows; do not sum page/query totals into property totals. Use existing analytics only for actual referral observations; do not install analytics or infer AI visits from direct traffic.

## Honest starting record
| Measure / source | Current evidence |
|---|---|
| GSC indexed URLs / impressions | NOT_COLLECTED; no real export supplied |
| Bing indexed URLs / impressions / AI citations | NOT_COLLECTED; no real export supplied |
| ChatGPT Search / Gemini / Perplexity direct citation samples | NOT_RUN |
| Existing analytics AI referrals | NOT_COLLECTED |
| New content-level search performance | NOT_APPLICABLE_YET: these three candidates are unpublished |
| Third-party recognition / earned links | NOT_OBSERVED in this task; no outreach sent |

A single free web-search-tool query, **"Lensden" "lensden.net" AR AI glasses**, returned an empty result set on 2026-11-03. This is a limited tool observation, not a native Google/Bing query, not proof of non-indexing and not a numeric zero for any console metric. Homepage/About retrieval also failed in the research tool; a separate bounded local TLS attempt failed issuer validation. No TLS protection was disabled and no crawler-access conclusion is drawn.

No observation rows were fabricated: observations.csv remains header-only. Use the existing local geo-monitor validator when real rows arrive. Store raw exports/screenshots under ignored artifacts/qa/, not public/. A site map's advertised URL count is never the indexed-page count.
