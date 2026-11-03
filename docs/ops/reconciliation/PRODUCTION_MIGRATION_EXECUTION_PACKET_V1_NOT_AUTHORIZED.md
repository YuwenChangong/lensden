# Production Migration Execution Packet v1

STATUS: BLOCKED_FOR_EXECUTION / OWNER_REVIEW_DRAFT.
This is the existing v1 Packet,not a new authorization or GO. No Production
operation,push,merge,deploy,paid resource,UTC window or Claim is authorized here.
The current review used local evidence only (0/2 permitted Cloudflare GETs).
Historical read-only preflight requests are
not reusable grants. Original3 migrations/hashes and all old receipts stay intact.

## 1. Source And Exact Scope

- Local main remains `fedf5627a7cd2a28a6f5c0732c333b4e2fad56bb`.
  Product candidate remains `1de74e199244a19a3a3aa425f51005340c2f1658`.
- Current review branch:`codex/pre-migration-compatibility-recovery-20261016`,
  based on implementation `ca922f84c4d0eb4e6fbf64db3a08ecddf0979517`.
  This branch is NOT merged to main and is NOT deployed.
- Production target remains `xcbnxzjlsvtgzixurcof`. Existing prepared connection
  parser requires that project and Supavisor SESSION,not transaction6543.
  Existing CA-verified TLS handling is reused;no credentials are copied to this
  Packet,argv,ordinary logs or source. No connection was opened to that target.
- One new independent migration was created with installed CLI migration new,
  with update notifier/telemetry disabled and no network operation. Canonical
  SQL count57=unchanged56 plus1. No full57-file rebuild was claimed or repeated.

| Execution phase | Version / migration suffix | Canonical LF SHA256 |
| --- | --- | --- |
| 0 | 20261016090712_align_comment_reaction_select_scope | 9aa23de3d7ef0f81d235376ca963e7930007455d353a32b6e9ef475a2943bd5b |
| 1 | 20261015072723_restore_comment_reaction_application_privileges | df6935f6290345421b86b6917badaa4c1ea969cbb84c8a5d6b5d29ea359ec733 |
| 2 | 20261015074931_safe_deleted_comment_placeholders | 74e5d378c2cca962f5ca3ec60f2903404b514bede2644c10e230d41862b68afe |
| 3 | 20261016061618_adopt_existing_forum_rate_limit_baseline | f860daa2a07ff1bf0c53a5497894208a6bba8424bd5a17f37d6849cf4d38ad8e |

Files are in supabase/migrations/ with .sql extension. Phase0 MUST precede the
older-numbered GRANT migration in Production. This dependency order is explicit,
not filename sorting. Fresh canonical replay can run the new migration last:
there is already only the accessible policy and the new migration is a no-op.
Do not use root db push,include-all,migration up,Vault,roles,seeds or history repair.

## 2. Actual Local Reaction Proof And Minimal Alignment

The prior Production catalog reads proved:
- Reaction RLS enabled,FORCE=false,owner postgres;anon/auth privileges absent.
- Two PERMISSIVE SELECT policies for anon/authenticated,no restrictive SELECT.
  accessible uses can_access_public_comment_read_target(comment_id).
  Extra select_public uses EXISTS visible comments with status='published'.
- Comments RLS also permits comment author,post author and staff. Thus the OR
  branch can expose reactions to a published but non-public comment to its author
  or post author,even though the public-helper branch rejects it.

A new owned local Supabase Postgres17 fixture used the actual canonical
comment/reaction policies and helpers,real anon/authenticated database roles
and the image's auth.uid(). JWT claim context was set only for database RLS
tests;this is NOT Auth login/CAPTCHA/session or Production E2E evidence.

Actual results:
1. Before GRANT:anon,A,B queries rejected42501.
2. Frozen Reaction GRANT plus old Production policy combination:anon saw the2
   public reactions;A/B also read the seeded hidden-author reactions;A read the
   non-public comment on A's post. Unrelated B could not read A's hidden comment.
   This is a real LOCAL expansion,not a claim about existing Production rows.
3. New alignment:anon,A,B,ADMIN retained both public reactions and no hidden
   reactions. A could not delete B's reaction or insert as B. Write-policy and
   other business-RLS definitions remained unchanged.

