# Minimal R2 Setup and Remaining Local UI Evidence

2026-10-15, source03a63e6b. Scoped review only; the unique progress baseline is
docs/ops/PUBLIC_BETA_CURRENT_STATE.md. No product patch, cloud setup or live R2 test.

## Actual Media Configuration

- S3_API, not native binding: `src/lib/r2-server.ts` uses S3Client/getSignedUrl
  for video PUT and AwsClient for DELETE. MODERATION_ASSETS is a separate binding.
- Supported server fields only: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL. No R2_ENDPOINT field.
- Browser obtains an authenticated video ticket then PUTs to its S3 URL. Its
  Secret never belongs in browser code. Current endpoint is ordinary account
  `r2.cloudflarestorage.com`; don't choose jurisdiction-specific endpoints.
- Images and thumbnails are separately generated/uploaded to Supabase Storage.
  Videos retain canonical tmp/owner/post keys. Do not claim images were uploaded
  to R2 or blindly expire all tmp objects.
- Website `/api/media/post/<id>` verifies published public post/circle then
  proxies the trusted R2_PUBLIC_BASE_URL. Current code has no R2 signed GET;
  only Supabase Storage uses signed GET internally. A private R2 bucket without
  the public test endpoint cannot satisfy this current read path.
- Range isn't forwarded by the existing website proxy. Future test must separate
  raw-bucket Range support from actual website behavior; neither is verified here.
- Current local bootstrap supplies no R2 credentials and denies remote outbound;
  it does not automatically read the new file. After independent approval,
  minimal explicit test-target integration is still required in the same runner,
  not a new platform or Production/Preview environment substitution.

## Owner Manual Setup

Detailed Dashboard clicks/CORS and fee checks:
[existing R2 guide](../../../../docs/r2-media-cleanup.md).

Only resources required:1 Standard isolated bucket and1 Object Read & Write
S3 credential restricted to that bucket; separate public development URL if the
owner accepts synthetic test-video exposure. No Worker deployment, Admin token,
production key, paid proxy, custom domain or Production data copy.

Blank `.env.r2-test.local` now exists at the checkout root. Verified ignored;
Windows DACL inheritance disabled and only current user/SYSTEM FullControl.
It is plaintext under ACL, NOT DPAPI encryption. No real secret was saved or
loaded. Fill it only on this computer, never paste/export/commit it. Runtime
private state continues to use the existing CurrentUser DPAPI mechanism.

No test bucket, scoped credential, current free-usage balance or independent
owner bucket-use approval supplied yet. ISOLATED_R2_READY=NO. Billable Usage
total usage and included allowance across the account are needed, not just
an empty bucket or a0-cost display. Data is delayed, no hard billing cap claim.

## New Real Local Browser Run

`4baaad4841be`:14 PASS/1 FAIL, includes4 prerequisite UI logins/context isolation.
No full Auth13/RLS16/business23 rerun; no R2/video retry. Only new scoped checks:

- SETTINGS/POST/DEVICES/FORUM/MEDIA/NEWS/USERS/CIRCLES: PASS actual resource/
  page/console observations, client-load hydration and initial API results.
- REPORTS: FAIL, repeated reads with no user action, details below.
- Notifications: PASS real loading held local request, actual zero database rows
  and empty UI. Deliberate503 fixture produces error UI; this is not a real
  backend outage, mail test or external-service acceptance.
- UI02: PASS9 local route/viewport combinations (Feed/product/circle x1440/
 390/430) for overflow, main landmark, image-alt and visible button-name checks.
  Product screenshots inspected. Not a full accessibility/video audit.

## Confirmed Local P1: Admin Reports Repeated Read Loop

1. Login as the existing isolated ADMIN fixture and navigate `/admin/reports/`.
2. Do not click, filter or change account. The first list response is200.
3. Observe repeated GETs for the same list. Local guard allows only first12,
   then blocks subsequent attempts until the bounded1200ms observation ends.
4.953 attempts observed, of which941 denied by the test guard. These are NOT
   953 backend dispatches. The941 console errors can be guard-abort effects,
   not941 independent original defects. No claims about Production counts.

Source correlation: `src/components/admin/AdminReportsPanel.tsx` list-loading
effect depends on `[adminSession, queryString, refreshNonce]`; it sets loading/
refresh/report state on each invocation. `useAdminSession.ts` returns a new
object on every render. State updates thus re-trigger the effect, causing
repeated reads without user input. The loop begins before the test cap fires.

Minimal repair candidate: depend on the actual stable session/status/setState
values rather than the whole newly-returned object; preserve401/403 handling,
filters, refresh and role checks. Product repair NOT implemented in this task;
requires owner approval and a focused bounded real-browser regression. Do not
increase timeouts, ignore the loop or globally alter the admin hook speculatively.
The old combined timeout receipt remains unchanged; no recovered history claim.

## Honest Completion and Cleanup

- Original local GROUP1=10/14. AUTH-01 and trusted-country part ofUI-01 remain
  PRODUCTION_ONLY; UI-02 partial/video gap BLOCKED; UI-03 FAIL reports loop.
- Existing business23 PASS/1 BLOCKED/1 DEFERRED evidence retained plus1 new
  confirmed admin-resource failure. Editor DEFERRED, not PASS. RLS16/16 reused.
- Real R2 upload/playback/Range/cleanup/security all BLOCKED. Native local image/
  thumbnail and cleanup evidence PASS reused, not real R2 acceptance.
- Owned local DB/containers/volumes/users/media and DPAPI state removed;
  app listener and active pointer absent. Blank manual R2 file retained.
- Production requests/writes/auth/deployments0; real R2 requests0; third-party
  test requests0. No cloud resource creation, push or consumed authorization use.
  Catalog ACTIVE, Beta and groups2/3 unauthorized, Production parity UNKNOWN.
