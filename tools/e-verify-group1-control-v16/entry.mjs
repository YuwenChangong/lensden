import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GO, validate, claimOnce } from './authorization.mjs';
import { readPrivateVersion, loadDefaultOAuth, checkOAuth } from '../e-verify-group1-full650-chrome-v11/policy.mjs';
import { runSupervised } from '../e-verify-group1-remaining-assets/supervisor.mjs';
const here = fileURLToPath(new URL('.', import.meta.url)), root = path.join(here, 'artifacts');
const attempts = ['PREFLIGHT_ONCE_SAFE.json', 'LOCAL_FAILURE_SAFE.json', 'ONCE.claim', 'CHILD_ONCE.claim', 'EXECUTION_SAFE.json', 'SUPERVISOR_SAFE.json', 'FINAL_SAFE.json'];
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== GO) throw Error('EXACT_FRESH_GO_REQUIRED');
  if (process.env.NODE_OPTIONS || process.env.NODE_PATH || attempts.some(x => fs.existsSync(path.join(root, x)))) throw Error('OVERRIDE_OR_REPLAY_FORBIDDEN');
  const pb = fs.readFileSync(path.join(root, 'PACKET_NOT_AUTHORIZED.json')), bb = fs.readFileSync(path.join(root, 'EXECUTION_BINDING.json'));
  const packet = JSON.parse(pb), binding = JSON.parse(bb), auth = JSON.parse(fs.readFileSync(path.join(root, 'AUTHORIZATION_APPROVED.json')));
  validate(auth, { packetBytes: pb, bindingBytes: bb, go: process.argv[2] }); readPrivateVersion(binding, packet);
  if (path.resolve(binding.nodePath).toLowerCase() !== path.resolve(process.execPath).toLowerCase()) throw Error('NODE_RUNTIME_DRIFT');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: binding.sourceRoot, windowsHide: true, encoding: 'utf8', timeout: 5000 });
  if (head.status !== 0 || head.stdout.trim() !== packet.sourceSha) throw Error('SOURCE_HEAD_DRIFT');
  checkOAuth(loadDefaultOAuth(), Date.now()); const start = Date.now();
  fs.writeFileSync(path.join(root, 'PREFLIGHT_ONCE_SAFE.json'), JSON.stringify({ status: 'PASS', requests: 0 }) + '\n', { flag: 'wx' }); claimOnce(path.join(root, 'ONCE.claim'));
  const result = await runSupervised({ entry: 'child.mjs', cwd: here, args: [], deadlineMs: 1800000, graceMs: 10000, reserveMs: 60000,
    env: Object.fromEntries(['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'SystemRoot'].map(k => [k, process.env[k]]).concat([['GROUP1_GO_STARTED_MS', String(start)]])),
    receiptPath: path.join(root, 'SUPERVISOR_SAFE.json'), onMessage: event => { if (event.type === 'group1-stage') process.stdout.write('GROUP1_STAGE=' + event.stage + '\n'); } });
  fs.writeFileSync(path.join(root, 'FINAL_SAFE.json'), JSON.stringify({ classification: result.classification, authorizationConsumed: true, claimCreated: true,
    supervisor: result, browserBoundary: 'MONITOR_ONLY', detailedOutcome: 'SEE_EXECUTION_SAFE', catalogHold: 'ACTIVE', publicBetaGo: 'NOT_AUTHORIZED' }) + '\n', { flag: 'wx' });
  process.exitCode = result.classification === 'EXIT_ZERO' && !result.receiptMissing && result.containment.closed ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main().catch(error => {
  const code = /^[A-Z0-9_]{1,64}$/.test(error.message) ? error.message : 'LOCAL_PREFLIGHT_FAILURE';
  if (process.argv[2] === GO && !fs.existsSync(path.join(root, 'LOCAL_FAILURE_SAFE.json'))) fs.writeFileSync(path.join(root, 'LOCAL_FAILURE_SAFE.json'),
    JSON.stringify({ status: 'BLOCKED', firstFailure: code, claimCreated: fs.existsSync(path.join(root, 'ONCE.claim')), requests: 'NO_PRODUCTION_STARTED_BY_PREFLIGHT' }) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ status: 'BLOCKED', firstFailure: code }) + '\n'); process.exitCode = 1;
});