The new migration uses guarded ALTER POLICY ONLY:
- Retains select_public name,roles,command/permissive identity;does not DROP it.
- Accepts only the exact known legacy predicate or already aligned predicate.
- Requires the canonical accessible policy,roles,table owner/RLS state and no
  unreviewed SELECT/ALL policy. Drift raises and rolls back.
- Changes only the legacy USING to the existing strict public-read helper.
- No GRANT,helper replacement,other RLS,data DML or new business authorization.
- Already aligned rerun and canonical missing-legacy case are no-ops.
  An unexpected USING(true) is rejected,not overwritten.
- Recovery would require independently approved exact before-state forward
  handling. Do not automatically restore the broader SELECT predicate after
  grants:that would reintroduce the proven risk.

## 3. Exact Executor And Changed Registration Contract

Prepared minimal module:`scripts/qa/release-migration-phases.mjs`.
It reuses the existing catalog Postgres adapter,CA/target parser and installed pg.
There is NO Production CLI entry point,automatic credential refresh,Claim or GO.

Module SHA256 (LF):
`bf24df307eefc2dbe7150b3a6b38350e0997032babafff7bc35bf2121d384ba6`.
Focused test:`scripts/qa/test-release-blockers-local.mjs`,SHA256 (LF):
`dde9393b53aea7d297734497bdce7a8f3bc19c6c2fa1645bc7b53b494dc37551`.
Future authorization must bind the final reviewed source commit and unchanged
adapter/parser/pg dependencies as well,not only these two strings.

The module freezes4 files/hashes,57 allowed repository migration filenames and8
known historical version/name pairs. Unknown repository SQL,unknown history,
missing/out-of-order prerequisite,altered file bytes or before-state drift stops.
None of the other53 files is executed. The source bytes are read once and detached.

Production historical ledger,from the previous approved read-only capture:
20260518/forum_phase1_schema;
20260703/moderation_action_notifications;
20260815010632/admin_circle_lifecycle_and_safe_purge;
20260902042807/forward_reconcile_devices;
20260904101403/forward_reconcile_security_privileges;
20260909195640/device_schema_v1_foundation;
20261004003349/public_device_detail_v1;
20261004014637/catalog_editor_presentation_v1.
No entry is renamed,inserted to simulate history,or repaired. Aliases stay aliases.
The local test seeded marked LOCAL_HISTORY_FIXTURE_ONLY entries exclusively in
its owned database to simulate this shape;these are NOT Production provenance.

Future per-phase interface,not permission to invoke it:
1. Existing protected connection source -> prepareReleaseConnection(environment).
2. Independently approved target/source/authorization/backup/free-only/UTC gates.
3. A trusted,owner-bound expectedBefore metadata snapshot/hash including the
   complete existing ledger,policies,grants,helpers,quota and placeholder state.
   Never trust an arbitrary supplied baseline or blindly adopt the live snapshot
   as the expected state. A changed history/object requires independent review.
   Function definitions and migration statements are hashed in the server-side
   projection,not returned as raw text. Snapshot data stays in protected process
   memory;share only safe results/hash,no credential or business-row export.
4. executeReleasePhase({root,index,open,expectedBefore}),ONE specified phase.
5. Verify PASS and cleanup;bind the verified after-state before the next approved
   phase. Any other result stops. No outer retries or automatic phase advance.

Substantive change from the former CLI proposal:normal NEW migration registration
is now done by the exact controlled adapter in the SAME transaction as that SQL,
rather than by the CLI after the SQL file commits. It inserts only the one truly
executed version/name/canonical-source array;it does not repair or fabricate old
history. No ledger schema creation/ALTER or Vault call is performed.
This change and phase0 need separate owner acceptance before Production execution.

