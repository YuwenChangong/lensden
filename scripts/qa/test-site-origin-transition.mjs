#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "../../node_modules/astro/dist/core/config/config.js";

import {
  CURRENT_SITE_ORIGIN,
  LEGACY_PAGES_ORIGIN,
  resolveSiteOrigin,
  rewriteRobotsSitemapOrigins,
} from "../../src/lib/site-origin.ts";

const WORKER_TEST_ORIGIN = "https://openglass-hub-transition-test.workers.dev";
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

async function loadAstroConfig() {
  const result = await resolveConfig({ root: repositoryRoot }, "build");
  return result.userConfig;
}

function walkFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walkFiles(entryPath, predicate)
      : (predicate(entryPath) ? [entryPath] : []);
  });
}

assert.equal(LEGACY_PAGES_ORIGIN, "https://openglasshub.pages.dev");
assert.equal(resolveSiteOrigin(undefined), CURRENT_SITE_ORIGIN);
assert.equal(resolveSiteOrigin(""), CURRENT_SITE_ORIGIN);
assert.equal(resolveSiteOrigin("   "), CURRENT_SITE_ORIGIN);
assert.equal(resolveSiteOrigin(`${LEGACY_PAGES_ORIGIN}/`), LEGACY_PAGES_ORIGIN);
assert.equal(resolveSiteOrigin(`${WORKER_TEST_ORIGIN}/`), WORKER_TEST_ORIGIN);
assert.equal(
  rewriteRobotsSitemapOrigins("Sitemap: {{SITE_ORIGIN}}/sitemap.xml\n", WORKER_TEST_ORIGIN),
  `Sitemap: ${WORKER_TEST_ORIGIN}/sitemap.xml\n`,
);

const publicRobots = fs.readFileSync(path.join(repositoryRoot, "public", "robots.txt"), "utf8");
assert.ok(publicRobots.includes("{{SITE_ORIGIN}}"), "public robots.txt must use the site-origin build token");
assert.equal(
  publicRobots.includes(LEGACY_PAGES_ORIGIN),
  false,
  "public robots.txt must not duplicate the default site origin",
);

for (const invalidOrigin of [
  "http://openglasshub.pages.dev",
  "//openglasshub.pages.dev",
  "openglasshub.pages.dev",
  `${WORKER_TEST_ORIGIN}/preview`,
  `${WORKER_TEST_ORIGIN}?preview=1`,
  `${WORKER_TEST_ORIGIN}#preview`,
  `https://user:secret@${new URL(WORKER_TEST_ORIGIN).host}`,
  `${WORKER_TEST_ORIGIN},${LEGACY_PAGES_ORIGIN}`,
]) {
  assert.throws(
    () => resolveSiteOrigin(invalidOrigin),
    /absolute HTTPS origin/,
    `must reject non-canonical origin value: ${invalidOrigin}`,
  );
}

const originalSiteOrigin = process.env.SITE_ORIGIN;

try {
  delete process.env.SITE_ORIGIN;
  const defaultConfig = await loadAstroConfig();
  assert.equal(defaultConfig.site, CURRENT_SITE_ORIGIN);

  process.env.SITE_ORIGIN = `${WORKER_TEST_ORIGIN}/`;
  const workerConfig = await loadAstroConfig();
  assert.equal(workerConfig.site, WORKER_TEST_ORIGIN);
  assert.notEqual(workerConfig.site, LEGACY_PAGES_ORIGIN);
} finally {
  if (originalSiteOrigin === undefined) delete process.env.SITE_ORIGIN;
  else process.env.SITE_ORIGIN = originalSiteOrigin;
}

