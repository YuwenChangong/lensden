import type { SupabaseClient } from "@supabase/supabase-js";
import { listPublishedDevices } from "./public-device-data";
import { getProductDetailHref } from "./product-route";
import { buildResolvedPostMediaMap, type PostMediaRow } from "./forum-media";
import { buildPostCommentCountMap, buildPostLikeCountMap, isMissingViewCountError } from "./post-engagement";
import { buildProfileHref } from "./profile-links";
import { resolveProfileAvatarUrl } from "./profile-media";
import { isPublicVisibleCircle } from "./site-navigation";
import type {
  ForumSearchCircleResult,
  ForumSearchDeviceResult,
  ForumSearchPostResult,
  ForumSearchResults,
  ForumSearchType,
  ForumSearchUserResult,
} from "./search-types";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const MAX_POST_RESULTS = 20;
const MAX_CIRCLE_RESULTS = 20;
const MAX_USER_RESULTS = 20;
const MAX_DEVICE_RESULTS = 20;
const DEFAULT_PREVIEW_POST_LIMIT = 3;
const EXCERPT_LENGTH = 120;

type SearchValidation =
  | { ok: true; query: string; type: ForumSearchType; pattern: string; circleSlug: string | null }
  | { ok: false; error: "INVALID_QUERY" };

type SearchPostRow = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  type: string | null;
  author_id?: string | null;
  view_count?: number | null;
  circles?: { id?: string | null; slug?: string | null; name?: string | null; status?: string | null } | null;
  profiles?: { username?: string | null; display_name?: string | null } | null;
  post_media?: PostMediaRow[] | null;
};

type SearchProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string | null;
};

export function sanitizeSearchInput(raw: string): string {
  return raw
    .trim()
    // PostgREST .or() is a query language: normalize every operator and
    // wildcard delimiter out of user input before constructing its filter.
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCircleSlug(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return value ? value.slice(0, 80) : null;
}

export function parseForumSearchParams(
  rawQuery: string,
  rawType: string | null | undefined,
  rawCircle?: string | null | undefined,
): SearchValidation {
  const query = sanitizeSearchInput(rawQuery);
  const circleSlug = sanitizeCircleSlug(rawCircle);
  const type: ForumSearchType =
    circleSlug
      ? "posts"
      : rawType === "posts" || rawType === "circles" || rawType === "users" || rawType === "devices" || rawType === "all"
        ? rawType
        : "all";

  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: "INVALID_QUERY" };
  }

  return {
    ok: true,
    query,
    type,
    circleSlug,
    pattern: `%${query}%`,
  };
}

function isActivePublicSearchCircle(input: { slug?: string | null; name?: string | null; status?: string | null } | null | undefined) {
  return input?.status?.toLowerCase() === "active" && isPublicVisibleCircle(input);
}

export function normalizeSearchText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function scoreSearchText(value: string | null | undefined, query: string) {
  const candidate = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);
  if (!candidate || !normalizedQuery) return 0;
  if (candidate === normalizedQuery) return 160;
  if (candidate.startsWith(`${normalizedQuery} `) || candidate.startsWith(normalizedQuery)) return 128;
  if (candidate.split(/[^\p{L}\p{N}]+/u).includes(normalizedQuery)) return 108;
  if (candidate.includes(normalizedQuery)) return 84;
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => candidate.includes(token))) return 48;
  return 0;
}

function scorePhrasePresence(value: string | null | undefined, query: string) {
  const candidate = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);
  if (!candidate || !normalizedQuery) return 0;
  return candidate.includes(normalizedQuery) ? 24 : 0;
}

function recencyBoost(createdAt: string | null | undefined) {
  if (!createdAt) return 0;
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (ageDays <= 3) return 18;
  if (ageDays <= 14) return 12;
  if (ageDays <= 45) return 7;
  if (ageDays <= 120) return 3;
  return 0;
}

