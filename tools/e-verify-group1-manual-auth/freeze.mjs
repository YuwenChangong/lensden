import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ID, GO, GATES, sha } from './authorization.mjs';
import { readPrivateVersion } from '../e-verify-group1-full650-chrome-v11/policy.mjs';
const root = path.dirname(fileURLToPath(import.meta.url)), out = path.join(root, 'artifacts'); fs.mkdirSync(out, { recursive: true });
const previousPath = path.resolve(root, '../e-verify-group1-auth-integration/artifacts/EXECUTION_BINDING_OFFLINE_BLOCKED.json');
const previous = JSON.parse(fs.readFileSync(previousPath));
if (sha(fs.readFileSync(previousPath)) !== '02801f0f62a0434d44d435a3315a935f092bd266c2b3923f5a1c81bc14701158') throw Error('OLD_BINDING_DRIFT');
for (const f of previous.files) if (sha(fs.readFileSync(f.path)) !== f.sha256) throw Error('OLD_FROZEN_FILE_DRIFT');
const oldPacketPath = path.resolve(root, '../e-verify-group1-full650-chrome-v11/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json');
const oldBindingPath = path.resolve(root, '../e-verify-group1-full650-chrome-v11/artifacts/EXECUTION_BINDING_GROUP1.json');
const original = JSON.parse(fs.readFileSync(oldPacketPath)), old = JSON.parse(fs.readFileSync(oldBindingPath));
const privateBinding = readPrivateVersion(old, original);
const matrixPath = 'C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/MANDATORY_ACCEPTANCE_MATRIX.json';
const matrix = JSON.parse(fs.readFileSync(matrixPath));
const flowFolder = path.join(out, process.argv[2]), flow = JSON.parse(fs.readFileSync(path.join(flowFolder, 'FLOW_SAFE.json')));
const supervisor = JSON.parse(fs.readFileSync(path.join(flowFolder, 'SUPERVISOR_SAFE.json')));
if (flow.result.status !== 'PASS' || flow.result.catalogCasesPassed !== 16 || flow.result.identitiesVerified !== 3 || flow.result.negativeAuthPassed !== 3
  || !flow.readersDestroyed || !supervisor.reaped || !supervisor.containment.closed || flow.productionRequests || flow.thirdPartyLiveRequests) throw Error('AFFECTED_FLOW_NOT_VERIFIED');
const write = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const contract = fs.readFileSync(path.join(root, 'CONTRACT_NOT_AUTHORIZED.md'));
fs.writeFileSync(path.join(out, 'HUMAN_GROUP1_NATIVE_MANUAL_AUTH_NOT_AUTHORIZED.md'), contract, { flag: 'wx' });
const packet = { ...original, authorizationId: ID, format: 'group1-native-manual-auth-packet-v14', readiness: 'READY_FOR_OWNER_APPROVAL',
  productionAuthorization: 'NOT_AUTHORIZED', independentGo: GO, executionEntry: path.join(root, 'entry.mjs'),
  ownerBudgets: privateBinding.budget, otherBudgetsChanged: false, contractSha256: sha(contract),
  browserNetworkBoundary: 'MONITOR_ONLY', authTransport: 'NATIVE_CHROME_NOT_NODE_MEDIATED',
  wholeBrowser650HardLimit: false, wholeBrowserAuth40HardLimit: false, wholeBrowserVendor40HardLimit: false,
  nodeReadBoundary: 'HARD_FIXED_GET_PRE_DISPATCH', nodeRetries: 0, nodeRedirects: 0,
  nativeRetryAndRedirectCount: 'UNKNOWN_FOR_UNOBSERVED_CHANNELS', nativeHardControlsInherited: false,
  serverAuthControls: { clientSource: 'VERIFIED_OFFLINE', actualProductionCaptcha: 'NOT_VERIFIED', actualRateLimits: 'UNKNOWN',
    actualSessionTtlRotationRevocation: 'UNKNOWN', noProductionConfigurationChanged: true },
  sessionHandoff: 'REGISTERED_SAME_ORIGIN_SDK_STORAGE_MINIMAL_PROCESS_MEMORY_SNAPSHOT', nodeRefreshTokenRetained: false,
  sdkStorageKeyDerivation: 'sb-<fixed-supabase-host-first-label>-auth-token', noRawEvidenceExport: true,
  isolatedTurnstileAcceptance: 'ACCEPTED_WITH_DOCUMENTED_EXCEPTION', originalIsolatedReceiptStatus: 'INCOMPLETE', productionCaptchaAcceptance: 'NOT_EXECUTED',
  caseMappings: original.requiredCases.map(caseId => ({ caseId, originalCase: matrix.cases.find(c => c.id === caseId.split(':')[0]).case,
    executionPaths: ['ORIGINAL_ORDERED_MANUAL_BROWSER_DRIVER', 'PRIVATE_FIXED_NODE_IDENTITY_RLS_OR_ADMIN_READ'], status: 'EXECUTABLE_SCOPED_NOT_PRODUCTION_VERIFIED' })),
  controlledReadPlan: { identityGet: 3, profileGet: 3, originalRlsGet: 16, adminGet: 6, prePostDeploymentGet: 2, total: 30 },
  iconPaths: ['/gaze-icon-v6.ico', '/gaze-icon-v6.svg', '/gaze-icon-32-v6.png', '/apple-touch-icon-v6.png'],
  ownerGates: Object.fromEntries(GATES.map(g => [g, null])), authorizedAtUTC: null, authorizationExpiresUTC: null, claimCreated: false,
  approvedNativeBoundaryDifferences: 'PENDING_OWNER_FULL_CONTRACT_APPROVAL', scopedUiIsNotFullVisualAcceptance: true,
  observationEvidenceDoesNotGuaranteeProductionCompletion: true, noCostsAcceptedBeyondZero: true,
  freePlanEvidenceStatus: 'REUSE_OWNER_ATTESTED_PROVIDER_DOCUMENTED_FREE_ONLY_NOT_NEW_CONSOLE_READ',
  scriptBytesBeforeExecutionHardValidationInherited: false, profileIsolation: 'SIX_NEW_PROFILES_AND_INCOGNITO_CONTEXTS',
  humanAuthenticationActions: 'THREE_POSITIVE_THREE_NEGATIVE_THREE_GLOBAL_LOGOUT_ZERO_MANUAL_RETRIES',
  originalNativeTurnstileCapabilityIsNotHardEnforced: true };