const workerBuildRoot = fs.mkdtempSync(path.join(repositoryRoot, ".tmp-site-origin-"));
try {
  const buildResult = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "node_modules", "astro", "bin", "astro.mjs"), "build", "--outDir", workerBuildRoot],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, SITE_ORIGIN: WORKER_TEST_ORIGIN },
      timeout: 60_000,
    },
  );
  assert.equal(buildResult.status, 0, `Worker-origin build must succeed:\n${buildResult.stderr}`);

  const clientRoot = fs.existsSync(path.join(workerBuildRoot, "client"))
    ? path.join(workerBuildRoot, "client")
    : workerBuildRoot;
  const htmlFiles = walkFiles(clientRoot, (file) => file.endsWith(".html"));
  const canonicalOrigins = htmlFiles.flatMap((file) => {
    const html = fs.readFileSync(file, "utf8");
    return [...html.matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi)].map((match) => {
      const href = match[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
      return href ? new URL(href).origin : "MISSING";
    });
  });
  assert.ok(canonicalOrigins.length > 0, "Worker-origin build must emit canonical tags");
  assert.deepEqual([...new Set(canonicalOrigins)], [WORKER_TEST_ORIGIN]);

  const ogUrlOrigins = htmlFiles.flatMap((file) => {
    const html = fs.readFileSync(file, "utf8");
    return [...html.matchAll(/<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/gi)].map((match) => {
      const content = match[0].match(/\bcontent=["']([^"']+)["']/i)?.[1];
      return content ? new URL(content).origin : "MISSING";
    });
  });
  assert.ok(ogUrlOrigins.length > 0, "Worker-origin build must emit og:url metadata");
  assert.deepEqual([...new Set(ogUrlOrigins)], [WORKER_TEST_ORIGIN]);

  for (const customCanonicalRoute of ["terms/index.html", "privacy/index.html"]) {
    const customCanonicalHtml = fs.readFileSync(path.join(clientRoot, customCanonicalRoute), "utf8");
    const canonicalHref = customCanonicalHtml.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i)?.[1];
    const ogUrl = customCanonicalHtml.match(/<meta\b[^>]*\bproperty=["']og:url["'][^>]*\bcontent=["']([^"']+)["']/i)?.[1];
    assert.equal(new URL(canonicalHref).origin, WORKER_TEST_ORIGIN, `${customCanonicalRoute} canonical origin`);
    assert.equal(new URL(ogUrl).origin, WORKER_TEST_ORIGIN, `${customCanonicalRoute} og:url origin`);
  }

  const robots = fs.readFileSync(path.join(clientRoot, "robots.txt"), "utf8");
  const robotsOrigins = [...robots.matchAll(/^Sitemap:\s+(\S+)$/gmi)].map((match) => new URL(match[1]).origin);
  assert.ok(robotsOrigins.length > 0, "Worker-origin build must emit robots Sitemap lines");
  assert.deepEqual([...new Set(robotsOrigins)], [WORKER_TEST_ORIGIN]);

  const sitemapFiles = walkFiles(clientRoot, (file) => /sitemap.*\.xml$/i.test(path.basename(file)));
  const sitemapOrigins = sitemapFiles.flatMap((file) => {
    const xml = fs.readFileSync(file, "utf8");
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).origin);
  });
  assert.ok(sitemapOrigins.length > 0, "Worker-origin build must emit sitemap locations");
  assert.deepEqual([...new Set(sitemapOrigins)], [WORKER_TEST_ORIGIN]);

  const activeSourceRoots = ["components", "layouts", "lib", "pages", "plugins"]
    .map((directory) => path.join(repositoryRoot, "src", directory));
  const legacyLiteralFiles = activeSourceRoots.flatMap((directory) => (
    walkFiles(directory, (file) => /\.(?:astro|[cm]?[jt]s)$/.test(file))
  )).filter((file) => (
    path.relative(repositoryRoot, file).replaceAll("\\", "/") !== "src/lib/site-origin.ts"
    && fs.readFileSync(file, "utf8").includes(LEGACY_PAGES_ORIGIN)
  ));
  assert.deepEqual(
    legacyLiteralFiles.map((file) => path.relative(repositoryRoot, file).replaceAll("\\", "/")),
    [],
    "Active canonical/runtime surfaces must route the legacy fallback through site-origin.ts",
  );

  const legacyHostname = new URL(LEGACY_PAGES_ORIGIN).hostname;
  const legacyHostnameFiles = activeSourceRoots.flatMap((directory) => (
    walkFiles(directory, (file) => /\.(?:astro|[cm]?[jt]s)$/.test(file))
  )).filter((file) => (
    path.relative(repositoryRoot, file).replaceAll("\\", "/") !== "src/lib/site-origin.ts"
    && fs.readFileSync(file, "utf8").includes(legacyHostname)
  ));
  assert.deepEqual(
    legacyHostnameFiles.map((file) => path.relative(repositoryRoot, file).replaceAll("\\", "/")),
    [],
    "Active canonical/runtime helpers must derive the Pages hostname from site-origin.ts",
  );

  const ogFixture = htmlFiles.find((file) => fs.readFileSync(file, "utf8").includes('property="og:url"'));
  assert.ok(ogFixture, "Worker-origin build must provide an Open Graph mutation fixture");
  const originalOgFixture = fs.readFileSync(ogFixture, "utf8");
  fs.writeFileSync(
    ogFixture,
    originalOgFixture.replace(
      /(<meta\b[^>]*\bproperty="og:url"[^>]*\bcontent=")https:\/\/openglass-hub-transition-test\.workers\.dev/,
      `$1${LEGACY_PAGES_ORIGIN}`,
    ),
    "utf8",
  );
  for (const auditScript of ["scripts/verify-seo.cjs", "scripts/final-audit.cjs"]) {
    const auditResult = spawnSync(
      process.execPath,
      ["--experimental-strip-types", auditScript, "--dist", workerBuildRoot],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, SITE_ORIGIN: WORKER_TEST_ORIGIN },
        timeout: 10_000,
      },
    );
    assert.notEqual(auditResult.status, 0, `${auditScript} must fail mixed Open Graph output`);
    assert.match(auditResult.stdout, /Open Graph URLs use one configured site origin/, `${auditScript} must report the Open Graph origin mismatch`);
  }
  fs.writeFileSync(ogFixture, originalOgFixture, "utf8");

  const canonicalFixture = htmlFiles.find((file) => fs.readFileSync(file, "utf8").includes(WORKER_TEST_ORIGIN));
  assert.ok(canonicalFixture, "Worker-origin build must provide a canonical mutation fixture");
  fs.writeFileSync(
    canonicalFixture,
    fs.readFileSync(canonicalFixture, "utf8").replace(WORKER_TEST_ORIGIN, LEGACY_PAGES_ORIGIN),
    "utf8",
  );
  fs.writeFileSync(
    path.join(clientRoot, "robots.txt"),
    robots.replace(WORKER_TEST_ORIGIN, LEGACY_PAGES_ORIGIN),
    "utf8",
  );

  for (const auditScript of ["scripts/verify-seo.cjs", "scripts/final-audit.cjs"]) {
    const auditResult = spawnSync(
      process.execPath,
      ["--experimental-strip-types", auditScript, "--dist", workerBuildRoot],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, SITE_ORIGIN: WORKER_TEST_ORIGIN },
        timeout: 10_000,
      },
    );
    assert.notEqual(auditResult.status, 0, `${auditScript} must fail mixed-origin output`);
    assert.match(auditResult.stdout, /configured site origin/, `${auditScript} must report the origin mismatch`);
  }
} finally {
  fs.rmSync(workerBuildRoot, { recursive: true, force: true });
}

for (const script of ["scripts/smoke-production.mjs", "scripts/post-launch-check.mjs"]) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", script, "--url", "http://127.0.0.1:1"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.notEqual(result.status, 0, `${script} must reject an invalid explicit URL`);
  assert.match(result.stderr, /absolute HTTPS origin/, `${script} must fail during origin validation`);
}

const finalAuditResult = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "scripts/final-audit.cjs"],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, SITE_ORIGIN: "http://127.0.0.1:1" },
    timeout: 10_000,
  },
);
assert.notEqual(finalAuditResult.status, 0, "final audit must reject an invalid configured origin");
assert.match(finalAuditResult.stderr, /absolute HTTPS origin/, "final audit must use shared origin validation");

console.log(JSON.stringify({
  status: "PASS",
  defaultOrigin: CURRENT_SITE_ORIGIN,
  configurableOrigin: WORKER_TEST_ORIGIN,
  invalidOriginsRejected: 8,
  canonicalOriginsPerBuild: 1,
  explicitUrlConsumersValidated: 2,
  auditOriginValidation: true,
}));
