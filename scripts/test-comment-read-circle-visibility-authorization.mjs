import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sourcePath = new URL("../src/pages/api/forum/comments.ts", import.meta.url);
const migrationPath = new URL("../supabase/migrations/20260713_comment_read_circle_visibility_authorization.sql", import.meta.url);
const historicalPolicyPath = new URL("../supabase/migrations/20260611_forum_permission_lockdown.sql", import.meta.url);
const creationMigrationPath = new URL("../supabase/migrations/20260713_comment_creation_circle_authorization.sql", import.meta.url);
const reactionMigrationPath = new URL("../supabase/migrations/20260713_comment_reaction_visibility_authorization.sql", import.meta.url);
const historicalPolicySha256 = "6efd25f000f4562149c9b48c5498e9da0d2059425542d93f0e6eed6f13b88848";
const creationMigrationSha256 = "84fdaa9b3519ff38ecf1b3ecf43e3601bc28d72f842418e986b351bb32618f26";
const reactionMigrationSha256 = "09cd413ff6d6271522f59066a4e698188c4ea41b914c795e377a96eccda07bb6";

const ids = {
  actor: "11111111-1111-4111-8111-111111111111",
  post: "22222222-2222-4222-8222-222222222222",
  circle: "33333333-3333-4333-8333-333333333333",
  comment: "44444444-4444-4444-8444-444444444444",
  reply: "55555555-5555-4555-8555-555555555555",
};

