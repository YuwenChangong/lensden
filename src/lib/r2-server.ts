import { S3Client, PutObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AwsClient } from "aws4fetch";
import { isRetainedR2VideoPath } from "./r2-media-path";

function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export function normalizeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createR2Client(env: Record<string, string | undefined>): S3Client {
  const accountId = requireEnv(env, "R2_ACCOUNT_ID");
  const accessKeyId = requireEnv(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv(env, "R2_SECRET_ACCESS_KEY");
  return new S3Client({
    region: "auto",
    maxAttempts: 1,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function getR2BucketName(env: Record<string, string | undefined>): string {
  return requireEnv(env, "R2_BUCKET_NAME");
}

function requireCanonicalUuidSegment(value: string, label: string): string {
  const normalized = String(value).trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error(`Invalid ${label} for temporary media key`);
  }
  return normalized;
}

export function buildTmpVideoKey(userId: string, postId: string, fileName: string): string {
  const actorId = requireCanonicalUuidSegment(userId, "user id");
  const targetPostId = requireCanonicalUuidSegment(postId, "post id");
  const safeName = normalizeFileName(fileName) || "video.mp4";
  return `tmp/${actorId}/${targetPostId}/${crypto.randomUUID()}-${safeName}`;
}

export async function discardUnboundR2Video(
  env: Record<string, string | undefined>,
  objectKey: string,
  client?: Pick<S3Client, "send">,
): Promise<boolean> {
  if (!isRetainedR2VideoPath(objectKey)) return false;
  try {
    await (client ?? createR2Client(env)).send(new DeleteObjectCommand({
      Bucket: getR2BucketName(env), Key: objectKey,
    }), { abortSignal: AbortSignal.timeout(2000) });
    return true;
  } catch { return false; }
}

export async function retainTemporaryR2Video(params: {
  env: Record<string, string | undefined>;
  userId: string;
  postId: string;
  sourceKey: string;
  retainedKey: string;
  mimeType: string;
  sizeBytes: number | null;
}, client?: Pick<S3Client, "send">): Promise<string> {
  const { env, sourceKey, mimeType, sizeBytes } = params;
  const owner = requireCanonicalUuidSegment(params.userId, "user id");
  const post = requireCanonicalUuidSegment(params.postId, "post id");
  const prefix = `tmp/${owner}/${post}/`;
  const name = sourceKey.slice(prefix.length);
  const extension = ({ "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" } as Record<string, string>)[mimeType];
  if (!sourceKey.startsWith(prefix) || !/^[a-z0-9._-]{1,240}$/i.test(name) || [".", ".."].includes(name) || !extension) {
    throw new Error("MEDIA_RETENTION_INVALID_SOURCE");
  }
  const target = params.retainedKey;
  if (!isRetainedR2VideoPath(target) || !target.startsWith(`${owner}/${post}/`) || !target.endsWith(`.${extension}`)) {
    throw new Error("MEDIA_RETENTION_INVALID_DESTINATION");
  }
  const storage = client ?? createR2Client(env);
  const bucket = getR2BucketName(env);
  const options = { abortSignal: AbortSignal.timeout(15000) };
  let stage = "source_head";
  try {
    const source = await storage.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey }), options);
    stage = "source_metadata";
    if (!source.ETag || !Number.isSafeInteger(source.ContentLength) || !source.ContentLength || source.ContentLength <= 0 || source.ContentLength > 150 * 1024 * 1024 ||
      source.ContentType !== mimeType || (sizeBytes !== null && source.ContentLength !== sizeBytes)) throw new Error();
    stage = "copy";
    const copied = await storage.send(new CopyObjectCommand({
      Bucket: bucket, Key: target,
      CopySource: [bucket, ...sourceKey.split("/")].map(encodeURIComponent).join("/"),
      CopySourceIfMatch: source.ETag, MetadataDirective: "COPY",
    }), options);
    stage = "retained_head";
    const result = await storage.send(new HeadObjectCommand({ Bucket: bucket, Key: target }), options);
    stage = "retained_metadata";
    if (!copied.CopyObjectResult?.ETag || result.ETag !== copied.CopyObjectResult.ETag ||
      result.ContentLength !== source.ContentLength || result.ContentType !== source.ContentType) throw new Error();
    return target;
  } catch {
    // A dispatched copy may finish after a lost reply/abort. Keep its claim and
    // destination for reconciliation; neither retry nor deletion is safe here.
    // Only our fixed stage label crosses the API boundary, never provider errors.
    throw Object.assign(new Error("MEDIA_RETENTION_FAILED"), { retentionStage: stage });
  }
}

export async function signR2PutUrl(params: {
  env: Record<string, string | undefined>;
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { env, objectKey, contentType, expiresInSeconds = 15 * 60 } = params;
  const client = createR2Client(env);
  const bucketName = getR2BucketName(env);
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export function buildR2PublicUrl(env: Record<string, string | undefined>, objectKey: string): string {
  const base = requireEnv(env, "R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
  return `${base}/${objectKey}`;
}

export type R2DeleteObjectResult = {
  ok: boolean;
  httpStatus?: number;
  body?: string;
  code?: string;
  error?: string;
};

function buildR2ObjectDeleteUrl(env: Record<string, string | undefined>, objectKey: string): string {
  const accountId = requireEnv(env, "R2_ACCOUNT_ID");
  const bucketName = getR2BucketName(env);
  const normalizedKey = objectKey.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${normalizedKey}`;
}

function extractXmlTagValue(xml: string, tagName: string): string {
  const match = xml.match(new RegExp(`<${tagName}>([^<]+)</${tagName}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

export async function deleteR2Object(params: {
  env: Record<string, string | undefined>;
  objectKey: string;
}): Promise<R2DeleteObjectResult> {
  const { env, objectKey } = params;
  const missingEnv = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"].filter(
    (key) => !String(env[key] ?? "").trim(),
  );

  if (missingEnv.length > 0) {
    return {
      ok: false,
      error: `R2 delete skipped: missing R2 env ${missingEnv.join(", ")}`,
    };
  }

  try {
    const client = new AwsClient({
      accessKeyId: requireEnv(env, "R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv(env, "R2_SECRET_ACCESS_KEY"),
      service: "s3",
      region: "auto",
    });
    const response = await client.fetch(buildR2ObjectDeleteUrl(env, objectKey), {
      method: "DELETE",
    });
    const body = (await response.text().catch(() => "")).trim();

    if (response.status === 200 || response.status === 204) {
      return { ok: true, httpStatus: response.status, body };
    }

    const code = extractXmlTagValue(body, "Code");
    if (response.status === 404 || code === "NoSuchKey") {
      return {
        ok: true,
        httpStatus: response.status,
        body,
        code: code || "NoSuchKey",
      };
    }

    return {
      ok: false,
      httpStatus: response.status,
      body,
      code,
      error: `R2 delete failed: HTTP ${response.status}${body ? ` ${body}` : ""}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown R2 delete error",
    };
  }
}
