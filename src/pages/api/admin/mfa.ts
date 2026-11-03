import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { jsonResponse, requireModerator } from "../../../lib/server/admin-auth";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  try {
    await requireModerator(request, env);
    return jsonResponse({ aal: "aal2" });
  } catch (error) {
    return error instanceof Response ? error : jsonResponse({ error: "MFA status unavailable" }, 503);
  }
};
export const ALL: APIRoute = () => jsonResponse({ error: "Method not allowed" }, 405);
