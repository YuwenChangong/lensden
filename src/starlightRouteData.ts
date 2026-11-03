import { defineRouteMiddleware, type StarlightRouteData } from "@astrojs/starlight/route-data";
import { createStarlightUi } from "./lib/i18n/starlight-ui";
import { resolveDocumentLocale } from "./lib/i18n/document-locale";
import { selectEditorialVariant } from "./lib/i18n/editorial-variants";
import { getUiMessages } from "./lib/i18n/catalog";
import * as guides from "./content/editorial-translations/en/guides/index.mdx";
import * as developers from "./content/editorial-translations/en/developers/index.mdx";
import * as about from "./content/editorial-translations/en/about/index.mdx";
import { canonicalPageUrl, serializeJsonLd } from "./lib/seo";
import { editorialSitemapPath } from "./lib/seo-sitemap";
import { resolveSiteOrigin } from "./lib/site-origin";

const reviewedModules = {
  "/src/content/editorial-translations/en/guides/index.mdx": guides,
  "/src/content/editorial-translations/en/developers/index.mdx": developers,
  "/src/content/editorial-translations/en/about/index.mdx": about,
};

type TocItem = NonNullable<StarlightRouteData["toc"]>["items"][number];
function tocItems(route: StarlightRouteData, overview: string): TocItem[] {
  if (!route.toc) return [];
  const roots: TocItem[] = [{ depth: 2, slug: "_top", text: overview, children: [] }];
  const parents: TocItem[] = [];
  for (const heading of route.headings) {
    if (heading.depth < route.toc.minHeadingLevel || heading.depth > route.toc.maxHeadingLevel) continue;
    const item: TocItem = { ...heading, children: [] };
    while (parents.length && parents[parents.length - 1].depth >= item.depth) parents.pop();
    (parents.length ? parents[parents.length - 1].children : roots).push(item);
    parents.push(item);
  }
  return roots;
}

export const onRequest = defineRouteMiddleware(async (context, next) => {
  const locale = context.locals.localeContext.locale;
  const route = context.locals.starlightRoute;
  const documentLocale = resolveDocumentLocale(context.url.searchParams.get("lang"), locale);
  const sourcePath = "/" + route.entry.filePath.replace(/\\/g, "/");
  const key = ["guides/index", "developers/index", "about/index"].find((key) => sourcePath.endsWith(`/src/content/docs/${key}.mdx`));
  const selection = selectEditorialVariant(key ?? route.id, documentLocale);
  route.lang = locale;
  route.dir = "ltr";
  route.locale = undefined;
  route.entryMeta = { lang: selection.locale, dir: "ltr", locale: undefined };
  route.isFallback = selection.locale !== documentLocale;
  context.locals.t = createStarlightUi(locale);
  if (selection.kind === "reviewed" && Object.hasOwn(reviewedModules, selection.moduleKey)) {
    const edition = reviewedModules[selection.moduleKey as keyof typeof reviewedModules];
    const oldTitle = route.entry.data.title;
    route.Content = edition.Content;
    route.headings = edition.getHeadings();
    route.entry = { ...route.entry, data: { ...route.entry.data,
      title: edition.frontmatter.title, description: edition.frontmatter.description } };
    if (route.editUrl) route.editUrl = undefined;
    route.head = route.head.map((tag) => {
      if (tag.tag === "title" && tag.content?.startsWith(oldTitle)) {
        return { ...tag, content: edition.frontmatter.title + tag.content.slice(oldTitle.length) };
      }
      if (tag.tag !== "meta") return tag;
      const field = tag.attrs?.name ?? tag.attrs?.property;
      const content = field === "og:title" ? edition.frontmatter.title
        : ["description", "og:description"].includes(String(field)) ? edition.frontmatter.description : undefined;
      return content === undefined ? tag : { ...tag, attrs: { ...tag.attrs, content } };
    });
  }
  route.head = route.head.map((tag) => tag.tag === "meta" && tag.attrs?.property === "og:locale"
    ? { ...tag, attrs: { ...tag.attrs, content: selection.locale } } : tag);
  const origin = resolveSiteOrigin(context.site?.origin);
  const canonical = canonicalPageUrl(editorialSitemapPath(route.entry) ?? context.url.pathname, origin);
  route.head = route.head.map(tag => {
    if (canonical && tag.tag === 'link' && tag.attrs?.rel === 'canonical') return { ...tag, attrs: { ...tag.attrs, href: canonical } };
    if (canonical && tag.tag === 'meta' && tag.attrs?.property === 'og:url') return { ...tag, attrs: { ...tag.attrs, content: canonical } };
    return tag;
  });
  const socialImage = new URL('/brand/logo.jpg', origin).href;
  for (const [field, content] of Object.entries({ 'twitter:title': route.entry.data.title,
    'twitter:description': route.entry.data.description, 'twitter:image': socialImage, 'og:image': socialImage })) {
    if (content && !route.head.some(tag => tag.tag === 'meta' && (tag.attrs?.name === field || tag.attrs?.property === field))) {
      route.head.push({ tag: 'meta', attrs: field.startsWith('og:') ? { property: field, content } : { name: field, content } });
    }
  }
  route.head.push({ tag: 'script', attrs: { type: 'application/ld+json' }, content: serializeJsonLd({
    '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'Lensden', url: origin }, { '@type': 'WebSite', name: 'Lensden', url: origin }],
  }) });
  if (route.toc) route.toc.items = tocItems(route, context.locals.t("tableOfContents.overview"));

  const text = getUiMessages(locale);
  const labels: Readonly<Record<string, string>> = {
    "/devices": text.documents.deviceLibrary,
    "/guides": text.documents.guides,
    "/developers": text.documents.developers,
    "/about": text.documents.about,
  };
  function localizeEntries(entries: StarlightRouteData["sidebar"]) {
    for (const entry of entries) {
      if (entry.type === "group") localizeEntries(entry.entries);
      else {
        const path = entry.href.replace(/\/$/, "");
        if (Object.hasOwn(labels, path)) entry.label = labels[path];
      }
    }
  }
  localizeEntries(route.sidebar);
  for (const entry of [route.pagination.prev, route.pagination.next]) {
    if (entry) localizeEntries([entry]);
  }
  await next();
});
