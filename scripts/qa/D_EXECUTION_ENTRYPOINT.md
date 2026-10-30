# Bound D execution entrypoint

This is the existing D acceptance workflow's execution host, not a deployment,
browser controller, approval, or new request allowance. Production remains
blocked until the new source is explicitly adopted and runtime evidence passes.
It never runs B, repeats B1, modifies C/CORS, or deploys website code.

## Start

From the reviewed QA checkout, with an absolute, owner/SYSTEM-only private plan:

```powershell
node scripts/qa/d-execution-entrypoint.mjs --inspect --plan C:\absolute\private\D.plan.json
node scripts/qa/d-execution-entrypoint.mjs --execute-production --plan C:\absolute\private\D.plan.json
node scripts/qa/d-execution-entrypoint.mjs --resume-cleanup --plan C:\absolute\private\D.plan.json
```

`--inspect` loads no credential and starts no window. It checks actual source,
inherited approval/evidence, directory ACLs and callable local carriers. It is
NOT provider permission, a browser login, or Production PASS. Execution consumes
an authorization-wide single-use claim **before** private S3 input. A changed
directory cannot recreate counters. An unknown input cannot be retried.

The private plan has `schemaVersion:1`, fixed `account`, `bucket`, `project`,
`runId`, `directory`, `downloadsDirectory`, `connectionBindingSha256`,
`moderatorId`, `tokenLabel`, `frozenArtifactSha256`, `observerSourceSha256`, and
`remainingCaps:{Auth:11,REST:12,Worker:12,HEAD:6,management:2}`. Evidence references
are `{path:<absolute>,sha256:<actual bytes>}`. Required references:

- `sourceAdoption`: kind `D_EXECUTION_ENTRYPOINT_SOURCE_ADOPTION_V1`, exact
  `sourceCommit`, `sourceHashes` for every required QA file, original
  `parentRecoverySha256`, `runId`, `executionDirectory`, `headCap:6`, `actorCap:1`,
  `uploadCap:1`, `dMinutes:180`, `businessStopMinutes:135`.
- `ownerApproval`: actual owner decision, `adoptionSha256`,
  `statement:D_EXECUTION_ENTRYPOINT_ADOPTION_GO=APPROVED_FOR_EXACT_SOURCE_AND_UNCONSUMED_D_ONLY`,
  `entrypointMethodAccepted:true`, `feeRiskUnchanged:true`, `oldDebitsPreserved:true`.
  The host cannot create this approval on the owner's behalf.
- `parentOwnerApproval`, `inheritedFiles`, `independentReview`, `targets`,
  `runtimeAdmission`, `moderatorEvidence`, `bucketEvidence`, `corsEvidence`,
  `videoTemplate`. The loader validates original target and
  reader hashes. The independent review binds the adoption hash and non-author
  reviewers; no self-review or unavailable-reviewer result counts as PASS.
- `credentialInput:{nonce,expectedPid,deadlineUtc,readyRecord}`. The existing
  reviewed PowerShell7 CurrentUserOnly pipe is the sole S3 secret channel.
  Start the native `--execute-production` process immediately after the capture
  publishes READY and the private plan binds that exact record/PID. Do NOT wait
  for the owner's input-complete message. Capture waits for a nonce/adoption-bound
  native receiver ACK before showing any S3 input prompt. Its original absolute
  input deadline (at most 120 seconds) is unchanged; no connection retry occurs.
- `supplierConfirmation:{path,deadlineUtc}` admits one later **non-secret**
  confirmation, at most ten minutes from loader invocation, no later extension.
  The exact path is `supplier-confirmation.<inputNonce>.safe.json` inside the
  private execution directory. It must not exist before input transfer. After
  transfer the native host emits `OWNER_SUPPLIER_CONFIRMATION_REQUIRED` and keeps
  credentials only in its own memory while waiting. This starts no D window or
  provider request. The trusted owner-result importer must publish actual owner
  confirmation, never a prediction or Codex signature: `schemaVersion:1`, exact
  `runId`, `nonce`, `sourceAdoptionSha256`, `tokenLabel`, `ownerConfirmed:true`,
  `provenance:OWNER_OFFICIAL_DASHBOARD`, and actual `confirmedUtc` after input.
  Its `supplierEvidence:{path,sha256}` binds the actual immutable bytes at
  `supplier-evidence.<inputNonce>.safe.json` in the same private directory.
  Supplier evidence records the exact token label/account/bucket/permission,
  24-hour TTL, create-after-visible-prompt assertion, and conservatively proven
  `issuedUtc`/`expiresUtc`, without inventing official timestamps. The native
  runtime uses this actual evidence hash for HEAD provenance, not an unfilled
  pre-creation hash. Missing/malformed/mismatched/expired confirmation stops and
  clears held credential references, retaining the exact-token revocation duty.
  Source, owner readiness, Standard context and actual local carriers are checked
  again before starting D's unchanged 180/135-minute window. These method/source
  changes grant no new Token or request allowance and require source adoption.

`runtimeAdmission` is an evidence-backed gate record, not an approval. Its kind
is `D_RUNTIME_ADMISSION_NOT_AUTHORIZATION`; it pins the adoption and run, actual
`ownerReadyUtc`, original unused alias and isolated ordinary Edge context,
unchanged moderator, legal/fallback/cost/permission/revocation/pause conditions,
and at least two hash-checked `permissionEvidence` references. Missing, invalid,
stale or mismatching evidence fails closed; a Free plan or nonempty environment
variable is not permission/cost proof. Resume reuses original pre-creation facts
without pretending the created alias is still unused; no new business is allowed.

