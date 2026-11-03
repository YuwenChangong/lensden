import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openProtectedOrigins } from './private-origin.mjs';
const origin = { scheme: 'https:', host: 'private-fixture.example.invalid', port: '443' };

test('DPAPI, exact owner/SYSTEM DACL, private read, ciphertext hash and reopen work without a plaintext file', async () => {
  let store = await openProtectedOrigins(); const locator = store.locator;
  try {
    const ref = await store.capture(origin); const index = store.receipt().evidence[0];
    assert.deepEqual(await store.read(ref), origin);
    assert.ok(!fs.readFileSync(path.join(locator.directory, ref + '.dpapi')).includes(Buffer.from(origin.host)));
    assert.ok(!JSON.stringify(store.receipt()).includes(origin.host));
    const safeIndex = store.receipt(); await store.close();
    store = await openProtectedOrigins({ storeId: safeIndex.evidenceStoreId, namespace: safeIndex.storageNamespace, expiresUTC: safeIndex.lifetimeExpiresUTC, reopen: true });
    assert.deepEqual(await store.read(ref, index.ciphertextSha256), origin);
    await assert.rejects(store.read(ref, '0'.repeat(64)), /PROTECTED_ORIGIN_OPERATION_FAILED/);
    await assert.rejects(store.read('../outside', index.ciphertextSha256), /PRIVATE_REFERENCE_INVALID/);
    const file = path.join(locator.directory, ref + '.dpapi'), bytes = fs.readFileSync(file); bytes[40] ^= 1; fs.writeFileSync(file, bytes);
    await assert.rejects(store.read(ref, index.ciphertextSha256), /PROTECTED_ORIGIN_OPERATION_FAILED/);
  } finally { await store.close({ destroy: true }); }
  assert.equal(fs.existsSync(locator.directory), false);
});

test('privacy envelope, storage path and lifetime reject instead of degrading to plaintext', async () => {
  await assert.rejects(openProtectedOrigins({ directory: process.env.TEMP }), /PRIVATE_DIRECTORY_SCOPE/);
  await assert.rejects(openProtectedOrigins({ expiresUTC: new Date(Date.now() - 1000).toISOString() }), /PRIVATE_EXPIRY_INVALID/);
  const store = await openProtectedOrigins();
  try {
    for (const value of [{ ...origin, query: 'PRIVATE' }, { ...origin, host: '127.0.0.1' }, { ...origin, scheme: 'http:' },
      { ...origin, host: 'a'.repeat(64) + '.example.invalid' }, { ...origin, port: '99999' }]) {
      await assert.rejects(store.capture(value), /PRIVATE_ORIGIN_SCOPE/);
    }
    assert.equal(store.receipt().evidence.length, 0);
  } finally { await store.close({ destroy: true }); }
});

test('concurrent evidence writes are serialized and bounded, independent of network admission caps', async () => {
  const store = await openProtectedOrigins();
  try {
    const refs = await Promise.all(Array.from({ length: 16 }, () => store.capture(origin)));
    assert.equal(new Set(refs).size, 16);
    await assert.rejects(store.capture(origin), /PRIVATE_ORIGIN_SCOPE/);
    assert.equal(store.receipt().evidence.length, 16);
  } finally { await store.close({ destroy: true }); }
});

test('DACL broadening and a reparse replacement are refused before private evidence is read', async () => {
  let store = await openProtectedOrigins(); const locator = store.locator;
  const ref = await store.capture(origin), hash = store.receipt().evidence[0].ciphertextSha256;
  await store.close();
  const ps = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  const target = locator.directory.replaceAll("'", "''");
  const command = "$ErrorActionPreference='Stop';$d=[IO.DirectoryInfo]::new('" + target + "');$a=$d.GetAccessControl();$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'Read','Allow'));$d.SetAccessControl($a)";
  // Local ACL negative fixture only; no credentials are passed to a command line.
  const options = { windowsHide: true, env: Object.fromEntries(['SystemRoot', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'TEMP', 'TMP'].map(k => [k, process.env[k]])) };
  let r = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], options);
  assert.equal(r.status, 0);
  let unexpected;
  try { await assert.rejects(async () => { unexpected = await openProtectedOrigins({ ...locator, reopen: true }); }, /PROTECTED_ORIGIN/); }
  finally {
    await unexpected?.close();
    const restore = "$ErrorActionPreference='Stop';$d=[IO.DirectoryInfo]::new('" + target + "');$a=$d.GetAccessControl();$a.PurgeAccessRules([Security.Principal.SecurityIdentifier]::new('S-1-1-0'));$d.SetAccessControl($a)";
    r = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(restore, 'utf16le').toString('base64')], options);
  }
  assert.equal(r.status, 0);
  store = await openProtectedOrigins({ ...locator, reopen: true });
  const file = path.join(locator.directory, ref + '.dpapi'), saved = file + '.fixture-backup';
  fs.renameSync(file, saved);
  try {
    fs.symlinkSync(locator.directory, file, 'junction');
    await assert.rejects(store.read(ref, hash), /PROTECTED_ORIGIN_OPERATION_FAILED/);
  } finally {
    try { if (fs.existsSync(file)) fs.rmdirSync(file); fs.renameSync(saved, file); }
    finally { await store.close({ destroy: true }); }
  }
});

test('expired private evidence cannot be decrypted through the query API', async () => {
  const store = await openProtectedOrigins({ expiresUTC: new Date(Date.now() + 3000).toISOString() });
  try {
    const ref = await store.capture(origin); await new Promise(resolve => setTimeout(resolve, 3100));
    await assert.rejects(store.read(ref), /PROTECTED_ORIGIN_OPERATION_FAILED/);
  } finally { await store.close({ destroy: true }); }
});
