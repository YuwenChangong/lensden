import type { SupabaseClient } from "@supabase/supabase-js";
import { adminFetch } from "./admin-api-client";

// Enrollment secrets and codes are returned only to the calling component's memory.
// Do not log provider errors: some providers include request details in messages.
export async function requireStaffMfaSession(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  const session = data.session;
  if (error || !session) throw new Error("ADMIN_SESSION_REQUIRED");
  const me = await adminFetch<{ user_id: string; role: string; allowed: boolean }>("/api/admin/forum/me", { session });
  if (!me.allowed || !["admin", "moderator"].includes(me.role) || me.user_id !== session.user.id) {
    throw new Error("ADMIN_SESSION_REQUIRED");
  }
  return session;
}

export async function loadAdminFactors(client: SupabaseClient) {
  await requireStaffMfaSession(client);
  const { data, error } = await client.auth.mfa.listFactors();
  if (error || !data) throw new Error("MFA_FACTORS_UNAVAILABLE");
  return data.all.filter(factor => factor.factor_type === "totp");
}

export async function enrollAdminTotp(client: SupabaseClient) {
  const factors = await loadAdminFactors(client);
  if (factors.some(factor => factor.status === "verified")) {
    await confirmAdminAal2(client);
  }
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `Lensden ${crypto.randomUUID()}`, issuer: "Lensden" });
  if (error || !data) throw new Error("MFA_ENROLL_FAILED");
  return data;
}

export async function confirmAdminAal2(client: SupabaseClient) {
  const session = await requireStaffMfaSession(client);
  const result = await adminFetch<{ aal: string }>("/api/admin/mfa", { session });
  if (result.aal !== "aal2") throw new Error("ADMIN_AAL2_REQUIRED");
}

export async function verifyAdminTotp(client: SupabaseClient, factorId: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("MFA_CODE_INVALID");
  const factors = await loadAdminFactors(client);
  if (!factors.some(factor => factor.id === factorId)) throw new Error("MFA_FACTOR_MISMATCH");
  const { data, error } = await client.auth.mfa.challenge({ factorId });
  if (error || !data) throw new Error("MFA_CHALLENGE_FAILED");
  const verified = await client.auth.mfa.verify({ factorId, challengeId: data.id, code });
  if (verified.error) throw new Error("MFA_VERIFY_FAILED");
  await confirmAdminAal2(client);
}

export async function removeAdminTotp(client: SupabaseClient, factorId: string, backupId: string, backupCode: string) {
  const factors = await loadAdminFactors(client);
  const target = factors.find(factor => factor.id === factorId);
  if (!target) throw new Error("MFA_FACTOR_MISMATCH");
  if (target.status === "verified") {
    if (factorId === backupId || !factors.some(factor => factor.id === backupId && factor.status === "verified")) {
      throw new Error("MFA_VERIFIED_BACKUP_REQUIRED");
    }
    // Prove possession of a different verified factor before retiring this one.
    await verifyAdminTotp(client, backupId, backupCode);
  }
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) throw new Error("MFA_REMOVE_FAILED");
  // Auth removal does not update the browser's saved JWT on its own.
  const refreshed = await client.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) throw new Error("MFA_SESSION_REFRESH_UNCONFIRMED");
  const remaining = await loadAdminFactors(client);
  if (remaining.some(factor => factor.id === factorId)
      || (target.status === "verified" && !remaining.some(factor => factor.id === backupId && factor.status === "verified"))) {
    throw new Error("MFA_REMOVE_UNCONFIRMED");
  }
}
