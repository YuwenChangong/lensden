export const LEGACY_PAGES_ORIGIN = "https://openglasshub.pages.dev";
export const CURRENT_SITE_ORIGIN = "https://lensden.net";
export const LEGACY_LENSDEN_WORKER_ORIGIN = "https://lensden.ogh.workers.dev";
export const LEGACY_AUTH_ROUTING_COOKIE = "lensden_legacy_auth";
export const SITE_ORIGIN_TOKEN = "{{SITE_ORIGIN}}";

// Keep legacy auth callbacks on their original origin: PKCE verifiers and
// sessions are browser-origin scoped. API calls and mutations must not move.
export function canonicalDomainRedirect(url: URL, method: string, preserveLegacySession = false): string | undefined {
  if (method !== "GET" && method !== "HEAD") return undefined;
  const legacy = url.origin === LEGACY_LENSDEN_WORKER_ORIGIN;
  if (!legacy && url.origin !== "https://www.lensden.net") return undefined;
  if (legacy && preserveLegacySession) return undefined;
  if (legacy && /^\/(?:auth|api)(?:\/|$)/i.test(url.pathname)) return undefined;
  const target = new URL(CURRENT_SITE_ORIGIN);
  target.pathname = url.pathname === "/news/openglass-community-is-prioritizing-verifiable-coverage/"
    ? "/news/lensden-community-is-prioritizing-verifiable-coverage/"
    : url.pathname;
  target.search = url.search;
  return target.href;
}

export function resolveSiteOrigin(value?: unknown): string {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return CURRENT_SITE_ORIGIN;
  }

  if (typeof value !== "string") {
    throw new TypeError("Site origin must be an absolute HTTPS origin");
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new TypeError("Site origin must be an absolute HTTPS origin");
  }

  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.pathname !== "/"
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new TypeError("Site origin must be an absolute HTTPS origin");
  }

  return parsed.origin;
}

export function rewriteRobotsSitemapOrigins(source: string, value?: unknown): string {
  const siteOrigin = resolveSiteOrigin(value);

  return source.replace(/^(Sitemap:\s+)(\S+)(\s*)$/gmi, (_line, prefix, sitemapUrl, suffix) => {
    let parsed: URL;
    if (sitemapUrl.startsWith(SITE_ORIGIN_TOKEN)) {
      const pathname = sitemapUrl.slice(SITE_ORIGIN_TOKEN.length);
      if (!pathname.startsWith("/") || pathname.startsWith("//")) {
        throw new TypeError("robots.txt site-origin entries must use an absolute path");
      }
      parsed = new URL(pathname, siteOrigin);
    } else {
      try {
        parsed = new URL(sitemapUrl);
      } catch {
        throw new TypeError("robots.txt Sitemap entries must be absolute URLs");
      }
    }

    return `${prefix}${new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, siteOrigin)}${suffix}`;
  });
}
