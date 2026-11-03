import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCircleImageMap } from "./circle-images";
import { buildResolvedPostMediaMap, type PostMediaRow, type ResolvedPostMedia } from "./forum-media";
import { buildPostCommentCountMap, buildPostLikeCountMap } from "./post-engagement";
import { resolveProfileAvatarUrl, resolveProfileBannerUrl } from "./profile-media";

export type ProfileTab = "posts" | "comments" | "circles";

export type ProfileRecord = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  bio: string | null;
  role: string | null;
  created_at: string;
};

export type ProfilePostRecord = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  type: string | null;
  created_at: string;
  last_activity_at?: string | null;
  circles?: { slug?: string | null; name?: string | null } | null;
  profiles?: { username?: string | null; display_name?: string | null } | null;
  post_media?: PostMediaRow[] | null;
};

export type ProfileCommentRecord = {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  posts?: { id?: string | null; title?: string | null; status?: string | null } | null;
};

export type ProfileCircleRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_path: string | null;
  created_at: string | null;
  status?: string | null;
};

export type LoadedProfilePage = {
  profile: ProfileRecord;
  resolvedAvatarUrl: string | null;
  resolvedBannerUrl: string | null;
  stats: {
    postCount: number;
    commentCount: number;
    circleCount: number;
  };
  posts: Array<ProfilePostRecord & { likeCount: number; commentCount: number; mediaResolved: ResolvedPostMedia[] }>;
  comments: Array<ProfileCommentRecord & { postTitle: string; postHref: string }>;
  circles: Array<ProfileCircleRecord & { imageUrl: string }>;
};

type PublicPostAuthorLookupRow = {
  author_id: string | null;
  profiles?: { username?: string | null } | null;
};

function normalizeTab(value: string | null): ProfileTab {
  return value === "comments" || value === "circles" ? value : "posts";
}

export function getRequestedProfileTab(url: URL): ProfileTab {
  return normalizeTab(url.searchParams.get("tab"));
}

function isMissingBannerUrlError(error?: { message?: string | null } | null): boolean {
  const message = error?.message ?? "";
  return /banner_url/i.test(message);
}

async function selectProfileRow(
  supabase: SupabaseClient,
  column: "username" | "id",
  value: string,
): Promise<ProfileRecord | null> {
  const selectWithBanner = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, banner_url, bio, role, created_at");
  const selectWithoutBanner = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, role, created_at");

  const normalizedValue = value.trim();

  const withBannerResult =
    column === "username"
      ? await selectWithBanner.eq("username", normalizedValue).maybeSingle()
      : await selectWithBanner.eq("id", normalizedValue).maybeSingle();

  if (!withBannerResult.error) {
    const directMatch = (withBannerResult.data as ProfileRecord | null) ?? null;
    if (directMatch || column !== "username") {
      return directMatch;
    }

    const withBannerCaseInsensitive = await selectWithBanner.ilike("username", normalizedValue).maybeSingle();
    if (!withBannerCaseInsensitive.error) {
      return (withBannerCaseInsensitive.data as ProfileRecord | null) ?? null;
    }

    if (!isMissingBannerUrlError(withBannerCaseInsensitive.error)) {
      console.warn("[profile-data] username lookup failed", {
        column,
        value: normalizedValue,
        message: withBannerCaseInsensitive.error.message,
      });
      return null;
    }
  }

  if (!isMissingBannerUrlError(withBannerResult.error)) {
    console.warn("[profile-data] profile lookup failed", {
      column,
      value: normalizedValue,
      message: withBannerResult.error.message,
    });
    return null;
  }

  const withoutBannerResult =
    column === "username"
      ? await selectWithoutBanner.eq("username", normalizedValue).maybeSingle()
      : await selectWithoutBanner.eq("id", normalizedValue).maybeSingle();

  if (!withoutBannerResult.error) {
    const directMatch = (withoutBannerResult.data as ProfileRecord | null) ?? null;
    if (directMatch || column !== "username") {
      return directMatch;
    }

    const withoutBannerCaseInsensitive = await selectWithoutBanner.ilike("username", normalizedValue).maybeSingle();
    if (!withoutBannerCaseInsensitive.error) {
      return (withoutBannerCaseInsensitive.data as ProfileRecord | null) ?? null;
    }

    console.warn("[profile-data] bannerless username lookup failed", {
      column,
      value: normalizedValue,
      message: withoutBannerCaseInsensitive.error.message,
    });
    return null;
  }

  console.warn("[profile-data] bannerless profile lookup failed", {
    column,
    value: normalizedValue,
    message: withoutBannerResult.error.message,
  });
  return null;
}

