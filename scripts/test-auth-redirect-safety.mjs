import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { buildAuthCallbackRedirect, buildResetPasswordRedirect, getSafeNext } from "../src/lib/auth-redirect.ts";
import * as authRedirect from "../src/lib/auth-redirect.ts";
import { getSafeConsentNext } from "../src/lib/legal-consent-navigation.ts";

function consentNextRejectsLoops() {
  for (const input of ["/legal-consent/?next=%2Flegal-consent%2F", "/legal-consent", "/login/?next=%2Ffeed%2F", "/register/", "/auth/callback/", "/auth/reset-password/", "/%6cegal-consent/", "/%256cegal-consent/", "/login%2f", "/auth%2fcallback/", "/foo/../legal-consent/", "/legal-consent//", "/LOGIN/", "/%252f%252fexample.invalid", "https://example.invalid", null, undefined, 42, {}]) {
    assert.equal(getSafeConsentNext(input), "/feed/", `consentNextRejectsLoops: ${String(input)}`);
  }
  for (const input of ["/circles/", "/circles/?sort=latest#reply", "/forum/%E6%B5%8B%E8%AF%95", "/posts/?next=%2Flegal-consent%2F", "/login-help/", "/legal-consent-guide/", "/"]) {
    assert.equal(getSafeConsentNext(input), input);
  }
  console.log("consentNextRejectsLoops: PASS rejected=19 preserved=7");
}
consentNextRejectsLoops();

assert.equal(typeof authRedirect.buildSignupHref, "function", "signup CTA needs an explicit signup destination");
assert.equal(authRedirect.buildSignupHref("/feed/?sort=latest#reply"), "/login/?mode=register&next=%2Ffeed%2F%3Fsort%3Dlatest%23reply");
assert.equal(authRedirect.buildSignupHref("https://evil.example"), "/login/?mode=register&next=%2F");
const headerSource = readFileSync(new URL("../src/components/site/HeaderUserMenu.tsx", import.meta.url), "utf8");
assert.equal((headerSource.match(/href=\{buildSignupHref\(safeNext\)\} className="ogh-register-button"/g) ?? []).length, 2);

const trustedOrigin = "https://openglasshub.pages.dev";
const workerOrigin = "https://lensden.ogh.workers.dev";
const productionConfig = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8").split("[env.production.vars]")[1];
assert.equal(productionConfig.match(/^SITE_ORIGIN\s*=\s*"([^"]+)"/m)?.[1], workerOrigin);
const preparedWorkerOrigin = "https://openglass-hub-transition-test.workers.dev";
const fallback = "/feed/";
const safeOutput = (input) => getSafeNext(input, fallback);

const validCases = [
  "/",
  "/feed/",
  "/legal-consent/",
  "/forum/post?id=123",
  "/notifications/#latest",
  "/forum/post?id=123#reply",
  "/forum/%E6%B5%8B%E8%AF%95?tag=%E7%9C%BC%E9%95%9C",
  "/login/?next=%2Ffeed%2F",
  "/login/?mode=register&next=%2Ffeed%2F",
  "/auth/reset-password/",
];

for (const input of validCases) {
  const output = safeOutput(input);
  assert.equal(new URL(output, trustedOrigin).origin, trustedOrigin, input);
  assert.equal(output.includes("\\"), false, input);
  assert.equal(/[\u0000-\u001f\u007f]/u.test(output), false, input);
}

const rejectedCases = [
  "https://evil.example/",
  "http://evil.example/",
  "https://openglasshub.pages.dev/feed/",
  "//evil.example/",
  "///evil.example/",
  "\\\\evil.example",
  "/\\\\evil.example",
  "\\evil.example",
  "/\\/evil.example",
  "/%5cevil.example",
  "/%255cevil.example",
  "/%2f%2fevil.example",
  "/%252f%252fevil.example",
  "javascript:alert(1)",
  "data:text/html,boom",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "https://user:pass@evil.example/",
  " /feed/",
  "/feed/ ",
  "\t/feed/",
  "/feed/\r",
  "/feed/\n",
  "/feed/\u0000",
  "\u3000/feed/",
  "/feed/%",
  "/feed/%0a",
];

