# GEO Phase 2 release decision packet

Assessment: 2026-11-02, Pacific/Auckland. This is scoped evidence, not a second current-state baseline or release authorization. Current progress/release authority remains [PUBLIC_BETA_CURRENT_STATE](../ops/PUBLIC_BETA_CURRENT_STATE.md).

**Recommendation: HOLD production release.** Local integration checks pass; full type checking remains failing and current zero-cost capacity is unverified. The candidate can proceed to owner review and the established release decision process. Do not deploy the generated loopback artifacts.

## Source and integration — VERIFIED

- Branch: `codex/lensden-seo-geo-foundation`. Round started at `354a99e4` (37-file Phase 1 foundation), based directly on production-source `a00e7eb94e522c9aea2751e60f0233a34c372785`.
- Source HEAD for this round: `ffda077619f0dd9bf01b5e942aec6eca570ff96f`. The subsequent packet commit changes documentation only; its identity is the final branch HEAD (`git rev-parse HEAD`).
- Latest inspected production-source branch `codex/lensden-brand-migration-20261101` still points to a00e7eb9. It is an ancestor of the candidate, with zero divergent production commits. There is no committed source conflict to resolve. No merge, rebase, cherry-pick, reset or push was performed.
- Remote main read-back remains `98b23b911fe4729febc1bdf81375b638a165ec67`, an intentionally older application lineage with synchronized branding; it is not a replacement production baseline. No fetch/ref mutation was required.
- Producer worktree has unrelated working changes: newer current-state notes and an observed classifier dirty path. Its files were not modified. Preserve the complete producer status history during any later authorized integration; replacing that file with the candidate's older snapshot would lose evidence. A clean ancestor relationship does not authorize overwriting dirty files.
- Phase 1 metadata, canonical/search contract, JSON-LD, routes, publication filters, source presentation and three unpublished drafts are preserved. Phase 2 runtime changes are limited to sitemap request enforcement and the missing-admin-news-row fix. Auth enforcement files have zero diff from 354a99e4.

## Exact local changes — DONE

1. `scripts/test-moderation.mjs`: load the existing server moderation module through installed Vite SSR and close the loader. Native Node type stripping cannot resolve its transitive extensionless admin-assurance import. No production auth import or assertion was weakened; no dependency was added.
2. `src/lib/news.ts`: a missing admin news row now returns null rather than calling normalizeNewsRow(null). A two-case regression checks absence, retained administrative draft access and query-error propagation. This removes one real null-dereference defect and one type diagnostic.
3. `src/lib/seo-sitemap.ts`, `src/lib/supabase-server.ts`, `src/pages/sitemap.xml.ts`: the existing anonymous SSR client accepts an optional fetch override. Only sitemap supplies it. Its shared transport allows at most 40 physical GETs/invocation to the same origin and the three existing REST tables, has a 10-second shared deadline, disables SDK retries, refuses redirects, and cancels pending work on completion/failure. Other callers retain their original client options.
4. `scripts/test-seo-geo.mjs` and `scripts/test-seo-rendered.mjs`: actual-SDK and compiled-Worker coverage for aggregate exhaustion, transient responses, redirect rejection, redacted 503/no-store, target/method rejection and cancellation. The 20-page/5,000-row per-table limits and publication filters remain; aggregate exhaustion yields unavailability, never a partial successful sitemap.
5. Documentation: this packet, [complete type inventory](phase2-type-diagnostics.json), scoped plan, Phase 1 cross-reference updates and the new evidence entry in the existing baseline. See the [exact Phase 2 changed-file manifest](phase2-changed-files.txt), relative to 354a99e4.

## Verification — VERIFIED except where stated

