import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { cloudflareWorkersTestPlugin, setCloudflareWorkersTestBinding } from './lib/cloudflare-workers-test-plugin.mjs';
import { resolveR2WorkerRuntime } from './lib/r2-worker-sdk-runtime.mjs';

const owner = '00000000-0000-4000-8000-000000000001';
const post = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const sourceKey = `tmp/${owner}/${post}/video.mp4`;
const retainedKey = `${owner}/${post}/r2-retained-${other}.mp4`;
const env = { R2_BUCKET_NAME: 'offline-bucket', MODERATION_PROVIDER: 'local', R2_PUBLIC_BASE_URL: 'https://media.example' };
let externalRequests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { externalRequests++; throw new Error('OFFLINE_ONLY'); };
setCloudflareWorkersTestBinding(env);
const vite = await createServer({ root: process.cwd(), logLevel: 'error', plugins: [cloudflareWorkersTestPlugin()],
  server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
const r2 = await vite.ssrLoadModule('/src/lib/r2-server.ts');
const paths = await vite.ssrLoadModule('/src/lib/r2-media-path.ts');
const route = await vite.ssrLoadModule('/src/pages/api/forum/post-media.ts');
const delivery = await vite.ssrLoadModule('/src/pages/api/media/post/[mediaId].ts');
const media = await vite.ssrLoadModule('/src/lib/forum-media.ts');
after(async () => { await vite.close(); globalThis.fetch = originalFetch; assert.equal(externalRequests, 0); });

function storageFixture(options = {}) {
  const calls = [], objects = new Set();
  const client = { async send(command, controls) {
    calls.push(command); assert.ok(controls.abortSignal instanceof AbortSignal);
    const name = command.constructor.name;
    if (name === 'DeleteObjectCommand') { if (options.deleteFails) throw Error('PRIVATE_PROVIDER_ERROR'); return {}; }
    if (name === 'CopyObjectCommand') {
      assert.equal(command.input.CopySource, `offline-bucket/${sourceKey}`);
      assert.equal(command.input.CopySourceIfMatch, '"source-etag"');
      assert.equal(command.input.MetadataDirective, 'COPY');
      assert.equal(command.input.Key.startsWith('tmp/'), false);
      if (options.copyCommittedThenLostResponse) { objects.add(command.input.Key); throw Error('COPY_RESPONSE_LOST'); }
      if (options.copyFails) throw Error('PRIVATE_PROVIDER_ERROR');
      return { CopyObjectResult: options.missingCopyResult ? undefined : { ETag: '"copy-etag"' } };
    }
    assert.equal(name, 'HeadObjectCommand');
    if (command.input.Key === sourceKey) {
      if (options.missingSource) throw Error('NOT_FOUND');
      return { ContentLength: options.size ?? 12, ContentType: options.type ?? 'video/mp4', ETag: '"source-etag"' };
    }
    if (options.destinationHeadFails) throw Error('PRIVATE_PROVIDER_ERROR');
    return { ContentLength: options.destinationSize ?? 12, ContentType: 'video/mp4', ETag: options.etagMismatch ? '"other-etag"' : '"copy-etag"' };
  } };
  return { client, calls, objects };
}
const retain = (s, overrides = {}) => r2.retainTemporaryR2Video({ env, userId: owner, postId: post, sourceKey, retainedKey, mimeType: 'video/mp4', sizeBytes: 12, ...overrides }, s.client);

for (const [stage, options] of [
  ['source_head', { missingSource: true }], ['source_metadata', { size: 11 }],
  ['copy', { copyFails: true }], ['retained_head', { destinationHeadFails: true }],
  ['retained_metadata', { etagMismatch: true }],
]) test('retention safe stage: ' + stage, async () => {
  const storage = storageFixture(options);
  await assert.rejects(retain(storage), error => error.message === 'MEDIA_RETENTION_FAILED'
    && error.retentionStage === stage && !JSON.stringify(error).includes('PRIVATE_PROVIDER_ERROR'));
  assert.equal(storage.calls.some(c => c.constructor.name === 'DeleteObjectCommand'), false);
});

test('retention safe stage reaches the route without provider details', async () => {
  const fixture = postFixture({ storage: storageFixture({ copyFails: true }) });
  const response = await fixture.run();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'MEDIA_RETENTION_FAILED', retention_stage: 'copy' });
});

