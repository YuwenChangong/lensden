import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ID, GO, GATES, sha } from './authorization.mjs';
import { readPrivateVersion } from '../e-verify-group1-full650-chrome-v11/policy.mjs';
const here = fileURLToPath(new URL('.', import.meta.url)), out = path.join(here, 'artifacts');
const previous = path.resolve(here, '../e-verify-group1-chrome-v15/artifacts');
const bb = fs.readFileSync(path.join(previous, 'EXECUTION_BINDING.json')), pb = fs.readFileSync(path.join(previous, 'PACKET_NOT_AUTHORIZED.json'));
if (sha(bb) !== '241476de1ad5594501c537a660891222f044e4a1b8192804997343436aa7d699'
  || sha(pb) !== 'ced74f08a28ba5f14d97b21c177d9f0ca2a2d71887b65cf095cd6fd8824325c2') throw Error('V15_HISTORY_DRIFT');
const old = JSON.parse(bb), original = JSON.parse(pb);
for (const f of old.files) if (sha(fs.readFileSync(f.path)) !== f.sha256) throw Error('PREVIOUS_FROZEN_FILE_DRIFT');
readPrivateVersion(old, original);
const closure = JSON.parse(fs.readFileSync(path.join(previous, 'GO_CLOSURE_SAFE.json')));
if (closure.firstFailure !== 'MANUAL_WAIT_DEADLINE' || closure.authorizationConsumed !== true || closure.claimCreated !== true) throw Error('V15_CONSUMPTION_NOT_PROVEN');
for (const [f, digest] of Object.entries(closure.originalReceiptSha256)) if (sha(fs.readFileSync(path.join(previous, f))) !== digest) throw Error('V15_RECEIPT_DRIFT');
const reproductionFolder = 'reproduction-1792032799941', testFolder = 'tests-1792033177659';
const reproduced = JSON.parse(fs.readFileSync(path.join(out, reproductionFolder, 'REPRODUCTION_SAFE.json')));
if (!reproduced.originalStartDelivered || reproduced.afterOriginalBringToFront.foreground.foregroundBelongsToProfile
  || !reproduced.afterSixOriginalLaunches.at(-1).foreground.foregroundBelongsToProfile || !reproduced.afterSixOriginalLaunches.at(-1).pendingPage.blank) throw Error('WINDOW_FOCUS_DEFECT_NOT_PROVEN');
const results = JSON.parse(fs.readFileSync(path.join(out, testFolder, 'TARGETED_SAFE.json')));
const supervised = JSON.parse(fs.readFileSync(path.join(out, testFolder, 'GUARD_SUPERVISOR_SAFE.json')));
if (results.tests.length !== 9 || results.tests.some(t => t.status !== 'PASS') || results.productionRequests || results.thirdPartyLiveRequests
  || supervised.classification !== 'EXIT_ZERO' || !supervised.reaped || !supervised.containment.closed) throw Error('CONTROL_TESTS_NOT_PASS');
