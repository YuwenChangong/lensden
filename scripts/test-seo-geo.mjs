import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';

async function load(file) {
  const result = await build({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
// Missing module is the initial RED: these public behaviors do not exist yet.
const seo = await load('src/lib/seo.ts');
const sitemap = await load('src/lib/seo-sitemap.ts');
const origin = 'https://lensden.ogh.workers.dev';

test('canonical drops tracking and fragments and rejects off-origin or private targets', () => {
  assert.equal(seo.canonicalPageUrl('/guides/example/?utm_source=x#part', origin), origin + '/guides/example/');
  for (const input of ['https://evil.invalid/post/', '//evil.invalid/', '/admin/', '/api/news', '/u/private/', '/users/secret', '/me', '/auth/reset-password/', '/posts/new/', '/circles/new/', '/search/?q=x', '/products/%2e%2e/admin/']) {
    assert.equal(seo.canonicalPageUrl(input, origin), undefined, input);
  }
  assert.equal(seo.shouldNoindex('/products/xreal/example/', 503), true);
  assert.equal(seo.shouldNoindex('/admin', 200), true);
  assert.equal(seo.shouldNoindex('/circles/example/manage/', 200), true);
  assert.equal(seo.shouldNoindex('/register/', 200), true);
  assert.equal(seo.shouldNoindex('/news/example/', 200), false);
  assert.equal(seo.canonicalPageUrl('/search/?q=private-query', origin, { allowSearch: true }), origin + '/search/');
  assert.equal(seo.canonicalPageUrl('/admin/', origin, { allowSearch: true }), undefined);
});

test('Product schema never promotes conflict, legacy or unsupported offers and safely serializes scripts', () => {
  const item = { key: 'display.fov', label: 'Field of view', value: '50', displayValue: '50 deg', state: 'KNOWN', provenance: 'STRUCTURED_VERIFIED', region: 'Global', variant: null, unit: 'deg', measurementContext: 'diagonal', verifiedAt: null };
  const product = { name: 'Fixture </script>', brandName: 'Fixture Brand', shortDescription: 'Visible summary' };
  const source = { id: 's1', url: 'https://example.invalid/spec' };
  const claim = { key: 'display.fov', region: 'Global', variant: null, source_id: 's1', is_conflicting: false };
  const node = seo.productSchema({ product, url: origin + '/products/xreal/example/', items: [item, { ...item, key: 'legacy', provenance: 'LEGACY_UNVERIFIED' }, { ...item, key: 'conflict', state: 'CONFLICT' }, { ...item, key: 'unknown', state: 'NOT_DISCLOSED' }], sources: [source], evidence: [claim] });
  assert.equal(node['@type'], 'Product');
  assert.equal(node.name, product.name);
  assert.deepEqual(node.additionalProperty, [{ '@type': 'PropertyValue', name: 'Field of view', value: '50 deg', description: 'diagonal · Global' }]);
  for (const key of ['offers', 'review', 'aggregateRating', 'dateModified', 'availability']) assert.equal(node[key], undefined);
  const serialized = seo.serializeJsonLd(node);
  assert.ok(!serialized.includes('</script>'));
  assert.deepEqual(JSON.parse(serialized), node);
  assert.equal(seo.productSchema({ product, url: origin, items: [item], sources: [source], evidence: [{ ...claim, is_conflicting: true }] }).additionalProperty, undefined);
  assert.equal(seo.productSchema({ product, url: origin, items: [item], sources: [source], evidence: [claim, { ...claim, is_conflicting: true }] }).additionalProperty, undefined);
});

test('Article dates and attribution use only supplied visible publication facts', () => {
  const node = seo.articleSchema({ title: 'Visible headline', description: 'Visible summary', url: origin + '/news/example/', publishedAt: '2026-10-01T00:00:00Z', updatedAt: 'bad date' });
  assert.equal(node.datePublished, '2026-10-01T00:00:00.000Z');
  assert.equal(node.dateModified, undefined);
  assert.equal(node.author, undefined);
  assert.equal(node.publisher, undefined);
  assert.equal(seo.validSeoDate(true), undefined);
  assert.equal(seo.validSeoDate('2026-02-30'), undefined);
  const breadcrumbs = seo.breadcrumbSchema([{ name: 'Products', url: origin + '/products/' }, { name: 'Example', url: origin + '/products/xreal/example/' }]);
  assert.equal(breadcrumbs.itemListElement[1].position, 2);
});

test('discussion markup requires published moderation and omits private identity and unrendered updates', () => {
  const post = { title: 'Visible question', status: 'published', moderation_status: 'published', created_at: '2026-10-01T00:00:00Z' };
  assert.equal(seo.discussionSchema({ post: { ...post, moderation_status: 'pending' }, text: 'Visible text', url: origin + '/posts/example/' }), undefined);
  const schema = seo.discussionSchema({ post, text: 'Visible text', url: origin + '/posts/example/' });
  assert.equal(schema['@type'], 'DiscussionForumPosting');
  assert.equal(schema.text, 'Visible text');
  assert.equal(schema.author, undefined);
  assert.equal(schema.dateModified, undefined);
});

test('sitemap serializes only same-origin eligible URLs and persistent valid dates', () => {
  for (const path of ['/admin/', '/login/', '/legal-consent/', '/devices/', '/forum/', '/reference/guides-docs/', '/u/example/']) assert.equal(sitemap.isStaticSitemapPage(origin + path), false, path);
  assert.equal(sitemap.isStaticSitemapPage(origin + '/products/'), true);
  const xml = sitemap.serializeSitemap([
    { loc: origin + '/guides/example/', lastmod: '2026-10-01' },
    { loc: origin + '/guides/example/' },
  ], origin);
  assert.equal((xml.match(/<url>/g) ?? []).length, 1);
  assert.ok(xml.includes('<lastmod>2026-10-01T00:00:00.000Z</lastmod>'));
  for (const loc of [origin + '/admin/', 'https://evil.invalid/', origin + '/products/?compare=one', origin + '/u/private/']) assert.throws(() => sitemap.serializeSitemap([{ loc }], origin));
  assert.ok(sitemap.escapeXml('A&B<>"').includes('A&amp;B&lt;&gt;&quot;'));
  assert.equal(sitemap.editorialSitemapPath({ id: 'guides/intro', data: {} }), '/guides/intro/');
  assert.equal(sitemap.editorialSitemapPath({ id: 'guides/intro', data: { draft: true } }), undefined);
  assert.equal(sitemap.editorialSitemapPath({ id: 'devices/example', data: {} }), undefined);
  assert.equal(sitemap.editorialSitemapPath({ id: 'about/index', data: {} }), '/about/');
  assert.equal(sitemap.canonicalNewsSitemapSlug('openglass-community-is-prioritizing-verifiable-coverage'), 'lensden-community-is-prioritizing-verifiable-coverage');
});

function fakeClient(rows, { count = rows.length, error = null, cap = 2 } = {}) {
  const calls = [];
  let requestCount = 0;
  return { calls, from(table) {
    const call = { table, filters: [], columns: '', ranges: [] }; calls.push(call);
    const query = { select(columns, options) { call.columns = columns; assert.equal(options.count, 'exact'); return query; }, eq(...filter) { call.filters.push(filter); return query; }, order() { return query; }, range(start, end) { call.ranges.push([start, end]); requestCount++; return Promise.resolve({ data: rows.slice(start, Math.min(start + cap, end + 1)), count: typeof count === 'function' ? count(requestCount) : count, error }); } };
    return query;
  } };
}
test('sitemap reader survives REST caps and refuses errors, missing counts, exhaustion or changing counts', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ slug: `device-${i}`, brand_key: 'xreal', updated_at: '2026-10-01' }));
  const client = fakeClient(rows);
  assert.equal((await sitemap.readSitemapRows(client, 'devices')).length, 5);
  assert.deepEqual(client.calls[0].filters, [['publication_status', 'published']]);
  assert.equal(client.calls[0].columns, 'slug,brand_key');
  for (const candidate of [fakeClient(rows, { error: { message: 'PRIVATE_SENTINEL' } }), fakeClient(rows, { count: null }), fakeClient(rows, { count: 6 }), fakeClient(rows, { count: 5001 })]) {
    await assert.rejects(sitemap.readSitemapRows(candidate, 'devices'), { message: 'Sitemap data unavailable.' });
  }
  await assert.rejects(sitemap.readSitemapRows(fakeClient(rows, { count: page => page === 1 ? 5 : 6 }), 'devices'), { message: 'Sitemap data unavailable.' });
  const tinyCap = fakeClient(Array.from({ length: 21 }, (_, i) => ({ slug: `row-${i}` })), { cap: 1 });
  await assert.rejects(sitemap.readSitemapRows(tinyCap, 'devices'), { message: 'Sitemap data unavailable.' });
  assert.equal(tinyCap.calls.reduce((total, call) => total + call.ranges.length, 0), 20, 'No 21st request when the bounded read budget is exhausted');
  await assert.rejects(sitemap.readSitemapRows(fakeClient([{ slug: 'duplicate' }, { slug: 'duplicate' }]), 'devices'), { message: 'Sitemap data unavailable.' });
  const news = fakeClient([]);
  await sitemap.readSitemapRows(news, 'news_articles');
  assert.deepEqual(news.calls[0].filters, [['status', 'published']]);
});
