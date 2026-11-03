import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = await readFile(new URL('./manual-identity-download.v2.browser.js', import.meta.url), 'utf8');
const expression = 'import("/_astro/supabase-browser.CbJzQpCJ.js")';
assert.equal(source.split(expression).length, 2);
const code = source.replace(expression, 'fixtureImport()');
const id = '00000000-0000-4000-8000-000000000001';
let checks = 0;
for (const options of [{}, { role: 'admin' }, { mismatch: true }, { status: 302 }, { expired: true }, { wrongOrigin: true }]) {
  let auth = 0, worker = 0, blob, download, alerts = [];
  const window = {}; window.top = window;
  const context = {
    window, location: { origin: options.wrongOrigin ? 'https://example.invalid' : 'https://openglasshub.ogh.workers.dev', pathname: '/admin/reports/' },
    Date: class extends Date { static now() { return Date.parse(options.expired ? '2026-10-24T14:11:00Z' : '2026-10-24T12:00:00Z'); } },
    fixtureImport: async () => ({ n: () => ({ supabaseUrl: 'https://xcbnxzjlsvtgzixurcof.supabase.co', auth: {
      getSession: async () => ({ data: { session: { user: { id }, access_token: 'SECRET_FIXTURE', expires_at: 2000000000 } } }),
      getUser: async token => { auth++; assert.equal(token, 'SECRET_FIXTURE'); return { data: { user: { id } } }; },
    } }) }),
    fetch: async (url, request) => {
      worker++; assert.equal(url, 'https://openglasshub.ogh.workers.dev/api/admin/forum/me');
      assert.equal(request.redirect, 'manual'); assert.equal(request.method, 'GET');
      return { status: options.status ?? 200, redirected: false, type: 'basic', headers: new Headers(), json: async () => ({ allowed: true, user_id: options.mismatch ? 'other' : id, role: options.role ?? 'moderator', profile: { private: 'DO_NOT_SAVE' } }) };
    },
    Blob, URL: { createObjectURL: b => { blob = b; return 'blob:local-fixture'; }, revokeObjectURL() {} },
    document: { body: { appendChild() {} }, createElement: () => ({ click() { download = this.download; }, remove() {} }) },
    alert: text => alerts.push(text), AbortSignal, setTimeout, clearTimeout,
    console: { log() { throw Error('NO_LOGGING'); }, error() { throw Error('NO_LOGGING'); } },
  };
  const sandbox = vm.createContext(context);
  await vm.runInContext(code, sandbox);
  if (options.expired || options.wrongOrigin) { assert.equal(auth + worker, 0); assert.equal(blob, undefined); }
  else {
    const text = await blob.text(), result = JSON.parse(text);
    assert(!text.includes('SECRET_FIXTURE')); assert(!text.includes('DO_NOT_SAVE'));
    assert(!alerts.join('').includes(id));
    assert.equal(auth, 1); assert.equal(worker, 1);
    assert.equal(result.status, !options.role && !options.mismatch && !options.status ? 'PASS' : 'NOT_VERIFIED');
    assert.equal(download, 'ogh-manual-identity-609ead46-02cc-4d56-b892-9591ed242215.json');
    await vm.runInContext(code, sandbox); assert.equal(auth, 1); assert.equal(worker, 1);
  }
  checks++;
}
// Real local ACL/copy/readback/unlink in a disposable fixture, never actual sink.
const temp = await mkdtemp(path.join(os.tmpdir(), 'ogh-identity-import-'));
try {
  const parent = '4e447058285658339e9e0f13f2450705ce16789b2bad84d4008ec8d235e1a658';
  const nonce = '609ead46-02cc-4d56-b892-9591ed242215';
  const local = path.join(temp, 'local'), profile = path.join(temp, 'profile');
  const sink = path.join(local, 'OpenGlassHub/admin-mfa-activation', parent);
  await mkdir(sink, { recursive: true }); await mkdir(path.join(profile, 'Downloads'), { recursive: true });
  execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop';$d='" + sink.replaceAll("'", "''") + "';$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);foreach($i in @($s,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($i,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};Set-Acl -LiteralPath $d -AclObject $a"], { windowsHide: true, stdio: 'pipe' });
  const importer = new URL('./import-manual-identity-download.v2.mjs', import.meta.url);
  const sourcePin = { path: fileURLToPath(importer), sha256: createHash('sha256').update(await readFile(importer)).digest('hex') };
  await writeFile(path.join(sink, 'MANUAL_IDENTITY_DOWNLOAD_V2_APPROVAL.safe.json'), JSON.stringify({ parentBinding: parent, nonce, approved: true,
    windowEndUTC: '2026-10-24T14:10:17.2244604Z', recordedUTC: new Date(Date.now() - 5000).toISOString(), sourcePins: [sourcePin], exactDownloadUnlinkAfterVerifiedPrivateCopy: true }));
  const result = { parentBinding: parent, nonce, method: 'OWNER_SAME_SESSION_DOWNLOAD_V2', status: 'PASS', startedUTC: new Date(Date.now() - 1000).toISOString(), finishedUTC: new Date().toISOString(),
    authDispatches: 1, workerDispatches: 1, retries: 0, workerHttpStatus: 200, authUserId: id, workerUserId: id, protectedRole: 'moderator', uuidEquality: true };
  const download = path.join(profile, 'Downloads', `ogh-manual-identity-${nonce}.json`);
  await writeFile(download, JSON.stringify(result));
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)));
  const stdout = execFileSync(process.execPath, [fileURLToPath(importer)], { env: { ...cleanEnv, LOCALAPPDATA: local, USERPROFILE: profile }, windowsHide: true, encoding: 'utf8' });
  assert.equal(JSON.parse(stdout).privateTransfer, 'PASS');
  assert.deepEqual(JSON.parse(await readFile(path.join(sink, 'MANUAL_IDENTITY_DOWNLOAD_V2_RESULT.private.json'))), result);
  await assert.rejects(access(download));
  checks++;
} finally {
  assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('ogh-identity-import-'));
  await rm(temp, { recursive: true, force: true });
}
console.log(`DOWNLOAD_DELTA_LOCAL_CHECKS=${checks}/${checks}\nLOCAL_FIXTURE_CLEANUP=CONFIRMED\nPRODUCTION_REQUESTS=0`);
