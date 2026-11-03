import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url)), out = path.join(root, 'artifacts');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const oldPath = path.resolve(root, '../e-verify-group1-standard-hybrid/artifacts/EXECUTION_BINDING_OFFLINE_BLOCKED.json');
const oldPacketPath = path.resolve(root, '../e-verify-group1-standard-hybrid/artifacts/PACKET_OFFLINE_BLOCKED.json');
if (sha(oldPath) !== '85b5dad5f548bfad29a26de1f61b26d9d167297c1555cd3c5e47383e71396e88'
  || sha(oldPacketPath) !== '8b61e1eb2fd62c5f460291e064ff20b2081dd7b2e06096b797851e1a629c1d12') throw Error('PREVIOUS_FREEZE_DRIFT');
const old = JSON.parse(fs.readFileSync(oldPath)), packet = JSON.parse(fs.readFileSync(oldPacketPath));
if (old.files.some(f => sha(f.path) !== f.sha256)) throw Error('PREVIOUS_BOUND_FILE_DRIFT');
if (packet.ownerBudgets.allBrowserHttpDispatchesMax !== 650 || packet.caseMappings.length !== 14 || packet.catalogRestRequests.length !== 16) throw Error('SCOPE_DRIFT');
const proof = path.join(out, 'auth-outlet-1791972013493'), evidence = JSON.parse(fs.readFileSync(path.join(proof, 'BYPASS_PROBE_SAFE.json')));
const supervisor = JSON.parse(fs.readFileSync(path.join(proof, 'SUPERVISOR_SAFE.json')));
if (evidence.directAuthPosts !== 1 || evidence.directWebSocket !== 2 || evidence.authBypassPrevention !== 'BLOCKED'
  || !evidence.profileRemoved || !supervisor.reaped || !supervisor.containment.closed) throw Error('COUNTEREXAMPLE_EVIDENCE_MISSING');
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const closure = { format: 'group1-auth-boundary-offline-decision-v1', status: 'BLOCKED_NO_PRODUCTION_AUTHORIZATION',
  previousBindingUnchanged: true, previousBoundFiles: old.files.length, originalCaseMappings: 14, originalRlsSteps: 16,
  isolatedTurnstileAcceptance: 'ACCEPTED_WITH_DOCUMENTED_EXCEPTION', helperOutlet: 'HARD_FIXED_HTTP_ONLY',
  authBypassPrevention: 'BLOCKED', sessionHandoff: 'PREVIOUS_OFFLINE_VERIFIED_HELPER_ONLY',
  completeNativeAuthSessionSemantics: 'NOT_VERIFIED', completeSafeGroup1Entries: 0,
  targetedHelperTestsPassed: 9, targetedActualChromeProbeTestsPassed: 1, targetedTestsTotal: 10,
  testsDoNotProveBypassPrevention: true, directLocalAuthPosts: evidence.directAuthPosts,
  directLocalWorkerWebSockets: evidence.directWebSocket, browserBoundary: 'MONITOR_ONLY',
  globalAdmissionMax: 650, otherBudgetsUnchanged: true, contractChangeApplied: false,
  freshAuthorizationId: null, productionPacketCreated: false, authorizedAtUTC: null, authorizationExpiresUTC: null,
  claimCreated: false, goIssued: false, productionRequests: 0, productionWrites: 0, thirdPartyLiveRequests: 0,
  maxAdditionalCostUSD: 0, catalogHold: 'ACTIVE', group2: 'NOT_AUTHORIZED', group3: 'NOT_AUTHORIZED', publicBetaGo: 'NOT_AUTHORIZED' };
write('OFFLINE_CLOSURE_SAFE.json', closure);
const files = new Map(old.files.map(f => [f.path, f]));
for (const file of [oldPath, oldPacketPath, ...fs.readdirSync(root).filter(x => /\.(?:mjs|md)$/.test(x)).map(x => path.join(root, x)),
  path.join(proof, 'BYPASS_PROBE_SAFE.json'), path.join(proof, 'SUPERVISOR_SAFE.json'), path.join(out, 'OFFLINE_CLOSURE_SAFE.json')]) {
  const normalized = file.replaceAll('\\', '/'); files.set(normalized, { path: normalized, sha256: sha(file) });
}
write('EXECUTION_BINDING_OFFLINE_BLOCKED.json', { format: 'group1-auth-integration-offline-binding-v1', status: 'BLOCKED_NO_PRODUCTION_AUTHORIZATION',
  authorizationId: null, executionEntry: null, packetSha256: null, independentGo: null, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) });
console.log(JSON.stringify({ offlineBindingSha256: sha(path.join(out, 'EXECUTION_BINDING_OFFLINE_BLOCKED.json')), boundFiles: files.size,
  packetCreated: false, authorizationCreated: false, status: 'BLOCKED', productionRequests: 0, thirdPartyLiveRequests: 0 }));
