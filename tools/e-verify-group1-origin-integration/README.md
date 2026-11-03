# Origin Diagnostic Integration (Offline Only)

This independent QA work copy integrates the detached origin-review component
with the actual v16 browser lifecycle. It is NOT v17, an authorization, an
executable Production entrypoint, a Packet, a Claim or a GO. Consumed v16 files
and the original unidentified request remain unchanged/UNKNOWN.

## Narrow Changes

- `browser.mjs` is v16 plus observational attachment, phase labels, receipt data
  and bounded cleanup. A source-equivalence test removes those additions and
  compares the remainder byte-for-byte. Auth, Session, identity, RLS, classifiers,
  routes, scope, budgets650/40 and manual Start are not replaced or relaxed.
- `integration.mjs` attaches actual context request events and a main-page CDP
  Network session before application navigation. It never installs a transport
  or allows a request. Existing unknown-request rejection still stops the run.
- The evidence limit1024 is a diagnostic fail-stop limit, not an increased request
  budget. At most four CDP candidates per key are retained. Correlation is by
  per-run HMAC of method/URL, NOT a shared CDP/Playwright request ID. Duplicates
  stay ambiguous. CDP and Playwright Frame identifiers are not asserted equal.
- Main/child Frame identities, parent relation, redirect parent, phase, actor,
  method, resource type, ordinal, known public-resource ID, rule decision and
  safe invalid-Origin reasons are recorded. Initiator stacks/URLs are not exported.
- Missing OOPIF/Worker/SharedWorker/WebSocket observations remain UNKNOWN. Native
  dispatch remains UNKNOWN_OR_ALREADY_SENT and MONITOR_ONLY, never pre-dispatch
  HARD. No claim is made that soft stopping can revoke an already-sent request.

## Protected Origin Evidence

`openProtectedOrigins()` reuses the existing asset-reader DPAPI initialization
and owner/SYSTEM-only DACL. Its small PowerShell stdio helper must be started
BEFORE the existing Node guard, inside the existing supervised process tree.
Afterwards it uses only its existing pipe, not spawn/network/Node-guard bypasses.
The caller must close the store if browser initialization fails before attachment.

Only HTTPS DNS scheme/host/port is eligible. No pathname, query, fragment, header,
body, password, Session, account, CAPTCHA token or credential is submitted to
storage. Unsafe userinfo/IP/opaque envelopes stay PRIVACY_BLOCKED. Missing or
failed private capture stops safely, never falls back to plaintext.

Every capture/read checks owner, exact allowed DACL principals/rights, and no
reparse ancestors/files. Ciphertext uses CurrentUser DPAPI with namespace entropy;
each reference has a ciphertext SHA256. Capture is bounded to16 Origins per helper.
Default logical lifetime is one hour, maximum24 hours; encrypted expiry rejects
reads. Expiry is NOT a claim of scheduled physical deletion. Owner review should
finish with `close({destroy:true})`; the helper checks exact owned filenames and
deletes only this private directory. All successful fixture stores are destroyed.

Safe receipts retain opaque store ID, storage namespace, expiry, reference and
ciphertext hash, not the private directory path or Origin. This makes later local
review possible after the process exits; no discarded-key dead end. In a trusted
offline process, reopen with those IDs and `reopen:true`, then call
`read(evidenceRef,ciphertextSha256)`. Its structured Origin return is PRIVATE
MEMORY ONLY: never forward it to console, ordinary logs, chat or shared receipts.
This protects against other ordinary users, not a compromised owner/SYSTEM.
The storage namespace is NOT an Authorization ID and grants no network rights.

## Evidence and Next Decision

The13 new targeted tests cover actual Chrome/CDP Frames/redirects/initiator
candidates, invalid and unknown Origins, private read after process termination,
DPAPI/DACL tamper/reparse/expiry, privacy, Node-guard compatibility, native Stop
and deadline, supervised process-tree drain, and unchanged security code.
Fixtures use `.invalid` destinations fulfilled/aborted locally plus deny proxy/DNS.
No real SDK, login, Production, third-party call or historical suite is replayed.

READY means ready for owner-directed NEXT AUTHORIZATION PREPARATION only. It
does not prove the unknown Origin legitimate or make a full run authorized.
The next contract must disclose this narrowly scoped private evidence collection
and preserve default rejection, existing time/budget/scope and Catalog hold.
No new contract, Packet, UTC window or valid authorization is generated here.
