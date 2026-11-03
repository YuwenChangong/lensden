import fs from 'node:fs';
import crypto from 'node:crypto';
export const ID = 'e-verify-group1-native-manual-auth-openglasshub-20261015-manual-recovery-v19';
export const GO = 'GO_E_VERIFY_GROUP1_NATIVE_MANUAL_AUTH_RECOVERY_V19';
export const GATES = ['subsetBoundary2AndResidualCasesAccepted', 'authSecurityLogSideEffectsAccepted', 'manualTurnstileAndPrivateIdentityReady',
  'catalogHoldAndPostHardeningRecoveryAccepted', 'operatorAvailableForEntireValidity', 'nativeAuthenticatedMonitorOnlyAndUnseenDispatchRiskAccepted',
  'privateSdkStorageSnapshotAndNoRawEvidenceExportAccepted', 'serverAuthControlsUnknownAndStopRulesAccepted', 'currentZeroCostFreeServicesAndUnmeteredNetworkConfirmed', 'nativeUnenumeratedThirdPartyGetRiskAndStopRulesAccepted',
  'unresolvedExternalFetchAbortContinuationAccepted'];
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
  if (p.fastTrackPolicy?.browserBoundary !== 'MONITOR_ONLY' || p.fastTrackPolicy?.unknownOriginIsTrusted !== false
    || p.fastTrackPolicy?.exactPrivateOriginCollection !== false || p.fastTrackPolicy?.nodeScopeExpanded !== false
    || p.fastTrackPolicy?.unknownGetUsesExistingVendor40SoftCap !== true || sha(fs.readFileSync(p.contractPath)) !== p.contractSha256) throw Error('FAST_TRACK_CONTRACT_INVALID');
  if (sha(packetBytes) !== b.packetSha256) throw Error('PACKET_BINDING_MISMATCH');
  if (p.abortContinuationPolicy?.error !== 'net::ERR_ABORTED' || p.abortContinuationPolicy?.method !== 'GET'
    || p.abortContinuationPolicy?.resourceType !== 'fetch' || p.abortContinuationPolicy?.originClass !== 'OTHER'
    || p.abortContinuationPolicy?.scope !== 'POSITIVE_LOGIN_ONLY' || p.abortContinuationPolicy?.classification !== 'UNRESOLVED'
    || p.abortContinuationPolicy?.networkPermissionExpansion !== false || p.abortContinuationPolicy?.automaticRetry !== false)
    throw Error('ABORT_CONTINUATION_CONTRACT_INVALID');
  for (const f of b.files) if (sha(fs.readFileSync(f.path)) !== f.sha256) throw Error('FROZEN_FILE_DRIFT');
  return true;
}
export function claimOnce(file) { const fd = fs.openSync(file, 'wx', 0o600); try { fs.writeSync(fd, ID + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
