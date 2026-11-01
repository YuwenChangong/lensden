import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('../artifacts/qa/seo-geo-phase2/', import.meta.url);
await mkdir(directory, { recursive: true });
const compiled = new URL('news-admin-reader.mjs', directory);
await build({ entryPoints: ['src/lib/news.ts'], outfile: fileURLToPath(compiled), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { getAdminNewsArticleBySlug } = await import(compiled.href);
function client(data, error = null) {
  const query = { select() { return query; }, eq() { return query; }, maybeSingle() { return Promise.resolve({ data, error }); } };
  return { from(table) { assert.equal(table, 'news_articles'); return query; } };
}
test('missing administrative news row returns null instead of dereferencing null', async () => {
  assert.equal(await getAdminNewsArticleBySlug(client(null), 'missing'), null);
});
test('administrative news reader retains authorized drafts and propagates query failure', async () => {
  const result = await getAdminNewsArticleBySlug(client({ id: 'local-news', slug: 'local-news', title: 'Local fixture', status: 'draft', created_at: '2026-10-01T00:00:00Z' }), 'local-news');
  assert.equal(result.status, 'draft');
  assert.equal(result.slug, 'local-news');
  await assert.rejects(getAdminNewsArticleBySlug(client(null, { message: 'LOCAL_QUERY_FAILURE' }), 'missing'), /LOCAL_QUERY_FAILURE/);
});
