# GEO content finalization — owner approval packet

November 2, 2026. Continues the [completed post-launch report](post-launch-2026-11-02.md); current baseline remains [PUBLIC_BETA_CURRENT_STATE](../ops/PUBLIC_BETA_CURRENT_STATE.md). Local preparation only. No production reads, moderation/database writes, publication, deployments, monitoring retries, media operations or paid API calls were made. Public manufacturer/search-help documentation was consulted.

Preparation completed: inspect saved identities and staff handlers; finalize the existing USB-C candidate; document manual export normalization; verify links, metadata, unchanged monitoring inputs and the scoped diff. No infrastructure development or completed release checks were repeated.

## A. Exact moderation candidates

Evidence: saved `artifacts/qa/domain-cutover/live-1.txt` and its extracted `artifacts/qa/geo-post-launch/homepage-audit.json`, runner start 2026-11-02T05:21:15.016Z. The saved homepage's SHA-256 is `7bc55f222274811b75aae3c3a8d429c37aa1d0939e9bb7e0878b7ab66e25ab97`. This is historical public evidence, not current database readback. Targeted searches of local docs/scripts/tests and available QA text receipts found no fixture manifest or staff record export establishing these circles' UUIDs/owners. Names alone do not settle provenance.

| Candidate | Exact identity available | Ownership / discussion evidence | Classification and disposition |
|---|---|---|---|
| QA acceptance post | Post UUID `fba0a005-1008-4fe5-8899-52c23efd2bfb`; `/posts/fba0a005-1008-4fe5-8899-52c23efd2bfb/`; title/excerpt `QA 验收测试，请忽略` | Public profile link UUID `147f514c-f5e5-4735-91e1-5265e8eba4aa`, displayed handle `3642581840`; circle slug `brilliant-labs`. Saved card shows Comments 0. This is not staff verification of author ownership, a full body/history review or a current comment count. | Confirmed public QA-labelled content; fixture provenance **NOT_VERIFIED**. **One conditional hide candidate** below, after owner confirms the fixture and current record. No account/community sanction. |
| QA circle | Exact public slug `qa0a39aa70-f4d5-40e1`; label `QA0a39aa70-f4d5-40e1`. Database UUID **NOT_VERIFIED**. | Owner UUID/profile, member history, posts and comments **NOT_VERIFIED**. Generic public discussion prompt and saved sitemap inclusion only. | Strong test-name signal; neither fixture nor legitimate-content status established. **Review only; no hide approval candidate yet.** |
| CV circle | Exact public slug `cv-677480-circle`; label `CV 677480 Circle`. Database UUID **NOT_VERIFIED**. | Owner/discussion history **NOT_VERIFIED**; generic daily-use description and sitemap inclusion. | Possible fixture, insufficient evidence. **Review only; no mutation proposed.** |
| FULLOPENAI circle | Exact public slug `fullopenai-677480-daily`; label `FULLOPENAI 677480 Daily`. Database UUID **NOT_VERIFIED**. | Owner/discussion history **NOT_VERIFIED**; templated daily-use/comfort/display/software description and sitemap inclusion. | Possible fixture, insufficient evidence. **Review only; no mutation proposed.** |

Brilliant Labs, Rokid and the numeric author handle have no demonstrated violation. Do not hide the parent Brilliant Labs circle to remove one post. No candidate is conclusively established as legitimate or fixture-owned from this snapshot alone; uncertainty is retained rather than resolved by naming heuristics.

### Conditional approval item QA-POST-01 — one post only

Proposed outcome: reversible visibility hide, preserving body/title, author/circle IDs, comments, media references and existing history. **Not approved or executed.** Owner/staff must first confirm the exact author and post are their QA fixture, inspect available discussion/history, and confirm current status is published. If identity differs, legitimate discussion exists or the target is already hidden/deleted, stop and revise/close the item; do not issue a redundant mutation.

Use the existing authenticated staff moderation action **POST `/api/admin/moderation/hide`**, not the status-only forum toggle. Proposed payload, only after that separate approval:

```json
{
  "target_type": "post",
  "target_id": "fba0a005-1008-4fe5-8899-52c23efd2bfb",
  "reason": "Owner-confirmed QA acceptance fixture; remove test content from public discovery while preserving history."
}
```

Source: `src/pages/api/admin/moderation/hide.ts` → `src/lib/server/moderation-admin.ts`. Existing moderator/admin authentication, applicable MFA assurance and legal-consent checks remain required. It writes hidden/manual moderation fields and a `moderation_actions` row with moderator, target, action and reason; it does not delete content/media or call a moderation provider. Save approved pre-state and before/after evidence in the existing private staff record, not public content. Verify exactly this target, expected status and new audit event after any later authorized action.

