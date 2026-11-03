import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';

// Real installed SDK and real handlers; only the auth boundary and data transport
// use local doubles. The existing signed-MFA suite verifies the real auth guard.
const out = resolve('artifacts/qa/seo-geo-phase3');
await mkdir(out, { recursive: true });
const routes = ['forum/posts', 'forum/media', 'forum/circles', 'moderation/queue'];
const entries = routes.map((route, i) => `export * as route${i} from './src/pages/api/admin/${route}.ts';`).join('\n')
  + "\nexport { resolveReportTargetPreview } from './src/lib/server/reports.server.ts';"
  + "\nexport { createSignedModerationUrls } from './src/lib/moderation/moderation-media.server.ts';";
await build({ stdin: { contents: entries, resolveDir: process.cwd(), sourcefile: 'projection-tests.ts' }, outfile: resolve(out, 'admin-projections.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'local-boundaries', setup(b) {
  b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'fixture' }));
  b.onResolve({ filter: /^fixture-auth$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'env' ? 'export const env={};' : `
    export const jsonResponse=(value,status=200)=>new Response(JSON.stringify(value),{status});
    export const requireModerator=(...args)=>globalThis.__geoProjectionGuard(...args);
    export const requireAdmin=requireModerator;
  ` }));
  b.onLoad({ filter: /src[\\/]pages[\\/]api[\\/]admin[\\/](?:forum[\\/](?:posts|media|circles)|moderation[\\/]queue)\.ts$/ }, async ({ path }) => ({ contents: (await readFile(path, 'utf8')).replace(/from "[^"\n]+\/admin-auth"/g, 'from "fixture-auth"'), loader: 'ts' }));
} }] });
const app = await import(pathToFileURL(resolve(out, 'admin-projections.mjs')).href);
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('No external fetch allowed'); };
const postId = '00000000-0000-0000-0000-000000000001';
const circleId = '00000000-0000-0000-0000-000000000002';
const userId = '00000000-0000-0000-0000-000000000003';
const profile = { id: userId, username: 'fixture', display_name: 'Fixture', avatar_url: null, role: 'member' };
const circle = { id: circleId, slug: 'fixture-circle', name: 'Fixture circle', status: 'active' };
const post = { id: postId, title: 'Fixture post', status: 'published', moderation_status: 'published', circle_id: circleId, circles: circle };
function fixture(tables, { denied = false, missingStatus = false } = {}) {
  const calls = [];
  let guards = 0;
  const client = createClient('https://projection-fixture.invalid', 'synthetic-anon', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://projection-fixture.invalid');
    assert.equal(init.method, 'GET');
    const table = url.pathname.split('/').at(-1);
    calls.push({ table, select: url.searchParams.get('select') });
    if (missingStatus && table === 'circles' && url.searchParams.get('select').split(',').includes('status')) return Response.json({ code: '42703', message: 'column circles.status does not exist' }, { status: 400 });
    const rows = tables[table] ?? [];
    const single = new Headers(init.headers).get('accept')?.includes('object+json');
    return Response.json(single ? rows[0] ?? null : rows);
  } } });
  globalThis.__geoProjectionGuard = async () => { guards++; if (denied) throw new Response('Denied', { status: 403 }); return { client, user: { id: userId } }; };
  return { client, calls, guards: () => guards };
}
const context = path => ({ request: new Request('https://local.invalid' + path), locals: {} });
test('all four actual admin GET handlers deny before any query', async () => {
  for (let i = 0; i < routes.length; i++) {
    const f = fixture({}, { denied: true });
    const response = await app['route' + i].GET(context('/api/admin/' + routes[i]));
    assert.equal(response.status, 403); assert.equal(f.guards(), 1); assert.deepEqual(f.calls, []);
  }
});
test('to-one object projections preserve real administrative fields', async () => {
  fixture({ posts: [{ ...post, author_id: userId, profiles: profile, post_media: [] }] });
  const posts = await (await app.route0.GET(context('/api/admin/forum/posts'))).json();
  assert.equal(posts.posts[0].author_profile.display_name, 'Fixture'); assert.equal(posts.posts[0].circle_slug, circle.slug);
  fixture({ post_media: [{ id: 'media', post_id: postId, user_id: userId, posts: post, profiles: profile }] });
  const media = await (await app.route1.GET(context('/api/admin/forum/media'))).json();
  assert.equal(media.media[0].is_bound_to_post, true); assert.equal(media.media[0].uploader_profile.id, userId);
  fixture({ circles: [{ ...circle, owner_id: userId, profiles: profile }] });
  const circles = await (await app.route2.GET(context('/api/admin/forum/circles'))).json();
  assert.equal(circles.circles[0].owner_profile.username, 'fixture'); assert.equal(circles.circles[0].status, 'active');
  fixture({ comments: [{ id: 'comment', posts: post, profiles: profile, moderation_status: 'pending_review' }] });
  const queue = await (await app.route3.GET(context('/api/admin/moderation/queue'))).json();
  assert.equal(queue.items[0].post.id, postId); assert.equal(queue.items[0].circle.id, circleId);
});
test('unexpected array joins never fabricate an owner, post, circle or bound media', async () => {
  fixture({ posts: [{ ...post, author_id: userId, profiles: [profile], circles: [circle], post_media: [] }] });
  const posts = await (await app.route0.GET(context('/api/admin/forum/posts'))).json();
  assert.equal(posts.posts[0].author_profile, null); assert.equal(posts.posts[0].circle_slug, null);
  fixture({ post_media: [{ id: 'media', post_id: postId, user_id: userId, posts: [post], profiles: [profile] }] });
  const media = await (await app.route1.GET(context('/api/admin/forum/media'))).json();
  assert.equal(media.media[0].uploader_profile, null); assert.equal(media.media[0].is_bound_to_post, false);
  fixture({ circles: [{ ...circle, owner_id: userId, profiles: [profile] }] });
  const circles = await (await app.route2.GET(context('/api/admin/forum/circles'))).json();
  assert.equal(circles.circles[0].owner_profile, null);
  fixture({ comments: [{ id: 'comment', posts: [post], profiles: [profile], moderation_status: 'pending_review' }] });
  const queue = await (await app.route3.GET(context('/api/admin/moderation/queue'))).json();
  assert.equal(queue.items[0].post, null); assert.equal(queue.items[0].author_profile, null); assert.equal(queue.items[0].circle, null);
});
test('null joins and missing legacy circle status retain safe existing fallbacks', async () => {
  fixture({ post_media: [{ id: 'media', post_id: postId, posts: null, profiles: null }] });
  const media = await (await app.route1.GET(context('/api/admin/forum/media'))).json();
  assert.equal(media.media[0].post_status, null); assert.equal(media.media[0].uploader_profile, null);
  const f = fixture({ circles: [{ id: circleId, slug: circle.slug, owner_id: null, profiles: null }] }, { missingStatus: true });
  const response = await app.route2.GET(context('/api/admin/forum/circles'));
  assert.equal(response.status, 200); const circles = await response.json();
  assert.equal(circles.circles[0].status, 'active'); assert.equal(circles.circles[0].owner_profile, null);
  assert.equal(f.calls.filter(c => c.table === 'circles').length, 2);
});
test('reports validate object parent eligibility and reject ambiguous arrays', async () => {
  let f = fixture({ comments: [{ id: 'comment', post_id: postId, status: 'published', moderation_status: 'published', author_id: userId, posts: post, profiles: profile }] });
  let result = await app.resolveReportTargetPreview(f.client, 'comment', 'comment');
  assert.equal(result.available, true); assert.equal(result.target.post.id, postId); assert.equal(result.target.author_profile.id, userId);
  f = fixture({ comments: [{ id: 'comment', post_id: postId, status: 'published', moderation_status: 'published', posts: [post], profiles: [profile] }] });
  result = await app.resolveReportTargetPreview(f.client, 'comment', 'comment');
  assert.equal(result.available, false); assert.equal(result.target.post, null); assert.equal(result.target.author_profile, null);
  f = fixture({ posts: [{ ...post, profiles: profile, circles: { ...circle, status: 'deleted' } }] });
  result = await app.resolveReportTargetPreview(f.client, 'post', postId);
  assert.equal(result.available, false);
});
test('relative signing compatibility uses a public URL builder without private SDK state', async () => {
  let builds = 0;
  const urls = await app.createSignedModerationUrls({
    client: { storage: { from: () => ({
      get url() { throw new Error('Private SDK state must not be read'); },
      getPublicUrl: () => { builds++; return { data: { publicUrl: 'https://storage-fixture.invalid/storage/v1/object/public/post-media/' } }; },
      createSignedUrls: async () => ({ data: [{ signedUrl: '/storage/v1/object/sign/post-media/private/a.png?token=fixture' }], error: null }),
    }) } },
    values: ['private/a.png', 'forbidden/a.png'], allowedPrefixes: ['private/'],
  });
  assert.deepEqual(urls, ['https://storage-fixture.invalid/storage/v1/object/sign/post-media/private/a.png?token=fixture']);
  assert.equal(builds, 1);
});
test('actual installed storage SDK signs only allowed paths and returns absolute URLs', async () => {
  const calls = [];
  const client = createClient('https://storage-fixture.invalid', 'synthetic-anon', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    assert.equal(String(input), 'https://storage-fixture.invalid/storage/v1/object/sign/post-media');
    assert.equal(init.method, 'POST'); calls.push(JSON.parse(init.body));
    return Response.json([{ error: null, path: 'private/a.png', signedURL: '/object/sign/post-media/private/a.png?token=fixture' }]);
  } } });
  const urls = await app.createSignedModerationUrls({ client, values: ['private/a.png', 'forbidden/a.png'], allowedPrefixes: ['private/'] });
  assert.deepEqual(urls, ['https://storage-fixture.invalid/storage/v1/object/sign/post-media/private/a.png?token=fixture']);
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].paths, ['private/a.png']);
});
test.after(() => { globalThis.fetch = originalFetch; delete globalThis.__geoProjectionGuard; });
