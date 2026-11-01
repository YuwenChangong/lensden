export const LEGACY_PAGES_ORIGIN = "https://openglasshub.pages.dev";
export const CURRENT_SITE_ORIGIN = "https://lensden.ogh.workers.dev";
export const SITE_ORIGIN_TOKEN = "{{SITE_ORIGIN}}";

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
