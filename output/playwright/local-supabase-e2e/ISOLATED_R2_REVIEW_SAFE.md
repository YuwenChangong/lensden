# Isolated R2 Readiness and Remaining Local E2E

2026-10-15. Scoped results, not a competing project baseline or live authorization.
Source baseline75275c64. Production requests/writes/auth/deployments0; third-party
test requests0. No remote resource creation, inventory query, secret load or push.

## Isolation Decision

- ISOLATED_R2_BUCKET=MISSING: no verified usable isolated configuration found.
  Cloud inventory UNKNOWN; this is not a claim no test bucket exists remotely.
- Parsed local Wrangler root/Preview bindings equal Production; Preview media
  account/bucket/base URL also equal Production. Do not use either for tests.
- No dedicated test configuration, bucket-scoped credentials or owner test-use
  authorization established. Relevant process variables absent. No Production
  credential was reused to discover resources or attempt storage operations.
- ZERO_ADDITIONAL_COST=UNKNOWN for future real R2; remaining shared Standard
  allowance/network fees not established. No paid resource was created here.
- Candidate config paths are ignored by Git; no claim of ACL/encryption solely
  from ignore status. Use existing protected-local storage after scope proof.
- Native image/thumbnail upload is Supabase Storage, video signing is R2. The
  moderation R2 native binding is not the media S3 credential path. A new R2
  image route would be a product change, not a valid substituted UI test.

Manual steps with official references: [R2 guide](../../../../docs/r2-media-cleanup.md).
Use an existing authorized dedicated Standard QA bucket or owner-manual setup;
Object Read & Write only that bucket, exact local CORS and isolated public test
URL if accepted. Provide only a protected config path and redacted scope/use/cost
proof, never secrets in chat. Do not run the current loopback-only runner against
Preview or inject Production variables. No cloud setup was performed.

## Actual Browser Evidence

| Run | Actual scoped result | Cleanup |
| --- | --- | --- |
| 7e7f8fbc53a2 | 7 PASS / 2 BLOCKED | PASS |
| 3ae6b0253180 | 5 PASS / 3 BLOCKED | PASS |

Distinct latest assertions7 PASS/3 BLOCKED. Repeated login prerequisites and
synthetic fixture are not additional business passes. Historical23 business
passes/16 RLS checks/comment and Auth suites are reused, not rerun.

- Three real UI logins and strict context/server-identity checks PASS locally.
- Local synthetic160x90 VP8 video1423 bytes generated in Chrome memory PASS;
  not a claim of upload, playback, Range or R2 compatibility.
- Actual composer video upload BLOCKED. Followup observes exact local ticket
  POST500/EXTERNAL_VIDEO_UPLOAD_FAILED at UPLOAD_LINK, no media link created.
  No real R2 object or request occurred. Existing generic server failure does
  not match the client's narrow missing-R2 fallback conditions. Do not broaden
  that fallback to all500s: security/quota failures may need to remain closed.
  Missing configuration is a test dependency; a Production video defect is
  not established. Dependent deletion/absence check BLOCKED, not FAIL/PASS.
- Six anonymous real routes PASS: login/Feed/products/product detail/privacy/
  owned circle.135 actual script/style/font/image responses, no observed HTTP
  asset errors, failed assets, CSP/page/console errors.
- Authenticated matrix BLOCKED by local operation timeout.4 completed documents,
 119 asset responses, zero recorded error counters before timeout; exact timed-out
  operation UNKNOWN. Do not call the planned9-page matrix complete.
- Local keyboard/forms PASS:1440/390/430, named inputs, Tab focus, required-field
  rejection, main landmark and no horizontal overflow. Not a full a11y/media audit.
- Browser/API results and code enums are safe; no raw response errors, URL Query,
  object keys, credentials, storage state or raw session traces exported.

## Original Four Cases, Not Replacements

| Original case | Classification now | Evidence / precise gap |
| --- | --- | --- |
| AUTH-01 | PRODUCTION_ONLY | Local CAPTCHA disabled; real managed Production CAPTCHA not executed |
| UI-01 core-partial | PRODUCTION_ONLY | Explicit locale preference reused; trusted country precedence cannot be proved with a forged local header |
| UI-02 core-partial | BLOCKED | Local images/mobile/focus/form checks retained; full video/media/accessibility requirements incomplete |
| UI-03 core-partial | BLOCKED | Anonymous resources PASS, prior loading/error evidence reused; full authenticated resource/error/empty-state coverage incomplete |

GROUP1_LOCAL_CASES=10/14; all local outcomes remain distinct from Production.
Selected BUSINESS_E2E=23_PASS/0_FAIL/1_BLOCKED/1_DEFERRED. Editing remains
DEFERRED_PUBLIC_BETA, not PASS. No new confirmed Production application bug.

## Release Gaps and Cleanup

- Real isolated R2/video/Range/cleanup/security remain BLOCKED. Current proxy
  source does not establish Range support; no runtime Range success/failure
  evidence obtained. Existing local image/thumbnail/partial-cleanup/authorization
  evidence PASS is reused, not real R2 evidence.
- Local media guide now matches synchronous soft-delete/cleanup.ok semantics.
  Signed video keys may remain tmp after binding; don't apply blanket tmp expiry
  without reference proof. Production lifecycle UNKNOWN, not inspected or changed.
- Production parity UNKNOWN: local product fixes undeployed; local-only canonical
  rate-limit fixture is not evidence of equivalent live schema/behavior.
- Both exact owned Supabase instances stopped with no backup. Containers/volumes,
  actors/data/media, DPAPI credentials/private dirs and active pointer removed;
  local app listener absent. Browser/worker cleanup receipts retained. Reusable
  nonsecret runner/configuration remain. No shared/Production database cleaned.
- Groups2/3 and Public Beta unauthorized; Catalog ACTIVE; no old Claim reused.

Next single action: owner supplies the protected isolated R2 config path plus
bucket-only scope/use approval and current zero-added-cost proof per the guide.
No new browser diagnostic, automatic cloud setup or Production fallback.
