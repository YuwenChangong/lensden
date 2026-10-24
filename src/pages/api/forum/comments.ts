/**
 * Forum Comments API - Astro endpoint for Cloudflare Worker.
 *
 * GET    /api/forum/comments?post_id=<uuid>   -> threaded comments with likes, can_delete
 * POST   /api/forum/comments                  -> create a comment (requires auth)
 * DELETE /api/forum/comments?id=<uuid>        -> soft-delete a comment (author or staff)
 * PUT    /api/forum/comments                  -> toggle like on a comment
 *
 * Uses Cloudflare runtime env vars: SUPABASE_URL, SUPABASE_ANON_KEY.
 * Does NOT use service role key. RLS enforces ownership.
 */

import { env as runtimeEnv } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequestIp } from "../../../lib/request-ip";
import {
  isLocalDegradedModerationResult,
  moderateContent,
} from "../../../lib/moderation/moderate-content.server";
import { isModeratorRole } from "../../../lib/server/admin-auth";
import { requireAuthenticatedLegalConsent } from "../../../lib/server/legal-consent-mutation.server";
import { createLegalConsentReadRepository } from "../../../lib/server/legal-consent-repository.server";
import { enforceUserRateLimit, hashRateLimitIp } from "../../../lib/server/rate-limit";
import { assertUserCanWrite, getSafetyWriteBlockResponse } from "../../../lib/server/user-safety.server";
import { isPublicVisibleCircle } from "../../../lib/site-navigation";

export const prerender = false;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentRow {
  id: string;
  post_id: string;
  author_id: string | null;
  parent_id: string | null;
  body: string;
  status: string;
  moderation_status?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
}

interface ReactionRow {
  comment_id: string;
  user_id: string;
}

interface EnrichedComment {
  id: string;
  post_id: string;
  author_id: string | null;
  parent_id: string | null;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
  author: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    role: string | null;
  } | null;
  like_count: number;
  liked_by_me: boolean;
  reply_count: number;
  can_delete: boolean;
  delete_as_staff: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isMigrationMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /parent_id.*does not exist|relation.*comment_reactions.*does not exist/i.test(msg);
}

function migrationRequiredResponse(): Response {
  return json({
    error: "COMMENTS_INTERACTIONS_MIGRATION_REQUIRED",
    details: "Run supabase/migrations/20260603_forum_comments_interactions.sql before using replies and likes.",
  }, 500);
}