## Real call adapters

1. **Ordinary/moderator Edge:** immutable reviewed same-page scripts and exact
   result filenames in a private outbox. Codex delivers the new script through
   the already-approved manual method. The owner runs it once in the named
   isolated context; the carrier automatically imports the bounded exact download
   with binding/nonce/source/deadline validation. Old, renamed, malformed,
   secret-bearing, expired or already-present downloads are rejected. No Cookie,
   JWT, password or R2 credential leaves the page. Normal login/CAPTCHA remains
   human-operated. Codex records the actual non-secret login confirmation as
   `ordinary-login-<runId>.safe.json` with run/actor IDs,
   `normalPasswordLoginOnce:true`, `legalConsentReady:true`; no inferred login.
2. **MCP exact source DELETE:** a local Node process cannot invoke a ChatGPT tool
   directly. Trusted Codex imports `openDTrustedToolBridge(planPath,{register:true})`
   only after discovering the exact available Cloudflare execute tool. The local
   peer registration proves no provider permission. When the host emits
   `CODEX_MCP_TOOL_CALL_REQUIRED`, Codex uses `takePending()`, checks
   `canDispatch(ticket)` immediately, calls the existing
   `mcp__cloudflare__execute` with `account_id:ticket.account_id`,
   `code:ticket.code`, `truncate:false`, and passes the **complete actual tool
   return** to `acceptResult({ticket,toolResult})`. Keep it inside tool
   orchestration/private receipts, never print raw results. Each take is
   irreversible; tool errors/timeout/unknown dispatch cannot be taken again.
   Synthetic injected `invoke` callbacks are rejected in production mode.
   The peer is renewed locally before cleanup if older than ten minutes;
   registration does not create a provider request or extend any window.
3. **Anonymous media:** the pinned existing browser video reader uses
   `credentials:'omit'` on the exact synthetic production media route. It checks
   unpublished/deleted application 404, received bytes/hash, actual browser
   decoding/time advancement, and a second observation after at least ten minutes.
   Public URL 404 is never used as independent R2 object-absence evidence.
4. **Auth fixture and containment:** a fixed child process holds only the existing
   permitted backend admin environment. Password creation and local display stay
   in the child; no secret IPC, argv, file or clipboard. Every individual admin
   call waits for the parent's fsynced quota intent, then returns minimized
   identity-bound response evidence and waits for its ACK. Separate containment
   can handle a proven actor after the create child fails. Exact preban/readback,
   876000h ban and logout are independent assertions; no existing identity is
   adopted and no service-role ordinary session is used.
5. **S3 HEAD:** the existing native-TLS AWS SDK verifier is retained. Six calls
   maximum, exact created source/retained keys, creation and deletion receipts,
   per-dispatch intent and per-response journal ACK. Omitted storage-class header
   follows the documented Standard HEAD semantics; explicit IA/unknown values
   stop D. No body, LIST or legacy key is accessed by this entrypoint.

## Success, stop and recovery

The entrypoint reserves cleanup capacity before business, including global
logout, three containment calls, two forum reads, four cleanup HEADs, exact
source DELETE and anonymous post-delete denial. Normal login/legal and possible
native form rollback are conservatively debited **before** owner actions; they
are not refunded. A source DELETE cannot consume another workflow's allowance.

Normal order: create/login -> source upload/server retained receipt -> two HEAD
200 -> unpublished denial -> exact approval -> decode -> ten-minute persistence
and metadata comparison -> two predelete HEADs -> ordinary author delete ->
independent forum/anonymous denial -> exact source DELETE -> two independent HEAD
404 -> global logout and exact actor containment -> official Token revocation.
The reviewed ETag-failure partial-source recovery remains a failed D assertion,
not successful acceptance. Unknown keys or mutation outcomes remain residuals.

Production completion also requires the owner to revoke the exact token in the
official Dashboard and Codex to record the actual owner-reported status in
`token-revocation-<runId>.safe.json` with run/token label, `status:'REVOKED'` and
`officialPageVerified:true`. Provenance remains OWNER_OFFICIAL_DASHBOARD, not a
fabricated independent provider call. Revocation is never object cleanup.

The journal uses hash-chained immutable receipts; publication follows successful
fsync/readback. An incomplete publication blocks restart instead of turning a
failed ACK into PASS. All unknown intents stay consumed. Recovery uses the exact
original claim/window and only unissued cleanup actions. It never reconnects the
consumed S3 input pipe or replays a HEAD. Consequently deletion may be acknowledged
while independent absence remains UNKNOWN after a crash; report that residual,
never CLEANUP_PASS. Interrupted or unknown containment phases are not skipped or
retried. An expired cleanup window requires a new, narrowly authorized decision.

## Local integration verification

```powershell
node --test scripts/qa/test-d-execution-entrypoint.mjs scripts/qa/test-d-execution-carriers.mjs scripts/qa/test-d-protected-actor-carrier.mjs
```

These run fictitious credentials, real local child/IPC, temporary private-file
handoffs, mock tool returns and fake AWS SDK transport only. They do not prove
Production upload, decode, persistence, permissions, cleanup or historical media.
