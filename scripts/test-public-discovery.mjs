import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
async function load(file, fixtureCommentId) {
  const plugins = fixtureCommentId ? [{ name: 'synthetic-classification', setup(b) {
    b.onResolve({ filter: /discovery-exclusions$/ }, () => ({ path: 'classification', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js',
      contents: `export const isDiscoveryExcluded=(kind,id)=>kind==='comments'&&id===${JSON.stringify(fixtureCommentId)};` }));
  } }] : [];
  const result = await build({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent', plugins });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const discovery = await load('src/lib/forum-discovery.ts'), seo = await load('src/lib/seo.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const post = n => ({ id: id(n), status: 'published', moderation_status: 'published', circles: { slug: 'public-circle', name: 'Test camera compatibility', status: 'active' } });
const comment = n => ({ id: id(n), post_id: id(1), parent_id: null, body: 'Public reply </script><img onerror=alert(1)>',
  status: 'published', moderation_status: 'published', created_at: '2026-11-02T01:00:00Z', author: { display_name: 'Visible member', username: null } });
function fixture(rows, { cap = 500, count, changeCount = false, duplicate = false } = {}) {
  const calls = []; let reads = 0;
  return { calls, from(table) {
    const filters = []; const query = {
      select(columns, options) { calls.push({ table, columns, filters }); assert.equal(options.count, 'exact'); return query; },
      eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, retry(value) { assert.equal(value, false); return query; },
      range(start, end) { reads++; return Promise.resolve({ data: duplicate ? [rows[0], rows[0]] : rows.slice(start, Math.min(end + 1, start + cap)),
        count: count === undefined ? rows.length + (changeCount && reads > 1 ? 1 : 0) : count, error: null }); },
    }; return query;
  } };
}

test('public discovery uses authoritative states and exact fixture identities, never popularity/title/age', () => {
  assert.equal(discovery.isDiscoverablePost({ ...post(1), likes: 0, view_count: 0, created_at: '2010-01-01' }), true);
  for (const status of ['draft', 'private', 'hidden', 'deleted', 'banned']) assert.equal(discovery.isDiscoverablePost({ ...post(1), status }), false);
  for (const moderation_status of ['pending_review', 'hidden_by_admin', 'rejected', null]) assert.equal(discovery.isDiscoverablePost({ ...post(1), moderation_status }), false);
  for (const circles of [null, { ...post(1).circles, status: 'hidden' }, { ...post(1).circles, slug: 'qa0a39aa70-f4d5-40e1' }]) assert.equal(discovery.isDiscoverablePost({ ...post(1), circles }), false);
  assert.equal(discovery.isDiscoverablePost({ ...post(1), id: 'fba0a005-1008-4fe5-8899-52c23efd2bfb' }), false);
});

test('forum sitemap exhausts up to 5000 rows despite server caps without body/profile reads', async () => {
  const rows = Array.from({ length: 5000 }, (_, n) => post(n)); const client = fixture(rows, { cap: 250 });
  const result = await discovery.readForumSitemapRows(client);
  assert.equal(result.length, 5000); assert.equal(client.calls.length, 20);
  assert.equal(client.calls[0].columns, 'id,status,moderation_status,circles:circle_id!inner(id,slug,name,status)');
  assert.deepEqual(client.calls[0].filters, [['status', 'published'], ['moderation_status', 'published'], ['circles.status', 'active']]);
  assert.equal(new Set(result.map(row => row.id)).size, 5000);
});

test('sitemap rejects overflow, missing/changing counts, duplicates and request exhaustion', async () => {
  const rows = Array.from({ length: 22 }, (_, n) => post(n));
  for (const options of [{ count: 5001 }, { count: null }, { cap: 1 }, { cap: 2, changeCount: true }, { duplicate: true }]) {
    const client = fixture(rows, options);
    await assert.rejects(discovery.readForumSitemapRows(client), { message: 'Public discovery unavailable.' });
    assert.ok(client.calls.length <= 20);
  }
});

test('sitemap reader itself excludes removed/unmoderated/fixture rows returned by a faulty boundary', async () => {
  const rows = [post(1), { ...post(2), status: 'deleted' }, { ...post(3), moderation_status: 'pending_review' },
    { ...post(4), id: '3516d117-b1a8-4a44-a497-9350466b59ec' }];
  assert.deepEqual((await discovery.readForumSitemapRows(fixture(rows))).map(row => row.id), [id(1)]);
});

test('separate SDK transport enforces GET-only target and physical budget, no retries or redirects', async () => {
  let requests = 0;
  const transport = discovery.createForumTransport('https://db.invalid', 'sitemap', async (input, init) => {
    requests++; assert.equal(init.redirect, 'manual');
    const url = new URL(input);
    assert.equal(url.searchParams.get('status'), 'eq.published');
    assert.equal(url.searchParams.get('moderation_status'), 'eq.published');
    const start = Number(url.searchParams.get('offset') ?? 0);
    return Response.json([post(start)], { headers: { 'content-range': `${start}-${start}/21` } });
  });
  try {
    const sdk = createClient('https://db.invalid', 'fixture-anon', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transport.fetch } });
    await assert.rejects(discovery.readForumSitemapRows(sdk)); assert.equal(requests, 20);
    await assert.rejects(transport.fetch('https://db.invalid/rest/v1/posts')); assert.equal(requests, 20);
  } finally { transport.abort(); }
  for (const target of ['https://evil.invalid/rest/v1/posts', 'https://db.invalid/rest/v1/profiles', 'https://db.invalid/rest/v1/rpc/write']) {
    const guarded = discovery.createForumTransport('https://db.invalid', 'sitemap', async () => { throw new Error('Must not dispatch'); });
    await assert.rejects(guarded.fetch(target)); guarded.abort();
  }
});

test('transport rejects redirected, oversized, cancelled and write requests', async () => {
  for (const response of [new Response(null, { status: 302, headers: { location: 'https://evil.invalid/' } }), new Response('x'.repeat(1_000_001))]) {
    let calls = 0; const transport = discovery.createForumTransport('https://db.invalid', 'comments', async () => { calls++; return response; });
    await assert.rejects(transport.fetch('https://db.invalid/rest/v1/comments')); assert.equal(calls, 1);
    await assert.rejects(transport.fetch('https://db.invalid/rest/v1/comments', { method: 'POST' })); assert.equal(calls, 1);
    transport.abort(); await assert.rejects(transport.fetch('https://db.invalid/rest/v1/comments')); assert.equal(calls, 1);
  }
});

test('comment pages preserve the lookahead row and public parent relationship without off-page identities', async () => {
  const rows = Array.from({ length: 101 }, (_, n) => comment(n));
  rows[1].parent_id = rows[0].id; rows[2].parent_id = id(9999);
  const client = fixture(rows, { cap: 25 });
  const first = await discovery.readPublicCommentPage(client, id(1), 1);
  const second = await discovery.readPublicCommentPage(fixture(rows), id(1), 2);
  assert.equal(first.comments.length, 50); assert.equal(first.hasMore, true); assert.equal(client.calls.length, 3);
  assert.equal(first.comments[1].parent_id, rows[0].id); assert.equal(first.comments[2].parent_id, null);
  assert.equal(second.comments[0].id, rows[50].id);
  assert.equal((await discovery.readPublicCommentPage(fixture(rows), id(1), 3)).hasMore, false);
  assert.ok(!client.calls[0].columns.includes('author_id,'));
  assert.ok(!client.calls[0].columns.includes('role'));
});

test('comment limits fail closed, cycles cannot suppress public bodies, invalid page input is rejected', async () => {
  const rows = [comment(1), comment(2)]; rows[0].parent_id = rows[1].id; rows[1].parent_id = rows[0].id;
  assert.ok((await discovery.readPublicCommentPage(fixture(rows), id(1), 1)).comments.every(row => row.parent_id === null));
  for (const rows of [[{ ...comment(1), status: 'hidden' }], [{ ...comment(1), post_id: id(2) }]]) await assert.rejects(discovery.readPublicCommentPage(fixture(rows), id(1), 1));
  await assert.rejects(discovery.readPublicCommentPage(fixture(rows, { count: 50001 }), id(1), 1));
  await assert.rejects(discovery.readPublicCommentPage(fixture(Array.from({ length: 51 }, (_, n) => comment(n)), { cap: 1 }), id(1), 1));
  for (const value of ['0', '-1', '1.5', '1001', 'NaN', '1e3', '0001']) assert.equal(discovery.parsePublicCommentPage(value), undefined);
  assert.equal(discovery.parsePublicCommentPage(null), 1);
});

test('explicit synthetic comment classification excludes that record and its private parent reference', async () => {
  const classified = await load('src/lib/forum-discovery.ts', id(10));
  const rows = [comment(10), { ...comment(11), parent_id: id(10) }];
  const result = await classified.readPublicCommentPage(fixture(rows), id(1), 1);
  assert.deepEqual(result.comments.map(row => row.id), [id(11)]);
  assert.equal(result.comments[0].parent_id, null);
});

test('discussion markup includes only visible supported facts and public reply references, safely escaped', () => {
  const main = { ...post(1), title: 'Visible discussion', created_at: '2026-11-02T00:00:00Z' };
  const one = comment(2), two = { ...comment(3), parent_id: id(2) };
  const hidden = { ...comment(4), status: 'hidden', body: 'PRIVATE_SENTINEL' };
  const input = { post: main, text: 'Full visible main body', authorName: 'Public author', url: 'https://lensden.net/posts/' + id(1) + '/', comments: [one, two, hidden], commentPage: 2 };
  const schema = seo.discussionSchema(input);
  assert.equal(schema.comment.length, 2); assert.equal(schema.comment[1].inReplyTo['@id'], schema.comment[0]['@id']);
  assert.ok(schema.comment[0].url.includes('?comments_page=2#comment-'));
  for (const property of ['interactionStatistic', 'commentCount', 'dateModified', 'author_id']) assert.equal(schema[property], undefined);
  const serialized = seo.serializeJsonLd(schema); assert.ok(!serialized.includes('</script>')); assert.ok(!serialized.includes('PRIVATE_SENTINEL'));
  assert.deepEqual(JSON.parse(serialized), schema);
  for (const input2 of [{ ...input, authorName: undefined }, { ...input, text: '' }, { ...input, post: { ...main, created_at: 'invalid' } }]) assert.equal(seo.discussionSchema(input2), undefined);
  assert.equal(seo.discussionSchema({ ...input, post: { ...main, type: 'news' } }), undefined);
});
