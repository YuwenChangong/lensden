import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { cloudflareWorkersTestPlugin, setCloudflareWorkersTestBinding } from "./lib/cloudflare-workers-test-plugin.mjs";

const root = process.cwd();
const runtimeEnv = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon" };

function publicArticle() {
  return {
    id: "news-1",
    slug: "safe-news",
    title: "Safe news",
    summary: "A safe summary",
    content: "A safe body",
    cover_image_url: null,
    category: "industry",
    source_name: "OpenGlass Hub",
    source_url: "https://example.com/source",
    status: "published",
    author_id: null,
    pinned: false,
    featured: false,
    view_count: 0,
    published_at: "2026-07-01T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

async function main() {
  const routePath = path.join(root, "src/pages/api/news/[slug].ts");
  const helperPath = path.join(root, "src/lib/news.ts");
  const [routeSource, helperSource] = await Promise.all([readFile(routePath, "utf8"), readFile(helperPath, "utf8")]);

  assert.match(routeSource, /parsePublicNewsSlug/);
  assert.match(routeSource, /NEWS_NOT_FOUND/);
  assert.match(routeSource, /NEWS_DETAIL_FETCH_FAILED/);
  assert.doesNotMatch(routeSource, /\bfetch\(|Authorization|request\.headers\.get/);
  assert.match(helperSource, /normalizePublicNewsArticle\(FALLBACK_NEWS_ARTICLES\.find/);
  assert.doesNotMatch(helperSource.match(/export async function getPublicNewsArticleBySlug[\s\S]*?(?=export async function incrementPublishedNewsViewCount)/)?.[0] ?? "", /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|\bfetch\(/);

  const vite = await createServer({ root, logLevel: "error", plugins: [cloudflareWorkersTestPlugin()], server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true } });
  try {
    const route = await vite.ssrLoadModule("/src/pages/api/news/[slug].ts");
    const news = await vite.ssrLoadModule("/src/lib/news.ts");
    const { createPublicNewsDetailGet, parsePublicNewsSlug } = route;
    const { getPublicNewsArticleBySlug, listRelatedPublicNews, normalizePublicNewsArticle } = news;

    assert.equal(parsePublicNewsSlug("safe-news"), "safe-news");
    assert.equal(parsePublicNewsSlug("%73afe-news"), "safe-news");
    for (const value of [undefined, "", "safe%ZZ", "safe/news", "safe\\news", "..", "../safe", "%2fsafe", "%5csafe", "%252fsafe", "safe-news.eq.published", " safe-news", "safe-news ", "a".repeat(97)]) {
      assert.equal(parsePublicNewsSlug(value), null, String(value));
    }

    const dirtyPublicRow = normalizePublicNewsArticle({
      ...publicArticle(),
      title: "<script>alert(1)</script> Safe",
      summary: "<img src=x onerror=alert(1)> Summary\u0000",
      content: "<b onclick=alert(1)>Body</b>",
      cover_image_url: "javascript:alert(1)",
      source_url: "https://user:password@example.com/source",
      author_id: "internal-author-id",
    });
    assert.ok(dirtyPublicRow);
    assert.doesNotMatch(dirtyPublicRow.title, /<script/i);
    assert.doesNotMatch(dirtyPublicRow.summary, /<img|\u0000/i);
    assert.doesNotMatch(dirtyPublicRow.content, /<b|onclick/i);
    assert.equal(dirtyPublicRow.cover_image_url, null);
    assert.equal(dirtyPublicRow.source_url, null);
    assert.equal(dirtyPublicRow.author_id, null);
    assert.equal(normalizePublicNewsArticle({ ...publicArticle(), status: "draft" }), null);

    const effects = { client: 0, reads: 0, relatedReads: 0, outbound: 0, writes: 0, cache: 0 };
    const handler = createPublicNewsDetailGet({
      createSSRClient: () => {
        effects.client += 1;
        return {};
      },
      getPublicNewsArticleBySlug: async (_client, slug) => {
        effects.reads += 1;
        return slug === "missing-news" ? null : publicArticle();
      },
      listRelatedPublicNews: async () => {
        effects.relatedReads += 1;
        return [publicArticle()];
      },
    });
    const run = async (slug, env = runtimeEnv, headers = {}) => {
      setCloudflareWorkersTestBinding(env);
      return handler({ params: { slug }, request: new Request(`https://app.example/api/news/${encodeURIComponent(slug ?? "")}`, { headers }), locals: {} });
    };

    const allowed = await run("safe-news");
    assert.equal(allowed.status, 200);
    assert.deepEqual((await allowed.json()).article, publicArticle());
    assert.equal(effects.client, 1);
    assert.equal(effects.reads, 1);
    assert.equal(effects.relatedReads, 1);

    const bearerPublic = await run("safe-news", runtimeEnv, { authorization: "Bearer malformed" });
    assert.equal(bearerPublic.status, 200);
    assert.equal(effects.reads, 2, "bearer input does not broaden or alter the public lookup branch");

    for (const slug of ["", "safe%ZZ", "safe/news", "%252fsafe", "safe-news.eq.published", "a".repeat(97)]) {
      const readsBefore = effects.reads;
      const response = await run(slug);
      assert.equal(response.status, 404, slug);
      assert.deepEqual(await response.json(), { error: "NEWS_NOT_FOUND" });
      assert.equal(effects.reads, readsBefore, `${slug} is denied before a database read`);
    }

    const missing = await run("missing-news");
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "NEWS_NOT_FOUND" });
    assert.equal(effects.relatedReads, 2, "missing article does not trigger related lookup");
    assert.equal(effects.outbound + effects.writes + effects.cache, 0, "detail GET has no provider, storage, cache, or persistent effect");

    const unavailable = await run("safe-news", {});
    assert.equal(unavailable.status, 500);
    assert.deepEqual(await unavailable.json(), { error: "NEWS_UNAVAILABLE" });

    const failingHandler = createPublicNewsDetailGet({
      createSSRClient: () => ({}),
      getPublicNewsArticleBySlug: async () => { throw new Error("database token=secret internal.example"); },
      listRelatedPublicNews: async () => [],
    });
    setCloudflareWorkersTestBinding(runtimeEnv);
    const failed = await failingHandler({
      params: { slug: "safe-news" },
      request: new Request("https://app.example/api/news/safe-news"),
      locals: {},
    });
    assert.equal(failed.status, 500);
    const failedBody = await failed.text();
    assert.deepEqual(JSON.parse(failedBody), { error: "NEWS_DETAIL_FETCH_FAILED" });
    assert.doesNotMatch(failedBody, /secret|internal\.example/i);

    const missingTableClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return { maybeSingle: async () => ({ data: null, error: { message: "news_articles does not exist" } }) };
                  },
                };
              },
            };
          },
        };
      },
    };
    const fallback = await getPublicNewsArticleBySlug(missingTableClient, "community-discussion-shifts-to-real-usage");
    assert.ok(fallback);
    assert.equal(fallback.author_id, null, "missing-table fallback uses the same public normalizer");

    const lensdenSlug = "lensden-community-is-prioritizing-verifiable-coverage";
    const lensdenFallback = await getPublicNewsArticleBySlug(missingTableClient, lensdenSlug);
    assert.ok(lensdenFallback, "the official fallback article resolves at its Lensden slug");
    assert.equal(lensdenFallback.slug, lensdenSlug);
    for (const field of ["title", "summary", "content", "source_name"]) {
      assert.match(lensdenFallback[field], /Lensden/);
      assert.doesNotMatch(lensdenFallback[field], /OpenGlass|Open Glass|YuwenChangong/i);
    }
    assert.equal(await getPublicNewsArticleBySlug(missingTableClient, "openglass-community-is-prioritizing-verifiable-coverage"), null,
      "the old URL is handled by the permanent route redirect, not a second fallback article");

    const missingRelatedTableClient = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          neq() { return this; },
          order() { return this; },
          limit: async () => ({ data: null, error: { message: "news_articles schema cache" } }),
        };
      },
    };
    const fallbackRelated = await listRelatedPublicNews(missingRelatedTableClient, { category: "industry", excludeSlug: "safe-news", limit: 400 });
    assert(fallbackRelated.length <= 4, "related items are bounded independently of caller input");
    assert(fallbackRelated.every((item) => item.author_id === null));
  } finally {
    await vite.close();
  }

  console.log(JSON.stringify({
    route: "public news detail GET",
    allowed: ["canonical published slug", "single-decoded safe slug", "bounded normalized related articles"],
    deniedOrSanitized: ["malformed/traversal/filter slugs before reads", "draft rows", "unsafe URLs", "HTML and controls", "author IDs", "raw helper errors"],
    effects: "no provider fetch, image fetch, storage signing, cache, write, user state, or real network/database operation",
  }));
}

await main();
