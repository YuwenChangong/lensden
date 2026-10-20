# Storage Objects Catalog Preflight v1 - Review Packet

DECISION=CATALOG_PROBE_READY_FOR_INDEPENDENT_REVIEW, not execution readiness.
Stage A only. No Production connection, credential inspection/input, SQL execution,
role/policy change, media inventory, test, agent, deployment, Git commit or push.
SQL syntax and runtime are NOT validated. This packet claims no new live privileges.

## Binding and Authority

Owner instruction: attachment 63fc802a-0512-4d36-95a5-7abc378fdfe6,
SHA-256 `899229e8911fb079b7664f95ed693fffe73229f108c4e6952cbd0dcdb9511d61`.
It explicitly designates the following candidate for preparation only, closing
the prior missing-designation gate; historical recovery authority is not reused.

| Item | Exact binding / evidence boundary |
| --- | --- |
| Project | xcbnxzjlsvtgzixurcof; resource allowlist ALREADY_APPROVED |
| Transport | Existing shared Session Pooler, aws-1-ap-northeast-1.pooler.supabase.com:5432 |
| Database | postgres; database name alone is not project proof |
| Candidate login | postgres.xcbnxzjlsvtgzixurcof |
| Expected session/effective DB role | postgres / postgres, no SET ROLE |
| Designation | CATALOG_INSPECTION_OPERATOR=OWNER_DESIGNATED_CANDIDATE; not LIVE_VERIFIED |
| Authority now | Offline preparation only; no current credential availability, authentication, catalog rights or DDL authority proven |

Historical nonsecret sourceBinding agrees exactly:
`C:/Temp/OpenGlassHub-Recovery-Adapter-v2_3/ogh-recovery-v2-20261018-8bf950f25e364e86.approval-draft.json`,
SHA-256 `23469635e93086b3629e22b5306b20d757210d7fede9482b99ba23686cef9d64`.
Only its project/host/port/database/poolerUser/effectiveRole were inspected, not
passwords, connection strings or secret stores. No conflict with the preserved
approved target evidence was identified; this is not a current management-plane
or live TLS/identity verification. The new explicit owner designation, not the
historical draft, is the authorization evidence for preparation.

This admin candidate is distinct from the uncreated SELECT-only inventory role.
Postgres authority, read-only transaction mode, or ability to read system catalogs
does NOT make the underlying credential SELECT-only or demonstrate inventory access.
If this operator cannot read a required catalog in a future approved run, STOP;
do not grant permissions, switch roles, or select another identity automatically.

## Exact SQL and Preserved Inputs

`storage-objects-catalog-preflight.v1.NOT_AUTHORIZED.sql`

SHA-256 `5b06d185c924d14e6f6dc67bd5d912301909a5e1aecb432f6c671b1221e95103`.
The file has one explicit read-only REPEATABLE READ transaction, four SET LOCAL
statements, one metadata SELECT, and ROLLBACK. These seven statements must be
reviewed as one immutable plan; no application routines are evaluated. All FROM
sources are pg_catalog or bounded CTE/VALUES/ACL expansions. No SELECT *, Auth
records, Storage rows, object names/keys, bytes, role verifiers, routine bodies,
raw routine configuration values or migration history are selected.

Preserved original/r2 materials, unchanged:
- Original Packet `media-recovery-protection.md`: dba7fabbdb03472b8520358783759fa37e8e40c343c47a08a1d3ee752054db46.
- r2 SQL: 4d25dbb1983f4e091407463e39700f13b06f053a98194fad54f585c1ec8d7000.
- r2 delta: ba4e011ae468be4b2c75e703a18f7eb6c97088f089ac68bc2fc39ec74fc8850b.
- Original unbound two-table catalog draft: ba44b1e70ac189af0a828180b83baf74a67be0e2635702fc87819925bdf958b4.

The independent r2 report at
`C:/Users/1/Downloads/OpenGlass_Hub_Media_Inventory_Role_r2_Independent_Review_20261019.md`
(SHA-256 0e004a06fd126b5a00814e16e0cef2c70bca367bc006e3d63751f5ee229bbbab)
approved ONLY the offline delta. This new SQL has NOT had independent review.
No old query/helper authorization or consumed marker is reopened.

## Result Schema and Bounds

One row, one JSONB field `catalog_evidence_private`; ordinary stdout is forbidden.
Envelope keys: schema, collected_at, identity, candidate_role_exists,
policy_name_collision, target_count, unresolved_membership_endpoints,
field_truncation, section_cap_or_size_failure, sections,
candidate_live_effective_privileges, routine_transitive_semantics,
managed_service_support and authorization.

Identity includes actual session/current role, database, PG version, read-only and
isolation state, the four local settings, row_security, backend port and the SQL
identity gate. Backend port is diagnostic only; it does not authenticate the
frontend pooler/project. The client must separately pin endpoint and verify TLS.

Each section has cap, observed (at most cap+1), truncated, oversized_row,
acl_truncated and rows. Empty sections are explicit zero/[] rather than omitted.

