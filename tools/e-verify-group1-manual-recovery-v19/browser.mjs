import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { openFocus, controlReady } from '../e-verify-group1-control-v16/control.mjs';
import { chromium } from 'file:///C:/Users/1/.codex/worktrees/a-deploy-release-readiness/OpenGlass%20Hub/node_modules/playwright/index.mjs';
import { createProfile, cleanupProfile } from '../e-verify-native-manual/profile.mjs';
import { PrivateChannel } from '../e-verify-group1-manual-auth/channel.mjs';
import { negativeBody } from '../e-verify-group1-manual-auth/monitor.mjs';
import { classifyObserved } from '../e-verify-group1-fast-track-v18/monitor.mjs';
import { ReviewedPublicResources } from '../e-verify-group1-other-request/public-resources.mjs';

export async function openNativeBrowser({ actor, binding, appOrigin, supabaseOrigin, caps, budget, transport, staticPaths, staticManifest = [], iconPaths = [], pageAssertions = {},
  workMs = 1740000, fixtureSetup, headless = false } = {}) {
  const profile = createProfile(); let shell, context, p, portal, server, closing = false, closed = false, failure = null;
  const title = 'OGH QA ' + actor + ' ' + randomBytes(6).toString('hex');
  const controlEvidence = { rendered: false, handlerReady: false, windowFocused: false, readyAcknowledgements: 0, startEvents: 0, focusChecks: 0 };
  let focus, controlOrigin, diagnosticStage = 'LOGIN_' + actor;
  const unenumeratedGets = [], unresolvedAborts = []; let observedExternalGets = 0, requestSerial = 0;
  const acceptedRequests = new WeakMap();
  let kind, loginObserved = false, logoutArmed = false, logoutObserved = false, negativePassed = false, inFlight = 0;
  let started = false, captchaSeen = false, finished = false, finishAllowed = false, publicKey, channel, requestsObserved = 0, authResponsesPending = 0;
  let nativeLoginSucceeded = false, captures = 0, productionCaptchaConfigChecked = false;
  let captureTail = Promise.resolve();
  let lastFailedRequest = null, lastRejectedRequest = null, exactLogoutNoContentAbortObserved = 0, identityConfirmed = false, adminReadConfirmed = false;
  const rlsEvidence = [], publicResources = new ReviewedPublicResources({ appOrigin, supabaseOrigin, actor, staticManifest });
  const until = Date.now() + workMs, pending = new Set(), requestChecks = new WeakMap(), excludedIcons = new WeakSet(), responseStatuses = new WeakMap();
  const rewritten = new Map();
  const clearRewrite = q => { rewritten.get(q)?.fill(0); rewritten.delete(q); };
  const check = () => { if (failure || closing || Date.now() >= until) throw Error(failure || 'WORK_DEADLINE'); budget.assertActive(); };
  const stop = code => { failure ||= /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'NATIVE_OBSERVATION_FAILURE'; budget.stop(); void close().catch(() => {}); };
  const tracked = job => { const promise = job().catch(error => stop(error?.message || 'NATIVE_OBSERVATION_FAILURE')); pending.add(promise); promise.finally(() => pending.delete(promise)); return promise; };
  const wait = async (predicate, ms = 300000) => { const end = Math.min(until, Date.now() + ms); while (!predicate()) {
    check(); if (Date.now() >= end) throw Error('MANUAL_WAIT_DEADLINE'); await new Promise(r => setTimeout(r, 25)); } check(); };
  const controlState = () => ({ startDisabled: !kind || started, captchaDisabled: kind !== 'success' || !started || captchaSeen,
    finishDisabled: !finishAllowed || kind === 'success' && !captchaSeen });
  const prompt = async text => { if (!closing) await portal.evaluate(model => {
    document.querySelector('#status').textContent = model.text;
    for (const name of ['start', 'captcha', 'finish']) document.querySelector('#' + name).disabled = model.state[name + 'Disabled'];
  }, { text, state: controlState() }); };
  const showControl = async () => {
    check(); await portal.bringToFront();
    await focus.focus(); controlEvidence.windowFocused = true; controlEvidence.focusChecks++;
    await controlReady(portal, controlOrigin + '/control', controlEvidence, until); check();
  };
  let closePromise;
  const close = () => closePromise ||= (async () => {
    closing = true; clearTimeout(timer); channel?.dispose(); let ok = true;
    const bound = async (action, ms) => { let t; try { await Promise.race([action(), new Promise((_, reject) => { t = setTimeout(() => reject(Error('CLEANUP_TIMEOUT')), ms); })]); }
      catch { ok = false; } finally { clearTimeout(t); } };
    await bound(async () => context?.close(), 5000); await bound(async () => shell?.browser()?.close(), 5000);
    await bound(async () => focus?.close(), 3000);
    for (const body of rewritten.values()) body.fill(0); rewritten.clear();
    await bound(async () => { server?.closeAllConnections(); if (server) await new Promise(r => server.close(r)); }, 1000);
    if (ok) try { ok = cleanupProfile(profile); } catch { ok = false; }
    closed = ok; if (!ok) throw Error('NATIVE_CLEANUP_FAILED');
  })();
  const timer = setTimeout(() => stop('WORK_DEADLINE'), workMs);
  try {
    server = http.createServer((q, r) => {
      if (q.method !== 'GET' || q.url !== '/control') { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; worker-src 'none'; connect-src 'none'" });
      r.end('<!doctype html><meta charset="utf-8"><title>' + title + '</title><link rel="icon" href="data:,"><style>body{background:#141619;color:#f5f6f7;font:18px system-ui;margin:32px}button{min-height:44px;margin:8px 8px 8px 0;padding:8px 16px;font:16px system-ui}button:disabled{opacity:.55}#status{max-width:760px;line-height:1.6}</style><h1>GROUP_1 ' + actor + '</h1><p id="status">等待当前阶段。只在本窗口收到提示后操作。</p>'
        + '<button id="start" disabled onclick="emit(\'start\')">Start</button><button id="captcha" disabled onclick="emit(\'captcha\')">CAPTCHA observed</button>'
        + '<button id="finish" disabled onclick="emit(\'finish\')">Finish</button><button id="stop" onclick="emit(\'stop\')">Stop</button>'
        + '<script>async function emit(name){const state=await qaEvent(name);if(state)for(const n of ["start","captcha","finish"])document.querySelector("#"+n).disabled=state[n+"Disabled"]}</script>');
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r)); controlOrigin = 'http://127.0.0.1:' + server.address().port;
    shell = await chromium.launchPersistentContext(profile, { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless,
      ...(fixtureSetup?.launchOptions || {}), args: ['--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', ...(fixtureSetup?.launchOptions?.args || [])] });
    context = await shell.browser().newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    if ((await context.cookies()).length) throw Error('EXISTING_COOKIE_STATE');
    portal = await context.newPage(); p = await context.newPage();
    await p.setContent('<!doctype html><meta charset="utf-8"><title>OGH waiting ' + actor + '</title><link rel="icon" href="data:,"><h1>GROUP_1 ' + actor + '</h1><p>Waiting for Start in the OGH QA control window. Do not enter credentials here.</p>');
    for (const other of shell.pages()) await other.close();
    context.on('page', page => { if (![p, portal].includes(page)) stop('UNAPPROVED_POPUP_OBSERVED'); });
    portal.on('pageerror', () => stop('CONTROL_PAGE_SCRIPT_FAILED'));
    await context.exposeBinding('qaEvent', (source, name) => {
      if (source.page !== portal || source.frame !== portal.mainFrame() || source.frame.url() !== controlOrigin + '/control') { stop('CONTROL_EVENT_SOURCE_INVALID'); return; }
      if (name === 'ready') { controlEvidence.readyAcknowledgements++; return { ...controlState(), ready: true }; }
      if (name === 'stop') stop('OWNER_STOP');
      else if (name === 'start' && kind && !started && controlEvidence.rendered && controlEvidence.handlerReady && controlEvidence.windowFocused) { started = true; controlEvidence.startEvents++; }
      else if (name === 'captcha' && kind === 'success' && started) captchaSeen = true;
      else if (name === 'finish' && finishAllowed && (kind !== 'success' || captchaSeen)) finished = true;
      return controlState();
    });
    await fixtureSetup?.beforeControl?.({ context, portal, p, controlOrigin });
    budget.reserve(['allBrowserHttpDispatchesMax']);
    const loaded = await portal.goto(controlOrigin + '/control', { waitUntil: 'domcontentloaded', timeout: Math.max(1, Math.min(5000, until - Date.now())) }).catch(() => { throw Error('CONTROL_PAGE_NAVIGATION_FAILED'); });
    if (!loaded || loaded.status() !== 200) throw Error('CONTROL_PAGE_NAVIGATION_FAILED');
    await controlReady(portal, controlOrigin + '/control', controlEvidence, until);
    focus = await openFocus({ profile, title, deadline: until }); await showControl();
    channel = new PrivateChannel({ actor, binding, contextIdentity: context, supabaseOrigin, appOrigin, budget, transport, validUntil: until });
    p.on('request', q => {
      if (closing || q.url() === 'about:blank' || q.url().startsWith('data:,')) return;
      inFlight++; requestsObserved++;
      const observedAt = { id: 'request-' + (++requestSerial), stage: diagnosticStage, started, kind };
      requestChecks.set(q, tracked(async () => {
        const u = new URL(q.url());
        if (['image', 'media', 'font'].includes(q.resourceType()) && u.origin !== 'https://challenges.cloudflare.com') { budget.reserve(['allBrowserHttpDispatchesMax']); return; }
        if (q.method() === 'GET' && u.origin === appOrigin && !u.search && iconPaths.includes(u.pathname)) { budget.reserve(['allBrowserHttpDispatchesMax']); return; }
        const h = await q.allHeaders();
        let frameObserved = false; try { frameObserved = q.frame().page() === p; } catch {}
        let rule;
        try { rule = classifyObserved({ url: q.url(), method: q.method(), type: q.resourceType(), appOrigin, supabaseOrigin, staticPaths,
          actor, stage: diagnosticStage, started, frameObserved, mainFrameNavigation: q.isNavigationRequest() && q.frame() === p.mainFrame(), headers: h }); }
        catch (error) {
          lastRejectedRequest = { ...publicResources.observe({ url: q.url(), method: q.method(), actor }, { stage: 'LOGIN_' + actor,
            resourceType: q.resourceType(), source: q.isNavigationRequest() ? 'BROWSER_NAVIGATION' : 'BROWSER_FETCH', frameClass: 'NO_FRAME_OR_UNAVAILABLE' }),
            networkDispatchOccurred: 'UNKNOWN_OR_ALREADY_SENT', admissionBoundary: 'OBSERVATION_ONLY', rejectionCategory: 'OBSERVED_UNAPPROVED_REQUEST' };
          throw error;
        }
        // AFTER-dispatch observation, explicitly soft and incomplete for native Worker/background traffic.
        budget.reserve(rule.charges);
        if (rule.kind === 'unenumerated-third-party-get-observed') {
          observedExternalGets++;
          if (unenumeratedGets.length < 40) unenumeratedGets.push({ actor, stage: diagnosticStage, method: 'GET', resourceType: q.resourceType(),
            frameClass: q.frame() === p.mainFrame() ? 'APPLICATION_MAIN_FRAME' : 'CHILD_FRAME_ATTRIBUTION_UNPROVEN',
            legitimacy: 'UNKNOWN', originClass: 'UNENUMERATED_EXTERNAL', dispatchStatus: 'UNKNOWN_OR_ALREADY_SENT', networkBoundary: 'MONITOR_ONLY' });
        }
        if (h.authorization && ![appOrigin, supabaseOrigin].includes(new URL(q.url()).origin)) throw Error('OBSERVED_CREDENTIAL_ORIGIN');
        if (['login', 'refresh', 'logout'].includes(rule.kind)) {
          if (q.frame() !== p.mainFrame() || !started || h.origin !== appOrigin) throw Error('AUTH_FRAME_OR_ORIGIN_MISMATCH');
          if (rule.kind === 'login') {
            if (loginObserved || !kind) throw Error('EXCESS_MANUAL_LOGIN'); loginObserved = true;
            const bytes = Buffer.from(q.postDataBuffer() || Buffer.alloc(0));
            try { if (bytes.length > 32768) throw Error('OBSERVED_AUTH_BODY_BOUND'); const b = JSON.parse(bytes);
              if (b.email?.toLowerCase() !== binding.email.toLowerCase() || typeof b.password !== 'string' || !b.password) throw Error('LOGIN_ACTOR_MISMATCH');
              if (['success', 'wrong-password'].includes(kind) && (typeof b.gotrue_meta_security?.captcha_token !== 'string' || !b.gotrue_meta_security.captcha_token)) throw Error('OBSERVED_CAPTCHA_PROOF_MISSING');
              budget.verifyLoginPassword(actor, b.password, kind); }
            finally { bytes?.fill(0); }
          } else if (!nativeLoginSucceeded || rule.kind === 'logout' && !logoutArmed) throw Error('AUTH_SESSION_STAGE_INVALID');
        }
        acceptedRequests.set(q, { ...observedAt, frameObserved });
      }));
    });
    p.on('requestfinished', q => { inFlight = Math.max(0, inFlight - 1); clearRewrite(q); });
    p.on('requestfailed', q => { inFlight = Math.max(0, inFlight - 1); clearRewrite(q); if (!closing && !excludedIcons.has(q)) {
      const u = new URL(q.url()), error = q.failure()?.errorText;
      if (error === 'net::ERR_ABORTED' && responseStatuses.get(q) === 204 && q.method() === 'POST' && u.origin === supabaseOrigin
        && ['/auth/v1/logout', '/auth/v1/logout?scope=global'].includes(u.pathname + u.search) && q.frame() === p.mainFrame() && logoutArmed) {
        tracked(async () => {
          await captureTail;
          const cleared = await p.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith('-auth-token')).length === 0);
          if (!logoutObserved || !cleared) throw Error('LOGOUT_ABORT_WITHOUT_CONFIRMED_SDK_CLEAR');
          exactLogoutNoContentAbortObserved++;
        });
        return;
      }
      if (error === 'net::ERR_ABORTED' && q.method() === 'GET' && q.resourceType() === 'fetch'
        && ![appOrigin, supabaseOrigin].includes(u.origin)) {
        tracked(async () => {
          // Wait for the original envelope, method, stage and budget checks; never
          // let a cancellation race turn a rejected request into a continuation.
          await requestChecks.get(q);
          if (failure || closing) return;
          const accepted = acceptedRequests.get(q);
          if (!accepted || !accepted.frameObserved || !accepted.started || accepted.kind !== 'success'
            || accepted.stage !== 'LOGIN_' + actor || diagnosticStage !== 'LOGIN_' + actor) {
            lastFailedRequest = { method: 'GET', resourceType: 'fetch', originClass: 'OTHER', routeClass: 'REDACTED',
              responseStatus: null, errorClass: 'net::ERR_ABORTED' };
            throw Error('NATIVE_REQUEST_FAILED');
          }
          if (unresolvedAborts.length >= 40) throw Error('UNRESOLVED_ABORT_EVIDENCE_LIMIT');
          unresolvedAborts.push({ requestObservationId: accepted.id, actor, stage: accepted.stage,
            method: 'GET', resourceType: 'fetch', originClass: 'OTHER', routeClass: 'REDACTED',
            errorClass: 'net::ERR_ABORTED', classification: 'UNRESOLVED', legitimacy: 'UNKNOWN',
            dispatchStatus: 'UNKNOWN_OR_ALREADY_SENT', networkBoundary: 'MONITOR_ONLY', automaticRetry: false });
        });
        return;
      }
      lastFailedRequest = { method: q.method(), resourceType: q.resourceType(), originClass: u.origin === supabaseOrigin ? 'SUPABASE' : u.origin === appOrigin ? 'APPLICATION' : 'OTHER',
        routeClass: u.pathname === '/auth/v1/logout' ? 'AUTH_LOGOUT' : u.pathname === '/auth/v1/token' ? 'AUTH_TOKEN' : 'REDACTED', responseStatus: responseStatuses.get(q) ?? null,
        errorClass: /^net::ERR_[A-Z_]+$/.test(error || '') ? error : 'UNKNOWN' };
      stop('NATIVE_REQUEST_FAILED'); } });
    // Dedicated private response listener: no tracing, HAR, raw console or network-body persistence.
    p.on('response', response => {
      const u = new URL(response.url()); if (closing || u.origin !== supabaseOrigin || !['/auth/v1/token', '/auth/v1/logout'].includes(u.pathname)) return;
      responseStatuses.set(response.request(), response.status());
      if (response.request().method() === 'OPTIONS') return;
      authResponsesPending++;
      const previousCapture = captureTail;
      captureTail = tracked(async () => {
        let bytes;
        try {
          await previousCapture;
          const q = response.request(); await requestChecks.get(q); check();
          if (q.method() !== 'POST' || q.frame() !== p.mainFrame()) throw Error('AUTH_RESPONSE_SOURCE_INVALID');
          const headers = await q.allHeaders(); publicKey ??= headers.apikey;
          if (u.pathname === '/auth/v1/logout') {
            if (!logoutArmed || response.status() !== 204 || !channel.matchesBearer(headers.authorization)) throw Error('NATIVE_LOGOUT_INVALID');
            channel.dispose(); logoutObserved = true; return;
          }
          const refresh = u.search === '?grant_type=refresh_token';
          if (kind === 'success') {
            if (response.status() !== 200 || !['?grant_type=password', '?grant_type=refresh_token'].includes(u.search)) throw Error('NATIVE_AUTH_ASSERTION');
            if (!refresh) nativeLoginSucceeded = true;
            else channel.invalidateNativeRefresh();
            return;
          }
          const h = await response.allHeaders(); if (!/^application\/json(?:;|$)/i.test(h['content-type'] || '') || h['content-length'] && Number(h['content-length']) > 1048576) throw Error('NATIVE_AUTH_BODY_INVALID');
          let timer; try { bytes = await Promise.race([response.body(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('AUTH_BODY_TIMEOUT')), 15000); })]); } finally { clearTimeout(timer); }
          if (bytes.length > 1048576 || closing) throw Error('NATIVE_AUTH_BODY_INVALID'); const data = JSON.parse(bytes);
          if (!refresh && kind !== 'success') {
            if (![400, 422].includes(response.status()) || (data.code || data.error_code) !== (kind === 'wrong-password' ? 'invalid_credentials' : 'captcha_failed')) throw Error('NEGATIVE_AUTH_ASSERTION');
            negativePassed = true; return;
          }
          throw Error('UNEXPECTED_NATIVE_CAPTURE_STATE');
        } finally { bytes?.fill(0); authResponsesPending--; }
      });
    });
    if (fixtureSetup) await fixtureSetup.install({ context, p, portal, channel, actor, binding, controlOrigin });
    p.on('pageerror', () => stop('OBSERVED_PAGE_EXCEPTION'));
    p.on('websocket', () => stop('OBSERVED_UNAPPROVED_SOCKET'));
    p.on('worker', worker => {
      try { if (new URL(worker.url()).origin !== 'https://challenges.cloudflare.com') stop('OBSERVED_UNAPPROVED_WORKER'); }
      catch { stop('OBSERVED_UNAPPROVED_WORKER'); }
    });
    await context.route('**/*', async route => {
      if (['image', 'media', 'font'].includes(route.request().resourceType()) && new URL(route.request().url()).origin !== 'https://challenges.cloudflare.com') {
        excludedIcons.add(route.request()); await route.abort(); return;
      }
      await route.fallback();
    });
    await context.route(url => url.origin === appOrigin && !url.search && iconPaths.includes(url.pathname), async route => {
      if (route.request().method() !== 'GET') { stop('ICON_METHOD_INVALID'); await route.abort(); return; }
      excludedIcons.add(route.request()); await route.abort();
    });
    await context.route(url => url.href === supabaseOrigin + '/auth/v1/token?grant_type=password', async route => {
      try {
        if (!['invalid-captcha', 'missing-captcha'].includes(kind)) { if (fixtureSetup) await route.fallback(); else await route.continue(); return; }
        const q = route.request(); if (actor !== 'A' || q.method() !== 'POST' || q.frame() !== p.mainFrame()) throw Error('NEGATIVE_ROUTE_SOURCE_INVALID');
        const original = Buffer.from(q.postDataBuffer() || Buffer.alloc(0)), changed = negativeBody(kind, original);
        rewritten.set(q, changed);
        try { if (fixtureSetup) await route.fallback({ postData: changed }); else await route.continue({ postData: changed }); } finally { original.fill(0); }
      } catch { stop('NEGATIVE_ROUTE_FAILED'); await route.abort().catch(() => {}); }
    });
    const page = Object.freeze({ waitForSelector: async selector => { check(); await p.locator(selector).first().waitFor({ timeout: 15000 }); return true; } });
    const snapshot = async () => {
      check(); if (!nativeLoginSucceeded || !publicKey || new URL(p.url()).origin !== appOrigin || p.context() !== context) throw Error('PRIVATE_SNAPSHOT_SOURCE_INVALID');
      const storageKey = 'sb-' + new URL(supabaseOrigin).hostname.split('.')[0] + '-auth-token';
      // The exact SDK-owned storage key is read into the trusted process only.
      // No refresh token, cookie or password is returned; no file/receipt/CLI export.
      const data = await p.evaluate(key => {
        const raw = localStorage.getItem(key); if (!raw || raw.length > 1048576) return null;
        const session = JSON.parse(raw);
        return { access_token: session.access_token, token_type: session.token_type, user: { id: session.user?.id, email: session.user?.email } };
      }, storageKey);
      if (!data) throw Error('PRIVATE_SDK_SESSION_MISSING');
      channel.capture({ contextIdentity: context, actor, publicKey, data, refresh: captures > 0 }); captures++;
    };
    return Object.freeze({ page,
      permitLogin: value => { check(); if (kind || !['success', 'invalid-captcha', 'missing-captcha', 'wrong-password'].includes(value) || value !== 'success' && actor !== 'A') throw Error('MANUAL_LOGIN_SCOPE'); kind = value; diagnosticStage = value === 'invalid-captcha' ? 'NEGATIVE_CAPTCHA' : value === 'missing-captcha' ? 'NEGATIVE_MISSING_CAPTCHA' : value === 'wrong-password' ? 'NEGATIVE_PASSWORD' : 'LOGIN_' + actor; },
      async navigate(route) {
        check(); if (!['/login/', '/login/?next=%2Fproducts%2F', '/products/', '/products/xreal/xreal-air/', '/admin/devices/'].includes(route)) throw Error('NATIVE_NAVIGATION_SCOPE');
        if (!route.startsWith('/login/')) diagnosticStage = (route === '/products/' ? 'PAGE_CATALOG_' : route === '/admin/devices/' ? 'PAGE_ADMIN_' : 'PAGE_PRODUCT_DETAIL_') + actor;
        if (!started) { await showControl(); await prompt('当前 ' + actor + ' / ' + kind + '：点击一次 Start，然后在登录页输入该QA身份并完成真实 CAPTCHA。');
          await fixtureSetup?.start?.(portal); await wait(() => started); }
        const response = await p.goto(appOrigin + route, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (!response || response.status() !== 200) throw Error('NATIVE_PAGE_STATUS_INVALID');
        if (route.startsWith('/login/') && !fixtureSetup) {
          const configured = await p.evaluate(() => {
            const island = [...document.querySelectorAll('astro-island')].find(x => (x.getAttribute('component-url') || '').includes('/AuthPanel.'));
            if (!island) return false; const props = JSON.parse(island.getAttribute('props') || '{}');
            const mode = props.captchaMode?.[1], key = props.authTurnstileSiteKey?.[1];
            return mode === 'required' && typeof key === 'string' && /^0x[A-Za-z0-9_-]+$/.test(key);
          });
          if (!configured) throw Error('PRODUCTION_CAPTCHA_CONFIGURATION_UNVERIFIED'); productionCaptchaConfigChecked = true;
        }
        const assertion = pageAssertions[new URL(appOrigin + route).pathname];
        if (assertion) {
          const body = await response.body(); try { if (body.length > 2097152) throw Error('NATIVE_PAGE_BODY_BOUND');
            assertion({ status: response.status(), headers: await response.allHeaders(), body }); } finally { body.fill(0); }
        }
        await p.bringToFront(); await fixtureSetup?.navigate?.(p, route, kind);
      },
      async waitForSession(ms) { await wait(() => nativeLoginSucceeded, ms); },
      async waitForLanding() { diagnosticStage = 'LANDING_' + actor; await p.waitForURL(appOrigin + '/products/', { timeout: 15000 }); await page.waitForSelector('[data-brand-module]');
        const end = Date.now() + 15000; let quietSince;
        while (Date.now() < end) { check(); const hydrated = await p.evaluate(() => [...document.querySelectorAll('astro-island')].every(x => !x.hasAttribute('ssr')));
          if (hydrated && inFlight === 0 && pending.size === 0) { quietSince ??= Date.now(); if (Date.now() - quietSince >= 500) return true; } else quietSince = undefined;
          await new Promise(r => setTimeout(r, 25)); }
        throw Error('NATIVE_LANDING_NOT_SETTLED'); },
      verifyActor: async () => { check(); await snapshot(); identityConfirmed = await channel.verifyActor(); return identityConfirmed; },
      catalog: async id => { check(); const result = await channel.catalog(id); rlsEvidence.push({ id, actor, outcome: 'PASS' }); return result; },
      adminRead: async () => { check(); adminReadConfirmed = await channel.adminRead(); return adminReadConfirmed; },
      async assertAdminUi() {
        if (actor === 'ADMIN') { await page.waitForSelector('.admin-news-dashboard'); await page.waitForSelector('.admin-news-dashboard__list'); if (await p.locator('.comment-inline-error').count()) throw Error('ADMIN_UI_LOAD_FAILED'); }
        else { await p.locator('.admin-state-message p').filter({ hasText: /^(?:This account does not have administrator access\.|当前账号没有管理员权限)$/ }).waitFor({ timeout: 15000 }); if (await p.locator('.admin-news-dashboard').count()) throw Error('ADMIN_UI_ROLE_LEAK'); }
      },
      async waitForNegative(ms) { await wait(() => negativePassed, ms); finishAllowed = true; await showControl(); await prompt('已取得预期认证拒绝。请核对页面错误；确认后点击 Finish，异常则 Stop。'); await fixtureSetup?.finish?.(portal); await wait(() => finished, ms); },
      async logout() {
        diagnosticStage = 'LOGOUT_' + actor;
        check(); await snapshot(); logoutArmed = true; await showControl(); await prompt('已完成读取。请确认真实 CAPTCHA、页面及角色显示；点击 CAPTCHA observed，然后在网站用户菜单退出登录。');
        await fixtureSetup?.logout?.(p, portal); await wait(() => logoutObserved && pending.size === 0);
        const cleared = await p.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith('-auth-token')).length === 0); if (!cleared) throw Error('NATIVE_SDK_SESSION_NOT_CLEARED');
        finishAllowed = true; await showControl(); await prompt('登出已确认。完成本身份观察后点击 Finish；异常则 Stop。'); await fixtureSetup?.finish?.(portal); await wait(() => finished);
      },
      receipt: () => ({ actor, firstFailure: failure, nativeAuth: 'MONITOR_ONLY', diagnostics: { firstFailure: failure, lastFailedRequest, lastRejectedRequest, observedExternalGets, unenumeratedGets: unenumeratedGets.map(x => ({ ...x })),
        unresolvedAborts: unresolvedAborts.map(x => ({ ...x })), unresolvedAbortPolicy: 'POSITIVE_LOGIN_EXTERNAL_GET_FETCH_ONLY',
        exactPrivateOriginCollection: false, cdpAttribution: 'NOT_CLAIMED', valuesLogged: false },
        started, controlEvidence: { ...controlEvidence }, captchaOwnerObserved: captchaSeen, ownerFinished: finished, observedRequests: requestsObserved, inFlight, exactLogoutNoContentAbortObserved,
        productionCaptchaConfigChecked,
        identityConfirmed, adminReadConfirmed, rlsEvidence,
        channel: channel.receipt(), counts: budget.receipt(), closed, fixtureOnly: !!fixtureSetup }), close });
  } catch (error) { await close(); if (failure) throw Error(failure); throw error; }
}
