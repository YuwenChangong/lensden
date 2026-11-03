import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ID, GO, GATES, sha } from './authorization.mjs';
import { readPrivateVersion } from '../e-verify-group1-full650-chrome-v11/policy.mjs';
const here = fileURLToPath(new URL('.', import.meta.url)), out = path.join(here, 'artifacts');
const previous = path.resolve(here, '../e-verify-group1-control-v16/artifacts');
const bb = fs.readFileSync(path.join(previous, 'EXECUTION_BINDING.json')), pb = fs.readFileSync(path.join(previous, 'PACKET_NOT_AUTHORIZED.json'));
if (sha(bb) !== 'f85815750899bd5fce1891d2d42c4d653c089c23733bcbabcb60f270ff97f3a8'
  || sha(pb) !== '9f2f31e471a72dd15df252b458004dcd878f3a8480fa0d3d875b65fa067b453e') throw Error('V16_HISTORY_DRIFT');
const old = JSON.parse(bb), original = JSON.parse(pb);
for (const f of old.files) if (sha(fs.readFileSync(f.path)) !== f.sha256) throw Error('PREVIOUS_FROZEN_FILE_DRIFT');
readPrivateVersion(old, original); // Offline value-blind comparison; no private values exported or modified.
const closure = JSON.parse(fs.readFileSync(path.join(previous, 'GO_CLOSURE_SAFE.json')));
if (closure.authorizationConsumed !== true || closure.claimCreated !== true || closure.firstFailure !== 'OBSERVED_UNAPPROVED_REQUEST') throw Error('V16_CONSUMPTION_NOT_PROVEN');
for (const [file, digest] of Object.entries(closure.originalReceiptSha256)) if (sha(fs.readFileSync(path.join(previous, file))) !== digest) throw Error('V16_RECEIPT_DRIFT');
for (const file of ['ONCE.claim', 'CHILD_ONCE.claim']) if (fs.readFileSync(path.join(previous, file), 'utf8') !== original.authorizationId + '\n') throw Error('V16_CLAIM_STATE');
const integrated = path.resolve(here, '../e-verify-group1-origin-integration');
const evidence = JSON.parse(fs.readFileSync(path.join(integrated, 'artifacts/OFFLINE_INTEGRATION_SAFE.json')));
if (evidence.tests.passed !== 13 || evidence.tests.total !== 13 || !evidence.securityBoundaryUnchanged
  || evidence.productionRequests || evidence.thirdPartyLiveRequests || evidence.productionWrites || !evidence.processTreeReaped) throw Error('INTEGRATION_EVIDENCE_INVALID');
