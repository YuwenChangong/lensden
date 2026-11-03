import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { open, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { moderatorOwnerContract } from './moderator-owner-contract.v1.mjs';

// Serialization/integrity checks only. Never imports an admission/DB client,
// reads credentials, records approval, creates a window or contacts Production.
const root = 'C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub';
const home = 'C:/Temp/ogh-admin-mfa-activation-20261024';
const toolRoot = `${root}/scripts/qa/admin-mfa-activation`;
const priorPath = `${home}/ADMIN_MFA_ACTIVATION.RESUME.v5.NOT_AUTHORIZED.json`;
const priorHash = '6dcfb04c68b83739a6f6098aec73444d88591fa116543b5420c0ad9a8c058c85';
const sha = value => createHash('sha256').update(value).digest('hex');
const pin = async file => ({ path: file, sha256: sha(await readFile(file)) });
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const priorBytes = await readFile(priorPath);
assert.equal(sha(priorBytes), priorHash);
const prior = JSON.parse(priorBytes);
const next = structuredClone(prior);
assert.equal(git('status', '--porcelain'), '', 'COMMIT_SCOPED_PREPARATION_BEFORE_BINDING');

async function verifyPin(item) { assert.equal(sha(await readFile(item.path ?? item.file)), item.sha256, 'REUSED_INPUT_HASH_DRIFT'); }
async function verifyArtifact(item) {
  await verifyPin(item.manifest);
  const manifest = JSON.parse(await readFile(item.manifest.path));
  assert.equal(manifest.source, item.source);
  assert.equal(manifest.sourceTree, git('rev-parse', `${item.source}^{tree}`));
  assert.equal(manifest.files.length, 363);
  assert.equal(sha(JSON.stringify(manifest.files)), item.artifactBinding);
  const expected = new Set(manifest.files.map(file => file.file.replaceAll('\\', '/')));
  async function walk(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert(!entry.isSymbolicLink(), 'ARTIFACT_SYMLINK_FORBIDDEN');
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
      else assert(expected.delete(name), 'UNMANIFESTED_ARTIFACT_FILE');
    }
  }
  await walk(item.directory);
  assert.equal(expected.size, 0, 'MANIFESTED_ARTIFACT_FILE_MISSING');
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(item.directory, file.file));
    assert.equal(bytes.length, file.bytes);
    assert.equal(sha(bytes), file.sha256, 'SEALED_ARTIFACT_FILE_DRIFT');
  }
  return { files: 363, sourceTree: manifest.sourceTree, allBytesMatch: true, rebuildRequired: false };
}
const artifactChecks = { enrollment: await verifyArtifact(prior.code.enrollment), enforcement: await verifyArtifact(prior.code.enforcement) };
// The latest increment is SQL + offline QA/contract only; deployment code is
// still exactly enrollment 534c693b, and enforcement differs by its known five files.
assert.equal(git('diff', '--name-only', '534c693b', 'HEAD', '--', 'src', 'public', 'package.json', 'package-lock.json', 'astro.config.mjs', 'wrangler.toml', 'scripts/build-workers.mjs', 'scripts/lib/workers-runtime-vars.mjs'), '', 'UNPACKAGED_APPLICATION_CHANGE');
for (const item of [prior.database.migration.sql, prior.database.migration.source, ...prior.database.existingReadOnlyCatalogHelpers, ...prior.database.hiddenInput.sourcePins, ...prior.database.observedNativeTransport.sourcePins, prior.database.sessionTimeoutAdapter, ...prior.deployment.localWrangler.pins]) await verifyPin(item);

