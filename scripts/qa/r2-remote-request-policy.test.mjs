import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync, deflateSync, brotliCompressSync} from 'node:zlib';
import {createR2RemoteRequestPolicy} from './r2-remote-request-policy.mjs';

const name = 'ogh-exact-head-0123abcd';
const root = '/client/v4/accounts/dcb374166b39234a499985145c075f50/workers';
const request = (path, method = 'GET') => ({origin: 'https://api.cloudflare.com', path, method});

test('admits each exact official initialization operation once', () => {
  const policy = createR2RemoteRequestPolicy(name);
  assert.equal(policy.admit(request(`${root}/subdomain/edge-preview`)).operation, 'PREVIEW_INIT');
  assert.equal(policy.admit(request(`${root}/subdomain`)).operation, 'SUBDOMAIN_READ');
  assert.equal(policy.admit(request(`${root}/scripts/${name}/edge-preview`, 'POST')).operation, 'PREVIEW_UPLOAD');
  assert.throws(() => policy.admit(request(`${root}/subdomain`)));
  assert.deepEqual(policy.consumed(), ['PREVIEW_INIT', 'SUBDOMAIN_READ', 'PREVIEW_UPLOAD']);
});

test('binds only the exact exchange URL from the initialized response across supported encodings', () => {
  const input = {origin: 'https://0123456789abcdef0123456789abcdef.ogh.workers.dev', path: '/exchange?opaque=fixture', method: 'GET'};
  const body = Buffer.from(JSON.stringify({success: true, result: {exchange_url: input.origin + input.path, token: 'synthetic-only'}}));
  for (const [contentEncoding, encode] of Object.entries({identity: Buffer.from, gzip: gzipSync, deflate: deflateSync, br: brotliCompressSync})) {
    const policy = createR2RemoteRequestPolicy(name);
    assert.throws(() => policy.admit(input));
    policy.admit(request(`${root}/subdomain/edge-preview`));
    policy.observePreviewResponse({operation: 'PREVIEW_INIT', status: 200, body: encode(body), contentEncoding});
    assert.throws(() => policy.admit({...input, path: '/another-exchange'}));
    assert.throws(() => policy.admit({...input, path: '/exchange?opaque=changed'}));
    assert.deepEqual(policy.admit(input), {local: false, operation: 'OFFICIAL_PREVIEW_EXCHANGE'});
    assert.throws(() => policy.admit(input));
  }
});

test('rejects unbound, unsuccessful, malformed or oversized initialization responses', () => {
  const good = Buffer.from(JSON.stringify({success: true, result: {exchange_url: 'https://0123456789abcdef0123456789abcdef.ogh.workers.dev/exchange'}}));
  assert.throws(() => createR2RemoteRequestPolicy(name).observePreviewResponse({operation: 'PREVIEW_INIT', status: 200, body: good}));
  for (const input of [
    {status: 403, body: good},
    {status: 200, body: Buffer.from('{')},
    {status: 200, body: Buffer.from(JSON.stringify({success: false, result: {exchange_url: 'https://elsewhere.example'}}))},
    {status: 200, body: Buffer.alloc(65537)},
    {status: 200, body: good, contentEncoding: 'unsupported'},
    {status: 200, body: gzipSync(Buffer.alloc(65537)), contentEncoding: 'gzip'},
  ]) {
    const policy = createR2RemoteRequestPolicy(name);
    policy.admit(request(`${root}/subdomain/edge-preview`));
    assert.throws(() => policy.observePreviewResponse({operation: 'PREVIEW_INIT', ...input}));
    assert.throws(() => policy.observePreviewResponse({operation: 'PREVIEW_INIT', status: 200, body: good}));
  }
});

test('native parsing failures cannot expose response contents or URLs', () => {
  const secret = 'synthetic-sensitive-query-not-production';
  for (const body of [
    Buffer.from(`{"sensitive":"${secret}",broken`),
    Buffer.from(JSON.stringify({success: true, result: {exchange_url: `not a url ${secret}`}})),
  ]) {
    const policy = createR2RemoteRequestPolicy(name);
    policy.admit(request(`${root}/subdomain/edge-preview`));
    assert.throws(() => policy.observePreviewResponse({operation: 'PREVIEW_INIT', status: 200, body}), error => {
      assert.equal(error.message, 'REMOTE_PREVIEW_RESPONSE_INVALID');
      assert.equal(JSON.stringify(error).includes(secret), false);
      assert.equal(error.stack.includes(secret), false);
      return true;
    });
  }
  assert.throws(() => createR2RemoteRequestPolicy(name).admit({origin: secret, path: '/', method: 'GET'}),
    error => error.message === 'REMOTE_TRANSPORT_URL_INVALID' && !error.stack.includes(secret));
});

test('local SDK coordination does not consume provider allowances', () => {
  const policy = createR2RemoteRequestPolicy(name);
  for (const origin of ['http://127.0.0.1:12345', 'http://localhost:12345', 'http://[::1]:12345']) {
    assert.equal(policy.admit({origin, path: '/internal', method: 'POST'}).local, true);
  }
  assert.deepEqual(policy.consumed(), []);
});

test('rejects other accounts, buckets, scripts, methods, hosts and insecure transport', () => {
  for (const input of [
    request(root.replace('dcb374166b39234a499985145c075f50', '00000000000000000000000000000000') + '/subdomain'),
    request(`${root}/subdomain`, 'PUT'),
    request(`${root}/scripts/openglasshub/edge-preview`, 'POST'),
    request('/client/v4/accounts/dcb374166b39234a499985145c075f50/r2/buckets/openglasshub-media/objects'),
    request(`${root}/subdomain?unexpected=1`),
    {origin: 'https://0123456789abcdef0123456789abcdef.other.workers.dev', path: '/exchange', method: 'GET'},
    {origin: 'https://0123456789abcdef0123456789abcdef.ogh.workers.dev.evil.example', path: '/exchange', method: 'GET'},
    {origin: 'https://0123456789abcdef0123456789abcdef.ogh.workers.dev', path: '/exchange', method: 'POST'},
    {origin: 'http://api.cloudflare.com', path: `${root}/subdomain`, method: 'GET'},
    {origin: 'https://api.cloudflare.com:8443', path: `${root}/subdomain`, method: 'GET'},
    {origin: 'https://user:pass@api.cloudflare.com', path: `${root}/subdomain`, method: 'GET'},
    {origin: 'https://evil.example', path: `https://api.cloudflare.com${root}/subdomain`, method: 'GET'},
    {origin: 'https://evil.example', path: `//api.cloudflare.com${root}/subdomain`, method: 'GET'},
    request(`${root}/unexpected/../subdomain`),
  ]) assert.throws(() => createR2RemoteRequestPolicy(name).admit(input));
  assert.throws(() => createR2RemoteRequestPolicy('openglasshub'));
});