Proposed future bound,NOT approved execution:4 independently gated phase calls,
one connection each,no retries;at most15 explicit client SQL dispatches per phase
including rollback reserve. Reserve at most2 separately approved READ ONLY
precondition/reconciliation batches (at most4 dispatches each),one for initial
before-state verification/binding and one for failure inspection,then stop.
Total proposed ceiling68 explicit SQL dispatches/6 connections. A frozen body is
one client dispatch but contains its disclosed multiple SQL statements;this is
not a provider-internal network/packet hard cap. No business-row DML/RPC call.
These counts replace the earlier3-CLI-phase/dry-run proposal only if the owner
accepts this exact revised scope;no old read/write budget is silently reused.

## 4. Wrapper Transformation,Timeouts And Atomicity

Original files/hashes are unchanged. The module recognizes and removes ONLY the
first outer BEGIN and final COMMIT,then supplies one controlled transaction.
All substantive SQL bytes remain identical. The source and executed-body hashes
are both explicit;do not pretend executed bytes include the removed wrappers.

| Phase | Executed-body LF SHA256 |
| --- | --- |
| 0 | e9d90003643c36729d806d97ea11ef7e0220566181d96ea8282d38c9f2ee2a2c |
| 1 | 70ff63a74ee4b938683cf9358ee86c7e6f30593459119c6530872bcb8650ec55 |
| 2 | 1b8e2d23a8a457e30e96c554021904cb8d1c22f760bbc8ed934837cac72277ee |
| 3 | be0304cb4d08b91700ee93ef47998ce964631dafe5dd71922206c597bfbc045a |

The transaction applies verified startup/local statement8s,lock1s,idle15s,
locks only the migration ledger in SHARE ROW EXCLUSIVE mode,compares the
approved before-state,executes the ONE frozen body,checks object deltas,inserts
the real migration record,checks the pending ledger,then commits. A separate
READ ONLY transaction verifies the committed state. No business RPC is called.

Connection timeout10s;driver query limit10s;whole phase60s from invocation,
remaining time caps each request. The60s budget covers connection and SQL after
immutable local input preparation. Phase deadline closes the connection.
Close has a5s deadline with socket destruction and explicit failure;rollback uses
the driver's bounded query path. This is not a guarantee that terminating a
client instantly terminates a server. A scaled25ms stalled-close fixture proved
forced socket destruction and cleanup-failure reporting,not a false cleanup PASS.
No broad CLI RESET ALL or ledger-initialization DDL remains in this route.
Installed pg startup option support was source-checked;the SAME actual local
driver and phase function verified startup/local8s/1s/15s and enforced real
statement and lock timeouts. A loopback black-hole connection proved the same
connection-timeout option with a scaled150ms test. No network timeout test used
a Production host. This proves the local route,not current Production outcomes.

- SQL and version registration now commit together within EACH phase.
- Four phases are NOT one atomic release;verified earlier phases may remain.
- Before-COMMIT SQL/ledger failure or disconnect:stop,rollback/close,inspect.
  Real local ledger42501 rolled back policy changes AND history.
- Lost COMMIT acknowledgement:UNKNOWN_COMMIT;no retry or assumed rollback.
  Read-only reconciliation distinguishes committed pair from rolled-back pair.
  The local test really committed,discarded the acknowledgement,then independently
  observed both correct objects and history. It did not rewrite that result PASS.
- Reentry for an already recorded phase is rejected;stale before-state rejects.
  Confirmed unapplied/rolled-back phase still needs a new independent execution
  decision;there is no automatic replay.
- Object/history inconsistency or committed-postcheck/cleanup failure:hold all
  subsequent migration/code release and separately review exact recovery.
- Extra DDL by other administrators is not blocked globally. Owner schema-change
  freeze remains required;the quota must exist before and retain OID/body/ACL
  afterward. Missing quota or drift rejects. No CREATE OR REPLACE is introduced.

## 5. Old App And Release Order

### 5.1 Existing Deployment-To-Source Evidence

The missing source association was recovered from existing release receipts,
not inferred from a version number or a nonexistent Deployment Git-SHA field:

- `C:/Temp/ogh-a-deploy-readiness-20261010/final-recovery151-authorization/A_DEPLOY_FINAL_SMOKE_CLOSURE_RESUMED_SAFE.json`:
  SHA256 `30562abd0af842b2b0184248e06aff2bb75c196c05269d687dbcb73aa48ce70d`,
  matching the authoritative baseline's existing evidence[A].