| Section | Accepted rows | Fields / why needed |
| --- | --- | --- |
| database | 1 | DB OID/name/owner and PUBLIC CONNECT/CREATE/TEMP ACL, including null built-in defaults |
| schemas | 32 | Non-system schema OID/name/owner, PUBLIC USAGE/CREATE and ACL; only namespace metadata, no table rows |
| relations | 128 | Non-system table/view/foreign-table/sequence identities with PUBLIC table/column ACL exposure, plus the target; owner, schema reachability, table PUBLIC ACL |
| public_columns | 256 | Explicit PUBLIC column ACLs and effective column SELECT (including table grants); table-level rights are also in relations |
| required_columns | 3 | Exact id/bucket_id/metadata existence, type OID/modifier/display, operator SELECT/grant option, PUBLIC SELECT and explicit column ACL |
| defaults | 64 | Global or covered-schema default ACL owner/scope/kind/PUBLIC rights; no changes to defaults |
| policies | 64 | Only storage.objects SELECT/ALL policy names, role OIDs, command, permissiveness, operator-role applicability, planned fresh-role classification and bounded private predicates |
| policy_dependencies | 128 | Direct pg_depend source/ref class/object/subobject OIDs and dependency kind for those policies |
| routines | 128 | PUBLIC-executable non-system routines plus directly policy-referenced routines, signatures, owner/language/security/volatility flags and PUBLIC ACL; configuration presence/count and search_path-configured boolean only |
| routine_dependencies | 128 | Direct catalog dependencies of covered routines; not a transitive semantic call graph |
| roles | 64 | Relevant caller, owner, named app, membership-related and policy roles; login/inherit/superuser/bypass/creation/replication flags and operator MEMBER/USAGE/SET facts |
| memberships | 128 | Relevant incoming/outgoing edges with grantor and ADMIN/INHERIT/SET; unresolved endpoint coverage is explicit |
| target | 1 | storage.objects kind/owner, RLS/FORCE RLS, operator-only RLS/ownership/SET facts, schema grant option and actual table ACL |

Every list uses a cap+1 sentinel. Each returned ACL array has at most65 entries;
65 fails the64-entry acceptance cap. Policy role arrays cap64, predicate text2048
characters, routine identity arguments1024 characters; any clipping sets a failure.
Each JSON record caps8192 UTF-8 bytes: larger content is replaced with a flagged
placeholder, not treated as evidence. Across sections at most1138 records including
sentinels are constructed. SQL measures the complete JSON payload: above262144
UTF-8 bytes, all evidence is omitted and only a BLOCKED_RESULT_SIZE envelope is
returned. This bounds the result, not all PostgreSQL planner/internal memory or
scan work; statement timeout is still mandatory. No automatic larger retry.
Client must also cap the JSON field at262144 bytes and total wire/result handling
at512 KiB, reject unexpected rows/fields, and never log an invalid response.

## Interpretation: Facts Are Not Security Approval

1. Independently verified endpoint/project/TLS plus exact expected session and
   effective role, PG17, read-only REPEATABLE READ and local settings are mandatory.
   Any mismatch, cap, clipping, missing required column/table or membership endpoint
   makes the evidence incomplete. A role/policy collision stops the r2 proposal;
   do not reuse or replace the existing object. No SQL field grants execution.
2. PUBLIC exposure is obtained from ACLs using PUBLIC grantee0 and built-in
   acldefault for null ACLs. Analyze schema reachability, table and column rights,
   default grants and routine paths together. The planned fresh role gets no
   existing role memberships or owner powers; current postgres permissions are
   labeled operator-only and must not be attributed to that role. No uncreated
   role has live effective privileges. NOINHERIT does not remove PUBLIC rights.
3. Only storage.objects has Storage-specific ownership/RLS/policy analysis; no
   storage.buckets RLS/grant dependency is restored. Other relation identities
   appear solely where PUBLIC ACLs can leak unrelated access, not as data scans.
   All SELECT/ALL policies are returned regardless of current operator applicability.
   For the proposed new non-owner membership-free NOBYPASSRLS role, existing
   PUBLIC policies require explicit analysis; r2 conservatively rejects them.
   Unknown restrictive predicates or dependencies do not prove full post-media
   visibility. Two intended new predicates do not substitute for actual-role
   post-provision and post-activation catalog/authorization evidence.
4. Static dependencies are direct only. Missing pg_depend edges do not prove no
   dynamic SQL/native/transitive access. Routine bodies, native binaries, system
   routine semantics and raw configuration values are intentionally not obtained.
   If a privilege, search_path, policy or callable path needs those facts, mark
   UNKNOWN/BLOCKED and specify the exact missing evidence; do not broaden this
   query or retry. No field automatically approves all PUBLIC routines.
5. Owner/inherited-owner/grant-option and role-admin facts are necessary evidence,
   not proof that hosted Supabase supports the proposed DDL. Ability to SET an
   owner role is reported, not exercised or authorized. Managed restrictions and
   actual supported ownership/delegation may remain UNKNOWN. No escalation,
   owner change, BYPASSRLS, broad revoke, privileged wrapper or app-policy edit.
