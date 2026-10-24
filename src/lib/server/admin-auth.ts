import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertAdminAssurance } from "./admin-assurance";

export type RuntimeEnv = Record<string, string | undefined>;

export type ModeratorAuthResult = {
  user: { id: string };
  profile: {
    role: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  client: SupabaseClient;
};

export type AdminAuthResult = ModeratorAuthResult;

export function isModeratorRole(role: string | null | undefined): boolean {
  return role === "moderator" || role === "admin";
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function requireEnv(env: RuntimeEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

export function createUserClient(env: RuntimeEnv, bearerToken: string): SupabaseClient {
  return createClient(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireModerator(request: Request, env: RuntimeEnv): Promise<ModeratorAuthResult> {
  const token = getBearerToken(request);
  if (!token) {
    throw jsonResponse({ error: "Missing bearer token" }, 401);
  }

  const client = createUserClient(env, token);
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) {
    throw jsonResponse({ error: "Invalid auth token" }, 401);
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role,username,display_name,avatar_url")
    .eq("id", authData.user.id)
    .maybeSingle();

  // Note: admin access still reads profiles.role, but that field is intended to be
  // database-protected by a dedicated RLS/grant/trigger migration and must never be
  // user-editable through ordinary profile update paths.

  if (profileError) {
    throw jsonResponse({ error: "Profile lookup failed", details: profileError.message }, 500);
  }

  if (!profile) {
    throw jsonResponse({ error: "Forbidden", details: "profile role not found or not moderator/admin" }, 403);
  }

  if (!isModeratorRole(profile.role)) {
    throw jsonResponse({ error: "Forbidden", details: "profile role not found or not moderator/admin" }, 403);
  }

  // Enrollment-only artifact: only the assurance readback must already prove AAL2.
  // The separately bound enforcement artifact enables the other staff guards.
  if (request.method === "GET" && /^\/api\/admin\/mfa\/?$/.test(new URL(request.url).pathname)) {
    await assertAdminAssurance(client, token, authData.user.id);
  }

  return {
    user: { id: authData.user.id },
    profile: {
      role: profile.role,
      username: profile.username ?? null,
      display_name: profile.display_name ?? null,
      avatar_url: profile.avatar_url ?? null,
    },
    client,
  };
}

export async function requireAdmin(request: Request, env: RuntimeEnv): Promise<AdminAuthResult> {
  const auth = await requireModerator(request, env);
  if (!isAdminRole(auth.profile.role)) {
    throw jsonResponse({ error: "Forbidden", details: "profile role is not admin" }, 403);
  }

  return auth;
}
