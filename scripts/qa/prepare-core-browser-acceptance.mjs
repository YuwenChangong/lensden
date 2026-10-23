import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Offline packet preparation only; no credentials, browser sessions or network.
const privateRoot = 'C:/Users/1/AppData/Local/OpenGlassHub/mailbox-e9f2a410-6cc1-4197-a5f3-256e9c157302';
const oldBinding = '33dec18588856b1752eb4fabd6bbde19f3e1b202c0f79417e19aeb2d0ee2ee3d';
const oldConfigHash = '70496365eabbd9b044f25dc2b3d93b2d23f6b3aef89ca2588551743edeb6c4ae';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const need = (ok, code) => { if (!ok) throw new Error(code); };
function save(name, value) {
  const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  const file = path.join(privateRoot, name);
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  need(fs.readFileSync(file).equals(bytes), 'PRIVATE_READBACK');
  return { path: file, sha256: sha(bytes) };
}
function privateAcl(paths) {
  const items = paths.map(p => "'" + p.replaceAll("'", "''") + "'").join(',');
  const command = `$ErrorActionPreference='Stop';$env:PSModulePath=Join-Path $PSHOME 'Modules';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;foreach($p in @(${items})){$i=Get-Item -LiteralPath $p;if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'REPARSE'};$a=Get-Acl -LiteralPath $p;$r=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid -or $r.Count -ne 1 -or $r[0].IdentityReference.Value -cne $sid -or $r[0].AccessControlType -ne 'Allow' -or $r[0].FileSystemRights -ne 'FullControl'){throw 'ACL'}};[Console]::Out.Write('PASS')`;
  need(execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, timeout: 5000, encoding: 'utf8', maxBuffer: 4096 }) === 'PASS', 'PRIVATE_ACL');
}
try {
  need(process.argv[2] === '--owner-approved-new-gmail-alias-preparation', 'NEW_ALIAS_PREPARATION_OWNER_APPROVAL_REQUIRED');
  privateAcl([privateRoot, path.join(privateRoot, 'mailboxes.private.json')]);
  const oldBytes = fs.readFileSync(path.join(privateRoot, 'CORE_ACCEPTANCE.v2r1.NOT_AUTHORIZED.json'));
  const configBytes = fs.readFileSync(path.join(privateRoot, 'mailboxes.private.json'));
  need(sha(oldBytes) === oldBinding && sha(configBytes) === oldConfigHash, 'PRESERVED_INPUT_HASH');
  const p = JSON.parse(oldBytes), oldConfig = JSON.parse(configBytes);
  need(oldConfig.aliasMethod === 'GMAIL_DOCUMENTED_PLUS_ADDRESSING'
    && oldConfig.ownershipConfirmed && oldConfig.receivabilityConfirmedByOwner, 'OWNER_GMAIL_SOURCE');
  const primary = oldConfig.primaryEmail;
  need(typeof primary === 'string' && /^[^\s@]+@gmail\.com$/i.test(primary), 'SUPPORTED_GMAIL_SOURCE');
  const tag = crypto.randomUUID();
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const namespace = `ogh-pbeta-core-${date}-${tag}`;
  const local = primary.slice(0, primary.lastIndexOf('@')).split('+')[0];
  const actors = ['A2', 'B2'].map(alias => ({ alias,
    email: `${local}+ogh-${alias.toLowerCase()}-${tag.replaceAll('-', '').slice(0, 16)}@gmail.com`, newOnly: true }));
  need(actors.every(a => a.email.length <= 254 && a.email.split('@')[0].length <= 64
    && !oldConfig.actors.some(old => old.email.toLowerCase() === a.email.toLowerCase())), 'FRESH_ALIAS_VALIDATION');
  need(actors[0].email !== actors[1].email, 'DISTINCT_ALIASES');
  const mailbox = save('mailboxes.captcha-v1.private.json', {
    schemaVersion: 1, project: p.supabaseProject, namespace, actors,
    sourceConfigSha256: oldConfigHash, ownerNewAliasPreparationApproved: true,
    method: 'GMAIL_DOCUMENTED_PLUS_ADDRESSING', ownerControlInheritedFromSamePrimary: true,
    receivabilityAttestation: 'SAME_OWNER_GMAIL_NO_NEW_DELIVERY_PROOF', deliveryVerified: false,
    productionAuthority: false,
  });
  const result = JSON.parse(fs.readFileSync(path.join(privateRoot, 'BROWSER_CAPTCHA_OFFLINE.safe.json')));
  need(result.status === 'PASS' && result.checks === 8 && result.productionRequests === 0
    && result.providerRequests === 0 && result.browserAndServerClosed, 'OFFLINE_BROWSER_PROOF');
  need(result.sourceSha256 === sha(fs.readFileSync(path.join(repo, 'scripts/qa/test-core-browser-captcha-offline.mjs'))), 'OFFLINE_PROOF_SOURCE_IDENTITY');
  const frozen = p.sourceRoot;
  need(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: frozen, encoding: 'utf8' }).trim() === p.sourceRC, 'FROZEN_RC_IDENTITY');
  for (const fixture of p.media.fixtures) need(sha(fs.readFileSync(path.join(p.media.fixtureRoot, fixture.file))) === fixture.sha256, 'FIXTURE_IDENTITY');
  need(sha(fs.readFileSync(p.preservedRelease.receiptPath)) === p.preservedRelease.receiptSha256, 'RELEASE_RECEIPT_IDENTITY');
  need(sha(fs.readFileSync(p.legacyAssessment.sqlFile)) === p.legacyAssessment.sqlSha256, 'LEGACY_SQL_IDENTITY');
  for (const key of ['windowStartUTC', 'windowEndUTC', 'latestInitialAdmissionUTC', 'latestNewFixtureAdmissionUTC',
    'newBusinessWriteDeadlineUTC', 'latestLegacyInspectionAdmissionUTC', 'currentLocalWranglerEvidence',
    'historicalManagementEvidence', 'ownerApprovalTemplate', 'localEvidence']) delete p[key];
  p.task = 'PUBLIC_BETA_CAPTCHA_COMPATIBLE_CORE_ACCEPTANCE';
  p.status = 'AWAITING_READY_OWNER_AND_NEW_EXACT_AUTHORIZATION';
  p.preparedUTC = new Date().toISOString();
  p.namespace = namespace;
  p.productionExecutionEnabled = false;
  p.supersedesBinding = oldBinding;
  p.oldRequestsAndApprovalReusable = false;
  p.authorizationTiming = {
    activation: 'ONLY_AFTER_OWNER_READY_AND_MATCHING_FRESH_APPROVAL_RECORDED_ONCE_AT_ACTUAL_UTC',
    executionMinutes: 120, latestInitialAdmissionMinute: 10, latestNewFixtureAdmissionMinute: 75,
    newBusinessWriteDeadlineMinute: 90, latestLegacyInspectionAdmissionMinute: 105,
    cleanupDeadlineMinute: 120, automaticRenewal: false,
    initialCredentialGate: 'WRANGLER_EXISTING_CREDENTIAL_AT_LEAST_2700_SECONDS_NO_AUTOMATIC_REFRESH_ALL_MANAGEMENT_READS_BEFORE_EXPIRY',
    insufficientTime: 'NO_FIXTURE_CREATION_IF_OWNER_CAPTCHA_HANDOFF_OR_EXECUTION_AND_CONTAINMENT_BUDGET_UNAVAILABLE_STOP_WITHOUT_EXTENDING',
    cleanupAuthority: 'INDEPENDENT_EXACT_ACCOUNT_CONTAINMENT_SURVIVES_BUSINESS_STOP_BUT_NOT_WINDOW_END_OR_IDENTITY_MISMATCH',
  };
  p.mailboxBinding = { ...mailbox, aliases: 2, acl: 'CURRENT_WINDOWS_USER_ONLY',
    oldConfigPreserved: true, usedAliasesExcluded: true, deliveryVerified: false };
  p.newActors = actors.map(a => ({ ...a, displayName: `Synthetic QA ${a.alias}`, requiredProfileRole: 'user', createMaximum: 1 }));
  p.logicalActorAliases = { A: 'A2', B: 'B2', meaning: 'ALL_PRESERVED_CASE_AND_ENDPOINT_A_B_SYMBOLS_REFER_ONLY_TO_THESE_NEW_ACTORS' };
  p.excludedActors = ['23c3c903-0687-4c6d-840c-f7f8a0d442db', 'dce0109d-93ef-4cc7-a91f-4085855410c9'];
  p.accountProvisioning.privateDirectory = path.join(process.env.LOCALAPPDATA, 'OpenGlassHub', `core-captcha-${tag}`);
  p.accountProvisioning.dpapiNamespace = `e-verify-group1-core-captcha-${tag}`;
  delete p.accountProvisioning.preparedDirectoryReuse;
  p.accountProvisioning.order = 'A2_CREATE_JOURNAL_CONFIRM_EXACT_GET_REAL_BROWSER_CAPTCHA_SINGLE_LOGIN_OWN_UID_PROFILE_USER_REFRESH_THEN_B2_SAME_THEN_BUSINESS';
  p.accountProvisioning.credentialConsistency = 'ONE_RANDOM_PASSWORD_AFTER_APPROVAL_DPAPI_CUSTODY_SAME_VALUE_FROM_PRIVATE_IN_PROCESS_INPUT_TO_REAL_PASSWORD_FIELD_ONLY_NO_CHAT_ENV_LOG_OR_DIRECT_TOKEN_ENDPOINT_DISPATCH';
  p.accountProvisioning.existingActors = 'BOTH_PRIOR_A_UUIDS_AND_ALL_OLD_ENVELOPES_UNCHANGED_EXCLUDED_NO_UNBAN_REUSE_RESET_OR_DELETE';
  p.fixtureCircle.name = 'QA ' + tag.slice(0, 18);
  p.fixtureCircle.expectedSlug = 'qa-' + tag.slice(0, 18);
  p.browserAuthentication = {
    implementation: 'FROZEN_LOGIN_ASTRO_AUTH_PANEL_AUTH_TURNSTILE_SUPABASE_BROWSER_NO_PRODUCT_CHANGE',
    entry: `${p.workerOrigin}/login/?next=%2Ffeed%2F`,
    provider: 'CLOUDFLARE_TURNSTILE_REAL_PRODUCTION_WIDGET_NORMAL_SITE_CONFIGURATION_ONLY',
    sessions: 'TWO_NEW_HEADFUL_MICROSOFT_EDGE_BROWSER_CONTEXTS_A2_B2_EMPTY_COOKIE_LOCAL_SESSION_STORAGE_NOT_TWO_TABS_IN_ADMIN_PROFILE_NO_ADMIN_STORAGE_COPY',
    administrator: 'EXISTING_OWNER_ADMIN_SESSION_REMAINS_SEPARATE_READ_ONLY_EXACT_NEW_REPORT_ONLY',
    localProof: { receipt: path.join(privateRoot, 'BROWSER_CAPTCHA_OFFLINE.safe.json'), checks: 8,
      actualProviderVerification: 'NOT_VERIFIED_UNTIL_NEW_AUTHORIZED_INTERACTIVE_FLOW' },
    requiredBeforeCreate: 'REAL_EDGE_INSTALLED_LOCAL_CONTEXT_ISOLATION_PROVEN_OWNER_READY_CAPTCHA_ACCESS_NO_PRODUCTION_NAVIGATION_BEFORE_APPROVAL',
    runtimeConfigurationGate: 'FIRST_THREE_BOUND_MANAGEMENT_READS_VERIFY_AUTH_CAPTCHA_MODE_required_AND_NONEMPTY_DEDICATED_PUBLIC_AUTH_TURNSTILE_SITE_KEY_NOT_UPLOAD_KEY_NO_SECRET_VALUE_READ_IF_OFF_MISSING_UNKNOWN_STOP_BEFORE_CREATE',
    ownerInteraction: 'ONLY_OWNER_MAY_COMPLETE_REAL_PROVIDER_CHALLENGE_APP_OWNS_TOKEN_SUBMISSION_NO_PROGRAMMATIC_SOLVING_OR_TOKEN_EXTRACTION_REPLAY_TEST_KEYS_OR_CHALLENGE_INTERCEPTION',
    credentialInput: 'LOCAL_PROCESS_READS_ONLY_NEW_DPAPI_ENVELOPE_IN_MEMORY_FILLS_REAL_FORM_NO_CREDENTIAL_ARGUMENT_VALUES_LOGS_SCREENSHOTS_OR_TOKEN_EXPORT',
    formSubmitsPerActor: 1, maximumOwnerCaptchaWaitSecondsPerActor: 300,
    afterSubmitObservationSeconds: 30,
    counting: 'PASSWORD_LOGIN_POST_COUNTED_IN_AUTH20_NOT_HIDDEN_IN_ASSET_BUDGET_NORMAL_CHALLENGE_SCRIPT_FRAME_AND_VERIFICATION_TRAFFIC_SHARED_BROWSER300_NO_AUTOMATIC_EXECUTOR_RETRY',
    successfulMeaning: 'REAL_AUTH_UID_EQUALS_EXACT_CREATE_UUID_ACTUAL_PROFILES_ROLE_user_CONFIRMED_EMAIL_VALID_SESSION_REFRESH_READBACK_BEFORE_B2_NO_DOM_ONLY_PASS',
    sessionUse: 'SESSION_SECRETS_STAY_INSIDE_RESPECTIVE_BROWSER_CONTEXT_AUTHENTICATED_BUSINESS_AND_RLS_REQUESTS_EXECUTED_THERE_RETURN_ONLY_BOUND_FIXTURE_DATA_OR_BOOLEAN_ASSERTIONS_NO_STORAGESTATE_COOKIE_JWT_EXPORT_OR_SESSION_INJECTION',
    errorEvidence: 'SANITIZED_STATUS_UTC_ALLOWLISTED_AUTH_ERROR_CODE_IF_SAFELY_AVAILABLE_ELSE_UNKNOWN_NEVER_FULL_AUTH_RESPONSE_OR_BODY',
    failure: 'NO_SECOND_SUBMIT_RELOAD_OR_DIRECT_AUTH_FALLBACK_STOP_BUSINESS_SEPARATELY_CONTAIN_EXACT_CREATED_ACTORS',
    publicSignup: 'NOT_VERIFIED_ADMIN_CREATED_ACCOUNTS_ARE_NOT_SELF_SERVICE_REGISTRATION_ACCEPTANCE',
  };
  p.browserScope.ordinarySessionMechanism = p.browserAuthentication.sessions;
  p.browserScope.captcha = p.browserAuthentication.ownerInteraction;
  p.browserScope.normalCaptchaVerificationTraffic = 'REAL_CHALLENGES_CLOUDFLARE_COM_WIDGET_SCRIPT_IFRAME_AND_PROVIDER_VERIFICATION_ONLY_COUNT_WITHIN300_NO_CUSTOM_SITEVERIFY_CALL_NO_REQUEST_HEADER_BODY_OR_TOKEN_CAPTURE';
  p.browserScope.maximumObservationSeconds = 30;
  p.browserScope.maximumOwnerCaptchaWaitSecondsPerActor = 300;
  p.authEndpointScope.find(e => e.path === '/auth/v1/token?grant_type=password').scope = 'ONLY_SITE_SUPABASE_SDK_FROM_EACH_NEW_CONTEXT_REAL_CAPTCHA_ONE_FORM_SUBMIT_PER_CREATED_ACTOR_NO_DIRECT_HARNESS_LOGIN';
  p.restScope.rlsIdentity = 'ACTUAL_A2_B2_AUTHENTICATED_BROWSER_SESSIONS_REQUESTS_REMAIN_IN_OWN_CONTEXT_NO_SERVICE_ROLE_OR_TOKEN_EXPORT';
  p.independentFailureContainment.historicalActor = 'BOTH_EXCLUDED_PRIOR_A_UUIDS_AND_ENVELOPES_UNTOUCHED';
  p.independentFailureContainment.requires = 'NEW_EXACT_APPROVAL_VALID_WINDOW_ACTUAL_CREATE_UUID_EMAIL_NAMESPACE_PROJECT_AND_CREATE_JOURNAL_HASH_NOT_SUCCESSFUL_LOGIN_OR_EXACT_CLIENT_SERVER_TIMESTAMP';
  p.cleanupAndRetention.historicalCredentials = 'ALL_PRIOR_A_ENVELOPES_UNCHANGED_PROTECTED_RETAINED_NO_UNLINK_OR_DECRYPT';
  delete p.cleanupAndRetention.time;
  p.legacyAssessment.freshOwnerAuthorizationRequired = true;
  p.legacyAssessment.newProductionMetadataOrObjectAccessAuthorized = false;
  delete p.legacyAssessment.latestAdmissionUTC;
  p.legacyAssessment.admission = 'APPROVAL_START_PLUS105_MINUTES_AND_15_MINUTES_REMAINING_ONLY_AFTER_CORE_AND_CLEANUP_SUCCESS_ELSE_NOT_EXECUTED';
  p.costAndManagementGates.captcha = 'INCLUDE_REAL_TURNSTILE_SCRIPT_VERIFICATION_AND_SUPABASE_AUTH_ORDINARY_USER_MAU_WITHIN_EXISTING_FREE_CAPACITY_NO_PAYMENT_LIMIT_CHANGE';
  p.executionOrder = [
    'OWNER_READY_PLUS_NEW_EXACT_APPROVAL_ONCE_ONLY_AND_EXISTING_CREDENTIAL_WINDOW_SOURCE_BUDGET_GATES',
    'THREE_FRESH_MANAGEMENT_READS_VERSION_CONFIG_AUTH_CAPTCHA_AND_COST_BEFORE_FIRST_CREATE',
    'A2_CREATE_CONFIRM_IDENTITY_HEADFUL_SITE_LOGIN_OWNER_CAPTCHA_OWN_UID_PROFILE_USER_REFRESH',
    'ONLY_AFTER_A2_PASS_B2_CREATE_AND_SAME_REAL_BROWSER_GATES',
    'BOUND_CORE_CASES_REAL_BROWSER_UI_AND_IN_CONTEXT_RLS_MEDIA_TESTS_NO_TOKEN_EXPORT',
    'EXACT_SYNTHETIC_BUSINESS_CLEANUP_KNOWN_SESSIONS_LOGOUT_BAN_AND_INDEPENDENT_READBACK',
    'FOURTH_BOUND_MANAGEMENT_DEPLOYMENT_READ_BEFORE_CREDENTIAL_EXPIRY',
    'IF_ALL_PASS_AND_TIME_SEPARATE_READONLY_LEGACY_SQL_AND_UP_TO64_HEADS_NO_BYTES',
    'SANITIZED_OBSERVED_RESULTS_UNKNOWN_NOT_PASS_PUBLIC_SIGNUP_SEPARATE_NO_AUTO_PUBLIC_BETA_GO',
  ];
  const sourceFiles = ['src/pages/login/index.astro', 'src/components/forum/AuthPanel.tsx',
    'src/components/forum/AuthTurnstile.tsx', 'src/lib/supabase-browser.ts',
    'src/lib/server/auth-login-response.ts', 'src/lib/auth-captcha-mode.ts',
    'src/components/auth/AuthCallback.tsx', 'src/lib/auth-redirect.ts'];
  p.localEvidence = { productionRequests: 0, emailsSent: 0, historicalTestsRepeated: false,
    targetedOfflineBrowserChecks: 8, actualProductionCaptcha: 'NOT_VERIFIED',
    frozenSourcePins: sourceFiles.map(file => ({ path: path.join(frozen, file), sha256: sha(fs.readFileSync(path.join(frozen, file))) })),
    sourcePins: ['scripts/qa/core-auth-admission-v2.mjs', 'scripts/qa/prepare-core-browser-acceptance.mjs',
      'scripts/qa/test-core-browser-captcha-offline.mjs', 'tools/e-verify-group1-remaining-assets/private-evidence.mjs',
      'tools/e-verify-group1-remaining-assets/protect-evidence.ps1'].map(file => ({ path: path.join(repo, file), sha256: sha(fs.readFileSync(path.join(repo, file))) })),
    offlineReceiptSha256: sha(fs.readFileSync(path.join(privateRoot, 'BROWSER_CAPTCHA_OFFLINE.safe.json'))),
    productionExecution: 'EXISTING_BOUNDED_OPERATOR_AND_REAL_BROWSER_WORKFLOW_NOT_OLD_DIRECT_PASSWORD_OPERATOR_NOT_NEW_GENERIC_EXECUTOR',
    references: ['https://supabase.com/docs/guides/auth/auth-captcha', 'https://playwright.dev/docs/browser-contexts'],
  };
  p.ownerApprovalTemplate = {
    CORE_BROWSER_CAPTCHA_GO: 'APPROVED_FOR_THIS_EXACT_PACKET_ONLY',
    NEW_PRIVATE_A2_B2_GMAIL_ALIASES_ACCEPTED: true,
    OWNER_READY_FOR_REAL_CAPTCHA_AND_FULL_EXECUTION_WINDOW: true,
    APPROVAL_ACTIVATED_120_MINUTE_WINDOW_NO_EXTENSION_ACCEPTED: true,
    SYNTHETIC_CREATE_AND_REAL_BROWSER_LOGIN_GO: 'APPROVED_FOR_TWO_NEW_ORDINARY_USERS_ONLY_A2_GATE_BEFORE_B2',
    NO_CAPTCHA_BYPASS_TOKEN_EXPORT_OR_DIRECT_LOGIN_FALLBACK_ACCEPTED: true,
    CORE_CASES_AND_EXACT_CLEANUP_GO: 'APPROVED_FOR_BOUND_SYNTHETIC_IDS_AND_ENDPOINT_CAPS_ONLY',
    INDEPENDENT_FAILURE_CONTAINMENT_GO: 'APPROVED_FOR_CREATED_ACTOR_EXACT_PRECHECK_BAN_READBACK_EVEN_AFTER_FAILED_GATE',
    APPROVED_BAN_DURATION: '876000h', SHORT_LIVED_PUBLIC_SYNTHETIC_CONTENT_EXPOSURE_ACCEPTED: true,
    SYNTHETIC_DPAPI_CUSTODY_AND_CONDITIONAL_CLEANUP_ACCEPTED: true,
    CURRENT_ZERO_ADDITIONAL_COST_INCLUDING_CAPTCHA_AUTH_STORAGE_R2_IMAGES_AND_MODERATION_CONFIRMED: true,
    CURRENT_ADMIN_SESSION_WRANGLER_AND_INTERACTIVE_ACCESS_READY: true,
    ALL_DESTRUCTIVE_MEDIA_CIRCLE_AND_EXTERNAL_JOBS_REMAIN_PAUSED: true,
    FROZEN_SERVER_INTERNAL_RETRY_DISTINCTION_ACCEPTED: true,
    RETAIN_CLAIMS_REPORT_AUDIT_SOFT_DELETED_FIXTURES_AND_BANNED_ACTORS_ACCEPTED: true,
    BOTH_PRIOR_A_USERS_AND_ALL_OLD_ENVELOPES_EXCLUDED: true,
    LEGACY_METADATA_AND_HEAD_GO: 'APPROVED_FOR_ONE_BOUND_READONLY_CONNECTION_UP_TO64_EXACT_HEADS_NO_USER_BYTES',
    CURRENT_DATABASE_PASSWORD_READY_FOR_LOCAL_HIDDEN_INPUT: true,
    LEGACY_MATERIAL_RISK_REMAINS_UNVERIFIED_AND_BLOCKS_PUBLIC_BETA_ACCEPTED: true,
    PUBLIC_SELF_SERVICE_SIGNUP_NOT_PROVEN_BY_THIS_TEST_ACCEPTED: true,
    EXECUTOR_RETRIES: 0, PRODUCTION_DATABASE_CONNECTIONS_MAX: 1,
    PRODUCTION_MIGRATIONS: 0, DEPLOYMENTS: 0, CATALOG_HOLD: 'ACTIVE', PUBLIC_BETA_GO: 'NOT_AUTHORIZED',
  };
  need(p.authEndpointScope.reduce((n, e) => n + e.limit, 0) === 20, 'AUTH20_CAP');
  need(p.maximumRequestBudgets.workerExplicitApiRequests === 80
    && p.maximumRequestBudgets.supabaseRestRequests === 64
    && p.maximumRequestBudgets.supabaseStorageRequests === 24
    && p.maximumRequestBudgets.cloudflareManagementReads === 4
    && p.maximumRequestBudgets.legacyPostgresConnections === 1, 'UNCHANGED_BUDGETS');
  const packet = save('CORE_ACCEPTANCE.captcha-v1.NOT_AUTHORIZED.json', p);
  const approval = save('CORE_ACCEPTANCE.captcha-v1.OWNER_APPROVAL.txt',
    'Pending owner review. No execution window or Production authority starts during preparation.\n'
    + `Exact private packet: ${packet.path}\nSHA-256: ${packet.sha256}\n\n`
    + `CORE_BROWSER_CAPTCHA_BINDING_SHA256=${packet.sha256}\n`
    + Object.entries(p.ownerApprovalTemplate).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  privateAcl([mailbox.path, packet.path, approval.path]);
  console.log(JSON.stringify({ status: 'PREPARED_PENDING_OWNER_READINESS_AND_APPROVAL', packet, approval,
    newPrivateAliases: 2, priorFilesUnchanged: true, productionRequests: 0, emailsSent: 0,
    windowStarted: false, credentialValuesReturned: false, privateAliasesReturned: false }));
} catch (error) {
  console.log(JSON.stringify({ status: 'BLOCKED_OFFLINE_PREPARATION',
    reason: /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'LOCAL_PREPARATION_UNCONFIRMED',
    productionRequests: 0, emailsSent: 0, windowStarted: false }));
  process.exitCode = 1;
}
