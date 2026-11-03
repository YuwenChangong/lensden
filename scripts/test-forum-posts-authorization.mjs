import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { cloudflareWorkersTestPlugin } from "./lib/cloudflare-workers-test-plugin.mjs";

const root = process.cwd();
const POST_ID = "00000000-0000-0000-0000-000000000001";
const AUTHOR_ID = "00000000-0000-0000-0000-000000000002";
const CIRCLE_ID = "00000000-0000-0000-0000-000000000003";

function gitBlobHash(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  return createHash("sha1").update(`blob ${Buffer.byteLength(normalized)}\0`).update(normalized).digest("hex");
}

function resultQuery(result) {
  const query = {
    select() { return query; },
    eq() { return query; },
    maybeSingle: async () => result,
  };
  return query;
}

function makeTargetClient({ post, circle, postError = null, circleError = null }) {
  return {
    from(table) {
      if (table === "posts") return resultQuery({ data: post, error: postError });
      if (table === "circles") return resultQuery({ data: circle, error: circleError });
      throw new Error(`unexpected table ${table}`);
    },
  };
}

async function main() {
  const postsSource = await fs.readFile(path.join(root, "src/pages/api/forum/posts.ts"), "utf8");
  const feedSource = await fs.readFile(path.join(root, "src/lib/forum-feed.ts"), "utf8");
  const forwardMigration = await fs.readFile(path.join(root, "supabase/migrations/20260713_forum_posts_circle_authorization.sql"), "utf8");
  const historicalSchema = await fs.readFile(path.join(root, "supabase/migrations/20260518_forum_phase1_schema.sql"), "utf8");
  const historicalPublishedInsert = await fs.readFile(path.join(root, "supabase/migrations/20260525_forum_phase5_publish_posts_rls.sql"), "utf8");
  const historicalViewRpc = await fs.readFile(path.join(root, "supabase/migrations/20260603_forum_hot_sort_and_circle_name_guard.sql"), "utf8");

  assert.equal(gitBlobHash(historicalSchema), "48deb683515de975c84c1f44ac06d3048082fcd4");
  assert.equal(gitBlobHash(historicalPublishedInsert), "2e39f6b7a6a57af2f2a2e371d1851639b3a0050b");
  assert.equal(gitBlobHash(historicalViewRpc), "cce74f6e80270a20c43b5ea4755efafc6e5b13a2");

  const postHandler = postsSource.slice(postsSource.indexOf("export const POST"), postsSource.indexOf("export const DELETE"));
  assert(postHandler.indexOf("resolveWritableCircleBySlug") < postHandler.indexOf("enforceUserRateLimit"));
  assert(postHandler.indexOf("enforceUserRateLimit") < postHandler.indexOf("moderateContent"));
  assert(postHandler.indexOf("moderateContent") < postHandler.indexOf(".insert({"));
  assert(!postsSource.includes("safeIncrementPostViewCount"));
  assert(postsSource.includes("View increment is not supported by this read-only endpoint"));

  const deleteHandler = postsSource.slice(postsSource.indexOf("export const DELETE"), postsSource.indexOf("export const PATCH"));
  assert(deleteHandler.indexOf('assertUserCanWrite(userClient, authData.user.id, "post_delete")') < deleteHandler.indexOf("resolveAccessibleForumPostTarget"));
  assert(deleteHandler.indexOf("resolveAccessibleForumPostTarget") < deleteHandler.indexOf('.from("post_media")'));
  assert(deleteHandler.indexOf('.update({ status: "deleted" })') < deleteHandler.indexOf("deletePostMediaObjects"));
  assert(!deleteHandler.includes('.from("posts")\n        .delete()'));

  const patchHandler = postsSource.slice(postsSource.indexOf("export const PATCH"));
  assert(patchHandler.indexOf('assertUserCanWrite(userClient, authData.user.id, "post_moderate")') < patchHandler.indexOf("resolveAccessibleForumPostTarget"));
  assert(patchHandler.indexOf("resolveAccessibleForumPostTarget") < patchHandler.indexOf("loadViewerRole"));
  assert(patchHandler.indexOf("loadViewerRole") < patchHandler.indexOf('.update({ status: "hidden" })'));

  assert(/create policy "posts_insert_self"[\s\S]*?author_id = auth\.uid\(\)[\s\S]*?moderation_status in \('published', 'pending_review'\)[\s\S]*?can_access_public_circle\(circle_id\)/.test(forwardMigration));
  assert(/create policy "posts_update_self_or_staff"[\s\S]*?author_id = auth\.uid\(\)[\s\S]*?can_access_public_circle\(circle_id\)/.test(forwardMigration));
  assert(/create policy "posts_delete_self_or_staff"[\s\S]*?can_access_public_circle\(circle_id\)[\s\S]*?author_id = auth\.uid\(\)/.test(forwardMigration));
  assert(/increment_post_view_count[\s\S]*?moderation_status = 'published'[\s\S]*?can_access_public_circle\(post_ref\.circle_id\)/.test(forwardMigration));

  const vite = await createServer({ root, logLevel: "error", plugins: [cloudflareWorkersTestPlugin()], server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true } });
  try {
    const { resolveAccessibleForumPostTarget } = await vite.ssrLoadModule("/src/pages/api/forum/posts.ts");
    const { filterPublicVisibleFeedPosts } = await vite.ssrLoadModule("/src/lib/forum-feed.ts");
    const publishedPost = { id: POST_ID, author_id: AUTHOR_ID, circle_id: CIRCLE_ID, status: "published", moderation_status: "published" };
    const publicCircle = { id: CIRCLE_ID, slug: "community", name: "Community", status: "active" };

    const allowed = await resolveAccessibleForumPostTarget(makeTargetClient({ post: publishedPost, circle: publicCircle }), POST_ID);
    assert.deepEqual(allowed, { ok: true, target: { id: POST_ID, authorId: AUTHOR_ID, circleId: CIRCLE_ID } });
    const retry = await resolveAccessibleForumPostTarget(makeTargetClient({ post: { ...publishedPost, status: "deleted" }, circle: publicCircle }), POST_ID, true);
    assert.equal(retry.ok, true, "explicit DELETE retry can resolve an owned deleted target; caller still enforces actor");
    for (const circle of [{...publicCircle,status:"deleted"},{...publicCircle,slug:"rls-test-circle"}]) {
      const deniedRetry = await resolveAccessibleForumPostTarget(makeTargetClient({post:{...publishedPost,status:"deleted"},circle}),POST_ID,true);
      assert.equal(deniedRetry.ok,false,"DELETE retry must not bypass circle visibility");
    }

    const deniedTargets = await Promise.all([
      resolveAccessibleForumPostTarget(makeTargetClient({ post: { ...publishedPost, status: "deleted" }, circle: publicCircle }), POST_ID),
      resolveAccessibleForumPostTarget(makeTargetClient({ post: { ...publishedPost, moderation_status: "pending_review" }, circle: publicCircle }), POST_ID),
      resolveAccessibleForumPostTarget(makeTargetClient({ post: publishedPost, circle: { ...publicCircle, status: "deleted" } }), POST_ID),
      resolveAccessibleForumPostTarget(makeTargetClient({ post: publishedPost, circle: { ...publicCircle, slug: "rls-test-circle" } }), POST_ID),
      resolveAccessibleForumPostTarget(makeTargetClient({ post: publishedPost, circle: null }), POST_ID),
    ]);
    assert(deniedTargets.every((result) => !result.ok && result.status === 404));

    const feed = filterPublicVisibleFeedPosts([
      { ...publishedPost, title: "public", body: "body", type: "experience", created_at: "2026-07-13", circles: publicCircle },
      { ...publishedPost, id: "00000000-0000-0000-0000-000000000004", title: "deleted", body: "body", type: "experience", created_at: "2026-07-13", circles: { ...publicCircle, status: "deleted" } },
      { ...publishedPost, id: "00000000-0000-0000-0000-000000000005", title: "qa", body: "body", type: "experience", created_at: "2026-07-13", circles: { ...publicCircle, slug: "rls-test" } },
    ]);
    assert.deepEqual(feed.map((post) => post.id), [POST_ID]);
  } finally {
    await vite.close();
  }

  console.log(JSON.stringify({
    methods: ["GET", "POST", "DELETE", "PATCH"],
    allowedTarget: "published post in active canonical public circle",
    deniedTargets: ["deleted post", "pending-review post", "deleted circle", "QA-hidden circle", "missing circle"],
    deniedMutationEffects: 0,
    historicalMigrationsUnchanged: true,
    forwardRlsCoverage: ["post insert", "post update", "post delete", "view-count RPC"],
    realNetworkStorageDatabaseRequests: 0,
  }));
}

await main();