test('retention copies a post-bound source, pins its ETag and verifies destination before returning', async () => {
  const s = storageFixture(), key = await retain(s);
  assert.equal(paths.isRetainedR2VideoPath(key), true);
  assert.equal(key.startsWith(`${owner}/${post}/`), true);
  assert.deepEqual(s.calls.map(c => c.constructor.name), ['HeadObjectCommand', 'CopyObjectCommand', 'HeadObjectCommand']);
});
for (const source of [`tmp/${other}/${post}/v.mp4`, `tmp/${owner}/${other}/v.mp4`, `tmp/${owner}/v.mp4`, `${sourceKey}?x`, `${sourceKey}%2f`, `${sourceKey}/x`, `tmp/${owner}/${post}/..`]) {
  test('invalid temporary provenance is rejected before any storage request: ' + source.replaceAll(/[0-9a-f-]{36}/g, 'id'), async () => {
    const s = storageFixture(); await assert.rejects(retain(s, { sourceKey: source }), /MEDIA_RETENTION_INVALID_SOURCE/); assert.equal(s.calls.length, 0);
  });
}
for (const [name, options] of [['missing source', { missingSource: true }], ['size mismatch', { size: 11 }], ['negative size', { size: -1 }], ['type mismatch', { type: 'text/html' }],
  ['copy failure', { copyFails: true }], ['missing copy result', { missingCopyResult: true }], ['destination size mismatch', { destinationSize: 11 }], ['destination ETag mismatch', { etagMismatch: true }]]) {
  test(name + ' cannot return a publishable key or delete the upload source', async () => {
    const s = storageFixture(options); await assert.rejects(retain(s), { message: 'MEDIA_RETENTION_FAILED' });
    const deletions = s.calls.filter(c => c.constructor.name === 'DeleteObjectCommand');
    assert.equal(deletions.length, 0);
    assert.equal(s.calls.some(c => c.constructor.name === 'DeleteObjectCommand' && c.input.Key === sourceKey), false);
  });
}
test('compensation refuses temporary/unbound foreign namespace keys and reports uncertain deletion', async () => {
  const s = storageFixture({ deleteFails: true });
  assert.equal(await r2.discardUnboundR2Video(env, sourceKey, s.client), false); assert.equal(s.calls.length, 0);
  assert.equal(await r2.discardUnboundR2Video(env, retainedKey, s.client), false); assert.equal(s.calls.length, 1);
});
test('new S3 operation configuration does not retry', async () => {
  const client = r2.createR2Client({ R2_ACCOUNT_ID: 'offline', R2_ACCESS_KEY_ID: 'synthetic', R2_SECRET_ACCESS_KEY: 'synthetic' });
  try { assert.equal(await client.config.maxAttempts(), 1); } finally { client.destroy(); }
});
test('Worker XML resolution targets only the SDK parser, not application or other package modules', () => {
  const importer = process.cwd().replaceAll('\\', '/') + '/node_modules/@aws-sdk/xml-builder/dist-es/index.js';
  assert.ok(resolveR2WorkerRuntime('./xml-parser', importer).endsWith('/xml-parser.js'));
  assert.equal(resolveR2WorkerRuntime('./xml-parser', importer.replace('xml-builder', 'other')), null);
  assert.equal(resolveR2WorkerRuntime('./other', importer), null);
});