- Its previousAcceptanceSha256 links the existing
  `A_DEPLOY_READ_ONLY_ACCEPTANCE_FINAL_SAFE.json` in the same directory:
  SHA256 `ac6932e5c99601923012672718880df077801ad951a21ae42c9196b37647c7c7`.
  Both files were rehashed without modification during this review.
- That acceptance records the exact Dashboard Build/commit association and the
  same Build's version log:Build `d98da799-d41d-41dc-acaf-8c6675fd799a`,
  Git `88680a6eaab8de4123199f16b325ec0a430b0b86`,Worker version
  `b2b62ec9-bb8d-4159-ac99-08fca5740134`. The source commit exists in local Git.
- The historical final smoke receipt verifies Deployment
  `e8481d68-d2d5-473b-8b0c-b82b8fa33fc3` at100% that version. The existing
  Production read-only audit last reconfirmed the same Deployment/version152
  at2026-10-16T06:02:06Z. No current application request was made.

Distinct conclusions:WORKER_VERSION_IDENTITY=VERIFIED_AT_RECORDED_AUDIT;
GIT_SHA_IDENTITY=VERIFIED_BY_FROZEN_BUILD_RECEIPT_CHAIN;
BUILD_ARTIFACT_SOURCE_BYTE_EQUIVALENCE=UNKNOWN. This is documentary build/source
provenance,not a reproducible-build attestation or freshly downloaded bundle.
Earlier offline build asset-name mismatch is not erased or called byte equality.
The old source is now identifiable for offline review;the historical statement
that version metadata alone could not establish a SHA remains true.

Default Wrangler OAuth was checked locally and is expired. It was not refreshed,
used or replaced. No metadata GET was necessary to rediscover the retained
chain;0/2 were used. There is no claim of continuous live-state observation.
Any future execution still requires an independently authorized fresh exact
Deployment/version precheck;drift rejects this compatibility assessment.

### 5.2 Source-Derived Four-Phase Compatibility

The receipt-linked released source above was read directly with git show:
comments.ts proves public post/circle ancestry before reaction enrichment,
uses SELECT(comment_id,user_id),and checks public ancestry before like/unlike
SELECT(id),INSERT and DELETE. These columns/methods remain allowed. The summary
route uses authenticated-only,RLS-scoped counts with published comment/post filters.
Realtime subscription is not replaced. Public-only RLS remains the intended
canonical contract;accidentally counted non-public reactions are not a promised
new private-reaction feature.

Only the needed source files were inspected at that SHA:
`src/pages/api/forum/comments.ts`,
`src/pages/api/forum/circles/[slug]/comments.ts`,
`src/pages/api/users/me/summary.ts`,and
`src/lib/server/consume-forum-rate-limit.server.ts`.
The old comment reader does not call deleted_comment_placeholders. The quota
caller uses consume_forum_rate_limit with p_user_id,p_ip_hash,p_purpose,p_bytes.

One focused local fixture reused the existing setup/cleanup and exact phase
module,without rerunning its46-case suite. Cached Supabase Postgres17,owned
container/network,loopback port and synthetic identities only;no Production
connection,Auth login,CAPTCHA,Worker runtime or user data. All four phases were
applied using executeReleasePhase. At each phase,old-source comment projections,
reaction projections and authenticated summary joins were issued as actual
anon/authenticated A/B/ADMIN database roles,as applicable:

| Phase | Existing old-source database contract |
| --- | --- |
| 0 alignment | Comment columns/public reads remain available;Reaction SELECT still rejects42501 because captured preexisting GRANTs are absent. This known old defect is NOT a new migration regression and is not falsely reported repaired at phase0. |
| 1 GRANT | Anonymous comment_id/user_id read and authenticated id/comment_id/user_id/reaction_type read regain the intended public scope;auth summary returns the fixture's2 public likes. Hidden reactions remain excluded. |
| 2 placeholder | Same old queries continue;additive RPC is not referenced by old source. The old deleted-parent presentation defect is not claimed fixed until the separately approved new app deploy. |
| 3 quota adoption | Same queries continue;quota OID/body/security/ACL and old parameter contract remain unchanged. No quota RPC was invoked. |

