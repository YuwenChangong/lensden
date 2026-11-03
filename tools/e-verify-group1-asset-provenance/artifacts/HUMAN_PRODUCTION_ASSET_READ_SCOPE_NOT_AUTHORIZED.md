# GROUP_1 Production asset content proof scope - NOT AUTHORIZED

PROPOSED_AUTHORIZATION_ID=e-verify-group1-openglasshub-20261013-production-assets-proof-v6
READ_PLAN_PACKET_SHA256=95fddd76f69291362eab8e6b9d1401ed4ece14dae87d89c317731eca6f7060db
OFFLINE_READ_PLAN_BINDING_SHA256=2eab397cc8ca17591d6cf0aa52ef839a585b5ad452421582bfb5e9c24462bb17

This is a read-scope proposal, NOT a ready Production execution entry. It does not
authorize full GROUP_1, replay a Claim, or amend its current static byte manifest.
All UTC fields and five human confirmations are pending. Before a separately
approved GO, the exact reader/entry must be frozen; no arbitrary fetch client.

## Exact identity

Account dcb374166b39234a499985145c075f50; Worker openglasshub.
Build d98da799-d41d-41dc-acaf-8c6675fd799a; source
88680a6eaab8de4123199f16b325ec0a430b0b86; Production Version
b2b62ec9-bb8d-4159-ac99-08fca5740134 at100%; Version151 at0%.
Pre/post must return the same Deployment ID and these exact traffic conditions.

## Single bounded evidence read

1. GET exact Deployment before execution and once after clean collection:
   https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/workers/scripts/openglasshub/deployments
   At most2; max131072 body bytes each. Default reviewed OAuth only for these API
   requests. Strict JSON schema/target/traffic validation before ignoring Provider
   Set-Cookie. No whoami, enumeration, other Provider request or credential refresh.
2. GET https://openglasshub.ogh.workers.dev/login/?next=%2Fproducts%2F once,
   anonymously, max2097152 bytes. HTTP200 text/html, no Location, Cookie persistence
   or redirects. Do not navigate a browser or execute any returned JavaScript.
3. Required observed target:
   GET https://openglasshub.ogh.workers.dev/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js
   max2097152 bytes. It must remain explicitly referenced by the current login HTML;
   otherwise stop for drift, not probe a stale path. Its expected SHA256 is UNKNOWN
   before reading; record actual bytes/hash without inventing an expected value.
4. To avoid a separate approval per changed chunk, the owner must explicitly
   approve bounded dependency discovery: at most67 unique JS/CSS URLs including
   the required target, selected ONLY from the current validated login HTML's
   script src/modulepreload/stylesheet/astro-island component/renderer references,
   or literal imports in an already acquired parent module. Target origins exact,
   no query/fragment/credentials, encoded/private path or arbitrary filename.
   Filename stem and type must be in the finite list attached below; an alternate
   cloud build hash has exactly8 reviewed name characters. Original local exact
   paths with special shorter hashes require an explicit observed reference too.
   Per-stem multiplicity cannot exceed the original manifest. No blind67 requests,
   automatic old-name alias, wildcard, other Version URL, API or third-party GET.
5. Total max70 GETs (1HTML+up to67assets+2Deployment), static concurrency max4.
   Every failed dispatch counts. Hard300/work240/cleanup60 seconds, wire/body15
   seconds, headers8192, individual asset2097152 bytes; aggregate anonymous body
   budget16777216 bytes is a proposed additional ceiling, not a claim about billing.
   Full execution must finish inside owner-approved UTC validity, max60 minutes.
   Before starting a new GET preserve request time plus cleanup/postcheck reserve.
   No retries, redirects, extension, automatic login or renewed Claim.
6. Source getters never input credentials, submit Auth, contact Supabase/Turnstile
   or execute authenticated RLS. A known Turnstile reference is recorded as excluded
   existing GROUP_1 scope, not fetched here; unknown external references stop.
   Unexpected runtime imports/CSS dependency ambiguity or private path stops graph
   collection rather than declaring complete coverage. Public GET may retain
   normal platform access/security records; no automatic cleanup of those records.
7. Assets require HTTP200 and exact JS/CSS Content-Type, identity Content-Encoding,
   no Location/Set-Cookie or HTML fallback, bounded complete body. Hash each body,
   parse module references locally and compare with frozen source and manifest.
   Actual hash is an observation, not proof of approved source or safe purpose.
   Do not auto-update GROUP_1 allowlists after a response. Preserve missing/changed
   dependencies as BLOCKED. Future binding requires separate exact byte evidence.
