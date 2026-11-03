import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ID, GO, GATES, sha } from './authorization.mjs';
import { readPrivateVersion } from '../e-verify-group1-full650-chrome-v11/policy.mjs';
const here = fileURLToPath(new URL('.', import.meta.url)), out = path.join(here, 'artifacts');
const previous = path.resolve(here, '../e-verify-group1-protected-origin-v17/artifacts');
const bb = fs.readFileSync(path.join(previous, 'EXECUTION_BINDING.json')), pb = fs.readFileSync(path.join(previous, 'PACKET_NOT_AUTHORIZED.json'));
if (sha(bb) !== '5af796fc6f5749b660ed11b214733384e58b20ce521fbf98eac17e151ada3c60'
  || sha(pb) !== 'f776ea658e0d4556f18f8f4d193f6275271298769addb83c746a719b27ef668a') throw Error('V17_HISTORY_DRIFT');
const old = JSON.parse(bb), original = JSON.parse(pb);
for (const f of old.files) if (sha(fs.readFileSync(f.path)) !== f.sha256) throw Error('PREVIOUS_FROZEN_FILE_DRIFT');
readPrivateVersion(old, original);
const closure = JSON.parse(fs.readFileSync(path.join(previous, 'GO_CLOSURE_SAFE.json')));
if (closure.authorizationConsumed !== true || closure.claimCreated !== true || closure.privateEvidenceCleanup !== 'PASS_VERIFIED_PHYSICAL_DIRECTORY_REMOVAL') throw Error('V17_CLOSURE_INVALID');
for (const [file, digest] of Object.entries(closure.originalReceiptSha256)) if (sha(fs.readFileSync(path.join(previous, file))) !== digest) throw Error('V17_RECEIPT_DRIFT');
const contract = fs.readFileSync(path.join(here, 'CONTRACT_NOT_AUTHORIZED.md'));
const write = (file, data) => fs.writeFileSync(path.join(out, file), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
fs.mkdirSync(out, { recursive: true });
const template = 'HUMAN_GROUP1_FAST_TRACK_V18_AUTHORIZATION_NOT_AUTHORIZED.md';
fs.writeFileSync(path.join(out, template), contract, { flag: 'wx' });
const { protectedOriginPolicy, ...base } = original;
const packet = { ...base, authorizationId: ID, format: 'group1-native-manual-fast-track-v18', independentGo: GO,
  executionEntry: path.join(here, 'entry.mjs'), contractPath: path.join(out, template), contractSha256: sha(contract),
  previousAuthorizationId: original.authorizationId, previousAuthorizationConsumed: true, previousOwnerGatesApplied: false,
  ownerGates: Object.fromEntries(GATES.map(g => [g, null])), authorizedAtUTC: null, authorizationExpiresUTC: null,
  productionAuthorization: 'NOT_AUTHORIZED', claimCreated: false, readiness: 'READY_FOR_OWNER_APPROVAL',
  fastTrackPolicy: { browserBoundary: 'MONITOR_ONLY', nodeScopeExpanded: false, browserStopPolicyRelaxed: true,
    eligibleUnenumeratedGetStages: ['LOGIN_<actor>', 'LANDING_<actor>', 'LOGOUT_<actor>', 'NEGATIVE_CAPTCHA', 'NEGATIVE_MISSING_CAPTCHA', 'NEGATIVE_PASSWORD'],
    eligibleTypes: ['fetch', 'xhr', 'script', 'stylesheet', 'document'], mainFrameNavigationAllowed: false,
    unknownOriginIsTrusted: false, completeTurnstileInitiatorAttributionClaimed: false,
    unknownGetUsesExistingVendor40SoftCap: true, wholeBrowserHardCapClaimed: false,
    exactPrivateOriginCollection: false, unknownExternalNonGetStops: true, knownSensitiveRequestsStop: true,
    fullBrowserCredentialLeakPreventionGuaranteed: false, wholeBrowserBillingHardCapGuaranteed: false,
    paidUsageAuthorized: false, overageRiskConsent: false, zeroCostOwnerGate: 'currentZeroCostFreeServicesAndUnmeteredNetworkConfirmed',
    newRiskGate: 'nativeUnenumeratedThirdPartyGetRiskAndStopRulesAccepted' } };
write('PACKET_NOT_AUTHORIZED.json', packet); const packetSha256 = sha(fs.readFileSync(path.join(out, 'PACKET_NOT_AUTHORIZED.json')));
const files = new Map(old.files.map(f => [f.path, { ...f }]));
const added = [path.join(previous, 'EXECUTION_BINDING.json'), path.join(previous, 'PACKET_NOT_AUTHORIZED.json'), path.join(previous, 'GO_CLOSURE_SAFE.json'),
  ...Object.keys(closure.originalReceiptSha256).map(n => path.join(previous, n)),
  ...fs.readdirSync(here).filter(n => /\.(mjs|md)$/.test(n) || n === '.gitattributes').map(n => path.join(here, n)), path.join(out, template)];
for (const file of added) { const p = file.replaceAll('\\', '/'); files.set(p, { path: p, sha256: sha(fs.readFileSync(file)) }); }
write('EXECUTION_BINDING.json', { ...old, authorizationId: ID, packetSha256, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
  previousBindingSha256: sha(bb), previous340FrozenFilesUnchanged: true, previousAuthorizationConsumed: true, oldAuthorizationReused: false });
const bindingSha256 = sha(fs.readFileSync(path.join(out, 'EXECUTION_BINDING.json')));
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json', { authorizationId: ID, status: 'NOT_AUTHORIZED', fullContractAccepted: false,
  humanGates: packet.ownerGates, authorizedAtUTC: null, authorizationExpiresUTC: null,
  executionBindingSha256: bindingSha256, packetSha256, contractSha256: sha(contract) });
console.log(JSON.stringify({ authorizationId: ID, bindingSha256, packetSha256, contractSha256: sha(contract), frozenFiles: files.size,
  productionRequests: 0, thirdPartyLiveRequests: 0, ownerApprovalRequired: true }));
