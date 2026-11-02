import { env as runtimeEnv } from "cloudflare:workers";
import { joinedRecord } from "../../../../lib/server/joined-record";
import type { APIRoute } from "astro";
import { buildUniqueCircleSlug, slugifyCircleName } from "../../../../lib/circle-slug";
import { buildCircleCoverUrlMap, CIRCLE_COVER_PREFIX, resolveCircleCoverUrl } from "../../../../lib/circle-cover";
import { moderateAsset } from "../../../../lib/moderation/moderate-asset.server";
import {
  isLocalDegradedModerationResult,
  isProviderErrorModerationResult,
  moderateContent,
} from "../../../../lib/moderation/moderate-content.server";
import { createSignedModerationUrls, removeStoragePathIfAllowed } from "../../../../lib/moderation/moderation-media.server";
import { buildModerationProviderInput, isOpenAICircleCoverModerationEnabled } from "../../../../lib/moderation/moderation-provider.server";
import { jsonResponse, requireAdmin, requireModerator, type RuntimeEnv } from "../../../../lib/server/admin-auth";
import { requireAuthenticatedLegalConsent } from "../../../../lib/server/legal-consent-mutation.server";
import { createLegalConsentReadRepository } from "../../../../lib/server/legal-consent-repository.server";

export const prerender = false;

type RuntimeLocals = { runtime?: { env?: RuntimeEnv } };

function isMissingCircleStatusError(message: string) {
  return /status/i.test(message) && /does not exist/i.test(message);
}

function isCircleSlugConstraintError(message: string) {
  return /circles_slug_check/i.test(message);
}

function validateType(type: string) {
  return ["topic", "device", "project"].includes(type);
}

function validateDescription(description: string) {
  return description.length <= 200;
}

async function moderateCircleCoverImage(params: {
  client: Awaited<ReturnType<typeof requireModerator>>["client"];
  env: RuntimeEnv;
  imagePath: string | null;
}) {
  if (!params.imagePath || !isOpenAICircleCoverModerationEnabled(params.env)) {
    return { decision: "allow" as const, reason: null as string | null };
  }

  const imageUrls = await createSignedModerationUrls({
    client: params.client,
    values: [params.imagePath],
    allowedPrefixes: [CIRCLE_COVER_PREFIX],
    preferDataUrls: true,
  });

  return moderateAsset(
    params.env,
    buildModerationProviderInput({
      targetType: "circle_cover_image",
      imageUrls,
      localeHint: "zh-CN",
    }),
  );
}

