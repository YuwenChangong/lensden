import type { APIRoute } from "astro";
import { env as runtimeEnv } from "cloudflare:workers";
import { createSSRClient, type CloudflareEnv } from "../../../../lib/supabase-server";
import { streamStorageObjectViaSignedUrl, streamTrustedMediaUrl } from "../../../../lib/media-proxy";
import { isPublicVisibleCircle } from "../../../../lib/site-navigation";
import { isR2VideoPath } from "../../../../lib/r2-media-path";

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINALIZED_OBJECT_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9._-]{1,240}$/i;
const TEMPORARY_OBJECT_PATH_PATTERN = /^tmp\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9._-]{1,240}$/i;

type PublicPostMediaRow = {
  id: string;
  post_id: string;
  user_id: string;
  kind: string;
  url?: string | null;
  storage_path?: string | null;
  thumbnail_url?: string | null;
  unavailable_at?: string | null;
  posts?: {
    id?: string | null;
    status?: string | null;
    moderation_status?: string | null;
    circle_id?: string | null;
    circles?: { id?: string | null; slug?: string | null; name?: string | null; status?: string | null } | null;
  } | Array<{
    id?: string | null;
    status?: string | null;
    moderation_status?: string | null;
    circle_id?: string | null;
    circles?: { id?: string | null; slug?: string | null; name?: string | null; status?: string | null } | null;
  }> | null;
};

export function isMediaId(value?: string | null): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isCanonicalPostMediaObjectPath(
  objectPath: string | null | undefined,
  mediaOwnerId: string,
  postId: string,
  allowTemporary: boolean,
): objectPath is string {
  if (!objectPath || !isMediaId(mediaOwnerId) || !isMediaId(postId)) return false;
  if (/[%?#\\]|\/\//.test(objectPath)) return false;
  const normalizedOwnerId = mediaOwnerId.toLowerCase();
  const normalizedPostId = postId.toLowerCase();
  const isFinalized = FINALIZED_OBJECT_PATH_PATTERN.test(objectPath) && objectPath.startsWith(`${normalizedOwnerId}/${normalizedPostId}/`);
  const isTemporary = TEMPORARY_OBJECT_PATH_PATTERN.test(objectPath) && objectPath.startsWith(`tmp/${normalizedOwnerId}/${normalizedPostId}/`);
  return isFinalized || (allowTemporary && isTemporary);
}

function resolveRowPost(row: PublicPostMediaRow) {
  return Array.isArray(row.posts) ? row.posts[0] : row.posts;
}

export async function resolvePublicPostMediaTarget(
  supabase: ReturnType<typeof createSSRClient>,
  mediaId: string,
  variant: "display" | "thumb",
): Promise<{ path: string; delivery: "supabase" | "r2" } | null> {
  const normalizedMediaId = mediaId.trim().toLowerCase();
  if (!isMediaId(normalizedMediaId)) return null;

  const { data, error } = await supabase
    .from("post_media")
    .select("id,post_id,user_id,kind,url,storage_path,thumbnail_url,unavailable_at,posts:post_id(id,status,moderation_status,circle_id,circles:circle_id(id,slug,name,status))")
    .eq("id", normalizedMediaId)
    .maybeSingle();
  const media = data as PublicPostMediaRow | null;
  const post = media ? resolveRowPost(media) : null;
  const circle = post && !Array.isArray(post.circles) ? post.circles : null;

  if (error || !media || media.id !== normalizedMediaId || !isMediaId(media.post_id) || !isMediaId(media.user_id)) return null;
  if (media.unavailable_at) return null;
  if (!post || post.id !== media.post_id || !isMediaId(post.circle_id) || post.status !== "published" || post.moderation_status !== "published") return null;
  if (!circle || circle.id !== post.circle_id || circle.status?.toLowerCase() !== "active" || !isPublicVisibleCircle(circle)) return null;
  if (String(media.url ?? "").trim()) return null;

  const storagePath = String(media.storage_path ?? "").trim();
  const thumbnailPath = String(media.thumbnail_url ?? "").trim();
  if (media.kind !== "image" && media.kind !== "video") return null;
  if (!isCanonicalPostMediaObjectPath(storagePath, media.user_id, media.post_id, media.kind === "video")) return null;
  if (thumbnailPath && !isCanonicalPostMediaObjectPath(thumbnailPath, media.user_id, media.post_id, false)) return null;

  const path = variant === "thumb" && thumbnailPath ? thumbnailPath : storagePath;
  return { path, delivery: media.kind === "video" && path === storagePath && isR2VideoPath(path) ? "r2" : "supabase" };
}

function buildTrustedR2ObjectUrl(baseUrl: string | undefined, objectPath: string): string | null {
  try {
    const base = new URL(String(baseUrl ?? "").trim());
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
    return new URL(objectPath.split("/").map(encodeURIComponent).join("/"), `${base.toString().replace(/\/+$/, "")}/`).toString();
  } catch {
    return null;
  }
}

type PostMediaDeliveryDependencies = {
  createSSRClient: typeof createSSRClient;
  streamStorageObjectViaSignedUrl: typeof streamStorageObjectViaSignedUrl;
  streamTrustedMediaUrl: typeof streamTrustedMediaUrl;
};

const productionDependencies: PostMediaDeliveryDependencies = {
  createSSRClient,
  streamStorageObjectViaSignedUrl,
  streamTrustedMediaUrl,
};

export function createPostMediaGet(dependencies: PostMediaDeliveryDependencies = productionDependencies): APIRoute {
  return async ({ params, request, locals }) => {
  const mediaId = String(params.mediaId ?? "").trim().toLowerCase();
  if (!isMediaId(mediaId)) return json({ error: "MEDIA_NOT_FOUND" }, 404);

  const env = runtimeEnv as CloudflareEnv & { R2_PUBLIC_BASE_URL?: string };
  const supabase = dependencies.createSSRClient(env);
  const variant = new URL(request.url).searchParams.get("variant") === "thumb" ? "thumb" : "display";
  const target = await resolvePublicPostMediaTarget(supabase, mediaId, variant);
  if (!target) return json({ error: "MEDIA_NOT_FOUND" }, 404);

  if (target.delivery === "r2") {
    const trustedUrl = buildTrustedR2ObjectUrl(env.R2_PUBLIC_BASE_URL, target.path);
    if (!trustedUrl) return json({ error: "MEDIA_NOT_FOUND" }, 404);
    return dependencies.streamTrustedMediaUrl({ url: trustedUrl, cacheSeconds: 300 });
  }

  return dependencies.streamStorageObjectViaSignedUrl({ client: supabase, path: target.path, cacheSeconds: 300 });
};
}

export const GET: APIRoute = createPostMediaGet();

export const ALL: APIRoute = () => json({ error: "Method not allowed" }, 405);
