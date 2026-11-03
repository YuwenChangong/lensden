# GROUP_1 Production Asset Evidence Read Fresh v8 - NOT AUTHORIZED

AUTHORIZATION_ID=e-verify-group1-openglasshub-20261013-production-asset-reader-fresh-v8
PACKET_SHA256=41ae34c6e074e8deb6425b2bf1cfe40bd0f715ab8e5b8547cd81f592a7d84cb5
EXECUTION_BINDING_SHA256=036172b39d01ad036a5b3c2ec060f1c1d7752bc18d73d669a8049b2030554497

This is an executable reader binding and pending independent contract, not an effective authorization. No UTC interval, human approval, Claim or GO has been created. Previous v3/v5 approvals and Claims cannot authorize this scope. The earlier v6 proposal was never an execution authorization.

## Thirteen Execution Conditions

1. Exact account `dcb374166b39234a499985145c075f50`, Worker `openglasshub`, Production origin `https://openglasshub.ogh.workers.dev`. Expected Worker Version `b2b62ec9-bb8d-4159-ac99-08fca5740134` at 100%, Recovery151 at 0%, Deployment `e8481d68-d2d5-473b-8b0c-b82b8fa33fc3`. Build `d98da799-d41d-41dc-acaf-8c6675fd799a` links source `88680a6eaab8de4123199f16b325ec0a430b0b86` through frozen release receipts, not a fictitious source-SHA field in the Deployment API. Pre/post validate exact version, traffic and identical Deployment ID. This does not claim continuous observation between checks.
2. At most two GETs of `https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/workers/scripts/openglasshub/deployments`: one before reading, one only after clean collection. Body bound 131072 bytes each. Strict status, JSON, schema, UUID and traffic validation before ignoring response Set-Cookie. Only default reviewed OAuth; no whoami, enumeration, refresh, alternate credentials or other Provider endpoint.
3. Exactly one anonymous GET of `https://openglasshub.ogh.workers.dev/login/?next=%2Fproducts%2F`; max 2097152 bytes, complete UTF-8 HTML, HTTP200, no Location/Set-Cookie/encoding other than identity. No browser navigation or JavaScript execution. HTML must explicitly reference `/_astro/SiteHeader.astro_astro_type_script_index_0_lang.CtUXEG6g.js`; otherwise stop without probing a stale script.
4. Read that exact script first. Only afterwards read referenced dependencies, not all local assets. Conditional admission requires references explicitly parsed from this HTML (script src, modulepreload, stylesheet, Astro island component/renderer, literal inline-module imports) or literal imports in already read JS/CSS. Every dependency must pass the exact HTTPS origin, public pathname grammar, finite stem/type/multiplicity appendix, no query/fragment/credentials/private or encoded path. Alternate build hashes are exactly eight permitted characters; original shorter local paths still require actual references. Unknown or ambiguous imports stop. Discovery alone does not authorize a URL outside these conditions; no `/_astro/*` wildcard or guessed chunks.
5. Maximum 70 GETs = one HTML + up to 67 distinct referenced JS/CSS including required script + two Deployment. Static concurrency at most four. All admitted failed requests count; all new dispatches pass atomic global/category and byte reservations. Headers max8192 bytes, individual anonymous body max2097152 bytes, aggregate anonymous body max16777216 bytes, request/body timeout15 seconds. Anonymous reservations charge the full per-object ceiling before dispatch and refund only after complete bounded reads; failures retain reservation. API bodies are separately bounded, at most262144 bytes total. Limits cover accepted/persisted bytes, not an absolute wire-bandwidth or platform-bill cap; in-flight kernel/network tail is not exactly measurable here. Do not represent it as such.
6. Hard deadline300 seconds from actual GO entry start, work deadline240 seconds including launch/prechecks, cleanup reserve60 seconds. The supervisor's launch budget is reduced by time already spent. Full execution must finish within explicitly approved UTC validity, at most60 minutes. Before any read retain its timeout and evidence-processing margin; stop if insufficient. No automatic retries, redirects, reconnect/relaunch, time extension or second execution instance.
7. No Auth submission, credential entry, Supabase, Turnstile, authenticated RLS, business API or third-party HTTP. The exact known Turnstile loader reference is excluded and never downloaded; unknown external dependencies stop. JS/CSS are parsed locally, never executed. Anonymous accesses can leave normal platform security/access records; there is no automatic cleanup of those records.
8. Assets require complete HTTP200, exact JS/CSS MIME, UTF-8 content, identity encoding, no Location/Set-Cookie/HTML fallback, bounded body. Observe actual bytes and SHA256, with explicit parent reference graph. Expected Production SHA256 remains UNKNOWN until reading. HTTP200, filename, same commit or matching stem does not prove approved source or safe purpose. Success means CONTENT_EVIDENCE_COLLECTED, never full provenance/GROUP_1 PASS. Frozen source comparison and code review must establish a later precise allowlist; no automatic replacement of the old DaQNT1ww resource with CtUXEG6g.
9. Necessary raw HTML/public script bytes are stored only in the bound owner-only local directory, DPAPI CurrentUser encrypted with authorization-specific entropy, owner/SYSTEM-only DACL, exclusive files and ciphertext hashes. Raw code, HTML, query data, OAuth, Cookie, Secret or Session never enters ordinary receipts/logs/chat. Authorization permits this protected evidence capture, not ordinary plaintext copies. Capture availability is probed before Claim/network; actual directory creation is inside the contained execution. Capture failure stops. Offline decryption returns bytes only through a controlled private pipe for approved local review.
10. Before Claim/network validate new ID, authorization schema, all five true gates, exact GO, packet/binding/files/source-head, prior frozen evidence, safe storage path, budgets and time. OAuth token presence, required local scopes `workers_scripts:write` and `account:read`, remaining strictly greater than360 seconds. Local OAuth metadata cannot prove remote subject/account identity; exact pre-Deployment verifies authorized target access. No credential printing, automatic refresh or elevation. Unique Claim and all receipts are exclusive. Any prior receipt/Claim prevents replay; a preflight failure creates a separate safe failure receipt and does not authorize retry.
11. First failure, drift, unsupported dependency, parsing uncertainty, size/slot/request/time excess or ambiguous result stops new dispatches, cancels/drains in-flight operations and retains true partial counts/protected evidence. No extra post-Deployment after failure. Missing child receipt is explicitly UNKNOWN, not zero or success. Supervisor verifies contained child-tree cleanup; an abnormal exit or cleanup failure blocks acceptance. No live repair, second attempt or automatic GROUP_1 continuation.
12. Strict MAX_ADDITIONAL_COST_USD=0, PAID_USAGE_AUTHORIZED=false. Reuse owner-attested Workers Free/no applicable add-ons and documented Free policies; this is not a new control-panel or billing read. Unknown paid path or known plan/config drift stops. No purchases, upgrades, payment changes, overage acceptance or paid-risk waiver. Preserve all historical FAIL/UNKNOWN/receipts/Claims and the original frozen templates. Catalog writes, queues and retries remain frozen. Recovery151 is not the default post-Hardening recovery version.
13. No Production writes, login/signup/mail, content/media/admin actions, SQL/RLS/roles/config/Secrets changes, main push, build/deploy/upload, rollback/traffic switch or recovery, Catalog thaw, GROUP_2/GROUP_3 authorization, E_VERIFY PASS or Public Beta GO. Full GROUP_1 still requires separate approval for real A/B/ADMIN identities, manual CAPTCHA and its16 RLS checks. This evidence-only subset is an explicit contract amendment requiring fresh owner acceptance, not implicit use of the full E_VERIFY or consumed diagnostic approvals.

