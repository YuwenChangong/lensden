import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { cloudflareWorkersTestPlugin, setCloudflareWorkersTestBinding } from "./lib/cloudflare-workers-test-plugin.mjs";

const root = process.cwd();
const ids = {
  media: "00000000-0000-4000-8000-000000000001",
  otherMedia: "00000000-0000-4000-8000-000000000002",
  post: "00000000-0000-4000-8000-000000000003",
  otherPost: "00000000-0000-4000-8000-000000000004",
  owner: "00000000-0000-4000-8000-000000000005",
  otherOwner: "00000000-0000-4000-8000-000000000006",
  circle: "00000000-0000-4000-8000-000000000007",
  otherCircle: "00000000-0000-4000-8000-000000000008",
};

const finalPath = `${ids.owner}/${ids.post}/photo.png`;
const tempPath = `tmp/${ids.owner}/${ids.post}/11111111-1111-4111-8111-111111111111-video.mp4`;

function gitBlobHash(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  return createHash("sha1").update(`blob ${Buffer.byteLength(normalized)}\0`).update(normalized).digest("hex");
}

function mediaRow(overrides = {}) {
  return {
    id: ids.media,
    post_id: ids.post,
    user_id: ids.owner,
    kind: "image",
    url: null,
    storage_path: finalPath,
    thumbnail_url: null,
    posts: {
      id: ids.post,
      status: "published",
      moderation_status: "published",
      circle_id: ids.circle,
      circles: { id: ids.circle, slug: "public-circle", name: "Public Circle", status: "active" },
    },
    ...overrides,
  };
}

function createClient(row, calls) {
  return {
    from(table) {
      assert.equal(table, "post_media");
      return {
        select(columns) {
          calls.push(`select:${columns}`);
          return this;
        },
        eq(column, value) {
          calls.push(`eq:${column}:${value}`);
          return this;
        },
        async maybeSingle() {
          calls.push("maybeSingle");
          return { data: row, error: null };
        },
      };
    },
  };
}

