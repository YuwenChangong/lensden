# Lensden Docs

## QA harness

- `npm run qa:fast` runs the quickest relevant local checks and fails closed to RELEASE for HIGH-risk changes.
- `npm run qa:feature -- <area>` runs targeted local checks for an area and its declared dependencies; an explicit area cannot lower the detected risk.
- `npm run qa:release` runs the critical local release gates and conditionally runs the local migration-version schema guard when database paths change.
- `npm run qa:prod` runs the minimal read-only production smoke using allowlisted HTTPS GET/HEAD requests.

These commands do not deploy, migrate production data, connect to a production database, or mutate providers. `qa:prod` permits production HTTP only; it does not authorize writes, secret output, or other production changes.

## Ops

- `D:\OpenGlass Hub\docs\ops\deployment-playbook.md`
- `D:\OpenGlass Hub\docs\ops\environment-and-secrets-checklist.md`
- `D:\OpenGlass Hub\docs\ops\production-smoke-checklist.md`
- `D:\OpenGlass Hub\docs\ops\migration-runbook.md`
- `D:\OpenGlass Hub\docs\ops\rollback-runbook.md`
- `D:\OpenGlass Hub\docs\ops\post-release-monitoring.md`
- `D:\OpenGlass Hub\docs\ops\preview-qa-safety.md`

## Existing release docs

- `D:\OpenGlass Hub\docs\production-readiness-gate.md`
- `D:\OpenGlass Hub\docs\production-incident-runbook.md`
- `D:\OpenGlass Hub\docs\post-launch-watchlist.md`
- `D:\OpenGlass Hub\docs\functions-deprecated-risk.md`
- `D:\OpenGlass Hub\docs\openai-moderation-setup.md`
- `D:\OpenGlass Hub\docs\moderation-policy.md`

## Notes

- Treat `docs/ops/*` as the primary source for post-release hardening and day-2 operations.
- Treat preview QA as read-only by default. A preview sharing the production Supabase ref is production-backed; follow `docs/ops/preview-qa-safety.md` for the exceptional destructive-QA contract.

## Product Surface

Current direction:
- `/products/` is now the primary product discovery surface for public browsing.
- The main product page uses a clean brand-module grid: brand name, stable count badge, a few product preview pills, and a single `查看产品` entry.
- `/products/` keeps one search input and filters brand modules by brand name, product name, and use case text only.
- Full product cards and compare actions now live on `/products/[brand]/`, not on the main `/products/` page.
- Brand pages keep comparison lightweight with a hard cap of 3 selected products and no compare-specific search box.
- The product surface intentionally keeps copy sparse and placeholder visuals minimal and product-name led.
- Public product scope is now focused on AR / AI glasses. Apple Vision Pro and XR-headset framing are removed from the main public product surface.
- Legacy `/devices/` routes are no longer a primary public discovery surface and should redirect users back into `/products/`.

## Device Library

The following baseline records the earlier Device Library release; it is not the current production-origin guidance. See the public [Search Console checklist](/about/search-console-launch-checklist/) for the current site URL.

Current production baseline:
- Production URL: `https://lensden.ogh.workers.dev`
- Latest production/main commit: `475fd71eee66d62b8962323879158ba27169a652`
- No DB migration has been added for the Device Library release stack so far.
- No production data was touched by the Device Library releases so far.

Release stack:
- Device Library MVP v1
  Routes: `/devices/` and `/devices/[slug]/`
  Data source: static local data in `src/data/devices.ts`
  Scope: 13 seed devices, public no-auth access, search/filter/card/detail pages, custom 404 for unknown device slugs
- Device Library Accuracy & Comparison v1
  Added static accuracy metadata: `verification_level`, `specs_verified`, `last_checked_label`, `source_links`, `comparison_highlights`, `limitations`
  Added verification badges, source/accuracy sections, conservative caveat copy, and lightweight comparison for up to 3 devices
  Missing comparison values render as `TBD`
  Policy: do not invent precise specs; unverified values should be omitted, marked `TBD`, or left as not verified
- Device Discussion Entry v1
  Added `讨论这台设备` section on device detail pages
  Added discussion entry links to `/feed/?compose=1&device=<slug>`, `/posts/new/?device=<slug>`, `/circles/`, and the current `/products/` surface
  `/feed/` shows a safe discussion banner for known device context
  `/posts/new/` supports safe starter copy based on known local device data
  No auto-post and no auto-submit behavior

Architecture and safety notes:
- Legacy device routes remain available only as downline redirects for old links and discussion context.
- Product discovery is now brand-first on `/products/`, while `/devices/` should not be treated as a primary browsing surface.
- Device pages now include SEO metadata plus conservative JSON-LD structured data for the library and device detail pages.
- Device discussion context is query-param based and only activates for known local device slugs.
- Device slug input is sanitized and must match entries in `src/data/devices.ts`.
- No arbitrary query text is injected into post prefill.
- Source/verification labels are guidance, not guarantees that every field is complete or final.
- Structured data intentionally omits prices, offers, ratings, and reviews unless those fields can be verified safely.
- Comparison is a lightweight MVP meant for high-level orientation rather than exhaustive buying decisions.
- Existing feed, circles, and device browsing flows remain separate from post creation until a user explicitly acts.

Future work:
- DB-backed device pages
- sourced spec ingestion/update workflow
- community corrections
- user reviews
- related posts aggregation per device
- device-specific circles or tags
- richer comparison table
- image/media handling for devices
- full sitemap and SEO audit
