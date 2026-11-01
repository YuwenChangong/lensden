import type { SupabaseClient } from "@supabase/supabase-js";
import { isNewsStoragePath } from "./news-media";

export type NewsCategoryKey =
  | "industry"
  | "devices"
  | "ai_glasses"
  | "ar_glasses"
  | "developer"
  | "community"
  | "openglass";

export type NewsStatus = "draft" | "published" | "archived";
export type NewsFilterKey = "recommended" | NewsCategoryKey;

export type NewsArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  cover_image_url: string | null;
  category: NewsCategoryKey;
  source_name: string | null;
  source_url: string | null;
  status: NewsStatus;
  author_id: string | null;
  pinned: boolean;
  featured: boolean;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type NewsArticleRow = Partial<NewsArticle> & { id?: string | null; slug?: string | null; title?: string | null };

export const NEWS_CATEGORY_LABELS: Record<NewsCategoryKey, string> = {
  industry: "行业",
  devices: "设备",
  ai_glasses: "AI 眼镜",
  ar_glasses: "AR 眼镜",
  developer: "开发者",
  community: "社区",
  openglass: "Lensden",
};

const NEWS_CATEGORY_KEYS = new Set<NewsCategoryKey>(Object.keys(NEWS_CATEGORY_LABELS) as NewsCategoryKey[]);
const MAX_PUBLIC_NEWS_TITLE_LENGTH = 180;
const MAX_PUBLIC_NEWS_SUMMARY_LENGTH = 280;
const MAX_PUBLIC_NEWS_CONTENT_LENGTH = 50_000;
const MAX_PUBLIC_NEWS_SOURCE_NAME_LENGTH = 120;
export const MAX_PUBLIC_NEWS_PAGE = 1_000;

export const NEWS_FILTERS: Array<{ key: NewsFilterKey; label: string }> = [
  { key: "recommended", label: "推荐" },
  { key: "devices", label: "设备" },
  { key: "ai_glasses", label: "AI 眼镜" },
  { key: "ar_glasses", label: "AR 眼镜" },
  { key: "developer", label: "开发者" },
  { key: "community", label: "社区" },
  { key: "openglass", label: "Lensden" },
];