const write = (n, v) => fs.writeFileSync(path.join(out, n), JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
const contract = fs.readFileSync(path.join(here, 'CONTRACT_NOT_AUTHORIZED.md'));
fs.writeFileSync(path.join(out, 'HUMAN_GROUP1_CONTROL_V16_AUTHORIZATION_NOT_AUTHORIZED.md'), contract, { flag: 'wx' });
const packet = { ...original, authorizationId: ID, format: 'group1-native-manual-auth-control-v16', independentGo: GO,
  executionEntry: path.join(here, 'entry.mjs'), contractSha256: sha(contract),
  previousAuthorizationId: original.authorizationId, previousAuthorizationConsumed: true, previousOwnerGatesApplied: false,
  ownerGates: Object.fromEntries(GATES.map(g => [g, null])), authorizedAtUTC: null, authorizationExpiresUTC: null,
  productionAuthorization: 'NOT_AUTHORIZED', claimCreated: false, readiness: 'READY_FOR_OWNER_APPROVAL',
  controlStartupReadiness: 'OFFLINE_VERIFIED_DOM_HANDLER_HANDSHAKE_AND_WIN32_FOREGROUND',
  controlFocusBoundary: 'OWNED_PROFILE_EXACT_QA_TITLE_FOCUS_EXIT_ONLY_NO_NETWORK_NO_KEYSTROKES',
  startupChangesDoNotExtendExecutionDeadline: true, historicalV15ExactWindowIdentity: 'UNKNOWN',
  actualProductionStartControlVerified: false };
write('PACKET_NOT_AUTHORIZED.json', packet);
const packetSha256 = sha(fs.readFileSync(path.join(out, 'PACKET_NOT_AUTHORIZED.json')));
write('AUTHORIZATION_PENDING_NOT_AUTHORIZED.json', { authorizationId: ID, status: 'NOT_AUTHORIZED', fullContractAccepted: false,
  humanGates: packet.ownerGates, authorizedAtUTC: null, authorizationExpiresUTC: null, executionBindingSha256: null,
  packetSha256, contractSha256: sha(contract) });
const files = new Map(old.files.map(f => [f.path, { ...f }]));
const added = [path.join(previous, 'EXECUTION_BINDING.json'), path.join(previous, 'PACKET_NOT_AUTHORIZED.json'), path.join(previous, 'GO_CLOSURE_SAFE.json'),
  ...Object.keys(closure.originalReceiptSha256).map(n => path.join(previous, n)), path.join(previous, 'ONCE.claim'), path.join(previous, 'CHILD_ONCE.claim'),
  ...fs.readdirSync(here).filter(n => /\.(mjs|md|ps1)$/.test(n)).map(n => path.join(here, n)),
  ...[reproductionFolder, testFolder].flatMap(d => fs.readdirSync(path.join(out, d)).map(n => path.join(out, d, n))),
  path.join(out, 'HUMAN_GROUP1_CONTROL_V16_AUTHORIZATION_NOT_AUTHORIZED.md')];
for (const file of added) { const p = file.replaceAll('\\', '/'); files.set(p, { path: p, sha256: sha(fs.readFileSync(file)) }); }
write('EXECUTION_BINDING.json', { ...old, authorizationId: ID, packetSha256, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
  previousBindingSha256: sha(bb), previous278FrozenFilesUnchanged: true, previousAuthorizationConsumed: true, oldAuthorizationReused: false });
const bindingSha256 = sha(fs.readFileSync(path.join(out, 'EXECUTION_BINDING.json')));
write('CONTROL_REPAIR_DIFFERENCE_SAFE.json', { authorizationId: ID, previousAuthorizationId: original.authorizationId,
  rootCauseCategory: 'WINDOW_FOCUS_FAILURE_PROVEN_ON_ORIGINAL_OFFLINE_PATH', historicalV15WindowIdentity: 'UNKNOWN',
  originalControlDomAndStartHandler: 'PASS_OFFLINE', exactOsForegroundWasNotProvenByPageBringToFront: true,
  previous278FilesUnchanged: true, budgetsCasesAuthRlsSessionNetworkBoundaryUnchanged: true,
  technicalChanges: ['Nonblank local waiting document', 'UTF8 control title and visible buttons', 'DOM/button/binding readiness handshake',
    'Owned exact QA HWND foreground check via hidden Job child with no network or keystrokes', 'Fail-closed control errors inside existing time bound'],
  ownerGatesMigrated: false, utcFilled: false, claimCreated: false, goIssued: false,
  targetedTests: '9/9_PASS', bindingSha256, packetSha256, contractSha256: sha(contract), boundFiles: files.size,
  productionRequests: 0, thirdPartyLiveRequests: 0, productionWrites: 0, catalogHold: 'ACTIVE' });
console.log(JSON.stringify({ authorizationId: ID, bindingSha256, packetSha256, contractSha256: sha(contract), boundFiles: files.size, targetedTests: '9/9_PASS' }));