async function checkDuplicates(
  client: Awaited<ReturnType<typeof requireModerator>>["client"],
  params: { name?: string; excludeId?: string },
) {
  const { name, excludeId } = params;

  if (name) {
    let query = client.from("circles").select("id,name").ilike("name", name).limit(8);
    if (excludeId) query = query.neq("id", excludeId);
    const { data, error } = await query;
    if (error) return { error: error.message };
    if ((data ?? []).some((circle) => String(circle.name ?? "").trim().toLowerCase() === name.toLowerCase())) {
      return { error: "CIRCLE_NAME_ALREADY_EXISTS", status: 409 };
    }
  }

  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const { client } = await requireAdmin(request, env);
    const selectWithStatus =
      "id,slug,name,description,type,status,created_at,updated_at,image_path,owner_id,profiles:owner_id(id,username,display_name,avatar_url,role)";
    const selectWithoutStatus =
      "id,slug,name,description,type,created_at,updated_at,image_path,owner_id,profiles:owner_id(id,username,display_name,avatar_url,role)";

    let { data: circles, error } = await client
      .from("circles")
      .select(selectWithStatus)
      .order("created_at", { ascending: false });

    if (error && isMissingCircleStatusError(error.message)) {
      const fallback = await client
        .from("circles")
        .select(selectWithoutStatus)
        .order("created_at", { ascending: false });
      circles = fallback.data?.map(circle => ({ ...circle, status: undefined })) ?? null;
      error = fallback.error;
    }

    if (error) return jsonResponse({ error: error.message }, 500);

    const circleIds = (circles ?? []).map((circle) => circle.id);
    const { data: posts, error: postsError } = circleIds.length
      ? await client.from("posts").select("id,circle_id").in("circle_id", circleIds)
      : { data: [], error: null };
    if (postsError) return jsonResponse({ error: postsError.message }, 500);

    const postCountMap = new Map<string, number>();
    const postIds: string[] = [];
    for (const post of posts ?? []) {
      postIds.push(post.id);
      postCountMap.set(post.circle_id, (postCountMap.get(post.circle_id) ?? 0) + 1);
    }

    const { data: comments, error: commentsError } = postIds.length
      ? await client.from("comments").select("id,post_id").in("post_id", postIds)
      : { data: [], error: null };
    if (commentsError) return jsonResponse({ error: commentsError.message }, 500);

    const postToCircleMap = new Map((posts ?? []).map((post) => [post.id, post.circle_id]));
    const commentCountMap = new Map<string, number>();
    for (const comment of comments ?? []) {
      const circleId = postToCircleMap.get(comment.post_id);
      if (!circleId) continue;
      commentCountMap.set(circleId, (commentCountMap.get(circleId) ?? 0) + 1);
    }

    const coverUrlMap = await buildCircleCoverUrlMap(
      client,
      (circles ?? []).map((circle) => ({ id: circle.id, image_path: circle.image_path ?? null })),
    );

    return jsonResponse({
      circles: (circles ?? []).map((circle) => {
        const profile = joinedRecord(circle.profiles);
        return {
          id: circle.id,
          slug: circle.slug,
          name: circle.name,
          description: circle.description ?? "",
          type: circle.type,
          status: "status" in circle ? circle.status ?? "active" : "active",
          created_at: circle.created_at,
          updated_at: circle.updated_at,
          image_path: circle.image_path ?? null,
          cover_url: coverUrlMap.get(circle.id) ?? null,
          owner_id: circle.owner_id ?? null,
          post_count: postCountMap.get(circle.id) ?? 0,
          comment_count: commentCountMap.get(circle.id) ?? 0,
          owner_profile: profile
            ? {
                id: profile.id ?? circle.owner_id ?? null,
                username: profile.username ?? null,
                display_name: profile.display_name ?? null,
                avatar_url: profile.avatar_url ?? null,
                role: profile.role ?? null,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const auth = await requireModerator(request, env);
    const consent = await requireAuthenticatedLegalConsent({ identity: { userId: auth.user.id }, repository: createLegalConsentReadRepository(auth.client) });
    if (!consent.ok) return consent.response;
    const payload = (await request.json().catch(() => null)) as
      | { name?: string; slug?: string; description?: string | null; type?: string; image_path?: string | null; owner_id?: string | null }
      | null;

    if (!payload) return jsonResponse({ error: "Invalid JSON payload" }, 400);

    const name = String(payload.name ?? "").trim();
    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    const type = String(payload.type ?? "").trim();
    const imagePath = typeof payload.image_path === "string" ? payload.image_path.trim() : null;
    const ownerId = typeof payload.owner_id === "string" && payload.owner_id.trim() ? payload.owner_id.trim() : auth.user.id;

    if (name.length < 2 || name.length > 40) return jsonResponse({ error: "Circle name must be 2-40 characters" }, 400);
    if (!validateDescription(description)) return jsonResponse({ error: "Circle description must be <=200 characters" }, 400);
    if (!validateType(type)) return jsonResponse({ error: "Invalid circle type" }, 400);
    if (imagePath && imagePath.length > 500) return jsonResponse({ error: "Circle image path is too long" }, 400);

    const duplicate = await checkDuplicates(auth.client, { name });
    if (duplicate) return jsonResponse({ error: duplicate.error }, duplicate.status ?? 500);

    const textModeration = await moderateContent(env, {
      contentType: description ? "circle_description" : "circle_name",
      userId: auth.user.id,
      text: [name, description].filter(Boolean).join("\n\n"),
      localInputs: [
        { contentType: "circle_name", text: name },
        ...(description ? [{ contentType: "circle_description" as const, text: description }] : []),
      ],
      providerInput: {
        targetType: "circle_text",
        title: name,
        description,
        localeHint: "zh-CN",
      },
    });
    if (textModeration.decision !== "allow") {
      const unavailable = textModeration.decision === "review" && isProviderErrorModerationResult(textModeration);
      return jsonResponse({ error: unavailable ? "MODERATION_TEMPORARILY_UNAVAILABLE" : "CONTENT_REJECTED" }, unavailable ? 503 : 403);
    }

    if (isLocalDegradedModerationResult(textModeration)) {
      console.warn("[moderation] local-only degraded allow", {
        targetType: "circle_text",
        userId: auth.user.id,
        admin: true,
        name,
        reason: textModeration.reason,
        provider: textModeration.provider,
        status: textModeration.providerDetails?.providerStatus ?? null,
      });
    }

    const coverModeration = await moderateCircleCoverImage({
      client: auth.client,
      env,
      imagePath,
    });
    if (coverModeration.decision !== "allow") {
      await removeStoragePathIfAllowed({
        client: auth.client,
        value: imagePath,
        allowedPrefixes: [CIRCLE_COVER_PREFIX],
        logLabel: "admin-circle-cover-moderation",
      });
      return jsonResponse({ error: "CONTENT_REJECTED" }, coverModeration.reason?.startsWith("openai_provider_error_") ? 503 : 403);
    }

    const slugBase = slugifyCircleName(name);

    async function insertCircleWithSlug(slug: string) {
      return auth.client
        .from("circles")
        .insert({
          name,
          slug,
          description: description || null,
          type,
          image_path: imagePath,
          owner_id: ownerId,
        })
        .select("id,slug,name,description,type,created_at,updated_at,image_path,owner_id")
        .single();
    }

    let generatedSlug = await buildUniqueCircleSlug(auth.client, name);
    let { data, error } = await insertCircleWithSlug(generatedSlug);

    if (error && /circles_slug_key|duplicate key value/i.test(error.message) && /slug/i.test(error.message)) {
      generatedSlug = await buildUniqueCircleSlug(auth.client, `${slugBase}-${Date.now()}`);
      const retry = await insertCircleWithSlug(generatedSlug);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (/circles_name_lower_unique|duplicate key value/i.test(error.message) && /name/i.test(error.message)) {
        return jsonResponse({ error: "CIRCLE_NAME_ALREADY_EXISTS" }, 409);
      }
      if (/circles_slug_key|duplicate key value/i.test(error.message) && /slug/i.test(error.message)) {
        return jsonResponse({ error: "Circle slug generation conflict persisted after retry." }, 500);
      }
      if (isCircleSlugConstraintError(error.message)) {
        return jsonResponse({ error: "INVALID_GENERATED_CIRCLE_SLUG", details: error.message }, 500);
      }
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({
      circle: data
        ? {
            ...data,
            cover_url: await resolveCircleCoverUrl(auth.client, data.image_path ?? null),
          }
        : data,
    }, 201);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const auth = await requireModerator(request, env);
    const consent = await requireAuthenticatedLegalConsent({ identity: { userId: auth.user.id }, repository: createLegalConsentReadRepository(auth.client) });
    if (!consent.ok) return consent.response;
    const payload = (await request.json().catch(() => null)) as
      | { id?: string; name?: string; description?: string | null; type?: string; image_path?: string | null; status?: string }
      | null;

    const id = String(payload?.id ?? "").trim();
    if (!id) return jsonResponse({ error: "Missing circle id" }, 400);

    const updates: Record<string, string | null> = {};
    if (payload && "name" in payload) {
      const name = String(payload.name ?? "").trim();
      if (name.length < 2 || name.length > 40) return jsonResponse({ error: "Circle name must be 2-40 characters" }, 400);
      const duplicate = await checkDuplicates(auth.client, { name, excludeId: id });
      if (duplicate) return jsonResponse({ error: duplicate.error }, duplicate.status ?? 500);
      updates.name = name;
    }
    if (payload && "description" in payload) {
      const description = typeof payload.description === "string" ? payload.description.trim() : "";
      if (!validateDescription(description)) return jsonResponse({ error: "Circle description must be <=200 characters" }, 400);
      updates.description = description || null;
    }
    if (payload && "type" in payload) {
      const type = String(payload.type ?? "").trim();
      if (!validateType(type)) return jsonResponse({ error: "Invalid circle type" }, 400);
      updates.type = type;
    }
    if (payload && "image_path" in payload) {
      const imagePath = typeof payload.image_path === "string" ? payload.image_path.trim() : null;
      if (imagePath && imagePath.length > 500) return jsonResponse({ error: "Circle image path is too long" }, 400);
      updates.image_path = imagePath;
    }
    if (payload && "status" in payload) {
      const status = String(payload.status ?? "").trim();
      if (!["active", "hidden", "deleted"].includes(status)) return jsonResponse({ error: "Invalid circle status" }, 400);
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) return jsonResponse({ error: "Nothing to update" }, 400);

    if ("name" in updates || "description" in updates) {
      const textModeration = await moderateContent(env, {
        contentType: typeof updates.description === "string" ? "circle_description" : "circle_name",
        userId: auth.user.id,
        text: [typeof updates.name === "string" ? updates.name : "", typeof updates.description === "string" ? updates.description : ""]
          .filter(Boolean)
          .join("\n\n"),
        localInputs: [
          ...(typeof updates.name === "string" ? [{ contentType: "circle_name" as const, text: updates.name }] : []),
          ...(typeof updates.description === "string"
            ? [{ contentType: "circle_description" as const, text: updates.description }]
            : []),
        ],
        providerInput: {
          targetType: "circle_text",
          title: typeof updates.name === "string" ? updates.name : undefined,
          description: typeof updates.description === "string" ? updates.description : undefined,
          localeHint: "zh-CN",
        },
      });
      if (textModeration.decision !== "allow") {
        const unavailable = textModeration.decision === "review" && isProviderErrorModerationResult(textModeration);
        return jsonResponse({ error: unavailable ? "MODERATION_TEMPORARILY_UNAVAILABLE" : "CONTENT_REJECTED" }, unavailable ? 503 : 403);
      }
    }

    if ("image_path" in updates) {
      const coverModeration = await moderateCircleCoverImage({
        client: auth.client,
        env,
        imagePath: updates.image_path ?? null,
      });
      if (coverModeration.decision !== "allow") {
        await removeStoragePathIfAllowed({
          client: auth.client,
          value: updates.image_path ?? null,
          allowedPrefixes: [CIRCLE_COVER_PREFIX],
          logLabel: "admin-circle-cover-moderation",
        });
        return jsonResponse({ error: "CONTENT_REJECTED" }, coverModeration.reason?.startsWith("openai_provider_error_") ? 503 : 403);
      }
    }

    let { data, error } = await auth.client
      .from("circles")
      .update(updates)
      .eq("id", id)
      .select("id,slug,name,description,type,status,created_at,updated_at,image_path,owner_id")
      .single();

    if (error && isMissingCircleStatusError(error.message) && !("status" in (payload ?? {}))) {
      const fallback = await auth.client
        .from("circles")
        .update(updates)
        .eq("id", id)
        .select("id,slug,name,description,type,created_at,updated_at,image_path,owner_id")
        .single();
      data = fallback.data
        ? {
            ...fallback.data,
            status: "active",
          }
        : null;
      error = fallback.error;
    }

    if (error) {
      if (/circles_name_lower_unique|duplicate key value/i.test(error.message) && /name/i.test(error.message)) {
        return jsonResponse({ error: "CIRCLE_NAME_ALREADY_EXISTS" }, 409);
      }
      if (isMissingCircleStatusError(error.message) && "status" in (payload ?? {})) {
        return jsonResponse({ error: "CIRCLE_STATUS_SCHEMA_NOT_READY", details: error.message }, 503);
      }
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({
      circle: data
        ? {
            ...data,
            cover_url: await resolveCircleCoverUrl(auth.client, data.image_path ?? null),
          }
        : data,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
};

export const ALL: APIRoute = () => jsonResponse({ error: "Method not allowed" }, 405);
