import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForStart } from '../e-verify-group1-remaining-assets/supervisor.mjs';
import { GO, validate, sha } from './authorization.mjs';
import { readPrivateVersion, loadDefaultOAuth, checkOAuth } from '../e-verify-group1-full650-chrome-v11/policy.mjs';
import { exactHttpsTransport } from '../e-verify-group1-script-binding/execution/wire.mjs';
import { runGroup1 } from '../e-verify-group1-script-identity/execution/group1/runner.mjs';
import { pinnedOpen } from '../e-verify-group1-chrome-v15/chrome-identity.mjs';
import { openNativeBrowser } from './browser.mjs';
import { validateDeployment, validatePublic, DEPLOYMENT } from 'file:///C:/Temp/ogh-e-verify-production-acceptance-20261012/final-read-only/read-only-policy.mjs';
await waitForStart();
const root = fileURLToPath(new URL('./artifacts/', import.meta.url)); let timer;
const browsers = [];
let result = { status: 'BLOCKED', firstFailure: 'CHILD_PRECHECK_NOT_COMPLETED', counts: 'UNKNOWN' };
try {
  const pb = fs.readFileSync(root + 'PACKET_NOT_AUTHORIZED.json'), bb = fs.readFileSync(root + 'EXECUTION_BINDING.json');
  const packet = JSON.parse(pb), binding = JSON.parse(bb), auth = JSON.parse(fs.readFileSync(root + 'AUTHORIZATION_APPROVED.json'));
  validate(auth, { packetBytes: pb, bindingBytes: bb, go: GO });
  if (fs.readFileSync(root + 'ONCE.claim', 'utf8') !== packet.authorizationId + '\n') throw Error('PARENT_CLAIM_MISMATCH');
  fs.writeFileSync(root + 'CHILD_ONCE.claim', packet.authorizationId + '\n', { flag: 'wx', mode: 0o600 });
  const start = Number(process.env.GROUP1_GO_STARTED_MS);
  if (!Number.isSafeInteger(start) || start < Date.parse(auth.authorizedAtUTC) || start > Date.now() || start + 1800000 >= Date.parse(auth.authorizationExpiresUTC)) throw Error('START_TIME_INVALID');
  const input = readPrivateVersion(binding, packet), oauth = loadDefaultOAuth(); checkOAuth(oauth, Date.now());
  const remaining = start + 1740000 - Date.now(); if (remaining <= 0) throw Error('WORK_DEADLINE');
  const controller = new AbortController(); timer = setTimeout(() => controller.abort(), remaining);
  const transports = new Map([packet.appOrigin, packet.supabaseOrigin].map(origin => [origin, exactHttpsTransport(origin)]));
  const provider = exactHttpsTransport('https://api.cloudflare.com');
  const transport = (q, bounds) => { const u = new URL(q.url); const wire = transports.get(u.origin);
    if (q.method !== 'GET' || !wire) throw Error('FIXED_NODE_GET_ONLY'); return wire(q, bounds); };
  const assertions = Object.fromEntries(packet.pageContentAssertions.map(target => [new URL(target.url).pathname,
    response => validatePublic(target, response.status, response.headers, response.body)]));
  const openBrowser = async options => {
    const browser = await pinnedOpen(() => openNativeBrowser({ ...options, headless: false, iconPaths: packet.iconPaths, pageAssertions: assertions,
      workMs: Math.min(remaining, options.workMs) })); browsers.push(browser); return browser;
  };
  result = await runGroup1({ privateBinding: input, appOrigin: packet.appOrigin, supabaseOrigin: packet.supabaseOrigin, staticManifest: packet.staticManifest,
    transport, pageAssertions: assertions, openBrowser, signal: controller.signal,
    deployment: () => provider({ url: DEPLOYMENT, method: 'GET', headers: { accept: 'application/json', authorization: 'Bearer ' + oauth.oauth_token }, body: Buffer.alloc(0) },
      { maxBytes: 131072, timeoutMs: 15000, signal: controller.signal }),
    assertDeployment: response => { const d = validateDeployment(response.status, response.headers, response.body);
      if (d.activeVersion !== packet.expectedProductionVersion || d.activeTraffic !== 100 || d.recoveryTraffic !== 0) throw Error('PRODUCTION_IDENTITY_DRIFT'); return d; },
    onStage: stage => { if (process.connected) process.send({ type: 'group1-stage', stage }, () => {}); } });
} catch (error) { result = { ...result, status: 'BLOCKED', firstFailure: /^[A-Z0-9_]{1,64}$/.test(error.message) ? error.message : 'CHILD_PRECHECK_FAILURE' }; }
finally { clearTimeout(timer); }
const { retries: legacyRetries, ...scopedResult } = result;
fs.writeFileSync(root + 'EXECUTION_SAFE.json', JSON.stringify({ ...scopedResult, authorizationId: JSON.parse(fs.readFileSync(root + 'PACKET_NOT_AUTHORIZED.json')).authorizationId, format: 'group1-native-manual-recovery-v19', browserBoundary: 'MONITOR_ONLY', nativeUnobservedDispatches: 'UNKNOWN',
  nativeAuthAutoRetriesGuaranteedZero: false, nodeRetries: 0, productionCaptcha: result.status === 'PASS' ? 'VERIFIED_SCOPED' : 'NOT_PASSED',
  manualRetries: 0, exactPrivateOriginCollection: false, unknownThirdPartyLegitimacy: 'UNKNOWN',
  unresolvedBrowserAbortCount: browsers.reduce((n, b) => n + b.receipt().diagnostics.unresolvedAborts.length, 0),
  unresolvedBrowserAbortsAreBenign: false, nativeBrowserEvidence: browsers.map(b => b.receipt()),
  catalogHold: 'ACTIVE', group2: 'NOT_AUTHORIZED', group3: 'NOT_AUTHORIZED' }) + '\n', { flag: 'wx' });
if (process.connected) { await new Promise(r => process.send({ type: 'receipt', status: 'complete' }, r)); process.disconnect(); }
process.exitCode = result.status === 'PASS' ? 0 : 1;