const migrations = [];
for (const item of moderatorOwnerContract.databaseOrder) {
  const source = await pin(`${root}/supabase/migrations/${item.file}`);
  assert.equal(source.sha256, item.sha256);
  migrations.push({ version: item.file.slice(0, 14), name: item.file.slice(15, -4), source, sql: source, exactBytesRequired: true });
}
const boundary = await readFile(migrations[1].sql.path, 'utf8');
assert(!/^\s*(begin|commit|rollback)\s*;/im.test(boundary), 'NO_TOP_LEVEL_TRANSACTION_CONTROL_IN_BOUND_SQL');
assert.equal(moderatorOwnerContract.productionAuthority, false);
const sourcePins = [];
for (const name of ['legal-operator-setting-guard.mjs', 'public-setting-guard.v2.mjs', 'runtime-branch-setting-guard.mjs', 'moderator-owner-contract.v1.mjs', 'record-moderator-approval.v1.ps1', 'initial-moderator-admission.v1.mjs', 'prepare-moderator-authorization.LOCAL_ONLY.mjs']) sourcePins.push(await pin(`${toolRoot}/${name}`));
// New entry points are exact path-only copies, not new execution implementations.
for (const [oldName, newName] of [['record-resume-approval.v5.ps1', 'record-moderator-approval.v1.ps1'], ['initial-management-admission.v4.mjs', 'initial-moderator-admission.v1.mjs']]) {
  const normalize = value => value.replaceAll('\r\n', '\n').trimEnd();
  const old = normalize(await readFile(`${toolRoot}/${oldName}`, 'utf8'));
  const fresh = normalize(await readFile(`${toolRoot}/${newName}`, 'utf8'));
  assert.equal(fresh, old.replace('ADMIN_MFA_ACTIVATION.RESUME.v5.NOT_AUTHORIZED.json', 'MODERATOR_MFA_ACTIVATION.v1.NOT_AUTHORIZED.json'), 'ENTRYPOINT_CHANGE_EXCEEDS_FIXED_PACKET_PATH');
}