function accessibleRows() {
  return {
    post: { id: ids.post, circle_id: ids.circle, status: "published", moderation_status: "published" },
    circle: { id: ids.circle, slug: "open-glass", name: "OpenGlass", status: "active" },
    comments: [
      { id: ids.comment, post_id: ids.post, author_id: "author-a", parent_id: null, status: "published", moderation_status: "published" },
      { id: ids.reply, post_id: ids.post, author_id: "author-b", parent_id: ids.comment, status: "published", moderation_status: "published" },
    ],
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isPublicCircle(circle) {
  return Boolean(
    circle &&
    circle.status === "active" &&
    !["rls-test-circle", "rls-test", "test-circle"].includes(circle.slug.toLowerCase()) &&
    !circle.name.toLowerCase().includes("rls test"),
  );
}

function readComments({ postId = ids.post, actorId = null, rows = accessibleRows() } = {}) {
  const calls = [];
  const effects = [];
  if (!isUuid(postId)) return { allowed: false, calls, effects, comments: [] };

  calls.push("posts.select");
  const post = rows.post;
  if (!post || post.id !== postId || !isUuid(post.circle_id) || post.status !== "published" || post.moderation_status !== "published") {
    return { allowed: false, calls, effects, comments: [] };
  }

  calls.push("circles.select");
  if (!rows.circle || rows.circle.id !== post.circle_id || !isPublicCircle(rows.circle)) {
    return { allowed: false, calls, effects, comments: [] };
  }

  calls.push("comments.select");
  const visibleComments = rows.comments.filter((comment) =>
    comment.post_id === post.id && comment.status === "published" && comment.moderation_status === "published",
  );
  if (visibleComments.length === 0) return { allowed: true, calls, effects, comments: [] };

  calls.push("profiles.select", "comment_reactions.select");
  return {
    allowed: true,
    calls,
    effects,
    comments: visibleComments.map((comment) => ({ ...comment, liked_by_me: actorId === ids.actor })),
  };
}

for (const actorId of [null, ids.actor]) {
  const result = readComments({ actorId });
  assert.equal(result.allowed, true, "active canonical-public ancestry is readable");
  assert.deepEqual(result.comments.map((comment) => comment.id), [ids.comment, ids.reply], "top-level comments and replies remain readable");
  assert.equal(result.comments[0].liked_by_me, actorId === ids.actor, "liked_by_me is available only after accessible ancestry succeeds");
  assert.deepEqual(result.effects, [], "GET model has no writes or external effects");
}

const ancestorDeniedCases = [
  ["inactive circle", { ...accessibleRows(), circle: { ...accessibleRows().circle, status: "inactive" } }],
  ["deleted circle", { ...accessibleRows(), circle: { ...accessibleRows().circle, status: "deleted" } }],
  ["canonical-hidden circle", { ...accessibleRows(), circle: { ...accessibleRows().circle, slug: "rls-test-circle" } }],
  ["missing circle", { ...accessibleRows(), circle: null }],
  ["post/circle mismatch", { ...accessibleRows(), circle: { ...accessibleRows().circle, id: "66666666-6666-4666-8666-666666666666" } }],
  ["unpublished post", { ...accessibleRows(), post: { ...accessibleRows().post, status: "pending", moderation_status: "pending_review" } }],
  ["hidden post", { ...accessibleRows(), post: { ...accessibleRows().post, moderation_status: "hidden_by_admin" } }],
  ["deleted post", { ...accessibleRows(), post: { ...accessibleRows().post, status: "deleted" } }],
  ["missing post", { ...accessibleRows(), post: null }],
];

for (const [name, rows] of ancestorDeniedCases) {
  const result = readComments({ rows, actorId: ids.actor });
  assert.equal(result.allowed, false, `${name} is denied`);
  assert.equal(result.calls.includes("comments.select"), false, `${name} stops before comment list reads`);
  assert.equal(result.calls.includes("profiles.select"), false, `${name} stops before profile enrichment`);
  assert.equal(result.calls.includes("comment_reactions.select"), false, `${name} stops before reaction enrichment or liked_by_me`);
  assert.deepEqual(result.effects, [], `${name} has no write, RPC, notification, audit, email, or external effect`);
}

for (const [name, comment] of [
  ["unpublished comment", { ...accessibleRows().comments[0], status: "pending", moderation_status: "pending_review" }],
  ["hidden comment", { ...accessibleRows().comments[0], moderation_status: "hidden_by_admin" }],
  ["deleted comment", { ...accessibleRows().comments[0], status: "deleted" }],
  ["comment/post mismatch", { ...accessibleRows().comments[0], post_id: "77777777-7777-4777-8777-777777777777" }],
]) {
  const result = readComments({ rows: { ...accessibleRows(), comments: [comment] }, actorId: ids.actor });
  assert.equal(result.allowed, true, `${name} does not make the accessible post unreadable`);
  assert.deepEqual(result.comments, [], `${name} is excluded before profile or reaction enrichment`);
  assert.equal(result.calls.includes("profiles.select"), false, `${name} has no profile enrichment`);
  assert.equal(result.calls.includes("comment_reactions.select"), false, `${name} has no reaction enrichment or liked_by_me`);
  assert.deepEqual(result.effects, [], `${name} has no write or external effect`);
}

const malformed = readComments({ postId: "not-a-uuid", actorId: ids.actor });
assert.equal(malformed.allowed, false, "malformed post id is denied");
assert.deepEqual(malformed.calls, [], "malformed post id reaches no database or enrichment call");

const source = readFileSync(sourcePath, "utf8");
const getSource = source.slice(source.indexOf("export const GET"), source.indexOf("export const POST"));
const targetCall = getSource.indexOf("const readTarget = await resolveAccessibleCommentReadTarget(client, postId)");
const commentsQuery = getSource.indexOf('.from("comments")');
assert.ok(targetCall > 0 && commentsQuery > targetCall, "GET resolves post-circle ancestry before comment reads");
assert.match(source, /export async function resolveAccessibleCommentReadTarget/, "runtime exposes the public read target resolver");
assert.match(source, /select\("id,author_id,circle_id,status,moderation_status"\)/, "runtime derives circle_id from the server post read");
assert.match(source, /circle\.status\?\.toLowerCase\(\) !== "active" \|\|\s+!isPublicVisibleCircle\(circle\)/, "runtime requires active canonical-visible parent circle");
assert.match(getSource, /\.eq\("post_id", readTarget\.postId\)/, "comment list uses the resolver-derived post id");
assert.doesNotMatch(getSource, /\.insert\(|\.update\(|\.delete\(|\.from\("forum_notifications"\)/, "GET has no mutation or notification path");
assert.deepEqual([...getSource.matchAll(/\.rpc\("([^"]+)"/g)].map(m=>m[1]), ["deleted_comment_placeholders"], "only the sanitized read-only ancestry projection is allowed");
const placeholderSql=readFileSync(new URL('../supabase/migrations/20261015074931_safe_deleted_comment_placeholders.sql',import.meta.url),'utf8');
assert.match(placeholderSql,/returns table \(id uuid, post_id uuid, parent_id uuid, created_at timestamptz, updated_at timestamptz\)/,"projection excludes bodies, authors and media");
assert.match(placeholderSql,/security definer set search_path = ''/,"sanitized privileged lookup fixes its namespace");
assert.match(placeholderSql,/cardinality\(visible_comment_ids\) between 1 and 1000/,"seed count is bounded");
assert.match(placeholderSql,/a\.depth < 32 and not parent\.id = any\(a\.visited\)/,"walk is cycle-checked and depth-bounded");
assert.match(placeholderSql,/public\.can_access_public_circle\(p\.circle_id\)/,"public ancestry is rechecked inside the projection");
assert.doesNotMatch(placeholderSql,/\b(insert|update|delete)\s+(into|from|public\.)|create policy|grant select/i,"projection never grants deleted-body access or mutates data");
assert.match(placeholderSql,/from public, service_role/ ,"public and service execution revoked");
assert.match(getSource,/if \(myUserId\) \{\s+const \{ data: myProfile/,"role is loaded for the validated viewer");

const migration = readFileSync(migrationPath, "utf8");
for (const required of [
  "public.can_access_public_circle(target_circle_id uuid)",
  "public.can_access_public_comment_read_target(target_comment_id uuid)",
  "join public.posts as post_ref on post_ref.id = comment_ref.post_id",
  "join public.circles as circle_ref on circle_ref.id = post_ref.circle_id",
  "post_ref.status = 'published'",
  "post_ref.moderation_status = 'published'",
  "comment_ref.status = 'published'",
  "comment_ref.moderation_status = 'published'",
  "circle_ref.status = 'active'",
  'create policy "posts_select_published_public"',
  'create policy "comments_select_public_or_staff"',
  'create policy "comment_reactions_select_accessible"',
  "public.can_access_public_circle(circle_id)",
  "public.can_access_public_comment_read_target(id)",
  "public.can_access_public_comment_read_target(comment_id)",
  "author_id = auth.uid()",
  "public.is_moderator_or_admin()",
  "schema has no private-circle membership relation",
]) {
  assert.ok(migration.includes(required), `migration includes ${required}`);
}
assert.doesNotMatch(migration, /status = 'published'\s*\);/i, "no affected public SELECT policy relies on row publication alone");
assert.equal(createHash("sha256").update(readFileSync(historicalPolicyPath)).digest("hex"), historicalPolicySha256, "historical SELECT-policy migration is unchanged");
assert.equal(createHash("sha256").update(readFileSync(creationMigrationPath)).digest("hex"), creationMigrationSha256, "historical comment-creation forward migration is unchanged");
assert.equal(createHash("sha256").update(readFileSync(reactionMigrationPath)).digest("hex"), reactionMigrationSha256, "historical comment-reaction forward migration is unchanged");

console.log("comment read circle visibility authorization tests passed");