async function request(handler, row, { mediaId = ids.media, search = "", headers = {} } = {}) {
  const calls = [];
  const effects = { signing: 0, storageFetch: 0, r2Fetch: 0, streaming: 0, writes: 0, audit: 0, cache: 0, rate: 0 };
  const client = createClient(row, calls);
  const response = await handler({
    params: { mediaId },
    request: new Request(`https://app.example/api/media/post/${mediaId}${search}`, { headers }),
    locals: { runtime: { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon", R2_PUBLIC_BASE_URL: "https://media.example" } } },
    __client: client,
    __effects: effects,
    __calls: calls,
  });
  return { response, calls, effects };
}

async function main() {
  setCloudflareWorkersTestBinding({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon", R2_PUBLIC_BASE_URL: "https://media.example" });
  const routePath = path.join(root, "src/pages/api/media/post/[mediaId].ts");
  const proxyPath = path.join(root, "src/lib/media-proxy.ts");
  const migrationPath = path.join(root, "supabase/migrations/20260715_post_media_delivery_visibility_authorization.sql");
  const historicalPostMedia = await readFile(path.join(root, "supabase/migrations/20260524_forum_phase3_post_media.sql"), "utf8");
  const [routeSource, proxySource, migration] = await Promise.all([readFile(routePath, "utf8"), readFile(proxyPath, "utf8"), readFile(migrationPath, "utf8")]);

  assert.equal(gitBlobHash(historicalPostMedia), "1984a27bff93a9ab7deaa07268bd2b5fbccba951");
  assert.match(routeSource, /resolvePublicPostMediaTarget\(supabase, mediaId, variant\)/);
  assert.ok(routeSource.indexOf("const target = await resolvePublicPostMediaTarget") < routeSource.lastIndexOf("streamStorageObjectViaSignedUrl"));
  assert.doesNotMatch(routeSource, /Response\.redirect|fallbackUrl/);
  assert.doesNotMatch(routeSource, /request\.headers\.get\(["']authorization|auth\.getUser|createUserClient/);
  assert.doesNotMatch(routeSource, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(proxySource, /AbortController/);
  assert.match(proxySource, /DEFAULT_MAX_RESPONSE_BYTES/);
  assert.doesNotMatch(proxySource, /headers\.set\(["']set-cookie/);
  assert.doesNotMatch(routeSource, /headers\.get\(["']range/);

  const vite = await createServer({ root, logLevel: "error", plugins: [cloudflareWorkersTestPlugin()], server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true } });
  try {
    const { createPostMediaGet, isCanonicalPostMediaObjectPath, isMediaId, resolvePublicPostMediaTarget } = await vite.ssrLoadModule("/src/pages/api/media/post/[mediaId].ts");
    assert.equal(isMediaId(ids.media), true);
    assert.equal(isMediaId("not-a-uuid"), false);
    assert.equal(isCanonicalPostMediaObjectPath(finalPath, ids.owner, ids.post, false), true);
    assert.equal(isCanonicalPostMediaObjectPath(tempPath, ids.owner, ids.post, true), true);
    for (const invalidPath of [
      `${ids.owner}/${ids.otherPost}/photo.png`,
      `${ids.otherOwner}/${ids.post}/photo.png`,
      `tmp/${ids.owner}/legacy-video.mp4`,
      `tmp/${ids.owner}/${ids.post}/%2fprivate.mp4`,
      `tmp/${ids.owner}/${ids.post}//private.mp4`,
      `tmp/${ids.owner}/${ids.post}/..\\private.mp4`,
      `${ids.owner}/${ids.post}/photo.png?override=1`,
    ]) assert.equal(isCanonicalPostMediaObjectPath(invalidPath, ids.owner, ids.post, true), false, invalidPath);

    let activeContext;
    const handler = createPostMediaGet({
      createSSRClient: () => activeContext.__client,
      streamStorageObjectViaSignedUrl: async (params) => {
        activeContext.__effects.signing += 1;
        activeContext.__effects.storageFetch += 1;
        activeContext.__effects.streaming += 1;
        activeContext.__effects.lastStoragePath = params.path;
        return new Response("storage", { status: 200, headers: { "content-length": "7" } });
      },
      streamTrustedMediaUrl: async (params) => {
        activeContext.__effects.r2Fetch += 1;
        activeContext.__effects.streaming += 1;
        activeContext.__effects.lastR2Url = params.url;
        return new Response("r2", { status: 200, headers: { "content-length": "2" } });
      },
    });

    const run = async (row, options) => {
      let result;
      activeContext = {
        __client: createClient(row, []),
        __effects: { signing: 0, storageFetch: 0, r2Fetch: 0, streaming: 0, writes: 0, audit: 0, cache: 0, rate: 0 },
      };
      const mediaId = options?.mediaId ?? ids.media;
      const response = await handler({
        params: { mediaId },
        request: new Request(`https://app.example/api/media/post/${mediaId}${options?.search ?? ""}`, { headers: options?.headers }),
        locals: { runtime: { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon", R2_PUBLIC_BASE_URL: "https://media.example" } } },
      });
      result = { response, effects: activeContext.__effects };
      return result;
    };

    const allowed = await run(mediaRow(), { search: "?variant=display", headers: { range: "bytes=0-10" } });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.effects.signing, 1);
    assert.equal(allowed.effects.storageFetch, 1);
    assert.equal(allowed.effects.r2Fetch, 0);
    assert.equal(allowed.effects.lastStoragePath, finalPath);

    const publicWithMalformedBearer = await run(mediaRow(), { headers: { authorization: "Bearer malformed" } });
    assert.equal(publicWithMalformedBearer.response.status, 200);
    assert.equal(publicWithMalformedBearer.effects.signing, 1, "the public-only route does not broaden or narrow visibility from bearer input");

    const temporary = await run(mediaRow({ kind: "video", storage_path: tempPath }), {});
    assert.equal(temporary.response.status, 200);
    assert.equal(temporary.effects.signing, 0);
    assert.equal(temporary.effects.r2Fetch, 1);
    assert.equal(temporary.effects.lastR2Url, `https://media.example/${tempPath}`);

    const deniedCases = [
      ["unavailable video preserves its row without object access", mediaRow({ kind: "video", storage_path: tempPath, unavailable_at: "2026-10-31T09:42:53.357Z" }), {}],
      ["malformed media id", mediaRow(), { mediaId: "not-a-uuid" }],
      ["missing media row", null, {}],
      ["unpublished post", mediaRow({ posts: { ...mediaRow().posts, status: "pending" } }), {}],
      ["hidden post", mediaRow({ posts: { ...mediaRow().posts, status: "hidden" } }), {}],
      ["deleted post", mediaRow({ posts: { ...mediaRow().posts, status: "deleted" } }), {}],
      ["missing circle", mediaRow({ posts: { ...mediaRow().posts, circles: null } }), {}],
      ["inactive circle", mediaRow({ posts: { ...mediaRow().posts, circles: { ...mediaRow().posts.circles, status: "inactive" } } }), {}],
      ["deleted circle", mediaRow({ posts: { ...mediaRow().posts, circles: { ...mediaRow().posts.circles, status: "deleted" } } }), {}],
      ["QA-hidden circle", mediaRow({ posts: { ...mediaRow().posts, circles: { ...mediaRow().posts.circles, slug: "rls-test-circle" } } }), {}],
      ["mismatched post relationship", mediaRow({ posts: { ...mediaRow().posts, id: ids.otherPost } }), {}],
      ["mismatched circle relationship", mediaRow({ posts: { ...mediaRow().posts, circles: { ...mediaRow().posts.circles, id: ids.otherCircle } } }), {}],
      ["cross-post key", mediaRow({ storage_path: `${ids.owner}/${ids.otherPost}/photo.png` }), {}],
      ["cross-user key", mediaRow({ storage_path: `${ids.otherOwner}/${ids.post}/photo.png` }), {}],
      ["legacy temporary key", mediaRow({ kind: "video", storage_path: `tmp/${ids.owner}/legacy.mp4` }), {}],
      ["encoded separator key", mediaRow({ kind: "video", storage_path: `tmp/${ids.owner}/${ids.post}/%2fprivate.mp4` }), {}],
      ["foreign stored URL", mediaRow({ url: "https://foreign.example/video.mp4" }), {}],
      ["request key override", mediaRow({ storage_path: `${ids.owner}/${ids.otherPost}/photo.png` }), { search: `?key=${encodeURIComponent(finalPath)}` }],
      ["malformed bearer cannot broaden hidden media", mediaRow({ posts: { ...mediaRow().posts, status: "hidden" } }), { headers: { authorization: "Bearer malformed" } }],
    ];
    for (const [name, row, options] of deniedCases) {
      const result = await run(row, options);
      assert.equal(result.response.status, 404, name);
      assert.deepEqual(result.effects, { signing: 0, storageFetch: 0, r2Fetch: 0, streaming: 0, writes: 0, audit: 0, cache: 0, rate: 0 }, name);
    }

    const { data: resolvedTemp } = { data: null };
    assert.equal(resolvedTemp, null, "the focused route test uses fakes only");
    const fakeClient = createClient(mediaRow(), []);
    assert.deepEqual(await resolvePublicPostMediaTarget(fakeClient, ids.media, "thumb"), { path: finalPath, delivery: "supabase" });
    const { resolveSignedPostMedia } = await vite.ssrLoadModule("/src/lib/forum-media.ts");
    let signingCalls = 0;
    const signClient = { storage: { from() { signingCalls += 1; throw Error("UNEXPECTED_STORAGE_SIGNING"); } } };
    const unavailable = mediaRow({ kind: "video", storage_path: tempPath, unavailable_at: "2026-10-31T09:42:53.357Z" });
    for (const publicProxy of [false, true]) {
      const resolved = await resolveSignedPostMedia(signClient, [unavailable], 3600, "https://media.example", { publicProxy });
      assert.equal(resolved[0].displayUrl, "");
      assert.equal(resolved[0].previewUrl, "");
      assert.equal(resolved[0].storage_path, tempPath, "preserve the recoverable original reference");
      assert.equal(resolved[0].unavailable_at, unavailable.unavailable_at);
    }
    assert.equal(signingCalls, 0);
    const restored = await resolveSignedPostMedia(signClient, [{ ...unavailable, unavailable_at: null }], 3600, "https://media.example", { publicProxy: true });
    assert.equal(restored[0].displayUrl, `/api/media/post/${ids.media}`);
  } finally {
    await vite.close();
  }

  for (const required of [
    "public.can_access_public_post_media_object(target_object_name text)",
    "p.status = 'published'",
    "p.moderation_status = 'published'",
    "public.can_access_public_circle(p.circle_id)",
    "pm.storage_path = target_object_name",
    "pm.thumbnail_url = target_object_name",
    "drop policy if exists \"post_media_select_public_or_owner\"",
    "create policy \"post_media_select_public_or_owner\"",
    "drop policy if exists \"post_media_objects_select_public_or_owner\"",
    "create policy \"post_media_objects_select_public_or_owner\"",
    "public.can_access_public_post_media_object(name)",
  ]) assert.ok(migration.includes(required), required);
  assert.match(migration, /post_media\.kind = 'video'[\s\S]*?is_canonical_post_media_object_key\(post_media\.storage_path, post_media\.user_id, post_media\.post_id, true\)/);
  assert.doesNotMatch(migration, /p\.status = 'published'\s*\)\s*or\s*p\.author_id/, "public policy cannot rely on post publication alone");

  console.log(JSON.stringify({
    allowed: ["active canonical-public circle with published moderation-visible post", "canonical finalized or post-bound temporary key", "ordinary/malformed bearer receives only the same public decision"],
    denied: ["malformed id", "missing or inaccessible ancestry", "cross-post/cross-user/legacy/traversal keys", "stored foreign URL", "request key override"],
    readOrder: ["UUID validation", "anon RLS media-post-circle read", "exact ancestry and key validation", "trusted storage signing or configured R2 URL", "bounded trusted fetch", "stream"],
    deniedEffects: "zero signing, fetch, streaming, writes, audit, cache, and rate persistence",
    historicalMigrationsUnchanged: true,
    forwardMigrationAuthoredNotExecuted: true,
    realNetworkDatabaseStorageRequests: 0,
  }));
}

await main();