6. Bucket existence remains a separately accepted management observation/quiet-
   interval condition from r2. This query proves neither bucket existence nor
   real object counts/bytes; it must not be used as media inventory or backup.

## Future Execution Contract - Not an Entrypoint or Authorization

Exact operator/target above; one TCP connection, one authentication attempt, one
read-only transaction, one metadata SELECT, zero retry/reconnect. No pool, fallback,
DSN redirection, automatic credential discovery, startup SQL or extra queries.
Exact SQL/hash and seven-statement order must be bound to a separately reviewed
single-use execution plan; no general SQL dispatch. On error stop; only one same-
connection ROLLBACK/close is allowed when safe, never another SELECT or connection.
Fresh owner authorization must bind SQL/operator/target and current zero-cost
conditions, not just the resource list. Secrets only via the existing local hidden
input mechanism, never chat, shell arguments, files or logs. No secret input now.

Connection deadline <=10s; server statement8s, lock1s, idle-transaction15s;
monotonic client deadline <=30s INCLUDING rollback/close, reserving cleanup time.
TLS must load the existing trusted CA with peer and hostname verification, no
insecure fallback; record actual handshake verification in a future authorized
run. Session Pooler5432 can support this transaction/SET LOCAL pattern, but that
general compatibility is not a live handshake, auth or timeout test.

Existing static implementation evidence:
- `C:/Temp/ogh-role-settings-compatibility-v1_1-384580f6acdd/role-settings.mjs`,
  SHA-256 9e237e415d4b42919a2540526d7d1c6d52bd17bed906633cef985230e7fb3463,
  pins this endpoint and strict CA/hostname validation, a single socket/auth
  guard, transaction-local8s/1s/15s, fixed SQL ordering, deadlines and sanitized
  errors. It is fixed to OLD SQL hash/result fields, an old single-use marker,
  old checkout identity, and different BEGIN text. DO NOT run, modify or reuse it
  for this query. Its historical approval/marker are not this authorization.
- Its imported `prepareCatalogConnection` in the historical release checkout
  supports explicit CA+rejectUnauthorized+servername and10s connect, but generic
  defaults are statement30s/lock5s/query35s and it is a migration transport.
  Those defaults do not meet this contract; never invoke its migration runner.

EXECUTION_ENTRYPOINT=NOT_BOUND; PRIVATE_RESULT_SINK=NOT_BOUND;
CURRENT_CREDENTIALS=NOT_CHECKED; CURRENT_TLS_AND_COST=NOT_VERIFIED.
These are explicit Stage B blockers, not hidden PASS claims. This Stage A task
creates SQL and a review contract only, not a runnable adapter. Any future minimal
transport/result-handler binding must enforce the exact SQL, caps, new single-use
authorization, deadlines and private receipt contract and receive its own review
before a connection. No new execution instance is created here. Application timers
do not guarantee cancellation of uninterruptible OS I/O or server termination;
uncertain socket/process closure must remain BLOCKED and no retry follows.

## Sensitive Evidence and Stops

Potentially sensitive policy expressions and catalog identities never go to
stdout/stderr, ordinary logs, Git, chat or third-party services. Use an explicitly
approved local private sink outside the repository/frozen candidates, verify its
current-user/SYSTEM-only access before any future connection and retain according
to the authorized evidence policy. No such sink is created/claimed verified now.
Omit routine bodies and configuration values entirely, not merely redact after
logging. Shared receipts contain only reviewed classifications, bounded section
counts/flags, identity-match booleans, timing, SQLSTATE/error class, request counts
and integrity hashes; not raw names/predicates/configuration or server errors.
Failure to protect/persist evidence or confirm bounded cleanup stops acceptance.

STOP before connection on missing exact approval, hash/target/CA drift, no cost
proof, unavailable input/sink or missing bounded execution binding. STOP after
any TLS/auth/query/cap/shape/context error and keep actual first failure. Unknown
PUBLIC routine semantics, incomplete RLS or unsupported managed ownership blocks
role provisioning regardless of whether the catalog query itself succeeds.

## Independent Review Handoff

Review exact SQL/hash, owner designation + historical nonsecret binding, target,
result schema/caps, direct-dependency limitations, sensitive-output contract and
unbound execution prerequisites above. No independent SQL approval is claimed.
NEXT_SINGLE_ACTION=INDEPENDENT_REVIEW_OF_EXACT_CATALOG_SQL_AND_PACKET.
Only after review and remaining execution prerequisites pass may the owner give
separate exact-SQL/operator authorization. No automatic Stage B, DDL or inventory.

Public official references, not Production APIs:
[PG17 privilege and ACL functions](https://www.postgresql.org/docs/17/functions-info.html),
[membership options](https://www.postgresql.org/docs/17/catalog-pg-auth-members.html),
[policy catalog](https://www.postgresql.org/docs/17/catalog-pg-policy.html),
[default ACL catalog](https://www.postgresql.org/docs/17/catalog-pg-default-acl.html),
[routine metadata](https://www.postgresql.org/docs/17/catalog-pg-proc.html),
[Supabase Session Pooler and TLS](https://supabase.com/docs/guides/database/connecting-to-postgres).