| Check | Result | Evidence and practical limit |
|---|---|---|
| Initial npm test | BLOCKED, reproduced | ERR_MODULE_NOT_FOUND from Node's extensionless import; zero tests reached |
| Fixed npm test | VERIFIED PASS | 74 checks: moderation 48, trusted admin runtime 12, admin circle lifecycle 14; full default command ran |
| Existing signed-fixture admin MFA | VERIFIED PASS | 20/20; AAL1 denial, signed AAL2 verification, identity mismatch and staff effect-order checks; no production connection or DB AAL2 acceptance inferred |
| GEO/monitoring focused suite | VERIFIED PASS | 12/12, including real installed SDK, exactly 40 physical fetches across concurrent readers, no transient retry and no redirect follow |
| Admin news reader | VERIFIED PASS | 2/2; initial RED null dereference then GREEN; drafts remain admin-visible, errors still propagate |
| Existing public product reader and detail contract | VERIFIED PASS | 36 full and 5 preview fixture fields retained in English/Chinese; existing 404/301/503, missing projection and unsafe identity cases retained |
| Existing public news detail safety | VERIFIED PASS | draft/malformed/unsafe/private-ID cases retained with synthetic doubles; no live RLS proof |
| Local Worker build | VERIFIED PASS | existing local-config build path, sanitized child environment, no install or remote build |
| Actual compiled Worker | VERIFIED PASS | 11 check groups: canonical/schema/initial HTML, missing publication dates, guide 404, old news permalink bridge, sitemap success/exhaustion/520/302 behavior |
| Responsive | VERIFIED PASS | existing JS-disabled Chromium checks at 390/430/1280px, no document/body overflow, visible product/sources; synthetic fixtures only |
| Sitemap XML | VERIFIED PASS | parsed runtime map, sitemap index and fixed map; unique same-origin URLs, no private/admin/legal-consent routes |
| Full Astro check | BLOCKED | reproduced 56, reduced to 55; 0 new diagnostics, 0 remaining errors in directly changed Phase 1 paths; details below |
| Frozen type-debt ratchet | VERIFIED PASS | baseline 177/current 55, removed 122, new 0, changed diagnostic source lines 0; baseline manifest unchanged; not a full type-check PASS |
| Production application/RLS/security acceptance | NOT_VERIFIED | no application request, DB read/write or acceptance replay in this round |

Logs/screenshots/receipts are in ignored `artifacts/qa/seo-geo-phase2` and `artifacts/qa/seo-geo`. The compiled Worker intercepts all data requests. Its news/post view RPCs are in-memory fixtures, not production writes. No metadata, title, schema claim or article was published.

Independent source review: no actionable Critical, Important or Minor findings. The reviewer inspected implementation, scope and recorded results and independently confirmed the 55/new-0 debt ratchet; the reviewer did not independently rerun every suite. Review does not establish production billing, CPU/capacity, RLS or crawler behavior. Cancellation after in-flight dispatch and the deadline were reviewed in source; focused tests establish the physical request ceiling, retry/redirect rejection and cancellation before subsequent dispatch.

## Remaining type diagnostics and risk — BLOCKED for a fully green type check

All 55 remaining diagnostics match the pre-round set; none was introduced. There are 15 affected files. [The JSON inventory](phase2-type-diagnostics.json) contains every exact path, line, code and message. Primary categories are disjoint; production build/release impact is a separate dimension applying to all diagnostics.

| Primary risk category | Count | Impact and disposition |
|---|---:|---|
| Authentication and authorization | 3 | Two adapter/native-session union errors in dormant LegalConsentGate and one implicit parameter type in legal-consent API. No core admin-auth/assurance diagnostics or changes. Do not reactivate/refactor consent flow to silence types. |
| Security and moderation | 35 | Five moderation nullability/enum/SDK diagnostics, seven reports-preview/projection diagnostics, and 23 admin circle/media/post/queue join/fallback-shape diagnostics. Admin previews/owner/target mapping and provider integration remain risks requiring schema-aware review; green unit fixtures are not proof of live query shape. No assertion casts or policy weakening applied. |
| SEO/GEO shared dependency | 13 | Static legacy device-catalog optional-field/null/narrow-union errors. This module supplies brand metadata; public normalized device details use the separate published reader. No error is in a directly changed Phase 1 file. Preserve frozen catalog content; do not invent missing product facts to resolve types. |
| Other pre-existing | 4 | One legacy SiteLayout props error, two forum-feed legacy view_count fallback-shape errors and one profile-data error-nullability diagnostic. Full render/type coverage remains incomplete; these are not asserted harmless. |
| Production build / release impact (cross-cutting) | all 55 | Compiled Worker builds, but Astro check exits 1. The existing ratchet can establish no new debt; only the established release policy/owner can accept residual debt. It does not establish runtime safety for every affected flow. |

