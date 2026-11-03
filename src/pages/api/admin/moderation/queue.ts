import { env as runtimeEnv } from "cloudflare:workers";
import { joinedRecord } from "../../../../lib/server/joined-record";
import type { APIRoute } from "astro";
import { jsonResponse, requireModerator, type RuntimeEnv } from "../../../../lib/server/admin-auth";
import { sanitizeBodyForDisplay } from "../../../../lib/post-body";

export const prerender = false;

type RuntimeLocals = { runtime?: { env?: RuntimeEnv } };

function excerpt(text: string | null | undefined): string {
  return sanitizeBodyForDisplay(text ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const { client } = await requireModerator(request, env);
    const url = new URL(request.url);
    const limitRaw = Number.parseInt(String(url.searchParams.get("limit") ?? "60"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 120)) : 60;
    const includeReviewed = url.searchParams.get("include_reviewed") === "1";

    const moderationStatuses = includeReviewed
      ? ["pending_review", "rejected", "hidden_by_admin"]
      : ["pending_review"];

    const [postsResult, commentsResult] = await Promise.all([
      client
        .from("posts")
        .select("id,title,body,status,moderation_status,moderation_reason,moderation_score,moderation_provider,created_at,updated_at,author_id,circle_id,profiles:author_id(id,username,display_name,avatar_url,role),circles:circle_id(id,name,slug)")
        .in("moderation_status", moderationStatuses)
        .order("created_at", { ascending: false })
        .limit(limit),
      client
        .from("comments")
        .select("id,post_id,body,status,moderation_status,moderation_reason,moderation_score,moderation_provider,created_at,updated_at,author_id,parent_id,profiles:author_id(id,username,display_name,avatar_url,role),posts:post_id(id,title,status,circle_id,circles:circle_id(id,name,slug))")
        .in("moderation_status", moderationStatuses)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (postsResult.error) return jsonResponse({ error: postsResult.error.message }, 500);
    if (commentsResult.error) return jsonResponse({ error: commentsResult.error.message }, 500);

    const posts = (postsResult.data ?? []).map((post) => ({
      id: post.id,
      target_type: "post",
      title: post.title,
      excerpt: excerpt(post.body),
      body: post.body,
      status: post.status,
      moderation_status: post.moderation_status,
      moderation_reason: post.moderation_reason,
      moderation_score: Number(post.moderation_score ?? 0),
      moderation_provider: post.moderation_provider ?? "local",
      created_at: post.created_at,
      updated_at: post.updated_at,
      author_id: post.author_id,
      author_profile: joinedRecord(post.profiles),
      parent: null,
      post: null,
      circle: joinedRecord(post.circles),
    }));

    const comments = (commentsResult.data ?? []).map((comment) => {
      const post = joinedRecord(comment.posts);
      return {
        id: comment.id,
        target_type: "comment",
        title: post?.title ?? "评论",
        excerpt: excerpt(comment.body),
        body: comment.body,
        status: comment.status,
        moderation_status: comment.moderation_status,
        moderation_reason: comment.moderation_reason,
        moderation_score: Number(comment.moderation_score ?? 0),
        moderation_provider: comment.moderation_provider ?? "local",
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        author_id: comment.author_id,
        author_profile: joinedRecord(comment.profiles),
        parent: comment.parent_id ? { id: comment.parent_id } : null,
        post: post
          ? {
              id: post.id,
              title: post.title ?? null,
              status: post.status ?? null,
            }
          : null,
        circle: joinedRecord(post?.circles),
      };
    });

    const items = [...posts, ...comments].sort((left, right) => {
      const leftPriority = left.moderation_status === "pending_review" ? 0 : 1;
      const rightPriority = right.moderation_status === "pending_review" ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });

    return jsonResponse({ items });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
};

export const ALL: APIRoute = () => jsonResponse({ error: "Method not allowed" }, 405);

