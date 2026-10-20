import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, rmdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadPlan, verifySql, SQL_SHA256, PACKET_SHA256, TARGET, LIMITS, CAPS, sha256, validateEvidence, runOfflineFixture, runAuthorizedProbe, bounded } from './catalog-preflight-v1.mjs';
import { assertAcl, prepareTls, createExactPgFactory, createPrivateSink, createAttemptGuard } from './catalog-preflight-v1-native.mjs';

const plan = await loadPlan();
const CANARY = 'SYNTHETIC_PRIVATE_POLICY_NOT_FOR_RECEIPTS';
const encode = value => Buffer.from(JSON.stringify(value));
function fixture() {
  const sections = Object.fromEntries(Object.entries(CAPS).map(([name, cap]) => [name, { cap, observed: 0, truncated: false, oversized_row: false, acl_truncated: false, rows: [] }]));
  const set = (name, rows) => Object.assign(sections[name], { observed: rows.length, rows });
  set('database', [{ oid: 1, datname: 'postgres', datdba: 10, public_connect: true, public_create: false, public_temp: true, public_acl: [] }]);
  set('schemas', [{ oid: 100, nspname: 'storage', nspowner: 10, public_usage: false, public_create: false, public_acl: [] }]);
  set('target', [{ oid: 200, relname: 'objects', relkind: 'r', relowner: 10, relrowsecurity: true, relforcerowsecurity: false, operator_rls_active_only: false, operator_inherits_owner: true, operator_can_set_owner: true, operator_schema_usage_grant_option: true, table_acl: [] }]);
  set('required_columns', ['id', 'bucket_id', 'metadata'].map((column_name, i) => ({ column_name, relation_oid: 200, attnum: i + 1, atttypid: i + 1000, atttypmod: -1, column_exists: true, data_type: ['uuid', 'text', 'jsonb'][i], operator_select: true, operator_select_grant_option: true, public_effective_select: false, column_acl: [] })));
  set('roles', [{ oid: 10, rolname: 'postgres', rolsuper: false, rolinherit: true, rolbypassrls: true, rolcreaterole: true, rolcreatedb: true, rolreplication: false, rolcanlogin: true, rolconnlimit: -1, operator_member: true, operator_inherits: true, operator_can_set: true }]);
  set('policies', [{ oid: 300, polname: 'synthetic_policy', polrelid: 200, polcmd: 'r', polpermissive: true, role_oids: [0], roles_truncated: false, public_applies: true, operator_role_applies_only: true, planned_role_policy_classification: 'PUBLIC_APPLIES_IF_RLS', using_defaults_true: false, using_definition_private: CANARY, check_definition_private: null, definition_truncated: false }]);
  return { schema: 'STORAGE_OBJECTS_CATALOG_PREFLIGHT_V1', collected_at: '2026-10-20T00:00:00Z', identity: { session_user: 'postgres', current_user: 'postgres', database: 'postgres', server_version_num: '170006', transaction_read_only: 'on', transaction_isolation: 'repeatable read', search_path: 'pg_catalog', row_security: 'on', statement_timeout: '8s', lock_timeout: '1s', idle_transaction_timeout: '15s', backend_server_port: 5432, sql_identity_gate: true }, candidate_role_exists: false, policy_name_collision: false, target_count: 1, unresolved_membership_endpoints: false, field_truncation: false, section_cap_or_size_failure: false, sections, candidate_live_effective_privileges: 'NOT_ESTABLISHED_UNCREATED_ROLE', routine_transitive_semantics: 'NOT_PROVEN_BY_DIRECT_DEPENDENCIES', managed_service_support: 'NOT_PROVEN_BY_CATALOGS', authorization: 'NO_DDL_OR_INVENTORY_AUTHORITY' };
}
function fakeClock() {
  let time = 0, next = 0;
  const timers = new Map();
  return { now: () => time, wall: () => Date.parse('2026-10-20T00:00:00Z'), set(fn, ms) { const id = ++next; timers.set(id, { at: time + ms, fn }); return id; }, clear: id => timers.delete(id),
    advance(ms) { time += ms; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); } }, pending: () => timers.size };
}
function scenario(options = {}) {
  const clock = fakeClock(), state = { connections: 0, authentications: 0, metadataSelects: 0, wireBytes: 0, peerVerified: true, hostnameVerified: true, queryable: false, closed: false };
  const log = { factoryCalls: 0, steps: [], aborts: 0, evidence: null, receipt: null, consumed: false };
  const sink = { kind: 'SYNTHETIC', directory: 'SYNTHETIC_PRIVATE_SINK', async verify() { if (options.sinkUnavailable) return false; return true; },
    async consume() { if (log.consumed) throw Object.assign(new Error(CANARY), { safeCode: 'AUTHORIZATION_ALREADY_USED' }); log.consumed = true; return true; },
    async writeEvidence(bytes, digest) { if (options.sinkWriteFailure) throw new Error(CANARY); log.evidence = Buffer.from(bytes); return options.badReadback ? '0'.repeat(64) : digest; },
    async writeReceipt(bytes) { if (options.receiptFailure) throw new Error(CANARY); log.receipt = Buffer.from(bytes); return true; } };
  const transport = { target: { ...TARGET, ...options.target }, tls: { peerVerification: true, hostnameVerification: true, servername: TARGET.host, fallback: false, ...options.tls },
    async connect() {
      state.connections++; state.authentications++;
      if (options.connectTimeout) { clock.advance(10001); return new Promise(() => {}); }
      if (options.connectFailure) throw Object.assign(new Error(CANARY), { code: '28P01' });
      if (options.secondConnection) state.connections++;
      if (options.secondAuth) state.authentications++;
      state.peerVerified = options.peerVerified !== false;
      state.queryable = true;
    },
    async step(index) {
      log.steps.push(index);
      if (options.overallTimeout && index === 1) { clock.advance(27000); return new Promise(() => {}); }
      if (index !== 5) return null;
      state.metadataSelects++;
      const data = options.data ?? fixture();
      if (options.mutate) options.mutate(data);
      const bytes = options.bytes ?? encode(data);
      state.wireBytes = options.wireOversize ? LIMITS.wireBytes + 1 : bytes.length + 100;
      return bytes;
    },
    async close() { if (options.cleanupTimeout) { clock.advance(1501); return new Promise(() => {}); } state.closed = true; state.queryable = false; },
    abort() { log.aborts++; state.queryable = false; }, status: () => ({ ...state }) };
  const transportFactory = { kind: 'SYNTHETIC', async create() { log.factoryCalls++; return transport; } };
  const reviewBytes = encode({ schema: 'SYNTHETIC_REVIEW_ONLY', decision: 'RUNNER_OFFLINE_REVIEW_APPROVED', runnerBinding: plan.runnerBinding, sqlSha256: SQL_SHA256 });
  const auth = { schema: 'OGH_CATALOG_SYNTHETIC_AUTH_V1', decision: 'AUTHORIZE_EXACT_CATALOG_READ_ONCE', authorizationId: 'catalog-synthetic-fixture-0001', notBeforeUtc: '2026-10-19T23:59:59Z', expiresUtc: '2026-10-20T00:01:00Z', sqlSha256: SQL_SHA256, packetSha256: PACKET_SHA256, runnerBinding: plan.runnerBinding, target: { ...TARGET }, privateDirectory: sink.directory, runnerReviewSha256: sha256(reviewBytes), zeroAdditionalCostConfirmed: true, privateSinkApproved: true, maxConnections: 1, maxAuthenticationAttempts: 1, maxMetadataSelects: 1, retries: 0 };
  const argumentsFor = a => { const bytes = encode(a); return { plan, sink, transportFactory, authorizationBytes: bytes, expectedAuthorizationSha256: sha256(bytes), reviewBytes }; };
  return { auth, log, clock, state, transport, sink, transportFactory, argumentsFor, run: a => runOfflineFixture(argumentsFor(a ?? auth), clock) };
}