export const FALLBACK_NEWS_ARTICLES: NewsArticle[] = [
  {
    id: "fallback-community-001",
    slug: "community-discussion-shifts-to-real-usage",
    title: "社区观察：AR / AI 眼镜讨论开始回到真实使用问题",
    summary: "从参数表回到佩戴体验、兼容性、续航和系统限制，是当前更有价值的讨论方向。",
    content:
      "过去一段时间，很多中文讨论仍停留在参数、宣传视频和品牌口号层面。\n\n但真正会影响购买决策和长期体验的，通常是佩戴舒适度、链路稳定性、输入方式、权限边界，以及是否存在明确的开发入口。\n\nLensden 会把这类更接近真实体验的内容优先放到前台，让“热点”更有复用价值。",
    cover_image_url: null,
    category: "community",
    source_name: "Lensden 编辑部",
    source_url: null,
    status: "published",
    author_id: null,
    pinned: true,
    featured: true,
    view_count: 0,
    published_at: "2026-06-12T08:00:00.000Z",
    created_at: "2026-06-12T08:00:00.000Z",
    updated_at: "2026-06-12T08:00:00.000Z",
  },
  {
    id: "fallback-industry-002",
    slug: "product-watch-focus-on-system-boundaries",
    title: "行业整理：看眼镜产品，不应只看硬件，也要看系统边界",
    summary: "很多设备的分野并不只来自显示能力，而来自系统权限、可安装路径和输入方式的约束。",
    content:
      "同样是“眼镜”，不同产品的实际能力可能完全不同。\n\n对用户和开发者来说，真正需要长期追踪的是系统边界：是否能安装第三方应用，是否开放开发接口，是否允许持续调用摄像头或麦克风，输入方式是否足够稳定。\n\n因此“热点”内容的重点，不应只是追逐一张参数表，而是帮助用户更快理解产品分层。",
    cover_image_url: null,
    category: "industry",
    source_name: "Lensden 编辑部",
    source_url: null,
    status: "published",
    author_id: null,
    pinned: false,
    featured: true,
    view_count: 0,
    published_at: "2026-06-11T06:30:00.000Z",
    created_at: "2026-06-11T06:30:00.000Z",
    updated_at: "2026-06-11T06:30:00.000Z",
  },
  {
    id: "fallback-device-003",
    slug: "device-updates-are-shifting-toward-better-daily-utility",
    title: "设备动态：新一轮产品更新更强调日常可用性，而不是概念演示",
    summary: "更轻的机身、更稳的语音链路和更清晰的角色定位，正在成为新一轮设备更新的共同方向。",
    content:
      "与早期只强调“能做什么”的展示不同，新一轮产品更新更关注“能否每天使用”。\n\n包括佩戴负担、续航、镜片信息密度、音频私密性，以及和手机系统之间的配合，都会直接影响产品是否能进入日常场景。\n\n对读者来说，这类变化往往比单次发布会上的概念演示更值得追踪。",
    cover_image_url: null,
    category: "devices",
    source_name: "设备追踪",
    source_url: null,
    status: "published",
    author_id: null,
    pinned: false,
    featured: false,
    view_count: 0,
    published_at: "2026-06-10T05:00:00.000Z",
    created_at: "2026-06-10T05:00:00.000Z",
    updated_at: "2026-06-10T05:00:00.000Z",
  },
  {
    id: "fallback-dev-004",
    slug: "developer-conversations-now-focus-on-permissions-and-input",
    title: "开发者观察：讨论重点正在转向权限、输入和媒体能力",
    summary: "比起单纯问有没有 SDK，更重要的是搞清楚摄像头、麦克风、安装路径和输入链路是否真正可用。",
    content:
      "很多开发者在看 AR / AI 眼镜平台时，第一反应是找 SDK。\n\n但真正进入实现阶段后，最先撞到的问题通常不是文档，而是权限、安装链路、输入方式和系统限制。\n\n如果平台不能稳定处理媒体、通知、前后台切换或持续输入，那么很多看起来“能做”的场景最终都落不了地。",
    cover_image_url: null,
    category: "developer",
    source_name: "开发者观察",
    source_url: null,
    status: "published",
    author_id: null,
    pinned: false,
    featured: false,
    view_count: 0,
    published_at: "2026-06-09T09:10:00.000Z",
    created_at: "2026-06-09T09:10:00.000Z",
    updated_at: "2026-06-09T09:10:00.000Z",
  },
  {
    id: "fallback-openglass-005",
    slug: "lensden-community-is-prioritizing-verifiable-coverage",
    title: "Lensden 更新：热点页将优先呈现可验证、可复查的信息整理",
    summary: "对 Lensden 来说，热点不只是“快”，还要便于后来者快速建立判断。",
    content:
      "热点页的价值不在于把所有消息都堆出来，而在于让后来者能够快速建立判断。\n\n因此 Lensden 会把设备更新、开发边界、社区讨论和项目进展整理成更适合阅读的信息流，而不是公告墙。\n\n这也意味着每条内容都需要尽量做到可验证、可复查，而不是只追求情绪化表达。",
    cover_image_url: null,
    category: "openglass",
    source_name: "Lensden",
    source_url: null,
    status: "published",
    author_id: null,
    pinned: false,
    featured: false,
    view_count: 0,
    published_at: "2026-06-08T04:20:00.000Z",
    created_at: "2026-06-08T04:20:00.000Z",
    updated_at: "2026-06-08T04:20:00.000Z",
  },
];

type PublicNewsFeedResult = {
  articles: NewsArticle[];
  featuredArticle: NewsArticle | null;
  hotArticles: NewsArticle[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  hasMore: boolean;
};

function sortPublishedNews(left: NewsArticle, right: NewsArticle) {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
  const leftTime = new Date(left.published_at ?? left.created_at).getTime();
  const rightTime = new Date(right.published_at ?? right.created_at).getTime();
  return rightTime - leftTime;
}

function sortNewsByPublishedTime(left: NewsArticle, right: NewsArticle) {
  const leftTime = new Date(left.published_at ?? left.created_at).getTime();
  const rightTime = new Date(right.published_at ?? right.created_at).getTime();
  return rightTime - leftTime;
}

function isMissingNewsTableError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("news_articles") && (message.includes("does not exist") || message.includes("schema cache"));
}

function isMissingNewsViewRpcError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("increment_news_article_view") && (message.includes("does not exist") || message.includes("schema cache"));
}

