# Reports UI03 Local500 Followup

2026-10-16; source850355bc. Scoped evidence, not a competing progress baseline.

## Exact Route and Expected Authorization

- Normal reporter operation: POST /api/forum/reports. Real B dialog submission
  returned201; database reporter matched B. Separate A submission returned201.
- No ordinary own-reports page/API exists. Own-row access is tested against the
  real local Data API with ordinary authenticated JWTs and the anon key.
- GET /admin/reports/ serves a nonprivileged HTML shell; client role checking
  shows forbidden UI. Admin list GET and action POST must reject ordinary users403.
  HTML shell200 is not access to private report data. No new page or role grant.

## Proven Failure and Limits

The browser's B HTML navigation still returns500 with Error: Network connection
lost. A's preceding HTML200/read403/action403 completed. Safe evidence fields reset
per actor; B's unavailable response fields are null, not inherited A values.

An independent direct request through the same running Worker returned200 after
that500. Different request context/headers mean this does NOT prove proxy-only
failure or fix the browser path. The original test always remains FAIL. Direct
diagnostics are bounded, local-only, do not authorize data, and cannot replace
the original failure. No raw error page, URL query, session or header is exported.

Observed allowlisted runtime/proxy counters are0; their collection scope is not
complete runtime observability. No exact throwing stack, profile/RLS error or
causal cancellation evidence was obtained. ROOT_CAUSE=UNKNOWN; no speculative
SSR/auth/client/permission/transport or dependency patch was made.

## Real Local Regression

| Run | Actual results | Cleanup |
| --- | --- | --- |
| 4dfe0726f6c0 | 5 PASS / 1 FAIL / 9 NOT_RUN | PASS |
| d748066affc6 | 5 PASS / 1 FAIL / 9 NOT_RUN | PASS |
| 4885e7c51674 | 15 PASS / 1 FAIL | PASS |

Latest report-specific11 PASS/1 FAIL plus4 login/context prerequisites, not a
sum of runs. Reporter own row1/cross row0 for A/B; ADMIN can read both; anonymous
cannot read private reports. No service-role RLS test identity or policy change.
Temporary SQL fixtures are removed separately, even after failed assertions.

Actual admin review/dismiss UI and persisted resolver/status, refresh/filter,
superseded cancellation, deliberately injected503/no auto retry/manual recovery,
unmount/remount, mobile1440/390/430 dialog/keyboard/overflow and actual cross-tab
ADMIN signout/login/B forbidden role recheck PASS. Current A read/action403 and
prior source-applicable B API403 retained. No privacy/privilege gain observed.

Eight recorded idle windows5003-5014ms, total40071ms, additional list reads0.
The local guard rejected0; no pass obtained by suppressing repeated requests.
This is bounded evidence, not proof of no future polling. Mobile masked screenshots
retained;390px inspected. UI03 remains FAIL; UI02 local partial; GROUP1 stays10/14.
Original16 local RLS and23 business PASS reused, not rerun or recounted here.

## Safety and Minimum Remaining Requirement

All3 owned local databases/volumes/users/media/DPAPI credentials and test processes
cleaned; active pointer/ports absent. Pre-existing unrelated projects untouched.
No Production/R2 access, real third-party test, deployment, push or cost increase.
No product files, auth/RLS/GRANT, Cloudflare or Supabase configuration modified.

The only next local repair requirement is the actual HTTP500 throwing layer/stack
from the existing server path. Do not change permissions on the strength of a
generic Network connection lost or replace a failed browser navigation with a
successful direct Worker probe. No new QA platform or Production retry is needed.
