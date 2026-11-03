# Production Readiness Gate

Historical gate for the source/origin stated below, NOT the current Workers
Public Beta decision. Its original GO is preserved as scoped historical evidence.
Read [PUBLIC_BETA_CURRENT_STATE](ops/PUBLIC_BETA_CURRENT_STATE.md) first; current
E_VERIFY is incomplete and Public Beta GO is NOT_AUTHORIZED. Do not replay this gate.

## Current commit

- Branch: `hardening/production-readiness-gate`
- Base main commit: `798c9134c04d6ff07b499cca5d441bdb5f792930`

## Target readiness level

- Target: public beta / 正式开放测试

## Gate summary

- Status: `GO`
- GO level: `Public beta / external user testing`
- Reason: production ordinary-user and admin live QA have been manually completed, the old suspicious test post has been hidden, and Cloudflare/Supabase production configuration has been manually confirmed for this release gate.
- Public production route smoke check passed on `https://openglasshub.pages.dev`
- Unauthenticated admin/API block check passed on public production
- Local build and static audits passed after this hardening round

## Blocking issues

- No release-blocking issues remain for public beta / external user testing.

## Fixed issues

1. Posts/comments no longer auto-publish `review` outcomes as public content.
2. Circle creation now runs moderation on `name` and `description`; suspicious or rejected content is blocked before public creation.
3. Upload Turnstile flow is hardened to a risk-based mode with explicit env control: `UPLOAD_TURNSTILE_MODE= risk_based | required | off`.
4. Normal authenticated low-risk uploads remain available; high-risk large uploads can still require Turnstile when configured.
5. Deprecated `functions/` path is documented as not part of current Astro Cloudflare Pages runtime.

## Accepted risks

1. `npm audit` still reports upstream framework/tooling advisories in the Astro / Vite / Wrangler chain.
2. Media uploads still rely on auth + storage policy + rate limit; no image/video content moderation provider is enforced in this round.
3. `functions/` remains in-repo for historical reference, but is documented as deprecated and not on the active deploy path.
4. Early-stage public beta still requires close monitoring, rollback readiness, and active user feedback review.

## Release scope

### Allowed now

- 可以给真实外部用户测试
- 可以开始小规模引流
- 可以收集真实反馈
- 可以测试论坛、产品库、圈子、新闻、账号、上传、审核闭环

### Not yet

- 不代表无限制大规模商用
- 不代表依赖高危已经彻底消除
- 不代表图片/视频内容审核已经完整
- 不代表中国大陆访问已经完全稳定
- 不代表不需要监控、备份或用户反馈机制

## Production config checklist

### Cloudflare Pages

- [x] Production branch is `main`
- [x] Production deployment points to latest approved main commit
- [x] Latest production build succeeds
- [x] Preview and production env vars are separated
- [x] `SESSION` KV binding exists
- [x] R2 binding exists
- [x] `PUBLIC_SUPABASE_URL` present
- [x] `PUBLIC_SUPABASE_ANON_KEY` present
- [x] `SUPABASE_URL` present
- [x] `SUPABASE_ANON_KEY` present
- [x] `RATE_LIMIT_SALT` present
- [x] `PUBLIC_TURNSTILE_SITE_KEY` present and is site-key only
- [x] `TURNSTILE_SECRET_KEY` present and remains server-only
- [x] `UPLOAD_TURNSTILE_MODE` set to `risk_based` or stricter
- [x] `DEV_TURNSTILE_BYPASS` is `false` in production
- [x] Turnstile hostname allowlist includes production domain
- [x] Source map policy reviewed
- [x] No public env var contains service-role credentials

### Supabase

- [x] Moderation migration applied on production
- [x] `posts.moderation_status` exists
- [x] `comments.moderation_status` exists
- [x] Public queries exclude `pending_review`, `rejected`, `hidden_by_admin`
- [x] Storage policies reviewed for post-media / circle-covers / profile assets
- [x] Production auth redirect URLs include production domain
- [x] Email confirmation flow works
- [x] Admin role / moderator permissions confirmed
- [x] Backup / export strategy confirmed

## Live QA checklist

### Public production checks completed in this round

- [x] `/` opens
- [x] `/feed/` opens
- [x] `/news/` opens
- [x] `/search/` opens
- [x] `/login/` opens
- [x] `/posts/new/` shows logged-out gated state
- [x] `/circles/new/` shows logged-out gated state
- [x] `/products/` opens
- [x] `/devices/xreal-one/` opens
- [x] `/admin/moderation/` shows login gate when unauthenticated
- [x] Unauthenticated `/api/admin/moderation/queue` blocked with `401`
- [x] Unauthenticated `/api/admin/forum/posts` blocked with `401`
- [x] Unauthenticated `/api/users/me/notifications` blocked with `401`
- [x] Unauthenticated `/api/forum/media-upload-guard` blocked with `401`
- [x] Production page source keyword search found no `sourceUrl`, `vr52`, `参数来源`, `资料来源`, `最后核对`, `SUPABASE_SERVICE_ROLE_KEY`, `sensitive-terms`, or `blocklist`