## Five Exact Pending Human Gates

- `subsetBoundary2AndResidualCasesAccepted`: explicitly approve this evidence-only subset amendment, the thirteen conditions, finite conditional dependency appendix and up-to70 GET bound; not full GROUP_1.
- `authSecurityLogSideEffectsAccepted`: accept normal anonymous access/security logs and owner-only encrypted raw public-source evidence. No Auth submissions or irreversible user mutations.
- `manualTurnstileAndPrivateIdentityReady`: accept that this reader inputs no passwords or CAPTCHA and uses no private QA sessions; existing private identities remain unchanged for later GROUP_1. Default OAuth is available only for the two exact Deployment GETs.
- `catalogHoldAndPostHardeningRecoveryAccepted`: continued hold, recovery materials/permissions available, no Recovery151 default after Hardening.
- `operatorAvailableForEntireValidity`: owner confirms the actual UTC interval and continuous supervision through execution and cleanup; no time or availability is inferred.

## Pending Authorization JSON

```json
{
  "format": "e-verify-group1-authorization-v1",
  "authorizationId": "e-verify-group1-openglasshub-20261013-production-asset-reader-fresh-v8",
  "packetSha256": "41ae34c6e074e8deb6425b2bf1cfe40bd0f715ab8e5b8547cd81f592a7d84cb5",
  "executionBindingSha256": "036172b39d01ad036a5b3c2ec060f1c1d7752bc18d73d669a8049b2030554497",
  "authorizedAtUTC": null,
  "authorizationExpiresUTC": null,
  "humanGates": {
    "subsetBoundary2AndResidualCasesAccepted": null,
    "authSecurityLogSideEffectsAccepted": null,
    "manualTurnstileAndPrivateIdentityReady": null,
    "catalogHoldAndPostHardeningRecoveryAccepted": null,
    "operatorAvailableForEntireValidity": null
  }
}
```

