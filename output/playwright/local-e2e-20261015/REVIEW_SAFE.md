# Local Playwright Evidence, 2026-10-15

This is a scoped test artifact, not a competing project progress baseline,
Production authorization, or GROUP_1 acceptance receipt.

## Environment Discovery

- Reviewed checkout: `C:/Temp/ogh-product-beta-development-20261013`.
- Examined environment/configuration in this checkout, `D:/OpenGlass Hub`,
  the existing a-deploy-release-readiness worktree, and the existing public-beta
  and public-beta-main-integration checkouts. Secret values were not printed.
- The configured Preview Supabase target matches the known Production project.
  Preview naming does NOT establish database or account isolation.
- This checkout has no configured private local environment file. Example
  values are placeholders, not an executable isolated environment.
- Docker is installed; no containers were running. Local Supabase ports were
  not listening. Cached images and a CLI installation are not a running service.
- Existing protected GROUP_1 A/B/ADMIN bindings are Production-bound and were
  NOT used as isolated test accounts. No isolated actor configuration was found
  in the examined files. This is not an exhaustive search of private storage.

## Actual Execution

- Existing Playwright 1.62.1, cached CLI, and installed Chrome were reused.
- Headless Chrome ran directly, with fresh contexts and no Start/control page.
- Real current-source Astro ran on loopback port 4328. Both Supabase URLs were
  set only in the child process to the unavailable loopback port 54321, with
  deliberately invalid local-only keys. No Production environment was loaded.
- CAPTCHA was disabled ONLY in this local child process; this provides no
  Turnstile or Production CAPTCHA evidence and changes no deployed setting.
- Browser HTTP requests outside the two loopback ports were aborted. Background
  networking was disabled. This is not a claim of full-browser hard containment.
- No account credentials were entered. A reserved `.invalid` email was used
  only to verify native required-password validation; it was cleared afterward.
  No authentication or registration was submitted.
- No screenshots, HAR, storage state, cookies, or tokens from authenticated
  users were collected. Screenshots show empty, anonymous login forms.

## Results and Limits

`RESULTS_SAFE.json` contains 22 checks: 14 PASS and 8 BLOCKED, with no remaining
FAIL. PASS is limited to what each assertion actually checks:

- Three login viewport renders (1440, 390, 430); visible form and no horizontal
  overflow. Desktop and 390px screenshots were visually inspected.
- Empty-password form validation and login/signup mode switching.
- About, privacy, terms, guidelines, contact, settings, and admin page shells.
  An admin shell is NOT administrator authorization or private-data acceptance.
- Two real anonymous API GETs returned 401 with a denial body and no tested
  private-data fields. These are NOT the 16 authenticated RLS cases.

Seven database-dependent routes timed out in the initial browser run: home,
feed, news, product list/detail, circles, and search. Server logs independently
showed unavailable loopback backend errors. Their data/functionality remains
BLOCKED, not PASS; this does not prove a Production application defect.

Privacy link navigation also remains BLOCKED in this development runtime.
An additional local browser observation recorded a document request to privacy,
ERR_ABORTED, then reloads of login. The document-request initiator stack points
to `/@vite/client`, zero-based line 1656. The locally served code at that line is
the Vite `debounceReload` timer calling `location.reload()`. This proves the
immediate reload source, not the reason Vite requested reloads or a Production
application defect. No product code was changed to conceal it.

`INITIAL_ATTEMPT_SAFE.json` preserves the first script output. Its submit-button
strict-selector errors and denial-body shape assertion were harness mistakes,
not confirmed product failures. Only affected anonymous checks and four
independent legal pages were rechecked. The final report identifies reused
initial evidence. This is not a rerun of historical GROUP_1 or anonymous43.

## Missing Environment and Minimum Next Step

Auth, real A/B/ADMIN isolation, logout/session, 16 RLS reads, and business writes
remain BLOCKED or NOT_RUN. GROUP_1 completed cases remain 0/14.

Reuse the existing disposable local Supabase lifecycle/migration helpers
(`scripts/qa/local-disposable-supabase-replay.mjs` and
`scripts/build-local-supabase-replay-mirror.mjs`) to provision a loopback-only
disposable backend, then create three local-only actors and minimal disposable
fixtures with verified cleanup. Do not run their unrelated historical suites
or use Production actor bindings. These helpers were inspected, NOT executed
in this task. This needs local fixture setup, not another QA platform or paid
cloud resource. A truly isolated existing Preview is also acceptable only after
proving separate database and account scope.

No Production, provider, SDK, paid-service, migration, or business-write action
was performed. All old authorizations and Claims remain untouched and unused.
Catalog remains held; GROUP_2/3 and Public Beta remain NOT_AUTHORIZED.
