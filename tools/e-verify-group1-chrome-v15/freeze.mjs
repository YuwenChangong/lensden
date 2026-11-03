import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ID, GO, GATES, sha } from './authorization.mjs';
import { CHROME, CHROME_SHA256, verifyExecutable } from './chrome-identity.mjs';
import { readPrivateVersion } from '../e-verify-group1-full650-chrome-v11/policy.mjs';
const here = fileURLToPath(new URL('.', import.meta.url)), out = path.join(here, 'artifacts');
const oldRoot = path.resolve(here, '../e-verify-group1-manual-auth/artifacts');
const oldBindingBytes = fs.readFileSync(path.join(oldRoot, 'EXECUTION_BINDING.json'));
const oldPacketBytes = fs.readFileSync(path.join(oldRoot, 'PACKET_NOT_AUTHORIZED.json'));
if (sha(oldBindingBytes) !== '0f6d87fa9d6872988ddcefeceed642a7320e5f36d2da2d60b3cfad2987480f8b'
  || sha(oldPacketBytes) !== 'f8ff67e51ad73cd84a5abb4d3841036b51101fbbfceb86885b7ac007e1c428fc') throw Error('V14_BASELINE_DRIFT');
const old = JSON.parse(oldBindingBytes), original = JSON.parse(oldPacketBytes);
if (old.files.length !== 266 || old.files.filter(f => f.path === CHROME).length !== 1) throw Error('V14_FILE_COUNT_CHANGED');
for (const f of old.files) if (f.path !== CHROME && sha(fs.readFileSync(f.path)) !== f.sha256) throw Error('OTHER_265_BINDINGS_CHANGED');
verifyExecutable(); readPrivateVersion(old, original);
const evidence = JSON.parse(fs.readFileSync(path.join(out, 'CHROME_PROVENANCE_SAFE.json')));
if (evidence.signatureStatus !== 'Valid' || evidence.publisher !== 'Google LLC' || evidence.sha256 !== CHROME_SHA256) throw Error('CHROME_PROVENANCE_MISSING');
const candidates = fs.readdirSync(out).filter(x => /^CHROME_TARGETED_SAFE_\d+\.json$/.test(x)).map(x => ({ name: x, data: JSON.parse(fs.readFileSync(path.join(out, x))) }));
const passed = candidates.find(x => x.data.results.length === 3 && x.data.results.every(r => r.chromeHashStable && r.profileDeleted && r.receipt.closed)
  && x.data.results[0].receipt.firstFailure === null && x.data.results[1].receipt.firstFailure === 'OBSERVED_UNAPPROVED_REQUEST'
  && x.data.results[2].receipt.firstFailure === 'WORK_DEADLINE');
if (!passed) throw Error('CHROME_TARGETED_EVIDENCE_MISSING');
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const contract = fs.readFileSync(path.join(here, 'CONTRACT_NOT_AUTHORIZED.md'));
fs.writeFileSync(path.join(out, 'HUMAN_GROUP1_CHROME_V15_AUTHORIZATION_NOT_AUTHORIZED.md'), contract, { flag: 'wx' });
const packet = { ...original, authorizationId: ID, format: 'group1-native-manual-auth-chrome-v15', independentGo: GO,
  executionEntry: path.join(here, 'entry.mjs'), contractSha256: sha(contract),
  ownerGates: Object.fromEntries(GATES.map(g => [g, null])), authorizedAtUTC: null, authorizationExpiresUTC: null,
  productionAuthorization: 'NOT_AUTHORIZED', claimCreated: false, readiness: 'READY_FOR_OWNER_APPROVAL',
  chromeIdentity: { path: CHROME, version: evidence.version, sha256: CHROME_SHA256, publisher: evidence.publisher,
    beforeAfterLaunchCheck: true, futureUpdatesImpossible: false },
  previousAuthorizationId: original.authorizationId, previousOwnerGatesApplied: false };
write('PACKET_NOT_AUTHORIZED.json', packet);
const packetSha256 = sha(fs.readFileSync(path.join(out, 'PACKET_NOT_AUTHORIZED.json')));
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json', { authorizationId: ID, status: 'NOT_AUTHORIZED', fullContractAccepted: false,
  humanGates: packet.ownerGates, authorizedAtUTC: null, authorizationExpiresUTC: null,
  executionBindingSha256: null, packetSha256, contractSha256: sha(contract) });
const files = new Map(old.files.map(f => [f.path, { ...f, ...(f.path === CHROME ? { sha256: CHROME_SHA256 } : {}) }]));
const add = [path.join(oldRoot, 'EXECUTION_BINDING.json'), path.join(oldRoot, 'PACKET_NOT_AUTHORIZED.json'),
  ...fs.readdirSync(here).filter(n => /\.(mjs|md)$/.test(n)).map(n => path.join(here, n)),
  path.join(out, 'CHROME_PROVENANCE_SAFE.json'), path.join(out, passed.name), path.join(out, 'HUMAN_GROUP1_CHROME_V15_AUTHORIZATION_NOT_AUTHORIZED.md')];
for (const f of add) { const p = f.replaceAll('\\', '/'); files.set(p, { path: p, sha256: sha(fs.readFileSync(f)) }); }
write('EXECUTION_BINDING.json', { ...old, authorizationId: ID, packetSha256,
  files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
  previousBindingSha256: sha(oldBindingBytes), other265BindingsUnchanged: true, chromeIdentity: packet.chromeIdentity });
const bindingSha256 = sha(fs.readFileSync(path.join(out, 'EXECUTION_BINDING.json')));
const changes = Object.keys(packet).filter(k => JSON.stringify(packet[k]) !== JSON.stringify(original[k]));
write('V14_TO_V15_DIFFERENCE_SAFE.json', { previousAuthorizationId: original.authorizationId, authorizationId: ID,
  packetChangedFields: changes, materialPermissionsBudgetsCasesSessionPrivacyDifferences: 'NONE',
  technicalDifference: 'Signed Chrome identity and per-launch before/after hash checks; fresh ID, entry, contract identity and hashes.',
  previous265HashesUnchanged: true, oldOwnerConfirmationsMigrated: false, ownerReconfirmationRequired: true,
  targetedTests: '3/3_REAL_CHROME_PLUS_2/2_IDENTITY_DRIFT', bindingSha256, packetSha256, contractSha256: sha(contract),
  frozenFiles: files.size, productionRequests: 0, thirdPartyLiveRequests: 0, catalogHold: 'ACTIVE' });
console.log(JSON.stringify({ authorizationId: ID, bindingSha256, packetSha256, contractSha256: sha(contract), files: files.size, changes }));
