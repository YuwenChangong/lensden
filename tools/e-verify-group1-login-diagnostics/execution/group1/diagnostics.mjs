import {createHash, randomBytes} from 'node:crypto';

const stages = new Set(['LOGIN_A', 'LOGIN_B', 'LOGIN_ADMIN', 'NEGATIVE_CAPTCHA', 'NEGATIVE_MISSING_CAPTCHA', 'NEGATIVE_PASSWORD', 'FINISHED']);
const sources = new Set(['BROWSER_NAVIGATION', 'BROWSER_RESOURCE', 'BROWSER_FETCH', 'CONTROLLED_NODE_READ']);
const resources = new Set(['document', 'script', 'stylesheet', 'fetch', 'xhr', 'image', 'media', 'font', 'other']);
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const publicPages = new Set(['/login/', '/', '/products/', '/products/xreal/xreal-air/', '/settings/', '/admin/devices/']);
const appReads = new Set(['/api/users/me/summary', '/api/users/me/preferences', '/api/users/me/notifications', '/api/admin/devices', '/api/admin/forum/me']);
const authRoutes = new Set(['/auth/v1/token', '/auth/v1/user', '/auth/v1/logout']);
const dataRoutes = new Set(['/rest/v1/profiles', '/rest/v1/devices', '/rest/v1/public_device_detail_specs', '/rest/v1/public_device_detail_sources', '/rest/v1/public_device_detail_evidence', '/rest/v1/catalog_audit_events']);
const safeCodes = new Set(['UNAPPROVED_REQUEST', 'REDIRECT_FORBIDDEN', 'POPUP_OR_FRAME_FORBIDDEN', 'NAVIGATION_NOT_ARMED', 'REQUEST_REPLAY', 'ACTOR_CROSS_USE', 'BUDGET_EXCEEDED', 'BUDGET_STOPPED', 'WORK_DEADLINE', 'COOKIE_SCOPE', 'LOGIN_NOT_ARMED', 'LOGIN_IDENTITY', 'CAPTCHA_REQUIRED', 'REFRESH_SESSION_INVALID', 'SESSION_CROSS_USE', 'IDENTITY_NOT_VERIFIED', 'REQUEST_ENVELOPE_INVALID', 'GET_BODY_FORBIDDEN', 'URL_INVALID', 'DIAGNOSTIC_METHOD_FORBIDDEN', 'DIAGNOSTIC_STAGE_FORBIDDEN', 'DIAGNOSTIC_ROUTE_FORBIDDEN', 'RESPONSE_COOKIE', 'REDIRECT_OR_LOCATION', 'RESPONSE_BOUND', 'UNEXPECTED_STATUS', 'STATIC_SOURCE_MISMATCH', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'REQUEST_FAILURE', 'BROWSER_REQUEST_FAILURE']);
const codeOf = error => safeCodes.has(error?.message) ? error.message : 'REQUEST_FAILURE';

