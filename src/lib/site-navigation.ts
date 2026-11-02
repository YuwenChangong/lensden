export type NavKey = "home" | "forum" | "news" | "products" | "launcher";
import { isGazeLauncherPublicEnabled } from "./gaze-launcher-visibility.ts";
import type { ResolvedLocale } from "./i18n/locale.ts";
import { getUiMessages } from "./i18n/catalog.ts";
import { isDiscoveryExcluded } from "./discovery-exclusions";

const navigation = [
  { key: "home", label: "首页", href: "/" },
  { key: "forum", label: "论坛", href: "/feed/" },
  { key: "news", label: "热点", href: "/news/" },
  { key: "products", label: "产品", href: "/products/" },
] as const;
export const mainNav = isGazeLauncherPublicEnabled()
  ? [...navigation, { key: "launcher", label: "Gaze Launcher", href: "/gaze-launcher/" } as const]
  : navigation;

export function getMainNav(locale: ResolvedLocale) {
  const labels = getUiMessages(locale).shell;
  return mainNav.map(item => ({ ...item, label: labels[item.key] }));
}

export const productLinks = [
  {
    label: "产品",
    href: "/products/",
    description: "按品牌直接浏览 AR / AI 眼镜。",
  },
  {
    label: "开发者",
    href: "/developers/",
    description: "汇总 SDK、平台入口和开发约束参考。",
  },
] as const;

export const forumTabs = [
  { key: "feed", label: "动态", href: "/feed/?sort=recommended" },
  { key: "circles", label: "圈子", href: "/circles/" },
  { key: "new-post", label: "发帖", href: "/posts/new/" },
] as const;

export const hiddenPublicCircleSlugs = new Set(["rls-test-circle", "rls-test", "test-circle"]);

export function isPublicVisibleCircle(input: { id?: string | null; slug?: string | null; name?: string | null; status?: string | null }) {
  const slug = input.slug?.toLowerCase() ?? "";
  const name = input.name?.toLowerCase() ?? "";
  const status = input.status?.toLowerCase() ?? "active";
  if (status !== "active") return false;
  if (hiddenPublicCircleSlugs.has(slug)) return false;
  if (isDiscoveryExcluded('circles', slug)) return false;
  if (input.id && isDiscoveryExcluded('circles', input.id)) return false;
  if (name.includes("rls test")) return false;
  return true;
}

export function inferNavKey(pathname: string): NavKey {
  if (pathname === "/" || pathname === "") return "home";
  if (
    pathname.startsWith("/feed") ||
    pathname.startsWith("/forum") ||
    pathname.startsWith("/circles") ||
    pathname.startsWith("/posts") ||
    pathname.startsWith("/search")
  ) {
    return "forum";
  }
  if (pathname.startsWith("/news")) return "news";
  if (pathname.startsWith("/products") || pathname.startsWith("/guides") || pathname.startsWith("/developers")) {
    return "products";
  }
  if (pathname.startsWith("/gaze-launcher")) return "launcher";
  return "home";
}
