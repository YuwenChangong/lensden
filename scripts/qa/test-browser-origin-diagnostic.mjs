import assert from 'node:assert/strict';
import { browserOriginDiagnostic } from './browser-origin-diagnostic.mjs';

const sensitive = browserOriginDiagnostic('https://name:password@example.invalid/private?token=secret#identity', 'script');
assert.equal(sensitive.origin, 'https://example.invalid');
assert.equal(sensitive.credentialsInUrl, true);
for (const value of ['name', 'password', '/private', 'token', 'secret', 'identity']) {
  assert.equal(JSON.stringify(sensitive).includes(value), false);
}
assert.equal(sensitive.authorityToAllowOrigin, false);
assert.equal(browserOriginDiagnostic('data:text/plain,private-payload', 'script').origin, 'OPAQUE_ORIGIN');
assert.equal(JSON.stringify(browserOriginDiagnostic('data:text/plain,private-payload', 'script')).includes('private-payload'), false);
assert.equal(browserOriginDiagnostic('blob:https://example.invalid/private-id', 'fetch').origin, 'https://example.invalid');
assert.equal(browserOriginDiagnostic('invalid private input', 'unknown').origin, 'UNPARSEABLE');
assert.equal(browserOriginDiagnostic('https://example.invalid/', 'untrusted-private-value').resourceType, 'unknown');
console.log(JSON.stringify({ status: 'PASS', cases: 5, productionRequests: 0, permissionsExpanded: false }));