export async function getProfileByUsername(
  supabase: SupabaseClient,
  username: string,
): Promise<ProfileRecord | null> {
  const normalizedUsername = username.trim();
  const directProfile = await selectProfileRow(supabase, "username", normalizedUsername);
  if (directProfile) return directProfile;

  const { data: publicPosts, error } = await supabase
    .from("posts")
    .select("author_id, profiles:author_id(username)")
    .eq("status", "published")
    .eq("moderation_status", "published")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.warn("[profile-data] public username fallback failed", {
      username: normalizedUsername,
      message: error.message,
    });
    return null;
  }

  const matchedAuthorId =
    ((publicPosts as PublicPostAuthorLookupRow[] | null) ?? []).find(
      (row) => row.author_id && row.profiles?.username?.trim().toLowerCase() === normalizedUsername.toLowerCase(),
    )?.author_id ?? null;

  if (!matchedAuthorId) return null;
  return getProfileById(supabase, matchedAuthorId);
}

export async function getProfileById(
  supabase: SupabaseClient,
  id: string,
): Promise<ProfileRecord | null> {
  return selectProfileRow(supabase, "id", id);
}

export async function loadProfilePageData(
  supabase: SupabaseClient,
  profile: ProfileRecord,
  r2PublicBaseUrl?: string,
): Promise<LoadedProfilePage> {
  const postCountPromise = supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", profile.id)
    .eq("status", "published")
    .eq("moderation_status", "published");

  const commentCountPromise = supabase
    .from("comments")
    .select("id,posts:post_id!inner(id)", { count: "exact", head: true })
    .eq("author_id", profile.id)
    .eq("status", "published")
    .eq("moderation_status", "published")
    .eq("posts.status", "published")
    .eq("posts.moderation_status", "published");

  const circleCountPromise = supabase
    .from("circles")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", profile.id)
    .or("status.is.null,status.eq.active");

  const postsPromise = supabase
    .from("posts")
    .select(
      "id,author_id,title,body,type,created_at,last_activity_at,circles:circle_id(slug,name),profiles:author_id(username,display_name),post_media(*)",
    )
    .eq("author_id", profile.id)
    .eq("status", "published")
    .eq("moderation_status", "published")
    .order("created_at", { ascending: false })
    .limit(20);

  const commentsPromise = supabase
    .from("comments")
    .select("id,post_id,body,created_at,posts:post_id!inner(id,title,status)")
    .eq("author_id", profile.id)
    .eq("status", "published")
    .eq("moderation_status", "published")
    .eq("posts.status", "published")
    .eq("posts.moderation_status", "published")
    .order("created_at", { ascending: false })
    .limit(20);

  const circlesPromise = supabase
    .from("circles")
    .select("id,slug,name,description,image_path,created_at,status")
    .eq("owner_id", profile.id)
    .or("status.is.null,status.eq.active")
    .order("created_at", { ascending: false })
    .limit(20);

  const [
    { count: postCount },
    { count: commentCount },
    { count: circleCount },
    { data: postsRaw },
    { data: commentsRaw },
    { data: circlesRaw },
  ] = await Promise.all([
    postCountPromise,
    commentCountPromise,
    circleCountPromise,
    postsPromise,
    commentsPromise,
    circlesPromise,
  ]);

  const posts = (postsRaw as ProfilePostRecord[] | null) ?? [];
  const comments = ((commentsRaw as ProfileCommentRecord[] | null) ?? []).filter(
    (comment) => comment.posts?.id && comment.posts?.title,
  );
  const circles = (circlesRaw as ProfileCircleRecord[] | null) ?? [];

  const mediaMap = await buildResolvedPostMediaMap(supabase, posts, 60 * 60, r2PublicBaseUrl, {
    publicProxy: true,
  });
  const postIds = posts.map((post) => post.id);
  const [likeCountMap, commentCountMap] = await Promise.all([
    buildPostLikeCountMap(supabase, postIds),
    buildPostCommentCountMap(supabase, postIds),
  ]);
  const circleImageMap = await buildCircleImageMap(supabase, circles, 60 * 60, { publicProxy: true });
  const [resolvedAvatarUrl, resolvedBannerUrl] = await Promise.all([
    resolveProfileAvatarUrl(supabase, profile.avatar_url, undefined, { publicProxyUserId: profile.id }),
    resolveProfileBannerUrl(supabase, profile.banner_url ?? null, undefined, { publicProxyUserId: profile.id }),
  ]);

  return {
    profile,
    resolvedAvatarUrl,
    resolvedBannerUrl,
    stats: {
      postCount: postCount ?? 0,
      commentCount: commentCount ?? 0,
      circleCount: circleCount ?? 0,
    },
    posts: posts.map((post) => ({
      ...post,
      likeCount: likeCountMap.get(post.id) ?? 0,
      commentCount: commentCountMap.get(post.id) ?? 0,
      mediaResolved: mediaMap.get(post.id) ?? [],
    })),
    comments: comments.map((comment) => ({
      ...comment,
      postTitle: comment.posts?.title ?? "帖子",
      postHref: `/posts/${comment.post_id}/`,
    })),
    circles: circles.map((circle) => ({
      ...circle,
      imageUrl: circleImageMap.get(circle.id) ?? "",
    })),
  };
}
