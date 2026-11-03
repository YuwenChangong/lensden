import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dev } from "astro";
import cloudflare from "@astrojs/cloudflare";
import { JSDOM } from "jsdom";
import { serializePreferenceCookie } from "../src/lib/i18n/preference-cookie.ts";

const manifest = JSON.parse(await readFile("node_modules/@astrojs/starlight/package.json", "utf8"));
process.env.ASTRO_DISABLE_UPDATE_CHECK = "true";
assert.equal(manifest.version, "0.41.3", "Task 18 public interface baseline must remain installed Starlight 0.41.3");
const originalFetch = globalThis.fetch;
let externalRequests = 0, server;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) { externalRequests++; throw new Error("EXTERNAL_FORBIDDEN"); }
  return originalFetch(input, init);
};
try {
  server = await dev({ root: new URL("../", import.meta.url), logLevel: "error", devToolbar: { enabled: false },
    server: { host: "127.0.0.1", port: 0 },
    adapter: cloudflare({ platformProxy: { enabled: true, remoteBindings: false, envFiles: [], persist: false }, prerenderEnvironment: "node" }),
    vite: { plugins: [{ name: "owned-docs-no-auth", enforce: "pre", resolveId(id) {
      if (/(?:^|\/)supabase-browser(?:\.ts)?$/.test(id)) return "\0owned-docs-no-auth";
    }, load(id) { if (id === "\0owned-docs-no-auth") return "export const createBrowserSupabaseClient=()=>null; export const syncBrowserRealtimeAuth=async()=>null;"; } }] } });
  const origin = `http://127.0.0.1:${server.address.port}`;
  for (const locale of ["en", "zh-CN"]) {
    const cookie = serializePreferenceCookie({ version: 1, preference: locale, generation: 1, provenance: "device_explicit" }).split(";")[0];
    for (const path of ["/about/", "/reference/guides/why-ar-glasses-are-not-phone-systems/", "/about/?lang=en", "/about/?lang=zh-CN", "/about/?lang=invalid"]) {
      const response = await fetch(origin + path, { headers: { cookie }, signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 200);
      const document = new JSDOM(await response.text()).window.document;
      assert.equal(document.documentElement.lang, locale, "Starlight root chrome must follow request locale on the same route");
      assert.equal(document.documentElement.dataset.theme, "dark");
      assert.equal(document.querySelectorAll("starlight-theme-select").length, 0);
      assert.ok(document.querySelector(".ogh-site-header"), "Shared application header is retained");
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(document.querySelector(".sl-skip-link").textContent.trim(), locale === "en" ? "Skip to content" : "跳转到内容");
      assert.equal(document.querySelector("#starlight__on-this-page").textContent.trim(), locale === "en" ? "On this page" : "本页内容");
      assert.ok(document.querySelector("starlight-toc a[href='#_top']").textContent.includes(locale === "en" ? "Overview" : "概览"));
      const requested = new URL(origin + path).searchParams.get("lang");
      const bodyLocale = path.startsWith("/about/") ? (["en", "zh-CN"].includes(requested) ? requested : locale) : "zh-CN";
      assert.equal(document.querySelector("main").lang, bodyLocale);
      assert.equal(document.querySelector('meta[property="og:locale"]').content, bodyLocale);
      assert.equal(document.querySelectorAll("link[hreflang]").length, 0, "No invented locale URL alternates");
      assert.equal(document.querySelectorAll("starlight-lang-select").length, 0);
      if (path.startsWith("/about/") && bodyLocale === "en") {
        assert.equal(document.querySelector("h1").textContent.trim(), "About OpenGlass Hub");
        assert.ok(document.querySelector(".sl-markdown-content").textContent.includes("A structured reference"));
        assert.ok(document.querySelector("starlight-toc a[href='#a-structured-reference']"));
        assert.ok(document.title.includes("About OpenGlass Hub"));
        assert.equal(document.querySelector('meta[name="description"]').content, "The purpose and editorial boundaries of the OpenGlass Hub reference collection.");
      }
      if (!path.startsWith("/about/") && locale === "en") {
        assert.ok(document.querySelector("main").textContent.includes("No reviewed edition is available"), "Missing English content must be honestly labelled");
      }
      for (const link of document.querySelectorAll(".pagination-links a[rel]")) {
        assert.ok(link.textContent.includes(locale === "en" ? (link.rel === "prev" ? "Previous" : "Next") : (link.rel === "prev" ? "上一页" : "下一页")));
      }
      const sidebar = document.querySelector("#starlight__sidebar");
      assert.ok(sidebar);
      assert.ok(sidebar.textContent.includes(locale === "en" ? "Device library" : "设备库"));
      assert.ok(document.querySelector("footer"));
      for (const link of document.querySelectorAll("a[href]")) assert.doesNotMatch(link.getAttribute("href"), /^\/(?:en|zh(?:-CN)?)\//);
      document.defaultView.close();
    }
  }
  for (const locale of ["en", "zh-CN"]) {
    const cookie = serializePreferenceCookie({ version: 1, preference: locale, generation: 1, provenance: "device_explicit" }).split(";")[0];
    const response = await fetch(origin + "/guides/index/?lang=en", { headers: { cookie }, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    const document = new JSDOM(await response.text()).window.document;
    assert.equal(document.documentElement.lang, locale);
    assert.equal(document.querySelector("article").lang, "en");
    assert.equal(document.querySelector("h1").textContent, "Buying guides");
    assert.equal(document.querySelector('article a[href="/devices/"]').textContent, "Browse the device library");
    assert.equal(response.headers.get("set-cookie"), null);
    document.defaultView.close();
  }
  const { createStarlightUi } = await import("../src/lib/i18n/starlight-ui.ts");
  const builtInKeys = Object.keys(JSON.parse(await readFile("node_modules/@astrojs/starlight/translations/en.json", "utf8")));
  for (const locale of ["en", "zh-CN"]) {
    const t = createStarlightUi(locale);
    assert.equal(typeof t, "function"); assert.equal(t.dir(), "ltr");
    for (const key of builtInKeys) { assert.equal(t.exists(key), true); assert.equal(typeof t.all()[key], "string"); }
    assert.ok(t("heading.anchorLabel", { title: "Owned heading" }).includes("Owned heading"));
  }
  const { selectEditorialVariant } = await import("../src/lib/i18n/editorial-variants.ts");
  for (const key of ["guides/index", "developers/index", "about/index"]) {
    assert.equal(selectEditorialVariant(key, "en").kind, "reviewed", "English editorial registration requires human-reviewed variants");
    const file = `src/content/docs/${key}.mdx`;
    assert.equal((await readFile(file, "utf8")).replace(/\r\n?/g, "\n"), execFileSync("git", ["show", `318a252d8b8e6489044b322c3e9eefd72e9d6e08:${file}`], { encoding: "utf8" }).replace(/\r\n?/g, "\n"), "Original authored document unchanged");
  }
  assert.equal(selectEditorialVariant("guides/unregistered", "en").kind, "original");
  const theme = await readFile("src/components/starlight/ThemeProvider.astro", "utf8");
  assert.doesNotMatch(theme, /localStorage|sessionStorage|matchMedia/);
  assert.match(theme, /StarlightThemeProvider/);
  assert.match(theme, /updatePickers/);
  assert.equal(externalRequests, 0);
  console.log("LOCALE_STARLIGHT_EDITORIAL=PASS ACTUAL_SSR=PASS PUBLIC_TRANSLATION_CONTRACT=PASS REVIEWED_VARIANTS=PASS EXTERNAL_REQUESTS=0");
} finally { await server?.stop(); globalThis.fetch = originalFetch; }
