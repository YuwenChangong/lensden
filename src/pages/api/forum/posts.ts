/**
 * Forum Posts API — Astro endpoint for Cloudflare Worker.
 *
 * Migrated from functions/api/forum/posts.ts because @astrojs/cloudflare
 * emits dist/_worker.js which takes precedence over the /functions directory
 * in Cloudflare Pages advanced mode.
 *
 * Uses Cloudflare runtime env vars: SUPABASE_URL, SUPABASE_ANON_KEY.
 * Does NOT use PUBLIC_* variables or service role key.
 * RLS enforces ownership via user JWT.
 */

import { env as runtimeEnv } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_ONLY_SENTINEL } from "../../../lib/post-body";
import { getRequestIp } from "../../../lib/request-ip";
import { deletePostMediaObjects } from "../../../lib/server/media-cleanup";
import {
  isLocalDegradedModerationResult,
  moderateContent,
} from "../../../lib/moderation/moderate-content.server";
import { isModeratorRole } from "../../../lib/server/admin-auth";
import { requireAuthenticatedLegalConsent } from "../../../lib/server/legal-consent-mutation.server";
import { createLegalConsentReadRepository } from "../../../lib/server/legal-consent-repository.server";
import { enforceUserRateLimit, hashRateLimitIp } from "../../../lib/server/rate-limit";
import { assertUserCanWrite, getSafetyWriteBlockResponse } from "../../../lib/server/user-safety.server";
import { listForumFeed, parseFeedSort } from "../../../lib/forum-feed";
import { isPublicVisibleCircle } from "../../../lib/site-navigation";

export const prerender = false;

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

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
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

function isMissingCircleStatusError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("status") && message.includes("does not exist");
}