The single repaired diagnostic was news.ts:648: nullable database result passed into a non-null normalizer. The focused test established a real missing-record failure; fixing that one line was bounded and relevant to news integration. Other issues would require unrelated behavior changes or broad query/type work and remain explicitly open.

| Remaining file | Errors | Exact concern / practical impact |
|---|---:|---|
| components/legal/LegalConsentGate.tsx | 2 | Adapter/native-session expression is inferred as object-or-function; .token/.error access is not type-safe. Existing runtime consent removal remains unchanged. |
| pages/api/legal/consent.ts | 1 | verifiedUserId callback parameter lacks a type; server identity enforcement was not altered. |
| lib/moderation/local-sensitive-lexicon.server.ts | 1 | Nullable normalized term passed to includes inside a callback despite outer guard; source narrowing is incomplete. |
| lib/moderation/moderate-asset.server.ts | 1 | General string passed where ModerationReasonCode/null is expected; response reason vocabulary is not statically proven. |
| lib/moderation/moderation-media.server.ts | 1 | Reads the SDK bucket client's protected .url property; media URL construction couples to SDK internals. |
| lib/moderation/openai-moderation-provider.server.ts | 2 | Score threshold value can be undefined; optional score handling remains an explicit integration risk. No provider call made. |
| lib/server/reports.server.ts | 7 | Five joined-record array/object conversions and two missing .post preview members; administrative target-preview shape is not proven. |
| pages/api/admin/forum/circles.ts | 6 | Fallback omits status; joined profile inferred as array but accessed as object. Administrative owner/status presentation requires schema-aware review. |
| pages/api/admin/forum/media.ts | 5 | Joined post/profile fields are accessed as objects while inferred as arrays; administrative media attribution/target mapping remains uncertain. |
| pages/api/admin/forum/posts.ts | 7 | Joined profile/circle object access conflicts with inferred array shape; administrative post owner/circle display remains uncertain. |
| pages/api/admin/moderation/queue.ts | 5 | Joined target post/circle fields conflict with inferred arrays; moderation target preview needs verification. |
| lib/device-catalog.ts | 13 | Two never-typed includes arguments, three possible-null device accesses and eight optional static-product/media properties absent from the inferred union. No frozen catalog values changed. |
| layouts/SiteLayout.astro | 1 | Untyped Astro.props spread fails CommunityLayout's required title contract. The verified public GEO layouts render with explicit props. |
| lib/forum-feed.ts | 2 | Legacy query fallback shape lacks view_count required by the primary inferred result; fallback display typing remains unresolved. |
| lib/profile-data.ts | 1 | Error-nullability guard not retained at the message access; missing-banner fallback path remains to be typed/verified. |

Paths in this table are relative to src/. Do not infer an authorization bypass from a type diagnostic or infer safety from a passing build. The inventory identifies the exact compiler locations; the runtime implications above are bounded risks, except the separately reproduced and repaired news null dereference.

## Worker and zero-cost evidence