next.schemaVersion = 6;
next.createdUTC = new Date().toISOString();
next.status = 'PENDING_NEW_OWNER_APPROVAL_NO_AUTHORITY_NO_WINDOW';
next.preparationGrantsProductionAuthority = false;
next.activeAuthorizationCreated = false;
next.scope = 'ONE_EXISTING_OWNER_MODERATOR_TWO_FACTORS_TWO_DEPLOYMENTS_ONE_ATOMIC_TRANSACTION_TWO_NEW_MIGRATIONS';
next.replacesStoppedAuthorization = { path: priorPath, sha256: priorHash, oldAuthorityOrWindowOrQuotaReusable: false };
delete next.replacesExpiredAuthorization;
next.ownerIdentity = {
  expectedRole: 'moderator', uuid: 'NOT_YET_BOUND_ONLY_AFTER_FRESH_AUTHENTICATED_SERVER_READBACK',
  initialBinding: 'EXISTING_OWNER_SESSION_ONLY_REAL_AUTH_GETUSER_UUID_EQUALS_WORKER_ME_USER_ID_EQUALS_PROTECTED_PROFILE_ID_ROLE_MODERATOR; WORKER_ME_SERVER_CALLS_GETUSER_AND_PROTECTED_PROFILE_LOOKUP; NOT_DOM_ROLE_OR_DECODED_METADATA',
  privateUuidPersistence: 'EXCLUSIVE_PRIVATE_RECEIPT_AFTER_APPROVAL_BEFORE_FIRST_DEPLOYMENT; NEVER_CHANGE_FOR_ANY_SUBSEQUENT_STAGE',
  allowedReads: 'ONLY_OWN_AUTH_GETUSER_AND_WORKER_ME_NONSECRET_ID_ROLE_FIELDS; NORMAL_EXISTING_BROWSER_AUTH_CONTEXT_NO_CREDENTIAL_EXPORT',
  sessionSwitch: 'ONLY_THE_SAME_BOUND_OWNER_THREE_ORIGINAL_FRESH_SIGNIN_CYCLES_NO_OTHER_ACCOUNT',
  roleChanges: 0, accountCreation: 0, accountEnumeration: 0, adminAssumption: false,
  unknownOrMismatch: 'STOP_BEFORE_DEPLOYMENT_NO_ROLE_UPGRADE_NO_ALTERNATE_IDENTITY',
};
next.code.incrementalCandidate = 'cd4bc2f2ddea84207233b5c937143e889dbaa99b';
next.code.applicationDeltaSinceSealedEnrollment = 'NONE; NEW_BOUNDARY_IS_SEPARATELY_DISPATCHED_DATABASE_SQL_AND_OWNER_CONTRACT_IS_OFFLINE_TOOLING';
next.code.artifactConsistency = artifactChecks;
next.code.ownerIdentityContract = sourcePins.find(item => item.path.endsWith('/moderator-owner-contract.v1.mjs'));
next.historyReuse.tests.targetBoundary = { result: '23_OF_23_PASS_REUSED_NOT_RERUN', source: await pin(`${root}/scripts/test-user-safety-target-boundary.mjs`), commit: next.code.incrementalCandidate, scope: 'REAL_LOCAL_PG17_REPOSITORY_SCHEMA_AUTH_FACADE_PLUS_OFFLINE_OWNER_AND_HANDLER_CASES_NOT_PRODUCTION_PARITY' };
next.incrementalReview = {
  decision: 'APPROVED_LOCAL_INCREMENTAL_SOURCE_REVIEW_NOT_EXTERNAL_INDEPENDENT_REVIEW',
  sourceCommit: next.code.incrementalCandidate,
  dependencies: ['existing user-safety API/report caller-authenticated writes', 'existing grants/RLS/helper bodies and RPC source references', 'original staff-AAL2 SQL', 'existing MFA bootstrap/assurance and admin-only guards', 'existing 23/23 coverage and frozen build manifests'],
  roleHierarchy: 'MATCHES_API_MODERATOR_TO_USER_ADMIN_TO_USER_OR_MODERATOR_NEVER_SELF_OR_ADMIN_TARGET',
  writes: 'STATE_INSERT_UPDATE_UPSERT_AND_AUDIT_INSERT_ENFORCED_BY_TRIGGER_ON_TRUSTED_ROLE_AAL2_IDENTITY; UNUSED_DELETE_TRUNCATE_AND_AUDIT_REWRITE_REVOKED',
  bypasses: 'EXTRA_PERMISSIVE_RLS_AND_DEFINER_WRITERS_STILL_TRIGGER_GUARD; EFFECTIVE_COLUMN_INHERITED_GRANTS_AND_DANGEROUS_MEMBERSHIP_CHECKED; NO_SERVICE_ROLE_BYPASS',
  limitations: ['Production exploitability not newly checked.', 'Superuser/DDL owner is not contained against deliberately disabling guards.', 'Account-hard-delete cascades through safety rows fail closed; no application hard-delete endpoint found; do not introduce a maintenance bypass.', 'No production real-user write canary is authorized.'],
  findings: [], newTests: 0, historicalSuitesRerun: false, builds: 0,
};
next.localAdmissionTools = {
  repository: root, commit: git('rev-parse', 'HEAD'), sourcePins,
  approvalRecorder: { path: `${toolRoot}/record-moderator-approval.v1.ps1`, expectedBindingArgument: 'EXACT_NEW_OWNER_APPROVED_PACKET_SHA256', humanConsentRequired: true, hashAloneIsConsent: false, neverRunDuringPreparation: true },
  initialManagementAdmission: { path: `${toolRoot}/initial-moderator-admission.v1.mjs`, expectedBindingArgument: 'EXACT_NEW_OWNER_APPROVED_PACKET_SHA256', maximumReads: 3, partOfExistingManagement16ReadBudget: true },
};
next.admission = prior.admission.map(text => text.replaceAll('owner/admin', 'owner/moderator').replaceAll('protected admin', 'protected moderator'));
next.admission.push('Before first deploy bind the exact existing moderator by independent authenticated Auth getUser and Worker me/protected-profile equality; UI moderator text alone is insufficient. Persist UUID privately, require identical role/UUID after every normal sign-in, step-up, refresh and before DB admission. No account switch, discovery, creation or elevation.');
next.order = [
  'NEW_MATCHING_OWNER_APPROVAL_AND_READY_LOGIN_RECORD_180_MINUTE_WINDOW_ONCE',
  'FRESH_BOUND_MANAGEMENT_AND_EXISTING_MODERATOR_SERVER_IDENTITY_ADMISSION_NO_DOM_ONLY_PROOF',
  'DEPLOY_UNCHANGED_534c693b_ENROLLMENT_ONCE_READBACK_FULL_UUID_DEPLOYMENT_SINGLE100_CONFIG',
  'OWNER_PRIMARY_AND_INDEPENDENT_BACKUP_ENROLL_VERIFY_TWO_FACTORS_THEN_TWO_FRESH_SIGNINS_AND_REFRESH_SERVER_AAL2_SAME_MODERATOR',
  'ONLY_AFTER_ALL_PHASE_ONE_GATES_DEPLOY_UNCHANGED_8b0882f0_ENFORCEMENT_ONCE_READBACK_FULL_UUID_SINGLE100_CONFIG',
  'THIRD_FRESH_AAL1_SIGNIN_MFA_READBACK_DENIED_SETUP_AVAILABLE_FIFTH_CHALLENGE_VERIFY_REFRESHED_AAL2_ALLOWED_ADMIN_ONLY_CAPABILITY_GET_EXPECTED403_NOT_SUCCESS',
  'ONE_HIDDEN_PASSWORD_ONE_STRICT_TLS_CONNECTION_EXACT_DRIFT_AND_NEW_TWO_LEDGER_ABSENCE_PRECHECK',
  'ONE_ATOMIC_TRANSACTION_ORIGINAL_STAFF_AAL2_SQL_THEN_NEW_SAFETY_BOUNDARY_SQL_TWO_EXACT_LEDGER_INSERTS_VERIFY_THEN_COMMIT_ONCE',
  'SAME_CONNECTION_POSTCOMMIT_EXACT_METADATA_READBACK_LOCAL_CLEANUP_FINAL_SELF_AAL2_AND_FIXED_MODERATOR_NO_REAL_USER_WRITES',
];
next.enrollment.beforeEnforcement.push('Same UUID and protected role moderator, no role changes; do not expect moderator to succeed at any admin-only route.');
next.database.migrations = migrations;
delete next.database.migration;
next.database.maximumMigrationBodyDispatches = 1;
next.database.migrationBodyDispatch = { kind: 'SINGLE_FIXED_BATCH_TWO_EXACT_UTF8_BODIES_SEPARATED_BY_ONE_LF', sha256: sha(Buffer.concat([await readFile(migrations[0].sql.path), Buffer.from('\n'), await readFile(migrations[1].sql.path)])), memberCount: 2, transactionCount: 1, versionsAlreadyPresent: 'STOP_NEVER_REPLAY_OR_UPSERT' };
next.database.allowedPersistentChanges = [
  'Original staff capability helper bodies: moderator/admin AND AAL2; existing catalog admin AND AAL2 only if already present, never create held Catalog.',
  'New postgres-owned fixed-search-path non-public-executable target trigger function and two exact safety-table triggers; enforce role/AAL/target/identity/attribution and append-only audit.',
  'Only exact REVOKEs in new SQL on safety tables; no new grants, roles, policy rewrites, application-row mutations or security-setting changes.',
  'Exactly TWO new supabase_migrations.schema_migrations entries version/name/statements=[each respective exact source bytes], no upsert, in the SAME transaction as BOTH SQL bodies.',
];
next.database.transaction = [
  'Use original bound observed native connection/timeout adapter. BEGIN; SET LOCAL search_path=pg_catalog,public; LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE. One connection only; read exact post-release catalog baseline, original six ledger hashes, actual operator/target, claims/P2 and absent temporary protection. Both new versions, boundary function and two new triggers must be absent. No user-content or media-object row reads.',
  'Verify fixed owner UUID still has protected role moderator with a parameterized exact own-profile role-only lookup. Reject drift in old helper bodies/OIDs/owners/ACLs, RLS, policies, grants, role membership, effective PUBLIC/anon/authenticated privileged RPC exposure or unknown safety writer. SQL preconditions also enforce baseline and effective grant checks.',
  'Dispatch exactly one batch = original staff-AAL2 bytes + LF + new target-boundary bytes, in that order. Neither file contains top-level transaction control; do not alter, split across commits, retry, replace or relax.',
  'For ONLY the already server-bound moderator UUID, locally simulate authenticated AAL1/AAL2/unknown claims for capability-predicate checks (not a signed-session test or user write). is_moderator_or_admin must be false/true/false; is_catalog_admin if present must remain FALSE for moderator at ALL AALs. Restore original operator identity afterward. Never require catalog/admin capability success from moderator.',
  'Require original policies/roles/helper OIDs/owners/ACLs/schema unchanged except two helper bodies where applicable, exact safety REVOKEs, one new guard function and two new enabled BEFORE ROW INSERT/UPDATE/DELETE triggers. Guard owner postgres, SECURITY DEFINER, search_path=pg_catalog, exact bound definition, no effective PUBLIC/anon/authenticated/service_role EXECUTE. Safety state INSERT/UPDATE and event INSERT remain available through original RLS; forbidden destructive/rewrite/effective inherited grants absent. No synthetic or real user DML canary.',
  'Use one parameterized INSERT with TWO VALUES rows into schema_migrations(version,name,statements), each version/name/[its exact UTF8 SQL] fixed by migrations above. No conflict clause, no replay of prior six versions. Same transaction readback checks both exact names/statement bodies and every authorized delta before COMMIT.',
  'COMMIT once only after all assertions/time gates pass. Same connection fresh readSixPhaseState plus fixed supplemental safety metadata/own-role/ledger readback verifies persisted exact deltas and preserved original state; no new connection to resolve ambiguity. Unknown commit or cleanup stays UNKNOWN, never trigger a retry or permission downgrade.',
];
next.database.supplementalReadback = {
  scope: 'OWN_BOUND_PROFILE_ROLE_AND_AFFECTED_OBJECT_METADATA_ONLY_NO_USER_CONTENT',
  allowed: ['both new exact ledger rows', 'public.user_safety_states and public.user_safety_events RLS flags, policies, table/column/effective ACLs', 'new trigger function definition, owner, ACL, effective execution and settings', 'exact two enabled trigger definitions', 'is_moderator_or_admin and existing is_catalog_admin bodies/OIDs/owners/ACLs', 'authenticated/anon privileged membership and effective service-only RPC grants'],
  implementation: 'EXISTING_NATIVE_QUERY_INTERFACE_FIXED_PARAMETERIZED_CATALOG_PROJECTIONS_SHARED_QUERY_COUNT_AND_60_SECOND_DEADLINE_NOT_A_NEW_EXECUTOR',
  normalNativeQueriesMax: 20, extraConnections: 0, applicationRowsOtherThanOwnProfile: false,
};
next.database.normalNativeQueryPlan = {
  total: 17, maximum: 20,
  dispatches: ['timeout_read', 'fixed_session_timeout_batch', 'timeout_readback', 'begin_search_path_ledger_lock_batch', 'baseline_snapshot', 'baseline_r2_snapshot', 'own_moderator_and_safety_baseline_metadata', 'one_two_sql_body_batch', 'fixed_owner_aal_predicate_batch_restore_operator', 'one_two_row_ledger_insert', 'precommit_snapshot', 'precommit_r2_snapshot', 'precommit_exact_safety_delta_and_ledger', 'commit_once', 'postcommit_snapshot', 'postcommit_r2_snapshot', 'postcommit_exact_safety_delta_and_ledger'],
  failureRollbackExtraMax: 1, retryAllowance: 0,
};
next.database.results = 'PRIVATE_OWN_MODERATOR_UUID_ROLE_AND_CATALOG_LEDGER_ACL_DEFINITIONS_ONLY_NO_USER_CONTENT';
next.budgets.migrationsMax = 2;
next.budgets.migrationTransactionsMax = 1;
next.budgets.explicitWorkerMfaAndMeReadsMax = 64;
next.budgets.adminOnlyReadProbe = { includedInWorker64: true, route: '/api/admin/trusted-runtime/capability', method: 'GET', maximum: 1, expected: 403, serviceRoleProbeExecutionAllowed: false };
// Confirm the real route name before generating a signable packet.
assert((await readFile(`${root}/src/pages/api/admin/trusted-runtime/capability.ts`, 'utf8')).includes('handleTrustedAdminRuntimeCapability'), 'FIXED_ADMIN_ONLY_ROUTE_SOURCE_REQUIRED');
next.proofBoundaries = [
  'Independent real server identity and refreshed signed AAL2 are required for the same fixed moderator. UI text, hash, simulated DB claims or metadata do not replace them.',
  'Moderator admin-only capability GET must return 403 before service-role client use, not PASS because admin capability succeeds. Existing admin-only endpoints and catalog remain admin-only.',
  'Reuse original MFA and 23 targeted local PG/contract tests; new Production catalog/predicate checks are not real-user mutation/RLS canaries or complete ordinary-user Public Beta acceptance.',
  ...prior.proofBoundaries.slice(2),
];
next.runtimeBranchGateAmendment.currentBranchEvidence = 'PRIOR_BOUND_INITIAL_MANAGEMENT_RECEIPT_SAYS_ABSENT; HISTORICAL_ONLY_FRESH_EXISTING_SETTINGS_GET_STILL_REQUIRED';
next.runtimeBranchGateAmendment.currentEffectivePolicy = 'HISTORICAL_REVIEW_ALL_PASS_NOT_A_FRESH_PRODUCTION_CLAIM';
next.revisionScope = [
  'Replace admin-only owner contract with independently verified existing moderator UUID/role; admin-only probe denial is required; no role elevation or extra identity.',
  'Add exact new safety permission SQL after unchanged original AAL2 SQL, ONE atomic transaction/TWO exact new ledger entries, no old authority reuse.',
  'Keep both sealed artifacts unchanged after all-file/source coverage verification; no rebuild because no packaged application source changed.',
  'Reuse accepted finite public/default/branch configuration rules and historical tests; only necessary fresh live gates after new approval.',
];
next.approvalFieldsRequired.ADMIN_MFA_ACTIVATION_GO = 'APPROVED_FOR_THIS_EXACT_MODERATOR_TWO_STAGE_PACKET_ONLY';
delete next.approvalFieldsRequired.STAFF_DATABASE_AAL2_GO;
delete next.approvalFieldsRequired.AAL2_READBACK_AND_CATALOG_CAPABILITY_PROOF_NOT_REAL_USER_WRITE_CANARY_ACCEPTED;
next.approvalFieldsRequired.MODERATOR_OWNER_IDENTITY_AMENDMENT_GO = 'APPROVED_FOR_EXISTING_SERVER_VERIFIED_FIXED_MODERATOR_UUID_ONLY_NO_ROLE_CHANGE';
next.approvalFieldsRequired.ADMIN_ONLY_CAPABILITY_403_AND_CATALOG_DENIAL_REQUIRED = true;
next.approvalFieldsRequired.STAFF_AAL2_AND_SAFETY_BOUNDARY_ATOMIC_GO = 'APPROVED_FOR_ONE_CONNECTION_ONE_TRANSACTION_TWO_EXACT_SQL_BODIES_AND_TWO_NEW_LEDGER_ROWS_ONLY';
next.approvalFieldsRequired.AAL2_AND_CATALOG_METADATA_NOT_REAL_USER_WRITE_CANARY_ACCEPTED = true;
next.approvalFieldsRequired.SAFETY_APPEND_ONLY_AND_HARD_DELETE_CASCADE_DENIAL_ACCEPTED = true;
next.localPreparation = { productionRequests: 0, databaseConnections: 0, factorOperations: 0, deployments: 0, migrations: 0, remotePush: 0, fullHistoricalSuitesRerun: false, targetBoundary23Tests: 'REUSED_NOT_RERUN', buildsThisPreparation: 0, allSealedArtifactFilesVerified: 726, credentialFilesInspected: false, approvalOrWindowStarted: false };