At every phase,other business policies,self-write policies and quota metadata
remained identical. Existing write columns/policies are not removed;the prior
46-case real local ownership/denial evidence is reused,not replayed.

Result:16/16 focused checks PASS (4 isolation,3 old-source assertions,1 known
baseline-denial assertion,8 phase checks across role-specific subassertions).
These are source-derived PostgreSQL compatibility checks,not a full old Worker
execution or Production acceptance. An initial fixture mistakenly attempted the
authenticated-only summary as anon and got42501;it was corrected to match the
old route's401-before-query contract. Neither application nor migration changed.
Both owned fixtures cleaned their containers,anonymous volumes,networks,clients
and random in-memory credentials;an independent final owner-label listing was
empty. No temporary test file or credential file was added.

OLD_WORKER_COMPATIBILITY=PASS_FOR_RECEIPT_LINKED_SOURCE_DATABASE_CONTRACT_OFFLINE.
This does not establish artifact byte equality,live Production behavior,Auth/RLS
E2E or current Production parity. Fresh target drift remains a stop condition.

Conditional order after owner approval:alignment -> verify -> Reaction grants
-> verify -> placeholder -> verify -> non-overwrite quota registration -> verify
-> separately approved code push/deploy. Hold code if any dependency fails.
Never use pre-Hardening Version151 as default recovery. Catalog stays frozen.
New branch changes are not implicitly merged to main by this Packet.

## 6. Backup/Recovery Evidence Still Required

The previous inventory request returned401. It proves neither no backups nor
restoration permission. There was NO request to bypass401 in this task.

Existing local recovery materials were also checked without opening/decrypting
any archive or contacting a provider:
`C:/Temp/ogh-manual-backup-preparation-20261010-v5/RECOVERY_REVIEW_NOT_AUTHORIZED.md`
records an older encrypted database archive completed2026-10-09T12:58:22.8839943Z
(exact MVCC snapshot time UNKNOWN),whose full restore failed on missing managed
roles. Successful synthetic role/restore fixtures are NOT actual archive restore
proof. The roles supplement/fallback package is NOT_AUTHORIZED. This is not
current usable platform-backup,PITR or restore-entitlement evidence. No current
Dashboard backup evidence was found in the reviewed release/recovery materials.
BACKUP_AVAILABLE=UNKNOWN,not NO;RESTORE_PERMISSION=UNKNOWN;PITR_AVAILABLE=UNKNOWN.

Owner or an already authorized Dashboard administrator only needs to provide
existing metadata,without credentials or user data:
1. Exact project ref and whether an AVAILABLE/SUCCESS backup currently exists.
2. Latest usable backup/restore point UTC and applicable retention/coverage.
3. PITR enabled/disabled and available time range,if any;no purchase is required.
4. Current plan/role restore entitlement and whether recovery would add charges.
5. Real limitations:database versus Storage/object coverage,downtime/loss window,
   whole-project impact and whether a restoration has actually been validated.

A visible Restore button is not proof of tested recovery. If any item is
unverified,keep it UNKNOWN. Do not create backup,dump user data,restore,upgrade
or request a high-privilege key. If no acceptable backup exists,the owner must
separately review a zero-cost forward-recovery alternative;no waiver is implied.

Recovery distinctions and free-only options:
- Object-level handling only:stop before commit and reconcile;retain successful
  earlier phases;lost commit acknowledgement remains UNKNOWN_COMMIT. A separate
  approved forward migration may restore exact known safe object/ACL state.
  Never restore the broad Reaction predicate after GRANT,delete genuine history,
  or automatically drop the additive RPC. Such remediation is NOT a full backup.
- If an existing plan-entitled platform restore point is available,owner evidence
  must establish its actual availability,role permission,coverage and cost before
  it can serve as recovery. No paid PITR activation is proposed or required.
- If no suitable existing backup is available,an independently approved encrypted
  logical export plus managed-role/extension and isolated restore validation is
  a possible no-new-resource path ONLY if existing storage/capacity/network and
  restore permissions suffice atUSD0. It is not currently proven free,complete,
  executable or authorized;the older incomplete archive cannot stand in for it.

