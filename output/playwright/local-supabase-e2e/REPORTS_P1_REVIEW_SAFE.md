# Reports Admin P1 Repair

2026-10-15, based on63f3b33e. Scoped evidence only; unique project baseline remains
docs/ops/PUBLIC_BETA_CURRENT_STATE.md. No Production/R2 access or deployment.

## Root Cause and Minimal Product Diff

AdminReportsPanel's list effect used `[adminSession, queryString, refreshNonce]`.
useAdminSession returns a fresh wrapper per render; updating loading/reports
re-ran that effect continuously. No intentional list polling/cache invalidation
or list retry timer exists. Real built Astro/Chrome evidence predates this fix,
so this is not merely React development double-render or Vite reload behavior.

Only this component changed: stable session/status/setter plus existing query
and refreshNonce dependencies; pass AbortController.signal to adminFetch and
abort in cleanup. Already-existing cancellation guards keep stale responses
and errors from changing current state. No CSS/markup, auth hook, server API,
role check, RLS/schema or provider configuration changed. Genuine auth changes,
filters and action refreshNonce still trigger reads. No all-refresh suppression.

Existing reports unit test extended with regression guards, RED on old dependency
then PASS after fix; existing reports audit PASS. Each browser run uses the real
guarded build, PASS. No historical full suites rerun or new testing platform.

## Scoped Real Local Runs

| Run | Actual result | Owned cleanup |
| --- | --- | --- |
| 3a968555ac8c | 9 PASS / 3 FAIL / 3 BLOCKED | PASS |
| 2496a20a1047 | 13 PASS / 1 FAIL / 1 BLOCKED | PASS |
| 2edf5ad9d763 | 6 PASS / 1 FAIL / 8 NOT_RUN | PASS |

Latest distinct14 PASS/1 FAIL includes4 session/context prerequisites;11 reports
checks =10 PASS/1 FAIL. Original failures remain unchanged, never a full PASS.

- Real reporter API creates one owned report. Actual review/dismiss UI responses
 200, database status/reviewer identity and default queue removal verified.
- Initial/reload2 attempts,1 completed response; Auth initialization can supersede
  an earlier load. After readiness, actual1204-1215ms observation windows see0
  extra list requests. Search/note/focus rerenders produce0; no safety cap was
  triggered in latest affected checks. These are bounded observations, not proof
  of infinitely-long idleness or a new Production hard request limit.
- Browser reload, actual filter switch with held superseded local request,
  stale-list exclusion,503 UI/no auto retry/manual recovery, pending-read unmount
  and remount PASS.503 is explicitly a local error fixture, not a real outage.
- First test required exactly1 initial503; source/runtime permit2 initial Auth
  attempts followed by no idle retries. Corrected assertion and actual request
  listener for intercepted/aborted requests, not product behavior. First failure
  caused dependent missing-UI timeouts; preserved. Auth followup fixes a test
  selector: existing English button is Logout, not Log out. No invented click.
- Real same-context auxiliary settings page signs ADMIN out, logs ADMIN back in,
  then after signout logs B in. Parent admin page recovers for ADMIN, becomes
  forbidden for B with no list read; other A/B contexts retain identity. Tokens
  stay in existing in-memory/browser-private handling, no raw session export.
- API read/action403 for A and unchanged DB post/report verified up to the
  failure point; existing source-applicable B API denial evidence is reused.
  Latest A forbidden page200 is real; no list/toolbar visible. B role-recheck
  UI is also forbidden. Authorization rejection evidence PASS, but the complete
  ordinary-user page/API composite is not PASS; see outstanding failure.
- Admin mobile1440/390/430: no horizontal overflow, native Tab filter focus,
  confirm dialog fits viewport, Escape closes without DB mutation. Masked
  synthetic screenshots inspected. Does not close full video/a11y requirements.

## Remaining Local Failure, Not Hidden by P1 Closure

`REPORTS_ORDINARY_USERS_DENIED` still FAIL. Built local application returns500
with safe diagnostic `Error: Network connection lost.` in the ordinary-user
reports navigation path. Latest followup records failure at actorB/PAGE after
actorA page200/read403/action403. Legacy shared evidence fields retained A's
values when B navigation failed; primary500 is not overwritten by that200.

Exact cause UNKNOWN. Source SSR route does not perform actor-specific checks;
do not infer provider, product authorization or transport cause from that alone.
Do not mark500 as successful RLS denial or benign cancellation. Cross-tab B
forbidden UI PASS does not erase this failed navigation. No further retries,
global fetch changes, proxy development or unrelated product patch.

The repeating-read P1 is repaired; remaining page500 is a separate observed
local failure requiring one precise local reproduction/causal diagnosis. No
claim of Production failure/parity. UI03 remains FAIL, local GROUP1 remains10/14.
UI02 is LOCAL_PARTIAL_PASS with video/full accessibility not complete. Previous
business23 PASS, Catalog RLS16/16 and image/thumbnail evidence reused; selected
business still has1 current local failure,1 R2 blocker and1 deferred editor.

## Safety and Cleanup

All3 exact owned Supabase instances/volumes/users/fixtures/media and encrypted
credentials removed, local app listener and active pointer absent. Browser and
worker disposal receipts retained. R2 configuration/secrets not read or used;
no cloud setup. Production requests/writes/auth/deployments0, third-party test
requests0. No old authorization/Claim reuse, push, Catalog change or paid service.

Next single local action: narrow the ordinary-page500 to the exact failing
navigation/transport event without weakening403, session or privacy controls.
Owner's isolated R2 setup and later independent approval remain separate.