export function buildExcerpt(body: string | null | undefined, maxLength = EXCERPT_LENGTH) {
  const text = String(body ?? "")
    .replace(/[#*_`>\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function normalizePostRow(post: Record<string, unknown>): SearchPostRow {
  return {
    id: String(post.id ?? ""),
    title: String(post.title ?? ""),
    body: typeof post.body === "string" ? post.body : null,
    created_at: String(post.created_at ?? ""),
    type: typeof post.type === "string" ? post.type : null,
    author_id: typeof post.author_id === "string" ? post.author_id : null,
    view_count: typeof post.view_count === "number" ? post.view_count : null,
    circles:
      post.circles && typeof post.circles === "object"
        ? {
            id:
              typeof (post.circles as Record<string, unknown>).id === "string"
                ? ((post.circles as Record<string, unknown>).id as string)
                : null,
            slug:
              typeof (post.circles as Record<string, unknown>).slug === "string"
                ? ((post.circles as Record<string, unknown>).slug as string)
                : null,
            name:
              typeof (post.circles as Record<string, unknown>).name === "string"
                ? ((post.circles as Record<string, unknown>).name as string)
                : null,
            status:
              typeof (post.circles as Record<string, unknown>).status === "string"
                ? ((post.circles as Record<string, unknown>).status as string)
                : null,
          }
        : null,
    profiles:
      post.profiles && typeof post.profiles === "object"
        ? {
            username:
              typeof (post.profiles as Record<string, unknown>).username === "string"
                ? ((post.profiles as Record<string, unknown>).username as string)
                : null,
            display_name:
              typeof (post.profiles as Record<string, unknown>).display_name === "string"
                ? ((post.profiles as Record<string, unknown>).display_name as string)
                : null,
          }
        : null,
    post_media: Array.isArray(post.post_media) ? (post.post_media as PostMediaRow[]) : null,
  };
}

async function resolveCircleIdForSearch(supabase: SupabaseClient, circleSlug: string): Promise<string | null> {
  const { data: circle, error } = await supabase
    .from("circles")
    .select("id, slug, name, status")
    .eq("slug", circleSlug)
    .eq("status", "active")
    .maybeSingle();

  if (error || !circle || !isActivePublicSearchCircle(circle)) {
    return null;
  }

  return String(circle.id);
}

async function fetchMatchingAuthorIds(supabase: SupabaseClient, pattern: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .limit(25);

  if (error || !data) {
    return [];
  }

  return (data as Array<{ id: string | null }>).map((row) => row.id).filter((id): id is string => Boolean(id));
}

async function fetchPublishedPosts(
  supabase: SupabaseClient,
  params: {
    pattern: string;
    circleId: string | null;
    authorIds: string[];
    maxFetch: number;
  },
): Promise<{ rows: SearchPostRow[]; supportsViewCount: boolean }> {
  const selectWithViewCount =
    "id,title,body,created_at,type,author_id,view_count,circles:circle_id(id,slug,name,status),profiles:author_id(username,display_name),post_media(*)";
  const selectWithoutViewCount =
    "id,title,body,created_at,type,author_id,circles:circle_id(id,slug,name,status),profiles:author_id(username,display_name),post_media(*)";

  const buildQuery = (selectClause: string) => {
    let query = supabase
      .from("posts")
      .select<string, Record<string, unknown>>(selectClause)
      .eq("status", "published")
      .eq("moderation_status", "published")
      .or(`title.ilike.${params.pattern},body.ilike.${params.pattern}`)
      .order("created_at", { ascending: false })
      .limit(params.maxFetch);

    if (params.circleId) {
      query = query.eq("circle_id", params.circleId);
    }

    return query;
  };

  let supportsViewCount = true;
  let textResult = await buildQuery(selectWithViewCount);

  if (textResult.error && isMissingViewCountError(textResult.error)) {
    supportsViewCount = false;
    textResult = await buildQuery(selectWithoutViewCount);
  }

  if (textResult.error) {
    throw textResult.error;
  }

  const merged = new Map<string, SearchPostRow>();
  for (const row of textResult.data ?? []) {
    const normalized = normalizePostRow(row);
    if (!isActivePublicSearchCircle(normalized.circles)) continue;
    merged.set(normalized.id, normalized);
  }

  if (params.authorIds.length > 0) {
    const authorSelect = supportsViewCount ? selectWithViewCount : selectWithoutViewCount;
    let authorQuery = supabase
      .from("posts")
      .select<typeof authorSelect, Record<string, unknown>>(authorSelect)
      .eq("status", "published")
      .eq("moderation_status", "published")
      .in("author_id", params.authorIds)
      .order("created_at", { ascending: false })
      .limit(params.maxFetch);

    if (params.circleId) {
      authorQuery = authorQuery.eq("circle_id", params.circleId);
    }

    const authorResult = await authorQuery;
    if (authorResult.error && supportsViewCount && isMissingViewCountError(authorResult.error)) {
      supportsViewCount = false;
      let fallbackAuthorQuery = supabase
        .from("posts")
        .select(selectWithoutViewCount)
        .eq("status", "published")
        .eq("moderation_status", "published")
        .in("author_id", params.authorIds)
        .order("created_at", { ascending: false })
        .limit(params.maxFetch);
      if (params.circleId) {
        fallbackAuthorQuery = fallbackAuthorQuery.eq("circle_id", params.circleId);
      }
      const fallbackAuthorResult = await fallbackAuthorQuery;
      if (fallbackAuthorResult.error) throw fallbackAuthorResult.error;
      for (const row of (fallbackAuthorResult.data ?? []) as Array<Record<string, unknown>>) {
        const normalized = normalizePostRow(row);
        if (!isActivePublicSearchCircle(normalized.circles)) continue;
        merged.set(normalized.id, normalized);
      }
    } else if (authorResult.error) {
      throw authorResult.error;
    } else {
      for (const row of authorResult.data ?? []) {
        const normalized = normalizePostRow(row);
        if (!isActivePublicSearchCircle(normalized.circles)) continue;
        merged.set(normalized.id, normalized);
      }
    }
  }

  return {
    rows: [...merged.values()],
    supportsViewCount,
  };
}

async function fetchCirclePostCountMap(supabase: SupabaseClient, circleIds: string[]) {
  if (circleIds.length === 0) return new Map<string, number>();
  const { data, error } = await supabase
    .from("posts")
    .select("circle_id")
    .eq("status", "published")
    .eq("moderation_status", "published")
    .in("circle_id", circleIds)
    .limit(500);

  if (error || !data) return new Map<string, number>();
  const counts = new Map<string, number>();
  for (const row of data as Array<{ circle_id: string | null }>) {
    const circleId = row.circle_id;
    if (!circleId) continue;
    counts.set(circleId, (counts.get(circleId) ?? 0) + 1);
  }
  return counts;
}

async function fetchPublicProfiles(
  supabase: SupabaseClient,
  params: { pattern: string; query: string; limitUsers: number },
): Promise<ForumSearchUserResult[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url,bio,created_at")
    .or(`username.ilike.${params.pattern},display_name.ilike.${params.pattern},bio.ilike.${params.pattern}`)
    .limit(Math.max(params.limitUsers * 3, 24));

  if (error || !data) {
    if (error) {
      console.warn("[forum-search] profile search failed", error.message);
    }
    return [];
  }

  const profiles = (data as SearchProfileRow[]).filter((profile) => profile.id);
  if (profiles.length === 0) return [];

  const profileIds = profiles.map((profile) => profile.id);
  const [postsResult, circlesResult] = await Promise.all([
    supabase
      .from("posts")
      .select("author_id,circles:circle_id(slug,name,status)")
      .eq("status", "published")
      .eq("moderation_status", "published")
      .in("author_id", profileIds)
      .limit(500),
    supabase
      .from("circles")
      .select("id,owner_id,slug,name,status")
      .eq("status", "active")
      .in("owner_id", profileIds)
      .limit(200),
  ]);

  const postCountMap = new Map<string, number>();
  for (const row of (postsResult.data ?? []) as Array<{ author_id: string | null; circles?: { slug?: string | null; name?: string | null; status?: string | null } | null }>) {
    if (!isActivePublicSearchCircle(row.circles)) continue;
    const authorId = row.author_id;
    if (!authorId) continue;
    postCountMap.set(authorId, (postCountMap.get(authorId) ?? 0) + 1);
  }

  const circleCountMap = new Map<string, number>();
  if (!circlesResult.error) {
    for (const row of (circlesResult.data ?? []) as Array<Record<string, unknown>>) {
      const ownerId = typeof row.owner_id === "string" ? row.owner_id : null;
      if (!ownerId) continue;
      const circleCandidate = {
        id: typeof row.id === "string" ? row.id : "",
        slug: typeof row.slug === "string" ? row.slug : "",
        name: typeof row.name === "string" ? row.name : "",
        status: typeof row.status === "string" ? row.status : null,
      };
      if (!isActivePublicSearchCircle(circleCandidate)) continue;
      circleCountMap.set(ownerId, (circleCountMap.get(ownerId) ?? 0) + 1);
    }
  }

  const resolvedAvatars = await Promise.all(
    profiles.map((profile) => resolveProfileAvatarUrl(supabase, profile.avatar_url, undefined, { publicProxyUserId: profile.id })),
  );

  return profiles
    .map((profile, index) => {
      const postCount = postCountMap.get(profile.id) ?? 0;
      const circleCount = circleCountMap.get(profile.id) ?? 0;
      const href = buildProfileHref({ id: profile.id, username: profile.username });
      const score =
        scoreSearchText(profile.display_name, params.query) * 3 +
        scoreSearchText(profile.username, params.query) * 3 +
        scoreSearchText(profile.bio, params.query) +
        Math.min(postCount, 8) * 2 +
        Math.min(circleCount, 5) * 3 +
        recencyBoost(profile.created_at);

      return {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        href,
        avatar_url: resolvedAvatars[index] ?? null,
        bio_excerpt: buildExcerpt(profile.bio, 88) || null,
        post_count: postCount,
        circle_count: circleCount,
        created_at: profile.created_at,
        score,
      };
    })
    .filter((profile) => profile.score > 0 && (profile.post_count > 0 || profile.circle_count > 0))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (right.display_name ?? right.username ?? "").localeCompare(left.display_name ?? left.username ?? "");
    })
    .slice(0, params.limitUsers)
    .map(({ score: _score, ...profile }) => profile);
}

