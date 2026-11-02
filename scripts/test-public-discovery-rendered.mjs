import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unstable_startWorker } from 'wrangler';
import { chromium } from 'playwright';
import { parse } from 'parse5';
import { discoveryCoverage } from './discovery-coverage.mjs';
const output = path.resolve('artifacts/qa/public-discovery-v1'); await mkdir(output, { recursive: true });
const built = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'));
const configPath = path.join(output, 'worker-local.json'), backend = 'http://127.0.0.1:47831';
assert.ok(built.vars?.SUPABASE_URL === backend, 'This test requires the reviewed loopback-only build, never a production artifact.');
await writeFile(configPath, JSON.stringify({ name: 'lensden-discovery-coverage-local', main: path.resolve('dist/server', built.main),
  send_metrics: false, compatibility_date: built.compatibility_date, compatibility_flags: built.compatibility_flags, rules: built.rules,
  vars: { SUPABASE_URL: backend, SUPABASE_ANON_KEY: 'local-fixture', AUTH_CAPTCHA_MODE: 'off' },
  assets: { binding: 'ASSETS', directory: path.resolve('dist/client') },
  kv_namespaces: [{ binding: 'SESSION', id: '00000000000000000000000000000000' }] }));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const circle = { id: id(90), slug: 'public-circle', name: 'Public circle', status: 'active', description: 'A real public topic' };
const profile = { id: id(80), display_name: 'Public author', username: 'member', avatar_url: null, role: 'user' };
const main = { id: id(1), author_id: id(80), circle_id: circle.id, title: 'A useful zero-interaction discussion',
  body: 'Full public main body </script><script>globalThis.xss=true</script>', type: 'discussion', status: 'published', moderation_status: 'published',
  created_at: '2026-11-01T01:00:00Z', updated_at: '2026-11-02T01:00:00Z', profiles: profile, circles: circle, post_media: [], view_count: 0 };
const posts = [main, { ...main, id: id(2), title: 'Test camera compatibility is a legitimate discussion', created_at: '2015-01-01T00:00:00Z' },
  ...['draft', 'private', 'hidden', 'deleted'].map((status, n) => ({ ...main, id: id(n + 3), status, body: 'PRIVATE_POST_SENTINEL' })),
  { ...main, id: id(7), moderation_status: 'rejected', body: 'PRIVATE_POST_SENTINEL' },
  { ...main, id: 'fba0a005-1008-4fe5-8899-52c23efd2bfb', body: 'CLASSIFIED_FIXTURE_SENTINEL' },
  { ...main, id: id(8), circles: { ...circle, id: '06b4eb20-07fa-417e-b62b-e87eb0087381', slug: 'renamed-fixture' } },
  { ...main, id: id(9), circles: { ...circle, status: 'hidden' } }];
const comments = Array.from({ length: 52 }, (_, n) => ({ id: id(100 + n), post_id: main.id, author_id: profile.id,
  parent_id: n === 1 ? id(100) : n === 2 ? id(9999) : null, body: `Public reply ${n + 1} 中文 </script><img src=x onerror=alert(1)>`,
  status: 'published', moderation_status: 'published', created_at: new Date(Date.UTC(2026, 10, 2, 1, 0, n)).toISOString(), updated_at: '2026-11-02T02:00:00Z',
  author: { display_name: profile.display_name, username: profile.username } }));
comments.push(...['hidden', 'deleted', 'pending'].map((status, n) => ({ ...comments[0], id: id(200 + n), status,
  moderation_status: status === 'pending' ? 'pending_review' : 'published', body: status === 'pending' ? 'OWNER_PENDING_ONLY' : 'PRIVATE_COMMENT_SENTINEL' })),
  { ...comments[0], id: id(210), moderation_status: 'rejected', body: 'PRIVATE_COMMENT_SENTINEL' });
