import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_EXPIRES_IN = 10 * 60;
const MAX_OPENAI_IMAGE_BYTES = 20 * 1024 * 1024;

function normalizePath(path: string | null | undefined) {
  return String(path ?? "").trim();
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isAllowedStoragePath(path: string, allowedPrefixes: string[]) {
  return allowedPrefixes.some((prefix) => path.startsWith(prefix));
}

function absolutizeSignedUrl(url: string, baseUrl: string) {
  if (isAbsoluteUrl(url)) return url;
  if (!url.startsWith("/")) return url;

  try {
    const base = new URL(baseUrl);
    return new URL(url, `${base.origin}/`).toString();
  } catch {
    return url;
  }
}

function toBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function createImageDataUrl(
  fetchImpl: typeof fetch,
  url: string,
): Promise<string | null> {
  const response = await fetchImpl(url);
  if (!response.ok) return null;

  const contentType = String(response.headers.get("content-type") ?? "").trim().toLowerCase();
  if (!contentType.startsWith("image/")) return null;

  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_OPENAI_IMAGE_BYTES) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength <= 0 || arrayBuffer.byteLength > MAX_OPENAI_IMAGE_BYTES) {
    return null;
  }

  return `data:${contentType};base64,${toBase64(new Uint8Array(arrayBuffer))}`;
}

export async function createSignedModerationUrls(params: {
  client: SupabaseClient;
  bucket?: string;
  values: Array<string | null | undefined>;
  allowedPrefixes: string[];
  expiresIn?: number;
  allowAnyStoragePath?: boolean;
  preferDataUrls?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const bucket = params.bucket ?? "post-media";
  const expiresIn = params.expiresIn ?? DEFAULT_EXPIRES_IN;
  const bucketApi = params.client.storage.from(bucket);
  const absoluteUrls = new Set<string>();
  const storagePaths = new Set<string>();

  for (const rawValue of params.values) {
    const value = normalizePath(rawValue);
    if (!value) continue;
    if (isAbsoluteUrl(value)) {
      absoluteUrls.add(value);
      continue;
    }
    if (!params.allowAnyStoragePath && !isAllowedStoragePath(value, params.allowedPrefixes)) continue;
    storagePaths.add(value);
  }

  if (storagePaths.size === 0) {
    return [...absoluteUrls];
  }

  const { data, error } = await bucketApi.createSignedUrls([...storagePaths], expiresIn);
  if (error) {
    throw new Error(error.message);
  }

  const signed = (data ?? [])
    .map((entry) => {
      const url = entry?.signedUrl ?? "";
      // Current SDK returns absolute signed URLs. Retain relative compatibility
      // using its public, local URL builder; never read protected client state.
      return !url.startsWith("/") ? url : absolutizeSignedUrl(url, bucketApi.getPublicUrl("").data.publicUrl);
    })
    .filter(Boolean);

  if (!params.preferDataUrls) {
    return [...absoluteUrls, ...signed];
  }

  const fetchImpl = params.fetchImpl ?? fetch;
  const resolvedSigned = await Promise.all(
    signed.map(async (url) => (await createImageDataUrl(fetchImpl, url)) ?? url),
  );
  return [...absoluteUrls, ...resolvedSigned];
}

export async function removeStoragePathIfAllowed(params: {
  client: SupabaseClient;
  bucket?: string;
  value: string | null | undefined;
  allowedPrefixes: string[];
  logLabel: string;
}): Promise<void> {
  const bucket = params.bucket ?? "post-media";
  const value = normalizePath(params.value);
  if (!value || isAbsoluteUrl(value) || !isAllowedStoragePath(value, params.allowedPrefixes)) return;

  const { error } = await params.client.storage.from(bucket).remove([value]);
  if (error) {
    console.warn(`[${params.logLabel}] cleanup failed`, {
      message: error.message,
    });
  }
}
