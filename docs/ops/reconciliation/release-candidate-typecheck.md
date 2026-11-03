# Candidate Typecheck Gate Repair

Scope: local type repair based on `3323cb85`, branch
`codex/release-candidate-typecheck-fix-20261016`. No merge, push, deployment,
Production read/write, migration execution, or live provider test.

## Gate And Attribution

The package's gate is `node scripts/test-astro-check-baseline-ratchet.mjs`.
No tracked CI workflow exists in this checkout. The ratchet invokes real
`astro check`, enforces the frozen toolchain and diagnostic manifest, and rejects
new diagnostics or edits at retained diagnostic anchors. It is not a zero-error
compiler gate. Astro build is a separate check.

The unchanged manifest at `e2f45dac135edfc10d866fc83df05c0590c1adb9` has
177 errors/90 paths. The initial candidate has 244 errors/90 paths: 110 exact
manifest matches, 56 matching path/code/message diagnostics at changed locations,
and 78 other path/code/message diagnostics relative to that older manifest.

For objective historical attribution, a disposable source archive of the recorded
released-source ref `88680a6eaab8de4123199f16b325ec0a430b0b86` was checked using the
same installed dependencies: 246 errors/91 paths. Its package manifest, lockfile,
and tsconfig match the candidate. All 244 initial candidate errors match both
historical path/code/message and the exact trimmed source line at that ref.
Candidate-introduced errors: 0; existing errors: 244. The previous media cleanup
repair already removed two historical diagnostics. This ref comparison does not
establish the currently deployed Production source commit.

Complete before/after file, line, column, diagnostic code and message inventories
are in `release-candidate-typecheck-safe.json`; raw local output is retained under
`output/typecheck/`. No credential or environment values are included.

## Minimal Corrections

- Declare the adapter-provided `cloudflare:workers` environment using existing
  application binding types; add only the already consumed optional R2/CAPTCHA
  binding names. This declares types, not runtime configuration or access rights.
- Restore explicit parser success/error unions so validated device fields narrow
  correctly. No validation, authorization, repository call or error response changed.
- Use the existing media projection type, schema-required circle timestamps,
  nullable profile-link result, literal navigation keys, precise MDX/heading types,
  and actual single-row foreign-key join projections.
- Preserve nullable Supabase clients through existing render/event guards and
  captured non-null clients. Widen translated message state to string; narrow
  report target variants before optional field access; remove only unreachable
  circle-deletion branches after an existing early return.
- Add concrete product payload, callback, Map and DOM element types. Placeholder
  assertions correspond to the existing mapper's four-value validation. No query,
  media cleanup, role/RLS, markup, stylesheet, limit or migration was changed.

No new `any`, `ts-ignore`, `ts-nocheck`, dependency upgrade, baseline refresh,
strictness relaxation, check exclusion or CI bypass. All 56 migrations are
byte-equivalent under Git's existing line-ending rules. All seven product-fix
commits remain ancestors.

## Verification

- Original ratchet PASS: current 56 errors/16 paths, zero new diagnostics, zero
  changed diagnostic source anchors and zero unparsed changed diagnostic paths.
  Raw `astro check` still exits 1 for these 56 frozen historical errors. This is
  explicitly NOT a claim of zero TypeScript errors.
- Existing `build-workers.mjs --local-config` PASS with loopback-only noncredential
  build configuration. No real Supabase/R2 connection or database startup.
- Eleven directly relevant existing scripts PASS: ratchet unit (19 assertions),
  device API matrix (62 behavioral descriptors), summary API safety, reports,
  catalog comparison security, Auth/profile SSR contract, search filter safety,
  search visibility, catalog specification presentation, catalog/search/news
  browser contract, and editorial SSR contract. The browser contract checks both
  locales and 390/430/1280 widths; it is local fixture evidence, not Production.
- No full Auth, RLS, migration replay, old Native QA, UI03 diagnosis, historical
  business E2E or live R2 suite was rerun.

Intermediate failures are retained, not reported as PASS: a CRLF-dependent source
assertion and stale search fixture without the already expected empty devices
projection; a blocked Astro package-update request; and a comparison click timeout
with a broad multi-row search dropdown. Only those test prerequisites changed:
normalize CRLF, supply empty fixture devices, disable Astro's update lookup in
local tests, and search each named product before ordinary clicks. Network guards,
assertions, expected results and normal Playwright actionability remain enabled.
Final local browser/SSR checks report external requests 0. The initial update
attempts were rejected before forwarding by the test fetch guard.

All test servers/browser contexts exited; no database/account/credential fixture
was created. The owned historical source snapshot remains at
`C:/Users/1/AppData/Local/Temp/ogh-typecheck-baseline-Kv88wt` because filesystem
cleanup commands were policy-blocked. Its `node_modules` is a junction to the
existing installation,not a dependency copy. No deletion is claimed; do not
recursively traverse that junction during manual cleanup.

Astro/JSDOM emit existing deprecation/CSS parsing warnings; no warning suppression
or unrelated stylesheet repair was added. Local diff/contract and gate verification
were completed; no independent review approval is claimed.

## Merge Boundary

Candidate is READY_FOR_OWNER_MERGE_APPROVAL for the resolved type gate, not merged
or deployed and not Public Beta GO. Existing release obligations remain: missing
Production comment migrations and separately reviewed quota baseline adoption,
unknown Production source/parity, GROUP_1 local10/14, UI02 local partial, and UI03
BLOCKED. Isolated R2 PASS remains reusable, not Production integration proof.

Next single action: owner reviews the candidate diff and authorizes code merge
preparation. Production migrations/deployment/smoke each require their existing
independent review and approval. Catalog remains ACTIVE; additional cost USD0.
