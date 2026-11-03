import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dev } from "astro";
import cloudflare from "@astrojs/cloudflare";
import { chromium } from "playwright";
import { getUiMessages, formatUiMessage } from "../src/lib/i18n/catalog.ts";
import { serializePreferenceCookie } from "../src/lib/i18n/preference-cookie.ts";
process.env.ASTRO_DISABLE_UPDATE_CHECK = "true";
for (const file of ["pages/index.astro", "pages/products/index.astro", "pages/products/[brand].astro", "pages/search/index.astro", "pages/news/index.astro", "pages/news/[slug].astro", "components/community/ProductCard.astro", "components/community/NewsCard.astro", "components/devices/DeviceLibraryExplorer.tsx", "components/news/NewsPagination.tsx", "components/CommunityCTA.astro", "components/LatestUpdates.astro"]) {
  const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
  assert.match(source, /localeContext/, `${file} must use the selected locale`);
}
const originalFetch = globalThis.fetch;
let external = 0, server, browser;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) { external++; throw new Error("EXTERNAL_FORBIDDEN"); }
  return originalFetch(input, init);
};
const serverStub = `
const devices = Array.from({length:4}, (_,index) => ({slug:'owned-'+index,name:'原始 product '+index,brand_key:'xreal',brand_name:'XREAL',short_description:'原始 description',publication_status:'published',type_label:'原始 category',full_specs:[],key_specs:[],media:{placeholderType:'wordmark'}}));
export function createSSRClient() {
 return { from(table) {
  let single = false;
  const chain = new Proxy({}, { get(_, key) {
   if(key === 'then') return resolve => resolve({data:single ? null : table === 'devices' ? devices : [],error:null,count:0});
   if(key === 'maybeSingle' || key === 'single') return () => { single=true; return chain; };
   return () => chain;
  }});
  return chain;
 },rpc:async()=>({data:[],error:null})};
}
`;
try {
  server = await dev({ root: new URL("../", import.meta.url), logLevel: "error", devToolbar: { enabled: false }, server: { host: "127.0.0.1", port: 0 }, adapter: cloudflare({ platformProxy: { enabled: true, remoteBindings: false, envFiles: [], persist: false }, prerenderEnvironment: "node" }), vite: { plugins: [{ name: "owned-catalog-data", enforce: "pre", resolveId(id) {
    if (/(?:^|\/)supabase-server(?:\.ts)?$/.test(id)) return "\0owned-catalog-data";
    if (/(?:^|\/)supabase-browser(?:\.ts)?$/.test(id)) return "\0owned-catalog-auth";
  }, load(id) {
    if (id === "\0owned-catalog-data") return serverStub;
    if (id === "\0owned-catalog-auth") return "export const createBrowserSupabaseClient=()=>null; export const syncBrowserRealtimeAuth=async()=>null;";
  } }] } });
  const origin = `http://127.0.0.1:${server.address.port}`;
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] });
  let previousData;
  for (const locale of ["en", "zh-CN"]) {
    const text = getUiMessages(locale).catalog;
    const cookie = serializePreferenceCookie({ version: 1, preference: locale, generation: 1, provenance: "device_explicit" }).split(";")[0];
    for (const [route, labels] of [["/", [text.discussing, text.homeLead]], ["/products/", [text.products, text.compareEmpty]], ["/products/xreal/", [text.allBrands, text.official]], ["/search/?q=x", [text.searchTitle, text.searchShort]], ["/news/", [text.news, text.newsLead]], ["/news/owned-missing/", [text.articleMissing, text.backNewsList]]]) {
      const response = await fetch(origin + route, { headers: { cookie } });
      assert.equal(response.status, route.includes("owned-missing") ? 404 : 200);
      const html = await response.text();
      for (const label of labels) assert.ok(html.includes(label), `${locale} ${route} missing ${label}`);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.addCookies([{ name: cookie.split("=")[0], value: cookie.slice(cookie.indexOf("=") + 1), url: origin }]);
    await context.route("**/*", route => { if (new URL(route.request().url()).origin !== origin) { external++; return route.abort(); } return route.continue(); });
    await context.routeWebSocket("**/*", socket => { if (new URL(socket.url()).origin === origin.replace("http:", "ws:")) socket.connectToServer(); else { external++; socket.close(); } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/products/");
    const data = await page.locator("#products-brand-data").textContent();
    const products = JSON.parse(data).compareProducts;
    assert.equal(products.length, 4);
    if (previousData) assert.deepEqual(products, previousData, "locale must not change catalog data or query indexes");
    previousData = products;
    await page.locator("#products-search").fill("原始");
    await page.locator("[data-compare-button]").first().waitFor();
    for (const product of products.slice(0, 3)) {
      await page.locator("#products-search").fill(product.name);
      await page.locator(`[data-compare-button][data-product-slug="${product.slug}"]`).click();
    }
    await page.getByText(formatUiMessage(text.compareSelected, { count: 3 }), { exact: true }).waitFor();
    await page.locator("#products-search").fill(products[3].name);
    await page.locator(`[data-compare-button][data-product-slug="${products[3].slug}"]`).click();
    await page.getByText(text.compareLimit, { exact: true }).waitFor();
    assert.equal(await page.locator(".products-compare__pill").count(), 3);
    await page.getByRole("button", { name: formatUiMessage(text.removeProduct, { name: products[0].name }), exact: true }).click();
    assert.equal(await page.locator(".products-compare__pill").count(), 2);
    await page.locator("#products-compare-clear").click();
    await page.locator("#products-search").fill("<script>unsafe&query</script>");
    await page.getByText(text.noComparable, { exact: true }).waitFor();
    assert.equal(await page.locator("script[src*=unsafe]").count(), 0);
    for (const width of [390, 430, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${locale}/${width} overflow`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert.equal(external, 0);
  console.log("LOCALE_CATALOG_SEARCH_NEWS=PASS ACTUAL_SSR_BOTH_LOCALES=PASS CATALOG_DATA_AND_QUERY_INDEXES_UNCHANGED=PASS COMPARE_AND_EMPTY_STATES=PASS EXTERNAL_REQUESTS=0");
} finally { await browser?.close(); await server?.stop(); globalThis.fetch = originalFetch; }
