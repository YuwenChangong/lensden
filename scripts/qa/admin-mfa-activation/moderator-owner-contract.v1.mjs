import assert from 'node:assert/strict';

// Offline contract amendment, not an approval/executor or browser identity proof.
// These observations must come from independent authenticated server readbacks.
export const moderatorOwnerContract = Object.freeze({
  productionAuthority: false,
  previousApprovalsSupersededNotReused: true,
  project: 'xcbnxzjlsvtgzixurcof',
  worker: 'openglasshub',
  enrollmentCommit: '534c693bbd95091c2850dee1e7584ca81ff26ad8',
  enrollmentManifestSha256: '11f7fe8500024637abc1b4de7d53b206daa24390d16c6f89b4480aa668d3c1b6',
  enforcementCommit: '8b0882f09a26375675b21c6f0682c2221365dbf3',
  enforcementManifestSha256: 'ba9ea679c0a5cc347565b1ab3437f5fbb085ac431802af95cf291adcdde57f78',
  databaseOrder: Object.freeze([
    Object.freeze({ file: '20261024043314_admin_staff_aal2_capabilities.sql', sha256: 'd43eef59dfd51580a66a03a684969e07316218b46146237479e022e38cc569bf' }),
    Object.freeze({ file: '20261024103015_staff_user_safety_target_boundary.sql', sha256: '4a1302520ca90ee8f66380ead98ecbe69319c4ac93a8e0faf8f53f3ab7f403b3' }),
  ]),
  databaseTransaction: 'ONE_REVIEWED_ATOMIC_TRANSACTION_TWO_LEDGER_ENTRIES_AFTER_ENFORCEMENT_ACCEPTANCE',
  serverUuidBinding: 'GETUSER_EQUALS_WORKER_ME_EQUALS_PROTECTED_PROFILE_ID_FRESH_BEFORE_DEPLOYMENT',
  expectedProtectedRole: 'moderator',
  roleChanges: 0,
  accountCreations: 0,
  adminOnlyProbeExpectedStatus: 403,
  mainAndIndependentBackupFactorsRequired: true,
  refreshedServerAal2Required: true,
  priorApprovalsReusable: false,
});

export function bindModeratorOwner({ authUserId, workerUserId, profileUserId, protectedRole }, boundUserId) {
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId), 'SERVER_UUID_REQUIRED');
  assert.equal(authUserId, workerUserId, 'SERVER_IDENTITY_MISMATCH');
  assert.equal(authUserId, profileUserId, 'PROTECTED_PROFILE_MISMATCH');
  assert.equal(protectedRole, 'moderator', 'ORIGINAL_MODERATOR_ROLE_REQUIRED');
  if (boundUserId !== undefined) assert.equal(authUserId, boundUserId, 'OWNER_CHANGED');
  return Object.freeze({ userId: authUserId, role: protectedRole });
}

export function verifyModeratorAcceptance({ userId, protectedRole, serverAal, adminOnlyStatus }, owner) {
  assert.equal(userId, owner.userId, 'OWNER_CHANGED');
  assert.equal(protectedRole, owner.role, 'OWNER_ROLE_CHANGED');
  assert.equal(serverAal, 'aal2', 'SERVER_AAL2_REQUIRED');
  assert.equal(adminOnlyStatus, 403, 'ADMIN_ONLY_ACCESS_MUST_REMAIN_DENIED');
}
