import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

// Incremental coverage only; reuse the original 20 JWT/API tests, do not replay them.
// Real owned PG17 cluster + repository schema/policies; Auth/Storage facades are
// local fixtures, not a claim of full Supabase-schema or Production parity.
const root = process.cwd();
const migrationName = "20261024043314_admin_staff_aal2_capabilities.sql";
const source = name => readFile(path.join(root, "supabase/migrations", name), "utf8");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)));
const ids = {
  a: "00000000-0000-4000-8000-000000000001", b: "00000000-0000-4000-8000-000000000002",
  admin: "00000000-0000-4000-8000-000000000003", moderator: "00000000-0000-4000-8000-000000000004",
  circle: "00000000-0000-4000-8000-000000000011", empty: "00000000-0000-4000-8000-000000000012",
  post: "00000000-0000-4000-8000-000000000021", comment: "00000000-0000-4000-8000-000000000031",
  media: "00000000-0000-4000-8000-000000000041", report: "00000000-0000-4000-8000-000000000051",
};
let tests = 0;
async function test(label, run) { await run(); tests++; console.log(`PASS ${label}`); }
function command(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, 20000);
    const collect = data => { output += data; if (output.length > 1024 * 1024) { expired = true; child.kill(); } };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); child.stdout.destroy(); child.stderr.destroy(); resolve({ code, output, expired }); });
  });
}
const temp = await mkdtemp(path.join(os.tmpdir(), "ogh-admin-mfa-closure-"));
const data = path.join(temp, "data");
const listener = net.createServer();
await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
let db, initialized = false, started = false;
let failure;
const sql = text => db.query(text);
async function asActor(actor, aal, work, databaseRole = "authenticated", extraClaims = {}) {
  await sql("BEGIN");
  try {
    await sql(`SET LOCAL ROLE ${databaseRole}`);
    await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids[actor], role: databaseRole, ...(aal === undefined ? {} : { aal }), ...extraClaims })]);
    return await work();
  } finally { await sql("ROLLBACK"); }
}
async function affected(actor, aal, text, expected) {
  await asActor(actor, aal, async () => assert.equal((await sql(text)).rowCount, expected));
}
try {
  let result = await command("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
  assert.equal(result.code, 0, result.output); assert.equal(result.expired, false); initialized = true;
  result = await command("pg_ctl", ["-D", data, "-l", path.join(temp, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -c max_connections=8`, "-w", "-t", "15", "start"]);
  assert.equal(result.code, 0, result.output); assert.equal(result.expired, false); started = true;
  db = new pg.Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres", connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
  await db.connect();
  assert.match((await sql("SHOW server_version")).rows[0].server_version, /^17\./);
  await sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
    GRANT SELECT ON storage.objects TO anon;`);
  for (const name of [
    "20260518_forum_phase1_schema.sql", "20260524_forum_phase3_post_media.sql",
    "20260525_forum_phase5_circle_creator_and_images.sql", "20260604_forum_circle_soft_delete_and_management.sql",
    "20260611_forum_permission_lockdown.sql", "20260616_community_moderation_mvp.sql",
    "20260626_user_safety_states_and_bans.sql", "20260627_reports_optimization_mvp.sql",
  ]) await sql(await source(name));
  await sql("CREATE TABLE public.forum_notifications(id uuid PRIMARY KEY,circle_id uuid);");
  await sql(await source("20260814_admin_circle_lifecycle_and_safe_purge.sql"));
  await sql(await source("20260620_admin_qa_role_grant_path.sql"));
  // Superset local grants deliberately stress the RLS boundary. The role-column
  // restriction below is actual source; this is not a current live-grant snapshot.
  await sql("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; GRANT SELECT ON public.posts,public.comments,public.circles,public.profiles TO anon;");
  await sql(await source("20260620_lock_profile_role_updates.sql"));
  const catalog = await source("20260909195640_device_schema_v1_foundation.sql");
  const catalogStart = catalog.indexOf("create or replace function public.is_catalog_admin()");
  const catalogEnd = catalog.indexOf("-- Keep the legacy", catalogStart);
  assert(catalogStart >= 0 && catalogEnd > catalogStart);
  await sql(catalog.slice(catalogStart, catalogEnd));
  await sql(`INSERT INTO auth.users(id,email) VALUES ${["a", "b", "admin", "moderator"].map(actor => `('${ids[actor]}','${actor}@example.invalid')`).join(",")};
    UPDATE public.profiles SET role='admin' WHERE id='${ids.admin}'; UPDATE public.profiles SET role='moderator' WHERE id='${ids.moderator}';
    INSERT INTO public.circles(id,slug,name,type,owner_id,status) VALUES ('${ids.circle}','local-test','Local test','topic','${ids.a}','active'),('${ids.empty}','local-empty','Local empty','topic','${ids.b}','deleted');
    INSERT INTO public.posts(id,author_id,circle_id,type,title,body,status) VALUES ('${ids.post}','${ids.a}','${ids.circle}','question','Local fixture','Synthetic local content','published');
    INSERT INTO public.comments(id,post_id,author_id,body) VALUES ('${ids.comment}','${ids.post}','${ids.a}','Synthetic comment');
    INSERT INTO public.post_media(id,post_id,user_id,kind,storage_path) VALUES ('${ids.media}','${ids.post}','${ids.a}','image','${ids.a}/${ids.post}/local.png');
    INSERT INTO storage.objects(id,bucket_id,name,owner) VALUES ('${ids.media}','post-media','${ids.a}/${ids.post}/local.png','${ids.a}');
    INSERT INTO public.reports(id,reporter_id,target_type,target_id,reason) VALUES ('${ids.report}','${ids.b}','post','${ids.post}','Synthetic report');
    INSERT INTO public.user_safety_states(user_id) VALUES ('${ids.a}');`);
  await test("reproduce original AAL1 direct staff ban capability", () => affected("admin", "aal1", `UPDATE public.user_safety_states SET status='banned' WHERE user_id='${ids.a}' RETURNING user_id`, 1));
  const snapshot = async () => JSON.stringify((await sql(`SELECT oid,proowner,proacl FROM pg_proc WHERE oid IN ('public.is_moderator_or_admin()'::regprocedure,'public.is_catalog_admin()'::regprocedure) ORDER BY oid`)).rows);
  const aclBefore = await snapshot();
  const policiesBefore = JSON.stringify((await sql("SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname")).rows);
  const delta = await source(migrationName);
  await sql(`BEGIN; ${delta} COMMIT;`);
  await test("only existing function bodies change; owners/OIDs/ACLs and all policies preserved", async () => {
    assert.equal(await snapshot(), aclBefore);
    assert.equal(JSON.stringify((await sql("SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname")).rows), policiesBefore);
  });
  for (const [label, statement] of [
    ["ban/suspend", `UPDATE public.user_safety_states SET status='banned' WHERE user_id='${ids.a}' RETURNING user_id`],
    ["post moderation", `UPDATE public.posts SET status='hidden' WHERE id='${ids.post}' RETURNING id`],
    ["comment moderation", `UPDATE public.comments SET status='deleted' WHERE id='${ids.comment}' RETURNING id`],
    ["report action", `UPDATE public.reports SET status='dismissed' WHERE id='${ids.report}' RETURNING id`],
    ["media row deletion", `DELETE FROM public.post_media WHERE id='${ids.media}' RETURNING id`],
    ["Storage object deletion", `DELETE FROM storage.objects WHERE id='${ids.media}' RETURNING id`],
    ["Storage object update", `UPDATE storage.objects SET name=name||'.updated' WHERE id='${ids.media}' RETURNING id`],
    ["circle management", `UPDATE public.circles SET description='Staff update' WHERE id='${ids.circle}' RETURNING id`],
  ]) {
    await test(`${label}: AAL1 staff denied, AAL2 staff allowed`, async () => {
      for (const actor of ["admin", "moderator"]) { await affected(actor, "aal1", statement, 0); await affected(actor, "aal2", statement, 1); }
    });
  }
  await test("staff-only audit insertion requires AAL2", async () => {
    const statement = `INSERT INTO public.moderation_actions(moderator_id,target_type,target_id,action,reason) VALUES ('${ids.admin}','post','${ids.post}','hide','Synthetic test')`;
    await assert.rejects(() => asActor("admin", "aal1", () => sql(statement)), error => error.code === "42501");
    await affected("admin", "aal2", statement, 1);
  });
  await test("ordinary AAL1 owner writes/public reads and cross-user isolation remain", async () => {
    await affected("a", "aal1", `UPDATE public.posts SET body='Updated synthetic body' WHERE id='${ids.post}' RETURNING id`, 1);
    await affected("a", "aal1", `UPDATE public.circles SET description='Owner change' WHERE id='${ids.circle}' RETURNING id`, 1);
    await affected("a", "aal1", `DELETE FROM public.post_media WHERE id='${ids.media}' RETURNING id`, 1);
    await affected("a", "aal1", `DELETE FROM storage.objects WHERE id='${ids.media}' RETURNING id`, 1);
    for (const aal of ["aal1", "aal2"]) await affected("b", aal, `UPDATE public.posts SET body='Foreign synthetic body' WHERE id='${ids.post}' RETURNING id`, 0);
    await asActor("a", "aal1", async () => assert.equal((await sql(`SELECT id FROM public.posts WHERE id='${ids.post}'`)).rowCount, 1), "anon");
  });
  await test("identity/profile role stays available at AAL1; no role escalation grant", async () => {
    await asActor("admin", "aal1", async () => {
      assert.equal((await sql("SELECT public.current_user_role() AS role")).rows[0].role, "admin");
      assert.equal((await sql(`SELECT role FROM public.profiles WHERE id='${ids.admin}'`)).rows[0].role, "admin");
      assert.equal((await sql("SELECT has_column_privilege(current_user,'public.profiles','role','UPDATE') AS allowed")).rows[0].allowed, false);
    });
  });
  await test("missing/unknown AAL or metadata claims do not grant staff privilege", async () => {
    for (const aal of [undefined, null, "aal3"]) await asActor("admin", aal, async () => assert.equal((await sql("SELECT public.is_moderator_or_admin() AS allowed")).rows[0].allowed, false));
    await asActor("admin", "aal1", async () => assert.equal((await sql("SELECT public.is_moderator_or_admin() AS allowed")).rows[0].allowed, false), "authenticated", { user_metadata: { aal: "aal2" } });
    await asActor("a", "aal2", async () => assert.equal((await sql("SELECT public.is_moderator_or_admin() AS allowed")).rows[0].allowed, false));
  });
  await test("catalog capability requires admin AND AAL2, not moderator or ordinary user", async () => {
    for (const actor of ["admin", "moderator", "a"]) for (const aal of ["aal1", "aal2"]) {
      await asActor(actor, aal, async () => assert.equal((await sql("SELECT public.is_catalog_admin() AS allowed")).rows[0].allowed, actor === "admin" && aal === "aal2"));
    }
  });
  await test("direct purge/QA role RPCs remain unavailable to authenticated even at AAL2", async () => {
    for (const aal of ["aal1", "aal2"]) for (const func of ["admin_purge_circle_v1", "admin_circle_purge_preview_v1", "qa_grant_admin_role", "qa_revoke_admin_role"]) {
      await assert.rejects(() => asActor("admin", aal, () => sql(`SELECT * FROM public.${func}('${ids.empty}')`)), error => error.code === "42501");
    }
    await asActor("admin", "aal2", async () => assert.equal((await sql(`SELECT purged FROM public.admin_purge_circle_v1('${ids.empty}')`)).rows[0].purged, true), "service_role");
  });
  await test("inherited PUBLIC execute drift is rejected before capability changes", async () => {
    await sql("BEGIN; GRANT EXECUTE ON FUNCTION public.admin_purge_circle_v1(uuid) TO PUBLIC;");
    await assert.rejects(() => sql(delta), /STAFF_AAL2_PRIVILEGED_RPC_GRANT_DRIFT/);
    await sql("ROLLBACK");
  });
  await test("drift/replay rejected and absent held Catalog helper not created", async () => {
    await assert.rejects(() => sql(`BEGIN; ${delta} COMMIT;`), /STAFF_AAL2_BASELINE_DRIFT/); await sql("ROLLBACK");
    await sql("BEGIN; DROP FUNCTION public.is_catalog_admin();");
    const original = (await source("20260518_forum_phase1_schema.sql"));
    const start = original.indexOf("create or replace function public.is_moderator_or_admin()");
    await sql(original.slice(start, original.indexOf("$$;", start) + 3));
    await sql(delta);
    assert.equal((await sql("SELECT to_regprocedure('public.is_catalog_admin()') IS NULL AS absent")).rows[0].absent, true);
    await sql("ROLLBACK");
  });
} catch (error) { failure = error; }
finally {
  try {
    if (db) await db.end();
    if (initialized) {
      const stopped = await command("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"]);
      const status = await command("pg_ctl", ["-D", data, "status"]);
      assert.equal(status.code, 3, "local PostgreSQL shutdown unconfirmed");
      if (started) assert.equal(stopped.code, 0, "local PostgreSQL stop failed");
    }
    const relative = path.relative(os.tmpdir(), temp);
    assert(relative && !relative.startsWith("..") && path.basename(temp).startsWith("ogh-admin-mfa-closure-"));
    await rm(temp, { recursive: true, force: true });
    console.log("LOCAL_DATABASE_CLEANUP=CONFIRMED");
  } catch (cleanupError) { console.log("LOCAL_DATABASE_CLEANUP=UNCONFIRMED"); failure ??= cleanupError; }
}
if (failure) throw failure;

const vite = await createServer({
  logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [react(), {
    name: "mfa-session-fixture", enforce: "pre",
    resolveId(id, importer) { return id === "./useAdminSession" && importer?.endsWith("AdminSecurityPanel.tsx") ? "\0mfa-session-fixture" : null; },
    load(id) { return id === "\0mfa-session-fixture" ? "export function useAdminSession(){return globalThis.__mfaClosureSession;}" : null; },
  }],
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
});
const originalFetch = globalThis.fetch;
try {
  const { removeAdminTotp } = await vite.ssrLoadModule("/src/lib/admin-totp.ts");
  let factors, operations, refreshError, staleReadback, currentSession, identityHeaders;
  function reset() { factors = [{ id: "old", factor_type: "totp", status: "verified" }, { id: "backup", factor_type: "totp", status: "verified" }]; operations = []; refreshError = false; staleReadback = false; currentSession = session; identityHeaders = []; }
  const session = { access_token: "nonsecret-local-fixture", user: { id: ids.admin } };
  globalThis.fetch = async (input, options) => {
    assert(["/api/admin/forum/me", "/api/admin/mfa"].includes(input));
    if (input.endsWith("/me")) identityHeaders.push(options.headers.authorization);
    return new Response(JSON.stringify(input.endsWith("/me") ? { user_id: currentSession.user.id, role: "admin", allowed: true } : { aal: "aal2" }), { headers: { "content-type": "application/json" } });
  };
  const client = { auth: {
    getSession: async () => ({ data: { session: currentSession }, error: null }),
    refreshSession: async () => { operations.push("refresh"); currentSession = { ...session, access_token: "nonsecret-refreshed-local-fixture" }; return { data: { session: refreshError ? null : currentSession }, error: refreshError ? {} : null }; },
    mfa: {
      listFactors: async () => ({ data: { all: factors }, error: null }),
      challenge: async () => ({ data: { id: "challenge" }, error: null }),
      verify: async () => ({ error: null }),
      unenroll: async ({ factorId }) => { operations.push("unenroll"); if (!staleReadback) factors = factors.filter(f => f.id !== factorId); return { error: null }; },
    },
  } };
  await test("factor retirement refreshes session and independently verifies remaining backup", async () => {
    reset(); await removeAdminTotp(client, "old", "backup", "123456"); assert.deepEqual(operations, ["unenroll", "refresh"]);
    assert.equal(identityHeaders.at(-1), "Bearer nonsecret-refreshed-local-fixture");
  });
  await test("failed refresh is unconfirmed, never retried", async () => {
    reset(); refreshError = true; await assert.rejects(() => removeAdminTotp(client, "old", "backup", "123456"), /MFA_SESSION_REFRESH_UNCONFIRMED/); assert.deepEqual(operations, ["unenroll", "refresh"]);
  });
  await test("provider success without removal readback is unconfirmed", async () => {
    reset(); staleReadback = true; await assert.rejects(() => removeAdminTotp(client, "old", "backup", "123456"), /MFA_REMOVE_UNCONFIRMED/); assert.deepEqual(operations, ["unenroll", "refresh"]);
  });
  await test("actual component rejects double dispatch and late enrollment secret after account change", async () => {
    reset();
    const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1" });
    const globals = ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"];
    const saved = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    let resolveEnrollment, dispatches = 0;
    client.auth.mfa.enroll = () => { dispatches++; return new Promise(resolve => { resolveEnrollment = resolve; }); };
    globalThis.__mfaClosureSession = { supabase: client, state: { status: "ready", me: { user_id: ids.admin } } };
    const Component = (await vite.ssrLoadModule("/src/components/admin/AdminSecurityPanel.tsx")).default;
    const container = dom.window.document.getElementById("root");
    const mounted = createRoot(container);
    try {
      await act(async () => mounted.render(createElement(Component)));
      const add = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Add authenticator");
      await act(async () => {
        add.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
        add.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      assert.equal(dispatches, 1);
      assert.equal(typeof resolveEnrollment, "function");
      currentSession = { ...session, user: { id: ids.b } }; factors = [];
      globalThis.__mfaClosureSession = { supabase: client, state: { status: "ready", me: { user_id: ids.b } } };
      await act(async () => mounted.render(createElement(Component)));
      await act(async () => resolveEnrollment({ data: { id: "new", type: "totp", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "NONSECRET_LATE_FIXTURE" } }, error: null }));
      assert(!container.textContent.includes("NONSECRET_LATE_FIXTURE"));
      assert.equal(container.querySelector(".admin-security-enrollment"), null);
    } finally {
      await act(async () => mounted.unmount());
      dom.window.close(); delete globalThis.__mfaClosureSession;
      for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    }
  });
} finally { globalThis.fetch = originalFetch; await vite.close(); }
console.log(JSON.stringify({ incrementalTests: tests, productionRequests: 0, productionDatabaseConnections: 0, deployments: 0, fullSchemaParity: "NOT_CLAIMED" }));
