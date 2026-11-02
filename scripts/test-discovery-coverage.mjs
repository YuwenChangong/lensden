import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoveryCoverage } from './discovery-coverage.mjs';
const origin = 'https://lensden.net';
const post = origin + '/posts/00000000-0000-4000-8000-000000000001/';
const inventory = { asOf: '2026-11-02', complete: false, records: [
  { type: 'posts', eligible: true, url: post },
  { type: 'guides', eligible: true, url: origin + '/guides/example/' },
  { type: 'comments', eligible: true, url: post + '#comment-00000000-0000-4000-8000-000000000002' },
] };
test('offline coverage reports real supplied gaps without interpreting sitemap counts as indexing', () => {
  const report = discoveryCoverage({ origin, inventory, sitemaps: [`<urlset><url><loc>${post}</loc></url></urlset>`] });
  assert.equal(report.eligiblePageUrlsObserved, 2); assert.equal(report.advertisedUniqueUrlsObserved, 1);
  assert.deepEqual(report.missing, [origin + '/guides/example/']);
  assert.equal(report.comments.parentAdvertisedObserved, 1); assert.equal(report.indexedPages, 'NOT_VERIFIED');
  assert.equal(report.aiCitations, 'NOT_VERIFIED'); assert.equal(report.inventoryComplete, false);
});
test('offline imports reject entity payloads, off-origin or noncanonical URLs and malformed inventories', () => {
  for (const xml of ['<!DOCTYPE x><urlset></urlset>', '<sitemapindex></sitemapindex>', '<urlset><loc>https://evil.invalid/</loc></urlset>', `<urlset><loc>${post}?track=1</loc></urlset>`]) {
    assert.throws(() => discoveryCoverage({ origin, inventory, sitemaps: [xml] }));
  }
  assert.throws(() => discoveryCoverage({ origin, inventory: { ...inventory, records: [{ type: 'posts', url: post, eligible: false }] }, sitemaps: ['<urlset></urlset>'] }));
});
