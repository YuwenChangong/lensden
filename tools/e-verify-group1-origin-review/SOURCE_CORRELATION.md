# v16 unknown-origin review: offline result C

Actual v16 request identity and root cause remain UNKNOWN. The saved request was
a valid HTTPS GET/fetch outside the application, Supabase and challenges origins.
No evidence justifies adding an Origin or changing its authorization classification.
This review creates no execution version, authorization ID, contract, Packet or GO.

## Evidence-backed source correlation

- Released checkout HEAD is `88680a6eaab8de4123199f16b325ec0a430b0b86`.
  Existing v8/v9 captured bodies were parsed as data, never executed or downloaded.
  These are historical bytes, not newly saved v16 response bytes.
- `src/pages/login/index.astro:34` renders AuthPanel with required runtime CAPTCHA
  props. SiteHeader renders the search/menu/notifications/locale islands. Hydration
  can schedule effects asynchronously; v16 saved no per-resource timeline.
- `src/lib/supabase-browser.ts:10` constructs the SDK from build-time public config;
  the captured supabase-browser module contains the expected contracted Supabase
  Origin. `useBrowserAuthState.ts` calls SDK getSession. AuthPanel submits password
  login only from `handleAuthSubmit` (line176/192). v16 observed Auth dispatches0;
  these findings do NOT identify an unknown fourth Origin.
- HeaderUserMenu summary is a relative `/api/users/me/summary` read gated on a
  signed-in actor; HeaderNotifications reads a relative notifications endpoint
  only when signed in. Locale sync reads preferences only for an actor. Search
  uses a relative endpoint after at least2 query characters. No direct external
  initialization fetch was found in these application callsites.
- Captured GlobalSearchBox includes a public R2 media base used by result images,
  not a direct initialization fetch. Legacy Pages Origin is in redirect-safety
  helpers, not a fetch target. React documentation/XML namespace strings are not
  evidence of outbound requests. Do not promote these strings into candidates.
- Captured `page.Dtz6tGCc.js` SHA256
  `1c99026c0527cac05d3a172c386fdd43767eac5818e26c45ff353ad5d1f03aa9`
  has one fetch call with priority/headers and a same-Origin equality guard.
  This corresponds to Astro prefetch (`astro/dist/prefetch/index.js:127-156`),
  not a discovered direct fourth-Origin target. A later native redirect cannot
  be ruled out by the incomplete v16 redirect metadata.
- `AuthTurnstile.tsx:9,56,64` proves mount -> official SDK load -> render code path.
  v16 observed4 vendor requests, but saved neither SDK/challenge byte content nor
  their exact request/Frame sequence. Their opaque dynamic behavior is a POSSIBLE
  mechanism only, NOT evidence that they caused the unknown request. The earlier
  official TEST-sitekey callback cannot identify a Production-sitekey request.

Source root above is
`C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass Hub`.
No new browser initialization/Auth/RLS/Turnstile/resource suite was run.

## Confirmed diagnostic loss

`e-verify-group1-control-v16/browser.mjs` passes a hardcoded unavailable Frame and
omits redirectedFrom. `e-verify-group1-other-request/public-resources.mjs` reduces
unknown Origins to one category; its HMAC includes that category and pathname,
not Host or method. The random key was never retained. No retained dictionary,
URL, origin evidence, CDP event or HAR can restore v16 Host/path. `NONE_OBSERVED`
was a default, not proof of no redirect; credentialEnvelope was URL-userinfo only,
not a captured Authorization-header inspection. MONITOR_ONLY dispatch stays
UNKNOWN_OR_ALREADY_SENT. Result A is not established; result C is the conclusion.

## Minimal diagnostic-only change

`diagnostic.mjs` is a detached evidence component, NOT wired into a runner. It
never permits/sends/aborts requests. Existing classifier rejection is preserved;
source-known Host identifiers are lookup evidence, never authorization. It reads
actual Request Frame/redirect parent, creates per-run origin-sensitive match IDs
and unique event IDs, and accepts bounded CDP initiator metadata without raw
headers, bodies or stacks. CDP/Playwright join is explicitly a candidate, never a
proven identity; duplicate candidates remain ambiguous and missing/OOPIF/Worker
events remain unavailable. It does not promise full native network coverage.

For a normal unknown HTTPS DNS Origin, only scheme/host/port may be passed to a
separately bound private capture adapter. No pathname, query, fragment, cookies,
Session or headers are passed. Opaque/credential/IP envelopes are PRIVACY_BLOCKED.
Shared evidence contains only the private reference, known identifiers and safe
classifications. The component cannot prove a caller-supplied sink is protected:
real DPAPI/DACL adapter integration has NOT been done or authorized here. Tests
use an in-memory sink only. Missing/failing sinks are explicit; no false recovery.
An unknown sensitive pathname still remains undisclosed and cannot be assumed safe.

New9 targeted tests PASS (8 unit +1 real Chrome/CDP mocked fetch). The Chrome test
uses fulfilled `.invalid` URLs, deny proxy/DNS and a temporary profile, no accounts,
SDK or external network. It proves new metadata can be obtained; it does NOT
recover v16 or prove a Production request legal. Old305 files/receipts stay intact.

## Single next decision

Keep full GROUP_1 BLOCKED. The uniquely missing historical evidence is actual
Origin plus trustworthy request-source correlation. Existing evidence cannot
recover it. Owner may review whether to allow that narrow private observation
in a future separately approved instance; no Production diagnostic is requested
or prepared here. A future event would be independently identified; it cannot
retroactively restore or prove v16's lost request identity. No guessed allowlist,
v17, valid authorization, Claim or GO.
