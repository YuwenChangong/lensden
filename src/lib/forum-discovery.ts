import type { SupabaseClient } from '@supabase/supabase-js';
import { isPublicVisibleCircle } from './site-navigation';
import { isDiscoveryExcluded } from './discovery-exclusions';

export const PUBLIC_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const FORUM_SITEMAP_LIMIT = 5000;
export const PUBLIC_COMMENT_PAGE_SIZE = 50;
export const PUBLIC_COMMENT_MAX_PAGES = 1000;
export type PublicPostIdentity = { id: string; status: string; moderation_status: string | null;
  circles: { id?: string; slug: string; name?: string | null; status: string } | null };
export function isDiscoverablePost(post: PublicPostIdentity): boolean {
  return PUBLIC_UUID.test(post.id) && post.status === 'published' && post.moderation_status === 'published'
    && !isDiscoveryExcluded('posts', post.id) && !!post.circles
    && post.circles.status === 'active' && isPublicVisibleCircle(post.circles);
}

// Separate from the existing sitemap budget. Anonymous GETs only, exact REST
// target, no retries/redirects, finite time/bytes/requests, no new services.
export function createForumTransport(origin: string, scope: 'sitemap' | 'comments', implementation: typeof fetch = fetch) {
  const allowedOrigin = new URL(origin).origin;
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
  let attempts = 0;
  return { abort: () => controller.abort(), fetch: (async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (signal.aborted || attempts >= (scope === 'sitemap' ? 20 : 4) || method !== 'GET'
      || url.origin !== allowedOrigin || url.username || url.password
      || url.pathname !== `/rest/v1/${scope === 'sitemap' ? 'posts' : 'comments'}`) throw new Error('Public discovery unavailable.');
    attempts++;
    const response = await implementation(input, { ...init, signal, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel(); throw new Error('Public discovery unavailable.');
    }
    const reader = response.body?.getReader();
    if (!reader) return response;
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 1_000_000) throw new Error('Public discovery unavailable.');
        chunks.push(value);
      }
    } catch { await reader.cancel(); throw new Error('Public discovery unavailable.'); }
    return new Response(new Blob(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
  }) as typeof fetch };
}

export async function readForumSitemapRows(client: SupabaseClient): Promise<PublicPostIdentity[]> {
  const rows: PublicPostIdentity[] = [], seen = new Set<string>();
  let expected: number | undefined;
  for (let page = 0; page < 20; page++) {
    const { data, error, count } = await client.from('posts')
      .select('id,status,moderation_status,circles:circle_id!inner(id,slug,name,status)', { count: 'exact' })
      .eq('status', 'published').eq('moderation_status', 'published').eq('circles.status', 'active')
      .order('id').retry(false).range(rows.length, rows.length + 499);
    if (error || !Array.isArray(data) || data.length > 500 || count === null || !Number.isInteger(count) || count < 0
      || count > FORUM_SITEMAP_LIMIT || (expected !== undefined && count !== expected)) throw new Error('Public discovery unavailable.');
    expected = count;
    for (const row of data as unknown as PublicPostIdentity[]) {
      if (!PUBLIC_UUID.test(row.id) || seen.has(row.id)) throw new Error('Public discovery unavailable.');
      seen.add(row.id); rows.push(row);
    }
    if (rows.length === expected) return rows.filter(isDiscoverablePost);
    if (!data.length || rows.length > expected) throw new Error('Public discovery unavailable.');
  }
  throw new Error('Public discovery unavailable.');
}

export type PublicComment = { id: string; post_id: string; parent_id: string | null; body: string;
  status: string; moderation_status: string | null; created_at: string;
  author: { display_name: string | null; username: string | null } | null };
export function parsePublicCommentPage(value: string | null): number | undefined {
  if (value === null) return 1;
  if (!/^[1-9]\d{0,3}$/.test(value)) return undefined;
  const page = Number(value);
  return page <= PUBLIC_COMMENT_MAX_PAGES ? page : undefined;
}
export async function readPublicCommentPage(client: SupabaseClient, postId: string, page: number) {
  if (!PUBLIC_UUID.test(postId) || !Number.isInteger(page) || page < 1 || page > PUBLIC_COMMENT_MAX_PAGES) throw new Error('Public discovery unavailable.');
  const offset = (page - 1) * PUBLIC_COMMENT_PAGE_SIZE;
  const rows: PublicComment[] = [], seen = new Set<string>(); let expected: number | undefined;
  for (let request = 0; request < 4; request++) {
    const { data, error, count } = await client.from('comments')
      .select('id,post_id,parent_id,body,status,moderation_status,created_at,author:author_id(display_name,username)', { count: 'exact' })
      .eq('post_id', postId).eq('status', 'published').eq('moderation_status', 'published')
      .order('created_at').order('id').retry(false).range(offset + rows.length, offset + PUBLIC_COMMENT_PAGE_SIZE);
    if (error || !Array.isArray(data) || data.length > PUBLIC_COMMENT_PAGE_SIZE + 1 - rows.length || count === null || !Number.isInteger(count) || count < 0
      || count > PUBLIC_COMMENT_PAGE_SIZE * PUBLIC_COMMENT_MAX_PAGES
      || (expected !== undefined && expected !== count)) throw new Error('Public discovery unavailable.');
    expected = count;
    for (const row of data as unknown as PublicComment[]) {
      if (!PUBLIC_UUID.test(row.id) || seen.has(row.id) || row.post_id !== postId
        || row.status !== 'published' || row.moderation_status !== 'published'
        || typeof row.body !== 'string' || row.body.length > 5000) throw new Error('Public discovery unavailable.');
      seen.add(row.id); rows.push(row);
    }
    if (rows.length >= PUBLIC_COMMENT_PAGE_SIZE + 1 || offset + rows.length >= expected) {
      const comments = rows.slice(0, PUBLIC_COMMENT_PAGE_SIZE).filter(row => !isDiscoveryExcluded('comments', row.id));
      // Do not serialize identities of hidden/deleted/off-page parents. Break
      // cycles so every public comment remains reachable without recursion.
      const visible = new Map(comments.map(row => [row.id, row]));
      return { comments: comments.map(row => {
        let parent = row.parent_id; const ancestors = new Set([row.id]); let cursor = parent;
        while (cursor) {
          if (!visible.has(cursor)) { if (cursor === parent) parent = null; break; }
          if (ancestors.has(cursor)) { parent = null; break; }
          ancestors.add(cursor); cursor = visible.get(cursor)!.parent_id;
        }
        return { ...row, parent_id: parent };
      }), hasMore: offset + Math.min(rows.length, PUBLIC_COMMENT_PAGE_SIZE) < expected };
    }
    if (!data.length) throw new Error('Public discovery unavailable.');
  }
  throw new Error('Public discovery unavailable.');
}
