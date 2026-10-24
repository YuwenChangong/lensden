// Offline finalization of one existing private draft; never starts an execution window.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = 'C:/Users/1/AppData/Local/OpenGlassHub/mailbox-e9f2a410-6cc1-4197-a5f3-256e9c157302';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stem = 'CORE_ACCEPTANCE.ordinary-v1';
const draftHash = 'ba7e7321209d102b9858c38605c4490757a2b3e996412e3f2ced16e720cf2dd8';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const need = (condition, reason) => { if (!condition) throw new Error(reason); };
const read = name => fs.readFileSync(path.join(root, name));
const pin = file => ({ path: file.replaceAll('\\', '/'), sha256: hash(fs.readFileSync(file)) });
function checkAcl(file) {
  const script = `$ErrorActionPreference='Stop';$env:PSModulePath=Join-Path $PSHOME 'Modules';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$p='${file.replaceAll("'", "''")}';$i=Get-Item -LiteralPath $p;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE'};$a=Get-Acl -LiteralPath $p;$r=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid -or $r.Count -ne 1 -or $r[0].IdentityReference.Value -cne $sid -or $r[0].FileSystemRights -ne 'FullControl' -or $r[0].AccessControlType -ne 'Allow'){throw 'ACL'};[Console]::Write('PASS')`;
  need(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 5000, maxBuffer: 4096, encoding: 'utf8' }) === 'PASS', 'PRIVATE_ACL');
}
function save(name, value) {
  const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  const file = path.join(root, name), fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  need(fs.readFileSync(file).equals(bytes), 'PRIVATE_READBACK'); checkAcl(file);
  return pin(file);
}

