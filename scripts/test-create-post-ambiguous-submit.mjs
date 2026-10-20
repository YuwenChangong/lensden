import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Execute the actual component's submit/rollback functions with nonsecret
// browser dependencies, not a separately reimplemented state machine.
const source = await readFile(new URL('../src/components/forum/CreatePostForm.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('CreatePostForm.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && ['handleSubmit', 'rollbackPendingPost'].includes(node.name.text)) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(functions.size, 2);
const compiled = ts.transpileModule([...functions.values()].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const owner = '00000000-0000-4000-8000-000000000001';
const post = '00000000-0000-4000-8000-000000000002';

function fixture({ outcome = 'lost', fallback = false, predispatchFailure = false } = {}) {
  const calls = [], unresolvedPostRef = { current: '' }, submitLockRef = { current: false }, state = {};
  let uploads = 0;
  const item = { kind: 'video', file: { name: 'synthetic.mp4' }, previewUrl: 'blob:synthetic', sizeBytes: 12, mimeType: 'video/mp4' };
  const deps = {
    supabase: {
      auth: { async getSession() { return { data: { session: { access_token: 'SYNTHETIC', user: { id: owner } } } }; } },
      storage: { from(bucket) { assert.equal(bucket, 'post-media'); return { async remove(paths) { calls.push(['remove', ...paths]); } }; } },
    },
    submitLockRef, unresolvedPostRef, circleSlug: 'public', type: 'question', title: 'Synthetic', body: 'Body', nextPath: '/new',
    mediaFiles: predispatchFailure ? [item, item] : [item], context: { locale: 'en' },
    text: { submitFailed: 'failed', unknownError: 'unknown', mediaWriteFailed: 'media failed', videoUploadFailed: 'video failed', publishedRedirecting: 'done' },
    async fetch(url, options) {
      calls.push([options.method, url]);
      if (options.method === 'DELETE') return new Response(null, { status: 200 });
      if (url === '/api/forum/posts') return Response.json({ post: { id: post, status: 'published' } }, { status: 201 });
      assert.equal(url, '/api/forum/post-media');
      if (outcome === 'lost') throw Error('RESPONSE_LOST_AFTER_COMMIT');
      if (outcome === 'moderation') return Response.json({ error: 'MODERATION_UPDATE_FAILED_AFTER_INSERT' }, { status: 500 });
      if (outcome === 'malformed') return new Response('incomplete response', { status: 201 });
      return Response.json({ media: [{ storage_path: 'synthetic-retained' }] }, { status: 201 });
    },
    async uploadVideoToExternal() {
      uploads++;
      if (predispatchFailure && uploads === 2) throw Error('INVALID_VIDEO');
      if (fallback || predispatchFailure) throw Error('Missing required env var: R2_BUCKET_NAME');
      return { storagePath: `tmp/${owner}/${post}/video.mp4` };
    },
    async guardDirectMediaUpload() {}, async uploadToPostMediaWithTus() { calls.push(['tus']); },
    normalizeFileName: value => value, presentVideoUploadError: value => value, mapAuthError: value => value,
    localizeCommunityStatus: () => '', buildLoginHref: () => '/login',
    window: { location: { replace() {}, assign() { calls.push(['redirect']); } } }, URL: { revokeObjectURL() {} },
    ...Object.fromEntries(['Submitting', 'Error', 'Message', 'Title', 'Body', 'MediaFiles', 'UnresolvedPostId'].map(name => [`set${name}`, value => { state[name] = value; }])),
  };
  const submit = new Function(...Object.keys(deps), `${compiled}\nreturn handleSubmit;`)(...Object.values(deps));
  return { submit: () => submit({ preventDefault() {} }), calls, state, unresolvedPostRef, submitLockRef };
}

for (const outcome of ['lost', 'moderation', 'malformed']) for (const fallback of [false, true]) {
  test(`actual browser preserves possibly committed post/media: ${outcome}, fallback=${fallback}`, async () => {
    const s = fixture({ outcome, fallback }); await s.submit();
    assert.equal(s.unresolvedPostRef.current, post); assert.equal(s.state.UnresolvedPostId, post);
    assert.equal(s.calls.some(([method]) => method === 'DELETE' || method === 'remove'), false);
    assert.equal(s.calls.filter(([method]) => method === 'tus').length, fallback ? 1 : 0);
    const count = s.calls.length; await s.submit(); assert.equal(s.calls.length, count, 'unresolved draft cannot submit again');
    assert.equal(s.submitLockRef.current, false);
  });
}
test('provably pre-dispatch failure keeps existing Supabase/post cleanup', async () => {
  const s = fixture({ predispatchFailure: true }); await s.submit();
  assert.equal(s.calls.some(([, url]) => url === '/api/forum/post-media'), false);
  assert.equal(s.calls.filter(([method]) => method === 'remove').length, 1);
  assert.equal(s.calls.filter(([method]) => method === 'DELETE').length, 1);
  assert.equal(s.unresolvedPostRef.current, '');
});
test('successful Supabase fallback has no rollback and duplicate concurrent browser submit is blocked', async () => {
  const s = fixture({ fallback: true, outcome: 'success' }); await Promise.all([s.submit(), s.submit()]);
  assert.equal(s.calls.filter(([method, url]) => method === 'POST' && url === '/api/forum/posts').length, 1);
  assert.equal(s.calls.filter(([, url]) => url === '/api/forum/post-media').length, 1);
  assert.equal(s.calls.some(([method]) => method === 'remove' || method === 'DELETE'), false);
  assert.equal(s.unresolvedPostRef.current, ''); assert.equal(s.state.MediaFiles.length, 0);
});
