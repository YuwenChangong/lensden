import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runSupervised } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { verifyFrozen } from './binding.mjs';
import { validate, claimOnce, ID, GO } from './authorization.mjs';
import { createProfile, cleanupProfile } from '../e-verify-native-manual/profile.mjs';
const cwd = fileURLToPath(new URL('./', import.meta.url)), d = cwd + 'artifacts';
if (process.argv.length !== 3 || process.argv[2] !== GO) throw Error('INDEPENDENT_GO_REQUIRED');
fs.writeFileSync(d + '/STANDARD_PREFLIGHT_ONCE.json', JSON.stringify({ authorizationId: ID, startedUTC: new Date().toISOString() }), { flag: 'wx' });
const b = verifyFrozen(d), a = JSON.parse(fs.readFileSync(d + '/AUTHORIZATION_APPROVED.json'));
validate(a, { ...b, now: Date.now(), go: process.argv[2], claimExists: fs.existsSync(d + '/STANDARD_ONCE.claim') });
claimOnce(d + '/STANDARD_ONCE.claim');
const profile = createProfile();
fs.writeFileSync(d + '/STANDARD_PROFILE_LOCAL_ONLY.json', JSON.stringify({ profilePath: profile, notForSharing: true }), { flag: 'wx', mode: 0o600 });
const s = await runSupervised({ entry: 'live-child.mjs', args: [profile], cwd, deadlineMs: 600000, workMs: 540000,
  graceMs: 10000, reserveMs: 60000, receiptPath: d + '/STANDARD_SUPERVISOR_SAFE.json',
  env: Object.fromEntries(['SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
const r = fs.existsSync(d + '/STANDARD_SAFE.json') ? JSON.parse(fs.readFileSync(d + '/STANDARD_SAFE.json')) : null;
let profileRemoved = false;
if (s.containment.closed && s.reaped) try { profileRemoved = cleanupProfile(profile); } catch {}
const cleanupPass = s.containment.closed && s.reaped && profileRemoved && r?.cleanupStatus === 'PASS';
const executionPass = s.classification === 'EXIT_ZERO' && cleanupPass;
const outcome = executionPass && r?.outcome === 'ISOLATED_OBSERVATION_COMPLETE' ? 'ISOLATED_OBSERVATION_COMPLETE'
  : executionPass && r?.outcome === 'INCOMPLETE' ? 'INCOMPLETE' : 'BLOCKED';
fs.writeFileSync(d + '/STANDARD_FINAL_SAFE.json', JSON.stringify({ authorizationId: ID, authorizationConsumed: true, outcome,
  cleanupStatus: cleanupPass ? 'PASS' : 'FAILED_OR_UNKNOWN', nativeContainmentClosed: s.containment.closed, profileRemoved,
  networkBoundary: 'MONITOR_ONLY', oldHardCapsInherited: false, unobservedBrowserOrOsTraffic: 'UNKNOWN',
  fullGroup1Authorized: false, publicBetaGo: false }, null, 2), { flag: 'wx' });
