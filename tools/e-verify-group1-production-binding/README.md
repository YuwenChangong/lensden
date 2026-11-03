# Production login asset binding repair (offline only)

This is a QA repair, not Production authorization. No entry/GO/Claim or approval
Packet is generated here. All consumed v3/v5/v7/v8 and full GROUP_1 attempts remain
unchanged and non-reusable. USD0, Catalog hold, GROUP_2/3 and Public Beta boundaries
are unchanged. Version151 is not a post-Hardening default recovery target.

## Evidence and proof levels

- The consumed fresh-v8 receipt/closure chain links two matching Deployment checks
  to Version b2b62ec9-bb8d-4159-ac99-08fca5740134 at100%.
- The separately frozen release receipt links that Version to Build
  d98da799-d41d-41dc-acaf-8c6675fd799a and source
  88680a6eaab8de4123199f16b325ec0a430b0b86. Deployment JSON itself did not carry a
  Git SHA; this review does not invent that field.
- All24 encrypted captures verify ciphertext SHA, plaintext bytes and SHA. Bodies
  remain in memory; no decrypted HTML, source, identity, Cookie or key is exported.
- Source checkout, original artifact manifest and all1469 frozen reader inputs
  verify. Sixteen of23 resources exactly match the frozen local artifact bytes.
- Seven resources differ. AST review retains operators, literals, exports, calls,
  control flow and imported symbols; resolved references only map to known finite
  stems. Binding names and emitted chunk hashes differ. Import evaluation order
  is preserved by default. Only two exact reviewed HeaderUserMenu/Notifications
  byte pairs allow import sorting; only one exact reviewed useLocale pair allows
  moving the lazy React namespace initializer relative to locale data/functions.
  These exceptions are not generic semantic-equivalence rules.
- SiteHeader's exact1168-byte Production payload SHA is
  d38ccb187c70064b9bec7e27993090ade0408ca524cccef2aec7312521240902. It matches the
  frozen header after its exact SettingsPage import reference changes. The source
  is src/components/site/SiteHeader.astro: menu/dialog/keyboard handlers and a
  settings-navigation guard, not an Auth/moderation submission.
- All23 acquired resources close the observed literal login JS/CSS graph. This
  does not prove every runtime branch or other page. MIME/status/no-redirect checks
  were enforced by the frozen reader before capture; exact MIME header spelling
  was not retained and is not invented in this report.
- Build byte equality is false for7 files. The specific historical Cloud build
  environment/bundler reason is UNKNOWN; source identity does not prove build
  reproducibility, and differing filenames do not prove a bad Production build.

## Repair and verification

`policy.mjs` admits only exact evidenced Host/GET/path/version, actor/stage and
script/stylesheet type before the existing atomic budget gate/transport. The
browser verifies actual bytes/SHA before fulfillment. Old DaQNT1ww, unknown URLs,
foreign origins, wrong stages and wrong resource types stay blocked. No wildcard
asset grant was added. Owner budgets are unchanged.

`browser.mjs` is an offline-tested candidate adapter, not the frozen Production
entry. Every HTML response requires an explicitly reviewed full-body hash before
Chrome receives inline code. Integration tests bind a synthetic shell only, using
the acquired/reviewed JS/CSS. They never execute the raw Production HTML. All
physical test traffic is mapped to127.0.0.1; Chrome's deny proxy forwards nothing.
Actual CAPTCHA/Auth/Session behavior and16 RLS outcomes remain unexecuted.

Tests exercise all23 resources, hydration, import/hash matching, unknown/old paths,
pre-dispatch failure, concurrent budget exhaustion, unchanged replay protection,
sensitive-query redaction and rejection of modified inline JavaScript. No historic
123/43/31/9 suites are rerun.

## Exact remaining blocker

The captured graph does not include the post-login products-page script and its
catalog-compare-dom dependency, or AdminDevicesDashboard/useAdminSession. The
approved source explicitly uses AdminDevicesDashboard client:load and a products
index script. Their actual Production paths/content cannot be inferred from this
login capture or authorized from different local build hashes.

Full GROUP_1 reauthorization and full-flow budget sufficiency therefore remain
BLOCKED/UNKNOWN. The known login fixture fits the unchanged500 global ceiling;
that is not a total request count guarantee for manual Turnstile/full flows.

Minimum next evidence: the existing exact Production Build's complete client
artifact manifest plus referenced bytes, if retained, covering the products and
admin device page roots. Reuse the23 already acquired resources. If that archive
does not exist, only the uncovered pages/resources would need separately scoped
new authorization; this task neither requests nor executes those reads. Do not
repeat script-name diagnostics, download the23 again, auto-whitelist local hashes,
or create a fake READY full-group Packet.

## Local commands

`node --test tools/e-verify-group1-production-binding/provenance.test.mjs tools/e-verify-group1-production-binding/browser.test.mjs`

`node tools/e-verify-group1-production-binding/freeze.mjs`

The freeze command checks evidence and runs only the new targeted tests. It writes
new offline artifacts using exclusive creation; it cannot overwrite a frozen run
and performs no OAuth read, Production request, Claim or authorization operation.