Visibility restoration is available through the existing audited approve action (`/api/admin/moderation/approve`, same target with an explicit restoration reason). It republishes and appends history; it does **not** restore old moderation metadata byte-for-byte. The helper performs target update and audit insert separately: an error can occur after the status changed. In that case inspect state and audit history before retrying; an already-applied retry can return without creating the missing event. This packet does not approve a repair write or redesign that workflow.

Circle workflow review: `/admin/circles/` uses `AdminCirclesDashboard`; the existing circle PATCH can set only `{id,status:"hidden"}` and later restore the verified prior active state. Its source does not explicitly append a moderation audit event, and its response resolves a cover URL. The circle-list endpoint also resolves covers and reads all circle counts. Do not invoke those endpoints as a supposedly media-free evidence shortcut under this task. No circle UUID, prior status, fixture ownership or audit-preserving execution path has been established, so **no circle write is approval-ready**. Resolve those items from an existing staff record/export and retain exact identities/history before proposing any later action; do not rename/delete/purge, contact authors or fetch media.

## B. Final USB-C article candidate

Review the updated existing [USB-C draft](drafts/usb-c-display-glasses-compatibility.md). This is final candidate prose, still outside the publishing collection with `draft:true`, `approval:pending`, author/reviewer and publication/update dates null. The other two drafts are unchanged.

- Title: **USB-C display glasses compatibility: XREAL One and One Pro**.
- Meta description: **Check DisplayPort Alt Mode, host power and adapter direction before connecting XREAL One or One Pro glasses to a phone, computer or console.**
- Proposed canonical: **https://lensden.net/guides/usb-c-display-glasses-compatibility/**. Reserved editorial choice only; not a live URL or sitemap entry.
- Audience: English-reading users checking one documented connection chain. Scope deliberately limited to the two named glasses; no universal AR-glasses/phone-brand certification, firsthand review, price or purchase recommendation.

### Editorial verification

- [x] Primary-source model scope: [XREAL specifications](https://tutorials.xreal.com/docs/glasses/one-series/spec/) names One and One Pro separately. No display specifications are imported into the article.
- [x] Connection, power and accessory statements checked against [XREAL's connection instructions](https://tutorials.xreal.com/docs/glasses/one-series/first-use/connect-device/) on November 2. Model/OS and feature restrictions retained; no untested host list reproduced.
- [x] Connector versus Alt Mode and adapter direction checked against [VESA FAQ](https://www.displayport.org/faq/); hub/dock distinction checked against [VESA connection help](https://vesa.org/dp-usb-type-c/). Checklist and explanation are editorial synthesis, not copied test results.
- [x] Both internal links exist in local source and saved new-domain sitemap: `/products/` and `/guides/developer-limit-checklist-before-choosing-ar-ai-glasses/`. The latter's Chinese language is disclosed. No production link requests made.
- [x] Proposed slug has no existing guide file collision; current canonical origin reused. Draft flags/dates preserved; no author invented.
- [ ] Owner names and consents to the real byline and reviewer, approves the final copy/title/description/path and separately authorizes publication. Do not assume the site owner's display name establishes article authorship.
- [ ] At the actual publication event, record the real timestamp; November 2 source review is not publication time. Set update time only for a meaningful subsequent revision. The current guide renderer reads `title`, `description`, `draft`, `lastUpdated`; it does not automatically publish a byline/date from this draft's private metadata. Use an approved visible byline/publication line in existing MDX prose; do not invent unsupported schema output or set `lastUpdated` merely to simulate publication.
- [ ] Respect the existing language-selection contract at publication. `guides/[slug].astro` loads guide MDX and defaults unregistered editorial variants to `zh-CN`; putting English text there alone would mislabel it. The reviewed-English allowlist and loader currently cover only the guide index. Use the existing reviewed-edition pattern in the separately authorized publication change and verify correct English labeling; no locale, UI or source-code change has been made now. Do not advertise this candidate as a drop-in published page.

Content is ready for editorial approval; author, publication timing and correct existing language-workflow integration remain explicit publication requirements. No additional article or architecture change is proposed.

## C. Real search-export import

Follow [import-exports.md](monitoring/import-exports.md). It maps real dashboard CSVs to the existing schema using a local worksheet/manual normalization, then the unchanged local validator. No provider adapter, API credential, paid export, BigQuery, network script or invented example values are required. The 20 queries and header-only observations file are unchanged. No actual export was supplied or imported in this task.

## Minimal owner decisions

1. Confirm QA-POST-01 fixture ownership and current discussion/state; if confirmed, separately approve the one audited hide. Circles remain review-only until exact UUID/ownership/history evidence exists; no bulk moderation approval is requested.
2. Approve the article and real author/reviewer, canonical path and later publication through the existing language-aware workflow. No publication occurs in this task.
3. Supply existing authorized, finalized new-origin console CSV exports plus report/filter context to collect a real baseline. Local import needs no further approval once supplied; registration, billing checks and Worker metrics are not repeated here.
