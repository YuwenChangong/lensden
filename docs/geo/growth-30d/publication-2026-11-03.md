# First organic editorial batch — production receipt

DECISION=EDITORIAL_BATCH_PUBLISHED

Owner-approved manuscripts and brand copy: `b3bc035b50f0e079df3bd5f96fc6fc42d8410513`.
Actual deployed publication source: **`8cf38f2cadea415f4328642202e7772bb9f88dc5`**.
Isolated branch `codex/organic-editorial-release-v1`, checkout
`C:/Temp/lensden-organic-editorial-release-v1`. One fresh fetch confirmed main
`92b5e03fe912ea353cc805552210d052fedf382b`; approved source fast-forwarded locally.
No newer production release was overwritten: preflight active version remained
`7b0c94f9-f7ec-4a5b-aa8d-f807a7df0e46`, deployment `d23613cb-5298-43f8-89ae-7c51a73fc3c0`.

## Published content

All three have public byline **Jayden**, actual editorial publication metadata
**2026-11-03T04:34:27Z** (17:34:27 NZDT). Existing date formatting normalizes this
same instant to `.000Z` in HTML and Article JSON-LD. Worker activation is separately
recorded below; the editorial timestamp is not represented as the deployment time.

- [AR/AI glasses compatibility: a source-linked model checklist](https://lensden.net/guides/ar-ai-glasses-specifications-compatibility/)
- [PS5 to AR glasses: HDMI adapters, power and missing audio](https://lensden.net/guides/ps5-ar-glasses-hdmi-adapter-power-audio/)
- [AR glasses for coding: one screen or virtual monitors?](https://lensden.net/guides/ar-glasses-coding-virtual-monitors/)

Public editions reuse the existing English MDX guide workflow. Internal approval
metadata/preparation text and duplicate body H1 removed; original manuscripts
remain unchanged under this directory. External source links and every Unknown
classification preserved. VITURE Pro XR uses the model-specific manual's **46°**;
an explicit public note documents the older local catalog snapshot's **52°**.
No production catalog value was readjusted. No firsthand testing claim added.

Existing Guides index automatically includes published English MDX, so navigation
code needed no change. Approved homepage/About identity copy is deployed. The
complete application-source delta from the prior production lineage is six
content/copy paths: three new guide MDX, two About editions, existing i18n copy
catalog. Compare, guide handlers, discovery/pagination, security/auth/MFA/media,
API/RLS/schema, product records/URLs, dependencies and configuration unchanged.

## Build and manual release

- One actual production-configured local `node scripts/build-workers.mjs` build:
  PASS; outbound guard attempts **0**. The initial launcher failed before the
  build script ran because NODE_OPTIONS consumed Windows backslashes. This
  prelaunch failure is retained separately; corrected forward-slash guard path
  then allowed the sole actual build. No hosted build or historical test rerun.
- Production manifest: **382 files / 8,653,242 bytes**;
  SHA-256 `b15bcea9debba13c4eeff2ada0777859c1e48ff5aaf7680c6c98ffeb383159c2`.
  Generated runtime vars/resources/routes match the previous production build;
  compiled origin is lensden.net and existing dashboard variables retained.
- One installed-Wrangler generated-artifact deployment with `--keep-vars`,
  source SHA in version annotation. **34 existing Workers static asset files**
  uploaded; these are ordinary Workers Assets, not R2 objects or a new service.
- New Worker **`43c4fd98-86be-4a03-8714-1e93031e776c`**, active at **100%**.
- Deployment **`3fdf013f-0d78-48cc-94d1-de0ee20f2bd1`**;
  activated **2026-11-03T04:37:19.786559Z**.
- Management readback: all **27 binding metadata entries**, compatibility
  date/flags, apex/www domains, workers.dev and preview URL configuration retained.
  Secret values were neither read nor changed. Static security headers/redirect
  artifacts match the prior production artifacts.
- Rollback target `7b0c94f9-f7ec-4a5b-aa8d-f807a7df0e46` remains available.
  No concrete critical regression observed; rollback not required or executed.

## Bounded verification and observed metrics

Exactly **10** sequential anonymous GETs, each 15-second deadline / 1 MB maximum,
normal TLS certificate verification using system trust, manual redirects,
no cookies/retries/JavaScript/assets: three new guides, three previous English
guides, Guides index, sitemap.xml, homepage and English About. All HTTP **200**.
No post/news detail GET or view-count RPC; application/database writes **0**.

New guides: correct distinct canonical, one H1, English SSR article body,
description, index/follow, Jayden byline, Article/Open Graph publication metadata
and actual timestamp agree. Old three guides retain their Git blobs and remain
accessible with their original canonical URLs. Existing index links all six.
Dynamic sitemap contains **74 unique URLs**: previous **71 all retained**, exactly
these three new canonical guide URLs added once each. Homepage/About brand text
read back successfully. No standalone compatibility feature introduced.

One existing Free metrics view (Last 24h / All deployed versions): active
`43c4fd98` has **11 observed invocations**, errors **0**, error rate **0%**, median
CPU **8.77 ms**. All-version exceeded CPU, exceeded memory, internal, load-shed and
uncaught-exception counts each **0**. Historical Supabase subrequest 4xx **72** is
an all-version aggregate, not attributed to this release. No new logging enabled.
These are short-window observations, not sustained performance, real login/MFA
E2E, crawler access or indexing/citation acceptance guarantees.

## Cost and operational boundary

Current Workers dashboard displayed **217 / 100,000** daily account requests and
Workers billable usage **$0.00** before deployment; existing Nov 3 Free admission
evidence reused. One unnecessary account subscriptions read was rejected 403;
not retried and no broader privileges requested. Overall account/R2 bill is
**NOT_VERIFIED**, not assumed zero. No paid service/API/fallback, plan upgrade,
limit increase, hosted build, new resource, DNS/WAF/config change, database/catalog
write or R2 object operation was performed. Only authorized Worker code/assets
publication occurred. No outreach or community post. No Git push/remote merge.

Final readback: Worker `auto_build_enabled=false`, previews=false; legacy Pages
deployments_enabled=false, production_deployments_enabled=false, preview=none.
**Automatic CI/CD remains disabled.** Remote main still requires a separately
authorized synchronization to include this new local publication source; no extra
production release is needed for these already-live articles.

Evidence (local ignored directory):
`artifacts/qa/organic-editorial-release-2026-11-03/`: content-preparation and
content-verification, preflight, retained preload-failure receipts, build dispatch /
receipt / log / guard, artifact-manifest, deploy dispatch / receipt / log,
post-deployment, ten HTTP dispatches / receipts / response bodies,
live-validation, metrics-receipt and completion. No credentials stored in receipts.
