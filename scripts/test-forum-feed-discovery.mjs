import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';

// Exercise the real feed pagination with synthetic rows and no network/DB.
const bundle = await build({ entryPoints: ['src/lib/forum-feed.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'engagement-fixture', setup(b) {
    b.onResolve({ filter: /post-engagement$/ }, () => ({ path: 'engagement', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const buildPostBookmarkCountMap=async()=>new Map();
      export const buildPostCommentCountMap=async()=>new Map();
      export const buildPostLikeCountMap=async()=>new Map();
      export const isMissingViewCountError=()=>false;
    `, loader: 'js' }));
  } }] });
const { listForumFeed } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const hidden = { id: 'hidden', circles: { slug: 'rls-test', status: 'active' } };
const publicPost = id => ({ id, circles: { slug: 'public-circle', status: 'active' } });
function clientFor(rows) {
  const query = { select() { return query; }, eq() { return query; }, order() { return query; },
    range(start, end) { return Promise.resolve({ data: rows.slice(start, end + 1), error: null }); } };
  return { from(table) { assert.equal(table, 'posts'); return query; } };
}
const page = (rows, number) => listForumFeed({ client: clientFor(rows), sort: 'latest', limit: 2, page: number });

test('hidden circle rows do not terminate discovery or consume the next page sentinel', async () => {
  const rows = [hidden, publicPost('one'), publicPost('two'), publicPost('three')];
  const first = await page(rows, 1);
  const second = await page(rows, 2);
  assert.deepEqual(first.posts.map(post => post.id), ['one']);
  assert.equal(first.has_more, true);
  assert.deepEqual(second.posts.map(post => post.id), ['two', 'three']);
  assert.equal(second.has_more, false);
});

test('an entirely filtered page retains continuation to later public posts', async () => {
  const rows = [hidden, hidden, publicPost('later')];
  const first = await page(rows, 1);
  assert.equal(first.posts.length, 0);
  assert.equal(first.has_more, true);
  assert.deepEqual((await page(rows, 2)).posts.map(post => post.id), ['later']);
});

test('ordinary pages retain existing boundaries and stop at the end', async () => {
  const rows = ['one', 'two', 'three'].map(publicPost);
  assert.deepEqual((await page(rows, 1)).posts.map(post => post.id), ['one', 'two']);
  assert.equal((await page(rows, 1)).has_more, true);
  assert.equal((await page(rows, 2)).has_more, false);
  assert.deepEqual((await page(rows, 3)).posts, []);
  assert.equal((await page(rows, 3)).has_more, false);
});