const device = JSON.parse(await readFile('scripts/fixtures/product-detail-public-row.json', 'utf8'));
const article = { id: id(40), slug: 'discovery-news', title: 'Public news fixture', summary: 'A visible summary', content: 'Public news body', category: 'industry',
  status: 'published', source_name: null, source_url: null, author_id: null, cover_image_url: null, pinned: false, featured: false, view_count: 0,
  published_at: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-02T00:00:00Z' };
let mode = 'normal', externalAttempts = 0, interceptedReads = 0, interceptedExistingViewRpcs = 0, interceptedReadonlyRpcs = 0, browser;
const requests = [], checks = [];
const worker = await unstable_startWorker({ config: configPath, envFiles: [], build: { bundle: false },
  dev: { remote: false, watch: false, liveReload: false, persist: false, inspector: false, registry: undefined,
    server: { hostname: '127.0.0.1', port: 0 }, outboundService(request) {
      const url = new URL(request.url);
      if (url.origin !== backend) { externalAttempts++; return new Response('Forbidden', { status: 502 }); }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        if (url.pathname.endsWith('/deleted_comment_placeholders')) { interceptedReadonlyRpcs++; return Response.json([]); }
        assert.ok(['/rest/v1/rpc/increment_post_view_count', '/rest/v1/rpc/increment_news_article_view'].includes(url.pathname));
        interceptedExistingViewRpcs++; return Response.json(null);
      }
      assert.equal(request.method, 'GET'); interceptedReads++;
      if (url.pathname === '/auth/v1/user') return Response.json({ id: profile.id, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
      const table = url.pathname.split('/').pop();
      const start = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 1000);
      let rows = table === 'posts' ? posts : table === 'comments' ? comments : table === 'circles' ? [circle]
        : table === 'profiles' ? [profile] : table === 'devices' ? [device] : table === 'news_articles' ? [article] : [];
      if (table === 'comments') rows = rows.filter(row => row.status === 'published' && row.moderation_status === 'published'
        || request.headers.get('authorization') === 'Bearer synthetic-local-viewer' && row.status === 'pending' && row.author_id === profile.id);
      if (table === 'comments' && mode === 'comments-outage') return Response.json({ message: 'PRIVATE_BACKEND_SENTINEL' }, { status: 520 });
      const forumMap = table === 'posts' && url.searchParams.get('order') === 'id.asc';
      if (forumMap && mode === 'capacity') rows = Array.from({ length: 5000 }, (_, n) => ({ ...main, id: id(10000 + n) }));
      if (forumMap && mode === 'overflow') return Response.json([main], { headers: { 'content-range': '0-0/5001' } });
      if (forumMap && mode === 'outage') return Response.json({ message: 'PRIVATE_BACKEND_SENTINEL' }, { status: 520 });
      if (table === 'posts' && mode === 'filtered-feed' && !forumMap && !url.searchParams.has('id')) {
        rows = [...Array.from({ length: 20 }, (_, n) => ({ ...main, id: id(300 + n), circles: { ...circle, slug: 'rls-test' } })), { ...main, id: id(350) }];
      }
      for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) {
        const field = row => key === 'circles.status' ? row.circles?.status : row[key];
        rows = rows.filter(row => String(field(row)) === value.slice(3));
      }
      const count = rows.length; rows = rows.slice(start, start + limit);
      const object = request.headers.get('accept')?.includes('vnd.pgrst.object');
      return Response.json(object ? rows[0] ?? null : rows, { headers: { 'content-range': rows.length ? `${start}-${start + rows.length - 1}/${count}` : `*/${count}` } });
    } } });
