import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const harnessRoot = path.join(root, "tests/visual/legal-consent-harness");
const out = path.join(root, "output/playwright/ui02-media-focus", randomUUID());
const results = [];
let browser, server, origin;
let externalRequestsBlocked = 0;
let localWebSocketsBlocked = 0;
const pageErrors = [];
const check = async (width, id, action) => {
  try { await action(); results.push({ width, id, result: "PASS" }); }
  catch (error) { results.push({ width, id, result: "FAIL", reason: error.code ?? "BROWSER_ASSERTION" }); }
};
try {
  await fs.mkdir(out, { recursive: true });
  server = await createServer({ root: harnessRoot, configFile: path.join(harnessRoot, "vite.config.ts"),
    logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } });
  await server.listen();
  origin = new URL(server.resolvedUrls.local[0]).origin;
  browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] });
  const context = await browser.newContext({ serviceWorkers: "block" });
  context.setDefaultTimeout(5000);
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequestsBlocked += 1;
    return route.abort();
  });
  await context.routeWebSocket("**/*", socket => {
    if (["127.0.0.1", "localhost", "[::1]"].includes(new URL(socket.url()).hostname)) localWebSocketsBlocked += 1;
    else externalRequestsBlocked += 1;
    socket.close();
  });
  for (const width of [1440, 390, 430]) {
    const page = await context.newPage();
    page.on("pageerror", () => pageErrors.push({ width, category: "UNHANDLED_BROWSER_ERROR" }));
    await page.setViewportSize({ width, height: 932 });
    await page.goto(origin + "/post-media.html", { waitUntil: "networkidle" });
    const trigger = page.locator(".post-media-main__trigger");
    await trigger.waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector(".post-media-main img");
      return image?.complete && image.naturalWidth > 0;
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.locator(".post-lightbox").waitFor();
    await check(width, "NAMED_MODAL_DIALOG", async () => {
      assert.equal(await page.getByRole("dialog", { name: "Local media fixture", exact: true }).count(), 1);
      assert.equal(await page.getByRole("dialog").getAttribute("aria-modal"), "true");
    });
    await check(width, "INITIAL_FOCUS_INSIDE_MEDIA", async () => {
      assert.equal(await page.locator(".post-lightbox__close").evaluate(el => document.activeElement === el), true);
    });
    if (await page.getByRole("dialog").count()) {
      const dialog = page.getByRole("dialog");
      await check(width, "SHIFT_TAB_CONTAINMENT", async () => {
        await page.locator(".post-lightbox__close").focus();
        await page.keyboard.press("Shift+Tab");
        assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
      });
      await check(width, "TAB_CONTAINMENT", async () => {
        for (let i = 0; i < 8; i += 1) {
          await page.keyboard.press("Tab");
          assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
        }
      });
      await check(width, "BACKGROUND_FOCUS_BLOCKED", async () => {
        await page.locator("#after-media").evaluate(el => el.focus());
        assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
      });
      await check(width, "ARROW_MEDIA_NAVIGATION", async () => {
        await page.keyboard.press("ArrowRight");
        await page.locator('.post-lightbox__content img[alt="Second fixture image"]').waitFor();
        await page.keyboard.press("ArrowLeft");
        await page.locator('.post-lightbox__content img[alt="First fixture image"]').waitFor();
      });
      await check(width, "MEDIA_FITS_VIEWPORT", async () => {
        const box = await page.locator(".post-lightbox__content img").boundingBox();
        const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
          dialog: (() => { const r = document.querySelector('dialog').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() }));
        results.push({ width, id: "MEDIA_DIMENSIONS", result: "DIAGNOSTIC", ...dimensions, imageBox: box });
        assert.ok(dimensions.scrollWidth <= dimensions.viewport);
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 932);
      });
    }
    await page.screenshot({ path: path.join(out, `media-open-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await check(width, "ESCAPE_CLOSE_AND_RESTORE_FOCUS", async () => {
      await page.locator(".post-lightbox").waitFor({ state: "detached" });
      assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    });
    await trigger.click();
    await page.locator(".post-lightbox__close").click();
    await check(width, "CLOSE_BUTTON_RESTORES_FOCUS", async () => {
      assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    });
    await page.goto(origin + "/post-media.html?unavailable=1", { waitUntil: "networkidle" });
    await check(width, "UNAVAILABLE_REFERENCE_HAS_NO_BROKEN_PLAYER", async () => {
      await page.getByRole("status").waitFor();
      assert.equal(await page.getByRole("status").textContent(), "This media is currently unavailable. The post is preserved.");
      assert.equal(await page.locator("video,img,.post-media-main__expand").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    });
    await page.screenshot({ path: path.join(out, `media-unavailable-${width}.png`), fullPage: true });
    await page.close();
  }
  await context.close();
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}
const report = { task: "UI02_POST_MEDIA_FOCUS", results, pageErrors, externalRequestsBlocked, localWebSocketsBlocked,
  passed: results.filter(r => r.result === "PASS").length, failed: results.filter(r => r.result === "FAIL").length,
  scope: "REAL_COMPONENT_AND_STYLES_SYNTHETIC_IMAGES_NOT_FULL_APP_OR_PRODUCTION",
  productionConnections: 0, databaseOperations: 0, servicesStopped: true };
await fs.writeFile(path.join(out, "RESULTS_SAFE.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ...report, evidenceDirectory: out }));
if (report.failed || pageErrors.length || externalRequestsBlocked) process.exitCode = 1;
