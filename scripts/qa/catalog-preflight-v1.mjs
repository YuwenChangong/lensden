import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { isTrustedPgFactory, isTrustedPrivateSink } from './catalog-preflight-v1-native.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SQL_FILE = 'docs/ops/reconciliation/storage-objects-catalog-preflight.v1.NOT_AUTHORIZED.sql';
export const PACKET_FILE = 'docs/ops/reconciliation/storage-objects-catalog-preflight.v1.REVIEW_PACKET_NOT_AUTHORIZED.md';
export const SQL_SHA256 = '5b06d185c924d14e6f6dc67bd5d912301909a5e1aecb432f6c671b1221e95103';
export const PACKET_SHA256 = 'c6dc8664b2eaae234b26bb4b9b3d5e0cda1679ec84a74fdc7f3c20c46a60d417';
export const PG_ROOT = 'C:/Temp/openglass-product-detail-main-release-v1/node_modules/pg';
export const TARGET = Object.freeze({ project: 'xcbnxzjlsvtgzixurcof', host: 'aws-1-ap-northeast-1.pooler.supabase.com', port: 5432, database: 'postgres', login: 'postgres.xcbnxzjlsvtgzixurcof', role: 'postgres' });
export const LIMITS = Object.freeze({ connectMs: 10000, statementMs: 8000, lockMs: 1000, totalMs: 30000, cleanupMs: 4000, fieldBytes: 262144, wireBytes: 524288, recordBytes: 8192 });
export const CAPS = Object.freeze({ database: 1, schemas: 32, relations: 128, public_columns: 256, required_columns: 3, defaults: 64, policies: 64, policy_dependencies: 128, routines: 128, routine_dependencies: 128, roles: 64, memberships: 128, target: 1 });
const plans = new WeakSet();
const nativePermits = new WeakMap();
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fail = code => { throw Object.assign(new Error(code), { safeCode: code }); };
const need = (ok, code) => { if (!ok) fail(code); };
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value);
const utf8 = value => Buffer.byteLength(value, 'utf8');

export function verifySql(bytes) { need(sha256(bytes) === SQL_SHA256, 'SQL_IDENTITY_MISMATCH'); }
export function assertPlan(plan) { need(plans.has(plan), 'UNBOUND_PLAN'); }
export function claimNativePermit(permit, plan) {
  need(permit && nativePermits.get(permit) === plan, 'AUTHORIZATION_REQUIRED');
  nativePermits.delete(permit);
}
export async function loadPlan() {
  const files = [SQL_FILE, PACKET_FILE, 'scripts/qa/catalog-preflight-v1.mjs', 'scripts/qa/catalog-preflight-v1-native.mjs',
    ...['package.json', 'lib/index.js', 'lib/client.js', 'lib/connection.js', 'lib/connection-parameters.js'].map(name => PG_ROOT + '/' + name)];
  const bytes = await Promise.all(files.map(name => readFile(name.startsWith('C:/') ? name : new URL(name, new URL('../../', import.meta.url)))));
  verifySql(bytes[0]);
  need(sha256(bytes[1]) === PACKET_SHA256, 'PACKET_IDENTITY_MISMATCH');
  need(JSON.parse(bytes[4]).version === '8.23.0', 'TRANSPORT_UNAVAILABLE');
  const text = bytes[0].toString('utf8');
  const begin = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY';
  const settings = ["SET LOCAL statement_timeout = '8s'", "SET LOCAL lock_timeout = '1s'", "SET LOCAL idle_in_transaction_session_timeout = '15s'", 'SET LOCAL search_path = pg_catalog'];
  const start = text.indexOf('\nWITH gate AS MATERIALIZED (');
  const end = text.lastIndexOf('\nROLLBACK;');
  need(start > 0 && end > start && text.slice(text.indexOf(begin), start).trim() === [begin, ...settings].join(';\n') + ';', 'SQL_PLAN_BOUNDARY');
  const select = text.slice(start, end).trim();
  need(select.endsWith(';'), 'SQL_PLAN_BOUNDARY');
  const plan = Object.freeze({ target: TARGET, steps: Object.freeze([begin, ...settings, select.slice(0, -1), 'ROLLBACK']), sqlSha256: SQL_SHA256, packetSha256: PACKET_SHA256,
    runnerBinding: sha256(JSON.stringify(files.map((name, i) => [name, sha256(bytes[i])]))), manifest: Object.freeze(files.map((name, i) => Object.freeze({ name, sha256: sha256(bytes[i]) }))) });
  plans.add(plan);
  return plan;
}

