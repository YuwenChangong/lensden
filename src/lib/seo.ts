import { safeCatalogExternalUrl, serializeCatalogJson } from './product-public-safety';

// Discovery policy only. Authentication and database authorization remain the
// responsibility of the existing routes and RLS, never robots/canonical tags.
export function isPrivateDiscoveryPath(pathname: string): boolean {
  return /^\/(?:admin|api|auth|login|logout|register|legal-consent|reset-password|me|notifications|search|users|u|settings)(?:\/|$)/i.test(pathname)
    || /^\/(?:posts|circles)\/(?:new|edit)(?:\/|$)/i.test(pathname)
    || /^\/circles\/[^/]+\/manage(?:\/|$)/i.test(pathname);
}

export function shouldNoindex(pathname: string, status = 200): boolean {
  return status >= 400 || isPrivateDiscoveryPath(pathname);
}

export function canonicalPageUrl(value: string, origin: string, options: { allowSearch?: boolean; allowCommentPage?: boolean } = {}): string | undefined {
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.username || url.password
      || /%(?:2e|2f|5c)|\\/i.test(value)
      || (isPrivateDiscoveryPath(url.pathname) && !(options.allowSearch && /^\/search\/?$/.test(url.pathname)))) return undefined;
    if (options.allowSearch && url.pathname === '/search') url.pathname = '/search/';
    // Only visible public-thread continuation is a distinct canonical page.
    // Sitemap callers do not opt in; locale/tracking and other queries still drop.
    const page = url.searchParams.get('comments_page') ?? '';
    const keepCommentPage = options.allowCommentPage
      && /^\/posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/.test(url.pathname)
      && /^[1-9]\d*$/.test(page) && Number(page) >= 2 && Number(page) <= 1000;
    url.search = '';
    if (keepCommentPage) url.searchParams.set('comments_page', page);
    url.hash = '';
    return url.href;
  } catch { return undefined; }
}

export function validSeoDate(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return undefined;
  const date = new Date(value);
  // Date.parse accepts February 30; never normalize an impossible source date.
  const calendar = new Date(value.slice(0, 10));
  return Number.isFinite(date.getTime()) && calendar.toISOString().slice(0, 10) === value.slice(0, 10) ? date.toISOString() : undefined;
}

export const serializeJsonLd = serializeCatalogJson;
export type SchemaNode = Record<string, unknown>;

export function breadcrumbSchema(items: { name: string; url: string }[]): SchemaNode {
  return { '@type': 'BreadcrumbList', itemListElement: items.map((item, index) => ({
    '@type': 'ListItem', position: index + 1, name: item.name, item: item.url,
  })) };
}

export function articleSchema(input: {
  title: string; description?: string; url: string; publishedAt?: unknown; updatedAt?: unknown;
}): SchemaNode {
  return { '@type': 'Article', headline: input.title, url: input.url, mainEntityOfPage: input.url,
    ...(input.description ? { description: input.description } : {}),
    ...(validSeoDate(input.publishedAt) ? { datePublished: validSeoDate(input.publishedAt) } : {}),
    ...(validSeoDate(input.updatedAt) ? { dateModified: validSeoDate(input.updatedAt) } : {}),
  };
}

type SchemaSpec = {
  key: string; label: string; value: string | null; displayValue: string;
  state: string; provenance: string; region: string | null; variant: string | null;
  measurementContext: string | null;
};
export function discussionSchema(input: {
  post: { title: string; status: string; moderation_status: string | null; created_at: string; type?: string };
  text: string; url: string; authorName?: string; commentPage?: number;
  comments?: { id: string; parent_id: string | null; body: string; status: string;
    moderation_status: string | null; created_at: string;
    author: { display_name: string | null; username: string | null } | null }[];
}): SchemaNode | undefined {
  // Google requires a real public author, publication date and visible text or
  // media. Do not invent an author or claim text-only eligibility for media-only
  // pages. Missing markup never disqualifies the page from ordinary discovery.
  if (input.post.type === 'news' || input.post.status !== 'published' || input.post.moderation_status !== 'published'
    || !input.authorName?.trim() || !validSeoDate(input.post.created_at) || !input.text.trim()) return undefined;
  const visible = (input.comments ?? []).filter(comment => comment.status === 'published'
    && comment.moderation_status === 'published' && comment.body.trim()
    && validSeoDate(comment.created_at) && (comment.author?.display_name?.trim() || comment.author?.username?.trim()));
  const commentUrl = (id: string) => input.url + ((input.commentPage ?? 1) > 1 ? `?comments_page=${input.commentPage}` : '') + `#comment-${id}`;
  const marked = new Set(visible.map(comment => comment.id));
  // Flat page order matches the visible SSR list. inReplyTo is included only
  // when that exact parent is visible and eligible for markup on this page.
  const comments = visible.map(comment => ({ '@type': 'Comment', text: comment.body,
    url: commentUrl(comment.id), datePublished: validSeoDate(comment.created_at),
    author: { '@type': 'Person', name: comment.author?.display_name?.trim() || comment.author?.username?.trim() },
    ...(comment.parent_id && marked.has(comment.parent_id) ? { inReplyTo: { '@id': commentUrl(comment.parent_id) } } : {}),
    '@id': commentUrl(comment.id),
  }));
  return { '@type': 'DiscussionForumPosting', headline: input.post.title, text: input.text, url: input.url,
    datePublished: validSeoDate(input.post.created_at),
    author: { '@type': 'Person', name: input.authorName.trim() },
    ...(comments.length ? { comment: comments } : {}),
  };
}
export function productSchema(input: {
  product: { name: string; brandName: string; shortDescription: string }; url: string;
  items: SchemaSpec[]; sources: { id: string; url: string }[];
  evidence: { key: string; region: string | null; variant: string | null; source_id: string; is_conflicting: boolean }[];
}): SchemaNode {
  const publicSourceIds = new Set(input.sources.filter(source => safeCatalogExternalUrl(source.url)).map(source => source.id));
  const properties = input.items.filter(item => item.state === 'KNOWN' && item.provenance === 'STRUCTURED_VERIFIED'
    && item.value !== null && !input.evidence.some(claim => claim.key === item.key && claim.region === item.region
      && claim.variant === item.variant && claim.is_conflicting !== false)
    && input.evidence.some(claim => claim.key === item.key && claim.region === item.region
      && claim.variant === item.variant && claim.is_conflicting === false && publicSourceIds.has(claim.source_id)))
    .map(item => ({ '@type': 'PropertyValue', name: item.label, value: item.displayValue,
      ...([item.measurementContext, item.region, item.variant].filter(Boolean).length ? {
        description: [item.measurementContext, item.region, item.variant].filter(Boolean).join(' · '),
      } : {}),
    }));
  return { '@type': 'Product', name: input.product.name, url: input.url,
    brand: { '@type': 'Brand', name: input.product.brandName },
    ...(input.product.shortDescription ? { description: input.product.shortDescription } : {}),
    ...(properties.length ? { additionalProperty: properties } : {}),
  };
}