function postFixture(options = {}) {
  const calls = [], inserts = [], discarded = [];
  let insertionCount = 0, promotions = 0, claimed = false, committed = false;
  const client = {
    auth: { async getUser() { calls.push('auth'); return { data: { user: options.noUser ? null : { id: owner } }, error: null }; } },
    from(table) {
      if (table === 'posts') return { select() { return this; }, eq() { return this; }, update() { calls.push('moderation-update'); return this; },
        async single() { return { data: null, error: { message: 'MODERATION_UPDATE_FAILED' } }; }, async maybeSingle() {
        calls.push('post'); return { data: { id: post, author_id: options.foreignPost ? other : owner, status: options.status ?? 'published', moderation_status: 'published' }, error: null };
      } };
      if (table === 'post_media_r2_copy_claims') return {
        insert(value) { calls.push('claim'); assert.deepEqual(value, { post_id: post, user_id: owner, mime_type: 'video/mp4' }); return this; },
        select() { return this; }, abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return this; },
        async single() {
          if (claimed) return { data: null, error: { code: '23505' } };
          claimed = true;
          if (options.claimThrows) throw Error('CLAIM_RESPONSE_LOST');
          if (options.claimUnknown) return { data: null, error: { message: 'REPLY_LOST' } };
          return { data: { post_id: post, user_id: owner, claim_id: other, mime_type: 'video/mp4', retained_key: options.badClaim ? `tmp/${sourceKey}` : retainedKey }, error: null };
        },
      };
      assert.equal(table, 'post_media'); let rows, reset = false;
      const q = { update() { calls.push('reset'); reset = true; return q; }, eq() { return q; }, select() { return q; },
        async maybeSingle() { calls.push('existing-video'); return { data: committed || options.existingVideo ? { id: 'synthetic-existing' } : null, error: null }; },
        insert(value) { calls.push('insert'); rows = value; inserts.push(structuredClone(rows)); insertionCount++; return q; },
        then(resolve, reject) { return Promise.resolve().then(() => {
          if (reset) return { error: options.resetError ? { message: 'RESET_FAILED' } : null };
          if (options.insertThrows) { committed = true; throw Error('RESPONSE_LOST'); }
          if (options.legacy && insertionCount === 1) return { data: null, error: { message: 'column width does not exist' } };
          if (options.insertError) return { data: null, error: { message: 'INSERT_FAILED' } };
          committed = true; return { data: rows.map((r, i) => ({ ...r, id: `synthetic-${i}` })), error: null };
        }).then(resolve, reject); },
      }; return q;
    },
  };
  const handler = route.createPostMediaPost({ createUserClient: () => client,
    async requireAuthenticatedLegalConsent() { calls.push('consent'); return options.noConsent ? { ok: false, response: new Response(null, { status: 403 }) } : { ok: true }; },
    createLegalConsentReadRepository: () => ({}),
    async assertUserCanWrite() { calls.push('safety'); return { allowed: true }; },
    async retainTemporaryR2Video(p) { promotions++; calls.push('promote'); assert.equal(p.sourceKey, sourceKey); assert.equal(p.retainedKey, retainedKey); if (options.promotionError) throw Error('MEDIA_RETENTION_FAILED'); return options.storage ? r2.retainTemporaryR2Video(p, options.storage.client) : retainedKey; },
    ...(options.moderationFailure ? { async moderatePostMedia() { return { decision: 'review', reason: 'synthetic', score: 0, provider: 'local' }; } } : {}),
  });
  const payload = options.payload ?? [{ kind: 'video', storage_path: sourceKey, mime_type: 'video/mp4', size_bytes: 12 }];
  return { calls, inserts, discarded, run: () => handler({ request: new Request('https://app.example/api/forum/post-media', {
    method: 'POST', headers: { authorization: 'Bearer SYNTHETIC', 'content-type': 'application/json' }, body: JSON.stringify({ post_id: post, media: payload }),
  }), locals: {} }) };
}
test('actual attach handler persists only retained references and preserves the published result', async () => {
  const s = postFixture(), response = await s.run(), data = await response.json();
  assert.equal(response.status, 201); assert.equal(data.post.status, 'published');
  assert.equal(s.inserts[0][0].storage_path, retainedKey); assert.equal(data.media[0].storage_path, retainedKey);
  assert.deepEqual(s.calls, ['auth', 'consent', 'safety', 'post', 'existing-video', 'claim', 'promote', 'reset', 'insert']); assert.deepEqual(s.discarded, []);
});
for (const options of [{ noUser: true }, { noConsent: true }, { foreignPost: true }]) test('auth/consent/ownership denial has no retention or DB mutation: ' + Object.keys(options)[0], async () => {
  const s = postFixture(options); assert.equal((await s.run()).status, options.noUser ? 401 : 403);
  assert.equal(s.calls.includes('promote'), false); assert.equal(s.calls.includes('reset'), false); assert.equal(s.inserts.length, 0);
});
test('cross-post payload is rejected before any copy or write', async () => {
  const s = postFixture({ payload: [{ kind: 'video', storage_path: `tmp/${owner}/${other}/v.mp4`, mime_type: 'video/mp4' }] });
  assert.equal((await s.run()).status, 400); assert.equal(s.calls.includes('promote'), false); assert.equal(s.inserts.length, 0);
});
test('copy failure has no cover-reset or media insert', async () => {
  const s = postFixture({ promotionError: true }); assert.equal((await s.run()).status, 500);
  assert.equal(s.calls.includes('reset'), false); assert.equal(s.inserts.length, 0);
});
test('multiple videos are rejected before consuming a claim or copying', async () => {
  const item = { kind: 'video', storage_path: sourceKey, mime_type: 'video/mp4' };
  const s = postFixture({ payload: [item, item] }); assert.equal((await s.run()).status, 400);
  assert.deepEqual(s.discarded, []); assert.equal(s.inserts.length, 0); assert.equal(s.calls.includes('claim'), false);
});
test('post-copy pre-insert failure preserves the consumed claim and destination', async () => {
  const s = postFixture({ resetError: true }); assert.equal((await s.run()).status, 500);
  assert.deepEqual(s.discarded, []); assert.equal(s.inserts.length, 0);
});
for (const options of [{ insertError: true }, { insertThrows: true }]) test('uncertain DB outcome never deletes potentially referenced retained media: ' + Object.keys(options)[0], async () => {
  const s = postFixture(options); assert.equal((await s.run()).status, 500); assert.equal(s.inserts.length, 1); assert.deepEqual(s.discarded, []);
});
test('legacy-column fallback cannot reintroduce tmp references', async () => {
  const s = postFixture({ legacy: true }); assert.equal((await s.run()).status, 201); assert.equal(s.inserts.length, 2);
  assert.ok(s.inserts.every(rows => rows[0].storage_path === retainedKey)); assert.equal(s.calls.filter(c => c === 'promote').length, 1);
});
test('ordinary Supabase video fallback is unchanged and does not copy to R2', async () => {
  const key = `${owner}/${post}/existing.mp4`, s = postFixture({ payload: [{ kind: 'video', storage_path: key, mime_type: 'video/mp4' }] });
  assert.equal((await s.run()).status, 201); assert.equal(s.inserts[0][0].storage_path, key); assert.equal(s.calls.includes('promote'), false);
});
test('retained playback stays behind public-media visibility checks and uses R2, thumbnails stay on Supabase', async () => {
  const row = { id: other, user_id: owner, post_id: post, kind: 'video', storage_path: retainedKey, thumbnail_url: `${owner}/${post}/thumb.jpg`,
    posts: { id: post, status: 'published', moderation_status: 'published', circle_id: owner, circles: { id: owner, status: 'active', slug: 'public-circle', name: 'Public Circle' } } };
  const client = { from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: row }; } }; } };
  assert.deepEqual(await delivery.resolvePublicPostMediaTarget(client, other, 'display'), { path: retainedKey, delivery: 'r2' });
  assert.deepEqual(await delivery.resolvePublicPostMediaTarget(client, other, 'thumb'), { path: row.thumbnail_url, delivery: 'supabase' });
  row.posts.status = 'hidden'; assert.equal(await delivery.resolvePublicPostMediaTarget(client, other, 'display'), null);
  row.posts.status = 'published'; row.user_id = other; assert.equal(await delivery.resolvePublicPostMediaTarget(client, other, 'display'), null);
});
test('feed/media resolver never signs a retained R2 key in Supabase and public views prefer the guarded proxy', async () => {
  const signed = [], client = { storage: { from() { return { async createSignedUrls(keys) { signed.push(...keys); return { data: keys.map(key => ({ signedUrl: `https://storage.example/${key}` })) }; } }; } } };
  const row = { id: other, kind: 'video', storage_path: retainedKey, thumbnail_url: `${owner}/${post}/thumb.jpg` };
  const direct = await media.resolveSignedPostMedia(client, [row], 300, env.R2_PUBLIC_BASE_URL);
  assert.equal(direct[0].displayUrl, `${env.R2_PUBLIC_BASE_URL}/${retainedKey}`); assert.deepEqual(signed, [row.thumbnail_url]);
  const guarded = await media.resolveSignedPostMedia(client, [row], 300, env.R2_PUBLIC_BASE_URL, { publicProxy: true });
  assert.equal(guarded[0].displayUrl, `/api/media/post/${other}`);
});