const acl = (value, full = false) => Array.isArray(value) && value.length <= 64 && value.every(a => exact(a, full ? ['grantor', 'grantee', 'privilege', 'grantable'] : ['grantor', 'privilege', 'grantable']) && integer(a.grantor) && a.grantor > 0 && (!full || integer(a.grantee) && a.grantee >= 0) && typeof a.grantable === 'boolean' && ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN', 'EXECUTE', 'USAGE', 'CREATE', 'CONNECT', 'TEMPORARY', 'SET', 'ALTER SYSTEM'].includes(a.privilege));
const kinds = {
  oid: v => integer(v) && v > 0 && v <= 4294967295,
  zeroOid: v => integer(v) && v >= 0 && v <= 4294967295,
  int: integer,
  bool: v => typeof v === 'boolean',
  name: v => typeof v === 'string' && utf8(v) > 0 && utf8(v) <= 63,
  text: v => typeof v === 'string' && v.length <= 1024,
  predicate: v => v === null || typeof v === 'string' && v.length <= 2048,
  acl: v => acl(v), fullAcl: v => acl(v, true),
  oidArray: v => Array.isArray(v) && v.length <= 64 && v.every(k => kinds.zeroOid(k)),
  relkind: v => ['r', 'p', 'v', 'm', 'f', 'S'].includes(v),
  command: v => ['r', '*'].includes(v),
  char: v => typeof v === 'string' && /^[A-Za-z*]$/.test(v),
  policyClass: v => ['PUBLIC_APPLIES_IF_RLS', 'NOT_APPLICABLE_TO_PROPOSED_FRESH_MEMBERSHIP_FREE_ROLE'].includes(v),
};
const dependency = { classid: 'oid', objid: 'oid', objsubid: 'int', refclassid: 'oid', refobjid: 'oid', refobjsubid: 'int', deptype: 'char' };
const ROWS = Object.freeze({
  database: { oid: 'oid', datname: 'name', datdba: 'oid', public_connect: 'bool', public_create: 'bool', public_temp: 'bool', public_acl: 'acl' },
  schemas: { oid: 'oid', nspname: 'name', nspowner: 'oid', public_usage: 'bool', public_create: 'bool', public_acl: 'acl' },
  relations: { oid: 'oid', nspname: 'name', relname: 'name', relkind: 'relkind', relowner: 'oid', schema_public_usage: 'bool', schema_usage_proposed: 'bool', is_target: 'bool', public_acl: 'acl' },
  public_columns: { attrelid: 'oid', attnum: 'int', attname: 'name', public_effective_select: 'bool', public_column_acl: 'acl' },
  required_columns: { column_name: 'name', relation_oid: 'oid?', attnum: 'int?', atttypid: 'oid?', atttypmod: 'int?', column_exists: 'bool', data_type: 'text?', operator_select: 'bool?', operator_select_grant_option: 'bool?', public_effective_select: 'bool?', column_acl: 'fullAcl' },
  defaults: { oid: 'oid', defaclrole: 'oid', defaclnamespace: 'zeroOid', defaclobjtype: 'char', public_acl: 'acl' },
  policies: { oid: 'oid', polname: 'name', polrelid: 'oid', polcmd: 'command', polpermissive: 'bool', role_oids: 'oidArray', roles_truncated: 'bool', public_applies: 'bool', operator_role_applies_only: 'bool', planned_role_policy_classification: 'policyClass', using_defaults_true: 'bool', using_definition_private: 'predicate', check_definition_private: 'predicate', definition_truncated: 'bool' },
  policy_dependencies: dependency,
  routines: { oid: 'oid', nspname: 'name', proname: 'name', proowner: 'oid', prokind: 'char', prosecdef: 'bool', provolatile: 'char', proleakproof: 'bool', lanname: 'name', lanpltrusted: 'bool', identity_arguments: 'text', arguments_truncated: 'bool', public_execute: 'bool', has_local_configuration: 'bool', configuration_entry_count: 'int', search_path_configured: 'bool', public_acl: 'acl' },
  routine_dependencies: dependency,
  roles: { oid: 'oid', rolname: 'name', rolsuper: 'bool', rolinherit: 'bool', rolbypassrls: 'bool', rolcreaterole: 'bool', rolcreatedb: 'bool', rolreplication: 'bool', rolcanlogin: 'bool', rolconnlimit: 'int', operator_member: 'bool', operator_inherits: 'bool', operator_can_set: 'bool' },
  memberships: { roleid: 'oid', member: 'oid', grantor: 'oid', admin_option: 'bool', inherit_option: 'bool', set_option: 'bool', both_endpoints_covered: 'bool' },
  target: { oid: 'oid', relname: 'name', relkind: 'relkind', relowner: 'oid', relrowsecurity: 'bool', relforcerowsecurity: 'bool', operator_rls_active_only: 'bool', operator_inherits_owner: 'bool', operator_can_set_owner: 'bool', operator_schema_usage_grant_option: 'bool', table_acl: 'fullAcl' },
});
function fieldsValid(row, spec) {
  return exact(row, Object.keys(spec)) && Object.entries(spec).every(([key, type]) => type.endsWith('?') && row[key] === null || kinds[type.replace('?', '')](row[key]));
}
export function validateEvidence(bytes) {
  need(Buffer.isBuffer(bytes) && bytes.length <= LIMITS.fieldBytes, 'RESULT_SIZE');
  let d; try { d = JSON.parse(bytes.toString('utf8')); } catch { fail('RESULT_JSON'); }
  const keys = ['schema', 'collected_at', 'identity', 'candidate_role_exists', 'policy_name_collision', 'target_count', 'unresolved_membership_endpoints', 'field_truncation', 'section_cap_or_size_failure', 'sections', 'candidate_live_effective_privileges', 'routine_transitive_semantics', 'managed_service_support', 'authorization'];
  need(exact(d, keys) && d.schema === 'STORAGE_OBJECTS_CATALOG_PREFLIGHT_V1', 'RESULT_SHAPE');
  need(typeof d.collected_at === 'string' && Number.isFinite(Date.parse(d.collected_at)), 'RESULT_SHAPE');
  for (const k of ['candidate_role_exists', 'policy_name_collision', 'unresolved_membership_endpoints', 'field_truncation', 'section_cap_or_size_failure']) need(typeof d[k] === 'boolean', 'RESULT_SHAPE');
  need(!d.unresolved_membership_endpoints && !d.field_truncation && !d.section_cap_or_size_failure, 'INCOMPLETE_EVIDENCE');
  need(d.target_count === 1 && exact(d.sections, Object.keys(CAPS)), 'MISSING_SECTIONS');
  const identity = { session_user: 'postgres', current_user: 'postgres', database: 'postgres', transaction_read_only: 'on', transaction_isolation: 'repeatable read', search_path: 'pg_catalog', row_security: 'on', statement_timeout: '8s', lock_timeout: '1s', idle_transaction_timeout: '15s', sql_identity_gate: true };
  need(exact(d.identity, [...Object.keys(identity), 'server_version_num', 'backend_server_port']), 'IDENTITY_SHAPE');
  need(Object.entries(identity).every(([k, v]) => d.identity[k] === v) && typeof d.identity.server_version_num === 'string' && /^17\d{4}$/.test(d.identity.server_version_num) && (d.identity.backend_server_port === null || integer(d.identity.backend_server_port) && d.identity.backend_server_port > 0 && d.identity.backend_server_port <= 65535), 'IDENTITY_MISMATCH');
  for (const [section, cap] of Object.entries(CAPS)) {
    const s = d.sections[section];
    need(exact(s, ['cap', 'observed', 'truncated', 'oversized_row', 'acl_truncated', 'rows']), 'SECTION_SHAPE');
    need(s.cap === cap && integer(s.observed) && s.observed >= 0 && s.observed <= cap && s.truncated === false && s.oversized_row === false && s.acl_truncated === false && Array.isArray(s.rows) && s.rows.length === s.observed, 'SECTION_BOUNDS');
    for (const row of s.rows) {
      need(utf8(JSON.stringify(row)) <= LIMITS.recordBytes && fieldsValid(row, ROWS[section]), 'RECORD_SHAPE_OR_BOUNDS');
      for (const flag of ['roles_truncated', 'definition_truncated', 'arguments_truncated']) need(row[flag] !== true, 'INCOMPLETE_EVIDENCE');
    }
  }
  const s = d.sections;
  need(s.database.observed === 1 && s.database.rows[0].datname === 'postgres' && s.target.observed === 1 && s.target.rows[0].relname === 'objects' && s.target.rows[0].relkind === 'r', 'TARGET_MISSING');
  const table = s.target.rows[0];
  need(s.required_columns.observed === 3 && [...s.required_columns.rows.map(r => r.column_name)].sort().join(',') === 'bucket_id,id,metadata' && s.required_columns.rows.every(r => r.column_exists && r.relation_oid === table.oid && r.attnum > 0 && r.atttypid > 0 && typeof r.data_type === 'string'), 'REQUIRED_COLUMNS_MISSING');
  need(s.roles.rows.some(r => r.rolname === 'postgres') && s.roles.rows.some(r => r.oid === table.relowner) && s.schemas.rows.some(r => r.nspname === 'storage') && s.memberships.rows.every(r => r.both_endpoints_covered), 'ROLE_OR_SCHEMA_INCOMPLETE');
  need(d.candidate_live_effective_privileges === 'NOT_ESTABLISHED_UNCREATED_ROLE' && d.routine_transitive_semantics === 'NOT_PROVEN_BY_DIRECT_DEPENDENCIES' && d.managed_service_support === 'NOT_PROVEN_BY_CATALOGS' && d.authorization === 'NO_DDL_OR_INVENTORY_AUTHORITY', 'SEMANTIC_APPROVAL_NOT_ALLOWED');
  return { evidenceSha256: sha256(bytes), sectionCounts: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.observed])), privilegeDecision: 'BLOCKED_PENDING_REVIEW', rlsDecision: 'BLOCKED_PENDING_REVIEW', managedSupport: 'UNKNOWN' };
}

