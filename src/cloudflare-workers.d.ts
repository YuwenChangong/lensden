// App bindings consumed through the adapter-provided runtime module.
declare module "cloudflare:workers" {
  export const env: import("./lib/supabase-server").CloudflareEnv &
    import("./lib/server/admin-auth").RuntimeEnv;
}
