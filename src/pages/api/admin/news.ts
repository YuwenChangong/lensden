import { env as runtimeEnv } from "cloudflare:workers";
import type { APIRoute } from "astro";
import {
  jsonResponse,
  requireModerator,
  type RuntimeEnv,
} from "../../../lib/server/admin-auth";
import { requireAuthenticatedLegalConsent } from "../../../lib/server/legal-consent-mutation.server";
import { createLegalConsentReadRepository } from "../../../lib/server/legal-consent-repository.server";
import {
  buildUniqueNewsSlug,
  getAdminNewsArticleBySlug,
  isValidNewsSlug,
  listAdminNewsArticles,
  normalizeNewsUrl,
  type NewsCategoryKey,
  type NewsStatus,
} from "../../../lib/news";
import { isNewsStoragePath } from "../../../lib/news-media";

export const prerender = false;

type NewsPayload = {
  id?: string;
  slug?: string;
  title?: string;
  summary?: string;
  content?: string;
  cover_image_url?: string | null;
  category?: NewsCategoryKey;
  source_name?: string | null;
  source_url?: string | null;
  status?: NewsStatus;
  pinned?: boolean;
  featured?: boolean;
  published_at?: string | null;
};

const ALLOWED_CATEGORIES = new Set<NewsCategoryKey>([
  "industry",
  "devices",
  "ai_glasses",
  "ar_glasses",
  "developer",
  "community",
  "openglass",
]);

const ALLOWED_STATUSES = new Set<NewsStatus>(["draft", "published", "archived"]);

function coerceUrl(value: unknown): string | null {
  return normalizeNewsUrl(value);
}

function validatePayload(payload: NewsPayload) {
  const title = String(payload.title ?? "").trim();
  const summary = String(payload.summary ?? "").trim();
  const content = String(payload.content ?? "").trim();
  const category = String(payload.category ?? "").trim() as NewsCategoryKey;
  const status = String(payload.status ?? "").trim() as NewsStatus;
  const slug = String(payload.slug ?? "").trim().toLowerCase();

  if (!title || title.length < 4 || title.length > 180) {
    return { ok: false as const, code: "INVALID_TITLE", error: "标题长度需为 4-180 字" };
  }
  if (!ALLOWED_CATEGORIES.has(category)) {
    return { ok: false as const, code: "INVALID_CATEGORY", error: "分类无效" };
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return { ok: false as const, code: "INVALID_STATUS", error: "状态无效" };
  }
  if (summary.length > 280) {
    return { ok: false as const, code: "INVALID_SUMMARY", error: "摘要不能超过 280 字" };
  }
  if (content.length > 50000) {
    return { ok: false as const, code: "INVALID_CONTENT", error: "正文不能超过 50000 字" };
  }

  if (slug && !isValidNewsSlug(slug)) {
    return { ok: false as const, code: "INVALID_SLUG", error: "文章链接只能包含小写字母、数字和连字符" };
  }

  const sourceUrl = payload.source_url ? coerceUrl(payload.source_url) : null;
  if (payload.source_url && !sourceUrl) {
    return { ok: false as const, code: "INVALID_SOURCE_URL", error: "来源链接无效，请粘贴完整链接或域名" };
  }

  const rawCoverImage = String(payload.cover_image_url ?? "").trim();
  const coverImageUrl = rawCoverImage
    ? isNewsStoragePath(rawCoverImage)
      ? rawCoverImage
      : coerceUrl(rawCoverImage)
    : null;
  if (rawCoverImage && !coverImageUrl) {
    return { ok: false as const, code: "INVALID_COVER_URL", error: "封面图链接无效，请使用 http(s) 链接或已上传图片" };
  }

  const publishedAt =
    payload.published_at && String(payload.published_at).trim()
      ? new Date(String(payload.published_at)).toISOString()
      : status === "published"
        ? new Date().toISOString()
        : null;

  return {
    ok: true as const,
    value: {
      slug,
      title,
      summary,
      content,
      category,
      status,
      source_name: String(payload.source_name ?? "").trim() || "Lensden",
      source_url: sourceUrl,
      cover_image_url: coverImageUrl,
      pinned: payload.pinned === true,
      featured: payload.featured === true,
      published_at: publishedAt,
    },
  };
}

function toResponseError(error: unknown) {
  if (error instanceof Response) return error;
  return jsonResponse({ ok: false, code: "SERVER_ERROR", message: "操作失败，请稍后重试。" }, 500);
}

function successMessage(status: NewsStatus, mode: "create" | "update" | "delete") {
  if (mode === "delete") return "已删除";
  if (status === "published") return "已发布";
  if (status === "archived") return "已归档";
  return mode === "create" ? "已保存草稿" : "已保存草稿";
}

