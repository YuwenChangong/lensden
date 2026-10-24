import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = 'C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub';
const require = createRequire(path.join(root, 'package.json'));
const sha = b => createHash('sha256').update(b).digest('hex');
const canonical = b => b.toString().replaceAll('\r\n', '\n');
const pins = [
  ['C:/Temp/ogh-public-beta-ship-20261022/artifact-manifest.safe.json', '69baf2235aeee5dc771c7173e86eaf9e2f64fcf4096d714e9edb789565aad480', 'C:/Temp/ogh-public-beta-ship-20261022/production-rc', '0b6d94ffbfaf4cb388fe217b9f1609e3090b60e5'],
  ['C:/Temp/ogh-admin-mfa-activation-20261024/refreshed-enrollment/enrollment.manifest.json', '11f7fe8500024637abc1b4de7d53b206daa24390d16c6f89b4480aa668d3c1b6', 'C:/Temp/ogh-admin-mfa-activation-20261024/refreshed-enrollment/enrollment', '534c693bbd95091c2850dee1e7584ca81ff26ad8'],
  ['C:/Temp/ogh-admin-mfa-activation-20261024/enforcement.manifest.json', 'ba9ea679c0a5cc347565b1ab3437f5fbb085ac431802af95cf291adcdde57f78', 'C:/Temp/ogh-admin-mfa-activation-20261024/enforcement', '8b0882f09a26375675b21c6f0682c2221365dbf3'],
];
async function proveStaticLegalSource(expected) {
  const modules = ['src/lib/public-legal-contacts.ts', 'src/lib/legal-policy.ts', 'src/components/legal/LegalPage.astro'];
  for (const file of modules) {
    const reference = execFileSync('git', ['-C', root, 'show', `${pins[0][3]}:${file}`]);
    assert(canonical(reference) === canonical(await readFile(path.join(root, file))), 'LEGAL_SOURCE_WORKTREE_DRIFT');
    for (const [, , , commit] of pins.slice(1)) assert(canonical(reference) === canonical(execFileSync('git', ['-C', root, 'show', `${commit}:${file}`])), 'LEGAL_CANDIDATE_SOURCE_DRIFT');
  }
  const contactSource = await readFile(path.join(root, modules[0]), 'utf8');
  assert(!/import\s|process\.env|import\.meta\.env/.test(contactSource), 'LEGAL_SOURCE_RUNTIME_READER');
  const ts = require('typescript');
  const output = ts.transpileModule(contactSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const contacts = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  assert(typeof expected === 'string' && expected === contacts.PUBLIC_LEGAL_CONTACTS.operator, 'LOCAL_OPERATOR_SOURCE_VALUE_DRIFT');
  const policy = await readFile(path.join(root, modules[1]), 'utf8');
  assert(/function getPublicLegalContacts\(\)\s*\{\s*return PUBLIC_LEGAL_CONTACTS;/.test(policy), 'LEGAL_READER_CHANGED');
  const rendering = await readFile(path.join(root, modules[2]), 'utf8');
  assert(rendering.includes('PUBLIC_LEGAL_CONTACTS.operator'), 'LEGAL_RENDERER_CHANGED');
  const chunks = []; const configurations = [];
  for (const [manifestPath, hash, artifact] of pins) {
    const bytes = await readFile(manifestPath);
    assert(sha(bytes) === hash, 'LEGAL_MANIFEST_IDENTITY');
    const manifest = JSON.parse(bytes);
    const chunk = manifest.files.find(f => /^server\/chunks\/legal-policy_[^/]+\.mjs$/.test(f.file));
    assert(chunk, 'LEGAL_COMPILED_CHUNK_MISSING');
    const code = await readFile(path.join(artifact, chunk.file));
    assert(sha(code) === chunk.sha256, 'LEGAL_COMPILED_CHUNK_DRIFT');
    assert(code.toString().includes(expected), 'LEGAL_COMPILED_OPERATOR_MISSING');
    chunks.push(chunk.sha256);
    configurations.push(manifest.sourceConfigSha256 ?? manifest.configuration.sourceConfigSha256);
  }
  assert(chunks.every(h => h === chunks[0]), 'LEGAL_COMPILED_SOURCE_DIFFERENCE');
  assert(configurations.every(h => h === configurations[0]), 'LEGAL_SOURCE_CONFIG_DIFFERENCE');
  return { legalSourceUnchanged: true, legalRendererUsesStaticSource: true, compiledLegalChunkSameAcrossThreeArtifacts: true, sourceConfigUnchanged: true, expectedEqualsCanonicalStaticOperator: true };
}

// Only the exact unused runtime variable may be absent, and only after actual
// old/current-candidate source and sealed compiled chunk parity is established.
export async function assessLegalOperatorSetting(bindings, expected) {
  const proof = await proveStaticLegalSource(expected);
  if (!Array.isArray(bindings)) return { pass: false, reason: 'BINDING_METADATA_UNKNOWN', proof };
  const matches = bindings.filter(b => b?.name === 'PUBLIC_LEGAL_OPERATOR_NAME');
  if (!matches.length) return { pass: true, reason: 'UNUSED_RUNTIME_BINDING_ABSENT_STATIC_LEGAL_PARITY_VERIFIED', proof };
  if (matches.length !== 1) return { pass: false, reason: 'DUPLICATE_OPERATOR_BINDING', proof };
  const item = matches[0];
  if (item.type !== 'plain_text') return { pass: false, reason: 'OPERATOR_BINDING_TYPE_MISMATCH', proof };
  if (typeof item.text !== 'string') return { pass: false, reason: 'OPERATOR_BINDING_VALUE_UNKNOWN', proof };
  return { pass: item.text === expected, reason: item.text === expected ? 'OPERATOR_BINDING_EXACT_MATCH' : 'OPERATOR_BINDING_VALUE_MISMATCH', proof };
}
