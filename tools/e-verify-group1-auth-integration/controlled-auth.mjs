import { Group1Gate, validateResponse } from '../e-verify-group1-v9-closure/gate.mjs';

// A fixed HTTP outlet, not a security boundary for the entire native browser.
export class ControlledAuth {
  #gate; #actor; #context; #app; #db; #key; #transport; #reader;
  #stage = null; #closed = false; #calls = 0; #abort = new AbortController();
  constructor({ caps, actor, binding, contextIdentity, appOrigin, supabaseOrigin, publicKey, budget, transport, reader, workMs }) {
    if (!contextIdentity || typeof transport !== 'function' || !reader || typeof publicKey !== 'string') throw Error('AUTH_CAPABILITY_INVALID');
    let role;
    try { role = publicKey.startsWith('sb_publishable_') ? 'anon' : JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url')).role; }
    catch { throw Error('PUBLIC_KEY_INVALID'); }
    if (role !== 'anon') throw Error('PRIVILEGED_KEY_FORBIDDEN');
    this.#gate = new Group1Gate({ caps, actor, binding, appOrigin, supabaseOrigin, budget, workMs });
    this.#actor = actor; this.#context = contextIdentity; this.#app = appOrigin; this.#db = supabaseOrigin;
    this.#key = publicKey; this.#transport = transport; this.#reader = reader;
  }
  armLogin(kind) {
    if (this.#closed || this.#stage || kind !== 'success' && this.#actor !== 'A') throw Error('AUTH_STAGE_INVALID');
    this.#gate.permitLogin(kind); this.#stage = 'LOGIN_' + this.#actor;
  }
  armLogout() { this.#gate.permitLogout(); this.#stage = 'LOGOUT_' + this.#actor; }
  async dispatch(request, meta) {
    let ticket, response;
    try {
      if (this.#closed || meta?.contextIdentity !== this.#context || meta.actor !== this.#actor || meta.mainFrame !== true
        || !['fetch', 'xhr'].includes(meta.resourceType) || meta.redirected || meta.stage !== this.#stage || !this.#stage) throw Error('AUTH_SOURCE_OR_STAGE_INVALID');
      const u = new URL(request.url), headers = Object.fromEntries(Object.entries(request.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      if (u.origin !== this.#db || u.hash || u.username || u.password || headers.origin !== this.#app || headers.cookie
        || headers.apikey !== this.#key) throw Error('AUTH_ORIGIN_OR_KEY_INVALID');
      const path = u.pathname + u.search;
      if (!['/auth/v1/token?grant_type=password', '/auth/v1/token?grant_type=refresh_token', '/auth/v1/logout', '/auth/v1/logout?scope=global'].includes(path)
        || request.method !== 'POST') throw Error('AUTH_ROUTE_OR_METHOD_INVALID');
      if (path.includes('grant_type=password') && !this.#stage.startsWith('LOGIN_')
        || path.includes('grant_type=refresh_token') && this.#stage !== 'SESSION_' + this.#actor
        || path.startsWith('/auth/v1/logout') && this.#stage !== 'LOGOUT_' + this.#actor) throw Error('AUTH_STAGE_INVALID');
      // Framing headers are derived by the bounded transport, never caller-owned.
      for (const key of ['host', 'content-length', 'connection', 'accept-encoding']) delete headers[key];
      ticket = this.#gate.reserve({ ...request, actor: this.#actor, headers });
      this.#calls++;
      response = await this.#transport({ ...request, actor: this.#actor, headers }, { signal: this.#abort.signal, timeoutMs: 15000, maxBytes: ticket.maxBytes });
      this.#gate.assertActive(); validateResponse(ticket, response);
      const h = Object.fromEntries(Object.entries(response.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      if (![this.#app, '*'].includes(h['access-control-allow-origin'])) throw Error('AUTH_CORS_RESPONSE_INVALID');
      if (ticket.kind === 'logout') {
        this.#gate.acceptLogout(ticket, response); this.#reader.dispose(); this.#stage = null;
      } else if (ticket.loginKind && ticket.loginKind !== 'success') {
        this.#gate.acceptNegative(ticket, response); this.#stage = null;
      } else {
        if (!/^application\/json(?:;|$)/i.test(h['content-type'] || '')) throw Error('AUTH_RESPONSE_TYPE_INVALID');
        const data = JSON.parse(response.body.toString('utf8'));
        this.#reader.capture({ contextIdentity: this.#context, actor: this.#actor, origin: this.#db, data, refresh: ticket.kind === 'refresh' });
        this.#gate.acceptSession(ticket, data); this.#stage = 'SESSION_' + this.#actor;
      }
      // Private response is delivered only to the fixed browser route, never receipt/IPC.
      return response;
    } catch {
      response?.body?.fill(0); this.close(); throw Error(ticket ? 'AUTH_DISPATCH_OR_RESULT_FAILED' : 'AUTH_PRE_DISPATCH_REJECTED');
    } finally { if (ticket) this.#gate.complete(ticket); }
  }
  receipt() { return { actor: this.#actor, stage: this.#stage, closed: this.#closed, dispatches: this.#calls,
    gate: this.#gate.receipt(), outletBoundary: 'HARD_FIXED_HTTP_ONLY', wholeBrowserBoundary: 'NOT_PROVEN', privateValuesLogged: false }; }
  close() { this.#closed = true; this.#abort.abort(); this.#gate.dispose(); this.#reader.dispose(); this.#context = null; this.#key = null; this.#stage = null; }
}

// Candidate interceptor only. It must not be treated as bypass-proof until actual-path tests pass.
export async function attachAuthRoutes({ context, page, auth, supabaseOrigin, onStop }) {
  let closing = false;
  const matcher = url => {
    try { return url.origin === supabaseOrigin; } catch { return false; }
  };
  const handler = async route => {
    let response;
    try {
      const q = route.request();
      response = await auth.dispatch({ url: q.url(), method: q.method(), headers: await q.allHeaders(), body: q.postDataBuffer() || Buffer.alloc(0) },
        { contextIdentity: context, actor: auth.receipt().actor, mainFrame: q.frame() === page.mainFrame(), resourceType: q.resourceType(),
          redirected: !!q.redirectedFrom(), stage: auth.receipt().stage });
      await route.fulfill({ status: response.status, headers: response.headers, body: response.body });
    } catch { auth.close(); if (!closing) onStop('AUTH_ROUTE_REJECTED'); await route.abort().catch(() => {}); }
    finally { response?.body?.fill(0); }
  };
  await context.route(matcher, handler);
  const socketMatcher = url => {
    try { return url.hostname === new URL(supabaseOrigin).hostname; } catch { return false; }
  };
  await context.routeWebSocket(socketMatcher, socket => { auth.close(); onStop('AUTH_WEBSOCKET_FORBIDDEN'); socket.close(); });
  return { async close() { closing = true; auth.close(); await context.unroute(matcher, handler); } };
}
