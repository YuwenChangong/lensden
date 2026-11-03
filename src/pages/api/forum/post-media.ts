import { env as runtimeEnv } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildModerationProviderInput,
  doesVideoPostRequireThumbnailModeration,
  isOpenAIPostImageModerationEnabled,
  isOpenAIVideoThumbnailModerationEnabled,
  resolveModerationProvider,
  runMockModerationProvider,
} from "../../../lib/moderation/moderation-provider.server";
import { runOpenAIModeration } from "../../../lib/moderation/openai-moderation-provider.server";
import { moderateAsset } from "../../../lib/moderation/moderate-asset.server";
import { createSignedModerationUrls } from "../../../lib/moderation/moderation-media.server";
import { evaluateLocalSensitiveLexicon } from "../../../lib/moderation/local-sensitive-lexicon.server";
import { assertUserCanWrite, getSafetyWriteBlockResponse } from "../../../lib/server/user-safety.server";
import { requireAuthenticatedLegalConsent } from "../../../lib/server/legal-consent-mutation.server";
import { createLegalConsentReadRepository } from "../../../lib/server/legal-consent-repository.server";
import { retainTemporaryR2Video } from "../../../lib/r2-server";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function mapVideoModerationMessage(reason: string | null | undefined) {
  if (!reason) return null;
  if (/openai_video_thumbnail_missing_review|video_thumbnail_required_review/i.test(reason)) {
    return "视频已提交审核。";
  }
  return null;
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

type MediaPayload =
  | {
      kind: "image";
      storage_path: string;
      thumbnail_url?: string | null;
      alt_text?: string;
      sort_order?: number;
      width?: number | null;
      height?: number | null;
      duration_seconds?: number | null;
      size_bytes?: number | null;
      mime_type?: string | null;
      is_cover?: boolean;
    }
  | {
      kind: "video";
      storage_path?: string;
      url?: string;
      thumbnail_url?: string | null;
      alt_text?: string;
      sort_order?: number;
      width?: number | null;
      height?: number | null;
      duration_seconds?: number | null;
      size_bytes?: number | null;
      mime_type?: string | null;
      is_cover?: boolean;
    };

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storagePathRegex = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[^/?#\\%]+$/i;
const tempStoragePathRegex = /^tmp\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[^/?#\\%]+$/i;
const acceptedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function normalizePositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return Number.NaN;
  return parsed;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
  return parsed;
}

function shouldFallbackToLegacyColumns(message: string): boolean {
  return /column .* does not exist/i.test(message) || /schema cache/i.test(message);
}

async function moderatePostMedia(params: {
  client: SupabaseClient;
  env: Record<string, string | undefined>;
  userId: string;
  post: { id: string; title?: string | null; body?: string | null; status?: string | null; moderation_status?: string | null };
  media: MediaPayload[];
}) {
  const { client, env, post, media, userId } = params;
  const provider = resolveModerationProvider(env);
  if (provider !== "openai" && provider !== "mock") {
    return {
      decision: "allow" as const,
      reason: null as string | null,
      score: null as number | null,
      provider: null as string | null,
    };
  }

  const hasVideo = media.some((item) => item.kind === "video");
  const hasImage = media.some((item) => item.kind === "image");
  const reviewIfThumbnailMissing = hasVideo && doesVideoPostRequireThumbnailModeration(env);
  const shouldModerateImages = hasImage && isOpenAIPostImageModerationEnabled(env);
  const shouldModerateVideoThumbs = hasVideo && isOpenAIVideoThumbnailModerationEnabled(env);

  if (reviewIfThumbnailMissing && media.some((item) => item.kind === "video" && !String(item.thumbnail_url ?? "").trim())) {
    return {
      decision: "review" as const,
      reason: "openai_video_thumbnail_missing_review",
      score: 0.57,
      provider: "local+openai",
    };
  }

  const mediaTextParts = media.flatMap((item) => {
    const parts = [];
    const altText = String(item.alt_text ?? "").trim();
    if (altText) parts.push(`Caption: ${altText}`);
    if (item.kind === "video") {
      const externalUrl = String(item.url ?? "").trim();
      if (externalUrl) parts.push(`Video URL: ${externalUrl}`);
    }
    return parts;
  });

  const imageUrlValues = media
    .flatMap((item) => {
      if (item.kind === "image" && shouldModerateImages) {
        return [String(item.storage_path ?? "").trim()];
      }
      if (item.kind === "video" && shouldModerateVideoThumbs) {
        return [String(item.thumbnail_url ?? "").trim()];
      }
      return [];
    })
    .filter(Boolean);

  if (imageUrlValues.length === 0 && mediaTextParts.length === 0) {
    return {
      decision: "allow" as const,
      reason: null as string | null,
      score: null as number | null,
      provider: null as string | null,
    };
  }

  const localMetadataText = mediaTextParts.join("\n").trim();
  if (localMetadataText) {
    const localLexicon = await evaluateLocalSensitiveLexicon(localMetadataText, env);
    if (localLexicon.decision !== "allow") {
      return {
        decision: localLexicon.decision,
        reason: localLexicon.reasonCode,
        score: localLexicon.confidence,
        provider: "local" as const,
      };
    }
  }

  const imageUrls = await createSignedModerationUrls({
    client,
    values: imageUrlValues,
    allowedPrefixes: [`${userId}/${post.id}/`, `tmp/${userId}/`],
    allowAnyStoragePath: false,
    preferDataUrls: true,
  });

  const providerInput = buildModerationProviderInput({
    targetType: hasVideo ? "post_video_metadata" : "post_image",
    title: String(post.title ?? "").trim(),
    body: [String(post.body ?? "").trim(), ...mediaTextParts].filter(Boolean).join("\n"),
    imageUrls,
    localeHint: "zh-CN",
  });

  const result =
    provider === "mock"
      ? await runMockModerationProvider(providerInput)
      : await moderateAsset(env, providerInput, {
          openaiRunner: runOpenAIModeration,
        });

  return {
    decision: result.decision,
    reason: result.reason,
    score: result.score,
    provider: result.provider,
  };
}

export function validateMediaArray(postId: string, userId: string, media: MediaPayload[]): string | null {
  if (!Array.isArray(media) || media.length === 0) {
    return "media is required";
  }
  if (media.length > 6) {
    return "media must contain at most 6 items";
  }

  let coverCount = 0;

  for (const [index, item] of media.entries()) {
    const sortOrder = Number.isFinite(item.sort_order) ? Number(item.sort_order) : index;
    if (sortOrder < 0 || sortOrder > 99) {
      return "sort_order must be between 0 and 99";
    }
    if (typeof item.is_cover !== "undefined" && typeof item.is_cover !== "boolean") {
      return "is_cover must be a boolean";
    }
    if (item.is_cover) {
      coverCount += 1;
    }

    const width = normalizePositiveInteger(item.width);
    const height = normalizePositiveInteger(item.height);
    const durationSeconds = normalizeNonNegativeNumber(item.duration_seconds);
    const sizeBytes = normalizeNonNegativeNumber(item.size_bytes);
    if (Number.isNaN(width) || Number.isNaN(height)) {
      return "width and height must be positive integers";
    }
    if (Number.isNaN(durationSeconds) || Number.isNaN(sizeBytes)) {
      return "duration_seconds and size_bytes must be non-negative numbers";
    }
    if (item.mime_type && !acceptedMimeTypes.has(String(item.mime_type).trim().toLowerCase())) {
      return "Unsupported mime_type";
    }

    if (item.kind === "image") {
      const storagePath = String(item.storage_path ?? "").trim();
      const thumbnailPath = String(item.thumbnail_url ?? "").trim();
      if (!storagePath || !storagePathRegex.test(storagePath)) {
        return "Invalid media storage_path";
      }
      if (!storagePath.startsWith(`${userId}/${postId}/`)) {
        return "Media storage_path must stay inside the current user/post folder";
      }
      if (thumbnailPath) {
        if (!storagePathRegex.test(thumbnailPath)) {
          return "Invalid media thumbnail_url";
        }
        if (!thumbnailPath.startsWith(`${userId}/${postId}/`)) {
          return "Media thumbnail_url must stay inside the current user/post folder";
        }
      }
      if (!item.mime_type) {
        return "mime_type is required for uploaded media";
      }
      continue;
    }

    if (item.kind === "video") {
      const storagePath = String(item.storage_path ?? "").trim();
      const externalUrl = String(item.url ?? "").trim();
      const hasStoragePath = Boolean(storagePath);

      if (!hasStoragePath) {
        return "video requires storage_path";
      }
      if (!storagePathRegex.test(storagePath) && !tempStoragePathRegex.test(storagePath)) {
        return "Invalid media storage_path";
      }
      const isUserPostPath = storagePath.startsWith(`${userId}/${postId}/`);
      const isUserTempPath = storagePath.startsWith(`tmp/${userId}/${postId}/`);
      if (!isUserPostPath && !isUserTempPath) {
        return "Media storage_path must stay inside the current user/post folder";
      }
      if (externalUrl) {
        return "External video urls are not supported";
      }
      if (!item.mime_type) {
        return "mime_type is required for uploaded media";
      }
      continue;
    }

    return "Unsupported media kind";
  }

  if (coverCount > 1) {
    return "Only one media item can be marked as cover";
  }

  return null;
}

const productionDependencies = { createUserClient, assertUserCanWrite, requireAuthenticatedLegalConsent,
  createLegalConsentReadRepository, retainTemporaryR2Video, moderatePostMedia };

export function createPostMediaPost(overrides: Partial<typeof productionDependencies> = {}): APIRoute {
  const { createUserClient, assertUserCanWrite, requireAuthenticatedLegalConsent,
    createLegalConsentReadRepository, retainTemporaryR2Video, moderatePostMedia } = { ...productionDependencies, ...overrides };
  return async ({ request, locals }) => {
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
    const safetyDecision = await assertUserCanWrite(userClient, authData.user.id, "post_media_create");
    if (!safetyDecision.allowed) {
      return getSafetyWriteBlockResponse(safetyDecision);
    }

    const payload = (await request.json().catch(() => null)) as
      | { post_id?: string; media?: MediaPayload[] }
      | null;
    if (!payload) {
      return json({ error: "Invalid JSON payload" }, 400);
    }

    const postId = String(payload.post_id ?? "").trim().toLowerCase();
    if (!uuidRegex.test(postId)) {
      return json({ error: "Invalid post_id format" }, 400);
    }

    const { data: post, error: postError } = await userClient
      .from("posts")
      .select("id, author_id, status, moderation_status, title, body")
      .eq("id", postId)
      .maybeSingle();
    if (postError) {
      return json({ error: postError.message }, 500);
    }
    if (!post) {
      return json({ error: "Post not found" }, 404);
    }
    if (post.author_id !== authData.user.id) {
      return json({ error: "Cannot attach media to a post you do not own" }, 403);
    }
    if (post.status !== "published" && post.status !== "pending") {
      return json({ error: "Post cannot accept media" }, 409);
    }

    const media = payload.media ?? [];
    const validationError = validateMediaArray(postId, authData.user.id, media);
    if (validationError) {
      return json({ error: validationError }, 400);
    }
    if (media.filter((item) => item.kind === "video").length > 1) {
      return json({ error: "Only one video is allowed per post" }, 400);
    }

    for (const item of media) {
      if (item.kind !== "video" || !item.storage_path?.trim().startsWith("tmp/")) continue;
      const { data: existingVideo, error: existingVideoError } = await userClient
        .from("post_media").select("id").eq("post_id", postId).eq("kind", "video").maybeSingle();
      if (existingVideoError) return json({ error: "Media state unavailable" }, 503);
      if (existingVideo) return json({ error: "Post already has a video" }, 409);

      // Only a confirmed NEW committed claim permits this invocation to copy.
      // Conflicts and unknown responses never acquire permission by SELECT/retry.
      const mimeType = item.mime_type!.trim().toLowerCase();
      const { data: claim, error: claimError } = await userClient
        .from("post_media_r2_copy_claims")
        .insert({ post_id: postId, user_id: authData.user.id, mime_type: mimeType })
        .select("post_id,user_id,claim_id,mime_type,retained_key")
        .abortSignal(AbortSignal.timeout(8000)).single();
      if (claimError || !claim) {
        return json({ error: "Copy claim unavailable or already consumed", code: "MEDIA_COPY_CLAIM_UNCONFIRMED" }, 409);
      }
      const extension = ({ "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" } as Record<string, string>)[mimeType];
      const expectedKey = `${authData.user.id}/${postId}/r2-retained-${claim.claim_id}.${extension}`;
      if (claim.post_id !== postId || claim.user_id !== authData.user.id || claim.mime_type !== mimeType ||
        !uuidRegex.test(String(claim.claim_id)) || !extension || claim.retained_key !== expectedKey) {
        return json({ error: "Copy claim identity mismatch" }, 503);
      }
      item.storage_path = await retainTemporaryR2Video({
        env, userId: authData.user.id, postId, sourceKey: item.storage_path.trim(),
        retainedKey: claim.retained_key, mimeType, sizeBytes: normalizeNonNegativeNumber(item.size_bytes),
      });
    }

    const coverIndex = media.findIndex((item) => item.is_cover === true);
    const { error: resetCoverError } = await userClient
      .from("post_media")
      .update({ is_cover: false })
      .eq("post_id", postId)
      .eq("user_id", authData.user.id);

    if (resetCoverError && !shouldFallbackToLegacyColumns(resetCoverError.message)) {
      return json({ error: resetCoverError.message }, 500);
    }

    const rows = media.map((item, index) => ({
      post_id: postId,
      user_id: authData.user.id,
      kind: item.kind,
      url: null,
      storage_path:
        item.kind === "image"
          ? item.storage_path.trim()
          : item.kind === "video" && item.storage_path
            ? item.storage_path.trim()
            : null,
      thumbnail_url: item.thumbnail_url?.trim() || null,
      alt_text: item.alt_text?.trim() || null,
      width: normalizePositiveInteger(item.width),
      height: normalizePositiveInteger(item.height),
      duration_seconds: normalizeNonNegativeNumber(item.duration_seconds),
      size_bytes: normalizeNonNegativeNumber(item.size_bytes),
      mime_type: item.mime_type?.trim().toLowerCase() || null,
      sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : index,
      is_cover: item.is_cover === true || (coverIndex < 0 && index === 0),
    }));

    const mediaModeration = await moderatePostMedia({
      client: userClient,
      env,
      userId: authData.user.id,
      post: post as { id: string; title?: string | null; body?: string | null; status?: string | null; moderation_status?: string | null },
      media,
    });

    // After dispatch, a lost response may hide a committed insert. Retain copies
    // rather than deleting an object that could already have a live DB reference.
    let { data: inserted, error: insertError } = await userClient
      .from("post_media")
      .insert(rows)
      .select("id, post_id, kind, url, storage_path, thumbnail_url, alt_text, width, height, duration_seconds, size_bytes, mime_type, sort_order, is_cover, created_at");

    if (insertError && shouldFallbackToLegacyColumns(insertError.message)) {
      const legacyRows = media.map((item, index) => ({
        post_id: postId,
        user_id: authData.user.id,
        kind: item.kind,
        url: null,
        storage_path:
          item.kind === "image"
            ? item.storage_path.trim()
            : item.kind === "video" && item.storage_path
              ? item.storage_path.trim()
              : null,
        thumbnail_url: item.thumbnail_url?.trim() || null,
        alt_text: item.alt_text?.trim() || null,
        sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : index,
      }));

      const legacyResult = await userClient
        .from("post_media")
        .insert(legacyRows)
        .select("id, post_id, kind, url, storage_path, thumbnail_url, alt_text, sort_order, created_at");

      inserted = legacyResult.data as typeof inserted;
      insertError = legacyResult.error;
    }

    if (insertError) {
      return json({ error: insertError.message }, 500);
    }

    let moderatedPost:
      | {
          id: string;
          status: string;
          moderation_status: string | null;
          moderation_reason?: string | null;
          moderation_provider?: string | null;
        }
      | null = null;

    if (mediaModeration.decision !== "allow") {
      const updatePayload = {
        status: "pending",
        moderation_status: "pending_review",
        moderation_reason: mediaModeration.reason,
        moderation_score: mediaModeration.score,
        moderation_provider: mediaModeration.provider,
        moderated_at: new Date().toISOString(),
        moderated_by: null,
      };

      const { data: updatedPost, error: updateError } = await userClient
        .from("posts")
        .update(updatePayload)
        .eq("id", postId)
        .select("id, status, moderation_status, moderation_reason, moderation_provider")
        .single();

      if (updateError) {
        return json({ error: updateError.message }, 500);
      }
      moderatedPost = updatedPost;
    } else if ((post as { status?: string | null }).status && (post as { moderation_status?: string | null }).moderation_status) {
      moderatedPost = {
        id: postId,
        status: (post as { status?: string | null }).status ?? "published",
        moderation_status: (post as { moderation_status?: string | null }).moderation_status ?? "published",
        moderation_reason: null,
        moderation_provider: null,
      };
    }

    return json(
      {
        media: inserted ?? [],
        post: moderatedPost,
        reason_code: moderatedPost?.moderation_reason ?? mediaModeration.reason ?? null,
        pending_review: moderatedPost?.moderation_status === "pending_review",
        rejected: false,
        message:
          moderatedPost?.moderation_status === "pending_review"
            ? mapVideoModerationMessage(moderatedPost?.moderation_reason ?? mediaModeration.reason)
              ?? "帖子已因媒体审核进入人工审核队列。"
            : "媒体已保存。",
      },
      201,
    );
  } catch (err) {
    const retentionStage = err instanceof Error && err.message === "MEDIA_RETENTION_FAILED"
      && "retentionStage" in err && typeof err.retentionStage === "string"
      && ["source_head", "source_metadata", "copy", "retained_head", "retained_metadata"].includes(err.retentionStage)
      ? err.retentionStage : null;
    return json(
      { error: err instanceof Error ? err.message : "Unexpected server error",
        ...(retentionStage ? { retention_stage: retentionStage } : {}) },
      500,
    );
  }
};
}

export const POST: APIRoute = createPostMediaPost();

export const ALL: APIRoute = () => json({ error: "Method not allowed" }, 405);
