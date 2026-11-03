import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { protectedOperation } from '../e-verify-group1-remaining-assets/private-evidence.mjs';

// Start before the existing Node guard. Only this already-owned stdio pipe is used afterwards.
export async function openProtectedOrigins({ directory, storeId, namespace = 'e-verify-group1-offline-origin-' + randomBytes(16).toString('hex'),
  expiresUTC = new Date(Date.now() + 3600000).toISOString(), reopen = false } = {}) {
  if (!/^e-verify-group1-offline-origin-[a-f0-9]{32}$/.test(namespace)) throw Error('PRIVATE_NAMESPACE_INVALID');
  const root = path.resolve(process.env.LOCALAPPDATA, 'OpenGlassHub', 'private-origin');
  if (storeId !== undefined && !/^[a-f0-9]{32}$/.test(storeId)) throw Error('PRIVATE_DIRECTORY_SCOPE');
  directory = path.resolve(directory ?? path.join(root, storeId ?? randomBytes(16).toString('hex')));
  if (path.dirname(directory) !== root || !/^[a-f0-9]{32}$/.test(path.basename(directory))) throw Error('PRIVATE_DIRECTORY_SCOPE');
  const expiry = Date.parse(expiresUTC);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 86400000) throw Error('PRIVATE_EXPIRY_INVALID');
  if (!reopen && protectedOperation('Initialize', namespace, { directory }) !== 'PRIVATE_EVIDENCE_READY') throw Error('PRIVATE_INITIALIZATION_FAILED');
  const child = spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    fileURLToPath(new URL('./protected-origin.ps1', import.meta.url)), '-Directory', directory, '-Namespace', namespace],
  { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: Object.fromEntries(['SystemRoot', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'TEMP', 'TMP'].map(k => [k, process.env[k]])) });
  let closed = false, waiter, tail = Promise.resolve(); const records = new Map();
  const lines = createInterface({ input: child.stdout });
  const fail = () => { waiter?.reject(Error('PROTECTED_ORIGIN_UNAVAILABLE')); waiter = undefined; };
  child.on('error', fail); child.on('exit', fail); child.stderr.on('data', () => {});
  lines.on('line', line => {
    if (!waiter) { child.kill(); return; }
    const w = waiter; waiter = undefined;
    try { if (line.length > 4096) throw Error(); const data = JSON.parse(line);
      if (data.ok !== true) throw Error(); w.resolve(data);
    } catch { w.reject(Error('PROTECTED_ORIGIN_OPERATION_FAILED')); }
  });
  const receive = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { fail(); child.kill(); reject(Error('PROTECTED_ORIGIN_TIMEOUT')); }, 5000);
    waiter = { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } };
  });
  try { const ready = await receive(); if (!ready.ready) throw Error('PRIVATE_INITIALIZATION_FAILED'); }
  catch (error) { child.kill(); throw error; }
  const operation = q => {
    const result = tail.then(async () => {
      if (closed || child.exitCode !== null) throw Error('PROTECTED_ORIGIN_CLOSED');
      const reply = receive(); child.stdin.write(JSON.stringify(q) + '\n', error => { if (error) fail(); }); return reply;
    });
    tail = result.catch(() => {}); return result;
  };
  return Object.freeze({
    // This locator is private caller state, never included in a shareable receipt.
    locator: Object.freeze({ directory, namespace, expiresUTC }),
    async capture(origin) {
      const keys = Object.keys(origin ?? {}).sort().join(',');
      const labels = String(origin?.host ?? '').split('.');
      if (Date.now() >= expiry || records.size >= 16 || keys !== 'host,port,scheme' || origin.scheme !== 'https:' || isIP(origin.host)
        || !/^[a-z0-9.-]{1,253}$/.test(origin.host) || labels.length < 2 || origin.host.endsWith('.local')
        || labels.some(x => !/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(x) || /[a-f0-9]{24,}/i.test(x))
        || !/^[0-9]{1,5}$/.test(origin.port) || +origin.port < 1 || +origin.port > 65535) throw Error('PRIVATE_ORIGIN_SCOPE');
      const ref = 'origin-' + randomBytes(16).toString('hex');
      const response = await operation({ op: 'capture', ref, origin: { ...origin }, expiresUTC });
      if (response.ref !== ref || !/^[a-f0-9]{64}$/.test(response.sha256)) throw Error('PRIVATE_CAPTURE_INVALID');
      records.set(ref, response.sha256); return ref;
    },
    async read(ref, sha256 = records.get(ref)) {
      if (!/^origin-[a-f0-9]{32}$/.test(ref) || !/^[a-f0-9]{64}$/.test(sha256 ?? '')) throw Error('PRIVATE_REFERENCE_INVALID');
      return (await operation({ op: 'read', ref, sha256 })).origin;
    },
    receipt: () => ({ protection: 'CURRENT_USER_DPAPI_OWNER_SYSTEM_DACL', lifetimeExpiresUTC: expiresUTC,
      evidenceStoreId: path.basename(directory), storageNamespace: namespace, storageNamespaceIsNotAuthorization: true,
      evidence: [...records].map(([evidenceRef, ciphertextSha256]) => ({ evidenceRef, ciphertextSha256 })), export: 'NO_RAW_ORIGIN_EXPORT' }),
    async close({ destroy = false } = {}) {
      if (closed) return;
      try { await operation({ op: destroy ? 'destroy' : 'close' }); }
      finally {
        closed = true; child.stdin.end();
        if (child.exitCode === null) await new Promise(resolve => {
          const timer = setTimeout(() => { child.kill(); resolve(); }, 1000);
          child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
        lines.close(); records.clear();
      }
      if (destroy && fs.existsSync(directory)) throw Error('PRIVATE_CLEANUP_FAILED');
    }
  });
}
