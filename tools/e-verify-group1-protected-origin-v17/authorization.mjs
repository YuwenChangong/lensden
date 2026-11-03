import fs from 'node:fs';
import crypto from 'node:crypto';
export const ID = 'e-verify-group1-native-manual-auth-openglasshub-20261015-protected-origin-v17';
export const GO = 'GO_E_VERIFY_GROUP1_NATIVE_MANUAL_AUTH_PROTECTED_ORIGIN_V17';
export const GATES = ['subsetBoundary2AndResidualCasesAccepted', 'authSecurityLogSideEffectsAccepted', 'manualTurnstileAndPrivateIdentityReady',
  'catalogHoldAndPostHardeningRecoveryAccepted', 'operatorAvailableForEntireValidity', 'nativeAuthenticatedMonitorOnlyAndUnseenDispatchRiskAccepted',
  'privateSdkStorageSnapshotAndNoRawEvidenceExportAccepted', 'serverAuthControlsUnknownAndStopRulesAccepted', 'currentZeroCostFreeServicesAndUnmeteredNetworkConfirmed', 'protectedOriginCollectionLocalReviewAndCleanupAccepted'];
export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export function validate(auth, { packetBytes, bindingBytes, go, now = Date.now(), claimExists = false }) {
  const p = JSON.parse(packetBytes), b = JSON.parse(bindingBytes);
  if (go !== GO || p.authorizationId !== ID || b.authorizationId !== ID || auth?.authorizationId !== ID || auth.status !== 'AUTHORIZED'
    || auth.fullContractAccepted !== true || claimExists || auth.executionBindingSha256 !== sha(bindingBytes) || auth.packetSha256 !== sha(packetBytes)
    || auth.contractSha256 !== p.contractSha256 || Object.keys(auth.humanGates || {}).length !== GATES.length || GATES.some(k => auth.humanGates[k] !== true)) throw Error('NEW_MANUAL_AUTHORIZATION_REQUIRED');
  const start = Date.parse(auth.authorizedAtUTC), end = Date.parse(auth.authorizationExpiresUTC);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || now >= end || end - start > 3600000 || now + 1800000 >= end) throw Error('AUTHORIZATION_TIME_COVERAGE');
  if (p.browserNetworkBoundary !== 'MONITOR_ONLY' || p.ownerBudgets.allBrowserHttpDispatchesMax !== 650 || p.ownerBudgets.openaiAndProviderCostUSDMax !== 0
    || p.requiredCases.length !== 14 || p.catalogRestRequests.length !== 16 || p.executionLimitSeconds !== 1800 || p.catalogHold !== 'ACTIVE') throw Error('MANUAL_PACKET_SCOPE_INVALID');
  if (p.protectedOriginPolicy?.networkPermissionExpansion !== false || p.protectedOriginPolicy?.rawOriginExportAllowed !== false
    || p.protectedOriginPolicy?.lifetimeSeconds !== 3600 || p.protectedOriginPolicy?.maxOriginsPerProfile !== 16
    || p.protectedOriginPolicy?.cdpCorrelation !== 'PARTIAL_CANDIDATES_ONLY'
    || p.protectedOriginPolicy?.physicalDeletion !== 'EXPLICIT_LOCAL_REVIEW_AND_VERIFIED_DESTROY'
    || sha(fs.readFileSync(p.contractPath)) !== p.contractSha256) throw Error('ORIGIN_COLLECTION_CONTRACT_INVALID');
  if (sha(packetBytes) !== b.packetSha256) throw Error('PACKET_BINDING_MISMATCH');
  for (const f of b.files) if (sha(fs.readFileSync(f.path)) !== f.sha256) throw Error('FROZEN_FILE_DRIFT');
  return true;
}
export function claimOnce(file) { const fd = fs.openSync(file, 'wx', 0o600); try { fs.writeSync(fd, ID + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
