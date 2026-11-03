import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scriptPathFingerprint} from './execution/group1/path-fingerprint.mjs';
let implementation;
try{implementation=await import('./build-evidence.mjs')}catch{}
test('local dependency comparison and historical missing evidence are implemented',()=>{
  assert.equal(typeof implementation?.inspectBuild,'function');
});
test('published-source local build closes exact finite dependency graph without inventing deployment byte proof',async()=>{
  assert.ok(implementation);
  const r=await implementation.inspectBuild();
  assert.equal(r.sourceSha,'88680a6eaab8de4123199f16b325ec0a430b0b86');
  assert.equal(r.expectedProductionVersion,'b2b62ec9-bb8d-4159-ac99-08fca5740134');
  assert.equal(r.localStaticFilesVerified,67);
  assert.equal(r.missingLocalStaticBindings.length,0);
  assert.equal(r.missingLiteralImports.length,0);
  assert.equal(r.deployedBuildByteMatch,'UNKNOWN');
  assert.equal(r.historicalRejectedScript,'UNKNOWN');
  assert.equal(r.historicalNormalizedRoute,'/:unbound');
  assert.equal(r.productionRequests,0);
  assert.ok(r.literalDependencyEdges>0);
});
test('fingerprint comparison finds an exact local filename, never a nearest-name guess',async()=>{
  assert.ok(implementation);
  const r=await implementation.inspectBuild({scriptPathSha256:scriptPathFingerprint('/_astro/AuthPanel.EZiCXg-9.js')});
  assert.deepEqual(r.fingerprintMatches,['/_astro/AuthPanel.EZiCXg-9.js']);
  const absent=await implementation.inspectBuild({scriptPathSha256:'0'.repeat(64)});
  assert.deepEqual(absent.fingerprintMatches,[]);
});
test('consumed diagnostic has no recoverable pathname fingerprint',()=>{
  const r=JSON.parse(fs.readFileSync(new URL('../e-verify-group1-login-diagnostics/execution/group1/artifacts/GROUP1_EXECUTION_SAFE.json',import.meta.url)));
  assert.equal(r.diagnostics.firstRejection.normalizedRoute,'/:unbound');
  assert.equal(r.diagnostics.firstRejection.admissionRuleId,'NO_BOUND_RULE');
  assert.equal(r.diagnostics.firstRejection.scriptPathSha256,undefined);
});