export class DiagnosticJournal {
  #options; #events = []; #firstRejection = null; #firstFailure = null; #next = 0;
  #seen = new Set(); #salt = randomBytes(16); #attempts = 0; #completed = 0; #active = new Map(); #capped = false; #admissions = 0;
  constructor(options) { this.#options = {...options, staticPaths: new Set(options.staticPaths || [])}; }
  #describe(request, meta = {}) {
    let url;
    try { url = new URL(request.url); } catch {}
    const {appOrigin, supabaseOrigin, staticPaths} = this.#options;
    const origin = url?.origin === appOrigin ? 'APPLICATION' : url?.origin === supabaseOrigin ? 'SUPABASE' : url?.origin === 'https://challenges.cloudflare.com' ? 'TURNSTILE' : 'UNAPPROVED';
    let route = '/:unbound', rule = 'NO_BOUND_RULE', expectedMethod = 'GET', budget = ['allBrowserHttpDispatchesMax'];
    if (url && origin === 'APPLICATION') {
      if (staticPaths.has(url.pathname)) { route = url.pathname; rule = 'FROZEN_STATIC_GET'; }
      else if (publicPages.has(url.pathname)) { route = url.pathname; rule = 'FROZEN_PAGE_GET'; }
      else if (appReads.has(url.pathname)) { route = url.pathname; rule = 'FROZEN_OWN_OR_ADMIN_GET'; }
    } else if (url && origin === 'SUPABASE') {
      if (authRoutes.has(url.pathname)) { route = url.pathname; rule = 'EXACT_AUTH_CAPABILITY'; expectedMethod = url.pathname === '/auth/v1/user' ? 'GET' : 'POST'; budget.push('supabaseAuthDispatchesMax'); }
      else if (dataRoutes.has(url.pathname)) { route = url.pathname; rule = 'EXACT_PRIVATE_OR_CATALOG_GET'; budget.push('supabaseRestReadDispatchesMax'); }
    } else if (url && origin === 'TURNSTILE') {
      if (url.pathname === '/turnstile/v0/api.js') { route = url.pathname; rule = 'TURNSTILE_SCRIPT_GET'; }
      else if (url.pathname.startsWith('/cdn-cgi/challenge-platform/')) { route = '/cdn-cgi/challenge-platform/:opaque'; rule = 'FROZEN_CHALLENGE_CAPABILITY'; expectedMethod = 'GET_OR_POST'; }
      budget.push('turnstileHttpDispatchesMax');
    }
    // Only pre-reviewed route literals and origins leave memory. Dynamic IDs and
    // every query value, request body, header and unknown host/path are omitted.
    const diagnostic = {
      stage: stages.has(meta.stage) ? meta.stage : 'UNKNOWN',
      actor: ['A', 'B', 'ADMIN', 'anon'].includes(request.actor ?? this.#options.actor) ? request.actor ?? this.#options.actor : 'UNKNOWN',
      requestSource: sources.has(meta.source) ? meta.source : 'UNKNOWN',
      host: origin === 'UNAPPROVED' ? 'UNAPPROVED_HOST_REDACTED' : url.hostname,
      originClass: origin,
      method: methods.has(request.method || 'GET') ? request.method || 'GET' : 'UNKNOWN',
      normalizedRoute: route,
      queryPresent: Boolean(url?.search),
      queryPairCount: Math.min(32, [...(url?.searchParams || [])].length),
      resourceType: resources.has(meta.resourceType) ? meta.resourceType : 'other',
      admissionRuleId: rule,
      rejectionCategory: null,
      budgetCategory: budget,
      redirectRelation: meta.redirected === true ? 'REDIRECT_CHAIN' : 'NONE_OBSERVED',
      retryRelation: 'NONE_OBSERVED',
      networkDispatchOccurred: false,
      transportState: 'NOT_INVOKED',
    };
    return {diagnostic, origin, route, rule, expectedMethod, url};
  }
  #begin(request, meta) {
    const description = this.#describe(request, meta);
    const fingerprint = createHash('sha256').update(this.#salt).update(JSON.stringify([request.method, request.url, meta?.stage])).digest('hex');
    description.diagnostic.retryRelation = this.#seen.has(fingerprint) ? 'REPEATED_REQUEST' : 'NONE_OBSERVED';
    this.#seen.add(fingerprint);
    if (this.#seen.size > 500) this.#seen.clear();
    description.diagnostic.sequence = ++this.#next;
    if (this.#events.length < 32) this.#events.push(description.diagnostic); else this.#capped = true;
    return description;
  }
  #reject(gate, request, description, error) {
    const d = description.diagnostic, code = codeOf(error);
    let category = 'REQUEST_BINDING_MISMATCH';
    if (['BUDGET_EXCEEDED', 'BUDGET_STOPPED'].includes(code)) category = 'BUDGET_EXCEEDED';
    else if (code === 'DIAGNOSTIC_METHOD_FORBIDDEN') category = 'UNAPPROVED_METHOD';
    else if (['DIAGNOSTIC_STAGE_FORBIDDEN', 'NAVIGATION_NOT_ARMED', 'LOGIN_NOT_ARMED'].includes(code)) category = 'UNAPPROVED_STAGE';
    else if (request.actor !== undefined && ![this.#options.actor, 'anon'].includes(request.actor) || code === 'ACTOR_CROSS_USE') category = 'UNAPPROVED_ACTOR';
    else if (description.origin === 'UNAPPROVED') category = 'UNAPPROVED_ORIGIN';
    else if (description.rule === 'NO_BOUND_RULE' || code === 'DIAGNOSTIC_ROUTE_FORBIDDEN') category = 'UNAPPROVED_ROUTE';
    else if (description.expectedMethod !== 'GET_OR_POST' && d.method !== description.expectedMethod) category = 'UNAPPROVED_METHOD';
    d.rejectionCategory = category;
    d.errorCode = code;
    this.#firstRejection ??= d;
    this.#firstFailure ??= d;
    gate.stop(code);
    throw error;
  }
  reserve(gate, request, meta) {
    const description = this.#begin(request, meta);
    if (this.#options.readOnlyLoginDiagnostic) {
      const {url, origin, rule} = description;
      const error = request.method !== 'GET' ? 'DIAGNOSTIC_METHOD_FORBIDDEN'
        : meta.stage !== 'LOGIN_A' || this.#options.actor !== 'A' ? 'DIAGNOSTIC_STAGE_FORBIDDEN'
        : !(origin === 'APPLICATION' && (url.pathname === '/login/' || rule === 'FROZEN_STATIC_GET') || origin === 'TURNSTILE') ? 'DIAGNOSTIC_ROUTE_FORBIDDEN' : null;
      if (error) return this.#reject(gate, request, description, new Error(error));
      if (this.#admissions >= 8) return this.#reject(gate, request, description, new Error('BUDGET_EXCEEDED'));
    }
    try { const ticket = gate.reserve(request); this.#admissions++; return {ticket, sequence: description.diagnostic.sequence}; }
    catch (error) { return this.#reject(gate, request, description, error); }
  }
  rejectBrowser(gate, request, meta, code) {
    return this.#reject(gate, request, this.#begin(request, meta), new Error(code));
  }
  dispatchStarted(sequence) {
    const d = this.#events.find(e => e.sequence === sequence);
    this.#attempts++;
    if (d) { d.networkDispatchOccurred = true; d.transportState = 'TRANSPORT_INVOKED_NOT_SOCKET_PROOF'; this.#active.set(sequence, d); }
  }
  completed(sequence, status) {
    this.#completed++;
    const d = this.#active.get(sequence);
    if (d) { d.transportState = 'RESPONSE_COMPLETED'; d.httpStatus = Number.isSafeInteger(status) ? status : null; }
    this.#active.delete(sequence);
  }
  failed(sequence, code) {
    const d = this.#active.get(sequence) || this.#events.find(e => e.sequence === sequence);
    if (d) { d.transportState = d.transportState === 'RESPONSE_COMPLETED' ? 'RESPONSE_REJECTED' : 'TRANSPORT_OR_RESPONSE_FAILED'; d.errorCode = codeOf({message: code}); this.#firstFailure ??= d; }
    this.#active.delete(sequence);
  }
  receipt() {
    return structuredClone({format: 'group1-redacted-request-journal-v1', firstRejection: this.#firstRejection,
      firstFailure: this.#firstFailure, dispatchAttempts: this.#attempts, completedResponses: this.#completed,
      events: this.#events, eventsCapped: this.#capped, privateValuesRecorded: false});
  }
}