All five gates and both UTC fields remain null. Only the owner may approve true gates and exact UTC times. Approved file must be a separate `AUTHORIZED_ASSET_READ.json`, exact schema above, with its own file SHA256; preserve this template. No separate full GROUP_1 production authorization is created.

## Finite Conditional Stem/Type Slots

Not a wildcard and not a list of URLs to probe. Actual HTML/parent reference plus every condition above is required before GET.

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

## Short Execution Steps

1. Owner confirms all five gates, this complete contract, ID and packet/binding/template SHA256, and an exact real UTC validity (<=60 minutes) covering the full300 seconds. Record and validate the separate approved JSON, then STOP.
2. Wait for the owner's separate exact command `GO_E_VERIFY_GROUP1_PRODUCTION_ASSET_PROOF_FRESH_V8`. Do not invoke the entry merely upon approval.
3. Only then run the frozen Node entry with that one exact argument. It performs dynamic prechecks, creates the sole Claim, invokes the bound contained supervisor and persists independent safe receipts plus encrypted source evidence. Any failure stops permanently for this instance; no automatic new approval or retry.
4. After clean evidence collection, privately compare real source bytes and dependency graph to the deployed-source evidence. Only a demonstrated safe finite resource graph supports a new full GROUP_1 binding and independent authorization. Unknown provenance or budget sufficiency remains BLOCKED.

ENTRY=C:\Temp\ogh-product-beta-development-20261013\tools\e-verify-group1-asset-reader-fresh-v8\entry.mjs
GO=GO_E_VERIFY_GROUP1_PRODUCTION_ASSET_PROOF_FRESH_V8
Current status: NOT_AUTHORIZED; CLAIM_NOT_CREATED; GO_NOT_ISSUED.

## Fresh Instance Isolation

Previous v7 approval is unconsumed but its failed instance is permanently stopped.
Do not reuse its approval, Claim path, GO execution state or private capture directory.
This fresh v8 keeps all thirteen conditions, finite scope and original31/31 evidence.
Only seven mechanical isolation checks ran; no original suite or Production request.
The local OAuth PASS snapshot is not a remote identity proof or future lifetime guarantee.
All five gates and UTC times require fresh owner confirmation; separate new GO required.