- VERIFIED: five authorized Cloudflare management GETs only (account selection, one deployment, account subdomain, script subdomain, subscription lookup). `lensden` is enabled on `ogh.workers.dev`, yielding `https://lensden.ogh.workers.dev`. Active deployment `98d3dd51-cf6c-46d7-ab57-de1b5c6a0859`, version `ce3581f7-d069-4fb9-ab72-e89363a1fc43` at 100%, created 2026-11-01T11:10:19.875758Z. This matches the producer's recorded a00e7eb9 release, not the undeployed GEO candidate.
- BLOCKED: subscription lookup returned 403; the connected OAuth session lacks billing-read capability. It was not retried and no credentials/token store was searched. Current plan, usage/headroom, account-wide actual charges and cost enforcement remain NOT_VERIFIED. Existing Free-plan notes are historical evidence, not a current guarantee. No billing/usage alpha endpoint, Analytics query or unrelated financial data was read.
- VERIFIED: [current Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) document 50 external subrequests/invocation on Workers Free. Phase 1's 20 pages times three readers could exceed that, and the installed SDK retries transient/network failures by default. Phase 2 enforces 40 physical calls and no retry/follow amplification. The compiled Worker proves graceful exhaustion; this is a per-invocation guard, not account capacity proof.
- NOT_VERIFIED: CPU/headroom under real content volume and concurrent traffic. The same official page documents a Free CPU allowance and daily request ceiling; no local wall-time or row limit is substituted for live plan/CPU/request evidence. No automatic upgrade, paid fallback, new service, storage, schema or infrastructure was introduced.
- VERIFIED local behavior / NOT_VERIFIED edge caching: successful sitemap responses emit public max-age=3600; failures emit 503/no-store. No Cache API, KV cache or new cache rule was added. This header alone does not prove Cloudflare edge cache hits or one database refresh per hour. Each uncached invocation can use up to the physical request ceiling.
- NOT_VERIFIED: current WAF/bot/AI crawler decisions and actual search-engine access. Existing shared robots rules and route exclusion checks pass locally; no DNS/WAF change, crawler spoof probe or public application fetch was made.

## Existing gates and owner boundary

The producer's latest uncommitted November 2 current-state entry records the brand/news release and Public Beta LIVE. Management deployment read-back matches that record. The candidate snapshot retains earlier v11 material describing its older NO_GO scope; neither historical text nor GEO test success grants a new production release. This round preserves completed acceptance and performs no H/B1/D, E_VERIFY, database AAL2 or Catalog thaw replay. The newer producer notes must be retained during later authorized integration.

DONE/VERIFIED: safe local test loading, bounded sitemap transport, missing-news fix, targeted validation, diagnostic classification and read-only deployment identity.

NOT_VERIFIED/BLOCKED: fully green type checking, current billing/capacity/cost enforcement, production CPU/data eligibility and crawler/security/search behavior. Release recommendation remains HOLD; the assistant does not authorize release.

OWNER_ACTION_REQUIRED **before release**, not to continue local work:

1. Review this candidate and authorize any integration/normal release explicitly, preserving the producer's working changes and newer status evidence. No merge/push/deploy is covered by this task.
2. Use an existing owner-authorized dashboard or read-only source to establish the current free plan, current consumption/headroom and applicable hard-stop/no-paid-fallback controls for the specific release and follow-up requests. Billing API access is unavailable here; no permission upgrade is required merely to finish this packet. Include relevant Worker/DB/shared-service impact; do not demand a guarantee about all future growth.
3. Disposition the remaining type debt under the actual release policy; if a zero-error checker is mandatory, keep release blocked until the affected components are repaired and verified in their own scope.
4. After a separately authorized normal build/release, verify actual canonicals, sitemap/RLS/crawler behavior and existing console ownership. GET news/post routes can write view counts, so a production smoke needs an explicit bounded grant. Never deploy the synthetic loopback dist. Draft review/publication remains a separate owner decision.

Work that can continue without owner involvement: bounded fixture/schema-shape investigation, targeted repairs with tests on this branch, local compilation/HTML/layout checks when changed inputs invalidate prior evidence, and editorial source review while drafts remain unpublished. No immediate manual action is needed to retain or review this local packet.
