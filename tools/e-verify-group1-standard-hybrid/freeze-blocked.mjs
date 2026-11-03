import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha } from '../e-verify-standard-chrome/authorization.mjs';
import { verifyFrozen } from '../e-verify-standard-chrome/binding.mjs';
import { validatePrivateBinding, requiredCases } from '../e-verify-group1-script-identity/execution/group1/runner.mjs';
import { catalogSteps } from '../e-verify-group1-script-identity/execution/group1/rls.mjs';
const root = path.dirname(fileURLToPath(import.meta.url)), out = path.join(root, 'artifacts'); fs.mkdirSync(out, { recursive: true });
const id = 'e-verify-group1-standard-hybrid-openglasshub-20261014-v12';
const sourcePath = path.resolve(root, '../e-verify-group1-full650-chrome-v11/artifacts/GROUP1_PACKET_NOT_AUTHORIZED.json');
const bindingPath = path.resolve(root, '../e-verify-group1-full650-chrome-v11/artifacts/EXECUTION_BINDING_GROUP1.json');
const original = JSON.parse(fs.readFileSync(sourcePath)), old = JSON.parse(fs.readFileSync(bindingPath));
const privateBytes = fs.readFileSync(old.privateBindingPath); if (sha(privateBytes) !== old.privateBindingSha256) throw Error('PRIVATE_BINDING_DRIFT');
const privateBinding = JSON.parse(privateBytes); validatePrivateBinding(privateBinding);
if (JSON.stringify(privateBinding.budget) !== JSON.stringify(original.ownerBudgets) || JSON.stringify(requiredCases) !== JSON.stringify(original.requiredCases)
  || JSON.stringify(catalogSteps()) !== JSON.stringify(original.catalogRestRequests)) throw Error('EXISTING_SCOPE_DRIFT');
const standard = verifyFrozen(path.resolve(root, '../e-verify-standard-chrome/artifacts'));
const exceptionPath = path.resolve(root, '../e-verify-standard-chrome/artifacts/OWNER_SINGLE_EXECUTION_EVIDENCE_EXCEPTION_ACCEPTANCE_SAFE.json');
const accepted = JSON.parse(fs.readFileSync(exceptionPath));
if (accepted.isolatedTurnstileAcceptance !== 'ACCEPTED_WITH_DOCUMENTED_EXCEPTION') throw Error('ISOLATED_ACCEPTANCE_REQUIRED');
const matrixPath = 'C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/MANDATORY_ACCEPTANCE_MATRIX.json';
const matrix = JSON.parse(fs.readFileSync(matrixPath));
const mapping = original.requiredCases.map(id => {
  const c = matrix.cases.find(x => x.id === id.split(':')[0]); if (!c) throw Error('ORIGINAL_CASE_NOT_FOUND');
  return { caseId: id, originalCase: c.case, actors: id.startsWith('AUTH-03') ? ['B'] : id.startsWith('AUTH-04') ? ['ADMIN'] : ['A', 'B', 'ADMIN'],
    executionPaths: id.startsWith('RLS-') ? ['PRIVATE_FIXED_GET_READER'] : id.startsWith('AUTH-') ? ['NATIVE_BROWSER_MANUAL', 'CONTROLLED_AUTH_POST_PENDING_INTEGRATION'] : ['NATIVE_BROWSER_MANUAL', 'IDENTITY_VERIFIED_READ_ASSERTIONS'],
    requiredEvidence: ['exact-original-expectation', 'safe-case-id', 'private-identity-match-boolean', 'actor-context-isolation', 'observed-status-not-assumed', 'cleanup-result'],
    liveStatus: 'NOT_EXECUTED', readiness: 'MAPPED_NOT_FULL_RUNNER_READY' };
});
const gates = ['subsetBoundary2AndResidualCasesAccepted', 'authSecurityLogSideEffectsAccepted', 'manualTurnstileAndPrivateIdentityReady',
  'catalogHoldAndPostHardeningRecoveryAccepted', 'operatorAvailableForEntireValidity',
  'standardBrowserCredentialRiskAndBudgetBoundaryAccepted', 'privateSessionHandoffAndControlledAuthTransportAccepted'];
