# Lensden GEO Phase 2 implementation plan

> Execute inline with systematic-debugging, test-driven-development and verification-before-completion. The owner's Phase 2 brief is the specification. Current release authority remains docs/ops/PUBLIC_BETA_CURRENT_STATE.md; this plan is scoped implementation evidence.

Goal: repair bounded validation defects, assess integration and prepare a release recommendation without deploying, merging or publishing.

Architecture: retain commit 354a99e4 and its current branch. Reuse installed Vite for the Node test loading mismatch; preserve production authentication source. Keep the frozen type-debt baseline; classify remaining diagnostics instead of type assertions or unrelated refactors. Assess the sitemap's physical fetch budget, including SDK retries and redirects, against current Worker limits.

## Tasks

- [x] Verify source, parallel worktree changes, current-state records and management read-only deployment identity. Preserve producer's dirty classifier/status notes. No merge/rebase/cherry-pick/reset/push.
- [x] Reproduce npm test RED and load its extensionless Astro dependency through existing Vite SSR, closing the loader; run all default suites and signed-fixture MFA regressions without altering security assertions.
- [x] Parse and classify all 56 diagnostics by path, risk and impact. Fix only bounded material issues, retain zero new diagnostics, run the debt ratchet.
- [x] Test sitemap physical request bounds and SDK retry behavior. If the aggregate exceeds the documented Free envelope, enforce a per-invocation shared fetch ceiling with no retry/redirect amplification and fail closed to existing 503/no-store. Retain publication filters, XML and canonical behavior.
- [x] Run focused GEO, compiled Worker, affected regressions, XML and responsive checks; read-only integration comparison; independent review as required by requesting-code-review. Persist a concise decision packet and update only this round's evidence in the existing current-state baseline.

## Boundaries and findings

Latest local production-source commit remains a00e7eb9; GEO is exactly one committed descendant before Phase 2. Remote main remains 98b23b91, with intentionally older application lineage; it is not a deployment substitute. Producer's uncommitted current-state notes record the already-live brand/news release; those notes and its classifier modification remain untouched.

Management GETs confirm lensden deployment 98d3dd51, active version ce3581f7 at 100%, account subdomain ogh, script subdomain enabled. Plan/subscription GET returned 403; do not retry or search credentials. Current capacity remains NOT_VERIFIED. No application, database, mutation or deployment request was made.

## Review focus

Production auth source unchanged; tests retain all assertions and no provider traffic. Sitemap transport count includes hidden SDK retries and redirect chains, aggregate concurrency and failure cancellation. No metadata or content publication changes. Local loopback artifacts cannot be deployed. Existing Public Beta evidence is not a new release authorization.

## Completed evidence and disposition

Source commit ffda077619f0dd9bf01b5e942aec6eca570ff96f: 74 default checks, 20 signed-fixture MFA checks, 12 GEO checks, two admin-news regressions, local build and 11 compiled-Worker check groups pass. Product/news regressions, XML and responsive checks pass. Full type check remains failing at 55 inherited errors; frozen ratchet passes with zero new diagnostics. The single repaired diagnostic was a reproduced missing-admin-news-row null dereference. No unrelated auth/type refactor was made.

Independent review found no actionable Critical, Important or Minor findings. Per-invocation 40-fetch enforcement is proven locally; it is not production capacity proof. Integration ancestry is verified but no integration or release authority was inferred. Remaining debt is classified in docs/geo/phase2-type-diagnostics.json. Release recommendation is HOLD for the specific unknown cost/capacity evidence and residual type-debt disposition; safe local work remains independent. Full evidence and minimal owner steps are in docs/geo/phase2-release-readiness.md, with the new entry in the sole current-state baseline.
