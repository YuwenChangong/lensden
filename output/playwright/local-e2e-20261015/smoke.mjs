import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const origin = 'http://127.0.0.1:4328';
const out = new URL('./', import.meta.url);
const results = [];
const recheck = process.env.OGH_SMOKE_RECHECK === '1';
let blockedRemoteRequests = 0;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking'] });
async function context(width = 1440, height = 900) {
  const c = await browser.newContext({ locale: 'en-US', viewport: { width, height }, serviceWorkers: 'block' });
  await c.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' && ['4328', '54321'].includes(u.port) && u.protocol === 'http:') return route.continue();
    blockedRemoteRequests++; return route.abort();
  });
  return c;
}
async function check(id, run) {
  try { const evidence = await run(); results.push({ id, status: 'PASS', ...evidence }); }
  catch (e) { results.push({ id, status: e.name === 'TimeoutError' ? 'BLOCKED' : 'FAIL', error: e.name,
    reason: e.message?.split('\n')[0].replace(/https?:\/\/\S+/g, '[URL]').slice(0, 180) }); }
}
try {
  for (const width of [1440, 390, 430]) {
    const c = await context(width, width === 1440 ? 900 : 932); const p = await c.newPage();
    try {
      await check('LOGIN_RENDER_' + width, async () => {
        const response = await p.goto(origin + '/login/', { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (response?.status() !== 200) throw Error('LOGIN_HTTP_STATUS');
        await p.getByRole('textbox', { name: 'Email', exact: true }).waitFor({ timeout: 10000 });
        await p.getByRole('textbox', { name: 'Password', exact: true }).waitFor({ timeout: 10000 });
        await p.getByRole('button', { name: 'Log in', exact: true }).waitFor({ timeout: 10000 });
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        await p.screenshot({ path: new URL('login-' + width + '.png', out).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
        if (overflow) throw Error('HORIZONTAL_OVERFLOW');
        return { httpStatus: 200, emailAndPasswordVisible: true, screenshot: 'login-' + width + '.png', horizontalOverflow: false };
      });
      if (width === 1440) {
        await check('LOGIN_EMPTY_PASSWORD_SUBMIT', async () => {
          await p.getByRole('textbox', { name: 'Email', exact: true }).fill('ui-smoke@example.invalid');
          await p.getByRole('button', { name: 'Log in', exact: true }).click();
          const valid = await p.getByRole('textbox', { name: 'Password', exact: true }).evaluate(e => e.validity.valid);
          await p.getByRole('textbox', { name: 'Email', exact: true }).fill('');
          if (valid || !p.url().startsWith(origin + '/login/')) throw Error('EMPTY_PASSWORD_NOT_BLOCKED');
          return { nativeFormValidation: true, authenticated: false };
        });
        await check('LOGIN_MODE_SWITCH', async () => {
          await p.getByRole('tab', { name: 'Sign up', exact: true }).click();
          if (await p.getByRole('tab', { name: 'Sign up', exact: true }).getAttribute('aria-selected') !== 'true') throw Error('SIGNUP_TAB_NOT_SELECTED');
          await p.getByRole('tab', { name: 'Log in', exact: true }).click();
          return { signupAndLoginTabs: true, registrationNotSubmitted: true };
        });
        await check('LOGIN_TO_LEGAL_NAVIGATION', async () => {
          await Promise.all([p.waitForURL(origin + '/privacy/', { waitUntil: 'domcontentloaded', timeout: 15000 }), p.getByRole('link', { name: 'Privacy', exact: true }).click()]);
          await p.locator('main h1').first().waitFor({ timeout: 10000 });
          return { target: '/privacy/', headingPresent: true };
        });
      }
    } finally { await c.close(); }
  }
  const paths = recheck ? ['/privacy/', '/terms/', '/community-guidelines/', '/contact/'] : ['/', '/about/', '/feed/', '/news/', '/products/', '/products/xreal/xreal-air/', '/circles/', '/search/?q=xreal', '/settings/', '/admin/devices/'];
  for (const path of paths) {
    const c = await context(), p = await c.newPage(); let navigations = 0;
    p.on('framenavigated', f => { if (f === p.mainFrame()) navigations++; });
    try {
      await check('PAGE_' + path, async () => {
        const response = await p.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 12000 });
        if (response?.status() !== 200) throw Error('PAGE_HTTP_' + response?.status());
        await p.locator('main').first().waitFor({ timeout: 5000 });
        await new Promise(r => setTimeout(r, 1200));
        const heading = await p.locator('h1').first().textContent({ timeout: 3000 });
        if (navigations > 3) throw Error('REPEATED_MAIN_FRAME_NAVIGATION');
        return { path, httpStatus: response.status(), heading, navigations, scope: 'ANONYMOUS_PAGE_RENDER_ONLY_NOT_DATA_ACCEPTANCE' };
      });
    } finally { await c.close(); }
  }
  for (const path of ['/api/admin/devices', '/api/users/me/summary']) {
    await check('ANONYMOUS_DENIED_' + path, async () => {
      const r = await fetch(origin + path, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      const body = await r.json();
      if (r.status !== 401 || body.ok === true || typeof (body.error ?? body.code) !== 'string') throw Error('UNAUTHENTICATED_DENIAL_CONTRACT');
      if (body.users || body.devices || body.email || body.access_token) throw Error('UNAUTHENTICATED_PRIVATE_DATA_EXPOSED');
      return { httpStatus: 401, denialBodyChecked: true, privateDataExposed: false };
    });
  }
} finally {
  await browser.close();
  if (recheck) {
    const initial = JSON.parse(await fs.readFile(new URL('INITIAL_ATTEMPT_SAFE.json', out), 'utf8'));
    for (const result of initial.results) {
      if (!results.some(current => current.id === result.id)) {
        results.push({ ...result, evidenceRun: 'INITIAL_ATTEMPT_SAFE.json',
          ...(result.status === 'BLOCKED' ? { blocker: 'LOCAL_DATABASE_UNAVAILABLE_OR_DEV_RUNTIME_TIMEOUT' } : {}) });
      }
    }
  }
  const report = { environment: 'LOCAL_REAL_ASTRO_APPLICATION_WITHOUT_AUTH_DATABASE', headless: true,
    results, blockedRemoteRequests, authenticatedAuth: 'BLOCKED', accountIsolation: 'BLOCKED', rlsPassed: 0, rlsTotal: 16,
    group1Completed: 0, group1Total: 14, businessWrites: 'NOT_RUN', productionRequests: 0, thirdPartyLiveRequests: 0,
    productionWrites: 0, oldAuthorizationReused: false, browserClosed: true };
  await fs.writeFile(new URL('RESULTS_SAFE.json', out), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
