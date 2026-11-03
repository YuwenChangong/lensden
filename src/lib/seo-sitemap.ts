import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalPageUrl, validSeoDate } from './seo';

export type SitemapEntry = { loc: string; lastmod?: string };

// One transport per sitemap invocation, shared by all table readers. Count
// physical fetches, not logical pages; keep margin below Workers Free's 50
// external subrequests. Never follow redirects or amplify failures with retries.
export function createSitemapTransport(origin: string, implementation: typeof fetch = fetch): { fetch: typeof fetch; abort: () => void } {
  const allowedOrigin = new URL(origin).origin;
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
  let attempts = 0;
  return {
    fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (signal.aborted || attempts >= 40 || url.origin !== allowedOrigin || url.username || url.password || method !== 'GET'
        || !/^\/rest\/v1\/(?:devices|circles|news_articles)$/.test(url.pathname)) throw new Error('Sitemap data unavailable.');
      attempts++;
      // Workers supports manual/follow, not the browser's redirect:error mode.
      const response = await implementation(input, { ...init, redirect: 'manual', signal });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new Error('Sitemap data unavailable.');
      }
      return response;
    },
    abort: () => controller.abort(),
  };
}
// Match the existing permanent redirect and legacy-record bridge in news/[slug].
export function canonicalNewsSitemapSlug(slug: string): string {
  return slug === 'openglass-community-is-prioritizing-verifiable-coverage'
    ? 'lensden-community-is-prioritizing-verifiable-coverage' : slug;
}
// Fixed public routes only. Runtime device/article identities are supplied by
// sitemap.xml, never inferred from route templates or query-based comparisons.
export function isStaticSitemapPage(value: string): boolean {
  const url = new URL(value);
  if (canonicalPageUrl(value, url.origin) !== value) return false;
  return /^\/(?:$|(?:feed|circles|news|products|guides|developers|about|terms|privacy|community-guidelines|safety|account-deletion|contact|gaze-launcher)\/$)/.test(url.pathname);
}
export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export function serializeSitemap(entries: SitemapEntry[], origin: string): string {
  const unique = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    if (canonicalPageUrl(entry.loc, origin) !== entry.loc) throw new Error('Ineligible sitemap URL.');
    if (!unique.has(entry.loc)) unique.set(entry.loc, entry);
  }
  if (unique.size > 50_000) throw new Error('Sitemap size limit.');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    + [...unique.values()].map(entry => '<url><loc>' + escapeXml(entry.loc) + '</loc>'
      + (validSeoDate(entry.lastmod) ? '<lastmod>' + validSeoDate(entry.lastmod) + '</lastmod>' : '') + '</url>').join('') + '</urlset>';
  if (new TextEncoder().encode(xml).length > 50_000_000) throw new Error('Sitemap size limit.');
  return xml;
}

// Astro content collections use id in current versions; older entries use slug.
// Device editorial files are not publication authority for device identities.
export function editorialSitemapPath(entry: { id?: string; slug?: string; data: { draft?: boolean } }): string | undefined {
  if (entry.data.draft) return undefined;
  let slug = (entry.slug || entry.id || '').replace(/\.(?:md|mdx)$/, '');
  slug = slug.replace(/^reference\/guides\//, 'guides/');
  if (!/^(?:guides|developers|about)(?:\/|$)/.test(slug) && slug !== 'reference/community/pinned-posts') return undefined;
  if (slug.endsWith('/index')) slug = slug.slice(0, -6);
  if (!/^[a-z0-9/-]+$/.test(slug) || slug.includes('//') || slug.split('/').some(part => part === '..')) return undefined;
  return `/${slug}/`;
}

type Table = 'devices' | 'circles' | 'news_articles';
export type SitemapRow = { id?: string; slug: string; brand_key?: string; status?: string; name?: string; published_at?: string; updated_at?: string; created_at?: string };
const projections = {
  devices: { columns: 'slug,brand_key', filter: 'publication_status', value: 'published' },
  circles: { columns: 'id,slug,status,name,updated_at,created_at', filter: 'status', value: 'active' },
  news_articles: { columns: 'slug,published_at,updated_at', filter: 'status', value: 'published' },
};

// At most 20 sequential reads/table, 5,000 rows/table. Respect server row caps
// using actual returned lengths; refuse to advertise a silently partial map.
export async function readSitemapRows(client: SupabaseClient, table: Table): Promise<SitemapRow[]> {
  const projection = projections[table];
  const rows: SitemapRow[] = [];
  let expected: number | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const { data, error, count } = await client.from(table).select(projection.columns, { count: 'exact' })
      .eq(projection.filter, projection.value).order('slug').retry(false).range(rows.length, rows.length + 499);
    if (error || !Array.isArray(data) || !Number.isInteger(count) || count === null || count < 0 || count > 5000
      || (expected !== undefined && count !== expected)) throw new Error('Sitemap data unavailable.');
    expected = count;
    for (const row of data as unknown as SitemapRow[]) {
      if (!row.slug || seen.has(row.slug)) throw new Error('Sitemap data unavailable.');
      seen.add(row.slug);
      rows.push(row);
    }
    if (rows.length === expected) return rows;
    if (!data.length || rows.length > expected) throw new Error('Sitemap data unavailable.');
  }
  throw new Error('Sitemap data unavailable.');
}
