import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPostBookmarkCountMap,
  buildPostCommentCountMap,
  buildPostLikeCountMap,
  isMissingViewCountError,
} from "./post-engagement";
import { isPublicVisibleCircle } from "./site-navigation";
import { isDiscoveryExcluded } from "./discovery-exclusions";

export type FeedSort = "recommended" | "latest" | "hot";

type FeedCircle = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  status?: string | null;
};

type FeedProfile = {
  username?: string | null;
  display_name?: string | null;
};

type FeedPostMedia = {
  kind?: string | null;
  url?: string | null;
  storage_path?: string | null;
};

export type FeedPostRecord = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  created_at: string;
  last_activity_at?: string | null;
  view_count?: number | null;
  profiles?: FeedProfile | null;
  circles?: FeedCircle | null;
  post_media?: FeedPostMedia[] | null;
};

export type RankedFeedPost = FeedPostRecord & {
  like_count: number;
  comment_count: number;
  bookmark_count: number;
  recommended_score: number;
  hot_score: number;
};

export type ForumFeedResult = {
  posts: RankedFeedPost[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
  sort: FeedSort;
  supports_view_count: boolean;
};

type ListForumFeedOptions = {
  client: SupabaseClient;
  sort: FeedSort;
  limit: number;
  page: number;
  circleSlug?: string | null;
};

const MAX_LIMIT = 50;
const MAX_CANDIDATES = 200;
const HOT_WINDOW_DAYS = 14;

function getNowMs() {
  return Date.now();
}

function hoursSince(timestamp: string | null | undefined) {
  const value = timestamp ? new Date(timestamp).getTime() : NaN;
  if (!Number.isFinite(value)) return 9999;
  return Math.max(0, (getNowMs() - value) / (1000 * 60 * 60));
}

function daysSince(timestamp: string | null | undefined) {
  return hoursSince(timestamp) / 24;
}

function tieBreak(left: FeedPostRecord, right: FeedPostRecord) {
  const createdDiff = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  if (createdDiff !== 0) return createdDiff;
  return right.id.localeCompare(left.id);
}

function hasMedia(post: FeedPostRecord) {
  return Array.isArray(post.post_media) && post.post_media.length > 0;
}

export function parseFeedSort(input: string | null | undefined): FeedSort {
  return input === "latest" || input === "hot" || input === "recommended" ? input : "recommended";
}

function clampLimit(input: number) {
  if (!Number.isFinite(input)) return 20;
  return Math.min(Math.max(Math.trunc(input), 1), MAX_LIMIT);
}

function clampPage(input: number) {
  if (!Number.isFinite(input)) return 1;
  return Math.max(1, Math.trunc(input));
}

function candidateLimitFor(sort: FeedSort, limit: number, page: number) {
  return Math.min(MAX_CANDIDATES, Math.max(120, page * limit * 4));
}

function scoreRecommended(post: FeedPostRecord, likeCount: number, commentCount: number, bookmarkCount: number) {
  const ageHours = hoursSince(post.created_at);
  const activityHours = hoursSince(post.last_activity_at ?? post.created_at);
  const recencyScore = Math.max(0, 72 - ageHours) * 1.2;
  const activityBonus = Math.max(0, 48 - activityHours) * 0.35;
  const mediaBonus = hasMedia(post) ? 6 : 0;
  const ageDecay = ageHours * 0.45;

  return recencyScore + activityBonus + likeCount * 2 + commentCount * 3 + bookmarkCount * 2 + mediaBonus - ageDecay;
}

function scoreHot(post: FeedPostRecord, likeCount: number, commentCount: number, bookmarkCount: number) {
  const ageDays = daysSince(post.created_at);
  const activityHours = hoursSince(post.last_activity_at ?? post.created_at);
  const mediaBonus = hasMedia(post) ? 4 : 0;
  const recentActivityBonus = Math.max(0, 36 - activityHours) * 0.4;
  const ageDecay = ageDays * 2.4;

  return commentCount * 3 + likeCount * 2 + bookmarkCount * 2 + mediaBonus + recentActivityBonus - ageDecay;
}

function isMissingCircleStatusError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("status") && message.includes("does not exist");
}

