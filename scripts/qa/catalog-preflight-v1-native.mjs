import { X509Certificate } from 'node:crypto';
import { Socket } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { lstat, realpath, open, readFile } from 'node:fs/promises';
import { resolve, relative, dirname, join, isAbsolute, basename } from 'node:path';
import { ROOT, TARGET, LIMITS, PG_ROOT, assertPlan, claimNativePermit, fail, sha256 } from './catalog-preflight-v1.mjs';

const exec = promisify(execFile);
const CA_SHA256 = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';
const need = (ok, code) => { if (!ok) fail(code); };
const active = budget => need(budget?.active() === true, 'PRIVATE_PERSISTENCE_UNCERTAIN');
const equalPath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
const inside = (root, path) => { const r = relative(root, path); return r === '' || !r.startsWith('..') && !isAbsolute(r); };

export function createAttemptGuard() {
  let connections = 0, authentications = 0;
  return Object.freeze({ connection(host, port) {
    need(host === TARGET.host && port === TARGET.port, 'TLS_OR_ENDPOINT_MISMATCH');
    need(connections === 0, 'SECOND_CONNECTION_DENIED'); return ++connections;
  }, authentication() { need(authentications === 0, 'SECOND_AUTH_DENIED'); return ++authentications; } });
}

export function assertAcl(snapshot, requireProtected = true) {
  need(snapshot && typeof snapshot.currentSid === 'string' && /^S-1-5-21-\d+-\d+-\d+-\d+$/.test(snapshot.currentSid) && [snapshot.currentSid, 'S-1-5-18'].includes(snapshot.ownerSid) && (!requireProtected || snapshot.protected === true) && snapshot.reparse === false && snapshot.deniedAny === false && Array.isArray(snapshot.allows) && snapshot.allows.length >= 2 && snapshot.allows.length <= 8 && snapshot.allows.every(a => [snapshot.currentSid, 'S-1-5-18'].includes(a.sid)) && [snapshot.currentSid, 'S-1-5-18'].every(sid => snapshot.allows.some(a => a.sid === sid && a.fullControl === true)), 'PRIVATE_SINK_UNAVAILABLE');
}
async function inspectAcl(path) {
  need(process.platform === 'win32', 'PRIVATE_SINK_UNAVAILABLE');
  const literal = path.replaceAll("'", "''");
  const script = `$ErrorActionPreference='Stop';$p='${literal}';$a=if([IO.Directory]::Exists($p)){[IO.Directory]::GetAccessControl($p)}else{[IO.File]::GetAccessControl($p)};$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$rules=$a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]);$out=[ordered]@{currentSid=$sid;ownerSid=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value;protected=$a.AreAccessRulesProtected;reparse=(([IO.File]::GetAttributes($p)-band [IO.FileAttributes]::ReparsePoint)-ne 0);deniedAny=(@($rules|Where-Object{$_.AccessControlType-ne 'Allow'}).Count-ne 0);allows=@($rules|Where-Object{$_.AccessControlType-eq 'Allow'}|ForEach-Object{@{sid=$_.IdentityReference.Value;fullControl=(($_.FileSystemRights-band [Security.AccessControl.FileSystemRights]::FullControl)-eq [Security.AccessControl.FileSystemRights]::FullControl)}})};$out|ConvertTo-Json -Depth 4 -Compress`;
  try {
    const wrapped = `try {${script}} catch {@{failed=$true;kind=$_.Exception.GetType().FullName;category=$_.CategoryInfo.Category.ToString()}|ConvertTo-Json -Compress}`;
    const { stdout } = await exec('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(wrapped, 'utf16le').toString('base64')], { windowsHide: true, timeout: 1500, maxBuffer: 8192, encoding: 'utf8' });
    const result = JSON.parse(stdout.trim());
    if (result.failed) throw Object.assign(new Error('PRIVATE_SINK_UNAVAILABLE'), { safeReason: /^[A-Za-z0-9_.]{1,100}$/.test(result.kind) ? result.kind : 'UNKNOWN', safeCategory: /^[A-Za-z]{1,60}$/.test(result.category) ? result.category : 'UNKNOWN' });
    return result;
  } catch (error) { throw Object.assign(new Error('PRIVATE_SINK_UNAVAILABLE'), { safeCode: 'PRIVATE_SINK_UNAVAILABLE', safeReason: error.safeReason ?? 'ACL_COMMAND_OR_JSON_FAILURE', safeCategory: error.safeCategory ?? 'UNKNOWN' }); }
}
export function createPrivateSink(directory) {
  need(process.platform === 'win32' && typeof directory === 'string' && /^[A-Za-z]:[\\/]/.test(directory), 'PRIVATE_SINK_UNAVAILABLE');
  const root = resolve(directory);
  need(/^ogh-catalog-preflight-private-[a-z0-9-]{8,80}$/.test(basename(root)) && !inside(ROOT, root) && !inside('D:\\OpenGlass Hub', root), 'PRIVATE_SINK_UNAVAILABLE');
  let identity;
  async function verify(budget) {
    let phase = 'PATH';
    try {
      active(budget);
      need(equalPath(await realpath(root), root), 'PRIVATE_SINK_UNAVAILABLE');
      for (let p = root; ; p = dirname(p)) {
        active(budget);
        const s = await lstat(p);
        need(!s.isSymbolicLink(), 'PRIVATE_SINK_UNAVAILABLE');
        if (p === dirname(p)) break;
      }
      const s = await lstat(root);
      phase = 'DIRECTORY_IDENTITY';
      need(s.isDirectory(), 'PRIVATE_SINK_UNAVAILABLE');
      const stamp = `${s.dev}:${s.ino}`;
      need(identity === undefined || identity === stamp, 'PRIVATE_SINK_UNAVAILABLE');
      phase = 'ACL_QUERY';
      active(budget);
      const snapshot = await inspectAcl(root);
      active(budget);
      phase = 'ACL_CONTRACT';
      assertAcl(snapshot);
      identity = stamp;
      return true;
    } catch (error) { throw Object.assign(new Error('PRIVATE_SINK_UNAVAILABLE'), { safeCode: 'PRIVATE_SINK_UNAVAILABLE', safeStage: phase, safeReason: error.safeReason ?? 'CONTRACT_MISMATCH', safeCategory: error.safeCategory ?? 'UNKNOWN' }); }
  }
  async function persist(name, bytes, expected, budget) {
    await verify(budget);
    const path = join(root, name);
    let handle;
    try {
      active(budget);
      handle = await open(path, 'wx', 0o600);
      active(budget);
      const s = await handle.stat();
      active(budget);
      need(s.isFile() && s.nlink === 1, 'PRIVATE_SINK_UNAVAILABLE');
      assertAcl(await inspectAcl(path), false);
      active(budget);
      await handle.writeFile(bytes); active(budget);
      await handle.sync(); await handle.close(); handle = null;
      await verify(budget);
      assertAcl(await inspectAcl(path), false);
      active(budget);
      need(sha256(await readFile(path)) === expected, 'PRIVATE_PERSISTENCE_UNCERTAIN');
      active(budget);
      return expected;
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (error?.code === 'EEXIST') fail(name.endsWith('.used') ? 'AUTHORIZATION_ALREADY_USED' : 'PRIVATE_PERSISTENCE_UNCERTAIN');
      fail('PRIVATE_PERSISTENCE_UNCERTAIN');
    }
  }
  return Object.freeze({ kind: 'WINDOWS_PRIVATE_FILES', directory: root, verify,
    async consume(record, budget) { const bytes = Buffer.from(JSON.stringify(record)); await persist('catalog-preflight-v1.authorization.used', bytes, sha256(bytes), budget); return true; },
    writeEvidence: (bytes, digest, budget) => persist('catalog-evidence.private.json', bytes, digest, budget),
    async writeReceipt(bytes, budget) { await persist('catalog-result.safe.json', bytes, sha256(bytes), budget); return true; },
  });
}

export function prepareTls(caPem) {
  try {
    need(typeof caPem === 'string' && caPem.length <= 16384, 'TRUST_MATERIAL_INVALID');
    const blocks = caPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
    need(blocks.length === 1 && caPem.replace(blocks[0], '').trim() === '', 'TRUST_MATERIAL_INVALID');
    const cert = new X509Certificate(caPem);
    need(cert.ca && cert.fingerprint256.replaceAll(':', '').toLowerCase() === CA_SHA256 && Date.now() >= Date.parse(cert.validFrom) && Date.now() < Date.parse(cert.validTo), 'TRUST_MATERIAL_INVALID');
    return Object.freeze({ ca: caPem, rejectUnauthorized: true, servername: TARGET.host, checkServerIdentity });
  } catch { fail('TRUST_MATERIAL_INVALID'); }
}

// This is a dormant factory: construction/import does not read credentials or connect.
export function createExactPgFactory({ password, caPem }) {
  return Object.freeze({ kind: 'NATIVE_EXACT_PG', async create(plan, permit, budget) {
    assertPlan(plan);
    claimNativePermit(permit, plan);
    active(budget);
    const ssl = prepareTls(caPem);
    need(typeof password === 'string' && password.length > 0, 'TRANSPORT_UNAVAILABLE');
    const Client = createRequire(PG_ROOT + '/package.json')(PG_ROOT + '/lib/client.js');
    active(budget);
    const attempts = createAttemptGuard();
    const state = { connections: 0, authentications: 0, metadataSelects: 0, wireBytes: 0, peerVerified: false, hostnameVerified: false, closed: false, queryable: false };
    let fatal = false, next = 0, begun = false, rolledBack = false, tcpClosed = false, tlsClosed = false, endObserved = false, tlsStream, firstError;
    let resolveClosed;
    const closed = new Promise(resolve => { resolveClosed = resolve; });
    const observeClosure = () => { if (endObserved && tcpClosed && (!tlsStream || tlsClosed)) resolveClosed(); };
    const guardedFailure = code => { fatal = true; state.queryable = false; firstError ??= Object.assign(new Error(code), { safeCode: code }); return firstError; };
    class SingleSocket extends Socket {
      connect(port, host) {
        state.connections = attempts.connection(host, port);
        return super.connect({ port, host, family: 4, autoSelectFamily: false });
      }
    }
    const raw = new SingleSocket();
    raw.once('close', () => { tcpClosed = true; observeClosure(); });
    const client = new Client({ host: TARGET.host, port: TARGET.port, database: TARGET.database, user: TARGET.login, password,
      ssl, stream: raw, connectionTimeoutMillis: LIMITS.connectMs, statement_timeout: false, lock_timeout: false, idle_in_transaction_session_timeout: false,
      query_timeout: LIMITS.statementMs + 500, application_name: 'ogh-catalog-preflight-v1', client_encoding: 'UTF8', sslnegotiation: 'postgres', options: ' ', keepAlive: false, pipeline: false });
    client.on('error', error => {
      fatal = true; state.queryable = false;
      firstError ??= /^[0-9A-Z]{5}$/.test(String(error?.code ?? ''))
        ? Object.assign(new Error('POSTGRES_FAILURE'), { code: error.code })
        : Object.assign(new Error('TRANSPORT_UNAVAILABLE'), { safeCode: 'TRANSPORT_UNAVAILABLE' });
    });
    client.once('end', () => { endObserved = true; observeClosure(); });
    const connection = client.connection;
    const startup = connection.startup.bind(connection);
    connection.startup = packet => {
      state.authentications = attempts.authentication();
      need(packet.user === TARGET.login && packet.database === TARGET.database, 'TLS_OR_ENDPOINT_MISMATCH');
      return startup({ user: TARGET.login, database: TARGET.database, client_encoding: 'UTF8', application_name: 'ogh-catalog-preflight-v1' });
    };
    connection.on('sslconnect', () => {
      tlsStream = connection.stream;
      tlsStream.once('close', () => { tlsClosed = true; observeClosure(); });
      tlsStream.prependListener('data', bytes => {
        state.wireBytes += bytes.length;
        if (state.wireBytes > LIMITS.wireBytes) {
          fatal = true; state.queryable = false;
          tlsStream.destroy(guardedFailure('WIRE_SIZE'));
        }
      });
      tlsStream.once('secureConnect', () => {
        state.peerVerified = tlsStream.authorized === true;
        state.hostnameVerified = !checkServerIdentity(TARGET.host, tlsStream.getPeerCertificate()) && tlsStream.servername === TARGET.host;
        if (!state.peerVerified || !state.hostnameVerified) tlsStream.destroy(guardedFailure('TLS_OR_ENDPOINT_MISMATCH'));
      });
    });
    const wireQuery = connection.query.bind(connection);
    let pending;
    connection.query = text => {
      if (text !== pending) throw guardedFailure('SQL_ORDER');
      return wireQuery(text);
    };
    const abort = () => { fatal = true; state.queryable = false; tlsStream?.destroy(); raw.destroy(); };
    return Object.freeze({ target: TARGET, tls: Object.freeze({ peerVerification: true, hostnameVerification: true, servername: TARGET.host, fallback: false }),
      async connect() {
        if (state.connections !== 0 || state.authentications !== 0) throw guardedFailure('SECOND_CONNECTION_DENIED');
        await client.connect();
        need(state.peerVerified && state.hostnameVerified, 'TLS_OR_ENDPOINT_MISMATCH'); state.queryable = true;
      },
      async step(index) {
        if (fatal && firstError) throw firstError;
        if (fatal || rolledBack || !state.queryable || index === 6 && !begun || index !== 6 && index !== next) throw guardedFailure('SQL_ORDER');
        if (index === 0) begun = true;
        if (index === 5) state.metadataSelects++;
        if (index === 6) rolledBack = true; else next++;
        pending = plan.steps[index];
        need(typeof pending === 'string', 'SQL_ORDER');
        try {
          const result = await client.query({ text: pending, query_timeout: index === 6 ? 1500 : LIMITS.statementMs + 500 });
          if (index !== 5) return null;
          need(result.rowCount === 1 && result.rows.length === 1 && Object.keys(result.rows[0]).join(',') === 'catalog_evidence_private', 'RESULT_SHAPE');
          const bytes = Buffer.from(JSON.stringify(result.rows[0].catalog_evidence_private));
          need(bytes.length <= LIMITS.fieldBytes, 'RESULT_SIZE');
          return bytes;
        } finally { pending = undefined; }
      },
      async close() { state.queryable = false; await client.end(); if (!state.connections) raw.destroy(); observeClosure(); await closed; if (firstError) throw firstError; }, abort,
      status() { return { ...state, queryable: state.queryable && !fatal && !raw.destroyed, closed: endObserved && tcpClosed && (!tlsStream || tlsClosed) }; },
    });
  } });
}
