# Fresh v8 Asset Evidence Instance

This is a mechanical one-shot copy of v7 after its zero-request OAuth preflight
stop, not a retry or extension of v7. Original code, approval and failure receipts
stay unchanged. Only the authorization ID, exact separate GO and instance paths
are rebound; request flow, finite asset scope, budgets and source identities remain
unchanged. Original31/31 tests are reused; only isolation/consistency checks run.

The current complete pending contract is in `artifacts/`. Its five gates and UTC
times are null, requiring fresh owner confirmation. No approved JSON, real Claim
or GO is generated here. OAuth coverage is a point-in-time local observation and
must pass again at the actual separately approved GO. No Production request.

`prepare-fresh.mjs` creates new artifacts exclusively and refuses existing state.
It never calls the real entry, logs in, refreshes OAuth or creates a real Claim.
The v7 instance is permanently stopped and must not be reinvoked.