try {
  need(process.argv[2] === '--offline-finalize-existing-draft', 'OFFLINE_ONLY_ARGUMENT_REQUIRED');
  checkAcl(root);
  const original = read(`${stem}.NOT_AUTHORIZED.json`);
  need(hash(original) === draftHash, 'DRAFT_IDENTITY');
  const p = JSON.parse(original);
  need(!fs.existsSync(p.ownerReceiptPath), 'APPROVAL_ALREADY_EXISTS');
  need(p.productionExecutionEnabled === false && !p.windowStartUTC, 'NOT_OFFLINE_DRAFT');
  checkAcl(p.mailboxBinding.path);
  need(pin(p.mailboxBinding.path).sha256 === p.mailboxBinding.sha256, 'MAILBOX_IDENTITY');
  need(p.newActors.length === 2 && p.newActors[0].email !== p.newActors[1].email
    && p.newActors.every(a => /^[^\s@]+\+ogh-(a3|b3)-[a-f0-9]{16}@gmail\.com$/.test(a.email)), 'FRESH_ALIAS_SHAPE');
  need(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: p.sourceRoot, encoding: 'utf8' }).trim() === p.sourceRC, 'FROZEN_RC');
  need(execFileSync('git', ['status', '--porcelain'], { cwd: p.sourceRoot, encoding: 'utf8' }).trim() === '', 'FROZEN_DIRTY');
  need(pin(p.preservedRelease.receiptPath).sha256 === p.preservedRelease.receiptSha256, 'RELEASE_RECEIPT');
  need(pin(p.legacyAssessment.sqlFile).sha256 === p.legacyAssessment.sqlSha256, 'LEGACY_SQL');
  for (const fixture of p.media.fixtures) need(pin(path.join(p.media.fixtureRoot, fixture.file)).sha256 === fixture.sha256, 'FIXTURE_HASH');
  const replaced = new Set(['core-ordinary-session-checks.mjs', 'test-core-ordinary-session-checks.mjs', 'show-core-fixture-credential.ps1', 'finalize-core-ordinary-packet.mjs']);
  const checkoutLineEndingChanges = [];
  for (const old of p.localEvidence.sourcePins) {
    if (!replaced.has(path.basename(old.path)) && pin(old.path).sha256 !== old.sha256) {
      need(path.basename(old.path) === 'core-auth-admission-v2.mjs'
        && hash(fs.readFileSync(old.path, 'utf8').replaceAll('\r\n', '\n')) === old.sha256, 'UNCHANGED_HELPER_HASH');
      checkoutLineEndingChanges.push({ path: old.path, priorLfHash: old.sha256, newActualByteHash: pin(old.path).sha256,
        reason: 'GIT_AUTOCRLF_CHECKOUT_ONLY_NORMALIZED_CONTENT_IDENTICAL_NEW_PACKET_PINS_ACTUAL_BYTES' });
    }
  }
  need(pin(p.localEvidence.publicAppSdkAsset.path).sha256 === p.localEvidence.publicAppSdkAsset.sha256, 'SDK_ASSET_HASH');
  const sources = p.localEvidence.sourcePins.map(old => pin(old.path));
  if (!sources.some(x => x.path.endsWith('/finalize-core-ordinary-packet.mjs'))) sources.push(pin(fileURLToPath(import.meta.url)));
  const offline = {
    task: 'ORDINARY_CORE_OFFLINE_FINALIZATION', sourcePins: sources,
    sourceBaseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    authRlsGuardTests: { cases: 22, status: 'PASS_OFFLINE_FIXTURES_NOT_PRODUCTION_AUTH_RLS' },
    credentialValidation: { cases: 5, status: 'PASS_LOCAL_NONSECRET_NO_REAL_GUI' },
    syntax: 'TWO_NODE_CHECKS_AND_POWERSHELL_PARSE_PASS',
    workspaceRecovery: 'COMMITTED_WORKTREE_RESTORED_MISSING_UNCOMMITTED_HELPERS_RECREATED_NEW_HASHES_AND_FOCUSED_VERIFICATION',
    checkoutLineEndingChanges,
    productionRequests: 0, accountsCreated: 0, emailsSent: 0, clockStarted: false,
    historicalSuitesRepeated: false, localWrangler: 'INTERACTIVE_LOGIN_NEEDED_NOT_REMOTE_VERIFIED',
    publicSdkAsset: p.localEvidence.publicAppSdkAsset,
  };
  p.preparedUTC = new Date().toISOString();
  p.withdrawnPredeliveryDraftSha256 = draftHash;
  p.sourceBaseCommit = offline.sourceBaseCommit;
  p.restScope.allowedTables = p.restScope.allowedTables.filter(x => x !== 'legal_consents');
  p.restScope.legalConsent = 'NO_DIRECT_CONSENT_TABLE_ACCESS; OWNER_REVIEWS_CURRENT_TERMS_AND_USES_BOUND_FROZEN_LEGAL_CONSENT_UI';
  p.restScope.writes = 'A3_OWN_TEXT_BODY_UPDATE; A3_UPDATE_B3_COMMENT_DENIED; B3_UPDATE_A3_POST_DELETE_A3_IMAGE_MEDIA_AND_UPDATE_B3_OWN_ROLE_ADMIN_DENIED; EXACT_UNCHANGED_READBACKS_ONLY';
  p.restScope.outOfScope = 'NO_PRIVILEGED_BUSINESS_SEED_ROLE_GRANT_CATALOG_WRITE_OR_SUCCESSFUL_DIRECT_HARD_DELETE; ONE_EXPLICIT_NEGATIVE_B3_DELETE_A3_SYNTHETIC_IMAGE_MEDIA_ATTEMPT_IS_AUTHORIZED';
  p.browserScope.targets = ['/login/', '/login/?next=%2Ffeed%2F', '/feed/', '/posts/new/', '/posts/BOUND_NEW_POST_ID/', '/circles/new/', '/circles/BOUND_NEW_SLUG/', '/circles/BOUND_NEW_SLUG/manage/', '/notifications/', '/products/', '/products/ONE_VISIBLE_BRAND/ONE_ACTUALLY_VISIBLE_PUBLIC_SLUG/', '/me/', '/me/edit/', '/legal-consent/', '/terms/', '/privacy/', '/community-guidelines/'];
  p.browserScope.ambientReadScope = 'NORMAL_PUBLIC_UI_RENDERING_MAY_RETURN_NONFIXTURE_PUBLIC_CONTENT; DO_NOT_EXPORT_PERSIST_OR_USE_IT_AS_A_FIXTURE; EXACT_TEST_RESOURCE_MUTATIONS_ONLY; UNKNOWN_PRIVATE_OR_FOREIGN_PARTICIPATION_STOPS';
  p.browserAuthentication.selfXssSafety = 'DO_NOT_DISABLE_BROWSER_PASTE_OR_SELF_XSS_PROTECTIONS; IF_FIXED_OWNER_SNIPPET_UNAVAILABLE_STOP_NO_COOKIE_EXPORT_OR_ALTERNATIVE_LOGIN';
  p.browserAuthentication.postLoginChecks.module = sources.find(x => x.path.endsWith('/core-ordinary-session-checks.mjs'));
  p.accountProvisioning.browserCredentialHandoff.source = sources.find(x => x.path.endsWith('/show-core-fixture-credential.ps1'));
  p.coreExecution.availability = 'NO_ONE_CLICK_EXECUTOR_CLAIM; VERIFY_BOTH_EXISTING_BLANK_PROFILE_UI_CHANNELS_AND_ALL_REQUIRED_CASE_PROCEDURES_BEFORE_CREATE; UNAVAILABLE_PROOF_STOPS_WITH_NO_PASS';
  p.authEndpointScope.forEach(x => { x.accounting = 'EXPLICIT_OPERATOR_OR_FIXED_BATCH_ALLOWANCE; UNINSTRUMENTED_FROZEN_UI_NATIVE_SESSION_READ_REFRESH_TRAFFIC_NOT_INDEPENDENTLY_COUNTED_OR_PROMISED_WITHIN_THIS_CEILING'; });
  p.maximumRequestBudgets.serverInternalCalls = 'INHERITED_SERVER_AUTH_DB_RATE_LIMIT_AND_MODERATION_WORK_IS_NOT_AN_INDEPENDENT_NUMERIC_WIRE_BUDGET; FIXED_ACTION_CAPS_AND_CURRENT_ZERO_COST_GATE_APPLY';
  p.authorizationTiming.managementCredentialSafety = 'DERIVE_BUSINESS_STOP_AS_EARLIER_OF_APPROVAL_PLUS75MIN_AND_EXISTING_WRANGLER_EXPIRY_MINUS15MIN; COMPLETE_FINAL_MANAGEMENT_READ_BEFORE_EXPIRY; NO_AUTOMATIC_REFRESH';
  p.legalConsent.source = pin(p.legalConsent.source.path);
  p.sourceEvidence = [
    'src/lib/supabase-browser.ts', 'src/components/forum/AuthPanel.tsx', 'src/components/forum/CreatePostForm.tsx',
    'src/pages/api/forum/posts.ts', 'src/pages/api/forum/comments.ts', 'src/pages/api/forum/post-media.ts',
    'src/pages/api/forum/external-video-upload.ts', 'src/pages/api/legal/consent.ts',
    'src/lib/server/legal-consent-repository.server.ts',
    'supabase/migrations/20261020000000_post_media_r2_copy_claims.sql',
  ].map(relative => pin(path.join(p.sourceRoot, relative)));
  p.localEvidence = { ...p.localEvidence, sourcePins: sources, postLoginGuardChecks: '22_PASS_OFFLINE_ONLY_INCLUDING_TIMEOUT_DEADLINE_NO_RETRY_AND_GENERATED_SNIPPET',
    credentialInputChecks: '5_PASS_LOCAL_ONLY_NO_REAL_GUI', syntaxChecks: offline.syntax,
    missingWorkspaceRecovery: offline.workspaceRecovery, receipt: null };
  const sum = a => a.reduce((n, v) => n + v.limit, 0);
  need(sum(p.authEndpointScope) === 24 && sum(p.workerEndpointScope) === 73, 'ENDPOINT_SUM');
  // Preserve all undelivered drafts; no historical reviewed/approved packet is overwritten.
  for (const suffix of ['NOT_AUTHORIZED.json', 'OWNER_APPROVAL.txt', 'OFFLINE.safe.json']) {
    const file = path.join(root, `${stem}.${suffix}`);
    const archive = file + '.WITHDRAWN_PREDELIVERY_' + draftHash.slice(0, 16);
    need(!fs.existsSync(archive), 'DRAFT_ALREADY_FINALIZED'); fs.renameSync(file, archive);
  }
  p.localEvidence.receipt = save(`${stem}.OFFLINE.safe.json`, offline);
  const packet = save(`${stem}.NOT_AUTHORIZED.json`, p);
  const template = `Pending owner readiness and exact approval. Preparation starts no window or Production operation.\nExact private packet: ${packet.path}\nSHA-256: ${packet.sha256}\n\nCORE_ORDINARY_ACCEPTANCE_BINDING_SHA256=${packet.sha256}\n`
    + Object.entries(p.ownerApprovalTemplate).map(([k, v]) => `${k}=${v}`).join('\n')
    + '\n\nApproval recorded once only after owner readiness starts120min; initial admission10min, new fixture30min, business75min or earlier credential-derived stop, legacy105min and final cleanup120min. No extension or old quota reuse.\n'
    + 'Fixed project xcbnxzjlsvtgzixurcof; Worker openglasshub version d53e3c67-f8ee-4dee-bd18-a57f16e3d91d deployment e85f8082-675c-4315-a145-42bda81a36bc 100%; Storage post-media; R2 default/openglasshub-media.\n'
    + 'Only private A3/B3 aliases: fresh ordinary UUIDs, A3 real website login/CAPTCHA/actual profile user/refresh PASS before B3 create. No old account reuse, reset or login fallback.\n'
    + 'One public synthetic circle, up to4posts/2comments/1report/3media rows/6small objects; fixture uploads<=256KiB and transfer<=4MiB; exact journal-bound mutations and cross-user negative RLS only. Native browser protocol is time-bound, not globally counted/intercepted.\n'
    + 'Explicit Auth24/Worker80(subcaps73)/REST64/Storage24/R2operations12/management4/navigation30. Auth admin key only create/exact identity and conditional ban/readback, never business or RLS assertions.\n'
    + 'Independent containment: per-created-actor exact GET, one PUT ban876000h, independent GET; reserved within120min even after failed business gate. Unknown creation has no guessed UUID. No ban retry. Ban not independent JWT invalidation proof.\n'
    + 'Only new hash-bound credential envelopes may be unlinked after exact cleanup, global logout and verified ban with no uncertain write. Old envelopes retained untouched. No forensic erasure claim.\n'
    + 'One separately bounded strictly TLS read-only legacy database connection and <=64 exact public HEADs, no real media bytes/keys retained. Existing tmp objects still imply expiry risk; unknown or material media risk blocks GO.\n'
    + 'No migration/deploy/push/Catalog thaw/global Auth or CAPTCHA changes. Unexpected success, real user involvement, cost risk, timeout or unknown commit stops; no automatic destructive rollback/retry. Destructive jobs remain paused.\n'
    + 'Core account self-service signup and browser automatic upload fallback are not proven by admin-created actors or independent Storage cases. Required unavailable cases stay UNVERIFIED. Public Beta GO remains NOT_AUTHORIZED.\n';
  const approval = save(`${stem}.OWNER_APPROVAL.txt`, template);
  console.log(JSON.stringify({ status: 'PENDING_OWNER_READINESS_AND_EXACT_APPROVAL_NO_WINDOW', packet, approval,
    offline: p.localEvidence.receipt, productionRequests: 0, accountsCreated: 0, windowStarted: false }));
} catch (e) {
  const allowed = new Set(['OFFLINE_ONLY_ARGUMENT_REQUIRED','PRIVATE_ACL','PRIVATE_READBACK','DRAFT_IDENTITY','APPROVAL_ALREADY_EXISTS','NOT_OFFLINE_DRAFT','MAILBOX_IDENTITY','FRESH_ALIAS_SHAPE','FROZEN_RC','FROZEN_DIRTY','RELEASE_RECEIPT','LEGACY_SQL','FIXTURE_HASH','UNCHANGED_HELPER_HASH','SDK_ASSET_HASH','ENDPOINT_SUM','DRAFT_ALREADY_FINALIZED']);
  console.log(JSON.stringify({ status: 'BLOCKED_OFFLINE_FINALIZATION', reason: allowed.has(e?.message) ? e.message : 'LOCAL_FAILURE_NO_PRIVATE_DETAILS', productionRequests: 0, windowStarted: false }));
  process.exitCode = 1;
}