async function loadViewerRole(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as { role?: string | null } | null)?.role ?? null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = new Set(["experience", "question", "review", "dev", "news", "feedback"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AccessibleForumPostTarget = { id: string; authorId: string; circleId: string };

async function resolveWritableCircleBySlug(client: SupabaseClient, circleSlug: string) {
  let { data: circle, error: circleError } = await client
    .from("circles")
    .select("id,slug,name,status")
    .eq("slug", circleSlug)
    .eq("status", "active")
    .maybeSingle();
  if (circleError && isMissingCircleStatusError(circleError)) {
    const fallback = await client.from("circles").select("id,slug,name").eq("slug", circleSlug).maybeSingle();
    circle = fallback.data ? { ...fallback.data, status: "active" } : null;
    circleError = fallback.error;
  }
  if (circleError) return { ok: false as const, status: 500, error: "CIRCLE_LOOKUP_FAILED" };
  if (!circle || circle.status?.toLowerCase() !== "active" || !isPublicVisibleCircle(circle)) {
    return { ok: false as const, status: 404, error: "CIRCLE_NOT_ACCESSIBLE" };
  }
  return { ok: true as const, circleId: String(circle.id) };
}

export async function resolveAccessibleForumPostTarget(
  client: SupabaseClient,
  postId: string,
  allowDeleted = false,
): Promise<{ ok: true; target: AccessibleForumPostTarget } | { ok: false; status: 404 | 500; error: string }> {
  const { data: post, error: postError } = await client
    .from("posts")
    .select("id,author_id,circle_id,status,moderation_status")
    .eq("id", postId)
    .maybeSingle();
  if (postError) return { ok: false, status: 500, error: "POST_TARGET_LOOKUP_FAILED" };

  const postRow = post as { id: string; author_id: string; circle_id: string | null; status: string; moderation_status?: string | null } | null;
  if (!postRow || postRow.id !== postId || !postRow.circle_id || !UUID_REGEX.test(postRow.circle_id) ||
    (postRow.status !== "published" && !(allowDeleted && postRow.status === "deleted")) || postRow.moderation_status !== "published") {
    return { ok: false, status: 404, error: "POST_NOT_ACCESSIBLE" };
  }

  const { data: circle, error: circleError } = await client
    .from("circles")
    .select("id,slug,name,status")
    .eq("id", postRow.circle_id)
    .maybeSingle();
  if (circleError) return { ok: false, status: 500, error: "POST_TARGET_LOOKUP_FAILED" };
  if (!circle || circle.id !== postRow.circle_id || circle.status?.toLowerCase() !== "active" || !isPublicVisibleCircle(circle)) {
    return { ok: false, status: 404, error: "POST_NOT_ACCESSIBLE" };
  }

  return { ok: true, target: { id: postRow.id, authorId: postRow.author_id, circleId: postRow.circle_id } };
}

function validatePayload(payload: Record<string, unknown>): { code: string; message: string } | null {
  const circleSlug = String(payload.circle_slug ?? "").trim();
  const title = String(payload.title ?? "").trim();
  const body = String(payload.body ?? "").trim();
  const hasMedia = payload.has_media === true;
  const type = String(payload.type ?? "").trim();

  if (!circleSlug || !title || !type) {
    return { code: "INVALID_POST_PAYLOAD", message: "circle_slug, title, type are required" };
  }
  if (title.length < 3 || title.length > 180) {
    return { code: "INVALID_POST_TITLE", message: "title must be 3-180 characters" };
  }
  if (body.length > 50000) {
    return { code: "INVALID_POST_BODY", message: "body must be <=50000 characters" };
  }
  if (!body && !hasMedia) {
    return { code: "INVALID_POST_BODY", message: "body or media is required" };
  }
  if (!ALLOWED_TYPES.has(type)) {
    return { code: "INVALID_POST_TYPE", message: "Invalid post type" };
  }
  return null;
}

function isPostBodyConstraintError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("posts_body_check") || (message.includes("body") && message.includes("check constraint"));
}

// ---------------------------------------------------------------------------
// GET — list published posts
// ---------------------------------------------------------------------------

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) {
      return json({ error: "Runtime environment not available" }, 500);
    }

    const url = new URL(request.url);
    if (url.searchParams.get("moderation_check") === "1") {
      const token = getBearerToken(request);
      if (!token) {
        return json({ error: "Missing bearer token" }, 401);
      }
      const userClient = createUserClient(env, token);
      const { data: authData, error: authError } = await userClient.auth.getUser(token);
      if (authError || !authData.user) {
        return json({ error: "Invalid auth token" }, 401);
      }
      return json({
        configured: true,
        can_moderate: isModeratorRole(await loadViewerRole(userClient, authData.user.id)),
      });
    }

    const ownershipCheckId = String(url.searchParams.get("ownership_check") ?? "").trim();
    if (ownershipCheckId) {
      const token = getBearerToken(request);
      if (!token) {
        return json({ error: "Missing bearer token" }, 401);
      }
      const userClient = createUserClient(env, token);
      const { data: authData, error: authError } = await userClient.auth.getUser(token);
      if (authError || !authData.user) {
        return json({ error: "Invalid auth token" }, 401);
      }
      const { data: post, error: postError } = await userClient
        .from("posts")
        .select("id,author_id")
        .eq("id", ownershipCheckId)
        .maybeSingle();
      if (postError) {
        return json({ error: postError.message }, 500);
      }
      if (!post) {
        return json({ exists: false, is_author: false }, 200);
      }
      return json({ exists: true, is_author: post.author_id === authData.user.id }, 200);
    }

    const circleSlug = url.searchParams.get("circle");
    const sort = parseFeedSort(url.searchParams.get("sort"));
    const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;
    const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1;
    if (url.searchParams.get("increment_view") === "1") {
      return json({ error: "View increment is not supported by this read-only endpoint" }, 400);
    }

    const client = createAnonClient(env);
    const feed = await listForumFeed({
      client,
      sort,
      limit,
      page,
      circleSlug,
    });

    return json(feed);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      500,
    );
  }
};

