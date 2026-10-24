import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { assessLegalOperatorSetting } from './legal-operator-setting-guard.mjs';

const root = 'C:/Users/1/.codex/worktrees/auth-a-containment-time-v2/OpenGlass Hub';
const require = createRequire(`${root}/package.json`);
const sha = b => createHash('sha256').update(b).digest('hex');
const canonical = b => b.toString().replaceAll('\r\n', '\n');
const pins = [
  ['C:/Temp/ogh-public-beta-ship-20261022/artifact-manifest.safe.json', '69baf2235aeee5dc771c7173e86eaf9e2f64fcf4096d714e9edb789565aad480', 'C:/Temp/ogh-public-beta-ship-20261022/production-rc', '0b6d94ffbfaf4cb388fe217b9f1609e3090b60e5'],
  ['C:/Temp/ogh-admin-mfa-activation-20261024/refreshed-enrollment/enrollment.manifest.json', '11f7fe8500024637abc1b4de7d53b206daa24390d16c6f89b4480aa668d3c1b6', 'C:/Temp/ogh-admin-mfa-activation-20261024/refreshed-enrollment/enrollment', '534c693bbd95091c2850dee1e7584ca81ff26ad8'],
  ['C:/Temp/ogh-admin-mfa-activation-20261024/enforcement.manifest.json', 'ba9ea679c0a5cc347565b1ab3437f5fbb085ac431802af95cf291adcdde57f78', 'C:/Temp/ogh-admin-mfa-activation-20261024/enforcement', '8b0882f09a26375675b21c6f0682c2221365dbf3'],
];
const legal = Object.freeze({ PUBLIC_LEGAL_OPERATOR_NAME: 'operator', PUBLIC_SUPPORT_EMAIL: 'support', PUBLIC_ABUSE_EMAIL: 'abuse', PUBLIC_PRIVACY_EMAIL: 'privacy', PUBLIC_IP_EMAIL: 'intellectualProperty' });
const buildOnly = Object.freeze(['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY', 'PUBLIC_TURNSTILE_SITE_KEY', 'SITE_ORIGIN']);
export const STATIC_SETTING_NAMES = Object.freeze([...Object.keys(legal), ...buildOnly]);

// Missing bindings are never generally accepted. These finite exceptions need
// actual pinned source and compiled bytes; present mismatches remain failures.
export function compareSettingMetadata(bindings, name, expected, allowProvenAbsence = false) {
  if (!Array.isArray(bindings)) return { pass: false, present: 'UNKNOWN', bindingType: 'UNKNOWN', exactMatch: 'UNKNOWN', reason: 'BINDING_METADATA_UNKNOWN' };
  const matches = bindings.filter(b => b?.name === name);
  if (!matches.length) return { pass: allowProvenAbsence && STATIC_SETTING_NAMES.includes(name), present: false, bindingType: 'ABSENT', exactMatch: 'NOT_APPLICABLE', reason: allowProvenAbsence && STATIC_SETTING_NAMES.includes(name) ? 'PROVEN_STATIC_ABSENCE' : 'REQUIRED_RUNTIME_BINDING_MISSING' };
  if (matches.length !== 1) return { pass: false, present: true, bindingType: 'AMBIGUOUS', exactMatch: 'UNKNOWN', reason: 'DUPLICATE_BINDINGS' };
  const item = matches[0];
  const bindingType = typeof item.type === 'string' && /^[a-z_]{1,40}$/.test(item.type) ? item.type : 'UNKNOWN';
  if (bindingType !== 'plain_text') return { pass: false, present: true, bindingType, exactMatch: 'NOT_COMPARED', reason: 'BINDING_TYPE_MISMATCH' };
  if (typeof item.text !== 'string' || typeof expected !== 'string') return { pass: false, present: true, bindingType, exactMatch: 'UNKNOWN', reason: 'VALUE_SHAPE_UNKNOWN' };
  return { pass: item.text === expected, present: true, bindingType, exactMatch: item.text === expected, reason: item.text === expected ? 'EXACT_MATCH' : 'BINDING_VALUE_MISMATCH' };
}

