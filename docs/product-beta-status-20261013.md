# Public Beta Product Development Status

Historical product/source snapshot, not current release authority. Read
[PUBLIC_BETA_CURRENT_STATE](ops/PUBLIC_BETA_CURRENT_STATE.md) first for current
progress, authorization boundaries and the next action. Evidence below retains
its original local/historical scope; no Production permission is granted here.

## Source and Boundaries

Baseline: `88680a6eaab8de4123199f16b325ec0a430b0b86`, the current local
`origin/main` and previously deployed candidate. No fetch or remote GitHub query
was made, so this is not a claim about a newly verified remote HEAD. Local `main`
is older (`f2c7cc0b`); `D:/OpenGlass Hub` is a different, dirty feature checkout.
Neither checkout, branch nor its changes was reset or moved.

Independent development branch: `codex/product-beta-mobile-20261013`.
Worktree: `C:/Temp/ogh-product-beta-development-20261013`.
Only local work is authorized. No push, CI run, deployment, database connection,
Provider request, credential read or Catalog release took place.
MAX_ADDITIONAL_COST_USD remains 0. Owner billing work is independent of development.

The May MVP PRD describes a static Pages site without accounts or a database.
That document is superseded for progress assessment by actual routes, server
handlers, migrations and the forum-first PRODUCT.md. Do not reimplement existing
Auth/forum/admin systems because the old PRD marks them out of scope.

Recent product commits include `88680a6e` (admin device guards), `2aa5e065`
(localized 404), `8dd35b77` (Catalog/search/mobile safety), `7f0f72d6` (Catalog
parameters/media editing), and `88f87474` (legacy/structured parameter preservation).
Numerous intervening QA commits are not new missing product features.

## Evidence Levels

- VERIFIED LOCAL: actual current UI/component code exercised with synthetic
  local data. This does not prove Supabase RLS, live identity, mail, storage or costs.
- VERIFIED HISTORICAL PRODUCTION READ: immutable anonymous E_VERIFY receipt
  `C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/E_VERIFY_ANONYMOUS_SAFE.json`:
  PASS, 43 public GETs and 2 Deployment GETs; liveAuthAcceptance=NOT_VERIFIED,
  eVerify=INCOMPLETE. No request is replayed here.
- IMPLEMENTED / LIVE UNVERIFIED: real source paths and migrations exist, but
  successful authenticated/state-changing production acceptance is not established.
- PARTIAL: a tested shell/subflow is not the whole feature, locale or role matrix.
- KNOWN BUG: reproduced locally, or an explicitly stated source/numeric defect.

## Feature State Table

