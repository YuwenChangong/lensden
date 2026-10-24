import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { isModeratorRole } from "./admin-auth";

export type ForumRuntimeEnv = Record<string, string | undefined>;

export type ForumProfile = {
  id: string;
  role: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

export type ManagedCircleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  status: string | null;
  created_at: string;
  updated_at?: string | null;
  image_path?: string | null;
  owner_id?: string | null;
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export function requireEnv(env: ForumRuntimeEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function createAnonClient(env: ForumRuntimeEnv): SupabaseClient {
  return createClient(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_ANON_KEY"));
}

export function createUserClient(env: ForumRuntimeEnv, bearerToken: string): SupabaseClient {
  return createClient(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_ANON_KEY"), {
    global: {
      headers: { Authorization: `Bearer ${bearerToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function normalizeCircleSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isCircleManager(ownerId: string | null | undefined, userId: string, role: string | null | undefined) {
  return isModeratorRole(role) || (!!ownerId && ownerId === userId);
}

function isMissingCircleStatusSchemaError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("status") && message.includes("does not exist");
}

function isCircleManageRlsError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("row-level security") || message.includes("permission denied");
}

export type ForumUserAuth = {
  token: string;
  client: SupabaseClient;
  user: User;
  profile: ForumProfile;
};

export async function requireForumUser(request: Request, env: ForumRuntimeEnv): Promise<ForumUserAuth> {
  const token = getBearerToken(request);
  if (!token) {
    throw jsonResponse({ error: "NOT_AUTHENTICATED" }, 401);
  }

  const client = createUserClient(env, token);
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) {
    throw jsonResponse({ error: "NOT_AUTHENTICATED" }, 401);
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, role, username, display_name, avatar_url")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    throw jsonResponse({ error: "PROFILE_NOT_FOUND", details: profileError.message }, 403);
  }
  if (!profile) {
    throw jsonResponse({ error: "PROFILE_NOT_FOUND" }, 403);
  }

  return {
    token,
    client,
    user: authData.user,
    profile: profile as ForumProfile,
  };
}

export async function requireManagedCircleForAuthenticatedUser(params: {
  auth: ForumUserAuth;
  slug: string;
}): Promise<ForumUserAuth & {
  circle: ManagedCircleRow;
}> {
  const { auth } = params;
  let { data: circle, error } = await auth.client
    .from("circles")
    .select("id, slug, name, description, type, status, created_at, updated_at, image_path, owner_id")
    .eq("slug", params.slug)
    .maybeSingle();

  if (error && isMissingCircleStatusSchemaError(error)) {
    const fallback = await auth.client
      .from("circles")
      .select("id, slug, name, description, type, created_at, updated_at, image_path, owner_id")
      .eq("slug", params.slug)
      .maybeSingle();
    circle = fallback.data
      ? {
          ...fallback.data,
          status: "active",
        }
      : null;
    error = fallback.error;
  }

  if (error) {
    if (isMissingCircleStatusSchemaError(error)) {
      throw jsonResponse({ error: "CIRCLE_STATUS_COLUMN_MISSING", details: error.message }, 503);
    }
    if (isCircleManageRlsError(error)) {
      throw jsonResponse({ error: "CIRCLE_DELETE_RLS_FAILED", details: error.message }, 403);
    }
    throw jsonResponse({ error: "CIRCLE_MANAGE_QUERY_FAILED", details: error.message }, 500);
  }
  if (!circle) {
    throw jsonResponse({ error: "CIRCLE_NOT_FOUND" }, 404);
  }
  if (!isCircleManager(circle.owner_id, auth.user.id, auth.profile.role)) {
    throw jsonResponse({ error: "CIRCLE_MANAGE_FORBIDDEN" }, 403);
  }

  return {
    ...auth,
    circle: circle as ManagedCircleRow,
  };
}

export async function requireManagedCircleBySlug(params: {
  request: Request;
  env: ForumRuntimeEnv;
  slug: string;
}) {
  const auth = await requireForumUser(params.request, params.env);
  return requireManagedCircleForAuthenticatedUser({ auth, slug: params.slug });
}
