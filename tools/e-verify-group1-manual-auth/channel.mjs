import { MemorySessionReader } from '../e-verify-group1-standard-hybrid/session-reader.mjs';
import { validateResponse } from '../e-verify-group1-v9-closure/gate.mjs';

export class PrivateChannel {
  #reader; #actor; #binding; #context; #db; #app; #key; #budget; #wire; #until;
  #token; #expiry = 0; #closed = false; #seen = new Set(); #abort = new AbortController();
  #epoch = 0; #identityInvalidated = false;
  constructor({ actor, binding, contextIdentity, supabaseOrigin, appOrigin, budget, transport, validUntil }) {
    this.#actor = actor; this.#binding = structuredClone(binding); this.#context = contextIdentity; this.#db = supabaseOrigin;
    this.#app = appOrigin; this.#budget = budget; this.#wire = transport; this.#until = validUntil;
  }
  capture({ contextIdentity, actor, publicKey, data, refresh }) {
    if (this.#closed || actor !== this.#actor || contextIdentity !== this.#context || Date.now() >= this.#until) throw Error('PRIVATE_CONTEXT_INVALID');
    if (!this.#reader) {
      if (refresh) throw Error('REFRESH_WITHOUT_PRIVATE_SESSION');
      this.#key = publicKey;
      this.#reader = new MemorySessionReader({ actor, binding: this.#binding, contextIdentity, supabaseOrigin: this.#db,
        publicKey, budget: this.#budget, transport: this.#wire, validUntil: this.#until });
    }
    if (publicKey !== this.#key) throw Error('PUBLIC_KEY_DRIFT');
    this.#reader.capture({ contextIdentity, actor, origin: this.#db, data, refresh });
    this.#epoch++; this.#identityInvalidated = false;
    this.#token?.fill(0); this.#token = Buffer.from(data.access_token);
    this.#expiry = Math.min(this.#until, JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64url')).exp * 1000);
    this.#seen.clear();
  }
  matchesBearer(value) { return !this.#closed && !!this.#token && value === 'Bearer ' + this.#token.toString(); }
  invalidateNativeRefresh() { this.#epoch++; this.#identityInvalidated = true; }
  async verifyActor() {
    if (!this.#reader || this.#closed) throw Error('PRIVATE_SESSION_MISSING'); const epoch = this.#epoch;
    const result = await this.#reader.verifyActor(); if (epoch !== this.#epoch || this.#identityInvalidated) throw Error('PRIVATE_GENERATION_CHANGED'); return result;
  }
  async catalog(id) {
    if (!this.#reader || this.#closed || this.#identityInvalidated) throw Error('PRIVATE_SESSION_MISSING'); const epoch = this.#epoch;
    const result = await this.#reader.catalog(id); if (epoch !== this.#epoch || this.#identityInvalidated) throw Error('PRIVATE_GENERATION_CHANGED'); return result;
  }
  async adminRead() {
    if (this.#closed || this.#identityInvalidated || !this.#reader?.receipt().identityVerified || Date.now() >= this.#expiry) throw Error('PRIVATE_IDENTITY_REQUIRED');
    const epoch = this.#epoch;
    for (const path of ['/api/admin/forum/me', '/api/admin/devices']) {
      if (this.#seen.has(path)) throw Error('PRIVATE_READ_REPLAY');
      this.#budget.reserve(['allBrowserHttpDispatchesMax']); this.#seen.add(path);
      let response;
      try {
        response = await this.#wire({ url: this.#app + path, method: 'GET', headers: { accept: 'application/json', authorization: 'Bearer ' + this.#token.toString() }, body: Buffer.alloc(0) },
          { maxBytes: 1048576, timeoutMs: 15000, signal: this.#abort.signal });
        if (this.#closed || epoch !== this.#epoch || this.#identityInvalidated || Date.now() >= this.#expiry || !this.#reader.receipt().identityVerified) throw Error('PRIVATE_IDENTITY_CHANGED');
        validateResponse({ expected: this.#actor === 'ADMIN' ? [200] : [403], maxBytes: 1048576 }, response);
        const data = JSON.parse(response.body);
        if (this.#actor !== 'ADMIN') {
          if (!data || Array.isArray(data) || !['error', 'code'].some(k => typeof data[k] === 'string') || ['devices', 'data', 'users', 'profile'].some(k => Object.hasOwn(data, k))) throw Error('ADMIN_DENIAL_INVALID');
        } else if (path === '/api/admin/forum/me') {
          if (data.user_id !== this.#binding.userId || data.role !== 'admin' || data.allowed !== true) throw Error('ADMIN_IDENTITY_INVALID');
        } else if (data.ok !== true || !Array.isArray(data.devices) || !data.devices.every(d => d && ['id', 'slug', 'name', 'brandName'].every(k => typeof d[k] === 'string')
          && ['draft', 'published', 'hidden', 'archived'].includes(d.publicationStatus))) throw Error('ADMIN_DATA_INVALID');
      } finally { response?.body.fill(0); }
    }
    return true;
  }
  receipt() { return { actor: this.#actor, sessionPresent: !!this.#token, destroyed: this.#closed,
    identityVerified: !this.#identityInvalidated && this.#reader?.receipt().identityVerified === true, valuesExported: false }; }
  dispose() { this.#closed = true; this.#abort.abort(); this.#reader?.dispose(); this.#token?.fill(0); this.#token = null;
    this.#key = null; this.#context = null; this.#binding = null; this.#seen.clear(); }
}