const AUTH_KEYS = ['schema', 'decision', 'authorizationId', 'notBeforeUtc', 'expiresUtc', 'sqlSha256', 'packetSha256', 'runnerBinding', 'target', 'privateDirectory', 'runnerReviewSha256', 'zeroAdditionalCostConfirmed', 'privateSinkApproved', 'maxConnections', 'maxAuthenticationAttempts', 'maxMetadataSelects', 'retries'];
function validateAuthorization(bytes, expectedSha, reviewBytes, plan, directory, now, synthetic) {
  need(Buffer.isBuffer(bytes) && bytes.length <= 8192 && hex(expectedSha) && sha256(bytes) === expectedSha && Buffer.isBuffer(reviewBytes) && reviewBytes.length <= 8192, 'AUTHORIZATION_REQUIRED');
  let a, review; try { a = JSON.parse(bytes); review = JSON.parse(reviewBytes); } catch { fail('AUTHORIZATION_REQUIRED'); }
  need(exact(a, AUTH_KEYS) && a.schema === (synthetic ? 'OGH_CATALOG_SYNTHETIC_AUTH_V1' : 'OGH_CATALOG_OWNER_AUTH_V1') && a.decision === 'AUTHORIZE_EXACT_CATALOG_READ_ONCE', 'AUTHORIZATION_SCOPE');
  need(typeof a.authorizationId === 'string' && /^catalog-[a-z0-9-]{16,80}$/.test(a.authorizationId), 'AUTHORIZATION_SCOPE');
  need(exact(a.target, Object.keys(TARGET)) && Object.keys(TARGET).every(k => a.target[k] === TARGET[k]) && a.sqlSha256 === SQL_SHA256 && a.packetSha256 === PACKET_SHA256 && a.runnerBinding === plan.runnerBinding && a.privateDirectory === directory, 'AUTHORIZATION_BINDING');
  need(exact(review, ['schema', 'decision', 'runnerBinding', 'sqlSha256']) && review.schema === (synthetic ? 'SYNTHETIC_REVIEW_ONLY' : 'OGH_INDEPENDENT_RUNNER_REVIEW_V1') && review.decision === 'RUNNER_OFFLINE_REVIEW_APPROVED' && review.runnerBinding === plan.runnerBinding && review.sqlSha256 === SQL_SHA256 && sha256(reviewBytes) === a.runnerReviewSha256, 'INDEPENDENT_RUNNER_REVIEW_REQUIRED');
  const start = Date.parse(a.notBeforeUtc), end = Date.parse(a.expiresUtc);
  need(typeof a.notBeforeUtc === 'string' && a.notBeforeUtc.endsWith('Z') && typeof a.expiresUtc === 'string' && a.expiresUtc.endsWith('Z') && Number.isFinite(start) && Number.isFinite(end) && now >= start && end - now >= LIMITS.totalMs, 'AUTHORIZATION_WINDOW');
  need(a.zeroAdditionalCostConfirmed === true && a.privateSinkApproved === true && a.maxConnections === 1 && a.maxAuthenticationAttempts === 1 && a.maxMetadataSelects === 1 && a.retries === 0, 'AUTHORIZATION_LIMITS');
  return a;
}

