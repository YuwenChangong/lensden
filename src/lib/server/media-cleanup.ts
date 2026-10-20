import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteR2Object } from "../r2-server";
import { isRetainedR2VideoPath } from "../r2-media-path";
import type { RuntimeEnv } from "./admin-auth";

export type PostMediaLike = {
  id: string;
  kind: string;
  storage_path: string | null;
  url: string | null;
  thumbnail_url?: string | null;
  user_id?: string;
  post_id?: string;
};

export type MediaCleanupObjectStatus =
  "deleted" | "already_missing" | "retained_shared" | "skipped" | "failed";
export type MediaCleanupStorage = "r2" | "supabase" | "external" | "unknown";

export type MediaCleanupResult = {
  ok: boolean;
  deletedObjects: Array<{
    mediaId: string;
    storage: MediaCleanupStorage;
    path?: string;
    status: MediaCleanupObjectStatus;
    httpStatus?: number;
    error?: string;
  }>;
  deletedRows: number;
  warnings: string[];
  errors: string[];
};

function nonEmptyMessage(
  message: string | null | undefined,
  fallback: string,
): string {
  const normalized = String(message ?? "").trim();
  return normalized || fallback;
}

function normalizeR2ObjectKey(
  value: string | null | undefined,
  r2PublicBaseUrl?: string,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const stripLeading = (input: string) => input.replace(/^\/+/, "");
  const isLikelyKey = (input: string) =>
    input.startsWith("tmp/") || input.startsWith("posts/") || isRetainedR2VideoPath(input);

  const direct = stripLeading(raw);
  if (isLikelyKey(direct)) return direct;

  const tryFromUrl = (urlString: string): string | null => {
    try {
      const parsed = new URL(urlString);
      const path = stripLeading(parsed.pathname);
      return isLikelyKey(path) ? path : null;
    } catch {
      return null;
    }
  };

  const fromRaw = tryFromUrl(raw);
  if (fromRaw) return fromRaw;

  if (r2PublicBaseUrl) {
    const base = r2PublicBaseUrl.replace(/\/+$/, "");
    if (raw.startsWith(`${base}/`)) {
      const tail = stripLeading(raw.slice(base.length + 1));
      if (isLikelyKey(tail)) return tail;
    }
  }

  return null;
}

function isMissingStorageObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (
    ("status" in error && error.status === 404) ||
    ("statusCode" in error && error.statusCode === "404") ||
    ("code" in error && error.code === "NoSuchKey")
  );
}

function isOwnedPostObject(
  path: string,
  media: PostMediaLike,
  allowTemporary = false,
): boolean {
  // Match the existing upload/delivery contract, never a URL or another post's key.
  const finalPath =
    allowTemporary && path.startsWith("tmp/") ? path.slice(4) : path;
  return Boolean(
    media.user_id &&
    media.post_id &&
    finalPath.startsWith(`${media.user_id}/${media.post_id}/`) &&
    !/\/\.{1,2}$/.test(finalPath) &&
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9._-]{1,240}$/i.test(finalPath),
  );
}

function mergeResults(target: MediaCleanupResult, partial: MediaCleanupResult) {
  target.deletedObjects.push(...partial.deletedObjects);
  target.deletedRows += partial.deletedRows;
  target.warnings.push(...partial.warnings);
  target.errors.push(...partial.errors);
  target.ok = target.ok && partial.ok;
}

function resolveStorageType(
  media: PostMediaLike,
  r2PublicBaseUrl?: string,
): {
  storage: MediaCleanupStorage;
  path?: string;
} {
  const r2Key =
    normalizeR2ObjectKey(media.storage_path, r2PublicBaseUrl) ??
    normalizeR2ObjectKey(media.url, r2PublicBaseUrl);

  if (r2Key) {
    return { storage: "r2", path: r2Key };
  }

  const storagePath = String(media.storage_path ?? "").trim();
  if (storagePath) {
    return { storage: "supabase", path: storagePath };
  }

  const url = String(media.url ?? "").trim();
  if (url) {
    return { storage: "external", path: url };
  }

  return { storage: "unknown" };
}

