import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ logLevel: "error", server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
const originalFetch = globalThis.fetch;
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const userId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "local-admin-mfa-fixture", alg: "RS256", use: "sig" };
function jwt(aal, extra = {}) {
  const head = Buffer.from(JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ sub: userId, aal, aud: "authenticated", role: "authenticated", iss: "http://127.0.0.1:54321/auth/v1", exp: Math.floor(Date.now() / 1000) + 300, ...extra })).toString("base64url");
  return `${head}.${body}.${sign("RSA-SHA256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url")}`;
}
const env = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "nonsecret-offline-fixture" };
const request = (token, method = "POST", path = "/api/admin/users/fixture/ban") => new Request(`http://127.0.0.1${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
let role = "admin";
let userError = false;
let calls = [];
function response(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function serverFetch(input) {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  assert.equal(url.origin, "http://127.0.0.1:54321", "no provider connection allowed");
  calls.push(url.pathname);
  if (url.pathname === "/auth/v1/user") return Promise.resolve(userError ? response({ code: "bad_jwt", message: "fixture" }, 401) : response({ id: userId, aud: "authenticated", role: "authenticated" }));
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return Promise.resolve(response({ keys: [jwk] }));
  if (url.pathname === "/rest/v1/profiles") return Promise.resolve(response({ role, username: null, display_name: null, avatar_url: null }));
  throw new Error("UNEXPECTED_OFFLINE_REQUEST");
}
async function denied(fn, status) {
  await assert.rejects(fn, error => error instanceof Response && error.status === status);
}

try {
  globalThis.fetch = serverFetch;
  const { requireModerator, requireAdmin } = await vite.ssrLoadModule("/src/lib/server/admin-auth.ts");
  const { handleAdminCirclePurge } = await vite.ssrLoadModule("/src/lib/server/admin-circle-purge.server.ts");
  const { requiresAdminAssurance, assertStaffWriteAssurance, assertAdminAssurance } = await vite.ssrLoadModule("/src/lib/server/admin-assurance.ts");
  const { createUserClient } = await vite.ssrLoadModule("/src/lib/server/admin-auth.ts");
  const { requireForumUser, requireManagedCircleForAuthenticatedUser } = await vite.ssrLoadModule("/src/lib/server/circle-management.ts");
  await test("missing identity denied before any provider request", async () => {
    calls = []; await denied(() => requireAdmin(request(null), env), 401); assert.equal(calls.length, 0);
  });
  await test("AAL1 staff can reach only the GET identity/setup admission", async () => {
    const result = await requireModerator(request(jwt("aal1"), "GET", "/api/admin/forum/me"), env);
    assert.equal(result.profile.role, "admin");
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) assert.equal(requiresAdminAssurance(request(null, method, "/api/admin/forum/me")), true);
    assert.equal(requiresAdminAssurance(request(null, "GET", "/api/admin/forum/me/extra")), true);
  });
  await test("AAL1 cannot read sensitive admin data or write through any HTTP verb", async () => {
    for (const method of ["GET", "POST", "PATCH", "DELETE", "PUT"]) await denied(() => requireAdmin(request(jwt("aal1"), method), env), 403);
  });
  await test("signed AAL2 admin and moderator preserve their existing role boundary", async () => {
    assert.equal((await requireAdmin(request(jwt("aal2")), env)).user.id, userId);
    role = "moderator";
    assert.equal((await requireModerator(request(jwt("aal2")), env)).profile.role, "moderator");
    await denied(() => requireAdmin(request(jwt("aal2")), env), 403);
    role = "user"; await denied(() => requireModerator(request(jwt("aal2")), env), 403); role = "admin";
  });
  await test("metadata, unknown assurance, missing assurance and subject mismatch fail closed", async () => {
    await denied(() => requireAdmin(request(jwt("aal1", { user_metadata: { aal: "aal2", role: "admin" } })), env), 403);
    for (const aal of [undefined, "aal3", null]) await denied(() => requireAdmin(request(jwt(aal)), env), 403);
    await denied(() => requireAdmin(request(jwt("aal2", { sub: otherId })), env), 401);
  });
  await test("tampered signature rejected by real SDK getClaims even if user lookup succeeds", async () => {
    const parts = jwt("aal2").split(".");
    parts[2] = Buffer.alloc(256).toString("base64url");
    await denied(() => requireAdmin(request(parts.join(".")), env), 401);
  });
  await test("invalid live user lookup stops before role or business access", async () => {
    calls = []; userError = true;
    await denied(() => requireAdmin(request(jwt("aal2")), env), 401);
    assert.deepEqual(calls, ["/auth/v1/user"]); userError = false;
  });
  await test("expired signed AAL2 token is rejected", async () => {
    await denied(() => requireAdmin(request(jwt("aal2", { exp: 1 })), env), 401);
  });
  await test("claims transport exceptions are sanitized unavailable failures, not authorization", async () => {
    await assert.rejects(() => assertAdminAssurance({ auth: { getClaims: async () => { throw new Error("private fixture details"); } } }, "fixture", userId), error => {
      return error instanceof Response && error.status === 503;
    });
  });
  await test("ordinary forum users need no MFA; staff writes cannot bypass through forum identity helper", async () => {
    role = "user";
    assert.equal((await requireForumUser(request(jwt("aal1")), env)).user.id, userId);
    const token = jwt("aal1"); const client = createUserClient(env, token);
    await assertStaffWriteAssurance(request(token), client, token, userId, "user");
    role = "admin";
    await denied(() => requireForumUser(request(token), env), 403);
    await denied(() => assertStaffWriteAssurance(request(token), client, token, userId, "moderator"), 403);
  });
  await test("circle-owner ordinary access preserved; staff management requires AAL2", async () => {
    const token = jwt("aal1"); const client = createUserClient(env, token);
    const circleClient = { ...client, from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: otherId, owner_id: userId, status: "active" }, error: null }) }) };
    const base = { token, user: { id: userId }, client: circleClient, profile: { id: userId, role: "user" } };
    assert.equal((await requireManagedCircleForAuthenticatedUser({ auth: base, slug: "local" })).circle.id, otherId);
    await denied(() => requireManagedCircleForAuthenticatedUser({ auth: { ...base, profile: { ...base.profile, role: "admin" } }, slug: "local" }), 403);
    await denied(() => requireManagedCircleForAuthenticatedUser({ auth: { ...base, user: { id: otherId } }, slug: "local" }), 403);
  });
  await test("circle service-role client/storage/RPC cannot begin from AAL1", async () => {
    let privileged = 0;
    const req = new Request("http://127.0.0.1/api/admin/forum/circles/purge", { method: "POST", headers: { authorization: `Bearer ${jwt("aal1")}`, "content-type": "application/json" }, body: JSON.stringify({ id: otherId, action: "purge" }) });
    const result = await handleAdminCirclePurge(req, env, { createAdminClient: () => { privileged++; throw new Error("unreachable"); } });
    assert.equal(result.status, 403); assert.equal(privileged, 0);
  });

  const totp = await vite.ssrLoadModule("/src/lib/admin-totp.ts");
  let factors;
  let operations;
  let failVerify;
  let serverAal2;
  let staffRole;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "nonsecret-fixture", user: { id: userId } } }, error: null }),
      mfa: {
        listFactors: async () => ({ data: { all: factors }, error: null }),
        enroll: async () => { operations.push("enroll"); return { data: { id: "new", type: "totp", totp: { qr_code: "fixture", secret: "nonsecret-fixture" } }, error: null }; },
        challenge: async ({ factorId }) => { operations.push(`challenge:${factorId}`); return { data: { id: "challenge" }, error: null }; },
        verify: async ({ factorId, challengeId, code }) => { assert.equal(challengeId, "challenge"); assert.equal(code, "123456"); operations.push(`verify:${factorId}`); return { error: failVerify ? { message: "not exported" } : null }; },
        unenroll: async ({ factorId }) => { operations.push(`remove:${factorId}`); return { error: null }; },
      },
    },
  };
  function reset() { operations = []; failVerify = false; serverAal2 = true; staffRole = "admin"; factors = [{ id: "one", factor_type: "totp", status: "verified" }]; }
  globalThis.fetch = async input => {
    assert(["/api/admin/forum/me", "/api/admin/mfa"].includes(input));
    if (input.endsWith("/me")) return response({ user_id: userId, role: staffRole, allowed: staffRole !== "user" });
    return serverAal2 ? response({ aal: "aal2" }) : response({ code: "ADMIN_AAL2_REQUIRED" }, 403);
  };
  await test("first enrollment remains reachable at AAL1; adding factors requires AAL2", async () => {
    reset(); factors = []; serverAal2 = false;
    await totp.enrollAdminTotp(client); assert.deepEqual(operations, ["enroll"]);
    reset(); serverAal2 = false; await assert.rejects(() => totp.enrollAdminTotp(client)); assert.deepEqual(operations, []);
  });
  await test("ordinary or changed identity cannot start factor operations", async () => {
    reset(); staffRole = "user";
    await assert.rejects(() => totp.enrollAdminTotp(client)); assert.deepEqual(operations, []);
  });
  await test("verification challenges exact own factor and checks server AAL2", async () => {
    reset(); await totp.verifyAdminTotp(client, "one", "123456"); assert.deepEqual(operations, ["challenge:one", "verify:one"]);
    reset(); await assert.rejects(() => totp.verifyAdminTotp(client, "foreign", "123456")); assert.deepEqual(operations, []);
    await assert.rejects(() => totp.verifyAdminTotp(client, "one", "bad")); assert.deepEqual(operations, []);
    reset(); serverAal2 = false; await assert.rejects(() => totp.verifyAdminTotp(client, "one", "123456"));
  });
  await test("last verified factor and self-backup removal are forbidden", async () => {
    reset(); await assert.rejects(() => totp.removeAdminTotp(client, "one", "one", "123456"));
    await assert.rejects(() => totp.removeAdminTotp(client, "one", "absent", "123456")); assert.deepEqual(operations, []);
  });
  await test("replacement requires successful possession proof of a different verified backup", async () => {
    reset(); factors.push({ id: "two", factor_type: "totp", status: "verified" });
    await totp.removeAdminTotp(client, "one", "two", "123456");
    assert.deepEqual(operations, ["challenge:two", "verify:two", "remove:one"]);
    operations = []; failVerify = true;
    await assert.rejects(() => totp.removeAdminTotp(client, "one", "two", "123456")); assert(!operations.some(op => op.startsWith("remove:")));
  });
  await test("unverified abandoned enrollment can be removed without deleting a verified factor", async () => {
    reset(); factors = [{ id: "new", factor_type: "totp", status: "unverified" }];
    await totp.removeAdminTotp(client, "new", "", ""); assert.deepEqual(operations, ["remove:new"]);
  });
  await test("new MFA files contain no secret logging, storage or service-role client", async () => {
    for (const file of ["src/lib/admin-totp.ts", "src/components/admin/AdminSecurityPanel.tsx"]) {
      const source = await fs.readFile(file, "utf8");
      assert.doesNotMatch(source, /console\.|localStorage|sessionStorage|service_role|SERVICE_ROLE|dangerouslySetInnerHTML/);
    }
  });
  await test("existing public forum staff mutations retain the assurance gate before effects", async () => {
    for (const [file, methods] of [["posts", ["DELETE", "PATCH"]], ["comments", ["DELETE"]]]) {
      const source = await fs.readFile(`src/pages/api/forum/${file}.ts`, "utf8");
      for (const method of methods) {
        const start = source.indexOf(`export const ${method}:`);
        const end = source.indexOf("export const ", start + 1);
        const block = source.slice(start, end < 0 ? undefined : end);
        assert(block.indexOf("await assertStaffWriteAssurance(") < block.indexOf('.update('));
        assert(block.includes("if (err instanceof Response) return err;"));
      }
    }
  });
  console.log(JSON.stringify({ targetedTests: passed, productionRequests: 0, databaseConnections: 0, deployed: false, databaseAal2Boundary: "NOT_CHANGED_NOT_CLOSED" }));
} finally {
  globalThis.fetch = originalFetch;
  await vite.close();
}