async function resolveCircleId(client: SupabaseClient, circleSlug: string) {
  let { data: circle, error } = await client
    .from("circles")
    .select("id,slug,name,status")
    .eq("slug", circleSlug)
    .eq("status", "active")
    .maybeSingle();

  if (error && isMissingCircleStatusError(error)) {
    const fallback = await client.from("circles").select("id,slug,name").eq("slug", circleSlug).maybeSingle();
    circle = fallback.data ? { ...fallback.data, status: "active" } : null;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  return circle?.status?.toLowerCase() === "active" && isPublicVisibleCircle(circle) ? circle.id : null;
}

export function filterPublicVisibleFeedPosts(posts: FeedPostRecord[]): FeedPostRecord[] {
  return posts.filter((post) => !isDiscoveryExcluded('posts', post.id) && Boolean(post.circles) && isPublicVisibleCircle(post.circles ?? {}));
}

async function loadCandidatePosts(
  client: SupabaseClient,
  circleSlug: string | null | undefined,
  limit: number,
) {
  const selectWithViewCount =
    "id, author_id, title, body, type, status, created_at, last_activity_at, view_count, profiles:author_id(display_name, username), circles:circle_id!inner(id, slug, name, status), post_media(*)";
  const selectWithoutViewCount =
    "id, author_id, title, body, type, status, created_at, last_activity_at, profiles:author_id(display_name, username), circles:circle_id!inner(id, slug, name, status), post_media(*)";

  let circleId: string | null = null;
  if (circleSlug) {
    circleId = await resolveCircleId(client, circleSlug);
    if (!circleId) {
      return { posts: [], supportsViewCount: true };
    }
  }

  let query = client
    .from("posts")
    .select(selectWithViewCount)
    .eq("status", "published")
    .eq("moderation_status", "published")
    .eq("circles.status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (circleId) {
    query = query.eq("circle_id", circleId);
  }

  let { data, error } = await query.overrideTypes<FeedPostRecord[], { merge: false }>();
  let supportsViewCount = true;

  if (error && isMissingViewCountError(error)) {
    supportsViewCount = false;
    let fallbackQuery = client
      .from("posts")
      .select(selectWithoutViewCount)
      .eq("status", "published")
      .eq("moderation_status", "published")
      .eq("circles.status", "active")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (circleId) {
      fallbackQuery = fallbackQuery.eq("circle_id", circleId);
    }

    const fallback = await fallbackQuery.overrideTypes<FeedPostRecord[], { merge: false }>();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    posts: filterPublicVisibleFeedPosts((data as FeedPostRecord[] | null) ?? []),
    supportsViewCount,
  };
}

async function loadLatestPostsPage(
  client: SupabaseClient,
  circleSlug: string | null | undefined,
  page: number,
  limit: number,
) {
  const selectWithViewCount =
    "id, author_id, title, body, type, status, created_at, last_activity_at, view_count, profiles:author_id(display_name, username), circles:circle_id!inner(id, slug, name, status), post_media(*)";
  const selectWithoutViewCount =
    "id, author_id, title, body, type, status, created_at, last_activity_at, profiles:author_id(display_name, username), circles:circle_id!inner(id, slug, name, status), post_media(*)";

  let circleId: string | null = null;
  if (circleSlug) {
    circleId = await resolveCircleId(client, circleSlug);
    if (!circleId) {
      return { posts: [], supportsViewCount: true, hasMore: false };
    }
  }

  const rangeFrom = (page - 1) * limit;
  const rangeTo = rangeFrom + limit;

  let query = client
    .from("posts")
    .select(selectWithViewCount)
    .eq("status", "published")
    .eq("moderation_status", "published")
    .eq("circles.status", "active")
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (circleId) {
    query = query.eq("circle_id", circleId);
  }

  let { data, error } = await query.overrideTypes<FeedPostRecord[], { merge: false }>();
  let supportsViewCount = true;

  if (error && isMissingViewCountError(error)) {
    supportsViewCount = false;
    let fallbackQuery = client
      .from("posts")
      .select(selectWithoutViewCount)
      .eq("status", "published")
      .eq("moderation_status", "published")
      .eq("circles.status", "active")
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);

    if (circleId) {
      fallbackQuery = fallbackQuery.eq("circle_id", circleId);
    }

    const fallback = await fallbackQuery.overrideTypes<FeedPostRecord[], { merge: false }>();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  const candidates = (data as FeedPostRecord[] | null) ?? [];
  // Pagination offsets refer to database rows. Filter only this page's rows;
  // the extra row is a continuation sentinel, never part of the visible page.
  const loadedPosts = filterPublicVisibleFeedPosts(candidates.slice(0, limit));
  return {
    posts: loadedPosts.slice(0, limit),
    supportsViewCount,
    hasMore: candidates.length > limit,
  };
}

/**
 * Recommended feed V1:
 * - fetch a bounded recent candidate pool
 * - rank server-side with deterministic freshness + engagement scoring
 * - keep latest/hot/recommended aligned across SSR and API callers
 */
export async function listForumFeed({
  client,
  sort,
  limit: rawLimit,
  page: rawPage,
  circleSlug,
}: ListForumFeedOptions): Promise<ForumFeedResult> {
  const limit = clampLimit(rawLimit);
  const page = clampPage(rawPage);

  if (sort === "latest") {
    const { posts: latestPosts, supportsViewCount, hasMore } = await loadLatestPostsPage(
      client,
      circleSlug,
      page,
      limit,
    );

    const postIds = latestPosts.map((post) => post.id);
    const [likeCountMap, commentCountMap, bookmarkCountMap] = await Promise.all([
      buildPostLikeCountMap(client, postIds),
      buildPostCommentCountMap(client, postIds),
      buildPostBookmarkCountMap(client, postIds),
    ]);

    return {
      posts: latestPosts.map((post) => ({
        ...post,
        like_count: likeCountMap.get(post.id) ?? 0,
        comment_count: commentCountMap.get(post.id) ?? 0,
        bookmark_count: bookmarkCountMap.get(post.id) ?? 0,
        recommended_score: 0,
        hot_score: 0,
      })),
      total: (page - 1) * limit + latestPosts.length + (hasMore ? 1 : 0),
      page,
      limit,
      has_more: hasMore,
      sort,
      supports_view_count: supportsViewCount,
    };
  }

  const candidateLimit = candidateLimitFor(sort, limit, page);
  const { posts: fetchedPosts, supportsViewCount } = await loadCandidatePosts(client, circleSlug, candidateLimit);

  if (fetchedPosts.length === 0) {
    return {
      posts: [],
      total: 0,
      page,
      limit,
      has_more: false,
      sort,
      supports_view_count: supportsViewCount,
    };
  }

  const postIds = fetchedPosts.map((post) => post.id);
  const [likeCountMap, commentCountMap, bookmarkCountMap] = await Promise.all([
    buildPostLikeCountMap(client, postIds),
    buildPostCommentCountMap(client, postIds),
    buildPostBookmarkCountMap(client, postIds),
  ]);

  const ranked = fetchedPosts.map((post) => {
    const likeCount = likeCountMap.get(post.id) ?? 0;
    const commentCount = commentCountMap.get(post.id) ?? 0;
    const bookmarkCount = bookmarkCountMap.get(post.id) ?? 0;

    return {
      ...post,
      like_count: likeCount,
      comment_count: commentCount,
      bookmark_count: bookmarkCount,
      recommended_score: scoreRecommended(post, likeCount, commentCount, bookmarkCount),
      hot_score: scoreHot(post, likeCount, commentCount, bookmarkCount),
    };
  });

  let sorted = ranked;
  if (sort === "hot") {
    const hotCandidates = ranked.filter((post) => daysSince(post.created_at) <= HOT_WINDOW_DAYS);
    const source = hotCandidates.length >= limit ? hotCandidates : ranked;
    sorted = [...source].sort((left, right) => {
      if (right.hot_score !== left.hot_score) return right.hot_score - left.hot_score;
      const activityDiff =
        new Date(right.last_activity_at ?? right.created_at).getTime() -
        new Date(left.last_activity_at ?? left.created_at).getTime();
      if (activityDiff !== 0) return activityDiff;
      return tieBreak(left, right);
    });
  } else {
    sorted = [...ranked].sort((left, right) => {
      if (right.recommended_score !== left.recommended_score) return right.recommended_score - left.recommended_score;
      const activityDiff =
        new Date(right.last_activity_at ?? right.created_at).getTime() -
        new Date(left.last_activity_at ?? left.created_at).getTime();
      if (activityDiff !== 0) return activityDiff;
      return tieBreak(left, right);
    });
  }

  const start = (page - 1) * limit;
  const paged = sorted.slice(start, start + limit);

  return {
    posts: paged,
    total: sorted.length,
    page,
    limit,
    has_more: start + limit < sorted.length,
    sort,
    supports_view_count: supportsViewCount,
  };
}