export function isValidNewsSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function padSlugDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function buildFallbackNewsSlug(seed: string) {
  const now = new Date();
  const base =
    `news-${now.getUTCFullYear()}${padSlugDatePart(now.getUTCMonth() + 1)}${padSlugDatePart(now.getUTCDate())}` +
    `-${padSlugDatePart(now.getUTCHours())}${padSlugDatePart(now.getUTCMinutes())}`;
  const suffix = Math.abs(
    Array.from(seed).reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) | 0, 0),
  )
    .toString(36)
    .slice(0, 4);

  return suffix ? `${base}-${suffix}` : base;
}

export function slugifyNewsTitle(title: string) {
  const base = title
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return base || buildFallbackNewsSlug(title);
}

export function normalizeNewsUrl(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 2_048 || /[\u0000-\u001f\u007f]/.test(text)) return null;

  const candidate = /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(text) ? `https://${text}` : text;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password || isPrivateOrLocalHostname(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function isPrivateOrLocalHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  return /^(?:fc|fd)[0-9a-f]{2}:/i.test(host);
}

export async function buildUniqueNewsSlug(
  client: SupabaseClient,
  options: { title: string; preferredSlug?: string | null; excludeId?: string | null },
) {
  const preferredSlug = String(options.preferredSlug ?? "").trim().toLowerCase();
  const baseSlug = preferredSlug || slugifyNewsTitle(options.title);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const nextSlug = `${baseSlug}${suffix}`.slice(0, 96).replace(/-+/g, "-").replace(/^-|-$/g, "");
    const candidate = nextSlug || buildFallbackNewsSlug(options.title);
    const query = client
      .from("news_articles")
      .select("id")
      .eq("slug", candidate)
      .limit(1);
    const result = options.excludeId ? await query.neq("id", options.excludeId) : await query;

    if (isMissingNewsTableError(result.error)) {
      return candidate;
    }
    if (result.error) {
      throw new Error(result.error.message);
    }
    if (!result.data || result.data.length === 0) {
      return candidate;
    }
  }

  throw new Error("NEWS_SLUG_CONFLICT_UNRESOLVED");
}

export function parseNewsFilter(input: string | null | undefined): NewsFilterKey {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "recommended") return "recommended";
  if (value in NEWS_CATEGORY_LABELS && value !== "industry") return value as NewsCategoryKey;
  if (value === "industry") return "industry";
  return "recommended";
}

export function splitNewsContent(content: string | null | undefined) {
  return String(content ?? "")
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNewsRow(row: NewsArticleRow): NewsArticle | null {
  if (!row.id || !row.slug || !row.title) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: String(row.summary ?? "").trim(),
    content: String(row.content ?? "").trim(),
    cover_image_url: row.cover_image_url?.trim() || null,
    category: (row.category as NewsCategoryKey) || "industry",
    source_name: row.source_name?.trim() || null,
    source_url: row.source_url?.trim() || null,
    status: (row.status as NewsStatus) || "draft",
    author_id: row.author_id ?? null,
    pinned: row.pinned === true,
    featured: row.featured === true,
    view_count: Number.isFinite(Number(row.view_count)) ? Number(row.view_count) : 0,
    published_at: row.published_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

function sanitizePublicNewsText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, maxLength);
}

export function normalizePublicNewsArticle(row: NewsArticleRow): NewsArticle | null {
  const article = normalizeNewsRow(row);
  if (!article || article.status !== "published" || !isValidNewsSlug(article.slug) || !NEWS_CATEGORY_KEYS.has(article.category)) return null;

  const title = sanitizePublicNewsText(article.title, MAX_PUBLIC_NEWS_TITLE_LENGTH);
  if (!title) return null;

  const coverImage = isNewsStoragePath(article.cover_image_url)
    ? article.cover_image_url
    : normalizeNewsUrl(article.cover_image_url);

  return {
    ...article,
    title,
    summary: sanitizePublicNewsText(article.summary, MAX_PUBLIC_NEWS_SUMMARY_LENGTH),
    content: sanitizePublicNewsText(article.content, MAX_PUBLIC_NEWS_CONTENT_LENGTH),
    cover_image_url: coverImage,
    source_name: sanitizePublicNewsText(article.source_name, MAX_PUBLIC_NEWS_SOURCE_NAME_LENGTH) || null,
    source_url: normalizeNewsUrl(article.source_url),
    author_id: null,
  };
}

