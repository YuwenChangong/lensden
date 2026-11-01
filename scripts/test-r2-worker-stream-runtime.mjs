import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'vite';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { resolveR2WorkerRuntime } from './lib/r2-worker-sdk-runtime.mjs';

const root = process.cwd().replaceAll('\\', '/');
const importer = root + '/node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-throw-200-exceptions/throw-200-exceptions.js';
const owner = '00000000-0000-4000-8000-000000000001';
const post = '00000000-0000-4000-8000-000000000002';
const claim = '00000000-0000-4000-8000-000000000003';

test('Worker stream override is limited to the S3 response replay helper', () => {
  for (const suffix of ['', '.js']) {
    assert.equal(resolveR2WorkerRuntime('../to-stream/toStream' + suffix, importer),
      root + '/node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/to-stream/toStream.browser.js');
  }
  assert.equal(resolveR2WorkerRuntime('../to-stream/toStream', importer.replace('middleware-sdk-s3', 'unrelated')), null);
  assert.equal(resolveR2WorkerRuntime('../other/toStream', importer), null);
});

for (const replayFix of [false, true]) test('production Vite Worker graph ' + (replayFix ? 'uses Web streams' : 'reproduces the deployed Node stream mismatch'), async () => {
  const entry = '\0offline-retention-entry';
  const source = `import {retainTemporaryR2Video,createR2Client} from '${root}/src/lib/r2-server.ts';
    export default {async fetch(){const failures=[];try{const params={env:{R2_ACCOUNT_ID:'00000000000000000000000000000000',R2_ACCESS_KEY_ID:'synthetic',R2_SECRET_ACCESS_KEY:'synthetic',R2_BUCKET_NAME:'offline-bucket'},userId:'${owner}',postId:'${post}',sourceKey:'tmp/${owner}/${post}/video.mp4',retainedKey:'${owner}/${post}/r2-retained-${claim}.mp4',mimeType:'video/mp4',sizeBytes:2018};const client=createR2Client(params.env),send=client.send.bind(client);client.send=async(...args)=>{try{return await send(...args);}catch(e){failures.push({name:e.name,message:e.message});throw e;}};await retainTemporaryR2Video(params,client);return Response.json({ok:true});}catch(e){return Response.json({ok:false,stage:e.retentionStage,failures});}}};`;
  const output = await build({ configFile: false, logLevel: 'silent',
    resolve: { conditions: ['workerd', 'browser'] },
    ssr: { noExternal: true, resolve: { conditions: ['workerd', 'browser'] } },
    plugins: [{ name: 'offline-production-r2-graph', enforce: 'pre',
      resolveId(id, from) {
        if (id === entry) return id;
        if (!replayFix && id.startsWith('../to-stream/')) return null;
        return resolveR2WorkerRuntime(id, from);
      },
      load(id) { if (id === entry) return source; },
    }],
    build: { ssr: true, write: false, minify: false, target: 'es2022',
      rollupOptions: { input: entry, output: { inlineDynamicImports: true } } },
  });
  const code = output.output.find(item => item.type === 'chunk' && item.isEntry).code;
  const calls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ log: new Log(LogLevel.NONE), telemetry: { enabled: false }, workers: [{
    name: 'offline-production-r2', modules: true, script: code,
    compatibilityDate: '2026-05-17', compatibilityFlags: ['nodejs_compat'],
    outboundService(request) {
      const url = new URL(request.url);
      assert.ok(['00000000000000000000000000000000.r2.cloudflarestorage.com',
        'offline-bucket.00000000000000000000000000000000.r2.cloudflarestorage.com'].includes(url.hostname));
      assert.equal(request.headers.has('authorization'), true);
      calls.push(request.method);
      if (request.method === 'HEAD') return new Response(null, { headers: {
        'content-length': '2018', 'content-type': 'video/mp4', etag: '"synthetic-etag"',
      } });
      assert.equal(request.method, 'PUT');
      assert.equal(request.headers.get('x-amz-copy-source-if-match'), '"synthetic-etag"');
      return new Response('<CopyObjectResult><ETag>"synthetic-etag"</ETag><LastModified>2026-10-20T00:00:00Z</LastModified></CopyObjectResult>',
        { headers: { 'content-type': 'application/xml' } });
    },
  }] }));
  try {
    const result = await (await mf.dispatchFetch('http://offline.local/')).json();
    assert.equal(result.ok, replayFix, JSON.stringify(result));
    if (replayFix) assert.deepEqual(calls, ['HEAD', 'PUT', 'HEAD']);
    else {
      assert.equal(result.stage, 'source_head');
      assert.match(result.failures[0].message, /stream.getReader is not a function/);
      assert.deepEqual(calls, ['HEAD']);
    }
  } finally { await mf.dispose(); }
});