assert.deepEqual(next.target, prior.target);
assert.deepEqual(next.enrollment.primaryEnrollMax, prior.enrollment.primaryEnrollMax);
assert.deepEqual(next.deployment, prior.deployment);
assert.deepEqual(next.window, prior.window);
assert.deepEqual(next.credentialAdmission, prior.credentialAdmission);
assert.equal(next.budgets.maxAdditionalCostUSD, 0);
assert.equal(next.budgets.databaseAttemptsMax, 1);
assert.equal(next.database.maximumConnections, 1);
assert.equal(next.budgets.factorWrites.challenge, 5);

async function publish(file, bytes) {
  const handle = await open(file, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  assert.equal(sha(await readFile(file)), sha(bytes));
}
const packetPath = `${home}/MODERATOR_MFA_ACTIVATION.v1.NOT_AUTHORIZED.json`;
const bytes = Buffer.from(JSON.stringify(next, null, 2) + '\n');
const binding = sha(bytes);
const approvalPath = `${home}/MODERATOR_MFA_ACTIVATION.v1.OWNER_APPROVAL.txt`;
const text = [
  'PENDING OWNER REVIEW. THIS FILE GRANTS NO PRODUCTION AUTHORITY AND STARTS NO WINDOW.',
  `Exact packet: ${packetPath}`, `SHA-256: ${binding}`, '',
  'After existing Wrangler interactive login, immediate readiness and personal verification of every current true condition, submit the COMPLETE approval below. Do not infer consent from a hash. No previous authorization or quota is reused.', '',
  `ADMIN_MFA_ACTIVATION_BINDING_SHA256=${binding}`,
  ...Object.entries(next.approvalFieldsRequired).map(([key, value]) => `${key}=${value}`), '',
  'I formally approve this exact complete moderator MFA activation packet and its identity/atomic-SQL amendments, not a pending template. All true conditions currently hold. I control the existing moderator session and will participate in normal browser password/CAPTCHA and independently held primary/backup TOTP steps. No account discovery/creation or role change is authorized.', '',
  'Only actual matching owner approval recorded once after login/readiness starts 180 minutes; no short initial cutoff, renewal or old GO reuse. Stage completion reserves45/30/15 minutes; Wrangler credential validity45 minutes before enrollment deployment and20 before enforcement, and enough for each bounded management read. No automatic login/refresh or fallback credentials.',
  'Fixed account dcb374166b39234a499985145c075f50; Worker openglasshub at https://openglasshub.ogh.workers.dev; Supabase xcbnxzjlsvtgzixurcof. Before any deploy, independently compare real Auth getUser UUID, Worker me.user_id and protected profile ID/role; bind that existing moderator UUID privately for every subsequent step. Browser role text alone is insufficient. Stop on unknown/mismatch; never elevate moderator or select a hypothetical admin.',
  'Fresh management gates remain required: correct full active UUID/deployment/single100 traffic/resources/config. Reuse accepted finite public/default/branch proofs; final moderation policy must be review_all. No re-audit, blanket waiver, secret-value reads or configuration writes.',
  `Enrollment source ${next.code.enrollment.source}, manifest ${next.code.enrollment.manifest.sha256}, artifact ${next.code.enrollment.artifactBinding}: deploy ONCE, owner enrolls/verifies primary and independently held backup; both fresh sign-ins and refreshes must prove same UUID/moderator and real server AAL2. No factor removal/reset; both factors and independent project recovery access required.`,
  `Only after all enrollment gates: enforcement source ${next.code.enforcement.source}, manifest ${next.code.enforcement.manifest.sha256}, artifact ${next.code.enforcement.artifactBinding}: deploy ONCE. Third fresh AAL1 session must fail protected MFA status while setup stays reachable; fifth challenge/verify and refreshed signed AAL2 must pass. One admin-only GET /api/admin/trusted-runtime/capability must return403, NOT success. No service-role operation or real-user canary.`,
  ...migrations.map((item, index) => `SQL ${index + 1}: ${item.version}_${item.name}; SHA-256=${item.sql.sha256}; exact source=${item.sql.path}`),
  `Database batch SHA-256=${next.database.migrationBodyDispatch.sha256}; exact first SQL bytes + one LF + second SQL bytes. Only ONE strict-TLS connection using the existing memory-only hidden password input; preserve connection10s/statement8s/lock1s/idle15s/overall60s/cleanup5s and20 native queries.`,
  'After exact fresh baseline and own-role checks, execute both bound bodies in order in ONE transaction; insert both exact version/name/[SQL] ledger rows in that SAME transaction, without upsert. Verify authorized helper/ACL/guard/trigger deltas and unchanged unrelated roles/RLS/schema/claims/P2 before COMMIT; same connection committed readback. Moderator catalog capability must remain false at AAL1 and AAL2. Simulated predicate checks are NOT signed-session or real-user write proof.',
  'Budgets: management16, deployment2, DBconnection1, transaction1/two new migrations; browser navigations12/observe30s/close5s; Worker MFA/me/admin-only reads64; Auth96; enroll2/challenge5/verify5/remove0/reset0; password signins3/signouts3/explicit refresh4. Account creations, ordinary-user MFA, business/media writes, old six-migration replay, backup recapture, old RC rebuild and remote push0. Executor retries0; existing SDK internal retry distinction preserved.',
  'Any failed/unknown gate, identity/role change, cost risk, write/commit ambiguity, timeout or uncertain cleanup stops. No blind retry, automatic factor cleanup, permission relaxation, app downgrade, DDL reversal or window extension. Before enforcement retain enrollment/factors with old-role exposure recorded; after enforcement preserve AAL1 setup/bootstrap and verified backup recovery. All-factor loss requires separate independently verified owner recovery, not password-only MFA bypass.',
  'Safety audit is append-only; account-hard-delete cascades through these rows fail closed and are NOT authorized here. No user/content/object mutation or destructive cleanup is authorized. Existing recovery point is historical, not current data or media bytes; all destructive jobs remain paused.',
  'CATALOG_HOLD=ACTIVE; PUBLIC_BETA_GO=NOT_AUTHORIZED. MFA metadata acceptance is not ordinary-user core acceptance or Public Beta GO.',
].join('\n') + '\n';
await publish(packetPath, bytes);
await publish(approvalPath, Buffer.from(text));
console.log(JSON.stringify({ packetPath, binding, approvalPath, sourceCommit: next.localAdmissionTools.commit, artifactFilesVerified: 726, builds: 0, testsRerun: 0, productionRequests: 0, windowStarted: false }));