function fallbackArticlesFor(filter: NewsFilterKey) {
  const filtered = filter === "recommended"
    ? FALLBACK_NEWS_ARTICLES
    : FALLBACK_NEWS_ARTICLES.filter((item) => item.category === filter);

  return filtered
    .map(normalizePublicNewsArticle)
    .filter((item): item is NewsArticle => Boolean(item))
    .sort(sortPublishedNews);
}

export async function listPublicNewsFeed(
  client: SupabaseClient,
  options: { filter: NewsFilterKey; page: number; limit: number },
): Promise<PublicNewsFeedResult> {
  const page = Math.min(MAX_PUBLIC_NEWS_PAGE, Math.max(1, Math.trunc(options.page || 1)));
  const limit = Math.min(Math.max(Math.trunc(options.limit || 5), 1), 12);
  const filter = options.filter;
  const featuredQuery = client
    .from("news_articles")
    .select("*")
    .eq("status", "published")
    .eq("featured", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const latestPublishedQuery = client
    .from("news_articles")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (filter !== "recommended") {
    featuredQuery.eq("category", filter);
    latestPublishedQuery.eq("category", filter);
  }

  const hotQuery = client
    .from("news_articles")
    .select("*")
    .eq("status", "published")
    .order("view_count", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5);

  const [featuredResult, latestPublishedResult, hotResult] = await Promise.all([
    featuredQuery,
    latestPublishedQuery,
    hotQuery,
  ]);

  if (
    isMissingNewsTableError(featuredResult.error) ||
    isMissingNewsTableError(latestPublishedResult.error) ||
    isMissingNewsTableError(hotResult.error)
  ) {
    const fallback = fallbackArticlesFor(filter);
    const featured = [...fallback]
      .filter((item) => item.featured)
      .sort(sortNewsByPublishedTime)[0] ?? [...fallback].sort(sortNewsByPublishedTime)[0] ?? null;
    const fallbackList = featured ? fallback.filter((item) => item.id !== featured.id) : fallback;
    const rangeFrom = (page - 1) * limit;
    const fallbackHotBase = [...FALLBACK_NEWS_ARTICLES];
    const allZeroViews = fallbackHotBase.every((item) => (item.view_count ?? 0) === 0);
    const fallbackHot = allZeroViews
      ? fallbackHotBase.sort((left, right) =>
          new Date(right.published_at ?? right.created_at).getTime() -
          new Date(left.published_at ?? left.created_at).getTime(),
        )
      : fallbackHotBase.sort((left, right) => {
          if ((right.view_count ?? 0) !== (left.view_count ?? 0)) return (right.view_count ?? 0) - (left.view_count ?? 0);
          const publishedDiff =
            new Date(right.published_at ?? right.created_at).getTime() -
            new Date(left.published_at ?? left.created_at).getTime();
          if (publishedDiff !== 0) return publishedDiff;
          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        });
    const totalPages = Math.max(1, Math.ceil(fallbackList.length / limit));
    return {
      articles: fallbackList.slice(rangeFrom, rangeFrom + limit),
      featuredArticle: featured,
      hotArticles: fallbackHot.slice(0, 5),
      total: fallbackList.length,
      page,
      limit,
      total_pages: totalPages,
      hasMore: rangeFrom + limit < fallbackList.length,
    };
  }

  if (featuredResult.error) throw new Error(featuredResult.error.message);
  if (latestPublishedResult.error) throw new Error(latestPublishedResult.error.message);
  if (hotResult.error) throw new Error(hotResult.error.message);

  const featuredArticle = ((featuredResult.data as NewsArticleRow[] | null) ?? [])
    .map(normalizePublicNewsArticle)
    .filter(Boolean)[0]
    ?? ((latestPublishedResult.data as NewsArticleRow[] | null) ?? [])
      .map(normalizePublicNewsArticle)
      .filter(Boolean)[0]
    ?? null;
  const hotArticles = ((hotResult.data as NewsArticleRow[] | null) ?? [])
    .map(normalizePublicNewsArticle)
    .filter(Boolean) as NewsArticle[];
  const allZeroViews = hotArticles.every((item) => (item.view_count ?? 0) === 0);
  const normalizedHotArticles = allZeroViews
    ? [...hotArticles].sort((left, right) => {
        const publishedDiff =
          new Date(right.published_at ?? right.created_at).getTime() -
          new Date(left.published_at ?? left.created_at).getTime();
        if (publishedDiff !== 0) return publishedDiff;
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      })
    : hotArticles;
  const rangeFrom = (page - 1) * limit;
  const rangeTo = rangeFrom + limit - 1;
  let mainQuery = client
    .from("news_articles")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (filter !== "recommended") {
    mainQuery = mainQuery.eq("category", filter);
  }
  if (featuredArticle?.id) {
    mainQuery = mainQuery.neq("id", featuredArticle.id);
  }

  const mainResult = await mainQuery;
  if (isMissingNewsTableError(mainResult.error)) {
    const fallback = fallbackArticlesFor(filter);
    const fallbackList = featuredArticle ? fallback.filter((item) => item.id !== featuredArticle.id) : fallback;
    const totalPages = Math.max(1, Math.ceil(fallbackList.length / limit));
    return {
      articles: fallbackList.slice(rangeFrom, rangeFrom + limit),
      featuredArticle,
      hotArticles: normalizedHotArticles.slice(0, 5),
      total: fallbackList.length,
      page,
      limit,
      total_pages: totalPages,
      hasMore: rangeFrom + limit < fallbackList.length,
    };
  }
  if (mainResult.error) throw new Error(mainResult.error.message);

  const articles = ((mainResult.data as NewsArticleRow[] | null) ?? [])
    .map(normalizePublicNewsArticle)
    .filter(Boolean) as NewsArticle[];
  const total = Number(mainResult.count ?? articles.length);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    articles,
    featuredArticle,
    hotArticles: normalizedHotArticles.slice(0, 5),
    total,
    page,
    limit,
    total_pages: totalPages,
    hasMore: rangeFrom + limit < total,
  };
}

