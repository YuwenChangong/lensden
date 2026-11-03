import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { browserOriginDiagnostic } from './browser-origin-diagnostic.mjs';

const ROOT = 'C:/Users/1/.codex/worktrees/public-beta-release-candidate-20261021/OpenGlass Hub';
const PRIVATE = 'C:/Users/1/AppData/Local/OpenGlassHub/mailbox-e9f2a410-6cc1-4197-a5f3-256e9c157302';
export const TARGET = 'https://openglasshub.ogh.workers.dev/login/?next=%2Ffeed%2F';
export const PROVIDER = 'https://challenges.cloudflare.com';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const need = (v, code) => { if (!v) throw Error(code); };
const errorCode = e => /^[A-Z0-9_]+$/.test(e?.message ?? '') ? e.message : 'DIAGNOSTIC_UNCONFIRMED';
function origin(value) {
  try { const v = new URL(value); return v.origin === 'null' ? 'OPAQUE_ORIGIN' : v.origin; }
  catch { return 'UNPARSEABLE'; }
}

export function requestDecision({ url: raw, method, resourceType, frameKind, redirected, target = TARGET, provider = PROVIDER }) {
  const fields = browserOriginDiagnostic(raw, resourceType);
  const deny = phase => ({ ...fields, frameKind, phase, allow: false });
  let url;
  try { url = new URL(raw); } catch { return deny('URL_PARSE'); }
  if (url.username || url.password) return deny('URL_CREDENTIALS');
  if (redirected) return deny('REDIRECT_CONTINUATION');
  if (resourceType === 'document' && frameKind === 'top') {
    return raw === target && method === 'GET' ? { allow: true } : deny('TOP_NAVIGATION');
  }
  if (url.origin === new URL(target).origin) {
    if (resourceType === 'document') return deny('APPLICATION_CHILD_FRAME');
    if (method !== 'GET' && method !== 'HEAD') return deny('APPLICATION_WRITE');
    if (url.pathname.startsWith('/api/')) return deny('APPLICATION_API_OUT_OF_DIAGNOSTIC_SCOPE');
    return { allow: true };
  }
  if (url.origin === provider) {
    if (resourceType === 'document' && frameKind !== 'child') return deny('FRAME_IDENTITY');
    if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(method)) return deny('PROVIDER_METHOD');
    if (!url.pathname.startsWith('/turnstile/') && !url.pathname.startsWith('/cdn-cgi/challenge-platform/')) return deny('PROVIDER_PATH');
    return { allow: true };
  }
  return deny('ORIGIN_MATCH');
}

export function providerConsoleCode(text, source, provider = PROVIDER) {
  if (origin(source) !== provider || typeof text !== 'string' || text.length > 4096) return null;
  return /^\[Cloudflare Turnstile\][\s\S]*?\bError(?:\s+code)?\s*[:=]?\s*(\d{6})\b/i.exec(text)?.[1] ?? null;
}
export function classifyEvidence(events) {
  if (events.some(e => e.layer === 'CONTROLLER')) return 'CONTROLLER_BLOCK_PROVIDER_CAUSALITY_UNPROVEN';
  if (events.some(e => e.layer === 'APPLICATION_CSP' && e.enforced)) return 'APPLICATION_CSP_BLOCK';
  if (events.some(e => e.layer === 'PROVIDER' && /^\d{6}$/.test(e.code))) return 'PROVIDER_ERROR_REPORTED_CAUSE_NOT_INFERRED';
  return 'UNKNOWN';
}