for (const input of rejectedCases) {
  const output = safeOutput(input);
  assert.equal(output, fallback, input);
  assert.equal(new URL(output, trustedOrigin).origin, trustedOrigin, input);
  assert.equal(output.includes("\\"), false, input);
  assert.equal(/[\u0000-\u001f\u007f]/u.test(output), false, input);
}

const callbackUrl = buildAuthCallbackRedirect(trustedOrigin, "/\\\\evil.example");
assert(callbackUrl);
assert.equal(new URL(callbackUrl).origin, trustedOrigin);
const callbackNext = new URL(callbackUrl).searchParams.get("next");
assert.equal(getSafeNext(callbackNext, fallback), "/");

const browserCalls = [];
const originalWindow = globalThis.window;
globalThis.window = {
  location: {
    pathname: "/login/",
    search: "?next=%2Ffeed%2F",
    hash: "#auth",
    assign: (url) => browserCalls.push(["assign", url]),
    replace: (url) => browserCalls.push(["replace", url]),
  },
};

const vite = await createServer({
  root: process.cwd(),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const { browserNavigationAdapter } = await vite.ssrLoadModule("/src/lib/legal-consent-adapters.ts");
  const navigation = browserNavigationAdapter();
  navigation.replace(callbackNext ?? "/\\\\evil.example");
  navigation.navigate("/\\\\evil.example");
  assert.deepEqual(browserCalls, [["replace", "/"], ["assign", "/"]]);
  assert.equal(navigation.getCurrentUrl(), "/login/?next=%2Ffeed%2F#auth");
} finally {
  await vite.close();
  globalThis.window = originalWindow;
}

assert.equal(buildResetPasswordRedirect(trustedOrigin), `${trustedOrigin}/auth/reset-password/`);
assert.equal(buildAuthCallbackRedirect(workerOrigin, "/feed/"), `${workerOrigin}/auth/callback/?next=%2Ffeed%2F`);
assert.equal(buildResetPasswordRedirect(workerOrigin), `${workerOrigin}/auth/reset-password/`);
assert.equal(buildAuthCallbackRedirect("http://openglasshub.ogh.workers.dev", "/feed/"), undefined);
assert.equal(buildResetPasswordRedirect("https://not-openglasshub.ogh.workers.dev"), undefined);
assert.equal(buildResetPasswordRedirect("https://preview.openglasshub.pages.dev"), "https://preview.openglasshub.pages.dev/auth/reset-password/");
assert.equal(buildResetPasswordRedirect("https://evil.example"), undefined);
assert.equal(buildResetPasswordRedirect("javascript:alert(1)"), undefined);
assert.equal(
  buildAuthCallbackRedirect(preparedWorkerOrigin, "/feed/", { approvedOrigins: [preparedWorkerOrigin] }),
  `${preparedWorkerOrigin}/auth/callback/?next=%2Ffeed%2F`,
);
assert.equal(
  buildResetPasswordRedirect(preparedWorkerOrigin, { approvedOrigins: [preparedWorkerOrigin] }),
  `${preparedWorkerOrigin}/auth/reset-password/`,
);
assert.equal(
  buildAuthCallbackRedirect("https://evil.example", "/feed/", { approvedOrigins: [preparedWorkerOrigin] }),
  undefined,
);

console.log(JSON.stringify({ validCaseCount: validCases.length, rejectedCaseCount: rejectedCases.length, callbackFallback: "/", navigationCalls: browserCalls.length, passwordRecoveryOriginChecked: true, preparedOriginMode: "EXPLICIT_APPROVED_ORIGIN_ONLY" }));