// ---------------------------------------------------------------------------
// POST — create a post (requires auth)
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
    const safetyDecision = await assertUserCanWrite(userClient, authData.user.id, "post_create");
    if (!safetyDecision.allowed) {
      return getSafetyWriteBlockResponse(safetyDecision);
    }

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) {
      return json({ error: "Invalid JSON payload" }, 400);
    }

    const validationError = validatePayload(payload);
    if (validationError) {
      return json({ error: validationError.message, code: validationError.code }, 400);
    }
    const circleSlug = String(payload.circle_slug ?? "").trim();
    const title = String(payload.title ?? "").trim();
    const body = String(payload.body ?? "").trim();
    const hasMedia = payload.has_media === true;
    const normalizedBody = body || (hasMedia ? MEDIA_ONLY_SENTINEL : "");
    const type = String(payload.type ?? "").trim();

    // Verify profile exists
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("id")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) {
      return json({ error: profileError.message }, 500);
    }
    if (!profile) {
      return json({ error: "Profile not found for current user" }, 403);
    }

    const circleTarget = await resolveWritableCircleBySlug(userClient, circleSlug);
    if (!circleTarget.ok) {
      if (circleTarget.status === 500) return json({ error: "Circle lookup failed" }, 500);
      return json({ error: "Circle not found or deleted" }, 404);
    }

    const rateSalt = requireEnv(env, "RATE_LIMIT_SALT");
    const ipHash = await hashRateLimitIp(getRequestIp(request), rateSalt);
    const rateLimit = await enforceUserRateLimit({
      env,
      userId: authData.user.id,
      ipHash,
      purpose: "post_create",
      bytes: 0,
    });
    if (!rateLimit.allowed) {
      if (rateLimit.reason === "RATE_LIMITED") return json({ error: "Too many posts created", code: "RATE_LIMITED" }, 429);
      return json({ error: "Rate limit service temporarily unavailable", code: rateLimit.reason }, 503);
    }

    const moderation = await moderateContent(env, {
      contentType: body ? "post_body" : "post_title",
      userId: authData.user.id,
      text: [title, body].filter(Boolean).join("\n\n"),
      localInputs: [
        { contentType: "post_title", text: title },
        ...(body ? [{ contentType: "post_body" as const, text: body }] : []),
      ],
      providerInput: {
        targetType: "post_text",
        title,
        body,
        localeHint: "zh-CN",
        metadata: {
          circleSlug,
        },
      },
    });

    if (moderation.decision === "reject") {
      return json(
        {
          error: "This post could not be published because it may violate community rules.",
          code: "CONTENT_REJECTED",
        },
        403,
      );
    }

    const requiresReview = moderation.decision === "review";
    const isDegradedAllow = isLocalDegradedModerationResult(moderation);
    const insertedStatus = requiresReview ? "pending" : "published";
    const insertedModerationStatus = requiresReview ? "pending_review" : "published";
    const moderatedAt = requiresReview || isDegradedAllow ? new Date().toISOString() : null;

    // Insert post (RLS enforces ownership)
    const { data: inserted, error: insertError } = await userClient
      .from("posts")
      .insert({
        author_id: authData.user.id,
        circle_id: circleTarget.circleId,
        type,
        title,
        body: normalizedBody,
        status: insertedStatus,
        moderation_status: insertedModerationStatus,
        moderation_reason: requiresReview || isDegradedAllow ? moderation.reason : null,
        moderation_score: requiresReview ? moderation.score : null,
        moderated_at: moderatedAt,
        moderated_by: null,
        moderation_provider: requiresReview || isDegradedAllow ? moderation.provider : null,
      })
      .select("id,author_id,circle_id,type,title,status,moderation_status,created_at")
      .single();
    if (insertError) {
      if (isPostBodyConstraintError(insertError)) {
        return json({ error: "Post body is invalid", code: "INVALID_POST_BODY" }, 400);
      }
      return json({ error: insertError.message }, 500);
    }

    return json(
      {
        post: inserted,
        pending_review: requiresReview,
        message: requiresReview ? "Post submitted for review." : "Post published.",
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
// DELETE — remove a post owned by current user (soft delete preferred)
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
    const safetyDecision = await assertUserCanWrite(userClient, authData.user.id, "post_delete");
    if (!safetyDecision.allowed) {
      return getSafetyWriteBlockResponse(safetyDecision);
    }
    const viewerRole = await loadViewerRole(userClient, authData.user.id);
    const isStaff = isModeratorRole(viewerRole);

    const url = new URL(request.url);
    const postId = String(url.searchParams.get("id") ?? url.searchParams.get("post_id") ?? "").trim();
    if (!UUID_REGEX.test(postId)) {
      return json({ error: "Invalid post_id format" }, 400);
    }

    const target = await resolveAccessibleForumPostTarget(userClient, postId, true);
    if (!target.ok) {
      if (target.status === 500) return json({ error: "Post lookup failed" }, 500);
      return json({ error: "Post not found" }, 404);
    }
    if (target.target.authorId !== authData.user.id && !isStaff) {
      return json({ error: "Cannot delete a post you do not own" }, 403);
    }

    let mediaQuery = userClient
      .from("post_media")
      .select("id,kind,storage_path,url,thumbnail_url,user_id,post_id")
      .eq("post_id", postId);
    if (!isStaff) {
      mediaQuery = mediaQuery.eq("user_id", authData.user.id);
    }

    const { data: mediaRows, error: mediaQueryError } = await mediaQuery;
    if (mediaQueryError) {
      return json({ error: mediaQueryError.message }, 500);
    }

    let updateQuery = userClient
      .from("posts")
      .update({ status: "deleted" })
      .eq("id", postId);
    if (!isStaff) {
      updateQuery = updateQuery.eq("author_id", authData.user.id);
    }

    const { data: updated, error: updateError } = await updateQuery
      .select("id,status")
      .single();
    if (updateError) {
      return json({ error: updateError.message }, 500);
    }

    const cleanup = await deletePostMediaObjects({
      env: env as Record<string, string | undefined>,
      client: userClient,
      mediaRows: mediaRows ?? [],
      deleteRows: true,
    });

    return json({
      ok: true,
      status: "deleted",
      post: updated,
      cleanup: {
        ok: cleanup.ok,
        warnings: cleanup.warnings,
        errors: cleanup.errors,
        deletedObjects: cleanup.deletedObjects,
        deletedRows: cleanup.deletedRows,
      },
      message: cleanup.ok ? "已删除并清理媒体" : "已删除，部分媒体清理需要后续重试",
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      500,
    );
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
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
    const safetyDecision = await assertUserCanWrite(userClient, authData.user.id, "post_moderate");
    if (!safetyDecision.allowed) {
      return getSafetyWriteBlockResponse(safetyDecision);
    }

    const payload = (await request.json().catch(() => null)) as
      | { id?: string; status?: string }
      | null;
    const postId = String(payload?.id ?? "").trim();
    const nextStatus = String(payload?.status ?? "").trim();
    if (!UUID_REGEX.test(postId)) {
      return json({ error: "Invalid post id" }, 400);
    }
    if (nextStatus !== "hidden") {
      return json({ error: "Only hidden status is supported in this endpoint" }, 400);
    }

    const target = await resolveAccessibleForumPostTarget(userClient, postId);
    if (!target.ok) {
      if (target.status === 500) return json({ error: "Post lookup failed" }, 500);
      return json({ error: "Post not found" }, 404);
    }

    const viewerRole = await loadViewerRole(userClient, authData.user.id);
    if (!isModeratorRole(viewerRole)) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: updated, error: updateError } = await userClient
      .from("posts")
      .update({ status: "hidden" })
      .eq("id", postId)
      .select("id,status")
      .single();
    if (updateError) {
      return json({ error: updateError.message }, 500);
    }

    return json({ post: updated });
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