function isNotificationGuardError(error: { message?: string } | null | undefined): boolean {
  return /forum_notifications only allow read_at updates/i.test(error?.message ?? "");
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function createAnonClient(env: Record<string, string | undefined>): SupabaseClient {
  return createClient(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_ANON_KEY"));
}

function createUserClient(
  env: Record<string, string | undefined>,
  bearerToken: string,
): SupabaseClient {
  return createClient(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_ANON_KEY"), {
    global: {
      headers: { Authorization: `Bearer ${bearerToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CommentReactionTargetAccess =
  | { ok: true; commentId: string; postId: string; circleId: string }
  | { ok: false; status: 404 | 500; error: string };

type CommentCreationTargetAccess =
  | { ok: true; postId: string; circleId: string; parentId: string | null }
  | { ok: false; status: 404 | 500; error: string };

type CommentReadTargetAccess =
  | { ok: true; postId: string; circleId: string }
  | { ok: false; status: 404 | 500; error: string };

/**
 * Resolve the whole visibility chain before a reaction can mutate state. Every
 * relationship comes from server reads rather than the request payload.
 */
export async function resolveAccessibleCommentReactionTarget(
  client: SupabaseClient,
  commentId: string,
): Promise<CommentReactionTargetAccess> {
  const { data: comment, error: commentError } = await client
    .from("comments")
    .select("id,post_id,status,moderation_status")
    .eq("id", commentId)
    .maybeSingle();

  if (commentError) {
    return { ok: false, status: 500, error: "REACTION_TARGET_LOOKUP_FAILED" };
  }
  if (!comment || comment.status !== "published" || comment.moderation_status !== "published") {
    return { ok: false, status: 404, error: "REACTION_TARGET_NOT_ACCESSIBLE" };
  }

  const { data: post, error: postError } = await client
    .from("posts")
    .select("id,circle_id,status,moderation_status")
    .eq("id", comment.post_id)
    .maybeSingle();

  if (postError) {
    return { ok: false, status: 500, error: "REACTION_TARGET_LOOKUP_FAILED" };
  }
  if (
    !post ||
    post.id !== comment.post_id ||
    post.status !== "published" ||
    post.moderation_status !== "published"
  ) {
    return { ok: false, status: 404, error: "REACTION_TARGET_NOT_ACCESSIBLE" };
  }

  const { data: circle, error: circleError } = await client
    .from("circles")
    .select("id,slug,name,status")
    .eq("id", post.circle_id)
    .maybeSingle();

  if (circleError) {
    return { ok: false, status: 500, error: "REACTION_TARGET_LOOKUP_FAILED" };
  }
  if (
    !circle ||
    circle.id !== post.circle_id ||
    circle.status?.toLowerCase() !== "active" ||
    !isPublicVisibleCircle(circle)
  ) {
    return { ok: false, status: 404, error: "REACTION_TARGET_NOT_ACCESSIBLE" };
  }

  return { ok: true, commentId: comment.id, postId: post.id, circleId: circle.id };
}

/**
 * Resolve every ancestor a new comment depends on before any moderation or
 * rate-limit side effect. The request supplies only candidate ids; the post,
 * circle, and parent relationship are re-derived from RLS-scoped reads.
 */
export async function resolveAccessibleCommentCreationTarget(
  client: SupabaseClient,
  postId: string,
  parentId: string | null,
): Promise<CommentCreationTargetAccess> {
  const { data: post, error: postError } = await client
    .from("posts")
    .select("id,circle_id,status,moderation_status")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    return { ok: false, status: 500, error: "COMMENT_TARGET_LOOKUP_FAILED" };
  }

  const postRow = post as {
    id: string;
    circle_id: string | null;
    status: string;
    moderation_status?: string | null;
  } | null;
  if (
    !postRow ||
    postRow.id !== postId ||
    !postRow.circle_id ||
    !UUID_REGEX.test(postRow.circle_id) ||
    postRow.status !== "published" ||
    postRow.moderation_status !== "published"
  ) {
    return { ok: false, status: 404, error: "COMMENT_TARGET_NOT_ACCESSIBLE" };
  }

  const { data: circle, error: circleError } = await client
    .from("circles")
    .select("id,slug,name,status")
    .eq("id", postRow.circle_id)
    .maybeSingle();

  if (circleError) {
    return { ok: false, status: 500, error: "COMMENT_TARGET_LOOKUP_FAILED" };
  }
  if (
    !circle ||
    circle.id !== postRow.circle_id ||
    circle.status?.toLowerCase() !== "active" ||
    !isPublicVisibleCircle(circle)
  ) {
    return { ok: false, status: 404, error: "COMMENT_TARGET_NOT_ACCESSIBLE" };
  }

  if (parentId) {
    const { data: parentComment, error: parentError } = await client
      .from("comments")
      .select("id,post_id,status,moderation_status")
      .eq("id", parentId)
      .eq("post_id", postRow.id)
      .maybeSingle();

    if (parentError) {
      return { ok: false, status: 500, error: "COMMENT_TARGET_LOOKUP_FAILED" };
    }

    const parentRow = parentComment as {
      id: string;
      post_id: string;
      status: string;
      moderation_status?: string | null;
    } | null;
    if (
      !parentRow ||
      parentRow.id !== parentId ||
      parentRow.post_id !== postRow.id ||
      parentRow.status !== "published" ||
      parentRow.moderation_status !== "published"
    ) {
      return { ok: false, status: 404, error: "COMMENT_PARENT_NOT_ACCESSIBLE" };
    }
  }

  return { ok: true, postId: postRow.id, circleId: circle.id, parentId };
}

/**
 * Public comment reads must prove the post-to-circle visibility chain before
 * querying comments or any enrichment data.
 */
export async function resolveAccessibleCommentReadTarget(
  client: SupabaseClient,
  postId: string,
): Promise<CommentReadTargetAccess> {
  const { data: post, error: postError } = await client
    .from("posts")
    .select("id,author_id,circle_id,status,moderation_status")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    return { ok: false, status: 500, error: "COMMENT_READ_TARGET_LOOKUP_FAILED" };
  }

  const postRow = post as {
    id: string;
    circle_id: string | null;
    status: string;
    moderation_status?: string | null;
  } | null;
  if (
    !postRow ||
    postRow.id !== postId ||
    !postRow.circle_id ||
    !UUID_REGEX.test(postRow.circle_id) ||
    postRow.status !== "published" ||
    postRow.moderation_status !== "published"
  ) {
    return { ok: false, status: 404, error: "Post not found" };
  }

  const { data: circle, error: circleError } = await client
    .from("circles")
    .select("id,slug,name,status")
    .eq("id", postRow.circle_id)
    .maybeSingle();

  if (circleError) {
    return { ok: false, status: 500, error: "COMMENT_READ_TARGET_LOOKUP_FAILED" };
  }
  if (
    !circle ||
    circle.id !== postRow.circle_id ||
    circle.status?.toLowerCase() !== "active" ||
    !isPublicVisibleCircle(circle)
  ) {
    return { ok: false, status: 404, error: "Post not found" };
  }

  return { ok: true, postId: postRow.id, circleId: circle.id };
}

// ---------------------------------------------------------------------------
// GET - threaded comments with likes, reply count, and can_delete
// ---------------------------------------------------------------------------

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) {
      return json({ error: "Runtime environment not available" }, 500);
    }

    const url = new URL(request.url);
    const postId = url.searchParams.get("post_id");

    if (!postId || !UUID_REGEX.test(postId)) {
      return json({ error: "post_id is required (valid UUID)" }, 400);
    }

    const token = getBearerToken(request);
    let client = createAnonClient(env);
    let viewerUserId: string | null = null;
    if (token) {
      const candidate = createUserClient(env, token);
      const { data: authData } = await candidate.auth.getUser(token).catch(() => ({ data: { user: null } }));
      if (authData?.user) {
        client = candidate;
        viewerUserId = authData.user.id;
      }
    }

    const readTarget = await resolveAccessibleCommentReadTarget(client, postId);
    if (!readTarget.ok) {
      return json({ error: readTarget.error }, readTarget.status);
    }

    // Fetch comments (published + owner pending + deleted placeholders for published replies)
    const { data: allComments, error: commentsError } = await client
      .from("comments")
      .select("id, post_id, author_id, parent_id, body, status, moderation_status, created_at, updated_at")
      .eq("post_id", readTarget.postId)
      .in("status", ["published", "deleted", "pending"])
      .order("created_at", { ascending: true })
      .limit(1000);

    if (commentsError) {
      if (isMigrationMissingError(commentsError)) return migrationRequiredResponse();
      return json({ error: commentsError.message }, 500);
    }

    const rows = (allComments ?? []) as CommentRow[];

    const publishedComments = rows.filter(
      (c) => c.status === "published" && (c.moderation_status ?? "published") === "published",
    );
    const pendingComments = rows.filter(
      (c) =>
        c.status === "pending" &&
        (c.moderation_status ?? null) === "pending_review" &&
        viewerUserId === c.author_id,
    );
    // RLS deliberately hides deleted bodies. A bounded projection supplies only
    // public reply ancestry, never deleted content, authors, media or reactions.
    let deletedWithReplies: CommentRow[] = [];
    if (publishedComments.some((c) => c.parent_id)) {
      const { data: placeholders, error: placeholderError } = await client.rpc("deleted_comment_placeholders", {
        target_post_id: readTarget.postId,
        visible_comment_ids: publishedComments.map((c) => c.id),
      });
      if (placeholderError) return json({ error: "COMMENT_PLACEHOLDER_READ_FAILED" }, 500);
      deletedWithReplies = (placeholders ?? []).map((c: Pick<CommentRow, "id" | "post_id" | "parent_id" | "created_at" | "updated_at">) => ({
        ...c, author_id: null, body: "", status: "deleted", moderation_status: "published",
      }));
    }

    // Final comment set: all published + deleted placeholders with replies
    const visibleComments = [...publishedComments, ...pendingComments, ...deletedWithReplies]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

    if (visibleComments.length === 0) {
      return json({ comments: [], total: 0 });
    }

    // Fetch profiles for all visible comment authors
    const authorIds = [...new Set(visibleComments.map((c) => c.author_id).filter((id): id is string => id !== null))];
    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, username, display_name, avatar_url, role")
      .in("id", authorIds);

    if (profilesError) {
      if (isMigrationMissingError(profilesError)) return migrationRequiredResponse();
      return json({ error: profilesError.message }, 500);
    }

    const profileMap = new Map<string, ProfileRow>();
    for (const p of (profiles ?? []) as ProfileRow[]) {
      profileMap.set(p.id, p);
    }

    // Fetch reaction counts per comment
    const commentIds = visibleComments.map((c) => c.id);
    const { data: reactions, error: reactionsError } = await client
      .from("comment_reactions")
      .select("comment_id, user_id")
      .in("comment_id", commentIds);

    if (reactionsError) {
      return json({ error: reactionsError.message }, 500);
    }

    const reactionRows = (reactions ?? []) as ReactionRow[];

    // Build like_count map
    const likeCountMap = new Map<string, number>();
    for (const r of reactionRows) {
      likeCountMap.set(r.comment_id, (likeCountMap.get(r.comment_id) ?? 0) + 1);
    }

    // Build reply_count map (count published children per parent)
    const replyCountMap = new Map<string, number>();
    for (const c of publishedComments) {
      if (c.parent_id) {
        replyCountMap.set(c.parent_id, (replyCountMap.get(c.parent_id) ?? 0) + 1);
      }
    }

    // Determine liked_by_me if authenticated
    const myUserId = viewerUserId;
    let myRole: string | null = null;
    if (myUserId) {
      const { data: myProfile, error: myProfileError } = await client.from("profiles")
        .select("role").eq("id", myUserId).maybeSingle();
      if (myProfileError) return json({ error: "COMMENT_VIEWER_ROLE_READ_FAILED" }, 500);
      myRole = myProfile?.role ?? null;
    }

    const likedSet = new Set<string>();
    if (myUserId) {
      for (const r of reactionRows) {
        if (r.user_id === myUserId) likedSet.add(r.comment_id);
      }
    }

    const isStaff = isModeratorRole(myRole);

    // Enrich comments
    const enriched: EnrichedComment[] = visibleComments.map((c) => {
      const profile = c.author_id ? profileMap.get(c.author_id) : null;
      const isDeleted = c.status === "deleted";
      return {
        id: c.id,
        post_id: c.post_id,
        author_id: c.author_id,
        parent_id: c.parent_id,
        body: isDeleted ? "" : c.body,
        status: isDeleted ? "deleted" : c.status,
        created_at: c.created_at,
        updated_at: c.updated_at,
        author: profile
          ? {
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
              role: profile.role,
            }
          : null,
        like_count: likeCountMap.get(c.id) ?? 0,
        liked_by_me: likedSet.has(c.id),
        reply_count: replyCountMap.get(c.id) ?? 0,
        can_delete: !isDeleted && Boolean(myUserId && (myUserId === c.author_id || isStaff)),
        delete_as_staff: !isDeleted && isStaff && myUserId !== c.author_id,
      };
    });

    return json({ comments: enriched, total: enriched.length });
  } catch (err) {
    if (isMigrationMissingError(err)) return migrationRequiredResponse();
    return json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      500,
    );
  }
};

// ---------------------------------------------------------------------------
// POST - create a comment (requires auth), supports parent_id for replies
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) {
      return json({ error: "Runtime environment not available" }, 500);
    }

    const token = getBearerToken(request);
    if (!token) {
      return json({ error: "Missing bearer token" }, 401);
    }

    const userClient = createUserClient(env, token);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return json({ error: "Invalid auth token" }, 401);
    }
    const consent = await requireAuthenticatedLegalConsent({
      identity: { userId: authData.user.id },
      repository: createLegalConsentReadRepository(userClient),
    });
    if (!consent.ok) return consent.response;
    const safetyDecision = await assertUserCanWrite(userClient, authData.user.id, "comment_create");
    if (!safetyDecision.allowed) {
      return getSafetyWriteBlockResponse(safetyDecision);
    }

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) {
      return json({ error: "Invalid JSON payload" }, 400);
    }

    const postId = String(payload.post_id ?? "").trim();
    const body = String(payload.body ?? "").trim();
    const parentId = payload.parent_id ? String(payload.parent_id).trim() : null;

    if (!postId || !UUID_REGEX.test(postId)) {
      return json({ error: "post_id is required (valid UUID)" }, 400);
    }

    if (parentId && !UUID_REGEX.test(parentId)) {
      return json({ error: "Invalid parent_id format" }, 400);
    }

    if (body.length < 1 || body.length > 5000) {
      return json({ error: "body must be 1-5000 characters" }, 400);
    }

    // Verify profile and resolve every target ancestor before moderation or
    // rate persistence, so inaccessible content cannot produce any effect.
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) {
      return json({ error: profileError.message }, 500);
    }
    if (!profile) {
      return json({ error: "Profile not found for current user" }, 403);
    }

    const commentTarget = await resolveAccessibleCommentCreationTarget(userClient, postId, parentId);
    if (!commentTarget.ok) {
      return json({ error: commentTarget.error }, commentTarget.status);
    }

    const moderation = await moderateContent(env, {
      contentType: "comment_body",
      userId: authData.user.id,
      text: body,
      providerInput: {
        targetType: "comment_text",
        body,
        localeHint: "zh-CN",
      },
    });

    if (moderation.decision === "reject") {
      return json(
        {
          error: "This comment could not be published because it may violate community rules.",
          code: "CONTENT_REJECTED",
        },
        403,
      );
    }

    const rateSalt = requireEnv(env, "RATE_LIMIT_SALT");
    const ipHash = await hashRateLimitIp(getRequestIp(request), rateSalt);
    const rateLimit = await enforceUserRateLimit({
      env,
      userId: authData.user.id,
      ipHash,
      purpose: "comment_create",
      bytes: 0,
    });
    if (!rateLimit.allowed) {
      if (rateLimit.reason === "RATE_LIMITED") return json({ error: "Too many comments created", code: "RATE_LIMITED" }, 429);
      return json({ error: "Rate limit service temporarily unavailable", code: rateLimit.reason }, 503);
    }

    const requiresReview = moderation.decision === "review";
    const isDegradedAllow = isLocalDegradedModerationResult(moderation);
    const insertedStatus = requiresReview ? "pending" : "published";
    const insertedModerationStatus = requiresReview ? "pending_review" : "published";
    const moderatedAt = requiresReview || isDegradedAllow ? new Date().toISOString() : null;

    // Insert comment
    const insertPayload: Record<string, unknown> = {
      post_id: commentTarget.postId,
      author_id: authData.user.id,
      body,
      status: insertedStatus,
      moderation_status: insertedModerationStatus,
      moderation_reason: requiresReview || isDegradedAllow ? moderation.reason : null,
      moderation_score: requiresReview ? moderation.score : null,
      moderated_at: moderatedAt,
      moderated_by: null,
      moderation_provider: requiresReview || isDegradedAllow ? moderation.provider : null,
    };
    if (commentTarget.parentId) insertPayload.parent_id = commentTarget.parentId;

    const { data: inserted, error: insertError } = await userClient
      .from("comments")
      .insert(insertPayload)
      .select("id, post_id, author_id, parent_id, body, status, created_at, updated_at")
      .single();

    if (insertError) {
      return json({ error: insertError.message }, 500);
    }

    const enriched = {
      ...inserted,
      author: {
        username: (profile as ProfileRow).username,
        display_name: (profile as ProfileRow).display_name,
        avatar_url: (profile as ProfileRow).avatar_url,
        role: (profile as ProfileRow).role,
      },
      like_count: 0,
      liked_by_me: false,
      reply_count: 0,
      can_delete: true,
    };

    return json(
      {
        comment: enriched,
        pending_review: requiresReview,
        message: requiresReview ? "Comment submitted for review." : "Comment published.",
      },
      201,
    );
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      500,
    );
  }
};

// ---------------------------------------------------------------------------
// DELETE - soft-delete a comment (author or moderator/admin)
// ---------------------------------------------------------------------------

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) {
      return json({ error: "Runtime environment not available" }, 500);
    }

    const token = getBearerToken(request);
    if (!token) {
      return json({ error: "Missing bearer token" }, 401);
    }

    const url = new URL(request.url);
    const payload = (await request.json().catch(() => null)) as { comment_id?: string } | null;
    const commentId = String(url.searchParams.get("id") ?? payload?.comment_id ?? "").trim();
    if (!commentId || !UUID_REGEX.test(commentId)) {
      return json({ error: "comment_id is required (valid UUID)" }, 400);
    }

    const userClient = createUserClient(env, token);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return json({ error: "Invalid auth token" }, 401);
    }
    const consent = await requireAuthenticatedLegalConsent({
      identity: { userId: authData.user.id },
      repository: createLegalConsentReadRepository(userClient),
    });
    if (!consent.ok) return consent.response;

    // Check user's role
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) return json({ error: profileError.message }, 500);
    if (!profile) return json({ error: "Profile not found" }, 403);

    const isStaff = isModeratorRole((profile as { role: string }).role);

    // Fetch the comment
    const { data: comment, error: commentError } = await userClient
      .from("comments")
      .select("id, author_id, status, post_id")
      .eq("id", commentId)
      .maybeSingle();
    if (commentError) return json({ error: commentError.message }, 500);
    if (!comment) return json({ error: "Comment not found" }, 404);

    const commentRow = comment as { id: string; author_id: string; status: string; post_id: string };
    if (commentRow.status === "deleted") {
      return json({ ok: true, comment_id: commentId, status: "deleted", already_deleted: true });
    }

    if (commentRow.author_id !== authData.user.id && !isStaff) {
      return json({ error: "You can only delete your own comments" }, 403);
    }

    const { error: updateError } = await userClient
      .from("comments")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", commentId)
      .select("id")
      .single();

    if (updateError) {
      const message = String(updateError.message ?? "").trim();
      if (/comments_body_check/i.test(message)) {
        return json({
          error: "COMMENT_DELETE_BODY_CHECK_FAILED",
          details: "Soft delete must not clear comment body; update status only.",
        }, 500);
      }
      return json({ error: updateError.message }, 500);
    }

    return json({ ok: true, comment_id: commentId, status: "deleted" });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      500,
    );
  }
};

// ---------------------------------------------------------------------------
// PUT - toggle like on a comment
// ---------------------------------------------------------------------------

export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) {
      return json({ error: "Runtime environment not available" }, 500);
    }

    const token = getBearerToken(request);
    if (!token) {
      return json({ error: "Missing bearer token" }, 401);
    }

    const userClient = createUserClient(env, token);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return json({ error: "Invalid auth token" }, 401);
    }
    const consent = await requireAuthenticatedLegalConsent({
      identity: { userId: authData.user.id },
      repository: createLegalConsentReadRepository(userClient),
    });
    if (!consent.ok) return consent.response;

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) {
      return json({ error: "Invalid JSON payload" }, 400);
    }

    const commentId = String(payload.comment_id ?? "").trim();
    if (!commentId || !UUID_REGEX.test(commentId)) {
      return json({ error: "comment_id is required (valid UUID)" }, 400);
    }

    const reactionTarget = await resolveAccessibleCommentReactionTarget(userClient, commentId);
    if (!reactionTarget.ok) {
      return json({ error: reactionTarget.error }, reactionTarget.status);
    }

    // Check if already liked
    const { data: existing, error: existingError } = await userClient
      .from("comment_reactions")
      .select("id")
      .eq("comment_id", commentId)
      .eq("user_id", authData.user.id)
      .eq("reaction_type", "like")
      .maybeSingle();

    if (existingError) return json({ error: existingError.message }, 500);

    if (existing) {
      // Unlike: remove the reaction
      const { error: deleteError } = await userClient
        .from("comment_reactions")
        .delete()
        .eq("id", (existing as { id: string }).id);
      if (deleteError) return json({ error: deleteError.message }, 500);

      // Get new count
      const { count: newCount } = await userClient
        .from("comment_reactions")
        .select("id", { count: "exact", head: true })
        .eq("comment_id", commentId);

      return json({ liked: false, like_count: newCount ?? 0 });
    } else {
      // Like: insert reaction
      const { error: insertError } = await userClient
        .from("comment_reactions")
        .insert({ comment_id: commentId, user_id: authData.user.id, reaction_type: "like" });
      if (insertError) {
        if (isNotificationGuardError(insertError)) {
          return json({ error: "操作失败，请稍后重试。", code: "COMMENT_LIKE_NOTIFICATION_FAILED" }, 500);
        }
        return json({ error: insertError.message }, 500);
      }

      // Get new count
      const { count: newCount } = await userClient
        .from("comment_reactions")
        .select("id", { count: "exact", head: true })
        .eq("comment_id", commentId);

      return json({ liked: true, like_count: newCount ?? 0 });
    }
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      500,
    );
  }
};

// ---------------------------------------------------------------------------
// Unsupported methods
// ---------------------------------------------------------------------------

export const ALL: APIRoute = () => {
  return json({ error: "Method not allowed" }, 405);
};
