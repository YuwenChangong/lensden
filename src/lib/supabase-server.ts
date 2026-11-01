import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client for SSR pages using Cloudflare runtime env vars.
 * Uses anon key only — relies on RLS for access control.
 * Does NOT use service role key for public browsing.
 */
export function createSSRClient(env: {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}, fetchOverride?: typeof fetch): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    ...(fetchOverride ? { global: { fetch: fetchOverride } } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** Shape of Cloudflare runtime env bindings. */
export interface CloudflareEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  R2_PUBLIC_BASE_URL?: string;
  AUTH_CAPTCHA_MODE?: string;
}
