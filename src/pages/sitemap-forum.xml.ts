import { env as runtimeEnv } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { createSSRClient } from '../lib/supabase-server';
import { resolveSiteOrigin } from '../lib/site-origin';
import { serializeSitemap } from '../lib/seo-sitemap';
import { createForumTransport, readForumSitemapRows } from '../lib/forum-discovery';
export const prerender = false;
export const GET: APIRoute = async ({ site }) => {
  let transport: ReturnType<typeof createForumTransport> | undefined;
  try {
    if (!runtimeEnv.SUPABASE_URL || !runtimeEnv.SUPABASE_ANON_KEY) throw new Error('Unavailable');
    transport = createForumTransport(runtimeEnv.SUPABASE_URL, 'sitemap');
    const posts = await readForumSitemapRows(createSSRClient(runtimeEnv, transport.fetch));
    const origin = resolveSiteOrigin(site?.origin);
    // No view/engagement timestamps masquerading as editorial modifications.
    const xml = serializeSitemap(posts.map(post => ({ loc: new URL(`/posts/${post.id}/`, origin).href })), origin);
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return new Response('Sitemap temporarily unavailable.', { status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Retry-After': '3600' } });
  } finally { transport?.abort(); }
};