for (const embeddedCopyError of [false, true]) test('actual Worker SDK CopyObject handles ' + (embeddedCopyError ? 'HTTP 200 embedded error' : 'copy and HEAD confirmation') + ' without external service access', async () => {
  const source = `import {retainTemporaryR2Video,createR2Client} from './src/lib/r2-server.ts';
    export default {async fetch(){const failures=[];try{const params={env:{R2_ACCOUNT_ID:'00000000000000000000000000000000',R2_ACCESS_KEY_ID:'offline-key',R2_SECRET_ACCESS_KEY:'offline-secret',R2_BUCKET_NAME:'offline-bucket'},userId:'${owner}',postId:'${post}',sourceKey:'${sourceKey}',retainedKey:'${retainedKey}',mimeType:'video/mp4',sizeBytes:12};const client=createR2Client(params.env),send=client.send.bind(client);client.send=async(...args)=>{try{return await send(...args);}catch(e){failures.push({name:e.name,status:e.$metadata?.httpStatusCode});throw e;}};const key=await retainTemporaryR2Video(params,client);return Response.json({ok:true,retained:!key.startsWith('tmp/')});}catch(e){return Response.json({ok:false,error:e.message,failures});}}};`;
  const compiled = await build({ stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'offline-retention.ts' },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
    plugins: [{ name: 'existing-r2-browser-runtime', setup(b) {
      b.onResolve({ filter: /^\.\/(?:runtimeConfig|xml-parser)(?:\.js)?$/ }, args => {
        const path = resolveR2WorkerRuntime(args.path, args.importer); return path ? { path } : null;
      });
    } }],
  });
  const requests = [], copyPreconditions = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ log: new Log(LogLevel.NONE), telemetry: { enabled: false }, workers: [{
    name: 'offline-retention', modules: true, script: compiled.outputFiles[0].text,
    compatibilityDate: '2026-05-17', compatibilityFlags: ['nodejs_compat'],
    outboundService(request) {
      const url = new URL(request.url); assert.equal(url.hostname.endsWith('r2.cloudflarestorage.com'), true);
      assert.equal(request.headers.has('authorization'), true);
      requests.push(request.method);
      if (request.method === 'HEAD') return new Response(null, { headers: { 'content-length': '12', 'content-type': 'video/mp4', etag: url.pathname.endsWith('/video.mp4') ? '"source-etag"' : '"copy-etag"' } });
      if (request.method === 'PUT') {
        copyPreconditions.push(request.headers.get('x-amz-copy-source-if-match'));
        const xml = embeddedCopyError ? '<Error><Code>InternalError</Code><Message>synthetic failure</Message></Error>'
          : '<CopyObjectResult><ETag>"copy-etag"</ETag><LastModified>2026-10-20T00:00:00Z</LastModified></CopyObjectResult>';
        return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
      }
      assert.equal(request.method, 'DELETE'); return new Response(null, { status: 204 });
    },
  }] }));
  try {
    const response = await mf.dispatchFetch('http://offline.local/'), result = await response.json();
    assert.deepEqual(copyPreconditions, ['"source-etag"']);
    assert.equal(result.ok, !embeddedCopyError, JSON.stringify({ result, requests }));
    if (embeddedCopyError) { assert.equal(result.error, 'MEDIA_RETENTION_FAILED'); assert.equal(result.failures[0].name, 'InternalError'); assert.deepEqual(requests, ['HEAD', 'PUT']); }
    else { assert.equal(result.retained, true); assert.deepEqual(requests, ['HEAD', 'PUT', 'HEAD']); }
  } finally { await mf.dispose(); }
});