// Retain historical scope fields as reference, never let old hard-policy prose describe this native outlet.
packet.previousHardTurnstileCapability = packet.turnstileCapability;
packet.turnstileCapability = { type: 'NATIVE_VENDOR_MONITOR_ONLY', host: 'challenges.cloudflare.com', observationCap: 40, hiddenChannels: 'UNKNOWN' };
packet.previousSideEffects = packet.sideEffects;
packet.sideEffects = ['Auth sessions/security/rate-limit/vendor cookies/logs persist; global logout affects other sessions of the same bound account.',
  'Native dispatch/retry/redirect can precede observation; soft stop does not undo requests; no new business/mail authority.',
  'Browser instrumentation/opaque channels and trusted-host private-memory risks require independent owner acceptance.'];
packet.proposedContractChanges = ['Native Auth and browser traffic MONITOR_ONLY instead of whole-browser hard interception; same cap numbers.',
  'Native vendor URL/redirect/retry observation instead of hard path/byte/pre-evaluation control; unknown background coverage disclosed.',
  'Exact registered SDK storage memory snapshot replaces post-navigation response-body capture; refresh token never returned.',
  'Native CORS preflight observation within existing Auth/global counts; SDK/cookie/CORS/server controls not bypassed.',
  'Nine fresh owner gates, backend settings UNKNOWN until live safety tests, no valid CAPTCHA fabrication.',
  'Node identity/RLS/admin read GET remains hard; no new business/mail/media/SQL/configuration authority.'];
packet.previousFreePlanScopeSha256 = packet.freePlanScopeSha256;
packet.freePlanScopeSha256 = sha(Buffer.from(JSON.stringify({ serviceOrigins: [packet.appOrigin, packet.supabaseOrigin, 'https://challenges.cloudflare.com'],
  scope: packet.requiredCases, budgets: packet.ownerBudgets, boundary: 'NATIVE_MONITOR_ONLY_AND_FIXED_NODE_GET', cost: 0 })));
packet.freePlanScopeDigestMeaning = 'NEW_SCOPE_BINDING_DIGEST_NOT_A_NEW_PROVIDER_BILLING_VERIFICATION';
write('PACKET_NOT_AUTHORIZED.json', packet);
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json', { authorizationId: ID, status: 'NOT_AUTHORIZED', fullContractAccepted: false,
  humanGates: Object.fromEntries(GATES.map(g => [g, null])), authorizedAtUTC: null, authorizationExpiresUTC: null,
  packetSha256: sha(fs.readFileSync(path.join(out, 'PACKET_NOT_AUTHORIZED.json'))), executionBindingSha256: null, contractSha256: sha(contract) });
const files = new Map(previous.files.map(f => [f.path, f]));
const add = [previousPath, oldPacketPath, oldBindingPath, matrixPath, ...fs.readdirSync(root).filter(x => /\.(?:mjs|md)$/.test(x)).map(x => path.join(root, x)),
  path.join(flowFolder, 'FLOW_SAFE.json'), path.join(flowFolder, 'SUPERVISOR_SAFE.json'), path.join(out, 'HUMAN_GROUP1_NATIVE_MANUAL_AUTH_NOT_AUTHORIZED.md'),
  path.resolve(root, '../../node_modules/@supabase/supabase-js/src/SupabaseClient.ts')];
for (const file of add) { const p = file.replaceAll('\\', '/'); files.set(p, { path: p, sha256: sha(fs.readFileSync(file)) }); }
write('EXECUTION_BINDING.json', { authorizationId: ID, packetSha256: sha(fs.readFileSync(path.join(out, 'PACKET_NOT_AUTHORIZED.json'))),
  sourceRoot: old.sourceRoot, nodePath: process.execPath, privateBindingPath: old.privateBindingPath, privateBindingSha256: old.privateBindingSha256,
  files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), readyButNotAuthorized: true, oldAuthorizationReused: false });
console.log(JSON.stringify({ authorizationId: ID, bindingSha256: sha(fs.readFileSync(path.join(out, 'EXECUTION_BINDING.json'))),
  packetSha256: sha(fs.readFileSync(path.join(out, 'PACKET_NOT_AUTHORIZED.json'))), contractSha256: sha(contract), boundFiles: files.size, gates: GATES.length,
  otherBudgetsChanged: false, productionRequests: 0, productionWrites: 0, thirdPartyLiveRequests: 0 }));