async function proveStaticSettings(expected) {
  const operator = await assessLegalOperatorSetting([], expected.PUBLIC_LEGAL_OPERATOR_NAME);
  assert(operator.pass, 'STATIC_OPERATOR_PROOF_FAILED');
  const modules = ['scripts/build-workers.mjs', 'scripts/lib/workers-runtime-vars.mjs', 'src/lib/supabase-browser.ts', 'src/lib/storage-tus.ts', 'src/components/forum/useInvisibleTurnstile.ts', 'astro.config.mjs', 'src/lib/site-origin.ts'];
  for (const file of modules) {
    const old = execFileSync('git', ['-C', root, 'show', `${pins[0][3]}:${file}`]);
    assert.equal(canonical(await readFile(path.join(root, file))), canonical(old), 'STATIC_READER_WORKTREE_DRIFT');
    for (const [, , , commit] of pins.slice(1)) assert.equal(canonical(execFileSync('git', ['-C', root, 'show', `${commit}:${file}`])), canonical(old), 'STATIC_READER_CANDIDATE_DRIFT');
  }
  const contactSource = await readFile(`${root}/src/lib/public-legal-contacts.ts`, 'utf8');
  const ts = require('typescript');
  const js = ts.transpileModule(contactSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const contacts = (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).PUBLIC_LEGAL_CONTACTS;
  const rendering = await readFile(`${root}/src/components/legal/LegalPage.astro`, 'utf8');
  for (const [name, key] of Object.entries(legal)) {
    assert(typeof expected[name] === 'string' && expected[name] === contacts[key], 'CANONICAL_CONTACT_MISMATCH');
    assert(rendering.includes(`PUBLIC_LEGAL_CONTACTS.${key}`), 'STATIC_CONTACT_RENDERER_CHANGED');
  }
  const manifests = [];
  for (const [manifestPath, hash, artifact] of pins) {
    const bytes = await readFile(manifestPath);
    assert.equal(sha(bytes), hash, 'STATIC_MANIFEST_IDENTITY');
    const manifest = JSON.parse(bytes);
    assert.equal(sha(await readFile(`${root}/wrangler.toml`)), manifest.sourceConfigSha256 ?? manifest.configuration?.sourceConfigSha256, 'STATIC_SOURCE_CONFIG_DRIFT');
    const runtimeEntry = manifest.files.find(f => f.file === 'server/wrangler.json');
    assert(runtimeEntry, 'SEALED_RUNTIME_CONFIG_MISSING');
    const runtimeBytes = await readFile(path.join(artifact, runtimeEntry.file));
    assert.equal(sha(runtimeBytes), runtimeEntry.sha256, 'SEALED_RUNTIME_CONFIG_DRIFT');
    const runtime = JSON.parse(runtimeBytes);
    for (const name of STATIC_SETTING_NAMES) assert(!Object.hasOwn(runtime.vars ?? {}, name), 'STATIC_FIELD_NOW_RUNTIME_REQUIRED');
    const legalEntry = manifest.files.find(f => /^server\/chunks\/legal-policy_[^/]+\.mjs$/.test(f.file));
    assert(legalEntry, 'LEGAL_CHUNK_MISSING');
    const code = await readFile(path.join(artifact, legalEntry.file));
    assert.equal(sha(code), legalEntry.sha256, 'LEGAL_CHUNK_DRIFT');
    for (const name of Object.keys(legal)) assert(code.toString().includes(JSON.stringify(expected[name])), 'COMPILED_CONTACT_MISMATCH');
    manifests.push({ manifest, artifact });
  }
  // Pinned artifacts can have different chunk names after MFA imports change.
  // Parse actual string literals instead of accepting a matching substring.
  const compiledEvidence = {};
  for (const name of buildOnly) {
    assert(typeof expected[name] === 'string' && expected[name], 'BUILD_VALUE_MISSING');
    compiledEvidence[name] = [];
    const pattern = name.startsWith('PUBLIC_SUPABASE_') ? /^client\/_astro\/supabase-browser\.[^/]+\.js$/ : name === 'PUBLIC_TURNSTILE_SITE_KEY' ? /^server\/chunks\/entrypoints_[^/]+\.mjs$/ : /^client\/_astro\/auth-redirect\.[^/]+\.js$/;
    for (const { manifest, artifact } of manifests) {
      let match;
      for (const entry of manifest.files.filter(f => pattern.test(f.file))) {
        const code = await readFile(path.join(artifact, entry.file));
        assert.equal(sha(code), entry.sha256, 'COMPILED_BUILD_FIELD_DRIFT');
        const parsed = ts.createSourceFile(entry.file, code.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const visit = node => {
          if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === expected[name]) match = { file: entry.file, sha256: entry.sha256 };
          if (!match) ts.forEachChild(node, visit);
        };
        visit(parsed);
        if (match) break;
      }
      assert(match, `EXACT_COMPILED_BUILD_VALUE_NOT_PROVEN:${name}`);
      compiledEvidence[name].push(match);
    }
  }
  return { staticLegalParity: true, exactCanonicalContacts: true, sealedRuntimeAbsence: true, buildReaderSourceParity: true, sourceConfigurationParity: true, compiledEvidence };
}

export async function assessPublicSettings(bindings, expected) {
  const proof = await proveStaticSettings(expected);
  const fields = {};
  for (const [name, value] of Object.entries(expected)) fields[name] = compareSettingMetadata(bindings, name, value, STATIC_SETTING_NAMES.includes(name));
  const firstFailed = Object.keys(fields).find(name => !fields[name].pass);
  return { pass: !firstFailed, firstFailed: firstFailed ?? null, fields, proof };
}
