import type { SupabaseClient } from "@supabase/supabase-js";

// Only the role/identity endpoint remains available at AAL1 for MFA setup.
export function requiresAdminAssurance(request: Request): boolean {
  return !(request.method === "GET" && /^\/api\/admin\/forum\/me\/?$/.test(new URL(request.url).pathname));
}

export async function assertStaffWriteAssurance(request: Request, client: SupabaseClient, token: string, userId: string, role: string | null | undefined): Promise<void> {
  if (!["GET", "HEAD"].includes(request.method) && (role === "admin" || role === "moderator")) {
    await assertAdminAssurance(client, token, userId);
  }
}

export async function assertAdminAssurance(client: SupabaseClient, token: string, userId: string): Promise<void> {
  // getClaims verifies the signature (or consults Auth for symmetric signing keys).
  // Neither decoded client claims nor user_metadata is authorization evidence.
  const { data, error } = await client.auth.getClaims(token).catch(() => {
    throw new Response(JSON.stringify({ error: "MFA verification unavailable" }), {
      status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  });
  if (error || !data?.claims || data.claims.sub !== userId) {
    throw new Response(JSON.stringify({ error: "Invalid auth token" }), {
      status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  if (data.claims.aal !== "aal2") {
    throw new Response(JSON.stringify({ error: "MFA verification required", code: "ADMIN_AAL2_REQUIRED", mfaPath: "/admin/security/" }), {
      status: 403, headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}