RECOVERY_STRATEGY=BLOCKED for the release until suitable recovery evidence and
owner risk acceptance exist. No Production backup,export,restore or API retry
was performed. The sole remaining technical evidence gate is recovery;separate
source integration,final bindings and execution approval are still required.

## 6A. Separate Main Integration Review

The implementation under review is exact commitca922f84c4d0eb4e6fbf64db3a08ecddf0979517,
not main. Review diff from main includes one57th migration,the2 scripts above,
the existing Packet,historical safeJSON and progress documentation. Original56
migration Git blobs and local source bytes all match main;all4 source/body hashes
and both script hashes match this Packet. No untracked file was present.
There is no application,package,Auth,RLS-helper,threshold or deployment config
change in that diff. Main remainsfedf5627a7cd2a28a6f5c0732c333b4e2fad56bb.

NEW_MIGRATION_INTEGRATION=READY_FOR_SEPARATE_MAIN_INTEGRATION_APPROVAL.
This only approves submitting the reviewed scope to the owner,not merging it.
No migration semantics were modified and no review change was backported to main.

## 7. Local Evidence And Current Decision

46/46 directly related local checks PASS. These cover actual expansion/denial,
canonical/known/drift policy cases,exact file/history scope,atomic stage success,
real ledger permission failure,disconnect,lock/statement/connection bounds,
already-applied rejection,lost-COMMIT observation and quota non-overwrite.
Cleanup PASS;owned container,anonymous data volume,network and clients removed.
Bootstrapping initially exposed a local image temporary-server readiness race
and default-GRANT differences;only the local fixture was corrected. No historical
Auth/RLS/E2E/R2/full56 replay was repeated or relabeled Production PASS.
Existing56 clean rebuild,7 fixes,16 local RLS and isolated R2 evidence are reused.

The older safe JSON is retained as a HISTORICAL draft snapshot with its old
Packet hash/counters. It is not a current authorization or binding for this
revision. Prior preflight evidence is preserved in Git commit04490c81 and
that historical snapshot;no old Production ledger/receipt/Claim was changed.

Current decision:
REACTION_EFFECTIVE_RLS=PASS_AFTER_ALIGNMENT_LOCAL;ORIGINAL_EXPANSION=PROVEN_LOCAL.
EXACT_STAGED_MIGRATION_SCOPE=PASS_OFFLINE.
MIGRATION_TIMEOUT_READINESS=PASS_OFFLINE;INTERRUPTION_RECOVERY_TEST=PASS_LOCAL.
RATE_LIMIT_RPC_NON_OVERWRITE=PASS_LOCAL_WITH_REUSED_PRODUCTION_FINGERPRINT.
WORKER_SOURCE_IDENTITY=VERIFIED_BY_EXISTING_RECEIPT_CHAIN,with audit freshness
and unknown artifact equality explicitly separated above.
OLD_WORKER_COMPATIBILITY=PASS_OFFLINE_FOR_IDENTIFIED_SOURCE_DATABASE_CONTRACT;
LIVE_OLD_WORKER_ACCEPTANCE=NOT_EXECUTED;BACKUP_RECOVERY_EVIDENCE=REQUIRED.
FOUR_STAGE_PACKET=READY_FOR_OWNER_REVIEW;execution gates remain BLOCKED.
PRODUCTION_MIGRATION_PLAN=BLOCKED,not READY or execution approval.
Preserve GROUP1 remaining4/UI02 partial/UI03 BLOCKED/Production parity UNKNOWN.

NEXT_SINGLE_ACTION:owner provide existing backup/restore Dashboard metadata
for the5 points in section6 (no credentials),then review separate main integration
and the minimal4-phase scope/atomic-adapter differences before any execution
authorization. No new Worker-source diagnostic or historical QA replay is needed.
No new QA framework or additional audit loop is proposed.

PRODUCTION_REQUESTS=0;PRODUCTION_WRITES=0;DEPLOYMENTS=0;PUSH=NOT_EXECUTED;
MAX_ADDITIONAL_COST_USD=0;CATALOG_HOLD=ACTIVE;PUBLIC_BETA_GO=NOT_AUTHORIZED.
