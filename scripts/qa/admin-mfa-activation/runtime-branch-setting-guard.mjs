import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { assessPublicSettings } from './public-setting-guard.v2.mjs';

const root = 'C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub';
const sha = b => createHash('sha256').update(b).digest('hex');
const defaults = Object.freeze(['DEV_TURNSTILE_BYPASS', 'MODERATION_PROVIDER', 'OPENAI_FORUM_POLICY_ENABLED', 'OPENAI_FORUM_POLICY_FAIL_MODE', 'OPENAI_FORUM_POLICY_MODEL', 'OPENAI_FORUM_POLICY_TIMEOUT_MS', 'OPENAI_MODERATION_FAIL_MODE', 'OPENAI_MODERATION_LOG_LEVEL', 'OPENAI_MODERATION_MODEL', 'OPENAI_MODERATION_TIMEOUT_MS', 'UPLOAD_TURNSTILE_MODE', 'VIDEO_POST_FAIL_MODE']);
const receiptPath = 'C:/Users/1/AppData/Local/OpenGlassHub/admin-mfa-activation/29f2d82b600e362be017b7f7e6aadb968c8cd4d178b6b9568e2f75ba714b4bb3/unavailable-policy.offline-closure.safe.json';
const artifactRoots = ['C:/Temp/ogh-public-beta-ship-20261022/production-rc', 'C:/Temp/ogh-admin-mfa-activation-20261024/refreshed-enrollment/enrollment', 'C:/Temp/ogh-admin-mfa-activation-20261024/enforcement'];

export function classifyWorkerBranch(bindings) {
  const unknown = { pass: false, present: 'UNKNOWN', bindingType: 'UNKNOWN', classification: 'UNKNOWN' };
  if (!Array.isArray(bindings)) return unknown;
  const entries = bindings.filter(b => b?.name === 'CF_PAGES_BRANCH');
  if (!entries.length) return { pass: true, present: false, bindingType: 'ABSENT', classification: 'ABSENT' };
  if (entries.length !== 1) return { ...unknown, present: true, bindingType: 'AMBIGUOUS' };
  const item = entries[0];
  if (item.type !== 'plain_text' || typeof item.text !== 'string') return { ...unknown, present: true, bindingType: typeof item.type === 'string' && /^[a-z_]{1,40}$/.test(item.type) ? item.type : 'UNKNOWN' };
  const normalized = item.text.trim().toLowerCase();
  const classification = !normalized ? 'EMPTY' : normalized === 'main' ? 'MAIN' : normalized === 'master' ? 'MASTER' : 'OTHER';
  return { pass: classification !== 'OTHER', present: true, bindingType: 'plain_text', classification };
}

async function proveReusedDefaults(expected) {
  assert.equal(sha(await readFile(`${root}/wrangler.toml`)), 'cfb66f78123957aec14537529365da5a2771881cb94b4fe21a09ec08757cf62d', 'RUNTIME_SOURCE_CONFIG_DRIFT');
  assert.equal(sha(JSON.stringify(defaults.map(name => [name, expected[name]]))), 'dcf12b559394743a375f6f5b9df108be1dc90d737123002a23e58da43ead0c35', 'PROVEN_DEFAULT_EXPECTATION_DRIFT');
  assert.equal(expected.MODERATION_PROVIDER_UNAVAILABLE_POLICY, 'review_all', 'EXPECTED_SAFE_POLICY_CHANGED');
  const bytes = await readFile(receiptPath);
  assert.equal(sha(bytes), 'ede8502b012f0c88e002224449beefaaa3b21ecc33081a5fa9a7df8a69b4040a', 'REUSED_DEFAULT_RECEIPT_IDENTITY');
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.previouslyProvenRuntimeDefaultsReused, 12, 'REUSED_DEFAULT_PROOF_MISSING');
  for (const file of ['src/lib/moderation/moderation-provider.server.ts', 'src/lib/moderation/moderate-content.server.ts', 'src/lib/server/turnstile.ts']) {
    const reference = execFileSync('git', ['-C', root, 'show', `0b6d94ffbfaf4cb388fe217b9f1609e3090b60e5:${file}`]);
    assert.equal((await readFile(`${root}/${file}`, 'utf8')).replaceAll('\r\n', '\n'), reference.toString().replaceAll('\r\n', '\n'), 'REUSED_DEFAULT_READER_CHANGED');
  }
  for (let i = 0; i < artifactRoots.length; i++) {
    const proof = receipt.compiledLogicParity[i];
    for (const [file, digest] of [['local-sensitive-lexicon.server_B_AKZIap.mjs', proof.resolverChunkSha256], ['moderate-content.server_CVcyoGp6.mjs', proof.moderationChunkSha256]]) assert.equal(sha(await readFile(`${artifactRoots[i]}/server/chunks/${file}`)), digest, 'REUSED_DEFAULT_COMPILED_DRIFT');
  }
  return { priorDefaultsReused: 12, resolverTestsRerun: false, sourceConfigAndReaderPins: 'PASS', receiptSha256: sha(bytes), compiledPolicyPins: 'PASS' };
}

// Production callers must pass the complete bindings array from the single
// authorized fixed-Worker settings response, never a prefiltered projection.
export async function assessMfaRuntimeSettings(bindings, expected) {
  const result = await assessPublicSettings(bindings, expected);
  const proof = await proveReusedDefaults(expected);
  const branch = classifyWorkerBranch(bindings);
  for (const name of defaults) {
    if (result.fields[name]?.reason === 'REQUIRED_RUNTIME_BINDING_MISSING') result.fields[name] = { ...result.fields[name], pass: true, reason: 'PINNED_PREVIOUS_DEFAULT_EQUIVALENCE_REUSED' };
  }
  const name = 'MODERATION_PROVIDER_UNAVAILABLE_POLICY';
  if (result.fields[name]?.reason === 'REQUIRED_RUNTIME_BINDING_MISSING' && branch.pass) result.fields[name] = { ...result.fields[name], pass: true, reason: 'REVIEW_ALL_PROVEN_FROM_FRESH_WORKER_ENV_BRANCH' };
  const policyPass = branch.pass && result.fields[name]?.pass === true;
  const firstFailed = Object.keys(result.fields).find(key => !result.fields[key].pass) ?? (!branch.pass ? 'CF_PAGES_BRANCH' : null);
  return { ...result, pass: !firstFailed && policyPass, firstFailed, runtimeDefaultProof: proof, workerBranch: branch, effectiveModerationPolicy: policyPass ? 'review_all' : 'UNKNOWN', branchEvidenceSource: 'COMPLETE_FIXED_WORKER_SETTINGS_BINDINGS_NOT_PAGES_BUILD_ENV_OR_PROCESS_ENV' };
}