export async function getPublicNewsArticleBySlug(client: SupabaseClient, slug: string) {
  const result = await client
    .from("news_articles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (isMissingNewsTableError(result.error)) {
    return normalizePublicNewsArticle(FALLBACK_NEWS_ARTICLES.find((item) => item.slug === slug) ?? {});
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return normalizePublicNewsArticle((result.data as NewsArticleRow | null) ?? {});
}

export async function incrementPublishedNewsViewCount(client: SupabaseClient, slug: string) {
  try {
    const { error } = await client.rpc("increment_news_article_view", { p_slug: slug });
    if (error) {
      if (isMissingNewsViewRpcError(error)) return false;
      console.warn("[news] increment view count failed", error.message);
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("increment_news_article_view")) {
      return false;
    }
    console.warn("[news] increment view count failed", error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function listRelatedPublicNews(
  client: SupabaseClient,
  options: { category: NewsCategoryKey; excludeSlug: string; limit: number },
) {
  const limit = Math.min(Math.max(Number.isFinite(options.limit) ? Math.trunc(options.limit) : 4, 1), 4);
  const result = await client
    .from("news_articles")
    .select("*")
    .eq("status", "published")
    .eq("category", options.category)
    .neq("slug", options.excludeSlug)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (isMissingNewsTableError(result.error)) {
    return FALLBACK_NEWS_ARTICLES
      .filter((item) => item.category === options.category && item.slug !== options.excludeSlug)
      .map(normalizePublicNewsArticle)
      .filter((item): item is NewsArticle => Boolean(item))
      .slice(0, limit);
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return ((result.data as NewsArticleRow[] | null) ?? [])
    .map(normalizePublicNewsArticle)
    .filter(Boolean) as NewsArticle[];
}

export async function listAdminNewsArticles(
  client: SupabaseClient,
  options: { status?: "all" | NewsStatus; category?: "all" | NewsCategoryKey; search?: string; limit?: number },
) {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 80), 1), 200);
  let query = client
    .from("news_articles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options.category && options.category !== "all") {
    query = query.eq("category", options.category);
  }
  const search = String(options.search ?? "").trim();
  if (search) {
    query = query.or(`title.ilike.%${search}%,slug.ilike.%${search}%`);
  }

  const result = await query;
  if (result.error) {
    throw new Error(result.error.message);
  }

  return ((result.data as NewsArticleRow[] | null) ?? [])
    .map(normalizeNewsRow)
    .filter(Boolean) as NewsArticle[];
}

export async function getAdminNewsArticleBySlug(client: SupabaseClient, slug: string) {
  const result = await client
    .from("news_articles")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return normalizeNewsRow((result.data as NewsArticleRow | null) ?? null);
}
