import type { SupabaseClient } from "@supabase/supabase-js";
import { safeCatalogExternalUrl, safeCatalogMediaUrl } from "../product-public-safety.ts";

export const DEVICE_PUBLICATION_STATUSES = ["draft", "published", "hidden", "archived"] as const;
type PublicationStatus = (typeof DEVICE_PUBLICATION_STATUSES)[number];

type JsonObject = Record<string, unknown>;
type DeviceInput = Record<string, unknown>;
type ParseResult<T> = { error: Response } | { value: T };
type DeviceRecord = DeviceInput & { id: string; slug: string; publicationStatus: PublicationStatus; slugLocked: boolean };

const contentFields = [
  "slug", "brandKey", "brandName", "name", "shortDescription", "longDescription", "positioning", "releaseYear", "availability",
  "typeLabel", "statusLabel", "media", "productImageUrl", "officialImageUrl", "imageAlt", "productUrl", "officialProductUrl", "buyUrl",
  "category", "routeLabel", "routeDescription", "bestFor", "notIdealFor", "keyLimitations", "keySpecs", "fullSpecs", "schemaType",
] as const;
const createFields = new Set([...contentFields, "publicationStatus"]);
const updateFields = new Set(["id", ...contentFields, "publicationStatus"]);
const columnByField: Record<(typeof contentFields)[number], string> = {
  slug: "slug", brandKey: "brand_key", brandName: "brand_name", name: "name", shortDescription: "short_description", longDescription: "long_description",
  positioning: "positioning", releaseYear: "release_year", availability: "availability", typeLabel: "type_label", statusLabel: "status_label", media: "media",
  productImageUrl: "product_image_url", officialImageUrl: "official_image_url", imageAlt: "image_alt", productUrl: "product_url",
  officialProductUrl: "official_product_url", buyUrl: "buy_url", category: "category", routeLabel: "route_label", routeDescription: "route_description",
  bestFor: "best_for", notIdealFor: "not_ideal_for", keyLimitations: "key_limitations", keySpecs: "key_specs", fullSpecs: "full_specs", schemaType:"schema_type",
};
const requiredText = ["brandKey", "brandName", "name", "shortDescription", "longDescription", "imageAlt", "category", "routeLabel", "routeDescription"] as const;
const urlFields = ["productImageUrl", "officialImageUrl", "productUrl", "officialProductUrl", "buyUrl"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
function failure(code: string, message: string, status = 400) { return json({ ok: false, code, message }, status); }
function isObject(value: unknown): value is JsonObject { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isStringArray(value: unknown) { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function validUrl(value: unknown) { return value == null || value === "" || safeCatalogExternalUrl(value) !== null; }
function slugify(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

function validateNested(value: DeviceInput) {
  if(value.schemaType!==undefined&&!['display_ar','ai_hud'].includes(String(value.schemaType)))return 'INVALID_SCHEMA_TYPE';
  if (value.media != null && !isObject(value.media)) return "INVALID_MEDIA";
  if (value.keySpecs != null && (!Array.isArray(value.keySpecs) || !value.keySpecs.every((item) => isObject(item) && typeof item.field === "string" && typeof item.label === "string" && typeof item.value === "string"))) return "INVALID_KEY_SPECS";
  if (value.fullSpecs != null && (!isObject(value.fullSpecs) || !Object.values(value.fullSpecs).every((group) => isObject(group) && Object.values(group).every((item) => typeof item === "string")))) return "INVALID_FULL_SPECS";
  for (const field of ["bestFor", "notIdealFor", "keyLimitations"] as const) if (value[field] != null && !isStringArray(value[field])) return "INVALID_ARRAY_FIELD";
  return null;
}

function validateFields(payload: unknown, allowed: Set<string>, mediaPublicBaseUrl?: string): ParseResult<DeviceInput> {
  if (!isObject(payload)) return { error: failure("INVALID_PAYLOAD", "请求内容无效。") } as const;
  const unknown = Object.keys(payload).find((field) => !allowed.has(field));
  if (unknown) return { error: failure("UNKNOWN_FIELD", "请求包含不允许的字段。") } as const;
  const nestedError = validateNested(payload);
  if (nestedError) return { error: failure(nestedError, "设备结构字段无效。") } as const;
  if(payload.brandKey!==undefined&&(typeof payload.brandKey!=="string"||!slugPattern.test(payload.brandKey)))return{error:failure("INVALID_BRAND","品牌代码无效。")}as const;
  for(const field of contentFields.filter(field=>!["media","keySpecs","fullSpecs","bestFor","notIdealFor","keyLimitations"].includes(field))){
    if(payload[field]!=null&&(typeof payload[field]!=="string"||(payload[field] as string).length>(field==="longDescription"?10000:field==="name"?240:4000)))return{error:failure("INVALID_TEXT_FIELD","文本内容格式或长度无效。")}as const;
  }
  for (const field of urlFields) {
    const value=payload[field];
    const valid=["productImageUrl","officialImageUrl"].includes(field)
      ? value==null||value===""||safeCatalogMediaUrl(value,mediaPublicBaseUrl)!==null : validUrl(value);
    if(!valid)return {error:failure("INVALID_URL","链接或图片来源不符合安全规则。") } as const;
  }
  if (isObject(payload.media)) {
    const media=payload.media;
    if(media.imageUrl&&safeCatalogMediaUrl(media.imageUrl,mediaPublicBaseUrl)===null)return {error:failure("INVALID_MEDIA","图片来源不符合安全规则。") } as const;
    if(media.images!==undefined&&(!Array.isArray(media.images)||media.images.length>20||!media.images.every(item=>isObject(item)
      && Object.keys(item).every(key=>["url","altZh","altEn","hero"].includes(key))
      && safeCatalogMediaUrl(item.url,mediaPublicBaseUrl)!==null
      && typeof item.altZh==="string"&&item.altZh.length<=500&&typeof item.altEn==="string"&&item.altEn.length<=500
      && typeof item.hero==="boolean")||media.images.filter(item=>isObject(item)&&item.hero).length>1))return {error:failure("INVALID_MEDIA","图片列表或替代文本无效。") } as const;
  }
  if (payload.releaseYear != null && (typeof payload.releaseYear !== "string" || !/^\d{4}$/.test(payload.releaseYear))) return { error: failure("INVALID_RELEASE_YEAR", "发布日期必须为四位年份。") } as const;
  if (payload.publicationStatus != null && !DEVICE_PUBLICATION_STATUSES.includes(payload.publicationStatus as PublicationStatus)) return { error: failure("INVALID_PUBLICATION_STATUS", "发布状态无效。") } as const;
  if (payload.slug != null && (typeof payload.slug !== "string" || !slugPattern.test(payload.slug))) return { error: failure("INVALID_SLUG", "设备链接只能包含小写字母、数字和连字符。") } as const;
  return { value: payload } as const;
}

function parseCreate(payload: unknown, mediaPublicBaseUrl?: string): ParseResult<DeviceInput> {
  const parsed = validateFields(payload, createFields, mediaPublicBaseUrl); if ("error" in parsed) return parsed;
  const value = { ...parsed.value };
  for (const field of requiredText) if (typeof value[field] !== "string" || !value[field].trim()) return { error: failure("MISSING_REQUIRED_FIELD", "缺少必填设备字段。") } as const;
  if (value.publicationStatus != null && value.publicationStatus !== "draft") return { error: failure("DIRECT_PUBLISH_NOT_ALLOWED", "新设备必须先保存为草稿。") } as const;
  value.slug = typeof value.slug === "string" ? value.slug : slugify(String(value.name));
  if (!slugPattern.test(String(value.slug))) return { error: failure("INVALID_SLUG", "无法从名称生成有效设备链接。") } as const;
  value.publicationStatus = "draft";
  return { value } as const;
}

function parseUpdate(payload: unknown, mediaPublicBaseUrl?: string): ParseResult<{ id: string; changes: DeviceInput }> {
  const parsed = validateFields(payload, updateFields, mediaPublicBaseUrl); if ("error" in parsed) return parsed;
  if (typeof parsed.value.id !== "string" || !uuidPattern.test(parsed.value.id)) return { error: failure("MISSING_ID", "缺少有效设备 ID。") } as const;
  const { id, ...changes } = parsed.value;
  if (!Object.keys(changes).length) return { error: failure("NOTHING_TO_UPDATE", "没有可更新字段。") } as const;
  return { value: { id, changes } } as const;
}

export function toDeviceRow(input: DeviceInput) {
  const row: Record<string, unknown> = {};
  for (const field of contentFields) if (field in input) row[columnByField[field]] = input[field] ?? null;
  if ("publicationStatus" in input) row.publication_status = input.publicationStatus;
  return row;
}
export function fromDeviceRow(row: Record<string, unknown>): DeviceRecord {
  const device: DeviceInput = { id: row.id, publicationStatus: row.publication_status, slugLocked: row.slug_locked, normalizedCatalog: row.catalog_normalized===true, updatedAt:row.updated_at };
  for (const field of contentFields) device[field] = row[columnByField[field]] ?? null;
  return device as DeviceRecord;
}
export function mapDatabaseError(error: unknown) {
  const code = isObject(error) && typeof error.code === "string" ? error.code : "";
  if (code === "23505") return { code: "DEVICE_SLUG_CONFLICT", message: "设备链接已存在，请修改后重试。", status: 409 };
  if (code === "23503") return { code: "DEVICE_REFERENCED", message: "设备仍被引用，无法永久删除。", status: 409 };
  if (code === "23514") return { code: "DEVICE_VALIDATION_FAILED", message: "设备数据不符合保存规则。", status: 400 };
  return { code: "DEVICE_WRITE_FAILED", message: "设备操作失败，请稍后重试。", status: 500 };
}

export function createSupabaseDeviceRepository(client: SupabaseClient) {
  return {
    async list() { const result = await client.from("devices").select("*").order("created_at", { ascending: false }); if (result.error) throw result.error; return (result.data ?? []).map(fromDeviceRow); },
    async create(input: DeviceInput) { const result = await client.from("devices").insert({...toDeviceRow(input),catalog_normalized:true}).select("*").single(); if (result.error) throw result.error; return fromDeviceRow(result.data); },
    async get(id: string) { const result = await client.from("devices").select("*").eq("id", id).maybeSingle(); if (result.error) throw result.error; return result.data ? fromDeviceRow(result.data) : null; },
    async update(id: string, input: DeviceInput) { const result = await client.from("devices").update(toDeviceRow(input)).eq("id", id).select("*").maybeSingle(); if (result.error) throw result.error; return result.data ? fromDeviceRow(result.data) : null; },
    async remove(id: string) { const result = await client.from("devices").delete().eq("id", id).select("*").maybeSingle(); if (result.error) throw result.error; return result.data ? fromDeviceRow(result.data) : null; },
  };
}

type Repository = ReturnType<typeof createSupabaseDeviceRepository>;
type Authorize = (request: Request) => Promise<{ client: SupabaseClient } | Response | null>;
export function createDeviceAdminHandlers({ authorize, repositoryFor, mediaPublicBaseUrl }: { authorize: Authorize; repositoryFor: (client: SupabaseClient) => Repository; mediaPublicBaseUrl?: string }) {
  async function authorized(request: Request) { const auth = await authorize(request); return auth instanceof Response ? auth : auth ? { auth, repository: repositoryFor(auth.client) } : failure("UNAUTHORIZED", "未授权。", 401); }
  return {
    async GET(request: Request) { const access = await authorized(request); if (access instanceof Response) return access; try { return json({ ok: true, devices: await access.repository.list() }); } catch (error) { const mapped = mapDatabaseError(error); return failure(mapped.code, mapped.message, mapped.status); } },
    async POST(request: Request) { const access = await authorized(request); if (access instanceof Response) return access; const parsed = parseCreate(await request.json().catch(() => null),mediaPublicBaseUrl); if ("error" in parsed) return parsed.error; try { return json({ ok: true, device: await access.repository.create(parsed.value) }, 201); } catch (error) { const mapped = mapDatabaseError(error); return failure(mapped.code, mapped.message, mapped.status); } },
    async PATCH(request: Request) { const access = await authorized(request); if (access instanceof Response) return access; const parsed = parseUpdate(await request.json().catch(() => null),mediaPublicBaseUrl); if ("error" in parsed) return parsed.error; try { const current = await access.repository.get(parsed.value.id); if (!current) return failure("DEVICE_NOT_FOUND", "设备不存在。", 404); if (current.slugLocked && parsed.value.changes.slug && parsed.value.changes.slug !== current.slug) return failure("SLUG_LOCKED", "设备首次发布后链接不可修改。"); if (current.slugLocked && parsed.value.changes.brandKey !== undefined && parsed.value.changes.brandKey !== current.brandKey) return failure("BRAND_LOCKED", "设备首次发布后品牌代码不可修改。"); const updated = await access.repository.update(parsed.value.id, parsed.value.changes); return updated ? json({ ok: true, device: updated }) : failure("DEVICE_NOT_FOUND", "设备不存在。", 404); } catch (error) { const mapped = mapDatabaseError(error); return failure(mapped.code, mapped.message, mapped.status); } },
    async DELETE(request: Request) { const access = await authorized(request); if (access instanceof Response) return access; const body = await request.json().catch(() => null); if (!isObject(body) || Object.keys(body).some((field) => field !== "id" && field !== "confirmPermanentDelete")) return failure("UNKNOWN_FIELD", "请求包含不允许的字段。"); if (typeof body.id !== "string" || !uuidPattern.test(body.id)) return failure("MISSING_ID", "缺少有效设备 ID。"); if (body.confirmPermanentDelete !== true) return failure("PERMANENT_DELETE_CONFIRMATION_REQUIRED", "永久删除需要明确确认。"); try { const current = await access.repository.get(body.id); if (!current) return failure("DEVICE_NOT_FOUND", "设备不存在。", 404); if (current.publicationStatus !== "archived") return failure("DEVICE_NOT_ARCHIVED", "只有已归档设备可以永久删除。"); await access.repository.remove(body.id); return json({ ok: true, id: body.id }); } catch (error) { const mapped = mapDatabaseError(error); return failure(mapped.code, mapped.message, mapped.status); } },
  };
}