async function observe({ target, provider, observeMilliseconds, headless, localFixture = false }) {
  if (localFixture) {
    for (const url of [target, provider]) need(new URL(url).hostname === '127.0.0.1', 'LOCAL_FIXTURES_ONLY');
  } else need(target === TARGET && provider === PROVIDER && observeMilliseconds === 30000, 'FIXED_LIVE_TARGET');
  const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
  const result = { events: [], attemptedRequests: 0, permittedRequests: 0, navigationAttempts: 0,
    providerConsoleCodes: [], browserClosed: false, formSubmissionsDispatched: 0,
    authRequestsDispatched: 0, sensitiveBodyRetained: false, screenshots: 0, traces: 0 };
  let browser, stopped = false, finish;
  const deadline = Date.now() + 45000;
  async function within(start, cap = 45000) {
    let timer;
    try {
      need(Date.now() < deadline, 'BROWSER_OPERATION_TIMEOUT');
      return await Promise.race([start(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('BROWSER_OPERATION_TIMEOUT')),
          Math.max(1, Math.min(cap, deadline - Date.now())));
      })]);
    } finally { clearTimeout(timer); }
  }
  const terminal = new Promise(resolve => { finish = resolve; });
  const push = event => {
    if (result.events.length >= 64) { result.evidenceTruncated = true; stopped = true; finish(); return; }
    result.events.push({ ...event, utc: new Date().toISOString() });
    if (event.layer === 'CONTROLLER' || event.layer === 'PROVIDER'
      || (event.layer === 'APPLICATION_CSP' && event.enforced)) { stopped = true; finish(); }
  };
  const totalTimer = setTimeout(() => { result.overallTimeout = true; stopped = true; finish(); }, 45000);
  try {
    browser = await within(() => chromium.launch({ channel: 'msedge', headless, timeout: 10000 }), 10000);
    result.browserVersion = browser.version();
    result.sessionClass = 'NEW_EMPTY_CONTEXT_NO_ADMIN_SESSION_COPY';
    const context = await within(() => browser.newContext({ serviceWorkers: 'block' }));
    const page = await within(() => context.newPage());
    need(typeof context.routeWebSocket === 'function', 'WEBSOCKET_GUARD_UNAVAILABLE');
    await within(() => context.routeWebSocket('**/*', socket => {
      push({ layer: 'CONTROLLER', origin: origin(socket.url()), resourceType: 'websocket',
        frameKind: 'unavailable', phase: 'WEBSOCKET_NOT_AUTHORIZED' });
      socket.close({ code: 1008, reason: 'Diagnostic scope' });
    }));
    await within(() => context.exposeBinding('__oghReadonlyCspSignal', (source, value) => {
      const sourceOrigin = origin(source.frame.url());
      const enforced = value?.disposition === 'enforce' && value?.trusted === true;
      const directive = /^(?:[a-z]+-){1,4}[a-z]+$/.test(value?.directive ?? '') ? value.directive : 'UNKNOWN';
      push({ layer: sourceOrigin === new URL(target).origin ? 'APPLICATION_CSP' : 'FRAME_CSP_SIGNAL',
        origin: origin(value?.blockedOrigin), frameOrigin: sourceOrigin,
        frameKind: source.frame === page.mainFrame() ? 'top' : 'child',
        phase: 'BROWSER_CSP_EVENT', directive, enforced, evidence: 'DOM_EVENT_TRUST_FLAG_NOT_PROVIDER_CONFIGURATION_PROOF' });
    }));
    await within(() => context.addInitScript(() => {
      const normalize = v => { try { return new URL(v).origin; } catch { return 'UNPARSEABLE'; } };
      document.addEventListener('securitypolicyviolation', e => {
        void window.__oghReadonlyCspSignal({ blockedOrigin: normalize(e.blockedURI),
          directive: e.effectiveDirective, disposition: e.disposition, trusted: e.isTrusted });
      });
      if (window === window.top) document.addEventListener('submit', e => {
        e.preventDefault(); e.stopImmediatePropagation();
      }, true);
    }));
    await within(() => context.route('**/*', async route => {
      if (stopped || Date.now() >= deadline) { stopped = true; await route.abort(); return; }
      const req = route.request();
      let frameKind = 'unavailable';
      try { frameKind = req.frame() === page.mainFrame() ? 'top' : 'child'; } catch {}
      if (req.resourceType() === 'document' && frameKind === 'top') {
        result.topDocumentRequestsObserved = (result.topDocumentRequestsObserved ?? 0) + 1;
        if (result.topDocumentRequestsObserved > 1) {
          push({ layer: 'CONTROLLER', phase: 'TOP_NAVIGATION_BUDGET', origin: origin(req.url()),
            frameKind, resourceType: 'document' });
          await route.abort(); return;
        }
      }
      result.attemptedRequests++;
      if (result.attemptedRequests > 100) {
        push({ layer: 'CONTROLLER', phase: 'REQUEST_BUDGET', origin: 'NOT_RETAINED', frameKind });
        await route.abort(); return;
      }
      const decision = requestDecision({ url: req.url(), method: req.method(),
        resourceType: req.resourceType(), frameKind, redirected: !!req.redirectedFrom(), target, provider });
      if (!decision.allow) {
        let frameOrigin = 'UNAVAILABLE', parentOrigin = 'UNAVAILABLE';
        try { frameOrigin = origin(req.frame().url()); parentOrigin = origin(req.frame().parentFrame()?.url()); } catch {}
        push({ ...decision, layer: 'CONTROLLER', frameOrigin, parentOrigin });
        await route.abort(); return;
      }
      result.permittedRequests++;
      await route.continue();
    }));
    page.on('console', message => {
      const code = providerConsoleCode(message.text(), message.location().url, provider);
      if (code) { result.providerConsoleCodes.push(code); push({ layer: 'PROVIDER', origin: provider,
        phase: 'PROVIDER_CONSOLE_CODE', code, resourceType: 'script' }); }
    });
    page.on('response', response => {
      const req = response.request();
      if (req.resourceType() !== 'document') return;
      let frameKind = 'unavailable';
      try { frameKind = req.frame() === page.mainFrame() ? 'top' : 'child'; } catch {}
      if (response.url() === target) result.targetStatus = response.status();
      push({ layer: 'HTTP_STATUS', origin: origin(response.url()), status: response.status(),
        frameKind, resourceType: 'document', phase: 'RESPONSE_METADATA_NO_BODY' });
    });
    page.on('requestfailed', req => {
      const raw = req.failure()?.errorText ?? '';
      const match = /\bERR_[A-Z_]+\b/.exec(raw)?.[0];
      if (!match) return;
      push({ layer: match === 'ERR_BLOCKED_BY_CSP' ? 'CSP_NETWORK_SIGNAL' : 'NETWORK_SIGNAL',
        origin: origin(req.url()), resourceType: req.resourceType(), phase: 'REQUEST_FAILED', code: match });
    });
    result.navigationAttempts++;
    try {
      const response = await within(() => page.goto(target, { waitUntil: 'domcontentloaded', timeout: 10000 }), 10000);
      result.targetStatus = response?.status() ?? null;
      if (result.targetStatus !== 200) {
        result.targetStatusMismatch = true; stopped = true; finish();
      }
    } catch { result.navigationCompletion = 'UNCONFIRMED_OR_CONTROLLER_ABORTED'; }
    if (!stopped) {
      let observationTimer;
      try { await Promise.race([terminal, new Promise(resolve => { observationTimer = setTimeout(resolve, observeMilliseconds); })]); }
      finally { clearTimeout(observationTimer); }
    }
    if (!page.isClosed() && Date.now() < deadline) {
      result.ui = await within(() => page.evaluate(() => ({
        verificationUnavailable: /Verification unavailable|验证暂不可用/.test(document.querySelector('.auth-turnstile')?.textContent ?? ''),
        turnstileIframePresent: !!document.querySelector('iframe[src^="https://challenges.cloudflare.com/"]'),
        emailInputEmpty: document.querySelector('input[type=email]')?.value === '',
        passwordInputEmpty: document.querySelector('input[type=password]')?.value === '',
      })), 1000).catch(() => ({ observation: 'UNKNOWN' }));
    }
    result.finalTargetCorrect = page.url() === target;
  } catch (e) { result.failure = errorCode(e); }
  finally {
    stopped = true; clearTimeout(totalTimer);
    if (browser) {
      let closeTimer;
      try {
        await Promise.race([browser.close(), new Promise((_, reject) => {
          closeTimer = setTimeout(() => reject(Error('BROWSER_CLOSE_UNCONFIRMED')), 5000);
        })]); result.browserClosed = true;
      } catch (e) { result.browserClose = 'UNKNOWN'; result.browserCloseFailure = errorCode(e); }
      finally { clearTimeout(closeTimer); }
    }
  }
  result.classification = classifyEvidence(result.events);
  result.rootCause = result.classification === 'CONTROLLER_BLOCK_PROVIDER_CAUSALITY_UNPROVEN'
    ? 'EXACT_CONTROLLER_DENIAL_CAPTURED_NOT_PROOF_OF_WIDGET_ROOT_CAUSE' : 'UNKNOWN_UNLESS_BOUND_EVENT_PROVES_SPECIFIC_LAYER';
  result.overallResult = 'BLOCKED_DIAGNOSTIC_ONLY_NO_AUTH_OR_CORE_PASS';
  return result;
}

