import { env as runtimeEnv } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { brandCatalog, getBrandByKey } from '../lib/device-catalog';
import { LEGAL_POLICY } from '../lib/legal-policy';
import { getProductDetailHref, isValidProductSegment } from '../lib/product-route';
import { createSSRClient } from '../lib/supabase-server';
import { isPublicVisibleCircle } from '../lib/site-navigation';
import { isGazeLauncherPublicEnabled } from '../lib/gaze-launcher-visibility';
import { resolveSiteOrigin } from '../lib/site-origin';
import { canonicalNewsSitemapSlug, createSitemapTransport, editorialSitemapPath, readSitemapRows, serializeSitemap, type SitemapEntry } from '../lib/seo-sitemap';
import { validSeoDate } from '../lib/seo';

export const prerender = false;

const englishGuides = import.meta.glob<{ draft?: boolean; published_at?: string; lastUpdated?: string | Date }>(
  '../content/editorial-translations/en/guides/*.mdx', { eager: true, import: 'frontmatter' },
);

export const GET: APIRoute = async ({ site }) => {
  const origin = resolveSiteOrigin(site?.origin);
  const absolute = (path: string) => new URL(path, origin).href;
  let transport: ReturnType<typeof createSitemapTransport> | undefined;
  try {
    // Existing anonymous public client only. No session, administrative key,
    // specification reads, view-count RPCs, or community-post queries.
    if (!runtimeEnv.SUPABASE_URL || !runtimeEnv.SUPABASE_ANON_KEY) throw new Error('Sitemap data unavailable.');
    transport = createSitemapTransport(runtimeEnv.SUPABASE_URL);
    const client = createSSRClient(runtimeEnv, transport.fetch);
    const [docs, devices, circles, news] = await Promise.all([
      getCollection('docs'), readSitemapRows(client, 'devices'),
      readSitemapRows(client, 'circles'), readSitemapRows(client, 'news_articles'),
    ]);
    const paths = ['/', '/feed/', '/circles/', '/news/', '/products/', '/guides/', '/developers/', '/about/',
      ...Object.entries(LEGAL_POLICY.routes).filter(([key]) => key !== 'consent').map(([, path]) => path),
      ...(isGazeLauncherPublicEnabled() ? ['/gaze-launcher/'] : []),
      ...brandCatalog.map(brand => `/products/${brand.key}/`),
    ];
    const entries: SitemapEntry[] = paths.map(path => ({ loc: absolute(path) }));
    for (const device of devices) {
      if (!device.brand_key || !getBrandByKey(device.brand_key) || !isValidProductSegment(device.brand_key) || !isValidProductSegment(device.slug)) throw new Error('Sitemap data unavailable.');
      // Device updated_at does not cover normalized spec/source updates.
      entries.push({ loc: absolute(getProductDetailHref({ brandKey: device.brand_key, slug: device.slug })) });
    }
    for (const entry of docs) {
      const path = editorialSitemapPath(entry);
      if (path) entries.push({ loc: absolute(path), lastmod: validSeoDate(entry.data.lastUpdated) });
    }
    for (const [file, data] of Object.entries(englishGuides)) {
      if (data.draft || !validSeoDate(data.published_at)) continue;
      const slug = file.split('/').pop()?.replace(/\.mdx$/, '');
      if (!slug || !isValidProductSegment(slug) || slug === 'index') continue;
      entries.push({ loc: absolute(`/guides/${slug}/`), lastmod: validSeoDate(data.lastUpdated) });
    }
    for (const circle of circles.filter(isPublicVisibleCircle)) {
      if (!isValidProductSegment(circle.slug)) throw new Error('Sitemap data unavailable.');
      // The page also lists posts; circle.updated_at does not track those changes.
      // Omit lastmod until a timestamp covers meaningful updates to the full page.
      entries.push({ loc: absolute(`/circles/${circle.slug}/`) });
    }
    for (const article of news) {
      if (!isValidProductSegment(article.slug)) throw new Error('Sitemap data unavailable.');
      // updated_at also changes on view-count writes. Do not claim publication
      // is the last editorial modification; omit lastmod until it is reliable.
      entries.push({ loc: absolute(`/news/${canonicalNewsSitemapSlug(article.slug)}/`) });
    }
    return new Response(serializeSitemap(entries, origin), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return new Response('Sitemap temporarily unavailable.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Retry-After': '3600' },
    });
  } finally {
    transport?.abort();
  }
};
