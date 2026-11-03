import fs from 'node:fs';
import { createHash } from 'node:crypto';
export const ID = 'e-verify-standard-chrome-turnstile-openglasshub-20261014-v1';
export const GO = 'GO_E_VERIFY_STANDARD_CHROME_TURNSTILE_ISOLATED_V1';
export const GATES = ['standardCapabilitiesAndMonitorOnlyRiskAccepted', 'isolatedNoCredentialsOfficialTestKeyConfirmed',
  'zeroCostFreeScopeAndUnmeteredConnectionConfirmed', 'vendorEphemeralStateAndSafeEvidenceAccepted',
  'trustedEnvironmentAndCleanupReady', 'operatorAvailableForEntireValidity'];
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function validate(a, { bindingHash, packetHash, now = Date.now(), go, claimExists }) {
  const keys = ['format', 'authorizationId', 'executionBindingSha256', 'packetSha256', 'authorizedAtUTC', 'authorizationExpiresUTC', 'humanGates'];
  if (!a || Object.keys(a).sort().join('|') !== keys.sort().join('|') || a.format !== 'standard-chrome-manual-authorization-v1'
    || a.authorizationId !== ID || a.executionBindingSha256 !== bindingHash || a.packetSha256 !== packetHash || go !== GO || claimExists !== false) throw Error('AUTHORIZATION_INVALID');
  if (!a.humanGates || Object.keys(a.humanGates).sort().join('|') !== GATES.slice().sort().join('|') || GATES.some(k => a.humanGates[k] !== true)) throw Error('HUMAN_GATES_REQUIRED');
  const utc = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || !Number.isFinite(Date.parse(value))
      || new Date(Date.parse(value)).toISOString().replace('.000Z', 'Z') !== value) throw Error('UTC_INVALID');
    return Date.parse(value);
  };
  const start = utc(a.authorizedAtUTC), end = utc(a.authorizationExpiresUTC);
  if (!Number.isFinite(now) || end <= start || end - start > 3600000 || now < start || now + 610000 >= end) throw Error('WINDOW_COVERAGE');
}
export function claimOnce(file) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeSync(fd, ID + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