const systemClock = Object.freeze({ now: () => performance.now(), wall: () => Date.now(), set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) });
export async function bounded(operation, ms, clock, code) {
  need(ms > 0, code);
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = clock.set(() => reject(Object.assign(new Error(code), { safeCode: code })), ms); })]); }
  finally { if (timer !== undefined) clock.clear(timer); }
}
const SAFE_ERRORS = new Set(['CONNECTION_TIMEOUT', 'OVERALL_DEADLINE', 'CLEANUP_TIMEOUT', 'RESULT_SIZE', 'RESULT_JSON', 'RESULT_SHAPE', 'MISSING_SECTIONS', 'IDENTITY_SHAPE', 'IDENTITY_MISMATCH', 'INCOMPLETE_EVIDENCE', 'SECTION_SHAPE', 'SECTION_BOUNDS', 'RECORD_SHAPE_OR_BOUNDS', 'TARGET_MISSING', 'REQUIRED_COLUMNS_MISSING', 'ROLE_OR_SCHEMA_INCOMPLETE', 'SEMANTIC_APPROVAL_NOT_ALLOWED', 'TLS_OR_ENDPOINT_MISMATCH', 'SQL_ORDER', 'SECOND_CONNECTION_DENIED', 'SECOND_AUTH_DENIED', 'WIRE_SIZE', 'PRIVATE_SINK_UNAVAILABLE', 'PRIVATE_PERSISTENCE_UNCERTAIN', 'AUTHORIZATION_ALREADY_USED', 'AUTHORIZATION_REQUIRED', 'AUTHORIZATION_SCOPE', 'AUTHORIZATION_BINDING', 'AUTHORIZATION_WINDOW', 'AUTHORIZATION_LIMITS', 'INDEPENDENT_RUNNER_REVIEW_REQUIRED', 'SQL_IDENTITY_MISMATCH', 'PACKET_IDENTITY_MISMATCH', 'SQL_PLAN_BOUNDARY', 'UNBOUND_PLAN', 'TRANSPORT_UNAVAILABLE', 'OFFLINE_TRANSPORT_REQUIRED', 'TRUST_MATERIAL_INVALID']);
function safeError(error) { return SAFE_ERRORS.has(error?.safeCode) ? error.safeCode : typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? 'SQLSTATE_' + error.code : 'SANITIZED_FAILURE'; }

