import { env as runtimeEnv } from "cloudflare:workers";
import { joinedRecord } from "../../../../lib/server/joined-record";
import type { APIRoute } from "astro";
import { sanitizeBodyForDisplay } from "../../../../lib/post-body";
import { deletePostMediaObjects } from "../../../../lib/server/media-cleanup";
import { jsonResponse, requireModerator, type RuntimeEnv } from "../../../../lib/server/admin-auth";
import { requireAuthenticatedLegalConsent } from "../../../../lib/server/legal-consent-mutation.server";
import { createLegalConsentReadRepository } from "../../../../lib/server/legal-consent-repository.server";

export const prerender = false;

type RuntimeLocals = { runtime?: { env?: RuntimeEnv } };

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELETE_WARNING_CODE = "POST_DELETE_MEDIA_CLEANUP_WARNING";

function excerpt(text: string | null | undefined): string {
  return sanitizeBodyForDisplay(text ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const { client } = await requireModerator(request, env);

    const url = new URL(request.url);
    const statusFilter = String(url.searchParams.get("status") ?? "all").trim();
    const kindFilter = String(url.searchParams.get("kind") ?? "all").trim();
    const focusPostId = String(url.searchParams.get("post") ?? "").trim();
    const limitRaw = Number.parseInt(String(url.searchParams.get("limit") ?? "50"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 50;

    if (focusPostId && !uuidRegex.test(focusPostId)) {
      return jsonResponse({ error: "Invalid post id" }, 400);
    }

    let query = client
      .from("posts")
      .select("id,title,body,status,author_id,circle_id,created_at,updated_at,circles:circle_id(name,slug),post_media(id,kind,size_bytes),profiles:author_id(id,display_name,username,avatar_url,role)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (focusPostId) {
      query = query.eq("id", focusPostId);
    }

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data: posts, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);

    const postIds = (posts ?? []).map((post) => post.id);

    const reportCountMap = new Map<string, number>();
    if (postIds.length > 0) {
      const { data: reports, error: reportsError } = await client
        .from("reports")
        .select("target_id")
        .eq("target_type", "post")
        .in("target_id", postIds);

      if (reportsError) return jsonResponse({ error: reportsError.message }, 500);
      for (const report of reports ?? []) {
        const key = String(report.target_id ?? "");
        if (!key) continue;
        reportCountMap.set(key, (reportCountMap.get(key) ?? 0) + 1);
      }
    }

    const items = (posts ?? [])
      .map((post) => {
        const profile = joinedRecord(post.profiles);
        const circle = joinedRecord(post.circles);
        const media = Array.isArray(post.post_media) ? post.post_media : [];
        const videoCount = media.filter((item) => item.kind === "video").length;
        const mediaCount = media.length;
        const mediaTotalBytes = media.reduce((sum, item) => sum + Number(item.size_bytes ?? 0), 0);

        return {
          id: post.id,
          title: post.title,
          body_excerpt: excerpt(post.body),
          status: post.status,
          author_id: post.author_id,
          author_profile: profile
            ? {
                id: profile.id ?? post.author_id,
                username: profile.username ?? null,
                display_name: profile.display_name ?? null,
                avatar_url: profile.avatar_url ?? null,
                role: profile.role ?? null,
              }
            : null,
          circle_id: post.circle_id,
          circle_name: circle?.name ?? null,
          circle_slug: circle?.slug ?? null,
          created_at: post.created_at,
          updated_at: post.updated_at,
          media_count: mediaCount,
          media_total_bytes: mediaTotalBytes,
          video_count: videoCount,
          report_count: reportCountMap.get(post.id) ?? 0,
        };
      })
      .filter((post) => {
        if (kindFilter === "video") return post.video_count > 0;
        if (kindFilter === "image") return post.media_count > 0 && post.video_count === 0;
        return true;
      });

    return jsonResponse({ posts: items, focused_post_id: focusPostId || null });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const { client, user } = await requireModerator(request, env);
    const consent = await requireAuthenticatedLegalConsent({ identity: { userId: user.id }, repository: createLegalConsentReadRepository(client) });
    if (!consent.ok) return consent.response;
    const payload = (await request.json().catch(() => null)) as
      | { id?: string; action?: "hide" | "restore" }
      | null;

    const postId = String(payload?.id ?? "").trim();
    const action = payload?.action;
    if (!uuidRegex.test(postId)) return jsonResponse({ error: "Invalid post id" }, 400);
    if (action !== "hide" && action !== "restore") {
      return jsonResponse({ error: "Invalid action" }, 400);
    }

    const nextStatus = action === "hide" ? "hidden" : "published";
    const { data: updated, error } = await client
      .from("posts")
      .update({ status: nextStatus })
      .eq("id", postId)
      .select("id,status")
      .single();

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ post: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const { client, user } = await requireModerator(request, env);
    const consent = await requireAuthenticatedLegalConsent({ identity: { userId: user.id }, repository: createLegalConsentReadRepository(client) });
    if (!consent.ok) return consent.response;

    const url = new URL(request.url);
    const postId = String(url.searchParams.get("id") ?? url.searchParams.get("post_id") ?? "").trim();
    if (!uuidRegex.test(postId)) return jsonResponse({ error: "Invalid post_id format" }, 400);

    const { data: post, error: postError } = await client
      .from("posts")
      .select("id,status")
      .eq("id", postId)
      .maybeSingle();
    if (postError) return jsonResponse({ error: postError.message }, 500);
    if (!post) return jsonResponse({ error: "Post not found" }, 404);

    if (post.status !== "deleted") {
      const { data: updated, error: postUpdateError } = await client
        .from("posts")
        .update({ status: "deleted" })
        .eq("id", postId)
        .select("id,status")
        .single();
      if (postUpdateError) {
        return jsonResponse({ error: "POST_DELETE_FAILED", details: postUpdateError.message }, 500);
      }
      post.status = updated.status;
    }

    const { data: mediaRows, error: mediaError } = await client
      .from("post_media")
      .select("id,kind,storage_path,url,thumbnail_url,user_id,post_id")
      .eq("post_id", postId);
    if (mediaError) return jsonResponse({ error: mediaError.message }, 500);

    const cleanup = await deletePostMediaObjects({
      env,
      client,
      mediaRows: mediaRows ?? [],
      deleteRows: true,
    });

    const cleanupPayload = {
      ok: cleanup.ok,
      warningCode: cleanup.ok ? undefined : DELETE_WARNING_CODE,
      warnings: cleanup.warnings,
      errors: cleanup.errors,
      deletedObjects: cleanup.deletedObjects,
      deletedRows: cleanup.deletedRows,
    };

    return jsonResponse({
      ok: true,
      status: "deleted",
      post: { id: postId, status: "deleted" },
      cleanup: cleanupPayload,
      message: cleanup.ok
        ? "已删除并清理媒体"
        : "已删除，部分媒体清理需要后续重试",
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
};

export const ALL: APIRoute = () => jsonResponse({ error: "Method not allowed" }, 405);
