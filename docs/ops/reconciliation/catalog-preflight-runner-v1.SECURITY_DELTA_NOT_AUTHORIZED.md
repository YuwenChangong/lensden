# Catalog Runner v1 - P1/P2 Correction Only

OFFLINE ONLY, 2026-10-20. Previous independent source-review decision:
CHANGES_REQUIRED. This correction is not independent approval or execution authority.

Original commit: 96f2ed4915050f99a0d255f3b74740cd0149373d.
Original binding: 0505ff02ccd311c095feb079f9eea30fe65b1d168d2f281cc33711d810a4378c.
New binding: 25823f4a8a857d098e9e327a29d6916ba0905447674cba5ccee109caad1cb375.
Exact raw-byte manifest and results: catalog-preflight-runner-v1-security-correction.safe.json.
Original runner receipt, acceptance note, reviewed SQL and Review Packet are unchanged.
Git retains the original sources; the old identity does not approve this revision.

## P1

Production admission now requires the exact frozen factory and sink instances
registered by the native module in two private WeakSets. There is no registration
API. A matching kind, spread copy, inherited object or Proxy is not sufficient.
The synthetic path cannot issue a native permit. Trusted sink methods capture the
canonical private directory and native filesystem/ACL operations; caller I/O cannot
replace them. Existing exclusive consumption, single-use native permit, target,
SQL, TLS and result validation remain unchanged. The module cycle only resolves
identity predicates; imports do not invoke a client or read credentials.

Authorization hashes still check integrity, not human provenance. A caller hashing
its own JSON has not obtained owner approval. The expected digest and exact fresh
approval must come from a separate trusted owner instruction and independent
runner review. No signer, execution authorization, approval record or live entry
invocation is invented here; review and execution remain NOT_AUTHORIZED.

## P2

Both normal and error-path file closes use a cleanup wait bounded by the existing
shared monotonic deadline and at most its existing 4-second cleanup allowance.
An expired work budget can release a handle within that remaining cleanup budget,
but cannot resume writes/readback or confirm persistence. A close timeout/rejection
is latched as UNCONFIRMED and is never retried or upgraded by late completion.
The returned receipt includes native fileClose status and stays BLOCKED if unknown;
the original first failure remains intact. Successfully persisting a failure receipt
does not mean the failed evidence write or its file close succeeded.

The extracted injectable persistence helper tests the exact native failure path
without minting trusted sink/factory instances. Native construction still uses
only its lexically captured real I/O. Windows ACLs, exclusive wx creation, fsync,
single-link regular files, repeated path checks and SHA-256 readback are preserved.
Application timers do not cancel or guarantee termination of uninterruptible OS I/O.

## Focused Verification

61/61 runner tests PASS, no skipped tests; 15 new focused cases. The previous native
Windows private-file test uses only nonsecret synthetic bytes and removes its exact
test files/directory. Three node --check checks PASS. No Recovery/Auth/R2/UI/migration
suite was repeated. No Production connections, credentials, queries or role changes.

NEXT_SINGLE_ACTION=INDEPENDENT_DELTA_REVIEW_OF_P1_P2_CORRECTION_AND_NEW_RUNNER_BINDING.
No remote push, deployment or automatic inventory. CATALOG_HOLD=ACTIVE;
PUBLIC_BETA_GO=NOT_AUTHORIZED; DATABASE_BACKUP_RECOVERABILITY=NOT_VERIFIED.