export function observeLocalFixture({ target, provider, observeMilliseconds }) {
  return observe({ target, provider, observeMilliseconds, headless: false, localFixture: true });
}

async function main() {
  const bytes = fs.readFileSync(PRIVATE + '/CAPTCHA_ORIGIN_DIAG.v1.NOT_AUTHORIZED.json');
  const binding = sha(bytes), p = JSON.parse(bytes);
  need(process.argv[2] === '--approved-exact' && process.argv[3] === binding, 'NEW_EXACT_APPROVAL_REQUIRED');
  const owner = JSON.parse(fs.readFileSync(p.ownerReceiptPath));
  need(owner.binding === binding && owner.actualOwnerMessageVerified === true
    && Object.entries(p.ownerApprovalTemplate).every(([k, v]) => owner.approvalFields?.[k] === v), 'ACTUAL_OWNER_APPROVAL');
  const start = Date.parse(owner.verifiedUTC), now = Date.now();
  need(Number.isFinite(start) && now >= start && now <= start + 5 * 60000
    && start + 15 * 60000 - now >= 65000, 'FRESH_SINGLE_USE_WINDOW');
  need(p.target === TARGET && p.providerOrigin === PROVIDER && p.maximumTopNavigations === 1
    && p.maximumAttemptedRequests === 100 && p.observationSeconds === 30, 'FROZEN_DIAGNOSTIC_SCOPE');
  for (const pin of p.sourcePins) need(sha(fs.readFileSync(pin.path)) === pin.sha256, 'SOURCE_IDENTITY');
  need(sha(fs.readFileSync(p.historicalExecutionReceipt.path)) === p.historicalExecutionReceipt.sha256, 'HISTORICAL_EVIDENCE_IDENTITY');
  need(!fs.existsSync(p.privateDirectory), 'DIAGNOSTIC_ALREADY_USED');
  const helper = await import(pathToFileURL(p.securityHelper.path));
  need(helper.protectedOperation('Initialize', p.privateNamespace, { directory: p.privateDirectory }) === 'PRIVATE_EVIDENCE_READY', 'PRIVATE_SINK');
  const save = (name, data) => {
    const b = Buffer.from(JSON.stringify(data, null, 2) + '\n');
    need(b.length <= 32768, 'PRIVATE_EVIDENCE_SIZE');
    const f = path.join(p.privateDirectory, name), fd = fs.openSync(f, 'wx');
    try { fs.writeFileSync(fd, b); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    need(fs.readFileSync(f).equals(b), 'PRIVATE_READBACK');
    return sha(b);
  };
  save('diagnostic.used', { binding, utc: new Date().toISOString(), navigationCap: 1, retries: 0 });
  const result = await observe({ target: TARGET, provider: PROVIDER, observeMilliseconds: 30000, headless: false });
  const receipt = { binding, utc: new Date().toISOString(), ...result,
    accountCreations: 0, passwordLogins: 0, productionDatabaseConnections: 0,
    businessWrites: 0, deployments: 0, retries: 0, catalogHold: 'ACTIVE', publicBetaGo: 'NOT_AUTHORIZED' };
  const digest = save('CAPTCHA_ORIGIN_DIAG_EXECUTION.private.json', receipt);
  console.log(JSON.stringify({ status: result.overallResult, classification: result.classification,
    resultPath: path.join(p.privateDirectory, 'CAPTCHA_ORIGIN_DIAG_EXECUTION.private.json'),
    sha256: digest, navigationAttempts: result.navigationAttempts, browserClosed: result.browserClosed,
    sensitiveFieldsReturned: false, accountCreations: 0, passwordLogins: 0, businessWrites: 0 }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.log(JSON.stringify({ status: 'BLOCKED', reason: errorCode(e), automaticRetries: 0 })); process.exitCode = 1; });
}