export async function deleteMediaObject(params: {
  env: RuntimeEnv;
  client: SupabaseClient;
  media: PostMediaLike;
  deletingMediaIds?: readonly string[];
}): Promise<MediaCleanupResult> {
  const { env, client, media, deletingMediaIds = [media.id] } = params;
  const result: MediaCleanupResult = {
    ok: true,
    deletedObjects: [],
    deletedRows: 0,
    warnings: [],
    errors: [],
  };

  const targets = [resolveStorageType(media, env.R2_PUBLIC_BASE_URL)];
  const thumbnail = String(media.thumbnail_url ?? "").trim();
  if (thumbnail && !isOwnedPostObject(thumbnail, media)) {
    result.ok = false;
    result.errors.push(
      `media ${media.id} thumbnail path is not bound to its owner/post`,
    );
    result.deletedObjects.push({
      mediaId: media.id,
      storage: "unknown",
      status: "failed",
    });
    return result;
  }
  if (thumbnail && !targets.some((target) => target.path === thumbnail)) {
    targets.push({ storage: "supabase", path: thumbnail });
  }
  for (const resolved of targets) {
    const entry = {
      mediaId: media.id,
      storage: resolved.storage,
      path: resolved.path,
      status: "skipped" as MediaCleanupObjectStatus,
      httpStatus: undefined as number | undefined,
      error: undefined as string | undefined,
    };

    try {
      if (
        resolved.path &&
        (resolved.storage === "r2" || resolved.storage === "supabase")
      ) {
        if (
          !isOwnedPostObject(resolved.path, media, resolved.storage === "r2")
        ) {
          throw new Error("Media object path is not bound to its owner/post");
        }
        // RLS and canonical post-bound upload keys remain authoritative. Check exact
        // visible references outside this deletion batch before removing a shared key.
        let shared = false;
        for (const column of ["storage_path", "thumbnail_url", "url"]) {
          const value = column === "url" ? media.url : resolved.path;
          if (!value) continue;
          const { data, error } = await client
            .from("post_media")
            .select("id")
            .eq(column, value)
            .not("id", "in", `(${deletingMediaIds.join(",")})`)
            .limit(1);
          if (error) throw new Error("Media reference lookup failed");
          shared ||= Boolean(data?.length);
        }
        if (shared) {
          entry.status = "retained_shared";
          result.warnings.push(
            `media ${media.id} object retained for another media reference`,
          );
          result.deletedObjects.push(entry);
          continue;
        }
      }
      if (resolved.storage === "r2" && resolved.path) {
        const deletion = await deleteR2Object({
          env,
          objectKey: resolved.path,
        });
        entry.httpStatus = deletion.httpStatus;
        if (
          deletion.ok &&
          deletion.httpStatus !== 404 &&
          deletion.code !== "NoSuchKey"
        ) {
          entry.status = "deleted";
        } else if (deletion.ok) {
          entry.status = "already_missing";
          result.warnings.push(
            `media ${media.id} R2 object already missing: ${resolved.path}`,
          );
        } else {
          const message = nonEmptyMessage(
            deletion.error,
            "Unknown R2 delete error",
          );
          entry.status = "failed";
          entry.error = message;
          if (message.startsWith("R2 delete skipped: missing R2 env ")) {
            result.warnings.push(`media ${media.id} ${message}`);
          } else {
            result.errors.push(`media ${media.id} ${message}`);
          }
          result.ok = false;
        }
      } else if (resolved.storage === "supabase" && resolved.path) {
        const bucket = client.storage.from("post-media");
        const { data, error: removeStorageError } = await bucket.remove([
          resolved.path,
        ]);
        if (removeStorageError) {
          const message = nonEmptyMessage(
            removeStorageError.message,
            "Unknown Supabase storage delete error",
          );
          if (isMissingStorageObject(removeStorageError)) {
            entry.status = "already_missing";
            result.warnings.push(
              `media ${media.id} storage object already missing: ${resolved.path}`,
            );
          } else {
            entry.status = "failed";
            entry.error = message;
            result.errors.push(
              `media ${media.id} storage delete failed: ${message}`,
            );
            result.ok = false;
          }
        } else if (data?.some((object) => object.name === resolved.path)) {
          entry.status = "deleted";
        } else {
          // An empty DELETE response is not proof: verify absence for idempotent retry.
          const info = await bucket.info(resolved.path);
          if (isMissingStorageObject(info.error)) {
            entry.status = "already_missing";
          } else {
            entry.status = "failed";
            entry.error = "Storage deletion not confirmed";
            result.errors.push(
              `media ${media.id} storage deletion not confirmed`,
            );
            result.ok = false;
          }
        }
      } else if (resolved.storage === "external") {
        entry.status = "skipped";
        result.warnings.push(
          `media ${media.id} uses external URL; only DB row cleanup is attempted`,
        );
      } else {
        entry.status = "skipped";
        result.warnings.push(`media ${media.id} has no managed storage path`);
        result.ok = false;
      }
    } catch {
      entry.status = "failed";
      entry.error = "Media cleanup operation failed";
      result.errors.push(`media ${media.id} cleanup operation failed`);
      result.ok = false;
    }

    result.deletedObjects.push(entry);
  }
  return result;
}

export async function deletePostMediaObjects(params: {
  env: RuntimeEnv;
  client: SupabaseClient;
  mediaRows: PostMediaLike[];
  deleteRows?: boolean;
}): Promise<MediaCleanupResult> {
  const { env, client, mediaRows, deleteRows = false } = params;
  const result: MediaCleanupResult = {
    ok: true,
    deletedObjects: [],
    deletedRows: 0,
    warnings: [],
    errors: [],
  };

  const completedIds: string[] = [];
  for (const media of mediaRows) {
    const partial = await deleteMediaObject({
      env,
      client,
      media,
      deletingMediaIds: mediaRows.map((row) => row.id),
    });
    mergeResults(result, partial);
    if (partial.ok) completedIds.push(media.id);
  }

  if (deleteRows && completedIds.length > 0) {
    // Keep failed rows (including thumbnail keys) available for an explicit retry.
    const mediaIds = completedIds;
    const { data: deletedRows, error: deleteRowsError } = await client
      .from("post_media")
      .delete()
      .in("id", mediaIds)
      .select("id");

    if (deleteRowsError) {
      const message = nonEmptyMessage(
        deleteRowsError.message,
        "Unknown post_media delete error",
      );
      result.errors.push(`post_media row delete failed: ${message}`);
      result.ok = false;
    } else {
      result.deletedRows = deletedRows?.length ?? 0;
      if (result.deletedRows < mediaIds.length) {
        result.errors.push("post_media row deletion not confirmed");
        result.ok = false;
      }
    }
  }

  return result;
}