for (const f of evidence.files) if (sha(fs.readFileSync(path.join(integrated, f.file))) !== f.sha256) throw Error('INTEGRATION_EVIDENCE_DRIFT');
const contract = fs.readFileSync(path.join(here, 'CONTRACT_NOT_AUTHORIZED.md'));
const oldContract = fs.readFileSync(path.join(previous, 'HUMAN_GROUP1_CONTROL_V16_AUTHORIZATION_NOT_AUTHORIZED.md'), 'utf8');
const thirteen = s => s.slice(s.indexOf('## Thirteen material conditions'), s.indexOf('## ', s.indexOf('## Thirteen material conditions') + 3));
if (!thirteen(oldContract) || thirteen(oldContract) !== thirteen(contract.toString())) throw Error('THIRTEEN_CONDITIONS_CHANGED');
fs.mkdirSync(out, { recursive: true });
const write = (file, data) => fs.writeFileSync(path.join(out, file), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const template = 'HUMAN_GROUP1_PROTECTED_ORIGIN_V17_AUTHORIZATION_NOT_AUTHORIZED.md';
fs.writeFileSync(path.join(out, template), contract, { flag: 'wx' });
const packet = { ...original, authorizationId: ID, format: 'group1-native-manual-protected-origin-v17', independentGo: GO,
  executionEntry: path.join(here, 'entry.mjs'), contractPath: path.join(out, template), contractSha256: sha(contract),
  previousAuthorizationId: original.authorizationId, previousAuthorizationConsumed: true, previousOwnerGatesApplied: false,
  ownerGates: Object.fromEntries(GATES.map(g => [g, null])), authorizedAtUTC: null, authorizationExpiresUTC: null,
  productionAuthorization: 'NOT_AUTHORIZED', claimCreated: false, readiness: 'READY_FOR_OWNER_APPROVAL',
  billingEvidenceReuse: { previousPlanAttestationBytesUnchanged: true, v16NetworkScopeUnchanged: true,
    legacyScopeDigestIsNewAuthorization: false, currentOwnerZeroCostReconfirmation: 'PENDING' },
  protectedOriginPolicy: { collectionRequiresGate: 'protectedOriginCollectionLocalReviewAndCleanupAccepted',
    networkPermissionExpansion: false, rawOriginExportAllowed: false, persistedPrivateFields: ['scheme', 'host', 'port'],
    lifetimeSeconds: 3600, maxOriginsPerProfile: 16, maxProfiles: 6, maxEncryptedOriginsAcrossProfiles: 96,
    cdpCorrelation: 'PARTIAL_CANDIDATES_ONLY', historicalV16Identity: 'UNKNOWN',
    physicalDeletion: 'EXPLICIT_LOCAL_REVIEW_AND_VERIFIED_DESTROY', logicalExpiryIsNotDeletion: true,
    incompleteIndexCleanup: 'OWNER_DIRECTED_LOCAL_ONLY_NO_GUESSED_PATHS',
    localReviewEntry: path.join(here, 'evidence-review.mjs'), localReviewMode: '--review-and-destroy', destroyOnlyMode: '--destroy-only' } };
write('PACKET_NOT_AUTHORIZED.json', packet);
const packetSha256 = sha(fs.readFileSync(path.join(out, 'PACKET_NOT_AUTHORIZED.json')));
const files = new Map(old.files.map(f => [f.path, { ...f }]));
const added = [path.join(previous, 'EXECUTION_BINDING.json'), path.join(previous, 'PACKET_NOT_AUTHORIZED.json'), path.join(previous, 'GO_CLOSURE_SAFE.json'),
  ...Object.keys(closure.originalReceiptSha256).map(f => path.join(previous, f)), path.join(previous, 'ONCE.claim'), path.join(previous, 'CHILD_ONCE.claim'),
  ...fs.readdirSync(here).filter(f => /\.(mjs|md)$/.test(f) || f === '.gitattributes').map(f => path.join(here, f)),
  ...evidence.files.map(f => path.join(integrated, f.file)), path.join(integrated, 'artifacts/OFFLINE_INTEGRATION_SAFE.json'),
  ...['TARGETED_SAFE.json', 'GUARD_CHILD_SAFE.json', 'GUARD_SUPERVISOR_SAFE.json'].map(f => path.join(integrated, evidence.evidenceRoot, f)),
  path.resolve(integrated, '../e-verify-group1-remaining-assets/private-evidence.mjs'),
  path.resolve(integrated, '../e-verify-group1-remaining-assets/protect-evidence.ps1'), path.join(out, template)];
for (const file of added) { const p = file.replaceAll('\\', '/'); files.set(p, { path: p, sha256: sha(fs.readFileSync(file)) }); }
write('EXECUTION_BINDING.json', { ...old, authorizationId: ID, packetSha256, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
  previousBindingSha256: sha(bb), previous305FrozenFilesUnchanged: true, previousAuthorizationConsumed: true, oldAuthorizationReused: false });
const bindingSha256 = sha(fs.readFileSync(path.join(out, 'EXECUTION_BINDING.json')));
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json', { authorizationId: ID, status: 'NOT_AUTHORIZED', fullContractAccepted: false,
  humanGates: packet.ownerGates, authorizedAtUTC: null, authorizationExpiresUTC: null,
  executionBindingSha256: bindingSha256, packetSha256, contractSha256: sha(contract) });
console.log(JSON.stringify({ authorizationId: ID, bindingSha256, packetSha256, contractSha256: sha(contract), boundFiles: files.size,
  ownerApprovalRequired: true, realOriginCollected: false, productionRequests: 0, thirdPartyLiveRequests: 0 }));
