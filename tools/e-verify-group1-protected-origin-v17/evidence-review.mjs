import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProtectedOrigins } from '../e-verify-group1-origin-integration/private-origin.mjs';
import { ID, sha } from './authorization.mjs';

// Local offline review only. No raw Origin return, stdout, arbitrary path, or network capability.
export async function reviewProtectedIndex(index, packet, { destroyOnly = false, openStore = openProtectedOrigins } = {}) {
  if (!/^[a-f0-9]{32}$/.test(index?.evidenceStoreId ?? '')
    || !/^e-verify-group1-offline-origin-[a-f0-9]{32}$/.test(index.storageNamespace ?? '')
    || !Array.isArray(index.evidence) || index.evidence.length > 16
    || new Set(index.evidence.map(x => x.evidenceRef)).size !== index.evidence.length
    || index.evidence.some(x => !/^origin-[a-f0-9]{32}$/.test(x.evidenceRef) || !/^[a-f0-9]{64}$/.test(x.ciphertextSha256))) throw Error('PRIVATE_INDEX_INVALID');
  const reader = await openStore({ storeId: index.evidenceStoreId, namespace: index.storageNamespace,
    expiresUTC: new Date(Date.now() + 3600000).toISOString(), reopen: true });
  const reviewed = []; let readFailure = null, deleted = false;
  try {
    if (!destroyOnly) for (const item of index.evidence) {
      const value = await reader.read(item.evidenceRef, item.ciphertextSha256);
      if (value?.scheme !== 'https:' || typeof value.host !== 'string' || typeof value.port !== 'string') throw Error('PRIVATE_RECORD_INVALID');
      const origin = new URL(value.scheme + '//' + value.host + ':' + value.port).origin;
      const originClass = origin === packet.appOrigin ? 'APPLICATION' : origin === packet.supabaseOrigin ? 'SUPABASE'
        : origin === 'https://challenges.cloudflare.com' ? 'TURNSTILE' : 'UNAPPROVED_ORIGIN';
      reviewed.push({ evidenceRef: item.evidenceRef, originClass, networkPermissionGranted: false });
    }
  } catch { readFailure = 'PRIVATE_REVIEW_FAILED_OR_EXPIRED'; }
  finally { await reader.close({ destroy: true }); deleted = true; }
  return { evidenceStoreId: index.evidenceStoreId, reviewed, readFailure, deleted,
    rawOriginExported: false, historicalV16Identity: 'UNKNOWN', networkPermissionGranted: false };
}

const here = fileURLToPath(new URL('.', import.meta.url));
async function main() {
  if (process.argv.length !== 3 || !['--review-and-destroy', '--destroy-only'].includes(process.argv[2])) throw Error('EXACT_LOCAL_REVIEW_MODE_REQUIRED');
  const root = path.join(here, 'artifacts'), bb = fs.readFileSync(path.join(root, 'EXECUTION_BINDING.json'));
  const binding = JSON.parse(bb), pb = fs.readFileSync(path.join(root, 'PACKET_NOT_AUTHORIZED.json')), packet = JSON.parse(pb);
  if (binding.authorizationId !== ID || packet.authorizationId !== ID || sha(pb) !== binding.packetSha256) throw Error('PRIVATE_REVIEW_BINDING_MISMATCH');
  // Privacy cleanup must not depend on an unrelated Chrome update, OAuth or live authorization.
  const required = [fileURLToPath(import.meta.url), path.join(here, 'authorization.mjs'),
    path.resolve(here, '../e-verify-group1-origin-integration/private-origin.mjs'),
    path.resolve(here, '../e-verify-group1-origin-integration/protected-origin.ps1'),
    path.resolve(here, '../e-verify-group1-remaining-assets/private-evidence.mjs')];
  for (const file of required) {
    const f = binding.files.find(x => path.resolve(x.path).toLowerCase() === path.resolve(file).toLowerCase());
    if (!f || sha(fs.readFileSync(file)) !== f.sha256) throw Error('LOCAL_REVIEW_FILE_DRIFT');
  }
  const execution = JSON.parse(fs.readFileSync(path.join(root, 'EXECUTION_SAFE.json')));
  if (execution.authorizationId !== ID || execution.format !== 'group1-native-manual-protected-origin-v17') throw Error('PRIVATE_REVIEW_INSTANCE_MISMATCH');
  const indexes = execution.nativeBrowserEvidence.map(b => b.diagnostics?.originEvidence?.protectedIndex).filter(Boolean);
  if (indexes.length > 6 || new Set(indexes.map(i => i.evidenceStoreId)).size !== indexes.length) throw Error('PRIVATE_REVIEW_SCOPE');
  const stores = [];
  for (const index of indexes) stores.push(await reviewProtectedIndex(index, packet, { destroyOnly: process.argv[2] === '--destroy-only' }));
  const result = { authorizationId: ID, status: stores.some(s => s.readFailure) ? 'REVIEW_BLOCKED_CIPHERTEXT_DELETED' : 'REVIEW_AND_DELETION_COMPLETE',
    stores, rawOriginExported: false, networkRequests: 0, group1ProductionAcceptance: 'NOT_CHANGED_BY_REVIEW' };
  fs.writeFileSync(path.join(root, 'PRIVATE_ORIGIN_REVIEW_SAFE.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ status: result.status, stores: stores.length, rawOriginExported: false, networkRequests: 0 }) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main().catch(() => {
  process.stdout.write('PRIVATE_REVIEW_OR_CLEANUP_BLOCKED\n'); process.exitCode = 1;
});
