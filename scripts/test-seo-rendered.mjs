import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unstable_startWorker } from 'wrangler';
import { chromium } from 'playwright';
import { parse } from 'parse5';

// Run after the loopback-only build documented in docs/geo/README.md.
// All Worker outbound requests are intercepted; browser requests are restricted
// to the owned server. Database/RLS/production behavior is not simulated proof.
const root = process.cwd();
const output = path.join(root, 'artifacts/qa/seo-geo');
await mkdir(output, { recursive: true });
const built = JSON.parse(await readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8'));
const localVars = { SUPABASE_URL: 'http://127.0.0.1:47831', SUPABASE_ANON_KEY: 'local-geo-anon', AUTH_CAPTCHA_MODE: 'off' };
const config = { name: 'lensden-geo-local-test', main: path.join(root, 'dist/server', built.main),
  send_metrics: false,
  compatibility_date: built.compatibility_date, compatibility_flags: built.compatibility_flags,
  rules: built.rules, vars: localVars, assets: { binding: 'ASSETS', directory: path.join(root, 'dist/client') },
  kv_namespaces: [{ binding: 'SESSION', id: '00000000000000000000000000000000' }],
};
const configPath = path.join(output, 'worker-local.json');
await writeFile(configPath, JSON.stringify(config));
const fixture = { ...JSON.parse(await readFile('scripts/fixtures/product-detail-public-row.json', 'utf8')),
  name: 'Local GEO fixture', short_description: 'A local test summary.', catalog_normalized: true, key_limitations: ['Local limitation fixture.'] };
const spec = { id: 'spec-1', device_slug: fixture.slug, key: 'display.fov_deg', group_key: 'display', label: 'Field of view', value_type: 'number', admin_order: 1,
  state: 'KNOWN', value_number: 50, value_boolean: null, value_text: null, value_json: null, canonical_unit: 'deg', measurement_context: 'diagonal',
  region: 'Global', variant: null, confidence: 'HIGH', verified_at: '2026-10-01', presentation: { keySpec: true } };
const source = { id: 'source-1', publisher: 'Local source fixture', title: 'Local evidence fixture', url: 'https://example.invalid/spec', source_type: 'official_spec_sheet', published_at: null, accessed_at: '2026-10-01', region: 'Global' };
const evidence = { spec_id: 'spec-1', key: spec.key, region: spec.region, variant: null, source_id: source.id, claimed_value: '50', is_primary: true, is_conflicting: false };
const article = { id: 'fixture-news', slug: 'geo-fixture-news', title: 'Local GEO news fixture', summary: 'Visible local news summary.', content: 'Visible local news body.', category: 'industry', status: 'published', source_name: null, source_url: null, author_id: null, cover_image_url: null, pinned: false, featured: false, view_count: 0, published_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' };
const post = { id: '00000000-0000-4000-8000-000000000001', author_id: '00000000-0000-4000-8000-000000000002', title: 'Local discussion fixture', body: 'Visible discussion </script> body.', type: 'discussion', status: 'published', moderation_status: 'published', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', profiles: { display_name: 'Visible public member', username: null, avatar_url: null }, circles: { slug: 'public-circle', name: 'Public circle', status: 'active' } };
let externalAttempts = 0, interceptedReads = 0, interceptedViewRpcs = 0, outage = false, browser, sitemapCase = 'normal';
const checks = [];
const capacityEvidence = {};
const worker = await unstable_startWorker({ config: configPath, envFiles: [], build: { bundle: false },
  dev: { remote: false, watch: false, liveReload: false, persist: false, inspector: false, registry: undefined,
    server: { hostname: '127.0.0.1', port: 0 },
    outboundService(request) {
      const url = new URL(request.url);
      if (url.origin !== localVars.SUPABASE_URL) { externalAttempts++; return new Response('External requests forbidden', { status: 502 }); }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        assert.equal(request.method, 'POST');
        assert.ok(['/rest/v1/rpc/increment_news_article_view', '/rest/v1/rpc/increment_post_view_count'].includes(url.pathname));
        interceptedViewRpcs++; return Response.json(null);
      }
      assert.equal(request.method, 'GET');
      interceptedReads++;
      if (outage) return Response.json({ message: 'PRIVATE_BACKEND_SENTINEL' }, { status: 500 });
      if (sitemapCase === 'transient') return Response.json({ message: 'PRIVATE_BACKEND_SENTINEL' }, { status: 520 });
      if (sitemapCase === 'redirect') return new Response(null, { status: 302, headers: { location: url.origin + '/rest/v1/devices' } });
      if (sitemapCase === 'budget') {
        const start = Number(url.searchParams.get('offset') ?? 0);
        return Response.json([{ slug: `row-${start}`, brand_key: 'xreal', status: 'active', name: 'Local budget fixture' }], { headers: { 'content-range': `${start}-${start}/20` } });
      }
      if (sitemapCase === 'capacity') {
        assert.ok(['/rest/v1/devices', '/rest/v1/circles', '/rest/v1/news_articles'].includes(url.pathname));
        const start = Number(url.searchParams.get('offset') ?? 0);
        const count = Number(url.searchParams.get('limit'));
        assert.equal(count, 500);
        const rows = Array.from({ length: Math.min(count, 5000 - start) }, (_, i) => ({
          slug: `capacity-${String(start + i).padStart(5, '0')}`, brand_key: 'xreal', status: 'active', name: 'Capacity fixture',
        }));
        return Response.json(rows, { headers: { 'content-range': `${start}-${start + rows.length - 1}/5000` } });
      }
      const table = url.pathname.split('/').pop();
      let rows = table === 'devices' ? [fixture] : table === 'public_device_detail_specs' ? [spec]
        : table === 'public_device_detail_sources' ? [source] : table === 'public_device_detail_evidence' ? [evidence]
        : table === 'news_articles' ? [article] : table === 'posts' ? [post] : [];
      if (url.searchParams.has('slug')) rows = rows.filter(row => 'eq.' + row.slug === url.searchParams.get('slug'));
      if (url.searchParams.get('slug')?.startsWith('neq.')) rows = [];
      if (url.searchParams.has('id')) rows = rows.filter(row => 'eq.' + row.id === url.searchParams.get('id'));
      const object = request.headers.get('accept')?.includes('vnd.pgrst.object');
      return Response.json(object ? rows[0] ?? null : rows, { headers: { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' } });
    },
  },
});

function nodes(html, tag) {
  const found = [];
  const visit = node => { if (node.tagName === tag) found.push(node); for (const child of node.childNodes ?? []) visit(child); };
  visit(parse(html)); return found;
}
const attr = (node, key) => node.attrs.find(item => item.name === key)?.value;
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
function schemas(html) {
  return nodes(html, 'script').filter(node => attr(node, 'type') === 'application/ld+json').flatMap(node => {
    const data = JSON.parse(text(node)); assert.equal(data['@context'], 'https://schema.org'); return data['@graph'] ?? [data];
  });
}
try {
  const origin = (await worker.url).origin;
  assert.ok(origin.startsWith('http://127.0.0.1:'));
  const request = async route => { const response = await fetch(origin + route, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'accept-language': 'en' } }); return { response, html: await response.text() }; };
  const search = await request('/search/?q=private-query');
  assert.equal(search.response.status, 200);
  assert.equal(nodes(search.html, 'link').find(n => attr(n, 'rel') === 'canonical').attrs.find(a => a.name === 'href').value, 'https://127.0.0.1/search/');
  assert.match(search.response.headers.get('x-robots-tag'), /noindex/);
  checks.push('search-noindex-and-preserved-base-canonical');
  const product = await request('/products/xreal/xreal-one/?utm_source=test');
  assert.equal(product.response.status, 200);
  assert.equal(nodes(product.html, 'title').length, 1);
  assert.equal(nodes(product.html, 'meta').filter(n => attr(n, 'name') === 'description').length, 1);
  assert.equal(nodes(product.html, 'link').find(n => attr(n, 'rel') === 'canonical').attrs.find(a => a.name === 'href').value, 'https://127.0.0.1/products/xreal/xreal-one/');
  assert.ok(product.html.includes('Local GEO fixture') && product.html.includes('A local test summary.') && product.html.includes('Local evidence fixture') && product.html.includes('diagonal'));
  assert.ok(nodes(product.html, 'a').some(n => attr(n, 'href') === '/products/xreal/'));
  const productSchema = schemas(product.html).find(node => node['@type'] === 'Product');
  assert.equal(productSchema.additionalProperty.length, 1);
  assert.equal(productSchema.name, 'Local GEO fixture');
  assert.equal(productSchema.offers, undefined);
  assert.equal(productSchema.aggregateRating, undefined);
  await writeFile(path.join(output, 'product.html'), product.html);
  checks.push('product-initial-html-and-single-metadata-and-evidence-schema');

  const news = await request('/news/geo-fixture-news/');
  assert.equal(news.response.status, 200);
  assert.ok(news.html.includes('Visible local news body.'));
  assert.equal(schemas(news.html).filter(node => node['@type'] === 'Article').length, 1);
  assert.equal(schemas(news.html).find(node => node['@type'] === 'Article').datePublished, '2026-10-01T00:00:00.000Z');
  checks.push('news-html-article-date');
  article.published_at = null;
  const undatedNews = await request('/news/geo-fixture-news/');
  assert.equal(schemas(undatedNews.html).find(node => node['@type'] === 'Article').datePublished, undefined);
  assert.ok(!nodes(undatedNews.html, 'meta').some(node => attr(node, 'property') === 'article:published_time'));
  assert.ok(!undatedNews.html.includes('October 1, 2026'));
  article.published_at = '2026-10-01T00:00:00Z';
  checks.push('unknown-publication-date-never-becomes-draft-creation-date');
  const discussion = await request(`/posts/${post.id}/`);
  assert.equal(discussion.response.status, 200);
  assert.equal(schemas(discussion.html).filter(node => node['@type'] === 'DiscussionForumPosting').length, 1);
  assert.equal(schemas(discussion.html).filter(node => node['@type'] === 'Article').length, 0);
  assert.equal(schemas(discussion.html).find(node => node['@type'] === 'DiscussionForumPosting').text, post.body);
  assert.ok(nodes(discussion.html, 'script').filter(node => attr(node, 'type') === 'application/ld+json').every(node => !text(node).includes('</script>')));
  checks.push('discussion-script-escaping-no-duplicate-article');

  const guide = await request('/guides/ar-ai-xr-glasses-difference/');
  assert.equal(guide.response.status, 200);
  assert.ok(nodes(guide.html, 'h2').length > 1);
  assert.equal(schemas(guide.html).filter(node => node['@type'] === 'Article').length, 1);
  const missing = await request('/guides/geo-no-such-guide/');
  assert.equal(missing.response.status, 404);
  assert.match(missing.response.headers.get('x-robots-tag'), /noindex/);
  assert.equal(nodes(missing.html, 'link').filter(n => attr(n, 'rel') === 'canonical').length, 0);
  checks.push('guide-render-and-real-404');
  const about = await request('/about/');
  assert.equal(about.response.status, 200);
  assert.equal(schemas(about.html).filter(node => node['@type'] === 'WebSite').length, 1);
  assert.ok(nodes(about.html, 'meta').some(node => attr(node, 'name') === 'twitter:title'));
  checks.push('starlight-document-metadata-and-site-identity');

  const map = await request('/sitemap.xml');
  assert.equal(map.response.status, 200);
  assert.match(map.response.headers.get('content-type'), /application\/xml/);
  assert.ok(map.html.includes('/guides/ar-ai-xr-glasses-difference/') && map.html.includes('/products/xreal/xreal-one/') && map.html.includes('/news/geo-fixture-news/'));
  assert.doesNotMatch(map.html, /\/admin\/|\/login\/|\/legal-consent\/|\/posts\/|\/devices\/|geo-no-such-guide/);
  await writeFile(path.join(output, 'sitemap.xml'), map.html);
  const savedArticle = { ...article };
  article.slug = 'openglass-community-is-prioritizing-verifiable-coverage';
  article.id = 'c2e7796f-c4ec-40d9-ae14-16b4e888120b';
  const bridgeMap = await request('/sitemap.xml');
  assert.ok(bridgeMap.html.includes('/news/lensden-community-is-prioritizing-verifiable-coverage/'));
  assert.ok(!bridgeMap.html.includes('/news/openglass-community-is-prioritizing-verifiable-coverage/'));
  const bridgeArticle = await request('/news/lensden-community-is-prioritizing-verifiable-coverage/');
  assert.equal(bridgeArticle.response.status, 200);
  Object.assign(article, savedArticle);
  checks.push('legacy-news-record-canonical-sitemap-bridge');
  outage = true;
  const failed = await request('/sitemap.xml');
  assert.equal(failed.response.status, 503);
  assert.equal(failed.response.headers.get('cache-control'), 'no-store');
  assert.ok(!failed.html.includes('PRIVATE_BACKEND_SENTINEL'));
  outage = false;
  for (const mode of ['budget', 'transient', 'redirect']) {
    sitemapCase = mode;
    const before = interceptedReads;
    const boundedFailure = await request('/sitemap.xml');
    assert.equal(boundedFailure.response.status, 503);
    assert.equal(boundedFailure.response.headers.get('cache-control'), 'no-store');
    assert.ok(!boundedFailure.html.includes('PRIVATE_BACKEND_SENTINEL'));
    const physical = interceptedReads - before;
    if (mode === 'budget') assert.equal(physical, 40);
    else assert.ok(physical >= 1 && physical <= 3, `${mode} must not amplify the three initial requests`);
  }
  sitemapCase = 'normal';
  checks.push('aggregate-fetch-budget-and-no-sdk-retry-or-redirect-amplification');
  // Exercise the bounded row envelope and concurrency in the actual Worker.
  // Wall time is end-to-end on this host, never a Worker CPU-time measurement.
  sitemapCase = 'capacity';
  let beforeCapacity = interceptedReads;
  const started = performance.now();
  const largeMap = await request('/sitemap.xml');
  assert.equal(largeMap.response.status, 200);
  assert.equal(interceptedReads - beforeCapacity, 30);
  assert.equal(largeMap.response.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(largeMap.response.headers.get('set-cookie'), null);
  const largeLocs = [...largeMap.html.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.equal(largeLocs.length, 15000 + (map.html.match(/<url>/g)?.length ?? 0) - 2);
  assert.equal(new Set(largeLocs).size, largeLocs.length);
  for (const part of ['/products/xreal/capacity-', '/circles/capacity-', '/news/capacity-']) assert.equal(largeLocs.filter(loc => loc.includes(part)).length, 5000);
  capacityEvidence.maximum = { records: 15000, physicalReads: 30, urls: largeLocs.length, xmlBytes: Buffer.byteLength(largeMap.html), hostWallMs: Math.round(performance.now() - started) };
  const concurrentStarted = performance.now();
  beforeCapacity = interceptedReads;
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => request('/sitemap.xml')));
  assert.ok(concurrent.every(result => result.response.status === 200 && result.html === largeMap.html));
  assert.equal(interceptedReads - beforeCapacity, 120);
  capacityEvidence.concurrentMaximum = { invocations: 4, physicalReads: 120, hostWallMs: Math.round(performance.now() - concurrentStarted) };
  sitemapCase = 'budget'; beforeCapacity = interceptedReads;
  const exhausted = await Promise.all(Array.from({ length: 3 }, () => request('/sitemap.xml')));
  assert.ok(exhausted.every(result => result.response.status === 503 && result.response.headers.get('cache-control') === 'no-store' && !result.html.includes('<urlset')));
  const exhaustedReads = interceptedReads - beforeCapacity;
  assert.ok(exhaustedReads >= 3 && exhaustedReads <= 120, 'failure cancellation can stop before the shared per-invocation ceiling');
  capacityEvidence.concurrentExhaustion = { invocations: 3, physicalReads: exhaustedReads, maximumPhysicalReads: 120, status: 503, partialSuccesses: 0 };
  sitemapCase = 'normal';
  checks.push('maximum-15000-record-sitemap-and-concurrent-success-and-exhaustion');
  const robots = await request('/robots.txt');
  assert.equal(robots.response.status, 200);
  for (const agent of ['Googlebot', 'Bingbot', 'OAI-SearchBot']) assert.ok(robots.html.includes('User-agent: ' + agent));
  assert.ok(robots.html.includes('Disallow: /admin/') && robots.html.includes('https://127.0.0.1/sitemap.xml'));
  checks.push('dynamic-sitemap-discovery-and-safe-unavailable-and-robots');

  browser = await chromium.launch({ headless: true });
  for (const width of [390, 430, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(origin + '/products/xreal/xreal-one/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('h1').innerText(), 'Local GEO fixture');
    assert.ok(await page.locator('[data-product-sources]').isVisible());
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
    assert.ok(overflow.body <= width && overflow.document <= width, JSON.stringify(overflow));
    await page.screenshot({ path: path.join(output, `product-${width}.png`), fullPage: true });
    await context.close();
  }
  checks.push('no-javascript-content-and-layout-390-430-1280');
  assert.equal(externalAttempts, 0);
  const receipt = { status: 'PASS', checks, capacityEvidence, externalAttempts, productionRequests: 0, databaseWrites: 0, interceptedReads, interceptedViewRpcs, evidenceClass: 'COMPILED_WORKER_WITH_SYNTHETIC_PUBLIC_REST_RESPONSES' };
  await writeFile(path.join(output, 'rendered-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally {
  await browser?.close();
  await worker.dispose();
}
