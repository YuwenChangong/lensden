import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFrozen as verifyOld } from '../e-verify-native-manual-fresh-v2/binding.mjs';
import { ID, GO, GATES, sha } from './authorization.mjs';
const root = path.dirname(fileURLToPath(import.meta.url)), d = path.join(root, 'artifacts');
fs.mkdirSync(d, { recursive: true });
const testRun = process.argv[2];
if (!/^offline-\d+$/.test(testRun || '')) throw Error('EXACT_OFFLINE_EVIDENCE_REQUIRED');
const testFiles = [];
for (const mode of ['success', 'no-callback', 'abort', 'idle', 'unknown', 'sdk-error']) {
  const rPath = path.join(d, testRun, mode + '.json'), sPath = path.join(d, testRun, mode + '-supervisor.json');
  const r = JSON.parse(fs.readFileSync(rPath)), s = JSON.parse(fs.readFileSync(sPath));
  if (r.fixtureOnly !== true || r.cleanupStatus !== 'PASS' || !r.profileRemoved || r.thirdPartyLiveRequests !== 0
    || s.classification !== 'EXIT_ZERO' || !s.reaped || !s.containment.closed) throw Error('OFFLINE_EVIDENCE_INVALID');
  if (mode === 'success' && r.outcome !== 'ISOLATED_OBSERVATION_COMPLETE' || mode === 'no-callback' && r.outcome !== 'INCOMPLETE') throw Error('OFFLINE_OUTCOME_INVALID');
  testFiles.push(rPath, sPath);
}
const old = verifyOld(path.resolve(root, '../e-verify-native-manual-fresh-v2/artifacts'));
if (old.bindingHash !== 'a42e0fadf2cb291c83680ab4417ba5a2022b1489a5cc09ca907b9367feb9ff31') throw Error('OLD_FREEZE_DRIFT');
const contract = fs.readFileSync(path.join(root, 'CONTRACT_NOT_AUTHORIZED.md'));
const connectionEvidence = path.resolve(root, '../e-verify-native-manual-fresh-v2/artifacts/OWNER_HUMAN_CONFIRMATION_PENDING_WINDOW_SAFE.json');
const packet = { format: 'standard-chrome-isolated-packet-v1', authorizationId: ID, status: 'PENDING_OWNER_APPROVAL',
  liveRequestsAuthorized: false, networkBoundary: 'MONITOR_ONLY', workerPreDispatchControl: false,
  hardNetworkCap: false, hardByteCap: false, allNetworkRequestsObservable: false,
  officialTestSitekey: '1x00000000000000000000AA', initialSdk: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
  intendedOrigin: 'https://challenges.cloudflare.com:443', firstParty: 'CURRENT_LOOPBACK_HARNESS_ONLY',
  capabilityGlobalsUntampered: ['Worker', 'SharedWorker', 'EventSource', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport'],
  noTransportSuppressionFlags: ['--disable-quic', '--disable-features=WebTransport', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
  serviceWorkerPolicy: 'BLOCK_RETAINED', observerVendorSoftStop: 40, observerTargetSoftStop: 650,
  hardDeadlineSeconds: 600, childWorkSeconds: 520, supervisorWorkSeconds: 540, cleanupReserveSeconds: 60,
  minimumStartWindowRemainingStrictlyGreaterThanSeconds: 610, maxAuthorizationValiditySeconds: 3600,
  maxAdditionalCostUSD: 0, freeProviderEvidence: 'REUSE_EXISTING_OWNER_ATTESTED_FREE_TURNSTILE',
  connectionEvidence: 'REUSE_PRIOR_OWNER_NO_INCREMENTAL_COST_FACTS_RECONFIRM_IN_NEW_GATE',
  connectionEvidenceSha256: sha(fs.readFileSync(connectionEvidence)), contractSha256: sha(contract),
  targetedOfflineTests: '11/11_PASS_NOT_VENDOR_SUCCESS', offlineEvidenceDirectory: testRun,
  ownerMustStartOnce: true, completeRequires: ['Start', 'SDK', 'render', 'Frame', 'callback', 'ownerVisibility', 'ownerInteractionChoice', 'Finish', 'cleanup', 'profileRemoved', 'nativeJobDrain'],
  callbackMissing: 'INCOMPLETE_UNLESS_ERROR_OR_STOP', vendorCompatibilityGuaranteed: false,
  independentGo: GO, humanGates: Object.fromEntries(GATES.map(k => [k, null])), authorizedAtUTC: null, authorizationExpiresUTC: null,
  oldAuthorizationReused: false, oldEvidenceReusedNotRerun: ['27_NATIVE_OFFLINE', '8_CAPABILITY_OFFLINE', '5_WORKER_FEASIBILITY_BLOCKED'],
  authAuthorized: false, rlsAuthorized: false, siteverifyAuthorized: false, productionAuthorized: false,
  group1: 'BLOCKED', group2: 'NOT_AUTHORIZED', group3: 'NOT_AUTHORIZED', catalogHold: 'ACTIVE', publicBetaGo: 'NOT_AUTHORIZED' };
const write = (name, value) => fs.writeFileSync(path.join(d, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
write('PACKET_NOT_AUTHORIZED.json', packet);
const packetHash = sha(fs.readFileSync(path.join(d, 'PACKET_NOT_AUTHORIZED.json')));
const files = new Map(old.binding.files.map(f => [f.path, f]));
for (const p of [connectionEvidence, ...testFiles, ...fs.readdirSync(root).filter(n => /\.(?:mjs|md)$/.test(n)).map(n => path.join(root, n))]) {
  const key = p.replaceAll('\\', '/'); files.set(key, { path: key, sha256: sha(fs.readFileSync(p)) });
}
const binding = { format: 'standard-chrome-binding-v1', authorizationId: ID, nodePath: process.execPath,
  packetSha256: packetHash, previousFrozenBindingSha256: old.bindingHash, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) };
write('EXECUTION_BINDING.json', binding);
const bindingHash = sha(fs.readFileSync(path.join(d, 'EXECUTION_BINDING.json')));
const pending = { format: 'standard-chrome-manual-authorization-v1', authorizationId: ID, executionBindingSha256: bindingHash,
  packetSha256: packetHash, authorizedAtUTC: null, authorizationExpiresUTC: null, humanGates: packet.humanGates };
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json', pending);
write('HUMAN_STANDARD_CHROME_AUTHORIZATION_NOT_AUTHORIZED.md', `# Pending standard Chrome isolated acceptance\n\nAuthorization ID: ${ID}\nExecution Binding SHA256: ${bindingHash}\nPacket SHA256: ${packetHash}\nContract SHA256: ${sha(contract)}\n\n${contract.toString()}\n\n\`\`\`json\n${JSON.stringify(pending, null, 2)}\n\`\`\`\n`);
write('FREEZE_SAFE.json', { authorizationId: ID, bindingHash, packetHash, contractSha256: sha(contract),
  templateSha256: sha(fs.readFileSync(path.join(d, 'HUMAN_STANDARD_CHROME_AUTHORIZATION_NOT_AUTHORIZED.md'))), boundFiles: binding.files.length,
  humanGates: '6_PENDING', utcWindow: null, claimCreated: false, goIssued: false, liveRequestsAuthorized: false,
  productionRequests: 0, productionWrites: 0, thirdPartyLiveRequests: 0 });
console.log(JSON.stringify({ authorizationId: ID, bindingHash, packetHash, boundFiles: binding.files.length }));
