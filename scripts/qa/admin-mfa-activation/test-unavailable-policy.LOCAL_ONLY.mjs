import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

globalThis.fetch = () => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); };
const root = 'C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub';
const ts = createRequire(`${root}/package.json`)('typescript');
const sha = b => createHash('sha256').update(b).digest('hex');
const pins = [
  ['C:/Temp/ogh-public-beta-ship-20261022/artifact-manifest.safe.json', '69baf2235aeee5dc771c7173e86eaf9e2f64fcf4096d714e9edb789565aad480', 'C:/Temp/ogh-public-beta-ship-20261022/production-rc', '0b6d94ffbfaf4cb388fe217b9f1609e3090b60e5'],
  ['C:/Temp/ogh-admin-mfa-activation-20261024/refreshed-enrollment/enrollment.manifest.json', '11f7fe8500024637abc1b4de7d53b206daa24390d16c6f89b4480aa668d3c1b6', 'C:/Temp/ogh-admin-mfa-activation-20261024/refreshed-enrollment/enrollment', '534c693bbd95091c2850dee1e7584ca81ff26ad8'],
  ['C:/Temp/ogh-admin-mfa-activation-20261024/enforcement.manifest.json', 'ba9ea679c0a5cc347565b1ab3437f5fbb085ac431802af95cf291adcdde57f78', 'C:/Temp/ogh-admin-mfa-activation-20261024/enforcement', '8b0882f09a26375675b21c6f0682c2221365dbf3'],
];
const chunks = ['server/chunks/local-sensitive-lexicon.server_B_AKZIap.mjs', 'server/chunks/moderate-content.server_CVcyoGp6.mjs'];
const verified = [];
for (const [manifestPath, hash, artifact, commit] of pins) {
  const bytes = await readFile(manifestPath); assert.equal(sha(bytes), hash, 'MANIFEST_IDENTITY');
  const manifest = JSON.parse(bytes);
  const hashes = [];
  for (const file of [...chunks, 'server/wrangler.json']) {
    const entry = manifest.files.find(f => f.file === file); assert(entry, 'PINNED_ENTRY_MISSING');
    const code = await readFile(path.join(artifact, file)); assert.equal(sha(code), entry.sha256, 'PINNED_BYTES_DRIFT');
    hashes.push(entry.sha256);
    if (file.endsWith('wrangler.json')) {
      const config = JSON.parse(code);
      assert.equal(config.keep_vars, true, 'KEEP_VARS_CONTRACT_CHANGED');
      assert.equal(Object.hasOwn(config.vars ?? {}, 'CF_PAGES_BRANCH'), false, 'STATIC_BRANCH_CHANGED');
      assert.equal(Object.hasOwn(config.vars ?? {}, 'MODERATION_PROVIDER_UNAVAILABLE_POLICY'), false, 'STATIC_POLICY_CHANGED');
    }
  }
  verified.push({ manifestSha256: hash, resolverChunkSha256: hashes[0], moderationChunkSha256: hashes[1], runtimeConfigSha256: hashes[2] });
  for (const file of ['src/lib/moderation/moderation-provider.server.ts', 'src/lib/moderation/moderate-content.server.ts']) {
    const reference = execFileSync('git', ['-C', root, 'show', `${pins[0][3]}:${file}`]);
    const candidate = execFileSync('git', ['-C', root, 'show', `${commit}:${file}`]);
    assert(reference.equals(candidate), 'CANDIDATE_MODERATION_SOURCE_CHANGED');
    assert.equal((await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n'), reference.toString().replaceAll('\r\n', '\n'), 'WORKTREE_MODERATION_SOURCE_CHANGED');
  }
}
assert(verified.every(v => v.resolverChunkSha256 === verified[0].resolverChunkSha256 && v.moderationChunkSha256 === verified[0].moderationChunkSha256), 'COMPILED_POLICY_LOGIC_CHANGED');
const required = ['resolveModerationProviderUnavailablePolicy', 'buildResult', 'mergeModerationProvider', 'mergeProviderDetails', 'mergeModerationResults', 'mapProviderErrorResult', 'isProviderUnavailableStatus', 'applyUnavailablePolicy'];
const declarations = new Map();
for (const file of chunks) {
  const parsed = ts.createSourceFile(file, await readFile(path.join(pins[0][2], file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  ts.forEachChild(parsed, node => { if (ts.isFunctionDeclaration(node) && required.includes(node.name?.text)) declarations.set(node.name.text, node.getText(parsed)); });
}
assert(required.every(name => declarations.has(name)), 'COMPILED_FUNCTION_MISSING');
// Execute only the extracted pinned pure functions, never the bundle imports
// or provider runners. Fixtures cannot send a real moderation request.
const actual = vm.runInNewContext(`${[...declarations.values()].join('\n')}\n({resolveModerationProviderUnavailablePolicy,applyUnavailablePolicy})`, Object.create(null), { timeout: 1000 });
let checks = 0;
for (const [env, expected] of [
  [{}, 'review_all'], [{ CF_PAGES_BRANCH: 'main' }, 'review_all'], [{ CF_PAGES_BRANCH: 'master' }, 'review_all'],
  [{ CF_PAGES_BRANCH: 'preview' }, 'local_only_safe'], [{ CF_PAGES_BRANCH: ' MAIN ' }, 'review_all'],
  [{ CF_PAGES_BRANCH: 'preview', MODERATION_PROVIDER_UNAVAILABLE_POLICY: 'review_all' }, 'review_all'],
  [{ CF_PAGES_BRANCH: 'main', MODERATION_PROVIDER_UNAVAILABLE_POLICY: 'local_only_safe' }, 'local_only_safe'],
]) { assert.equal(actual.resolveModerationProviderUnavailablePolicy(env), expected); checks++; }
const fixture = (decision, score, status) => ({ decision, score, reason: null, matchedRules: [], provider: 'local', providerDetails: { providerStatus: status } });
for (const [policy, localDecision, providerDecision, status, expected] of [
  ['review_all', 'allow', 'allow', 'success', 'allow'],
  ['local_only_safe', 'allow', 'allow', 'success', 'allow'],
  ['review_all', 'allow', 'review', 'http_429', 'review'],
  ['local_only_safe', 'allow', 'review', 'http_429', 'allow'],
  ['local_only_safe', 'review', 'review', 'timeout', 'review'],
  ['local_only_safe', 'reject', 'review', 'network_error', 'reject'],
  ['local_only_safe', 'allow', 'review', 'http_4xx', 'review'],
  ['block_sensitive', 'allow', 'review', 'http_5xx', 'review'],
]) {
  const result = actual.applyUnavailablePolicy({ policy, source: 'openai', localResult: fixture(localDecision, 0.1), providerResult: fixture(providerDecision, 0.6, status) });
  assert.equal(result.decision, expected); checks++;
}
const sink = path.join(process.env.LOCALAPPDATA, 'OpenGlassHub/admin-mfa-activation/29f2d82b600e362be017b7f7e6aadb968c8cd4d178b6b9568e2f75ba714b4bb3');
const priorBytes = await readFile(path.join(sink, 'initial-management-admission.safe.json'));
const prior = JSON.parse(priorBytes);
assert.equal(prior.publicSettingsGate.fields.MODERATION_PROVIDER_UNAVAILABLE_POLICY.present, false);
assert.equal(Object.hasOwn(prior.publicSettingsGate.fields, 'CF_PAGES_BRANCH'), false);
const result = {
  task: 'EXACT_UNAVAILABLE_POLICY_OFFLINE_CLOSURE', recordedUTC: new Date().toISOString(), status: 'BLOCKED_MISSING_RUNTIME_BRANCH_EVIDENCE',
  settingsReceiptSha256: sha(priorBytes), compiledLogicParity: verified, targetedChecksPassed: checks,
  previouslyProvenRuntimeDefaultsReused: 12, previousTwelveChecksRerun: false,
  policyPrecedence: 'EXPLICIT_NONEMPTY_POLICY_THEN_CF_PAGES_BRANCH_THEN_REVIEW_ALL',
  emptyMainMasterBranchDefault: 'review_all', otherBranchDefault: 'local_only_safe',
  relevantUpstreamUnavailableBehavior: 'LOCAL_ALLOW_PLUS_REVIEW_ALL_REMAINS_REVIEW_BUT_LOCAL_ONLY_SAFE_CAN_ALLOW',
  staticConfigContainsBranch: false, keepVarsPreservesRemoteContext: true,
  currentRuntimeBranchPresentOrValue: 'UNKNOWN_NOT_RETAINED_BY_BOUND_PROJECTIONS',
  currentProductionBehaviorDifference: 'NOT_PROVEN', currentEquivalence: 'NOT_PROVEN',
  gateChanged: false, frozenArtifactsChanged: false, productionRequests: 0, productionWrites: 0, deployments: 0, databaseConnections: 0,
  executionWindowStarted: false, catalogHold: 'ACTIVE', publicBetaGo: 'NOT_AUTHORIZED',
};
const bytes = Buffer.from(JSON.stringify(result, null, 2) + '\n');
const file = path.join(sink, 'unavailable-policy.offline-closure.safe.json');
const h = await open(file, 'wx');
try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
assert.equal(sha(await readFile(file)), sha(bytes), 'PRIVATE_RECEIPT_READBACK');
console.log(JSON.stringify({ status: result.status, checksPassed: checks, compiledArtifacts: 3, receiptSha256: sha(bytes), productionRequests: 0, gateChanged: false }));
