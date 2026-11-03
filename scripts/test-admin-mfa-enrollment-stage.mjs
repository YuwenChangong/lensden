import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const production = "0b6d94ffbfaf4cb388fe217b9f1609e3090b60e5";
const enforcement = "8b0882f09a26375675b21c6f0682c2221365dbf3";
const root = new URL("../", import.meta.url);
const canonical = value => value.toString().replaceAll("\r\n", "\n");
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
await test("only enrollment stage guards differ; public forum behavior matches deployed RC", async () => {
  for (const file of ["src/lib/server/circle-management.ts", "src/pages/api/forum/posts.ts", "src/pages/api/forum/comments.ts"]) {
    assert.equal(canonical(await readFile(new URL(file, root))), canonical(execFileSync("git", ["show", `${production}:${file}`])));
  }
  const changed = execFileSync("git", ["diff", "--name-only", enforcement, "--", "src", "supabase/migrations", "wrangler.toml", "package.json", "package-lock.json"], { encoding: "utf8" }).trim().split(/\r?\n/).sort();
  assert.deepEqual(changed, ["src/lib/admin-totp.ts", "src/lib/server/admin-auth.ts", "src/lib/server/circle-management.ts", "src/pages/api/forum/comments.ts", "src/pages/api/forum/posts.ts"]);
});

const id = "00000000-0000-4000-8000-000000000001";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "offline-enrollment-stage", alg: "RS256", use: "sig" };
function jwt(aal) {
  const payload = { sub: id, aal, aud: "authenticated", role: "authenticated", iss: "http://127.0.0.1:54321/auth/v1", exp: Math.floor(Date.now() / 1000) + 300 };
  const value = [JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" }), JSON.stringify(payload)].map(s => Buffer.from(s).toString("base64url")).join(".");
  return `${value}.${sign("RSA-SHA256", Buffer.from(value), privateKey).toString("base64url")}`;
}
const env = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "nonsecret-offline-fixture" };
let role = "admin";
let calls = 0;
const original = globalThis.fetch;
const vite = await createServer({
  configFile: false, logLevel: "error", appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  plugins: [{
    name: "offline-runtime-env",
    resolveId: id => id === "cloudflare:workers" ? "\0offline-runtime-env" : undefined,
    load: id => id === "\0offline-runtime-env" ? `export const env = ${JSON.stringify(env)};` : undefined,
  }],
});
globalThis.fetch = async input => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  assert.equal(url.origin, env.SUPABASE_URL, "external requests prohibited");
  calls++;
  let data;
  if (url.pathname === "/auth/v1/user") data = { id, aud: "authenticated", role: "authenticated" };
  else if (url.pathname === "/auth/v1/.well-known/jwks.json") data = { keys: [jwk] };
  else if (url.pathname === "/rest/v1/profiles") data = { role };
  else throw new Error("UNEXPECTED_OFFLINE_REQUEST");
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
};
const request = (aal, path, method = "GET") => new Request(`http://127.0.0.1${path}`, { method, headers: { authorization: `Bearer ${jwt(aal)}` } });
try {
  const { requireModerator } = await vite.ssrLoadModule("/src/lib/server/admin-auth.ts");
  const { GET } = await vite.ssrLoadModule("/src/pages/api/admin/mfa.ts");
  await test("AAL1 admin retains existing setup identity and role-only guard until phase two", async () => {
    for (const [path, method] of [["/api/admin/forum/me", "GET"], ["/api/admin/forum/reports", "GET"], ["/api/admin/users/fixture/ban", "POST"]]) {
      assert.equal((await requireModerator(request("aal1", path, method), env)).user.id, id);
    }
  });
  await test("both exact status URL forms refuse AAL1 instead of claiming AAL2", async () => {
    for (const path of ["/api/admin/mfa", "/api/admin/mfa/"]) {
      const response = await GET({ request: request("aal1", path), locals: { runtime: { env } } });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "ADMIN_AAL2_REQUIRED");
    }
  });
  await test("real signed AAL2 reaches the existing status response", async () => {
    const response = await GET({ request: request("aal2", "/api/admin/mfa"), locals: { runtime: { env } } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { aal: "aal2" });
  });
  await test("ordinary role and unauthenticated callers still fail", async () => {
    role = "user";
    assert.equal((await GET({ request: request("aal2", "/api/admin/mfa"), locals: { runtime: { env } } })).status, 403);
    role = "admin";
    calls = 0;
    await assert.rejects(() => requireModerator(new Request("http://127.0.0.1/api/admin/forum/me"), env), error => error instanceof Response && error.status === 401);
    assert.equal(calls, 0);
  });
  const totp = await vite.ssrLoadModule("/src/lib/admin-totp.ts");
  let refreshError = false;
  let missingSession = false;
  let sequence = [];
  const client = { auth: {
    getSession: async () => ({ data: { session: { access_token: "nonsecret-fixture", user: { id } } }, error: null }),
    refreshSession: async () => { sequence.push("refresh"); return { data: { session: missingSession ? null : {} }, error: refreshError ? {} : null }; },
    mfa: {
      listFactors: async () => ({ data: { all: [{ id: "fixture", factor_type: "totp", status: "verified" }] }, error: null }),
      challenge: async () => { sequence.push("challenge"); return { data: { id: "fixture-challenge" }, error: null }; },
      verify: async () => { sequence.push("verify"); return { error: null }; },
    },
  } };
  globalThis.fetch = async input => {
    assert(["/api/admin/forum/me", "/api/admin/mfa"].includes(input));
    if (input.endsWith("/mfa")) sequence.push("server-aal2");
    return new Response(JSON.stringify(input.endsWith("/me") ? { user_id: id, role: "admin", allowed: true } : { aal: "aal2" }), { headers: { "content-type": "application/json" } });
  };
  await test("enrollment verification refreshes before server-confirmed AAL2", async () => {
    await totp.verifyAdminTotp(client, "fixture", "123456");
    assert.deepEqual(sequence, ["challenge", "verify", "refresh", "server-aal2"]);
  });
  await test("refresh error is not reported as enrollment acceptance", async () => {
    sequence = []; refreshError = true;
    await assert.rejects(() => totp.verifyAdminTotp(client, "fixture", "123456"), /MFA_SESSION_REFRESH_UNCONFIRMED/);
    assert.deepEqual(sequence, ["challenge", "verify", "refresh"]);
  });
  await test("missing refreshed session remains unconfirmed without retry", async () => {
    sequence = []; refreshError = false; missingSession = true;
    await assert.rejects(() => totp.verifyAdminTotp(client, "fixture", "123456"), /MFA_SESSION_REFRESH_UNCONFIRMED/);
    assert.deepEqual(sequence, ["challenge", "verify", "refresh"]);
  });
  console.log(JSON.stringify({ targetedChecks: passed, productionRequests: 0, databaseConnections: 0, scope: "ENROLLMENT_ARTIFACT_ASSEMBLY_ONLY_NOT_PRODUCTION_ACCEPTANCE" }));
} finally {
  globalThis.fetch = original;
  await vite.close();
}
