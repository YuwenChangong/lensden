import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Tests the frozen UI with nonsecret local fixtures; never contacts a provider.
const root = 'C:/Users/1/.codex/worktrees/public-beta-release-candidate-20261021/OpenGlass Hub';
const require = createRequire(path.join(root, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(root, 'src/components/forum/AuthPanel.tsx'), 'utf8');
assert.match(source, /signInWithPassword\(\{ email, password, options: captchaToken \? \{ captchaToken \} : undefined \}\)/);
const server = await createServer({
  root: path.join(root, 'tests/visual/legal-consent-harness'),
  configFile: path.join(root, 'tests/visual/legal-consent-harness/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
  logLevel: 'silent',
});
let browser;
const passed = [];
let externalDispatches = 0;
let loopback;
try {
  await server.listen();
  loopback = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: false });
  const contexts = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(loopback + '/')) return route.continue();
      // Synthetic Turnstile driver is confined to this local harness context.
      if (url === 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit') {
        return route.fulfill({ contentType: 'text/javascript', body: `
          window.turnstile={render(el,o){window.__fixtureOptions=o;
            queueMicrotask(()=>o.callback('fixture-token'));return 1;},
            reset(){window.__fixtureResets=(window.__fixtureResets||0)+1;},
            remove(){window.__fixtureRemoves=(window.__fixtureRemoves||0)+1;}};` });
      }
      externalDispatches++;
      return route.abort();
    });
    contexts.push(context);
  }
  const pages = [];
  for (const context of contexts) {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(loopback, { waitUntil: 'networkidle' });
    pages.push(page);
  }
  // Only synthetic storage markers: no session, cookie or credential export.
  for (let i = 0; i < pages.length; i++) {
    await pages[i].evaluate(i => {
      localStorage.setItem('fixture-isolation', String(i));
      sessionStorage.setItem('fixture-isolation', String(i));
      document.cookie = `fixture-isolation=${i};path=/;SameSite=Strict`;
    }, i);
  }
  for (let i = 0; i < pages.length; i++) {
    assert.equal(await pages[i].evaluate(i =>
      localStorage.getItem('fixture-isolation') === String(i)
      && sessionStorage.getItem('fixture-isolation') === String(i)
      && document.cookie === `fixture-isolation=${i}`, i), true);
  }
  passed.push('THREE_REAL_EDGE_CONTEXTS_ISOLATED_LOCAL_FIXTURES');
  const page = pages[0];
  async function scenario(name) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.locator('form input[type=email]').fill('fixture@example.invalid');
    await page.locator('form input[type=password]').fill('local-nonsecret-fixture');
  }
  async function submit() {
    await page.locator('form button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('form button[type=submit]')?.disabled);
  }
  async function calls() { return page.locator('output').textContent(); }
  async function sdkCalls() { return page.evaluate(() => window.__authSdkCalls.length); }
  await scenario('login-captcha-required-missing');
  await submit();
  assert.equal(await sdkCalls(), 0);
  passed.push('REQUIRED_MISSING_PROOF_NO_AUTH_SUBMISSION');
  await scenario('login-captcha-required-expired');
  await submit();
  assert.equal(await sdkCalls(), 0);
  passed.push('EXPIRED_PROOF_NO_AUTH_SUBMISSION');
  await scenario('login-captcha-prepare-token');
  await submit();
  assert.equal(await sdkCalls(), 1);
  assert.match(await calls(), /tokenPresent:true/);
  assert.match(await calls(), /navigate:\/feed\//);
  passed.push('PROOF_FORWARDED_AND_SAFE_NAVIGATION');
  await scenario('login-captcha-required-widget');
  await page.waitForFunction(() => !!window.__fixtureOptions);
  await submit();
  assert.equal(await sdkCalls(), 1);
  assert.match(await calls(), /tokenPresent:true/);
  assert.match(await calls(), /navigate:\/feed\//);
  assert.equal(await page.evaluate(() => window.__fixtureResets), 1);
  passed.push('REAL_WIDGET_CALLBACK_CONSUMED_FORWARDED_RESET');
  await scenario('login-abuse-required-structured');
  await submit();
  assert.equal(await sdkCalls(), 1);
  assert.doesNotMatch(await calls(), /navigate:/);
  passed.push('STRUCTURED_CAPTCHA_FAILURE_NO_SUCCESS_NAVIGATION');
  await page.getByRole('button', { name: 'callback-current-consent', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('replace:/feed/'));
  passed.push('CALLBACK_KNOWN_SESSION_SAFE_REPLACE');
  await page.getByRole('button', { name: 'callback-no-session', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('sessionMissing'));
  assert.doesNotMatch(await calls(), /replace:/);
  passed.push('CALLBACK_NO_SESSION_NO_SUCCESS');
  assert.equal(externalDispatches, 0);
} finally {
  if (browser) await browser.close();
  await server.close();
}
console.log(JSON.stringify({ status: 'PASS', checks: passed.length, passed,
  productionRequests: 0, providerRequests: 0, externalDispatches,
  realProductionCaptcha: 'NOT_VERIFIED', screenshots: 0, traces: 0,
  productionCredentialsUsed: false, browserAndServerClosed: true }));
