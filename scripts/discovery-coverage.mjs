import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Offline snapshots only. No SDK, credentials, HTTP, telemetry or database writes.
export function discoveryCoverage({ origin, inventory, sitemaps }) {
  const site = new URL(origin);
  if (site.origin !== origin || site.protocol !== 'https:' || site.username || site.password) throw new Error('Invalid origin');
  if (!inventory || typeof inventory.complete !== 'boolean' || typeof inventory.asOf !== 'string'
    || !Number.isFinite(Date.parse(inventory.asOf)) || !Array.isArray(inventory.records) || inventory.records.length > 20000) throw new Error('Invalid inventory snapshot');
  const kinds = ['news', 'guides', 'devices', 'circles', 'posts', 'comments'];
  const canonical = value => {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash || url.href !== value) throw new Error('Invalid canonical snapshot URL');
    return url.href;
  };
  const decode = value => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key]);
  const advertised = new Set(); let duplicateSitemapUrls = 0;
  for (const xml of sitemaps) {
    if (Buffer.byteLength(xml) > 10_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<urlset(?:\s|>)/.test(xml) || !xml.includes('</urlset>')) throw new Error('Expected bounded sitemap URL set');
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)];
    if (locs.length > 50000) throw new Error('Sitemap URL limit');
    for (const [, value] of locs) {
      const url = canonical(decode(value));
      if (advertised.has(url)) duplicateSitemapUrls++; advertised.add(url);
    }
  }
  const expected = new Set(), seen = new Set(), byType = Object.fromEntries(kinds.map(kind => [kind, { eligibleObserved: 0, advertisedObserved: 0 }]));
  const comments = [];
  for (const record of inventory.records) {
    if (!kinds.includes(record.type) || record.eligible !== true || typeof record.url !== 'string') throw new Error('Inventory must contain explicitly eligible public records only');
    if (seen.has(record.url)) throw new Error('Duplicate inventory record'); seen.add(record.url);
    byType[record.type].eligibleObserved++;
    if (record.type === 'comments') {
      const url = new URL(record.url);
      if (url.origin !== origin || url.username || url.password || !/^\/posts\/[a-f0-9-]{36}\/$/.test(url.pathname)
        || !/^#comment-[a-f0-9-]{36}$/.test(url.hash) || (url.search && !/^\?comments_page=[1-9]\d{0,3}$/.test(url.search))) throw new Error('Invalid public comment permalink');
      comments.push({ url: record.url, parent: origin + url.pathname });
    } else {
      const url = canonical(record.url); expected.add(url);
      if (advertised.has(url)) byType[record.type].advertisedObserved++;
    }
  }
  const missing = [...expected].filter(url => !advertised.has(url));
  // A type-scoped inventory does not classify unrelated sitemap landing pages.
  const typePath = { news: /^\/news\/[^/]+\/$/, guides: /^\/guides\/[^/]+\/$/, devices: /^\/products\/[^/]+\/[^/]+\/$/, circles: /^\/circles\/[^/]+\/$/, posts: /^\/posts\/[^/]+\/$/ };
  const scoped = Object.entries(typePath).filter(([type]) => byType[type].eligibleObserved > 0).map(([, pattern]) => pattern);
  const unmatchedAdvertisedWithinObservedTypes = [...advertised].filter(url => {
    const pathname = new URL(url).pathname;
    return scoped.some(pattern => pattern.test(pathname)) && !expected.has(url);
  });
  return { scope: 'OFFLINE_SUPPLIED_SNAPSHOTS', asOf: inventory.asOf, inventoryComplete: inventory.complete,
    eligiblePageUrlsObserved: expected.size, advertisedUniqueUrlsObserved: advertised.size, duplicateSitemapUrls,
    byType, missing, unmatchedAdvertisedWithinObservedTypes,
    comments: { eligibleObserved: comments.length, parentAdvertisedObserved: comments.filter(row => advertised.has(row.parent)).length,
      missingParentUrls: [...new Set(comments.filter(row => !advertised.has(row.parent)).map(row => row.parent))],
      ssrReadability: 'NOT_VERIFIED_BY_URL_INVENTORY' },
    indexedPages: 'NOT_VERIFIED', crawlerAccess: 'NOT_VERIFIED', aiCitations: 'NOT_VERIFIED' };
}
async function boundedRead(file, maximum) {
  if ((await stat(file)).size > maximum) throw new Error('Snapshot file too large');
  return readFile(file, 'utf8');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [origin, inventoryFile, ...sitemapFiles] = process.argv.slice(2);
  if (!origin || !inventoryFile || sitemapFiles.length < 1 || sitemapFiles.length > 10) throw new Error('Usage: node scripts/discovery-coverage.mjs https://lensden.net eligible.json sitemap.xml [sitemap-forum.xml ...]');
  const inventory = JSON.parse(await boundedRead(inventoryFile, 5_000_000));
  const sitemaps = await Promise.all(sitemapFiles.map(file => boundedRead(file, 10_000_000)));
  console.log(JSON.stringify(discoveryCoverage({ origin, inventory, sitemaps }), null, 2));
}
