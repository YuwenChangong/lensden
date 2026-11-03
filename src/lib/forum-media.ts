import type { SupabaseClient } from "@supabase/supabase-js";
import { isR2VideoPath } from "./r2-media-path";

export type PostMediaKind = "image" | "video" | "video_link";

export interface PostMediaRow {
  id: string;
  post_id?: string | null;
  kind: PostMediaKind;
  url?: string | null;
  storage_path?: string | null;
  thumbnail_url?: string | null;
  alt_text?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  size_bytes?: number | null;
  mime_type?: string | null;
  sort_order?: number | null;
  is_cover?: boolean | null;
  created_at?: string | null;
  unavailable_at?: string | null;
}

export interface ResolvedPostMedia extends PostMediaRow {
  displayUrl: string;
  previewUrl: string;
}

type PostWithMedia = {
  id: string;
  post_media?: PostMediaRow[] | null;
};

const signedPostMediaCache = new WeakMap<SupabaseClient, Map<string, Promise<string>>>();

export function buildPublicPostMediaProxyUrl(mediaId: string, variant: "display" | "thumb" = "display") {
  const suffix = variant === "thumb" ? "?variant=thumb" : "";
  return `/api/media/post/${encodeURIComponent(mediaId)}${suffix}`;
}

function sortMediaRows<T extends PostMediaRow>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftCover = left.is_cover ? 1 : 0;
    const rightCover = right.is_cover ? 1 : 0;
    if (leftCover !== rightCover) return rightCover - leftCover;
    const leftOrder = Number.isFinite(left.sort_order) ? Number(left.sort_order) : 0;
    const rightOrder = Number.isFinite(right.sort_order) ? Number(right.sort_order) : 0;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    const leftCreated = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightCreated = right.created_at ? new Date(right.created_at).getTime() : 0;
    return leftCreated - rightCreated;
  });
}

function buildPublicR2Url(baseUrl: string, storagePath: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = storagePath.replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
}

function getSignedMediaCache(client: SupabaseClient) {
  let cache = signedPostMediaCache.get(client);
  if (!cache) {
    cache = new Map<string, Promise<string>>();
    signedPostMediaCache.set(client, cache);
  }
  return cache;
}

export async function resolveSignedPostMedia(
  supabase: SupabaseClient,
  mediaRows: PostMediaRow[],
  expiresIn = 60 * 60,
  r2PublicBaseUrl?: string,
  options?: { publicProxy?: boolean },
): Promise<ResolvedPostMedia[]> {
  const sortedRows = sortMediaRows(mediaRows);
  const isR2Media = (item: PostMediaRow) =>
    Boolean(item.kind === "video" && item.storage_path && isR2VideoPath(item.storage_path));
  const cache = getSignedMediaCache(supabase);
  const storagePaths = options?.publicProxy
    ? []
    : [...new Set(
        sortedRows
          .flatMap((item) => {
            if (item.unavailable_at) return [];
            const values: string[] = [];
            if ((item.kind === "image" || item.kind === "video") && item.storage_path && !isR2Media(item)) {
              values.push(item.storage_path);
            }
            if (item.thumbnail_url && !/^https?:\/\//i.test(item.thumbnail_url) && !item.thumbnail_url.startsWith("tmp/")) {
              values.push(item.thumbnail_url);
            }
            return values;
          })
          .filter(Boolean),
      )];

  const uncachedPaths = storagePaths.filter((path) => !cache.has(`${expiresIn}:${path}`));
  if (uncachedPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("post-media").createSignedUrls(uncachedPaths, expiresIn);
    uncachedPaths.forEach((path, index) => {
      cache.set(`${expiresIn}:${path}`, Promise.resolve(signedUrls?.[index]?.signedUrl ?? ""));
    });
  }

  const resolvePath = (path: string | null | undefined) => {
    const normalizedPath = String(path ?? "").trim();
    if (!normalizedPath) return Promise.resolve("");
    if (/^https?:\/\//i.test(normalizedPath)) return Promise.resolve(normalizedPath);
    if (isR2VideoPath(normalizedPath)) {
      return Promise.resolve(r2PublicBaseUrl ? buildPublicR2Url(r2PublicBaseUrl, normalizedPath) : "");
    }
    return cache.get(`${expiresIn}:${normalizedPath}`) ?? Promise.resolve("");
  };

  return Promise.all(sortedRows.map(async (item) => {
    if (item.unavailable_at) return { ...item, displayUrl: "", previewUrl: "" };
    const isR2 = isR2Media(item);
    const fallbackExternalUrl =
      r2PublicBaseUrl && item.storage_path && isR2
        ? buildPublicR2Url(r2PublicBaseUrl, item.storage_path)
        : "";
    const publicDisplayUrl =
      options?.publicProxy && item.id
        ? buildPublicPostMediaProxyUrl(item.id, "display")
        : "";
    const publicPreviewUrl =
      options?.publicProxy && item.id && item.thumbnail_url
        ? buildPublicPostMediaProxyUrl(item.id, "thumb")
        : "";
    const signedUrl = publicDisplayUrl
      ? publicDisplayUrl
      : isR2
        ? fallbackExternalUrl || item.url?.trim() || ""
      : item.storage_path && (item.kind === "image" || item.kind === "video")
        ? (await resolvePath(item.storage_path)) || fallbackExternalUrl || item.url?.trim() || ""
        : item.url?.trim() ?? "";
    const thumbnailUrl = publicPreviewUrl || (item.thumbnail_url?.trim()
      ? await resolvePath(item.thumbnail_url)
      : "");

    return {
      ...item,
      displayUrl: signedUrl,
      previewUrl: thumbnailUrl || signedUrl,
    };
  }));
}

export async function buildResolvedPostMediaMap(
  supabase: SupabaseClient,
  posts: PostWithMedia[],
  expiresIn = 60 * 60,
  r2PublicBaseUrl?: string,
  options?: { publicProxy?: boolean },
): Promise<Map<string, ResolvedPostMedia[]>> {
  const flattened = posts.flatMap((post) =>
    (post.post_media ?? []).map((item) => ({
      ...item,
      post_id: post.id,
    })),
  );

  const resolvedMedia = await resolveSignedPostMedia(
    supabase,
    flattened,
    expiresIn,
    r2PublicBaseUrl,
    options,
  );
  const mediaMap = new Map<string, ResolvedPostMedia[]>();

  for (const item of resolvedMedia) {
    const postId = item.post_id;
    if (!postId) continue;
    const current = mediaMap.get(postId) ?? [];
    current.push(item);
    mediaMap.set(postId, current);
  }

  for (const [postId, items] of mediaMap.entries()) {
    mediaMap.set(postId, sortMediaRows(items));
  }

  return mediaMap;
}