async function execute(options, synthetic, clock) {
  const { plan, authorizationBytes, expectedAuthorizationSha256, reviewBytes, sink, transportFactory } = options;
  const receipt = { schema: 'OGH_CATALOG_PREFLIGHT_RECEIPT_V1', mode: synthetic ? 'SYNTHETIC_ONLY' : 'OWNER_AUTHORIZED_CATALOG_ONLY', sqlSha256: SQL_SHA256, outcome: 'BLOCKED', firstFailure: null, failureStage: null, connectionAttempts: 0, authenticationAttempts: 0, metadataSelects: 0, retries: 0, cleanup: 'NOT_NEEDED', fileClose: 'NOT_NEEDED', receiptPersistence: 'NOT_CONFIRMED', privilegeDecision: 'BLOCKED_PENDING_REVIEW', rlsDecision: 'BLOCKED_PENDING_REVIEW', managedSupport: 'UNKNOWN', productionWrites: 0, mediaInventory: 'NOT_EXECUTED' };
  const start = clock.now(), deadline = start + LIMITS.totalMs;
  let stage = 'ADMISSION', transport, selected, auth, transactionSent = false, rollbackSent = false;
  const remaining = () => deadline - clock.now();
  const first = error => { if (!receipt.firstFailure) { receipt.firstFailure = safeError(error); receipt.failureStage = stage; } receipt.outcome = 'BLOCKED'; };
  const scoped = async (operation, ms, code) => {
    let active = true;
    const expires = Math.min(deadline, clock.now() + ms);
    const budget = Object.freeze({ active: () => active && clock.now() < expires,
      async cleanup(operation) {
        const value = await bounded(operation, Math.min(LIMITS.cleanupMs, remaining()), clock, 'PRIVATE_PERSISTENCE_UNCERTAIN');
        need(remaining() > 0, 'PRIVATE_PERSISTENCE_UNCERTAIN');
        return value;
      },
    });
    try { return await bounded(() => operation(budget), ms, clock, code); }
    finally { active = false; }
  };
  const work = (operation, max = LIMITS.statementMs + 500) => scoped(operation, Math.min(max, remaining() - LIMITS.cleanupMs), 'OVERALL_DEADLINE');
  try {
    assertPlan(plan);
    need(sink && transportFactory && (synthetic
      ? sink.kind === 'SYNTHETIC' && transportFactory.kind === 'SYNTHETIC'
      : isTrustedPrivateSink(sink) && isTrustedPgFactory(transportFactory)), 'OFFLINE_TRANSPORT_REQUIRED');
    need(typeof sink.directory === 'string', 'PRIVATE_SINK_UNAVAILABLE');
    auth = validateAuthorization(authorizationBytes, expectedAuthorizationSha256, reviewBytes, plan, sink.directory, clock.wall(), synthetic);
    stage = 'PRIVATE_SINK_ADMISSION';
    need(await work(budget => sink.verify(budget)) === true, 'PRIVATE_SINK_UNAVAILABLE');
    selected = true;
    stage = 'AUTHORIZATION_CONSUMPTION';
    need(await work(budget => sink.consume({ authorizationSha256: expectedAuthorizationSha256, runnerBinding: plan.runnerBinding, authorizationId: auth.authorizationId }, budget)) === true, 'AUTHORIZATION_ALREADY_USED');
    stage = 'TRANSPORT_PREPARATION';
    const permit = Object.freeze({});
    if (!synthetic) nativePermits.set(permit, plan);
    try { transport = await work(budget => transportFactory.create(plan, permit, budget)); }
    finally { nativePermits.delete(permit); }
    need(exact(transport.target, Object.keys(TARGET)) && Object.keys(TARGET).every(k => transport.target[k] === TARGET[k]) && transport.tls.peerVerification === true && transport.tls.hostnameVerification === true && transport.tls.servername === TARGET.host && transport.tls.fallback === false, 'TLS_OR_ENDPOINT_MISMATCH');
    stage = 'CONNECTION';
    const connectionStart = clock.now();
    await bounded(() => transport.connect(), Math.min(LIMITS.connectMs, remaining() - LIMITS.cleanupMs), clock, 'CONNECTION_TIMEOUT');
    need(clock.now() - connectionStart <= LIMITS.connectMs && remaining() > LIMITS.cleanupMs, 'CONNECTION_TIMEOUT');
    const peer = transport.status();
    need(peer.connections === 1 && peer.authentications === 1 && peer.peerVerified && peer.hostnameVerified, 'TLS_OR_ENDPOINT_MISMATCH');
    for (let i = 0; i < 6; i++) {
      stage = i === 5 ? 'CATALOG_SELECT' : 'TRANSACTION_SETUP';
      if (i === 0) transactionSent = true;
      const response = await work(() => transport.step(i));
      if (i === 5) {
        const facts = transport.status();
        need(facts.connections === 1 && facts.authentications === 1 && facts.metadataSelects === 1 && facts.wireBytes <= LIMITS.wireBytes, 'WIRE_SIZE');
        receipt.metadataSelects = facts.metadataSelects;
        need(Buffer.isBuffer(response), 'RESULT_SHAPE');
        const accepted = validateEvidence(response);
        stage = 'PRIVATE_EVIDENCE_PERSISTENCE';
        need(await work(budget => sink.verify(budget)) === true, 'PRIVATE_SINK_UNAVAILABLE');
        need(await work(budget => sink.writeEvidence(response, accepted.evidenceSha256, budget)) === accepted.evidenceSha256, 'PRIVATE_PERSISTENCE_UNCERTAIN');
        Object.assign(receipt, accepted);
      }
    }
    stage = 'ROLLBACK'; rollbackSent = true;
    await bounded(() => transport.step(6), Math.min(1500, remaining() - 1000), clock, 'CLEANUP_TIMEOUT');
    receipt.outcome = 'CATALOG_CAPTURED_REQUIRES_INDEPENDENT_REVIEW';
  } catch (error) { first(error); }
  finally {
    if (transport) {
      stage = 'CLEANUP';
      if (transactionSent && !rollbackSent && transport.status().queryable && remaining() > 1500) {
        rollbackSent = true;
        try { await bounded(() => transport.step(6), Math.min(1000, remaining() - 1000), clock, 'CLEANUP_TIMEOUT'); }
        catch (error) { first(error); }
      }
      try { await bounded(() => transport.close(), Math.min(1500, remaining() - 750), clock, 'CLEANUP_TIMEOUT'); }
      catch (error) { first(error); transport.abort(); }
      const status = transport.status();
      receipt.connectionAttempts = status.connections;
      receipt.authenticationAttempts = status.authentications;
      receipt.metadataSelects = status.metadataSelects;
      receipt.cleanup = status.closed ? 'CONFIRMED_CLIENT_SIDE' : 'UNCONFIRMED';
      if (!status.closed) { transport.abort(); first(Object.assign(new Error(), { safeCode: 'CLEANUP_TIMEOUT' })); }
    }
    const observeFileClose = () => {
      if (!synthetic && selected) {
        receipt.fileClose = sink.status().fileClose;
        if (receipt.fileClose === 'UNCONFIRMED') first(Object.assign(new Error(), { safeCode: 'PRIVATE_PERSISTENCE_UNCERTAIN' }));
      }
    };
    observeFileClose();
    if (selected && remaining() > 0) {
      stage = 'RECEIPT_PERSISTENCE';
      try {
        receipt.elapsedMs = Math.max(0, Math.ceil(clock.now() - start));
        need(await scoped(budget => sink.writeReceipt(Buffer.from(JSON.stringify(receipt)), budget), remaining(), 'PRIVATE_PERSISTENCE_UNCERTAIN') === true, 'PRIVATE_PERSISTENCE_UNCERTAIN');
        receipt.receiptPersistence = 'CONFIRMED';
      } catch (error) { receipt.receiptPersistence = 'UNCONFIRMED'; first(error); }
    }
    observeFileClose();
    receipt.elapsedMs = Math.max(0, Math.ceil(clock.now() - start));
    if (selected && receipt.receiptPersistence !== 'CONFIRMED') first(Object.assign(new Error(), { safeCode: 'PRIVATE_PERSISTENCE_UNCERTAIN' }));
    if (receipt.elapsedMs > LIMITS.totalMs) first(Object.assign(new Error(), { safeCode: 'OVERALL_DEADLINE' }));
  }
  return Object.freeze(receipt);
}

// No live CLI, credential lookup or invocation occurs on import.
export const runAuthorizedProbe = options => execute(options, false, systemClock);
export const runOfflineFixture = (options, clock = systemClock) => execute(options, true, clock);
