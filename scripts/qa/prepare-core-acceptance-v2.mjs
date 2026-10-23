import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mailboxAdmission} from './core-auth-admission-v2.mjs';

// Local preparation only. Emails remain in the caller's current-user-only directory.
const OLD_ROOT = 'C:/Temp/ogh-public-beta-core-acceptance-20261023';
const OLD_HASH = 'abfbf09e9de359f3bdc5d78cd87cbf273abd70f026eb0ea2e32f338b293cc0d7';
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const need = (value, code) => { if (!value) throw new Error(code); };
function saveExclusive(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  need(fs.readFileSync(file).equals(bytes), 'LOCAL_READBACK');
}

try {
  const directory = path.resolve(process.argv[2] ?? '');
  const expectedParent = path.resolve(process.env.LOCALAPPDATA, 'OpenGlassHub');
  need(path.dirname(directory) === expectedParent && /^mailbox-[a-f0-9-]{36}$/.test(path.basename(directory)), 'PRIVATE_DIRECTORY_IDENTITY');
  need(!fs.lstatSync(directory).isSymbolicLink(), 'PRIVATE_DIRECTORY_REPARSE');
  const configPath = path.join(directory, 'mailboxes.private.json');
  if (!fs.existsSync(configPath)) {
    console.log(JSON.stringify({status: 'AWAITING_LOCAL_EMAIL_INPUT', productionRequests: 0, emailsSent: 0}));
    process.exit(0);
  }
  const aclCommand = `$ErrorActionPreference='Stop';$env:PSModulePath=Join-Path $PSHOME 'Modules';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;foreach($p in @('${directory}','${configPath}','${path.join(directory, 'setup.safe.json')}')){$i=Get-Item -LiteralPath $p;if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'REPARSE'};$a=Get-Acl -LiteralPath $p;$r=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if(-not $a.AreAccessRulesProtected -or $a.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid -or $r.Count -ne 1 -or $r[0].IdentityReference.Value -cne $sid -or $r[0].AccessControlType -ne 'Allow' -or $r[0].FileSystemRights -ne 'FullControl'){throw 'ACL'}};[Console]::Out.Write('PRIVATE_INPUT_ACL_PASS')`;
  const acl = execFileSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', aclCommand], {windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 4096});
  need(acl === 'PRIVATE_INPUT_ACL_PASS', 'CURRENT_PRIVATE_ACL_REQUIRED');
  need(fs.statSync(configPath).size <= 8192 && fs.statSync(path.join(directory, 'setup.safe.json')).size <= 8192, 'PRIVATE_CONFIG_SIZE');
  const configBytes = fs.readFileSync(configPath), config = JSON.parse(configBytes);
  const setup = JSON.parse(fs.readFileSync(path.join(directory, 'setup.safe.json')));
  need(setup.status === 'LOCAL_EMAIL_SETUP_COMPLETE' && setup.currentUserOnlyAcl === 'PASS' && setup.configSha256 === hash(configBytes), 'PRIVATE_SETUP_BINDING');
  need(config.project === 'xcbnxzjlsvtgzixurcof' && config.source === 'OWNER_READ_HOST' && config.ownershipConfirmed === true && config.receivabilityConfirmedByOwner === true && config.deliveryVerified === false && config.productionAuthority === false, 'OWNER_LOCAL_MAILBOX_ATTESTATION');
  need(/^ogh-pbeta-core-20261023-[a-f0-9-]{36}$/.test(config.namespace), 'FRESH_NAMESPACE');
  need(Array.isArray(config.actors) && config.actors.length === 2 && config.actors[0].alias === 'A' && config.actors[1].alias === 'B', 'TWO_NEW_ALIASES');
  for (const actor of config.actors) need(actor.newOnly === true && mailboxAdmission({email: actor.email, ownershipConfirmed: true, exactAddressApproved: true}).status === 'ELIGIBLE_FOR_EXACT_PACKET_BINDING', 'MAILBOX_ADMISSION');
  need(config.actors[0].email.toLowerCase() !== config.actors[1].email.toLowerCase(), 'DISTINCT_ALIASES');
  const oldBytes = fs.readFileSync(path.join(OLD_ROOT, 'CORE_ACCEPTANCE.NOT_AUTHORIZED.json'));
  need(hash(oldBytes) === OLD_HASH, 'HISTORICAL_PACKET_INTEGRITY');
  const p = JSON.parse(oldBytes);
  for (const key of ['windowStartUTC', 'windowEndUTC', 'latestNewFixtureAdmissionUTC', 'ownerApprovalTemplate', 'localEvidence', 'offlineDiscovery']) delete p[key];
  const tag = config.namespace.slice(-36);
  p.task = 'PUBLIC_BETA_CORE_ACCEPTANCE_V2_OWNED_MAILBOX_AND_INDEPENDENT_FAILURE_CONTAINMENT';
  p.status = 'AWAITING_SINGLE_EXACT_OWNER_AUTHORIZATION';
  p.productionExecutionEnabled = false;
  p.preparedUTC = new Date().toISOString();
  p.namespace = config.namespace;
  p.authorizationTiming = {
    activation: 'ONCE_ONLY_ACTUAL_UTC_RECORDED_AFTER_MATCHING_OWNER_MESSAGE_NO_WINDOW_DURING_PREPARATION',
    executionMinutes: 120, latestNewFixtureAdmissionMinute: 75, latestNewBusinessWriteMinute: 90,
    cleanupDeadlineMinute: 120, automaticRenewal: false,
    stop: 'NO_NEW_REQUEST_AFTER_DEADLINE_NO_RETRY_NO_REPLAY_NO_AUTOMATIC_EXTENSION',
  };
  p.mailboxBinding = {path: configPath, sha256: hash(configBytes), acl: 'CURRENT_WINDOWS_USER_ONLY',
    source: 'LOCAL_READ_HOST_AND_OWNER_CONTROL_RECEIVABILITY_ATTESTATION',
    deliveryVerified: false, noTestMailSent: true, providerMethod: config.aliasMethod,
    privateIdentities: 'EXACT_EMAILS_IN_NEW_ACTORS_AND_HASH_BOUND_PRIVATE_CONFIG_NOT_PUBLIC_RECEIPTS'};
  p.newActors = config.actors.map(a => ({alias: a.alias, email: a.email, displayName: `Synthetic QA ${a.alias}`, requiredProfileRole: 'user', createMaximum: 1}));
  p.accountProvisioning.privateDirectory = path.join(expectedParent, 'core-acceptance-20261023-' + tag);
  need(!fs.existsSync(p.accountProvisioning.privateDirectory), 'NEW_EXECUTION_DIRECTORY_REQUIRED');
  p.accountProvisioning.dpapiNamespace = 'e-verify-group1-core-20261023-' + tag;
  p.accountProvisioning.adminCredentialAllowed = 'EXACT_NEW_ACTOR_CREATE_INITIAL_GET_AND_INDEPENDENT_CONTAINMENT_PRECHECK_BAN_READBACK_ONLY_NO_ENUMERATION_ROLE_GRANT_RESET_OR_BUSINESS_WRITES';
  p.accountProvisioning.actualEmailConfirmation = 'REQUIRE_VALID_EMAIL_CONFIRMED_AT_IN_SUCCESSFUL_CREATE_RESPONSE_AND_EXACT_IDENTITY_READ_DO_NOT_INFER_FROM_REQUEST_EMAIL_CONFIRM_TRUE';
  p.accountProvisioning.credentialConsistency = 'ONE_NEW_RANDOM_PASSWORD_PER_ACTOR_SAME_IN_MEMORY_VALUE_FOR_CREATE_AND_SINGLE_LOGIN_NO_URI_ENCODING_NO_EXISTING_PASSWORD_OR_API_KEY_AS_PASSWORD';
  p.accountProvisioning.identityBinding = 'SUCCESSFUL_CREATE_UUID_EXACT_EMAIL_PROJECT_NAMESPACE_AND_EXCLUSIVE_JOURNAL_BEFORE_NEXT_STAGE_NO_CLIENT_SERVER_TIMESTAMP_EQUALITY_GATE_NO_HISTORICAL_A_REUSE';
  p.accountProvisioning.order = 'A_CREATE_AND_JOURNAL_ACTUAL_CONFIRMATION_EXACT_GET_SINGLE_LOGIN_AUTH_UID_PROFILE_USER_REFRESH_IDENTITY_THEN_B_SAME_THEN_BUSINESS';
  p.accountProvisioning.mailboxOwnerAdminDistinction = 'OWNER_ADMIN_GMAIL_MAY_RECEIVE_ALIAS_MAIL_ONLY_NEW_A_B_AUTH_UUIDS_MUST_BE_DISTINCT_AND_ACTUAL_PROFILES_ROLE_USER_NO_ADMIN_ACCOUNT_REUSE_ROLE_INHERITANCE_OR_MODIFICATION';
  p.accountProvisioning.diagnostics = 'ALLOWLISTED_AUTH_ERROR_CODE_HTTP_STATUS_CLASSIFICATION_CORRELATION_AND_UTC_NO_RAW_MESSAGES_RESPONSE_BODIES_TOKENS_OR_EMAIL_IN_SAFE_RECEIPTS_UNKNOWN_REMAINS_UNKNOWN';
  p.fixtureCircle.name = 'QA ' + tag.slice(0, 18);
  p.fixtureCircle.expectedSlug = 'qa-' + tag.slice(0, 18);
  p.maximumRequestBudgets.supabaseAuthRequestsIncludingProvisioningAndCleanup = 20;
  p.maximumRequestBudgets.legacyPublicObjectHeadRequests = 0;
  p.maximumRequestBudgets.legacyPostgresConnections = 0;
  p.maximumRequestBudgets.legacyNormalNativeSqlDispatches = 0;
  p.maximumRequestBudgets.legacyFailureRollbackDispatches = 0;
  p.authEndpointScope = [
    {path: '/auth/v1/admin/users', method: 'POST', limit: 2, scope: 'ONE_NEW_A_THEN_ONE_NEW_B_ONLY_NO_MAIL_OR_EXISTING_ACCOUNT_ADOPTION'},
    {path: '/auth/v1/admin/users/BOUND_NEW_ACTOR_UUID', method: 'GET', limit: 6, scope: 'TWO_INITIAL_IDENTITY_READS_PLUS_TWO_RESERVED_CONTAINMENT_PRECHECKS_PLUS_TWO_INDEPENDENT_BAN_READBACKS'},
    {path: '/auth/v1/admin/users/BOUND_NEW_ACTOR_UUID', method: 'PUT', limit: 2, body: {ban_duration: '876000h'}, scope: 'ONE_BAN_PER_SUCCESSFULLY_CREATED_EXACT_IDENTITY_ONLY_NORMAL_OR_FAILURE_PATH_NEVER_BOTH'},
    {path: '/auth/v1/token?grant_type=password', method: 'POST', limit: 2, scope: 'ONE_LOGIN_PER_CREATED_ACTOR_NO_RETRY'},
    {path: '/auth/v1/token?grant_type=refresh_token', method: 'POST', limit: 2, scope: 'ONE_REFRESH_PER_VERIFIED_NEW_ACTOR'},
    {path: '/auth/v1/user', method: 'GET', limit: 4, scope: 'OWN_AUTH_UID_BEFORE_AND_AFTER_REFRESH_ONLY'},
    {path: '/auth/v1/logout?scope=global', method: 'POST', limit: 2, scope: 'ONLY_KNOWN_NEW_SYNTHETIC_SESSION_NO_ADMIN_SESSION_SIGNOUT'},
  ];
  need(p.authEndpointScope.reduce((n, x) => n + x.limit, 0) === 20, 'AUTH_CAPS');
  p.independentFailureContainment = {
    separatelyAuthorizedWithinSamePacket: true, reservedRequests: 6, maximumPerActor: 3,
    appliesAfter: 'FAILED_OR_UNCERTAIN_AUTH_OR_BUSINESS_GATE_INCLUDING_CONFIRMATION_FAILURE_IF_EXACT_FRESH_IDENTITY_PROVEN',
    sequence: 'STOP_BUSINESS_KEEP_ORIGINAL_FAILURE_EXACT_GET_IDENTITY_PRECHECK_THEN_SINGLE_BAN_PUT_THEN_INDEPENDENT_GET_VERIFY_FUTURE_BANNED_UNTIL_AND_SAME_IDENTITY',
    requires: 'ACTUAL_OWNER_APPROVAL_VALID_WINDOW_SUCCESSFUL_CREATE_UUID_EMAIL_NAMESPACE_PROJECT_MATCH_AND_CREATE_JOURNAL_HASH_NOT_EXACT_CLIENT_SERVER_TIME',
    unknownCreation: 'NO_UUID_NO_ENUMERATION_NO_CREATE_RETRY_NO_BAN_GUESS_REPORT_UNCONFIRMED_RESIDUAL',
    mismatch: 'STOP_BEFORE_BAN_NO_BROADER_READ_OR_ACCOUNT_CHANGE',
    banDuration: '876000h', historicalActor: 'EXCLUDED_23c3c903-0687-4c6d-840c-f7f8a0d442db_NO_REUSE_OR_CHANGE',
    verifiedMeaning: 'ONLY_AFTER_INDEPENDENT_BAN_STATE_AND_IDENTITY_READBACK_NOT_EXISTING_ACCESS_JWT_REVOCATION_PROOF',
    onFailure: 'UNKNOWN_NO_RETRY_PRESERVE_PROTECTED_CREDENTIALS_ORIGINAL_TEST_FAILURE_AND_RESIDUAL_OBLIGATIONS',
  };
  p.cleanupAndRetention.accounts = 'EXACT_NEW_ACTORS_ONLY_NORMAL_LOGOUT_THEN_RESERVED_PRECHECK_BAN_READBACK_SAME_QUOTA_AS_FAILURE_CONTAINMENT_NO_SECOND_BAN_NO_AUTH_DELETE';
  p.cleanupAndRetention.uncertainWrite = 'STOP_BUSINESS_NO_RETRY_OR_DESTRUCTIVE_ROLLBACK_INDEPENDENT_ACCOUNT_CONTAINMENT_ONLY_IF_ITS_EXACT_PRECONDITIONS_PASS';
  p.cleanupAndRetention.credentials = 'ONLY_NEW_HASH_BOUND_ENVELOPES_MAY_BE_UNLINKED_AFTER_ALL_EXACT_BUSINESS_CLEANUP_KNOWN_SESSION_LOGOUT_AND_INDEPENDENT_BAN_READBACK_PROVEN_NO_AMBIGUOUS_SESSION_ELSE_PROTECTED_RETAINED_NO_DECRYPT_FOR_CLEANUP_NO_FORENSIC_ERASURE_CLAIM';
  p.cleanupAndRetention.historicalCredentials = 'OLD_A_TWO_ENVELOPES_REMAIN_UNCHANGED_PROTECTED_RETAINED_NOT_A_NEW_CORE_BLOCKER_NO_DECRYPT_OR_UNLINK_AUTHORIZED';
  p.legacyAssessment = {status: 'UNVERIFIED_SEPARATE_MATERIAL_RISK', newProductionMetadataOrObjectAccessAuthorized: false,
    scope: 'EXISTING_OFFLINE_EVIDENCE_ONLY_NO_DATABASE_CONNECTION_NO_REAL_OBJECT_HEAD_OR_BYTES',
    stop: 'DO_NOT_DOWNGRADE_OR_CLAIM_NO_LOSS_NO_PUBLIC_BETA_GO_WITH_UNCLOSED_MATERIAL_RISK'};
  p.costAndManagementGates.noMailAuthorization = true;
  p.costAndManagementGates.currentOwnerConfirmationNotInferredFromLocalEmailInput = true;
  p.executionStopRules.push('FAILED_LOGIN_STOPS_ALL_BUSINESS_BUT_DOES_NOT_CANCEL_SEPARATELY_APPROVED_EXACT_ACCOUNT_CONTAINMENT', 'NO_HISTORICAL_AUTH_LOG_QUERY_OR_401_RETRY');
  p.localEvidence = {
    authAdmissionSourceCommit: 'e8d086f204de7c0dd86dd18d87890e24c2ff9aa3', authAdmissionTests: 'HISTORICAL_17_OF_17_PASS_OFFLINE_ONLY_NOT_REPEATED',
    localMailboxSetupChecks: '12_OF_12_PASS_LOCAL_ONLY', newProductionRequests: 0,
    executionMode: 'BOUND_OPERATOR_WORKFLOW_WITH_EXISTING_TOOLS_AND_SOURCE_HELPERS_NOT_OLD_EXECUTOR_OR_OLD_APPROVAL_REPLAY',
    sourcePins: ['scripts/qa/core-auth-admission-v2.mjs', 'scripts/qa/configure-core-test-mailboxes.ps1', 'scripts/qa/prepare-core-acceptance-v2.mjs'].map(file => ({path: path.join(sourceRoot, file), sha256: hash(fs.readFileSync(path.join(sourceRoot, file)))})),
  };
  need(p.localEvidence.sourcePins[0].sha256 === 'd63cf4030b399329634bd41e2a82f2c77a5ac0ef42316f56d31ccbef75f0104f', 'REUSED_AUTH_SOURCE_IDENTITY');
  for (const fixture of p.media.fixtures) need(hash(fs.readFileSync(path.join(OLD_ROOT, fixture.file))) === fixture.sha256, 'PRESERVED_MEDIA_FIXTURE_HASH');
  p.media.fixtureRoot = OLD_ROOT;
  p.formalApprovalMeaning = 'SHA256_OF_THIS_EXACT_PRIVATE_PACKET_PLUS_MATCHING_FRESH_HUMAN_APPROVAL_REQUIRED_NO_AUTHORITY_FROM_SELF_HASH_OR_LOCAL_MAILBOX_CONFIRMATION';
  p.ownerApprovalTemplate = {
    CORE_ACCEPTANCE_V2_GO: 'APPROVED_FOR_THIS_EXACT_PACKET_ONLY',
    OWNED_MAILBOX_CONFIG_AND_TWO_FRESH_ALIASES_ACCEPTED: true,
    APPROVAL_ACTIVATED_120_MINUTE_WINDOW_ACCEPTED: true,
    FIRST_ACTOR_AUTH_AND_PROFILE_GATE_BEFORE_SECOND_ACTOR_ACCEPTED: true,
    SYNTHETIC_ACCOUNT_CREATION_GO: 'APPROVED_FOR_TWO_NEW_ORDINARY_USERS_ONLY_NO_EXISTING_ACCOUNT_RESET',
    CORE_CASES_AND_EXACT_CLEANUP_GO: 'APPROVED_FOR_BOUND_SYNTHETIC_IDS_AND_ENDPOINT_CAPS_ONLY',
    INDEPENDENT_FAILURE_CONTAINMENT_GO: 'APPROVED_FOR_EXACT_CREATED_ACTOR_PRECHECK_BAN_READBACK_EVEN_AFTER_FAILED_TEST_GATE',
    APPROVED_BAN_DURATION: '876000h',
    SHORT_LIVED_PUBLIC_SYNTHETIC_CONTENT_EXPOSURE_ACCEPTED: true,
    SYNTHETIC_CREDENTIAL_DPAPI_CUSTODY_AND_CONDITIONAL_CLEANUP_ACCEPTED: true,
    CURRENT_ZERO_ADDITIONAL_COST_INCLUDING_AUTH_STORAGE_R2_IMAGES_AND_BACKEND_MODERATION_CONFIRMED: true,
    CURRENT_ADMIN_SESSION_REQUIRED_INTERACTIVE_ACCESS_AND_DEPLOYMENT_READ_ACCESS_READY: true,
    ALL_DESTRUCTIVE_MEDIA_CIRCLE_AND_EXTERNAL_JOBS_REMAIN_PAUSED: true,
    FROZEN_SERVER_INTERNAL_RETRY_DISTINCTION_ACCEPTED: true,
    RETAIN_CLAIMS_REPORT_AUDIT_SOFT_DELETED_FIXTURES_AND_BANNED_SYNTHETIC_ACCOUNTS_ACCEPTED: true,
    HISTORICAL_A_AND_ITS_ENVELOPES_EXCLUDED: true,
    LEGACY_MEDIA_MATERIAL_RISK_REMAINS_UNVERIFIED_AND_BLOCKS_PUBLIC_BETA_ACCEPTED: true,
    EXECUTOR_RETRIES: 0, PRODUCTION_DATABASE_CONNECTIONS: 0, PRODUCTION_MIGRATIONS: 0, DEPLOYMENTS: 0,
    CATALOG_HOLD: 'ACTIVE', PUBLIC_BETA_GO: 'NOT_AUTHORIZED',
  };
  const packetPath = path.join(directory, 'CORE_ACCEPTANCE.v2.NOT_AUTHORIZED.json');
  const bytes = Buffer.from(JSON.stringify(p, null, 2) + '\n');
  const binding = hash(bytes);
  const approvalText = 'Pending owner review. No Production authority or execution window is started.\n'
    + `Exact private packet: ${packetPath}\nSHA-256: ${binding}\n\n`
    + `CORE_ACCEPTANCE_V2_BINDING_SHA256=${binding}\n`
    + Object.entries(p.ownerApprovalTemplate).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  saveExclusive(packetPath, bytes);
  const approvalPath = path.join(directory, 'CORE_ACCEPTANCE.v2.OWNER_APPROVAL.txt');
  saveExclusive(approvalPath, Buffer.from(approvalText));
  const safe = {status: 'SINGLE_PACKET_PREPARED_NOT_AUTHORIZED', binding, packetPath, approvalPath,
    mailboxConfigSha256: hash(configBytes), privateAliases: 2, authRequestCap: 20, reservedContainmentRequests: 6,
    productionRequests: 0, emailsSent: 0, executionWindowStarted: false, privateEmailsReturned: false};
  saveExclusive(path.join(directory, 'preparation.safe.json'), Buffer.from(JSON.stringify(safe, null, 2) + '\n'));
  console.log(JSON.stringify(safe));
} catch (e) {
  console.log(JSON.stringify({status: 'BLOCKED_LOCAL_PREPARATION', reason: /^[A-Z][A-Z0-9_]+$/.test(e.message ?? '') ? e.message : 'LOCAL_PREPARATION_UNCONFIRMED', productionRequests: 0, emailsSent: 0}));
  process.exitCode = 1;
}