function toDatabaseErrorMessage(message: string) {
  const text = message.toLowerCase();
  if (text.includes("duplicate key") && text.includes("slug")) {
    return { code: "NEWS_SLUG_CONFLICT", message: "文章链接已存在，请修改标题后重试。" };
  }
  if (text.includes("duplicate key") && text.includes("title")) {
    return { code: "NEWS_TITLE_CONFLICT", message: "文章标题已存在，请调整后重试。" };
  }
  return { code: "NEWS_WRITE_FAILED", message: "保存资讯失败，请稍后再试。" };
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const auth = await requireModerator(request, env);
    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") ?? "all").trim() as "all" | NewsStatus;
    const category = String(url.searchParams.get("category") ?? "all").trim() as "all" | NewsCategoryKey;
    const search = String(url.searchParams.get("search") ?? "").trim();
    const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "80", 10);
    const slug = String(url.searchParams.get("slug") ?? "").trim();

    if (slug) {
      const article = await getAdminNewsArticleBySlug(auth.client, slug);
      return jsonResponse({ ok: true, article });
    }

    const articles = await listAdminNewsArticles(auth.client, {
      status,
      category,
      search,
      limit: Number.isFinite(limitParam) ? limitParam : 80,
    });

    return jsonResponse({ ok: true, articles });
  } catch (error) {
    return toResponseError(error);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const auth = await requireModerator(request, env);
    const consent = await requireAuthenticatedLegalConsent({ identity: { userId: auth.user.id }, repository: createLegalConsentReadRepository(auth.client) });
    if (!consent.ok) return consent.response;
    const payload = (await request.json().catch(() => null)) as NewsPayload | null;
    if (!payload) return jsonResponse({ ok: false, code: "INVALID_PAYLOAD", message: "请求内容无效。" }, 400);

    const validation = validatePayload(payload);
    if (!validation.ok) return jsonResponse({ ok: false, code: validation.code, message: validation.error }, 400);

    const nextSlug = await buildUniqueNewsSlug(auth.client, {
      title: validation.value.title,
      preferredSlug: validation.value.slug,
    });

    const insertPayload = {
      ...validation.value,
      slug: nextSlug,
      author_id: auth.user.id,
    };

    const result = await auth.client
      .from("news_articles")
      .insert(insertPayload)
      .select("*")
      .single();

    if (result.error) {
      const mapped = toDatabaseErrorMessage(result.error.message);
      return jsonResponse({ ok: false, code: mapped.code, message: mapped.message }, 500);
    }

    return jsonResponse({ ok: true, article: result.data, message: successMessage(insertPayload.status, "create") }, 201);
  } catch (error) {
    return toResponseError(error);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const auth = await requireModerator(request, env);
    const consent = await requireAuthenticatedLegalConsent({ identity: { userId: auth.user.id }, repository: createLegalConsentReadRepository(auth.client) });
    if (!consent.ok) return consent.response;
    const payload = (await request.json().catch(() => null)) as NewsPayload | null;
    if (!payload?.id) return jsonResponse({ ok: false, code: "MISSING_ID", message: "缺少资讯 ID。" }, 400);

    const validation = validatePayload(payload);
    if (!validation.ok) return jsonResponse({ ok: false, code: validation.code, message: validation.error }, 400);

    const nextSlug = await buildUniqueNewsSlug(auth.client, {
      title: validation.value.title,
      preferredSlug: validation.value.slug,
      excludeId: payload.id,
    });

    const result = await auth.client
      .from("news_articles")
      .update({
        ...validation.value,
        slug: nextSlug,
        author_id: auth.user.id,
      })
      .eq("id", payload.id)
      .select("*")
      .single();

    if (result.error) {
      const mapped = toDatabaseErrorMessage(result.error.message);
      return jsonResponse({ ok: false, code: mapped.code, message: mapped.message }, 500);
    }

    return jsonResponse({ ok: true, article: result.data, message: successMessage(validation.value.status, "update") });
  } catch (error) {
    return toResponseError(error);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const env = runtimeEnv;
    if (!env) return jsonResponse({ error: "Runtime environment not available" }, 500);

    const auth = await requireModerator(request, env);
    const consent = await requireAuthenticatedLegalConsent({ identity: { userId: auth.user.id }, repository: createLegalConsentReadRepository(auth.client) });
    if (!consent.ok) return consent.response;
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") ?? "").trim();
    if (!id) return jsonResponse({ ok: false, code: "MISSING_ID", message: "缺少资讯 ID。" }, 400);

    const result = await auth.client
      .from("news_articles")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (result.error) {
      const mapped = toDatabaseErrorMessage(result.error.message);
      return jsonResponse({ ok: false, code: mapped.code, message: mapped.message }, 500);
    }

    return jsonResponse({ ok: true, id: result.data?.id ?? id, message: successMessage("archived", "delete") });
  } catch (error) {
    return toResponseError(error);
  }
};
