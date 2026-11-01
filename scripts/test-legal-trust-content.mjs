import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { getUiMessages } from "../src/lib/i18n/catalog.ts";
import { getAuthMessages } from "../src/lib/auth-messages.ts";
import ts from "typescript";

const root = process.cwd();
const legalPages = [
  ["terms", "src/pages/terms/index.astro"],
  ["privacy", "src/pages/privacy/index.astro"],
  ["guidelines", "src/pages/community-guidelines/index.astro"],
  ["safety", "src/pages/safety/index.astro"],
  ["accountDeletion", "src/pages/account-deletion/index.astro"],
  ["contact", "src/pages/contact/index.astro"],
  ["consent", "src/pages/legal-consent/index.astro"],
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function unwrapParentheses(node) {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function isSignupNoticeBranch(notice) {
  let owner = notice.parent;
  while (owner && ts.isParenthesizedExpression(owner)) owner = owner.parent;
  if (!owner || !ts.isConditionalExpression(owner) || unwrapParentheses(owner.whenTrue) !== notice
    || unwrapParentheses(owner.whenFalse).kind !== ts.SyntaxKind.NullKeyword) return false;
  const condition = unwrapParentheses(owner.condition);
  if (!ts.isBinaryExpression(condition) || condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return false;
  const left = unwrapParentheses(condition.left);
  const right = unwrapParentheses(condition.right);
  return ts.isIdentifier(left) && left.text === "mode" && ts.isStringLiteral(right) && right.text === "signup";
}

function runStripTypes(code) {
  return execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", code], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function gitLines(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function main() {
  const legalPolicySource = await read("src/lib/legal-policy.ts");
  const legalPageComponent = await read("src/components/legal/LegalPage.astro");
  const communityLayout = await read("src/layouts/CommunityLayout.astro");
  const loginPage = await read("src/pages/login/index.astro");
  const authPanel = await read("src/components/forum/AuthPanel.tsx");
  const registerPage = await read("src/pages/register/index.astro");
  const sitemap = await read("src/pages/sitemap.xml.ts");
  const docs = await read("docs/ops/legal-trust-policy-management.md");

  const configPayload = JSON.parse(
    runStripTypes(`
      const mod = await import("./src/lib/legal-policy.ts");
      process.stdout.write(
        JSON.stringify({
          platformName: mod.LEGAL_POLICY.platformName,
          minimumAge: mod.LEGAL_POLICY.minimumAge,
          bundleVersion: mod.LEGAL_POLICY.bundleVersion,
          termsVersion: mod.LEGAL_POLICY.termsVersion,
          privacyVersion: mod.LEGAL_POLICY.privacyVersion,
          guidelinesVersion: mod.LEGAL_POLICY.guidelinesVersion,
          effectiveDate: mod.LEGAL_POLICY.effectiveDate,
          languages: mod.LEGAL_POLICY.languages,
          routes: mod.LEGAL_POLICY.routes,
          missingContacts: mod.getMissingPublicLegalContactKeys(),
          contactsReady: mod.hasConfiguredPublicLegalContacts(),
        }),
      );
    `),
  );

  assert(configPayload.platformName === "Lensden", "Platform name must remain Lensden.");
  assert(configPayload.minimumAge === 16, "Minimum age must stay exactly 16.");
  assert(Boolean(configPayload.bundleVersion), "Bundle version must be non-empty.");
  assert(Boolean(configPayload.termsVersion), "Terms version must be non-empty.");
  assert(Boolean(configPayload.privacyVersion), "Privacy version must be non-empty.");
  assert(Boolean(configPayload.guidelinesVersion), "Guidelines version must be non-empty.");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(configPayload.effectiveDate), "Effective date must be explicit YYYY-MM-DD.");
  assert(configPayload.languages.includes("zh-CN"), "Chinese support must be declared.");
  assert(configPayload.languages.includes("en"), "English support must be declared.");

  for (const routeKey of ["terms", "privacy", "guidelines", "safety", "accountDeletion", "contact", "consent"]) {
    assert(Boolean(configPayload.routes[routeKey]), `Missing route definition for ${routeKey}.`);
  }

  assert(Array.isArray(configPayload.missingContacts), "Missing public contact configuration must be detectable.");
  assert(legalPolicySource.includes("PUBLIC_LEGAL_CONTACT_ENV"), "Public legal contact configuration should stay separate from secrets.");
  assert(!legalPolicySource.includes("@example.com"), "Legal policy config must not hardcode fake email fallbacks.");

  assert((legalPageComponent.match(/<h1\b/g) ?? []).length === 1, "Legal page layout must render exactly one H1.");
  const languageNav = legalPageComponent.match(/<nav\b[^>]*class="legal-page__language-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[0];
  assert(Boolean(languageNav), "Legal page layout must expose real language navigation.");
  if (languageNav.includes("aria-label={text.languageNavigation}")) {
    assert(legalPageComponent.includes("getUiMessages(uiLocale).documents"), "Document controls must consume the approved UI catalog.");
    for (const locale of ["zh-CN", "en"]) {
      assert(Boolean(getUiMessages(locale).documents.languageNavigation?.trim()), `Missing ${locale} document language navigation label.`);
    }
  } else {
    assert(languageNav.includes('aria-label="Language navigation"'), "Current pre-selection language navigation must retain its accessible label.");
    assert(languageNav.includes('href="#legal-zh"') && languageNav.includes('href="#legal-en"'), "Current language controls must target both authored sections.");
  }
  const footer = communityLayout.match(/<footer\b[^>]*class="community-site-footer"[^>]*>([\s\S]*?)<\/footer>/)?.[0];
  assert(Boolean(footer), "Shared legal footer must exist.");
  const footerNav = footer.match(/<nav\b[^>]*aria-label=\{messages\.legalLinks\}[^>]*>([\s\S]*?)<\/nav>/)?.[0];
  assert(Boolean(footerNav), "Shared footer must retain labeled legal navigation.");
  assert(footerNav.includes("LEGAL_POLICY_LINKS.map") && footerNav.includes("href={link.href}"), "Footer links must come from central legal routes.");
  assert(communityLayout.includes("getUiMessages(localeContext.locale).shell"), "Footer must consume the approved shell catalog.");
  for (const locale of ["zh-CN", "en"]) {
    assert(Boolean(getUiMessages(locale).shell.legalLinks?.trim()), `Missing ${locale} legal footer navigation label.`);
  }
  const authAst = ts.createSourceFile("AuthPanel.tsx", authPanel, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const noticeNodes = [];
  function findNotice(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(authAst) === "p"
      && node.openingElement.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
        && attribute.name.text === "className" && attribute.initializer
        && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "auth-signup-notice")) noticeNodes.push(node);
    ts.forEachChild(node, findNotice);
  }
  findNotice(authAst);
  assert(noticeNodes.length === 1, "AuthPanel must own one compact signup legal notice.");
  const notice = noticeNodes[0];
  assert(isSignupNoticeBranch(notice), "Legal notice must be gated only by signup mode.");
  const fixtureNotice = '<p className="auth-signup-notice" />';
  for (const [expression, expected] of [
    [`mode === "signup" ? ${fixtureNotice} : null`, true],
    [`mode === "signup" ? (${fixtureNotice}) : null`, true],
    [`((mode) === ("signup")) ? (((${fixtureNotice}))) : (null)`, true],
    [`mode === "login" ? (${fixtureNotice}) : null`, false],
    [fixtureNotice, false],
    [`mode === "signup" ? (${fixtureNotice}) : <p />`, false],
    [`mode === "signup" ? render(${fixtureNotice}) : null`, false],
    [`mode === "signup" ? (ready && ${fixtureNotice}) : null`, false],
    [`mode === "signup" ? <div>${fixtureNotice}</div> : null`, false],
    [`mode === "signup" ? (() => ${fixtureNotice}) : null`, false],
  ]) {
    const fixtureAst = ts.createSourceFile("notice-fixture.tsx", `const view = ${expression};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let fixtureNode;
    function findFixture(node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(fixtureAst) === "p"
        && node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
          && attribute.name.text === "className")) fixtureNode = node;
      ts.forEachChild(node, findFixture);
    }
    findFixture(fixtureAst);
    assert(Boolean(fixtureNode) && isSignupNoticeBranch(fixtureNode) === expected, "Signup notice ownership matcher must preserve negative boundaries.");
  }
  const noticeSource = notice.getText(authAst);
  for (const route of ["terms", "privacy", "guidelines"]) {
    assert(noticeSource.includes(`href={LEGAL_POLICY.routes.${route}}`), `Signup legal notice must use the central ${route} route.`);
  }
  for (const key of ["signupNoticeLead", "signupNoticeTerms", "signupNoticePrivacyLead", "signupNoticePrivacy", "signupNoticeGuidelinesLead", "signupNoticeGuidelines"]) {
    assert(noticeSource.includes(`{messages.${key}}`), `Signup legal notice must bind its typed ${key} message.`);
    for (const locale of ["zh-CN", "en"]) assert(Boolean(getAuthMessages(locale)[key]?.trim()), `Missing ${locale} signup notice message ${key}.`);
  }
  assert(!/legalAcknowledged|ageEligible|recordLegalConsent|type\s*=\s*["']checkbox/i.test(authPanel), "AuthPanel must not add legal/age checkbox state or consent writes.");
  assert(authPanel.includes('if (mode === "login")') && authPanel.includes("signInWithPassword"), "Password login must retain its independent login branch.");
  assert(loginPage.includes("initialMode={initialMode}") && loginPage.includes('getSafeNext(Astro.url.searchParams.get("next"))'), "Login route must retain initial mode and safe next wiring.");
  assert(
    loginPage.includes('modeParam === "register" || modeParam === "signup" ? "signup" : "login"'),
    "Login page should map register mode to signup.",
  );
  assert(registerPage.includes('redirectUrl.searchParams.set("next", safeNext);'), "Register redirect should preserve a sanitized next parameter.");

  for (const [routeKey, relativePath] of legalPages) {
    const source = await read(relativePath);
    if (routeKey === "consent") continue;
    assert(source.includes("headingZh="), `${routeKey} page must define a Chinese heading.`);
    assert(source.includes("headingEn="), `${routeKey} page must define an English heading.`);
    assert(source.includes("routeKey="), `${routeKey} page must bind its legal route key.`);
    assert(source.includes("version={getLegalPolicyVersion("), `${routeKey} page must use the central version helper.`);
    assert(!source.includes("<h1"), `${routeKey} page should rely on the shared legal layout for its H1.`);
    assert(!/24\/7|guarantee/i.test(source), `${routeKey} page must avoid unsupported monitoring or guarantee claims.`);
    assert(!/@example\.(com|test)/i.test(source), `${routeKey} page must not render placeholder contact email.`);
    assert(!/jurisdiction|司法管辖|本公司|LLC|Ltd\./i.test(source), `${routeKey} page must not invent a jurisdiction or legal entity.`);
  }

  const termsPage = await read("src/pages/terms/index.astro");
  const privacyPage = await read("src/pages/privacy/index.astro");
  assert(!(await read("src/pages/search/index.astro")).includes('"测试"'), "Public search suggestions must not include a source-owned QA term.");
  const accountDeletionPage = await read("src/pages/account-deletion/index.astro");
  const safetyPage = await read("src/pages/safety/index.astro");
  const legalConsentPage = await read("src/pages/legal-consent/index.astro");

  assert(termsPage.includes("用户保留其提交内容的权利"), "Terms must preserve user ownership in Chinese.");
  assert(termsPage.includes("You retain rights in content you submit"), "Terms must preserve user ownership in English.");
  assert(termsPage.includes("LEGAL_POLICY.minimumAge"), "Terms must use the central minimum-age value.");

  for (const productName of ["Supabase", "Cloudflare Workers/R2", "OpenAI moderation when enabled"]) {
    assert(privacyPage.includes(productName), `Privacy policy must identify evidenced services including ${productName}.`);
  }
  assert(!accountDeletionPage.includes("承诺自动即时删除"), "Account deletion page must not promise automatic immediate deletion.");
  assert(!safetyPage.includes("24/7"), "Safety page must not claim 24/7 monitoring.");
  assert(safetyPage.includes("not an emergency service"), "Safety page must retain the emergency-service limitation.");

  const contactsSurface = legalPageComponent.match(/<aside\b[^>]*class="legal-page__contacts"[^>]*>([\s\S]*?)<\/aside>/)?.[0];
  assert(Boolean(contactsSurface) && legalPageComponent.includes("showPublicContacts &&"), "Shared public contact surface must remain controlled by its existing prop.");
  for (const [key, valueKey, labels] of [
    ["operator", "operator", ["运营方", "Operator"]],
    ["support", "support", ["支持", "Support"]],
    ["abuse", "abuse", ["滥用与安全", "Abuse and safety"]],
    ["privacyRequests", "privacy", ["隐私请求", "Privacy requests"]],
    ["intellectualProperty", "intellectualProperty", ["知识产权投诉", "Intellectual property complaints"]],
  ]) {
    assert(contactsSurface.includes(`PUBLIC_LEGAL_CONTACTS.${valueKey}`), `Contact ${key} must retain its central value.`);
    if (valueKey !== "operator") assert(contactsSurface.includes(`mailto:\${PUBLIC_LEGAL_CONTACTS.${valueKey}}`), `Contact ${key} must retain its central mailto route.`);
    if (contactsSurface.includes(`{text.${key}}`)) {
      assert(legalPageComponent.includes("getUiMessages(uiLocale).documents"), "Public contact labels must consume the approved document catalog.");
      for (const locale of ["zh-CN", "en"]) assert(Boolean(getUiMessages(locale).documents[key]?.trim()), `Missing ${locale} public contact label ${key}.`);
    } else {
      for (const label of labels) assert(contactsSurface.includes(label), `Current public contact label ${key} must exist in both languages.`);
    }
  }

  assert(/export const prerender\s*=\s*false/.test(legalConsentPage), "Legacy consent redirect must remain request-rendered.");
  assert(/Astro\.redirect\(getSafeConsentNext\(Astro\.url\.searchParams\.get\("next"\)\),\s*302\)/.test(legalConsentPage), "Legacy consent route must sanitize next and use a 302 compatibility redirect.");
  assert(!/LegalConsentPage|recordLegalConsent|requireLegalConsent|supabase|\.from\(|\.rpc\(/i.test(legalConsentPage), "Legacy redirect must not introduce a runtime consent component, write or database prerequisite.");

  for (const route of [
    'absoluteUrl(LEGAL_POLICY.routes.terms)',
    'absoluteUrl(LEGAL_POLICY.routes.privacy)',
    'absoluteUrl(LEGAL_POLICY.routes.guidelines)',
    'absoluteUrl(LEGAL_POLICY.routes.safety)',
    'absoluteUrl(LEGAL_POLICY.routes.accountDeletion)',
    'absoluteUrl(LEGAL_POLICY.routes.contact)',
  ]) {
    assert(sitemap.includes(route), `Sitemap must include ${route}.`);
  }
  assert(!sitemap.includes('absoluteUrl(LEGAL_POLICY.routes.consent)'), "Sitemap must exclude the noindex legal-consent utility page.");

  assert(docs.includes("Phase 1"), "Legal ops doc must describe Phase 1 scope.");
  assert(docs.includes("qualified lawyer"), "Legal ops doc must require qualified legal review.");
  assert(docs.includes("Phase 2"), "Legal ops doc must describe deferred Phase 2 work.");
  assert(docs.includes("Phase 3"), "Legal ops doc must describe deferred Phase 3 work.");
  assert(docs.includes("Phase 4"), "Legal ops doc must describe deferred Phase 4 work.");

  const diffFiles = new Set([
    ...gitLines(["diff", "--name-only", "HEAD"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ]);

  for (const forbiddenPath of [
    "src/pages/api/consent",
    "src/lib/consent",
  ]) {
    assert(
      !Array.from(diffFiles).some((file) => file.startsWith(forbiddenPath)),
      `Phase 1 diff must not introduce ${forbiddenPath}.`,
    );
  }

  const unexpectedLegalMigrations = Array.from(diffFiles).filter(
    (file) => file.startsWith("supabase/migrations/") && file !== "supabase/migrations/20260712_legal_policy_acceptances.sql",
  );
  assert(
    unexpectedLegalMigrations.length === 0,
    `Legal foundation diff must not introduce unrelated migrations: ${unexpectedLegalMigrations.join(", ")}`,
  );

  const changedLockfiles = Array.from(diffFiles).filter((file) => /package-lock|pnpm-lock|yarn.lock/.test(file));
  assert(
    changedLockfiles.every((file) => file === "package-lock.json"),
    `Legal-content validation permits only the repository npm lockfile for reviewed development-tooling additions: ${changedLockfiles.join(", ")}`,
  );
  assert(
    !Array.from(diffFiles).some((file) => /staging-destructive-qa-recovery-manifest-v3/i.test(file)),
    "Phase 1 must not touch parked v3 recovery work.",
  );
  assert(!loginPage.includes("checkbox"), "Login page must not claim a consent checkbox is implemented.");
  assert(!communityLayout.includes("consent checkbox"), "Shared layout must not mention a consent checkbox.");

  console.log(
    `LEGAL_TRUST_CONTENT_OK contactsReady=${configPayload.contactsReady} missing=${configPayload.missingContacts.length} files=${diffFiles.size}`,
  );
}

main().catch((error) => {
  console.error(`LEGAL_TRUST_CONTENT_FAIL ${error.message}`);
  process.exitCode = 1;
});
