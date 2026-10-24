import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Exact one-file local transfer only; no network, credentials or file discovery.
async function main() {
const parent = '4e447058285658339e9e0f13f2450705ce16789b2bad84d4008ec8d235e1a658';
const nonce = '609ead46-02cc-4d56-b892-9591ed242215';
const sink = path.join(process.env.LOCALAPPDATA, 'OpenGlassHub/admin-mfa-activation', parent);
const approval = JSON.parse(fs.readFileSync(path.join(sink, 'MANUAL_IDENTITY_DOWNLOAD_V2_APPROVAL.safe.json')));
assert.equal(approval.approved, true);
assert.equal(approval.parentBinding, parent);
assert.equal(approval.nonce, nonce);
assert.equal(approval.windowEndUTC, '2026-10-24T14:10:17.2244604Z');
assert(Date.now() < Date.parse(approval.windowEndUTC), 'ORIGINAL_WINDOW_EXPIRED');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const pin of approval.sourcePins) assert.equal(sha(fs.readFileSync(pin.path)), pin.sha256);
// Enforce the original private ACL; never inherit Downloads permissions.
execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
  "$ErrorActionPreference='Stop'; $d='" + sink.replaceAll("'", "''") + "'; $i=Get-Item -LiteralPath $d; while($null -ne $i){if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'REPARSE'};$i=$i.Parent}; $a=Get-Acl -LiteralPath $d; $s=[Security.Principal.WindowsIdentity]::GetCurrent().User; if(-not $a.AreAccessRulesProtected -or $a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $s.Value){throw 'ACL'}; $r=$a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]); if($r.Count -ne 2){throw 'ACL'}; foreach($x in $r){if($x.IdentityReference.Value -notin @($s.Value,'S-1-5-18') -or $x.AccessControlType -ne 'Allow' -or $x.IsInherited){throw 'ACL'}}"], { windowsHide: true, stdio: 'pipe' });
const source = path.join(process.env.USERPROFILE, 'Downloads', `ogh-manual-identity-${nonce}.json`);
const info = fs.lstatSync(source);
assert(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 4096, 'INVALID_EXACT_DOWNLOAD');
assert.equal(fs.realpathSync(source).toLowerCase(), path.resolve(source).toLowerCase(), 'DOWNLOAD_REPARSE_PATH');
const bytes = fs.readFileSync(source);
const r = JSON.parse(bytes);
const fields = new Set(['parentBinding','nonce','method','status','startedUTC','finishedUTC','authDispatches','workerDispatches','retries','workerHttpStatus','authUserId','workerUserId','protectedRole','uuidEquality','roleSource','failure']);
assert(Object.keys(r).every(key => fields.has(key)), 'UNEXPECTED_RESULT_FIELD');
assert.equal(r.parentBinding, parent); assert.equal(r.nonce, nonce);
assert.equal(r.method, 'OWNER_SAME_SESSION_DOWNLOAD_V2');
assert(['PASS','NOT_VERIFIED'].includes(r.status));
assert.equal(r.retries, 0);
assert([0,1].includes(r.authDispatches) && [0,1].includes(r.workerDispatches));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
for (const key of ['authUserId','workerUserId']) if (key in r) assert(typeof r[key] === 'string' && uuid.test(r[key]));
if ('failure' in r) assert(typeof r.failure === 'string' && /^[A-Z][A-Z0-9_]{1,70}$/.test(r.failure));
if ('protectedRole' in r) assert.equal(r.protectedRole, 'moderator');
if ('uuidEquality' in r) assert.equal(r.uuidEquality, true);
if ('workerHttpStatus' in r) assert(Number.isInteger(r.workerHttpStatus) && r.workerHttpStatus >= 0 && r.workerHttpStatus <= 599);
if ('roleSource' in r) assert.equal(r.roleSource, 'WORKER_GETUSER_AND_PROTECTED_PROFILE_LOOKUP_NOT_USER_METADATA');
const start = Date.parse(r.startedUTC), finish = Date.parse(r.finishedUTC);
assert(typeof r.startedUTC === 'string' && r.startedUTC.length <= 30 && typeof r.finishedUTC === 'string' && r.finishedUTC.length <= 30);
assert(Number.isFinite(start) && Number.isFinite(finish) && finish >= start);
assert(start >= Date.parse(approval.recordedUTC) && finish < Date.parse(approval.windowEndUTC), 'EXECUTION_TIME_MISMATCH');
if (r.status === 'PASS') {
  assert(uuid.test(r.authUserId));
  assert.equal(r.authUserId, r.workerUserId); assert.equal(r.protectedRole, 'moderator');
  assert.equal(r.uuidEquality, true); assert.equal(r.workerHttpStatus, 200);
  assert.equal(r.authDispatches, 1); assert.equal(r.workerDispatches, 1);
}
const output = path.join(sink, 'MANUAL_IDENTITY_DOWNLOAD_V2_RESULT.private.json');
const fd = fs.openSync(output, 'wx');
try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
assert.equal(sha(fs.readFileSync(output)), sha(bytes));
execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
  "$ErrorActionPreference='Stop'; $a=Get-Acl -LiteralPath '" + output.replaceAll("'", "''") + "'; $s=[Security.Principal.WindowsIdentity]::GetCurrent().User; if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $s.Value){throw 'ACL'}; $r=$a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]); if($r.Count -ne 2){throw 'ACL'}; foreach($x in $r){if($x.IdentityReference.Value -notin @($s.Value,'S-1-5-18') -or $x.AccessControlType -ne 'Allow'){throw 'ACL'}}"], { windowsHide: true, stdio: 'pipe' });
// Remove ONLY this generated download after exact copy/readback and approval.
assert.equal(approval.exactDownloadUnlinkAfterVerifiedPrivateCopy, true);
assert.equal(sha(fs.readFileSync(source)), sha(bytes));
fs.unlinkSync(source);
console.log(JSON.stringify({ status: r.status, privateTransfer: 'PASS', sourceRemoved: true, rawIdentityExported: false, productionRequests: 0 }));
}
try { await main(); }
catch { process.stderr.write('MANUAL_IDENTITY_IMPORT_BLOCKED_NO_PRIVATE_DATA_EXPORTED\n'); process.exitCode = 1; }