8. Protect necessary raw public code/HTML evidence in owner-only local storage,
   never ordinary logs/chat/receipts; no Cookie, token, OAuth or Auth/session data.
   Record only version/Deployment IDs, byte counts/hashes, safe public paths,
   reference edges, timestamps and bounded error codes. If privacy-safe capture
   cannot be guaranteed, stop before reading instead of dropping required evidence.
9. Before Claim/network freeze and validate the exact reader, authorization, new
   unique ID, all hashes, source identity, safe storage, budgets and remaining time.
   Default OAuth scopes workers_scripts:write/account:read, remaining strictly>360
   seconds. No automatic refresh/elevation/alternate credentials. Local OAuth
   metadata does not prove remote account identity; pre-Deployment validates access.
10. First failure, changed target, parsing ambiguity, insufficient time/bytes/slots
    or result uncertainty stops new dispatches and cancels/drains in-flight reads.
    Persist true counts/partial evidence. No extra post-Deployment after failure,
    re-probe, live repair, second attempt or automatic full GROUP_1 continuation.
11. MAX_ADDITIONAL_COST_USD=0. Existing owner-attested Free plans/no applicable
    add-ons and documented Free evidence reused, not live billing verification.
    Unknown paid paths/quota/known plan drift stop; no payment, upgrade or risk waiver.
12. All historical authorizations/Claims/FAIL/UNKNOWN remain unchanged. New read ID,
    Claim/receipt paths only. Catalog/queues/retries held. Version151 is not the
    default recovery target after D_HARDENING.
13. No writes, login/signup/mail/content/media/admin actions, SQL/RLS/roles/config/
    Secret changes, main push, deploy/upload, rollback/traffic switch, recovery,
    Catalog thaw, GROUP_2/3, E_VERIFY PASS or Public Beta GO. Full GROUP_1 still needs
    Account A/B/ADMIN, normal CAPTCHA and its16 RLS checks under a later approval.

## Pending owner confirmations

- subsetBoundary2AndResidualCasesAccepted: approve this content-proof-only subset
  and specifically the source-derived finite dependency URLs/max70 GET proposal.
  Old diagnostic10/full GROUP_1 authorizations do NOT cover the new read scope.
- authSecurityLogSideEffectsAccepted: accept anonymous access/security logs only;
  zero Auth submissions. Raw evidence uses local private storage, not public logs.
- manualTurnstileAndPrivateIdentityReady: no credential input/CAPTCHA solving in
  this read; existing private identities unchanged for future full GROUP_1 only.
- catalogHoldAndPostHardeningRecoveryAccepted: continuing hold, available recovery
  materials/permissions, no Version151 default post-Hardening recovery.
- operatorAvailableForEntireValidity: actual new UTC interval and continuous
  supervision/stop/cleanup, still null until the owner explicitly approves.

## Finite stems, types and multiplicity (not an HTTP wildcard)