test('fixed SQL, Packet and seven ordered statements are bound', () => {
  assert.equal(plan.sqlSha256, SQL_SHA256); assert.equal(plan.packetSha256, PACKET_SHA256);
  assert.equal(plan.steps.length, 7); assert.equal(plan.steps[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(plan.steps[6], 'ROLLBACK'); assert.equal(Object.isFrozen(plan.steps), true);
  assert.throws(() => verifySql(Buffer.from('SELECT 1')), { safeCode: 'SQL_IDENTITY_MISMATCH' });
});
test('native factory has no usable connection path without an unforgeable admission permit', async () => {
  const factory = createExactPgFactory({});
  await assert.rejects(factory.create(plan, {}), { safeCode: 'AUTHORIZATION_REQUIRED' });
});
test('the native attempt guard rejects second dispatches before socket or authentication startup', () => {
  const guard = createAttemptGuard();
  assert.equal(guard.connection(TARGET.host, TARGET.port), 1);
  assert.throws(() => guard.connection(TARGET.host, TARGET.port), { safeCode: 'SECOND_CONNECTION_DENIED' });
  assert.equal(guard.authentication(), 1);
  assert.throws(() => guard.authentication(), { safeCode: 'SECOND_AUTH_DENIED' });
  assert.throws(() => createAttemptGuard().connection('example.invalid', 5432), { safeCode: 'TLS_OR_ENDPOINT_MISMATCH' });
});
test('missing Production authorization stops before transport preparation', async () => {
  const s = scenario();
  const r = await runAuthorizedProbe({ plan, sink: { ...s.sink, kind: 'WINDOWS_PRIVATE_FILES' }, transportFactory: { ...s.transportFactory, kind: 'NATIVE_EXACT_PG' } });
  assert.equal(r.firstFailure, 'AUTHORIZATION_REQUIRED'); assert.equal(s.log.factoryCalls, 0); assert.equal(s.state.connections, 0);
});
test('synthetic authorization cannot be promoted to Production', async () => {
  const s = scenario(), args = s.argumentsFor(s.auth);
  const r = await runAuthorizedProbe({ ...args, sink: { ...s.sink, kind: 'WINDOWS_PRIVATE_FILES' }, transportFactory: { ...s.transportFactory, kind: 'NATIVE_EXACT_PG' } });
  assert.equal(r.firstFailure, 'AUTHORIZATION_SCOPE'); assert.equal(s.log.factoryCalls, 0);
});
for (const [name, mutate, expected] of [
  ['old authorization scope', a => { a.schema = 'RECOVERY_V2_3'; }, 'AUTHORIZATION_SCOPE'],
  ['SQL binding drift', a => { a.sqlSha256 = '0'.repeat(64); }, 'AUTHORIZATION_BINDING'],
  ['operator binding drift', a => { a.target.login = 'another'; }, 'AUTHORIZATION_BINDING'],
  ['endpoint binding drift', a => { a.target.host = 'example.invalid'; }, 'AUTHORIZATION_BINDING'],
  ['private directory drift', a => { a.privateDirectory = 'OTHER'; }, 'AUTHORIZATION_BINDING'],
  ['expired approval', a => { a.expiresUtc = '2026-10-19T23:59:59Z'; }, 'AUTHORIZATION_WINDOW'],
  ['unconfirmed cost', a => { a.zeroAdditionalCostConfirmed = false; }, 'AUTHORIZATION_LIMITS'],
  ['missing review binding', a => { a.runnerReviewSha256 = '0'.repeat(64); }, 'INDEPENDENT_RUNNER_REVIEW_REQUIRED'],
]) test(name + ' is rejected offline', async () => {
  const s = scenario(); mutate(s.auth); const r = await s.run();
  assert.equal(r.firstFailure, expected); assert.equal(s.log.factoryCalls, 0); assert.equal(s.state.connections, 0);
});
test('private sink failure is rejected before marker and connection', async () => {
  const s = scenario({ sinkUnavailable: true }), r = await s.run();
  assert.equal(r.firstFailure, 'PRIVATE_SINK_UNAVAILABLE'); assert.equal(s.log.consumed, false); assert.equal(s.log.factoryCalls, 0);
});
for (const [name, options] of [
  ['target mismatch', { target: { port: 6543 } }], ['TLS peer disabled', { tls: { peerVerification: false } }],
  ['TLS hostname disabled', { tls: { hostnameVerification: false } }], ['TLS fallback', { tls: { fallback: true } }],
]) test(name + ' causes no connection', async () => {
  const s = scenario(options), r = await s.run(); assert.equal(r.firstFailure, 'TLS_OR_ENDPOINT_MISMATCH'); assert.equal(s.state.connections, 0);
});
test('failed TLS handshake evidence is rejected', async () => {
  const r = await scenario({ peerVerified: false }).run(); assert.equal(r.firstFailure, 'TLS_OR_ENDPOINT_MISMATCH'); assert.equal(r.metadataSelects, 0);
});
test('untrusted certificate material is rejected without a client', () => {
  assert.throws(() => prepareTls('SYNTHETIC_INVALID_CA'), { safeCode: 'TRUST_MATERIAL_INVALID' });
});
for (const [name, options] of [['second connection observed', { secondConnection: true }], ['second auth observed', { secondAuth: true }]]) test(name + ' is rejected', async () => {
  const r = await scenario(options).run(); assert.equal(r.outcome, 'BLOCKED'); assert.equal(r.metadataSelects, 0); assert.equal(r.retries, 0);
});
for (const [name, mutate] of [
  ['unexpected root field', d => { d.unexpected = true; }],
  ['missing section', d => { delete d.sections.defaults; }],
  ['unexpected row field', d => { d.sections.roles.rows[0].unexpected = true; }],
  ['identity mismatch', d => { d.identity.current_user = 'other'; }],
  ['truncation flag', d => { d.field_truncation = true; }],
  ['section truncation', d => { d.sections.roles.truncated = true; }],
  ['oversized row flag', d => { d.sections.roles.oversized_row = true; }],
  ['missing column', d => { d.sections.required_columns.rows[0].column_exists = false; }],
  ['ACL excess', d => { d.sections.database.rows[0].public_acl = Array(65).fill({ grantor: 10, privilege: 'CONNECT', grantable: false }); }],
  ['falsified semantic approval', d => { d.managed_service_support = 'PASS'; }],
]) test(name + ' cannot reach the private evidence sink', async () => {
  const s = scenario({ mutate }), r = await s.run(); assert.equal(r.outcome, 'BLOCKED'); assert.equal(s.log.evidence, null); assert.equal(r.retries, 0);
});
test('oversized result is rejected before parsing', async () => {
  const s = scenario({ bytes: Buffer.alloc(LIMITS.fieldBytes + 1, 32) }), r = await s.run(); assert.equal(r.firstFailure, 'RESULT_SIZE'); assert.equal(s.log.evidence, null);
});
test('wire excess is rejected', async () => {
  const r = await scenario({ wireOversize: true }).run(); assert.equal(r.firstFailure, 'WIRE_SIZE');
});
test('connection timeout has bounded cleanup and no second attempt', async () => {
  const s = scenario({ connectTimeout: true }), r = await s.run();
  assert.equal(r.firstFailure, 'CONNECTION_TIMEOUT'); assert.equal(r.connectionAttempts, 1); assert.equal(r.cleanup, 'CONFIRMED_CLIENT_SIDE'); assert.equal(s.clock.pending(), 0);
});
test('overall deadline stops setup and clears timers', async () => {
  const s = scenario({ overallTimeout: true }), r = await s.run();
  assert.equal(r.firstFailure, 'OVERALL_DEADLINE'); assert.equal(r.metadataSelects, 0); assert.equal(r.elapsedMs <= LIMITS.totalMs, true); assert.equal(s.clock.pending(), 0);
});
test('authentication first failure survives uncertain timed-out cleanup', async () => {
  const s = scenario({ connectFailure: true, cleanupTimeout: true }), r = await s.run();
  assert.equal(r.firstFailure, 'SQLSTATE_28P01'); assert.equal(r.failureStage, 'CONNECTION'); assert.equal(r.cleanup, 'UNCONFIRMED'); assert.equal(s.log.aborts > 0, true); assert.equal(s.clock.pending(), 0); assert.equal(r.retries, 0);
});
test('single-use authorization cannot start a second execution', async () => {
  const s = scenario(); await s.run(); const r = await s.run();
  assert.equal(r.firstFailure, 'AUTHORIZATION_ALREADY_USED'); assert.equal(s.state.connections, 1); assert.equal(s.log.factoryCalls, 1);
});
for (const [name, options] of [['failed evidence write', { sinkWriteFailure: true }], ['failed evidence readback', { badReadback: true }], ['failed receipt persistence', { receiptFailure: true }]]) test(name + ' remains blocked', async () => {
  const r = await scenario(options).run(); assert.equal(r.outcome, 'BLOCKED'); assert.equal(r.firstFailure !== null, true);
});
test('valid capture preserves private bytes while all semantic gates remain blocked', async () => {
  const s = scenario(), r = await s.run();
  assert.equal(r.outcome, 'CATALOG_CAPTURED_REQUIRES_INDEPENDENT_REVIEW');
  assert.equal(r.privilegeDecision, 'BLOCKED_PENDING_REVIEW'); assert.equal(r.rlsDecision, 'BLOCKED_PENDING_REVIEW'); assert.equal(r.managedSupport, 'UNKNOWN');
  assert.equal(r.receiptPersistence, 'CONFIRMED'); assert.equal(r.cleanup, 'CONFIRMED_CLIENT_SIDE');
  assert.deepEqual(s.log.steps, [0, 1, 2, 3, 4, 5, 6]); assert.equal(s.log.evidence.includes(CANARY), true);
  assert.equal(JSON.stringify(r).includes(CANARY), false); assert.equal(s.log.receipt.includes(CANARY), false); assert.equal(s.clock.pending(), 0);
  assert.equal(validateEvidence(s.log.evidence).evidenceSha256, sha256(s.log.evidence));
});
test('ACL proof rejects broad or inherited directory access', () => {
  const sid = 'S-1-5-21-1-2-3-1001';
  const good = { currentSid: sid, ownerSid: sid, protected: true, reparse: false, deniedAny: false, allows: [{ sid, fullControl: true }, { sid: 'S-1-5-18', fullControl: true }] };
  assert.doesNotThrow(() => assertAcl(good));
  for (const change of [{ protected: false }, { reparse: true }, { ownerSid: 'S-1-1-0' }, { allows: [...good.allows, { sid: 'S-1-1-0', fullControl: false }] }]) assert.throws(() => assertAcl({ ...good, ...change }), { safeCode: 'PRIVATE_SINK_UNAVAILABLE' });
});
test('private sink cannot target a repository or non-local path', () => {
  for (const path of ['D:\\OpenGlass Hub', '\\\\example.invalid\\share', 'relative']) assert.throws(() => createPrivateSink(path), { safeCode: 'PRIVATE_SINK_UNAVAILABLE' });
});
test('deadline race observes a late rejection without unhandled errors', async () => {
  const clock = fakeClock(); let reject;
  const pending = bounded(() => new Promise((_, r) => { reject = r; }), 10, clock, 'CLEANUP_TIMEOUT');
  await Promise.resolve(); clock.advance(11);
  await assert.rejects(pending, { safeCode: 'CLEANUP_TIMEOUT' }); reject(new Error(CANARY));
  await Promise.resolve(); assert.equal(clock.pending(), 0);
});
test('native Windows private sink persists only synthetic data with exclusive creation and readback', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const root = join(tmpdir(), 'ogh-catalog-preflight-private-test-' + randomUUID());
  const names = ['catalog-preflight-v1.authorization.used', 'catalog-evidence.private.json', 'catalog-result.safe.json'];
  await mkdir(root);
  try {
    const literal = root.replaceAll("'", "''");
    const script = `$ErrorActionPreference='Stop';$p='${literal}';$u=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($u);$a.SetAccessRuleProtection($true,$false);foreach($sid in @($u,[Security.Principal.SecurityIdentifier]'S-1-5-18')){$r=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r)};[IO.Directory]::SetAccessControl($p,$a)`;
    await promisify(execFile)('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 5000, maxBuffer: 8192 });
    const sink = createPrivateSink(root);
    const budget = { active: () => true };
    await assert.rejects(sink.verify({ active: () => false }), { safeCode: 'PRIVATE_SINK_UNAVAILABLE' });
    assert.equal(await sink.verify(budget), true);
    assert.equal(await sink.consume({ scope: 'SYNTHETIC_TEST_ONLY_NOT_OWNER_AUTHORIZATION' }, budget), true);
    await assert.rejects(sink.consume({ scope: 'SYNTHETIC_TEST_ONLY' }, budget), { safeCode: 'AUTHORIZATION_ALREADY_USED' });
    const bytes = encode(fixture());
    assert.equal(await sink.writeEvidence(bytes, sha256(bytes), budget), sha256(bytes));
    assert.equal(sha256(await readFile(join(root, names[1]))), sha256(bytes));
    assert.equal(await sink.writeReceipt(encode({ scope: 'SYNTHETIC_ONLY', productionConnections: 0 }), budget), true);
    assert.equal((await readdir(root)).sort().join('|'), [...names].sort().join('|'));
  } finally {
    for (const name of names) {
      const target = resolve(root, name);
      assert.equal(relative(root, target), name);
      await unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    await rmdir(root);
  }
});