const contractPath = path.join(root, 'CONTRACT_PENDING_BOUNDARY_DECISION.md');
const packet = { format: 'group1-standard-hybrid-blocked-design-packet-v1', authorizationId: id, status: 'BLOCKED_NOT_EXECUTABLE',
  firstBlocker: 'NATIVE_FIRST_PARTY_AUTH_STAGE_AND_PREDISPATCH_ADAPTER_NOT_VERIFIED', executionEntry: null, independentGo: null,
  productionAuthorization: 'NOT_AUTHORIZED', sourceSha: original.sourceSha, expectedProductionVersion: original.expectedProductionVersion,
  appOrigin: original.appOrigin, supabaseOrigin: original.supabaseOrigin, worker: original.worker, approvalBoundary: original.approvalBoundary,
  caseMappings: mapping, catalogRestRequests: original.catalogRestRequests, rlsRoleCounts: { anon: 6, A: 5, B: 5 },
  actors: original.actors, loginActions: original.loginActions, applicationPages: original.applicationPages,
  pageContentAssertions: original.pageContentAssertions, adminGet: original.adminGet, ownBackgroundGet: original.ownBackgroundGet,
  ownerBudgets: original.ownerBudgets, otherBudgetsChanged: false, budgetSemanticsNotAutomaticallyInherited: true,
  productionVersionCheck: 'FRESH_PRE_AND_POST_REQUIRED_NOT_CURRENTLY_VERIFIED', providerDeploymentGetMax: 2,
  executionLimitSeconds: 1800, workLimitSeconds: 1740, cleanupReserveSeconds: 60,
  oauthRemainingSecondsStrictlyGreaterThan: 1860, oauthScopes: ['account:read', 'workers_scripts:write'],
  browserBoundary: 'MONITOR_ONLY', authRlsBoundary: 'HARD_FOR_FIXED_NODE_GET_ONLY_BROWSER_AUTH_NOT_READY',
  sessionHandoff: 'VERIFIED_OFFLINE_HELPER_NOT_COMPLETE_NATIVE_PRODUCTION_ADAPTER',
  isolatedAcceptance: accepted.isolatedTurnstileAcceptance, originalIsolatedExecution: 'INCOMPLETE',
  productionCaptchaAcceptance: 'NOT_EXECUTED', privateBindingSha256: old.privateBindingSha256, privateValuesInPacket: false,
  contractSha256: sha(fs.readFileSync(contractPath)), humanGates: Object.fromEntries(gates.map(k => [k, null])),
  authorizedAtUTC: null, authorizationExpiresUTC: null, claimCreated: false, goIssued: false,
  maxAdditionalCostUSD: 0, catalogHold: 'ACTIVE', group1: 'BLOCKED_UNTIL_REAL_ACCEPTANCE', group2: 'NOT_AUTHORIZED', group3: 'NOT_AUTHORIZED', publicBetaGo: 'NOT_AUTHORIZED' };
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
write('PACKET_OFFLINE_BLOCKED.json', packet);
const files = new Map(standard.binding.files.map(f => [f.path, f]));
const handoff = path.join(out, 'handoff-1791970258127');
const add = [sourcePath, bindingPath, matrixPath, old.privateBindingPath, exceptionPath, contractPath,
  path.resolve(root, '../e-verify-group1-script-identity/execution/identity-rls.mjs'), path.resolve(root, '../e-verify-group1-script-identity/execution/group1/rls.mjs'),
  path.resolve(root, '../e-verify-group1-v9-closure/gate.mjs'), path.resolve(root, '../e-verify-group1-script-binding/execution/wire.mjs'),
  ...fs.readdirSync(root).filter(n => n.endsWith('.mjs')).map(n => path.join(root, n)),
  path.join(handoff, 'HANDOFF_SAFE.json'), path.join(handoff, 'SUPERVISOR_SAFE.json')];
for (const p of add) { const key = p.replaceAll('\\', '/'); files.set(key, { path: key, sha256: sha(fs.readFileSync(p)) }); }
const packetHash = sha(fs.readFileSync(path.join(out, 'PACKET_OFFLINE_BLOCKED.json')));
const binding = { format: 'group1-standard-hybrid-offline-binding-v1', status: 'BLOCKED_NOT_EXECUTABLE', authorizationId: id,
  packetSha256: packetHash, nodePath: process.execPath, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), oldAuthorizationReused: false };
write('EXECUTION_BINDING_OFFLINE_BLOCKED.json', binding);
console.log(JSON.stringify({ status: 'BLOCKED_NOT_EXECUTABLE', authorizationId: id, bindingHash: sha(fs.readFileSync(path.join(out, 'EXECUTION_BINDING_OFFLINE_BLOCKED.json'))),
  packetHash, cases: mapping.length, rlsSteps: packet.catalogRestRequests.length, boundFiles: binding.files.length }));