### Ordinary user

- [x] Login works
- [x] Logout works
- [x] Avatar upload works
- [x] Profile save works
- [x] Clean text post publishes
- [x] Clean comment publishes
- [x] Suspicious post becomes pending or is blocked
- [x] Explicitly violating post is rejected
- [x] Image post works
- [x] Video post works or is intentionally disabled
- [x] Notifications load
- [x] Search works
- [x] Circle detail opens
- [x] Own profile opens
- [x] Second normal user cannot view pending/rejected/hidden content

### Admin

- [x] `/admin/moderation/` opens
- [x] Pending queue visible
- [x] Approve works
- [x] Reject works
- [x] Hide works
- [x] Rejected/hidden content disappears from public feed
- [x] Direct URL access for rejected/hidden content is blocked
- [x] `/admin/forum/` opens
- [x] `/admin/reports/` opens
- [x] `/admin/media/` opens
- [x] `/admin/news/` opens
- [x] Non-admin gets blocked from admin pages/APIs

## Manual confirmation notes

- 普通用户 live QA passed
- 管理员 live QA passed
- Upload/avatar passed
- Moderation approve/reject/hide passed
- Old suspicious test post hidden
- Cloudflare/Supabase production checklist confirmed

## Security checklist

- [x] No `SUPABASE_SERVICE_ROLE_KEY` usage in active `src/`
- [x] No native `window.alert` / `window.confirm` / `window.prompt` in active `src/`
- [x] Public product source ledger stays out of client build
- [x] Pending/rejected moderation content is filtered from public feed/search/profile/detail paths
- [x] Non-admin admin API requests return unauthorized/forbidden
- [x] Production page-source keyword search returned no product source ledger leakage
- [x] Production authenticated admin access blocked check confirmed live

## Upload/media checklist

### Current intended gate

- Avatar upload: auth required, file type checked, size checked, storage path scoped by user, rate limited
- Circle cover upload: auth required, file type checked, size checked, storage path scoped by user, rate limited
- Post image upload: auth required, file type checked, size checked, post ownership enforced, rate limited
- Post video upload: auth required, type checked, size checked, post ownership enforced, rate limited
- News media upload: admin-only path must be verified manually before GO

### Additional notes

- `UPLOAD_TURNSTILE_MODE` defaults to `risk_based`
- `risk_based` currently keeps normal logged-in uploads usable and only allows optional stricter enforcement for high-risk uploads
- SVG upload is not allowed in the current user media paths

## Moderation checklist

- [x] Post title/body moderated
- [x] Comment body moderated
- [x] Circle name/description moderated
- [x] Review outcomes for posts/comments are not publicly auto-published
- [x] Public reads require `moderation_status = published`
- [x] Admin moderation queue verified live in production

## Dependency checklist

- `npm audit --audit-level=moderate` must be reviewed before GO
- Current decision:
  - do not run blind `npm audit fix --force`
  - accept remaining upstream framework/tooling advisories only temporarily
  - schedule a dedicated upgrade window for Astro / Vite / Wrangler chain before broad launch
- Current advisory set observed locally:
  - `astro` high severity advisories
  - `vite` high severity advisories
  - `undici` high severity advisories through `wrangler` / `miniflare`
  - `ws` high severity advisories through `wrangler` / `miniflare`
  - `@astrojs/cloudflare` moderate advisory chain
  - `@babel/core` and `js-yaml` moderate advisories

## Screenshot / evidence notes

- Public production screenshots:
  - `.tmp-qa/production-readiness-gate/live-qa/home.png`
  - `.tmp-qa/production-readiness-gate/live-qa/feed.png`
  - `.tmp-qa/production-readiness-gate/live-qa/news.png`
  - `.tmp-qa/production-readiness-gate/live-qa/search.png`
  - `.tmp-qa/production-readiness-gate/live-qa/login.png`
  - `.tmp-qa/production-readiness-gate/live-qa/posts_new.png`
  - `.tmp-qa/production-readiness-gate/live-qa/circles_new.png`
  - `.tmp-qa/production-readiness-gate/live-qa/products.png`
  - `.tmp-qa/production-readiness-gate/live-qa/devices_xreal_one.png`
  - `.tmp-qa/production-readiness-gate/live-qa/admin_moderation.png`
  - `.tmp-qa/production-readiness-gate/live-qa/mobile_feed.png`
  - `.tmp-qa/production-readiness-gate/live-qa/mobile_products.png`
  - `.tmp-qa/production-readiness-gate/live-qa/mobile_devices_xreal_one.png`

## Rollback plan

- See `docs/production-incident-runbook.md`

## Backup / recovery notes

- Confirm Supabase backup/export process before GO
- Confirm Cloudflare Pages prior deployment rollback path before GO
- Confirm moderator/admin emergency hide flow before GO

## Final go / no-go decision

- `GO: 可以进入 Public beta / external user testing`
- This GO is limited to public beta readiness, not unlimited mass-production commercial scale.