function nodes(html, tag) {
  const result = []; const visit = node => { if (node.tagName === tag) result.push(node); for (const child of node.childNodes ?? []) visit(child); }; visit(parse(html)); return result;
}
const attr = (node, name) => node.attrs?.find(value => value.name === name)?.value;
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
function schemas(html) { return nodes(html, 'script').filter(node => attr(node, 'type') === 'application/ld+json').flatMap(node => { const value = JSON.parse(text(node)); return value['@graph'] ?? [value]; }); }
const locs = xml => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
try {
  const origin = (await worker.url).origin;
  const request = async (route, headers = {}) => {
    const response = await fetch(origin + route, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'accept-language': 'en', ...headers } });
    const html = await response.text(); requests.push({ route, status: response.status }); return { response, html };
  };
  const forum = await request('/sitemap-forum.xml'); assert.equal(forum.response.status, 200);
  assert.deepEqual(new Set(locs(forum.html)), new Set([1, 2].map(n => `https://127.0.0.1/posts/${id(n)}/`)));
  assert.equal(forum.response.headers.get('set-cookie'), null); assert.equal(forum.response.headers.get('cache-control'), 'public, max-age=300');
  await writeFile(path.join(output, 'forum-sitemap.xml'), forum.html);
  checks.push('new and old zero-interaction public posts advertised; state/fixture exclusions; canonical unique URLs');
  const first = await request(`/posts/${main.id}/`); assert.equal(first.response.status, 200);
  const discussion = schemas(first.html).find(node => node['@type'] === 'DiscussionForumPosting');
  assert.equal(discussion.text, main.body); assert.equal(discussion.author.name, profile.display_name); assert.equal(discussion.comment.length, 50);
  assert.equal(discussion.comment[1].inReplyTo['@id'], discussion.comment[0]['@id']);
  assert.ok(first.html.includes('data-public-comments')); assert.ok(nodes(first.html, 'a').some(node => attr(node, 'href') === `/posts/${main.id}/?comments_page=2#comments`));
  for (const sentinel of ['PRIVATE_COMMENT_SENTINEL', 'PRIVATE_POST_SENTINEL', id(9999), 'PRIVATE_BACKEND_SENTINEL']) assert.ok(!first.html.includes(sentinel), sentinel);
  assert.ok(!nodes(first.html, 'script').some(node => text(node) === 'globalThis.xss=true'));
  assert.ok(nodes(first.html, 'script').filter(node => attr(node, 'type') === 'application/ld+json').every(node => !text(node).includes('</script>')));
  await writeFile(path.join(output, 'post-first.html'), first.html);
  checks.push('initial anonymous HTML contains full escaped main body and 50 public comments; supported factual discussion schema');
  const second = await request(`/posts/${main.id}/?comments_page=2&lang=zh-CN`);
  const secondSchema = schemas(second.html).find(node => node['@type'] === 'DiscussionForumPosting'); assert.equal(secondSchema.comment.length, 2);
  assert.equal(secondSchema.comment[0].text, comments[50].body);
  assert.equal(nodes(second.html, 'link').find(node => attr(node, 'rel') === 'canonical').attrs.find(value => value.name === 'href').value, `https://127.0.0.1/posts/${main.id}/`);
  assert.ok(secondSchema.comment[0].url.includes('?comments_page=2#comment-'));
  checks.push('comment continuation and locale variants retain first-page post canonical and public comment permalinks');
  const apiPage = await request(`/api/forum/comments?post_id=${main.id}&public_page=1`);
  assert.equal(apiPage.response.status, 200);
  const apiComments = JSON.parse(apiPage.html).comments;
  assert.equal(apiComments.length, 50); assert.ok(apiComments.every(comment => comment.reply_count === null));
  assert.ok(!apiPage.html.includes(id(9999))); assert.ok(!apiPage.html.includes('PRIVATE_COMMENT_SENTINEL'));
  checks.push('anonymous paged hydration API preserves public scope, hides unknown parents and omits unverified total reply counts');
  const ownerPage = await request(`/api/forum/comments?post_id=${main.id}&public_page=2`, { authorization: 'Bearer synthetic-local-viewer' });
  assert.equal(ownerPage.response.status, 200); assert.ok(ownerPage.html.includes('OWNER_PENDING_ONLY'));
  assert.ok(!first.html.includes('OWNER_PENDING_ONLY')); assert.ok(!apiPage.html.includes('OWNER_PENDING_ONLY'));
  checks.push('existing authenticated owner-pending projection retained while anonymous HTML and API exclude it');
  for (const excluded of [3, 5, 7, 8, 9, 'fba0a005-1008-4fe5-8899-52c23efd2bfb']) {
    const removed = await request(`/posts/${typeof excluded === 'number' ? id(excluded) : excluded}/`);
    assert.equal(removed.response.status, 404); assert.match(removed.response.headers.get('x-robots-tag'), /noindex/);
    assert.equal(schemas(removed.html).some(node => node['@type'] === 'DiscussionForumPosting'), false);
  }
  checks.push('hidden/deleted/violating/known-fixture/nonpublic-circle details are 404/noindex, without discussion markup');
  const index = await request('/sitemap-index.xml'); assert.equal(index.response.status, 200); assert.ok(index.html.includes('/sitemap-forum.xml'));
  const base = await request('/sitemap.xml'); assert.equal(base.response.status, 200);
  for (const part of [`/products/${device.brand_key}/${device.slug}/`, '/news/discovery-news/', '/circles/public-circle/', '/guides/usb-c-display-glasses-compatibility/']) assert.ok(base.html.includes(part), part);
  for (const route of ['/guides/usb-c-display-glasses-compatibility/', '/news/discovery-news/', `/products/${device.brand_key}/${device.slug}/`, '/circles/public-circle/']) {
    const page = await request(route); assert.equal(page.response.status, 200, route);
    assert.equal(nodes(page.html, 'link').filter(node => attr(node, 'rel') === 'canonical').length, 1);
    if (route.startsWith('/guides/') || route.startsWith('/news/')) assert.equal(schemas(page.html).find(node => node['@type'] === 'Article')['@type'], 'Article');
    if (route.startsWith('/products/')) assert.equal(schemas(page.html).find(node => node['@type'] === 'Product')['@type'], 'Product');
    assert.equal(schemas(page.html).some(node => node['@type'] === 'QAPage'), false);
  }
  checks.push('news/guide/device/circle routes and sitemap inventory preserved; no indiscriminate forum or QA markup');
  mode = 'capacity'; const before = interceptedReads;
  const maximum = await request('/sitemap-forum.xml'); assert.equal(maximum.response.status, 200); assert.equal(locs(maximum.html).length, 5000);
  assert.equal(interceptedReads - before, 10); mode = 'overflow';
  const over = await request('/sitemap-forum.xml'); assert.equal(over.response.status, 503); assert.equal(over.response.headers.get('cache-control'), 'no-store'); assert.ok(!over.html.includes('<urlset'));
  mode = 'outage'; const beforeError = interceptedReads;
  const failed = await request('/sitemap-forum.xml'); assert.equal(failed.response.status, 503); assert.equal(interceptedReads - beforeError, 1); assert.ok(!failed.html.includes('PRIVATE_BACKEND_SENTINEL'));
  mode = 'comments-outage'; const commentFailure = await request(`/posts/${main.id}/`); assert.equal(commentFailure.response.status, 200);
  const apiFailure = await request(`/api/forum/comments?post_id=${main.id}&public_page=1`);
  assert.equal(apiFailure.response.status, 503); assert.ok(!apiFailure.html.includes('PRIVATE_BACKEND_SENTINEL'));
  assert.ok(!commentFailure.html.includes('PRIVATE_BACKEND_SENTINEL')); assert.ok(schemas(commentFailure.html).find(node => node['@type'] === 'DiscussionForumPosting').text === main.body);
  assert.equal(schemas(commentFailure.html).find(node => node['@type'] === 'DiscussionForumPosting').comment, undefined);
  checks.push('5000-post maximum uses 10 physical reads; overflow/outage fail closed; comment failures preserve main public body without fake comments');
  mode = 'filtered-feed';
  const feed = await request('/feed/?sort=latest'); assert.ok(nodes(feed.html, 'a').some(node => attr(node, 'href') === '/feed/?sort=latest&page=2'));
  const later = await request('/feed/?sort=latest&page=2'); assert.ok(nodes(later.html, 'a').some(node => attr(node, 'href') === `/posts/${id(350)}/`));
  checks.push('inherited 4e636573 filtered feed continuation preserved'); mode = 'normal';
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); await page.goto(origin + `/posts/${main.id}/`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-public-comments] .comment-body').count(), 50);
    assert.equal(await page.locator('[data-public-comments] .comment-body').first().innerText(), comments[0].body);
    assert.equal(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) > innerWidth), false);
    await page.screenshot({ path: path.join(output, `post-${width}.png`), fullPage: true }); await context.close();
  }
  checks.push('JS-disabled 390/430px public comment body and no horizontal overflow');
  const context = await browser.newContext();
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const browserErrors = []; page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.goto(origin + `/posts/${main.id}/?comments_page=2`, { waitUntil: 'networkidle' });
  await page.locator('#comments').scrollIntoViewIfNeeded();
  try { await page.waitForFunction(() => !document.querySelector('[data-public-comments]'), null, { timeout: 6000 }); }
  catch (error) {
    await writeFile(path.join(output, 'hydration-debug.json'), JSON.stringify({ browserErrors,
      islands: await page.locator('astro-island').evaluateAll(nodes => nodes.map(node => ({ component: node.getAttribute('component-url'), ssr: node.hasAttribute('ssr'), html: node.innerHTML.slice(0, 90) }))) }, null, 2));
    throw error;
  }
  assert.equal(await page.locator('#comments .comment-body').count(), 2);
  assert.equal(await page.locator('#comments .comment-body').first().innerText(), comments[50].body);
  assert.equal(await page.evaluate(() => globalThis.xss), undefined); await context.close();
  checks.push('existing interactive island hydrates the same comment page without duplicating SSR comments or executing user HTML');
  assert.equal(externalAttempts, 0);
  const inventory = { asOf: '2026-11-02T00:00:00Z', complete: true, records: [1, 2].map(n => ({ type: 'posts', eligible: true, url: `https://127.0.0.1/posts/${id(n)}/` })) };
  const coverage = discoveryCoverage({ origin: 'https://127.0.0.1', inventory, sitemaps: [forum.html] }); assert.equal(coverage.missing.length, 0);
  const receipt = { status: 'PASS', evidenceClass: 'COMPILED_LOCAL_WORKER_SYNTHETIC_REST_ONLY', checks, requests,
    syntheticPostCoverage: coverage, externalAttempts, interceptedReads, interceptedExistingViewRpcs, interceptedReadonlyRpcs,
    productionRequests: 0, productionWrites: 0, r2Operations: 0, deployments: 0, remotePush: 0 };
  await writeFile(path.join(output, 'rendered-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, requests: requests.length }));
} finally { await browser?.close(); await worker.dispose(); }