async function buildDeviceSearchResults(supabase: SupabaseClient, query: string, limitDevices: number): Promise<ForumSearchDeviceResult[]> {
  const buildDeviceKeywordText = (device: Awaited<ReturnType<typeof listPublishedDevices>>[number]) => {
    const categoryKeywords: Record<string, string> = {
      display_glasses: "ar glasses display glasses wearable display portable screen",
      ai_glasses: "ai glasses smart glasses wearable ai eyewear",
      ar_glasses: "ar glasses navigation translation heads up display wearable ar",
      smart_glasses: "smart glasses ai glasses wearable assistant camera audio",
      developer_device: "developer ar glasses prototype sensors sdk wearable computing",
    };

    return [
      device.slug,
      device.routeLabel,
      device.routeDescription,
      device.typeLabel,
      device.category ? categoryKeywords[device.category] ?? device.category : null,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const devices = await listPublishedDevices(supabase);
  return devices
    .map((device) => {
      const keywordText = buildDeviceKeywordText(device);
      const score =
        scoreSearchText(device.name, query) * 4 +
        scoreSearchText(device.brandLabel ?? device.brandName, query) * 2 +
        scoreSearchText(device.typeLabel, query) +
        scoreSearchText(device.shortDescription, query) +
        scoreSearchText(device.longDescription, query) +
        scoreSearchText(keywordText, query) * 2 +
        (device.releaseYear ? scoreSearchText(device.releaseYear, query) : 0);

      return {
        slug: device.slug,
        href: getProductDetailHref(device),
        name: device.name,
        brand_name: device.brandLabel ?? device.brandName,
        type_label: device.typeLabel ?? null,
        description: buildExcerpt(device.shortDescription ?? device.longDescription ?? "", 100) || null,
        release_year: device.releaseYear ? String(device.releaseYear) : null,
        score,
      };
    })
    .filter((device) => device.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.name.localeCompare(right.name);
    })
    .slice(0, limitDevices)
    .map(({ score: _score, ...device }) => device);
}

export async function runForumSearch(
  supabase: SupabaseClient,
  params: {
    query: string;
    type: ForumSearchType;
    circleSlug?: string | null;
    limitPosts?: number;
    limitCircles?: number;
    limitUsers?: number;
    limitDevices?: number;
    r2PublicBaseUrl?: string;
  },
): Promise<{ ok: true; results: ForumSearchResults } | { ok: false; error: "INVALID_QUERY" | "SEARCH_FAILED" }> {
  const parsed = parseForumSearchParams(params.query, params.type, params.circleSlug);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  try {
    const circleId = parsed.circleSlug ? await resolveCircleIdForSearch(supabase, parsed.circleSlug) : null;
    if (parsed.circleSlug && !circleId) {
      return {
        ok: true,
        results: {
          query: parsed.query,
          type: "posts",
          circle: parsed.circleSlug,
          posts: [],
          circles: [],
          users: [],
          devices: [],
          counts: { posts: 0, circles: 0, users: 0, devices: 0 },
        },
      };
    }

    const limitPosts = Math.min(Math.max(params.limitPosts ?? 10, 1), MAX_POST_RESULTS);
    const limitCircles = Math.min(Math.max(params.limitCircles ?? 8, 1), MAX_CIRCLE_RESULTS);
    const limitUsers = Math.min(Math.max(params.limitUsers ?? 8, 1), MAX_USER_RESULTS);
    const limitDevices = Math.min(Math.max(params.limitDevices ?? 8, 1), MAX_DEVICE_RESULTS);

    const authorIds = parsed.type === "circles" || parsed.type === "devices" ? [] : await fetchMatchingAuthorIds(supabase, parsed.pattern);

    const postsPromise =
      parsed.type === "all" || parsed.type === "posts"
        ? fetchPublishedPosts(supabase, {
            pattern: parsed.pattern,
            circleId,
            authorIds,
            maxFetch: Math.max(limitPosts * 4, 40),
          })
        : Promise.resolve({ rows: [], supportsViewCount: true });

    const circlesPromise: PromiseLike<ForumSearchCircleResult[]> =
      parsed.circleSlug || parsed.type === "posts" || parsed.type === "users" || parsed.type === "devices"
        ? Promise.resolve([])
        : supabase
            .from("circles")
            .select("id,slug,name,description,created_at,image_path,status")
            .eq("status", "active")
            .or(`name.ilike.${parsed.pattern},description.ilike.${parsed.pattern}`)
            .limit(Math.max(limitCircles * 3, 24))
            .then(async ({ data, error }) => {
              const mapRows = (rows: Array<Record<string, unknown>>, statusFallback: string | null) =>
                rows
                  .map((circle) => ({
                    id: String(circle.id),
                    slug: String(circle.slug ?? ""),
                    name: String(circle.name ?? ""),
                    description: typeof circle.description === "string" ? circle.description : null,
                    created_at: typeof circle.created_at === "string" ? circle.created_at : null,
                    image_path: typeof circle.image_path === "string" ? circle.image_path : null,
                    status: typeof circle.status === "string" ? circle.status : statusFallback,
                    post_count: 0,
                  }))
                  .filter((circle) => isActivePublicSearchCircle(circle));

              let circles = [] as ForumSearchCircleResult[];
              if (error) {
                throw error;
              } else {
                circles = mapRows((data ?? []) as Array<Record<string, unknown>>, null);
              }

              const postCountMap = await fetchCirclePostCountMap(
                supabase,
                circles.map((circle) => circle.id),
              );

              return circles
                .map((circle) => ({
                  ...circle,
                  post_count: postCountMap.get(circle.id) ?? 0,
                  score:
                    scoreSearchText(circle.name, parsed.query) * 3 +
                    scoreSearchText(circle.description, parsed.query) +
                    Math.min(postCountMap.get(circle.id) ?? 0, 12) * 2 +
                    recencyBoost(circle.created_at),
                }))
                .filter((circle) => circle.score > 0)
                .sort((left, right) => {
                  if (right.score !== left.score) return right.score - left.score;
                  return left.name.localeCompare(right.name);
                })
                .slice(0, limitCircles)
                .map(({ score: _score, ...circle }) => circle);
            });

    const usersPromise =
      parsed.circleSlug || parsed.type === "posts" || parsed.type === "circles" || parsed.type === "devices"
        ? Promise.resolve([] as ForumSearchUserResult[])
        : fetchPublicProfiles(supabase, {
            pattern: parsed.pattern,
            query: parsed.query,
            limitUsers,
          });

    const devicesPromise =
      parsed.circleSlug || parsed.type === "posts" || parsed.type === "circles" || parsed.type === "users"
        ? Promise.resolve([] as ForumSearchDeviceResult[])
        : buildDeviceSearchResults(supabase, parsed.query, limitDevices);

    const [{ rows: matchedPosts, supportsViewCount }, circles, users, devices] = await Promise.all([
      postsPromise,
      circlesPromise,
      usersPromise,
      devicesPromise,
    ]);

    const limitedPosts = matchedPosts.slice(0, Math.max(limitPosts * 4, 40));
    const postIds = limitedPosts.map((post) => post.id);
    const [likeCountMap, commentCountMap, mediaMap] = await Promise.all([
      buildPostLikeCountMap(supabase, postIds),
      buildPostCommentCountMap(supabase, postIds),
      buildResolvedPostMediaMap(
        supabase,
        limitedPosts.map((post) => ({ id: post.id, post_media: post.post_media ?? [] })),
        60 * 60,
        params.r2PublicBaseUrl,
        {
          publicProxy: true,
        },
      ),
    ]);

    const sortedPosts = [...limitedPosts]
      .map((post) => {
        const previewItems = mediaMap.get(post.id) ?? [];
        const previewImage = previewItems.find((item) => item.kind === "image") ?? null;
        const engagementScore =
          (commentCountMap.get(post.id) ?? 0) * 3 +
          (likeCountMap.get(post.id) ?? 0) * 2 +
          Number(supportsViewCount ? post.view_count ?? 0 : 0);
        const relevanceScore =
          scoreSearchText(post.title, parsed.query) * 4 +
          scorePhrasePresence(post.title, parsed.query) * 2 +
          scoreSearchText(post.circles?.name, parsed.query) * 2 +
          scoreSearchText(post.profiles?.display_name, parsed.query) * 2 +
          scoreSearchText(post.profiles?.username, parsed.query) * 2 +
          scoreSearchText(post.body, parsed.query) +
          scorePhrasePresence(post.body, parsed.query) +
          Math.min(engagementScore, 80) +
          recencyBoost(post.created_at);

        return {
          result: {
            id: post.id,
            title: post.title,
            excerpt: buildExcerpt(post.body),
            created_at: post.created_at,
            type: post.type,
            preview_image_url: previewImage?.previewUrl || previewImage?.displayUrl || null,
            has_media: previewItems.length > 0,
            circle: post.circles
              ? {
                  slug: post.circles.slug ?? null,
                  name: post.circles.name ?? null,
                }
              : null,
            author:
              post.author_id || post.profiles
                ? {
                    id: post.author_id ?? null,
                    username: post.profiles?.username ?? null,
                    display_name: post.profiles?.display_name ?? null,
                    href: buildProfileHref({ id: post.author_id ?? null, username: post.profiles?.username ?? null }),
                  }
                : null,
          } satisfies ForumSearchPostResult,
          relevanceScore,
        };
      })
      .filter((entry) => entry.relevanceScore > 0)
      .sort((left, right) => {
        if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
        return new Date(right.result.created_at).getTime() - new Date(left.result.created_at).getTime();
      })
      .slice(0, limitPosts)
      .map((entry) => entry.result);

    return {
      ok: true,
      results: {
        query: parsed.query,
        type: parsed.type,
        circle: parsed.circleSlug,
        posts: sortedPosts,
        circles,
        users,
        devices,
        counts: {
          posts: sortedPosts.length,
          circles: circles.length,
          users: users.length,
          devices: devices.length,
        },
      },
    };
  } catch (error) {
    console.warn("[forum-search] search failed", error instanceof Error ? error.message : String(error));
    return { ok: false, error: "SEARCH_FAILED" };
  }
}

export const FORUM_SEARCH_LIMITS = {
  minQueryLength: MIN_QUERY_LENGTH,
  maxQueryLength: MAX_QUERY_LENGTH,
  maxPostResults: MAX_POST_RESULTS,
  maxCircleResults: MAX_CIRCLE_RESULTS,
  maxUserResults: MAX_USER_RESULTS,
  maxDeviceResults: MAX_DEVICE_RESULTS,
  previewPostResults: DEFAULT_PREVIEW_POST_LIMIT,
} as const;
