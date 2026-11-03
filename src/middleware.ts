import type { MiddlewareHandler } from "astro";
import { getTrustedCountry } from "./lib/i18n/country.server";
import { resolveLocale } from "./lib/i18n/locale";
import { parsePreferenceCookie, PREFERENCE_COOKIE_NAME } from "./lib/i18n/preference-cookie";
import { isLocaleHtmlRoute } from "./lib/i18n/html-route-policy";
import {responseSecurityHeaders} from "./lib/response-security-headers";
import { canonicalDomainRedirect, LEGACY_LENSDEN_WORKER_ORIGIN, LEGACY_AUTH_ROUTING_COOKIE } from "./lib/site-origin";

export const onRequest: MiddlewareHandler = async ({ request, locals, url, cookies }, next) => {
  // Routing only, never authentication: a legacy email callback must retain
  // its origin-scoped PKCE/session state through subsequent navigation.
  if (url.origin === LEGACY_LENSDEN_WORKER_ORIGIN && /^\/auth\/(?:callback|reset-password)\/?$/.test(url.pathname)) {
    cookies.set(LEGACY_AUTH_ROUTING_COOKIE, "1", { path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 });
  }
  const target = canonicalDomainRedirect(url, request.method, cookies.get(LEGACY_AUTH_ROUTING_COOKIE)?.value === "1");
  if (target) return new Response(null, { status: 301, headers: { Location: target, "Cache-Control": "private, no-store" } });
  const saved = parsePreferenceCookie(cookies.get(PREFERENCE_COOKIE_NAME)?.value);
  locals.localeContext = resolveLocale({ saved, trustedCountry: getTrustedCountry(request), acceptLanguage: request.headers.get("accept-language") ?? undefined });
  const response = await next();
  if (/^\/api(?:\/|$)/.test(url.pathname)) return response;
  if (!isLocaleHtmlRoute(url.pathname) && response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "text/html") return response;
  const headers = responseSecurityHeaders(response.headers,url.pathname);
  const directives = (headers.get("cache-control") ?? "").split(",").map(value => value.trim()).filter(value => value && value.toLowerCase() !== "public");
  if (!directives.some(value => value.toLowerCase() === "private")) directives.push("private");
  if (!directives.some(value => value.toLowerCase() === "no-store")) directives.push("no-store");
  headers.set("cache-control", directives.join(", "));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