| Feature | Actual implementation/evidence | State and remaining scope |
| --- | --- | --- |
| Home | pages/index.astro, PostCard, public feed/news/circle queries; local populated render | VERIFIED LOCAL shell; actual live content/empty states not rechecked |
| Feed | pages/feed/index.astro, lib/forum-feed.ts; recommended/latest/hot ranking and pagination, active-circle filtering | IMPLEMENTED; local read/layout verified, real engagement writes unverified |
| Post detail/create | pages/posts/[id].astro, posts/new.astro, CreatePostForm, api/forum/posts.ts | IMPLEMENTED; local populated detail verified; Auth/moderation/publish/view-count side effects require separate live acceptance |
| Comments | CommentsSection, CommentForm, api/forum/comments.ts, comment interaction/visibility migrations | IMPLEMENTED; local empty reading state verified; create/delete/reaction/Realtime unverified live |
| Replies | parent_id threading, reply form and parent visibility guards in comments API | IMPLEMENTED; populated nested-thread/mobile interaction coverage still needed, not a missing backend |
| Circles | list/detail/new/manage, CircleOwnerDashboard, API lifecycle and safe purge migration | IMPLEMENTED; local public views verified, ownership/lifecycle writes unverified live |
| Public/private profile | u/[username], users/[id], me/edit, profile API and role lockdown migration | IMPLEMENTED; local populated public profile and signed-out private shells verified; real edit/media writes unverified |
| Auth | AuthPanel, AuthTurnstile, callback/reset/resend flows and localized validation | IMPLEMENTED; local form/layout only; real login/CAPTCHA/signup/mail/recovery remain NOT_VERIFIED |
| Search | search/index.astro, GlobalSearchBox, api/forum/search.ts and visibility filters | IMPLEMENTED; local device results verified; cross-role live discovery/access unverified |
| Notifications | NotificationsPage, HeaderNotifications, notification GET/PATCH and Realtime migrations | IMPLEMENTED; signed-out local state verified; recipients/read state/Realtime unverified live |
| Media | PostMediaGallery, image/video upload, TUS, guarded media proxies, ownership/provenance migrations | IMPLEMENTED / LIVE UNVERIFIED; no upload/download/delete or provider test in this task |
| Reports | ReportTrigger, reports API, AdminReportsPanel, report-target authorization migration | IMPLEMENTED; known modal focus/Escape defect remains below |
| Admin | devices/forum/reports/users/media/news/circles/moderation pages and role-guarded APIs | IMPLEMENTED; local signed-out shells only. Existing admin-circle pure tests retained; real admin mutations unverified |
| Device library | /devices/ canonical redirection, products index/brand routes, public-device-data.ts, schema foundation | Historical anonymous read evidence reused; current Mock responsive rendering verified; real authenticated RLS acceptance pending |
| Product detail | canonical brand/slug detail, ProductDetail, structured specs/sources/evidence reader and migrations | Historical public detail PASS reused. Local fixture intentionally lacks structured rows; it is NOT a replacement for that data proof |
| Settings/navigation | SiteHeader, locale preference store and user_preferences migration | IMPLEMENTED; local layout checked, full authenticated preference persistence not reverified |
| Shared destructive confirmation | GlassConfirmDialog used by comments, moderation, circle owner, devices, circles, reports and news admin | KNOWN BUG FIXED LOCALLY in this branch; separate deployment remains unauthorized |

No requested whole product module was found absent. Existence is not a claim
that all branches, roles, states, emails or uploads have passed acceptance.

## Desktop and Mobile Check

25 actual route sources are rendered through an isolated Astro/React preview at
1440x900, 390x900 and 430x900 (75 page/view combinations). The SDK/data boundary
is explicitly synthetic; production environment files and private account inputs
are not loaded. Client media/URLs cannot dispatch to a non-loopback origin;
server fetch/DNS/TCP are restricted to loopback. Local Vite HMR is not Supabase
Realtime. Real credentials, CAPTCHA, mutations and paid provider calls are disabled.

Routes include home/feed/post, circles/list/create/detail, public/private profile,
login, search, notifications, compose, products/detail, settings, reset-password
and all eight admin shells. This is not a full authenticated or populated-admin UI
PASS. Screenshots and machine results are local artifacts under
`output/playwright/product-development/`. Selected screenshots were visually
inspected; remaining views have automated geometry/screenshots, not individual
manual visual sign-off. No new blue content panel or design-system replacement.

Early preview failures were Mock/SDK-export/startup errors, not product findings.
Their diagnostic files are retained separately; only the final completed run is
used for responsive conclusions. Login form presence and console errors are
checked in addition to HTTP status and horizontal/control geometry.

Final result: 75/75 HTTP200 and geometry checks, no horizontal/control overflow,
but 6 views (home/feed at each width) emit the SharePostButton hydration mismatch
described below. This is not a full console-clean UI PASS. Login email/password
fields now render in the local Mock, not an empty client-only shell.

## Prioritized Remaining Work

### P0: Release Acceptance, Not New Feature Implementation

No new locally reproduced P0 product defect is established by this task.
Public Beta still needs real Auth/CAPTCHA, authenticated RLS, ownership denial,
controlled content/media/admin operations and cleanup/residue acceptance.
Dependencies: owner-resolved strict zero-cost billing evidence and independent
authorization. Acceptance: the existing mandatory matrix closes with truthful
evidence and no unresolved P0/P1. Do not replace these tests with Mock PASS,
repeat B/C/A/D, use Version151 after Hardening, or thaw Catalog.