- `AdminCirclesDashboard.<observed-build-hash>.js`: 1 slot(s)
- `AdminDevicesDashboard.<observed-build-hash>.js`: 1 slot(s)
- `AdminForumDashboard.<observed-build-hash>.js`: 1 slot(s)
- `AdminMediaDashboard.<observed-build-hash>.js`: 1 slot(s)
- `AdminModerationQueue.<observed-build-hash>.js`: 1 slot(s)
- `AdminNewsDashboard.<observed-build-hash>.js`: 1 slot(s)
- `AdminReportsPanel.<observed-build-hash>.js`: 1 slot(s)
- `AdminUsersDashboard.<observed-build-hash>.js`: 1 slot(s)
- `AuthCallback.<observed-build-hash>.js`: 1 slot(s)
- `AuthPanel.<observed-build-hash>.js`: 1 slot(s)
- `CircleManageEntry.<observed-build-hash>.js`: 1 slot(s)
- `CircleOwnerDashboard.<observed-build-hash>.js`: 1 slot(s)
- `CommentsSection.<observed-build-hash>.js`: 1 slot(s)
- `CommunityLayout.<observed-build-hash>.css`: 1 slot(s)
- `CreateCircleForm.<observed-build-hash>.js`: 1 slot(s)
- `CreatePostForm.<observed-build-hash>.js`: 1 slot(s)
- `EditProfileForm.<observed-build-hash>.js`: 1 slot(s)
- `FeedSidebarAuthHint.<observed-build-hash>.js`: 1 slot(s)
- `GlassConfirmDialog.<observed-build-hash>.js`: 1 slot(s)
- `GlobalSearchBox.<observed-build-hash>.js`: 1 slot(s)
- `HeaderNotifications.<observed-build-hash>.js`: 1 slot(s)
- `HeaderUserMenu.<observed-build-hash>.js`: 1 slot(s)
- `LocalePreferenceSync.<observed-build-hash>.js`: 2 slot(s)
- `MobileTableOfContents.astro_astro_type_script_index_0_lang.<observed-build-hash>.js`: 1 slot(s)
- `MyProfilePage.<observed-build-hash>.js`: 1 slot(s)
- `NewsPagination.<observed-build-hash>.js`: 1 slot(s)
- `NotificationsPage.<observed-build-hash>.js`: 1 slot(s)
- `PostMediaGallery.<observed-build-hash>.js`: 1 slot(s)
- `PostModerationActions.<observed-build-hash>.js`: 1 slot(s)
- `PostSocialActions.<observed-build-hash>.js`: 1 slot(s)
- `ReportTrigger.<observed-build-hash>.js`: 1 slot(s)
- `ResetPasswordForm.<observed-build-hash>.js`: 1 slot(s)
- `SettingsPage.<observed-build-hash>.js`: 1 slot(s)
- `SharePostButton.<observed-build-hash>.js`: 1 slot(s)
- `SiteHeader.<observed-build-hash>.css`: 1 slot(s)
- `SiteHeader.astro_astro_type_script_index_0_lang.<observed-build-hash>.js`: 1 slot(s)
- `TableOfContents.astro_astro_type_script_index_0_lang.<observed-build-hash>.js`: 1 slot(s)
- `_brand_.<observed-build-hash>.css`: 1 slot(s)
- `_brand_.astro_astro_type_script_index_0_lang.<observed-build-hash>.js`: 1 slot(s)
- `auth-callback-url.<observed-build-hash>.js`: 1 slot(s)
- `auth-messages.<observed-build-hash>.js`: 1 slot(s)
- `auth-redirect.<observed-build-hash>.js`: 1 slot(s)
- `catalog-compare-dom.<observed-build-hash>.js`: 1 slot(s)
- `client-image.<observed-build-hash>.js`: 1 slot(s)
- `client.<observed-build-hash>.js`: 1 slot(s)
- `ec.<observed-build-hash>.js`: 1 slot(s)
- `ec.<observed-build-hash>.css`: 1 slot(s)
- `index.<observed-build-hash>.css`: 2 slot(s)
- `index.astro_astro_type_script_index_0_lang.<observed-build-hash>.js`: 1 slot(s)
- `jsx-runtime.<observed-build-hash>.js`: 1 slot(s)
- `legal-consent-adapters.<observed-build-hash>.js`: 1 slot(s)
- `notifications.<observed-build-hash>.js`: 1 slot(s)
- `page.<observed-build-hash>.js`: 1 slot(s)
- `print.<observed-build-hash>.css`: 1 slot(s)
- `product-public-safety.<observed-build-hash>.js`: 1 slot(s)
- `profile-data.<observed-build-hash>.js`: 1 slot(s)
- `profile-links.<observed-build-hash>.js`: 1 slot(s)
- `react-dom.<observed-build-hash>.js`: 1 slot(s)
- `react.<observed-build-hash>.js`: 1 slot(s)
- `starlight-toc.<observed-build-hash>.js`: 1 slot(s)
- `storage-tus.<observed-build-hash>.js`: 1 slot(s)
- `supabase-browser.<observed-build-hash>.js`: 1 slot(s)
- `useAdminSession.<observed-build-hash>.js`: 1 slot(s)
- `useBrowserAuthState.<observed-build-hash>.js`: 1 slot(s)
- `useLocale.<observed-build-hash>.js`: 1 slot(s)

Proposed independent GO only after exact reader freezing and complete new approval:
GO_E_VERIFY_GROUP1_PRODUCTION_ASSET_PROOF_V1

No authorization time, true gate, effective approval or GO is created by this plan.
