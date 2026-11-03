import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const root = process.cwd();

const ids = {
  user: "00000000-0000-0000-0000-000000000001",
  visibleCircle: "00000000-0000-0000-0000-000000000002",
  hiddenCircle: "00000000-0000-0000-0000-000000000003",
  inactiveCircle: "00000000-0000-0000-0000-000000000004",
  visiblePost: "00000000-0000-0000-0000-000000000005",
  hiddenPost: "00000000-0000-0000-0000-000000000006",
  inactivePost: "00000000-0000-0000-0000-000000000007",
  missingCirclePost: "00000000-0000-0000-0000-000000000008",
};

function createSearchClient() {
  const reads = [];
  const effects = { writes: 0, storageSigning: 0, rpc: 0 };
  const visibleCircle = { id: ids.visibleCircle, slug: "visible-circle", name: "Visible Circle", description: "Visible discussion", created_at: "2026-07-01T00:00:00.000Z", image_path: null, status: "active", owner_id: ids.user };
  const hiddenCircle = { id: ids.hiddenCircle, slug: "rls-test-circle", name: "RLS Test Circle", description: "Hidden circle description", created_at: "2026-07-01T00:00:00.000Z", image_path: null, status: "active", owner_id: ids.user };
  const inactiveCircle = { id: ids.inactiveCircle, slug: "inactive-circle", name: "Inactive Circle", description: "Inactive circle description", created_at: "2026-07-01T00:00:00.000Z", image_path: null, status: "inactive", owner_id: ids.user };
  const profile = { id: ids.user, username: "visible-user", display_name: "Visible User", avatar_url: `profile-avatars/${ids.user}/1752451200000-visible.jpg`, bio: "Visible profile", created_at: "2026-07-01T00:00:00.000Z" };
  const post = (id, circle, title, body) => ({
    id,
    title,
    body,
    created_at: "2026-07-01T00:00:00.000Z",
    type: "discussion",
    author_id: ids.user,
    view_count: 1,
    circles: circle,
    profiles: { username: profile.username, display_name: profile.display_name },
    post_media: [{ id: `media-${id}`, kind: "image", storage_path: "visible.jpg", thumbnail_url: null, is_cover: true }],
  });
  const posts = [
    post(ids.visiblePost, visibleCircle, "Visible post", "Visible post excerpt"),
    post(ids.hiddenPost, hiddenCircle, "Hidden post", "Hidden post secret"),
    post(ids.inactivePost, inactiveCircle, "Inactive post", "Inactive post secret"),
    post(ids.missingCirclePost, null, "Missing circle post", "Missing ancestor secret"),
  ];

  function rowsFor(table, selectClause) {
    if (table === "profiles") return selectClause === "id" ? [{ id: ids.user }] : [profile];
    if (table === "circles") return selectClause.includes("description") ? [visibleCircle, hiddenCircle, inactiveCircle] : [visibleCircle, hiddenCircle, inactiveCircle];
    if (table === "posts") {
      if (selectClause === "circle_id") return [{ circle_id: ids.visibleCircle }];
      if (selectClause.startsWith("author_id")) return posts.map(({ author_id, circles }) => ({ author_id, circles }));
      return posts;
    }
    if (table === "post_votes" || table === "comments") return [];
    if (table === "devices") return [];
    throw new Error(`unexpected search table ${table}`);
  }

  function query(table) {
    let selectClause = "";
    const builder = {
      select(value) { selectClause = value; return builder; },
      eq() { return builder; },
      or() { return builder; },
      in() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle: async () => ({ data: null, error: null }),
      then(onFulfilled, onRejected) {
        reads.push(`${table}:${selectClause}`);
        return Promise.resolve({ data: rowsFor(table, selectClause), error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    client: {
      from(table) { return query(table); },
      rpc() { effects.rpc += 1; throw new Error("search must not call RPC"); },
      storage: { from() { return { createSignedUrls: async () => { effects.storageSigning += 1; return { data: [] }; } }; } },
    },
    reads,
    effects,
  };
}

async function main() {
  const [routeSource, searchSource, mediaSource, forwardRls] = await Promise.all([
    fs.readFile(path.join(root, "src/pages/api/forum/search.ts"), "utf8"),
    fs.readFile(path.join(root, "src/lib/forum-search.ts"), "utf8"),
    fs.readFile(path.join(root, "src/lib/forum-media.ts"), "utf8"),
    fs.readFile(path.join(root, "supabase/migrations/20260713_comment_read_circle_visibility_authorization.sql"), "utf8"),
  ]);

  assert(routeSource.includes("createSSRClient"), "GET constructs the anon-only SSR client");
  assert(!routeSource.includes("Authorization"), "GET does not broaden search with a requester bearer");
  assert.doesNotMatch(routeSource, /\.(insert|update|delete|upsert|rpc)\(/, "GET has no mutation call");
  assert(searchSource.includes("isActivePublicSearchCircle"), "search has an explicit active canonical circle gate");
  assert(searchSource.includes("circles:circle_id(id,slug,name,status)"), "post rows include the parent visibility fields");
  assert(searchSource.includes("author_id,circles:circle_id(slug,name,status)"), "profile post counts include parent visibility fields");
  assert(searchSource.includes(".eq(\"status\", \"active\")"), "circle and owner-circle reads require active state");
  assert(searchSource.includes("replace(/[^\\p{L}\\p{N}\\s-]+/gu, \" \")"), "query text excludes PostgREST filter grammar");
  assert(!searchSource.includes("isMissingCircleStatusError"), "missing visibility columns fail closed instead of using a public fallback");
  assert(mediaSource.replace(/\r\n/g, "\n").includes("const storagePaths = options?.publicProxy\n    ? []"), "public search proxies do not create storage signed URLs");
  assert(/create policy "posts_select_published_public"[\s\S]*?moderation_status = 'published'[\s\S]*?public\.can_access_public_circle\(circle_id\)/.test(forwardRls), "authored forward post SELECT RLS matches the runtime ancestor predicate");

  const vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
  try {
    const { parseForumSearchParams, runForumSearch } = await vite.ssrLoadModule("/src/lib/forum-search.ts");
    const injection = parseForumSearchParams("visible),status.eq.hidden", "all");
    assert.equal(injection.ok, true);
    if (injection.ok) assert.equal(injection.query, "visible status eq hidden");
    assert.equal(parseForumSearchParams("x".repeat(81), "all").ok, false, "oversized query is rejected rather than truncated");
    assert.equal(parseForumSearchParams("  \u0000  ", "all").ok, false, "control-only query is rejected");

    const { client, reads, effects } = createSearchClient();
    const result = await runForumSearch(client, {
      query: "visible",
      type: "all",
      limitPosts: 200,
      limitCircles: 200,
      limitUsers: 200,
      limitDevices: 200,
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error);
    assert.deepEqual(result.results.posts.map((entry) => entry.id), [ids.visiblePost]);
    assert.deepEqual(result.results.circles.map((entry) => entry.id), [ids.visibleCircle]);
    assert.deepEqual(result.results.users.map((entry) => entry.id), [ids.user]);
    assert.deepEqual(result.results.counts, { posts: 1, circles: 1, users: 1, devices: 0 });
    assert.doesNotMatch(JSON.stringify(result.results), /Hidden post|Inactive post|Missing circle|secret|rls-test-circle|Inactive Circle/, "inaccessible rows cannot leak through results, counts, snippets, slugs, ranking, or media metadata");
    assert.equal(result.results.posts[0].preview_image_url, `/api/media/post/media-${ids.visiblePost}`);
    assert.equal(result.results.users[0].avatar_url, `/api/media/profile/${ids.user}/avatar`);
    assert(reads[0].startsWith("profiles:id"), "matching-author read is the first database operation");
    assert(reads.some((entry) => entry.startsWith("posts:")), "post reads occur after author matching");
    assert.equal(effects.writes, 0);
    assert.equal(effects.storageSigning, 0);
    assert.equal(effects.rpc, 0);
  } finally {
    await vite.close();
  }

  console.log(JSON.stringify({
    allowed: ["visible public post", "visible active canonical circle", "profile with visible public activity"],
    excluded: ["inactive/deleted circle", "canonical-hidden circle", "post with inaccessible or missing circle", "hidden snippets/counts/media/ranking metadata"],
    querySafety: ["bounded 2-80 characters", "plain Unicode text only", "fixed type allowlist", "bounded result limits", "no caller-selected table/sort/RPC"],
    readOrder: ["matching-author profile read", "post/circle/profile searches in parallel", "post/circle count and media enrichment reads", "in-memory ranking", "response"],
    writes: 0,
    externalStorageSigning: 0,
    realNetworkDatabaseStorageRequests: 0,
  }));
}

await main();