test('sequential successful replay does not copy again', async () => {
  const s = postFixture(); assert.equal((await s.run()).status, 201); assert.equal((await s.run()).status, 409);
  assert.equal(s.calls.filter(c => c === 'promote').length, 1);
});
test('overlapping requests share the durable-claim contract and only one can copy', async () => {
  const s = postFixture(), results = await Promise.all([s.run(), s.run()]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(s.calls.filter(c => c === 'promote').length, 1);
});
for (const options of [{ claimUnknown: true }, { claimThrows: true }, { badClaim: true }, { promotionError: true }, { resetError: true }, { insertThrows: true }, { moderationFailure: true }]) {
  test('failed/ambiguous attempt cannot authorize another copy: ' + Object.keys(options)[0], async () => {
    const s = postFixture(options); assert.ok((await s.run()).status >= 400); assert.ok((await s.run()).status >= 400);
    assert.equal(s.calls.filter(c => c === 'promote').length, options.claimUnknown || options.claimThrows || options.badClaim ? 0 : 1);
    assert.deepEqual(s.discarded, []);
  });
}
for (const status of ['pending', 'hidden', 'deleted']) test('actual create-post status contract: ' + status, async () => {
  const s = postFixture({ status }); assert.equal((await s.run()).status, status === 'pending' ? 201 : 409);
  assert.equal(s.calls.includes('claim'), status === 'pending');
});
test('foreign or mismatched retained destination fails before storage access', async () => {
  for (const key of [`${other}/${post}/r2-retained-${other}.mp4`, retainedKey.replace('.mp4', '.mov'), sourceKey]) {
    const s = storageFixture(); await assert.rejects(retain(s, { retainedKey: key }), /MEDIA_RETENTION_INVALID_DESTINATION/);
    assert.equal(s.calls.length, 0);
  }
});
test('a copy committed behind a lost reply is neither deleted nor copied again', async () => {
  const storage = storageFixture({ copyCommittedThenLostResponse: true }), s = postFixture({ storage });
  assert.equal((await s.run()).status, 500); assert.equal((await s.run()).status, 409);
  assert.equal(storage.objects.has(retainedKey), true);
  assert.deepEqual(storage.calls.map(c => c.constructor.name), ['HeadObjectCommand', 'CopyObjectCommand']);
  assert.deepEqual(s.discarded, []);
});
test('a changed source cannot reopen a consumed post claim after failure', async () => {
  const item = { kind: 'video', storage_path: sourceKey, mime_type: 'video/mp4' };
  const s = postFixture({ payload: [item], promotionError: true }); assert.equal((await s.run()).status, 500);
  item.storage_path = `tmp/${owner}/${post}/different.mp4`;
  assert.equal((await s.run()).status, 409); assert.equal(s.calls.filter(c => c === 'promote').length, 1);
});
