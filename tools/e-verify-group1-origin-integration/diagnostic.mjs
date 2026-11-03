import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { classifyObserved } from '../e-verify-group1-manual-auth/monitor.mjs';

// Evidence only: no route/transport capability and no change to consumed runners.
export class OriginDiagnostic {
  #key = randomBytes(32); #sequence = 0; #requests = new WeakMap(); #captures = new Map(); #cdp = new Map(); #frames = new WeakMap(); #frameSequence = 0;
  #app; #db; #static; #publicRoutes; #sourceOrigins; #capture; #closed = false;
  constructor({ appOrigin, supabaseOrigin, staticPaths = [], sourceOrigins = {}, captureOrigin } = {}) {
    this.#app = new URL(appOrigin).origin; this.#db = new URL(supabaseOrigin).origin; this.#static = [...staticPaths];
    this.#publicRoutes = new Map(staticPaths.map(p => [this.#app + p, 'VERIFIED_ASSET_' + this.#digest(p).slice(0, 12)]));
    this.#publicRoutes.set(this.#app + '/login/', 'APP_LOGIN_DOCUMENT');
    this.#publicRoutes.set('https://challenges.cloudflare.com/turnstile/v0/api.js', 'OFFICIAL_TURNSTILE_SDK');
    this.#sourceOrigins = new Map(Object.entries(sourceOrigins).filter(([o, id]) => new URL(o).origin === o && /^[A-Z0-9_]{1,48}$/.test(id)));
    this.#capture = captureOrigin;
  }
  #digest(text) { return createHmac('sha256', this.#key).update(text).digest('hex'); }
  #active() { if (this.#closed || this.#sequence >= 1024) throw Error('DIAGNOSTIC_EVIDENCE_LIMIT'); }
  #origin(origin) { return origin === this.#app ? 'APPLICATION' : origin === this.#db ? 'SUPABASE'
    : origin === 'https://challenges.cloudflare.com' ? 'TURNSTILE' : 'OTHER_ORIGIN'; }
  #urlKey(method, url) { return this.#digest(method + '\0' + url); }
  #frameId(frame) {
    if (!this.#frames.has(frame)) this.#frames.set(frame, this.#digest('frame:' + ++this.#frameSequence).slice(0, 24));
    return this.#frames.get(frame);
  }
  #publicScript(value) {
    try { const u = new URL(value); if (u.username || u.password || u.hash) return null;
      return this.#publicRoutes.get(u.origin + u.pathname) ?? null; } catch { return null; }
  }
  observeCdp(event) {
    this.#active(); const q = event?.request; if (!q || typeof q.url !== 'string' || typeof q.method !== 'string') return;
    if (q.url.length > 8192 || q.method.length > 16) throw Error('DIAGNOSTIC_ENVELOPE_LIMIT');
    const key = this.#urlKey(q.method, q.url), stack = event.initiator?.stack?.callFrames ?? [];
    const kind = ['script', 'parser', 'preload', 'preflight', 'other', 'signedExchange'].includes(event.initiator?.type) ? event.initiator.type : 'unknown';
    const row = { cdpEventId: this.#digest(String(event.requestId)).slice(0, 24), initiatorType: kind,
      publicInitiatorId: stack.slice(0, 8).map(f => this.#publicScript(f.url)).find(Boolean) ?? null,
      redirectResponseObserved: !!event.redirectResponse,
      cdpFrameId: typeof event.frameId === 'string' ? this.#digest('cdp-frame:' + event.frameId).slice(0, 24) : null };
    if (!this.#cdp.has(key) && this.#cdp.size >= 1024) throw Error('DIAGNOSTIC_EVIDENCE_LIMIT');
    const list = this.#cdp.get(key) ?? []; if (list.length >= 4) list.shift();
    list.push(row); this.#cdp.set(key, list);
  }
  async observe(q, { page, actor, stage } = {}) {
    this.#active(); const negative = ['NEGATIVE_CAPTCHA', 'NEGATIVE_MISSING_CAPTCHA', 'NEGATIVE_PASSWORD'].includes(stage);
    if (!['A', 'B', 'ADMIN'].includes(actor) || !(negative && actor === 'A' ||
      ['LOGIN', 'LANDING', 'PAGE_CATALOG', 'PAGE_PRODUCT_DETAIL', 'PAGE_ADMIN', 'LOGOUT'].some(prefix => stage === prefix + '_' + actor))) throw Error('DIAGNOSTIC_ACTOR_STAGE');
    let u, method, type;
    try { const raw = q.url(); method = q.method(); type = q.resourceType();
      if (typeof raw !== 'string' || raw.length > 8192 || typeof method !== 'string' || method.length > 16) throw Error('INVALID');
      u = new URL(raw);
    } catch { throw Error('DIAGNOSTIC_REQUEST_ENVELOPE_INVALID'); }
    const sequence = ++this.#sequence, matchId = this.#urlKey(method, u.href), eventId = this.#digest(String(sequence) + '\0' + matchId).slice(0, 24);
    this.#requests.set(q, eventId);
    let frameClass = 'FRAME_UNAVAILABLE', frameOriginClass = 'UNKNOWN', frameId = null, parentFrameId = null;
    try { const frame = q.frame(); frameId = this.#frameId(frame); const parentFrame = frame.parentFrame?.(); if (parentFrame) parentFrameId = this.#frameId(parentFrame);
      const frameUrl = new URL(frame.url()); frameOriginClass = this.#origin(frameUrl.origin);
      frameClass = frameOriginClass === 'APPLICATION' ? frame === page.mainFrame() ? 'APPLICATION_MAIN_FRAME' : 'APPLICATION_CHILD_FRAME'
        : frameOriginClass === 'TURNSTILE' ? 'TURNSTILE_FRAME' : 'UNAPPROVED_FRAME'; } catch { /* Worker/no-frame is explicit, not inferred from a missing caller field. */ }
    let ruleMatched = false, ruleKind = null, rejectionReason = 'OBSERVED_UNAPPROVED_REQUEST';
    try { const rule = classifyObserved({ url: u.href, method, type, appOrigin: this.#app, supabaseOrigin: this.#db, staticPaths: this.#static });
      ruleMatched = true; ruleKind = rule.kind; rejectionReason = null; } catch (error) {
      if (/^[A-Z0-9_]{1,64}$/.test(error.message)) rejectionReason = error.message;
    }
    let parent = null, redirectRelation = 'UNAVAILABLE';
    try { parent = q.redirectedFrom(); redirectRelation = parent ? 'REDIRECT_CHAIN' : 'NO_REDIRECT_PARENT'; } catch {}
    const invalidOriginReason = u.origin === 'null' ? 'OPAQUE_ORIGIN' : !['https:', 'http:'].includes(u.protocol) ? 'UNSUPPORTED_SCHEME' : (u.username || u.password) ? 'USERINFO_PRESENT' : u.protocol !== 'https:' ? 'NON_HTTPS_SCHEME' : null;
    let originEvidence = { status: 'NOT_NEEDED', evidenceRef: null };
    const originClass = this.#origin(u.origin);
    const sourceHostId = this.#sourceOrigins.get(u.origin) ?? null;
    if (originClass === 'OTHER_ORIGIN') {
      const labels = u.hostname.split('.');
      const safe = u.protocol === 'https:' && !u.username && !u.password && !isIP(u.hostname.replace(/^\[|\]$/g, ''))
        && /^[a-z0-9.-]+$/.test(u.hostname) && labels.length >= 2 && !u.hostname.endsWith('.local')
        && !labels.some(s => !s || s.length > 48 || /(?:[a-f0-9]{24,}|[a-f0-9]{8}-[a-f0-9-]{27})/i.test(s));
      if (!safe) originEvidence.status = 'PRIVACY_BLOCKED';
      else if (!this.#capture) originEvidence.status = 'PROTECTED_CAPTURE_UNAVAILABLE';
      else {
        if (!this.#captures.has(u.origin)) this.#captures.set(u.origin, Promise.resolve().then(async () => {
          // Structured origin components only; no path, query, fragment, headers or body.
          const ref = await this.#capture({ scheme: u.protocol, host: u.hostname, port: u.port || '443' });
          if (typeof ref !== 'string' || !/^origin-[a-f0-9]{32}$/.test(ref)) throw Error('PROTECTED_ORIGIN_REFERENCE_INVALID');
          return ref;
        }));
        try { originEvidence = { status: 'PRIVATE_ORIGIN_CAPTURE_ACKNOWLEDGED', evidenceRef: await this.#captures.get(u.origin) }; }
        catch { originEvidence = { status: 'PROTECTED_CAPTURE_FAILED', evidenceRef: null }; }
      }
    }
    const cdp = this.#cdp.get(matchId) ?? [];
    return { eventId, sequence, requestMatchId: matchId, actor, stage,
      method: ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'].includes(method) ? method : 'OTHER',
      resourceType: /^[a-z]{1,20}$/.test(type) ? type : 'OTHER', protocolClass: u.protocol === 'https:' ? 'HTTPS' : 'OTHER',
      originClass, invalidOriginReason, sourceHostId, sourceHostIdDoesNotAuthorizeTraffic: true, originEvidence,
      captureProtection: 'REQUIRES_SEPARATELY_BOUND_PROTECTED_ADAPTER',
      ruleMatched, ruleKind, rejectionReason, frameClass, frameOriginClass, frameId, parentFrameId,
      publicResourceId: this.#publicScript(u.href), publicPathname: this.#static.includes(u.pathname) && u.origin === this.#app && !u.search && !u.hash ? u.pathname : null,
      queryPresent: !!u.search, fragmentPresent: !!u.hash, credentialEnvelopePresent: !!(u.username || u.password),
      redirectRelation, redirectParentEventId: parent ? this.#requests.get(parent) ?? null : null,
      cdpCorrelation: cdp.length === 1 ? 'SINGLE_CANDIDATE_NOT_PROVEN' : cdp.length > 1 ? 'AMBIGUOUS_CANDIDATES' : 'UNAVAILABLE',
      cdpCandidates: cdp.map(x => ({ ...x })), networkBoundary: 'MONITOR_ONLY', dispatchStatus: 'UNKNOWN_OR_ALREADY_SENT' };
  }
  refreshCdp(row) {
    const candidates = this.#cdp.get(row.requestMatchId) ?? [];
    return { ...row, cdpCorrelation: candidates.length === 1 ? 'SINGLE_CANDIDATE_NOT_PROVEN' : candidates.length > 1 ? 'AMBIGUOUS_CANDIDATES' : 'UNAVAILABLE', cdpCandidates: candidates.map(x => ({ ...x })) };
  }
  dispose() { this.#closed = true; this.#key.fill(0); this.#captures.clear(); this.#cdp.clear(); this.#requests = new WeakMap(); this.#frames = new WeakMap(); }
}