### P1: Concrete Product/UI Tasks

1. DONE LOCALLY: shared destructive modal allowed keyboard focus into background.
   Baseline reproduction confirmed this with the real React component at 390px.
   Native dialog/top-layer isolation now blocks background interaction, loops Tab,
   keeps initial focus on cancel, prevents dismissal while pending, preserves exact
   confirmation text, restores prior scroll/focus and announces errors. Long content
   scrolls inside a viewport-bounded dialog. No API or mutation contract changed.
   Acceptance: new browser regression across both locales and all three widths,
   existing admin-circle contract tests and offline application build pass.
2. NEXT: ReportTrigger modal still opens with focus outside and does not close on
   Escape. Reproduced on the actual local circle route at 390px, signed out, without
   submitting a report. Fix only modal presentation/lifecycle, not report API/Auth.
   Acceptance: dialog contains focus/background, Escape/cancel restore trigger,
   loading cannot dismiss, reason fields remain visible at 390/430, no duplicate POST.
3. Dark-theme text/placeholder contrast: --text-faint=#737373 yields only 4.4288:1
   even against pure black; its ordinary text/placeholder uses cannot meet 4.5:1 on
   the current dark surfaces. Do not globally replace palette/style. Inventory
   applicable uses, raise only necessary text contrast, preserve decorative/muted
   roles, and verify actual composed backgrounds plus screenshots at mobile widths.
4. SharePostButton SSR/client consistency: server title is the relative postPath,
   client title is window.origin plus that path (SharePostButton.tsx lines 16-19).
   The actual local home/feed emitted React hydration diagnostics at all three
   widths. Do not mistake this for the earlier fixture failures. Resolve display
   attributes consistently while still copying an absolute URL on user action.
   Acceptance: SSR and initial client attributes match; copy fallback still works;
   zero share-button hydration warnings on home/feed in both locales.
5. Local populated interaction coverage: comments/replies, authenticated profiles,
   notification states, media player and actual admin tables at the same widths.
   This is missing local state coverage, not proof that those product features fail.
   Use existing synthetic fixtures/components; no paid API or production calls.

### P2: Nonblocking Follow-Ups

- Bring the outdated static-MVP PRD into agreement with forum-first PRODUCT.md.
- Markdown build configuration and invalid :global selectors in global CSS cause
  existing nonfatal warnings. Clean up independently without a framework migration.
- Additional motion/visual refinement and broader browser/device compatibility
  beyond the present desktop Chrome viewport checks. No claim of real iOS validation.

## Implemented Change and Validation

Changed product files: src/components/common/GlassConfirmDialog.tsx and
src/styles/community.css. Added test: scripts/test-glass-confirm-browser.mjs.
No new framework, UI library, service, auth handler, route, schema or RLS change.

- Real browser baseline reproduction: focus leaves the destructive modal.
- New browser regression: 66 scoped checks, en/zh-CN, 1440/390/430 widths; includes
  loading Tab, one confirm callback, cancellation rules, scroll restoration and
  oversized error content. This is a local fixture, never real data deletion.
- Existing test-admin-circle-lifecycle.mjs: 14/14 PASS with pure stubs and local
  network guard, preserving purge/confirmation/cancel invariants.
- Existing npm run build: PASS with --local-config pointing to loopback-only
  synthetic runtime variables and a local network-denial preload. This is a new
  frontend branch build, NOT replay of A_DEPLOY or a change to its frozen artifact.
- git diff --check: clean. No network install, push, paid CI or cloud build.

Suggested next development step: ReportTrigger accessibility/interaction repair.
Rough planning allowance for the three remaining reproduced/source-proven UI
issues is 2-3 small development iterations; expanded populated-state coverage needs its own
bounded work. A trustworthy Public Beta date cannot be inferred while live
acceptance remains open; billing resolution does not block these local tasks.
