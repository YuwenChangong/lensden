import { identitySteps, verifyIdentity } from '../e-verify-group1-script-identity/execution/identity-rls.mjs';
import { catalogSteps, verifyGroup1Catalog } from '../e-verify-group1-script-identity/execution/group1/rls.mjs';
import { validateResponse } from '../e-verify-group1-v9-closure/gate.mjs';

export class MemorySessionReader {
  #actor; #binding; #context; #origin; #key; #token = null; #expiry = 0; #verified = false;
  #budget; #wire; #now; #until; #closed = false; #seen = new Set(); #controller = new AbortController(); #dispatches = 0;
  constructor({ actor, binding, contextIdentity, supabaseOrigin, publicKey, budget, transport, now = Date.now, validUntil }) {
    const u = new URL(supabaseOrigin);
    if (!['A', 'B', 'ADMIN'].includes(actor) || !binding || !contextIdentity || u.protocol !== 'https:' || u.origin !== supabaseOrigin
      || u.username || u.password || !publicKey || typeof publicKey !== 'string' || !budget?.reserve || typeof transport !== 'function'
      || typeof now !== 'function' || !Number.isFinite(validUntil)) throw Error('READER_BINDING_INVALID');
    let publicRole;
    try {
      if (publicKey.startsWith('sb_publishable_')) publicRole = 'anon';
      else publicRole = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString('utf8')).role;
    } catch { throw Error('PUBLIC_KEY_INVALID'); }
    if (publicRole !== 'anon') throw Error('PRIVILEGED_KEY_FORBIDDEN');
    this.#actor = actor; this.#binding = structuredClone(binding); this.#context = contextIdentity; this.#origin = supabaseOrigin;
    this.#key = publicKey; this.#budget = budget; this.#wire = transport; this.#now = now; this.#until = validUntil;
  }
  #fail(code) { this.dispose(); throw Error(code); }
  #active() {
    if (this.#closed) throw Error('SESSION_DESTROYED');
    if (this.#now() >= this.#until) this.#fail('WORK_DEADLINE');
    if (this.#token && this.#now() >= this.#expiry) this.#fail('SESSION_EXPIRED');
    this.#budget.assertActive();
  }
  capture({ contextIdentity, actor, origin, data, refresh = false }) {
    this.#active();
    if (contextIdentity !== this.#context || actor !== this.#actor || origin !== this.#origin) this.#fail('SESSION_CONTEXT_MISMATCH');
    if (refresh ? !this.#token : !!this.#token) this.#fail('SESSION_GENERATION_INVALID');
    let claims;
    try {
      if (typeof data?.access_token !== 'string' || data.access_token.length > 16384 || data.token_type !== 'bearer') throw Error();
      const parts = data.access_token.split('.'); if (parts.length !== 3) throw Error();
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch { this.#fail('SESSION_ENVELOPE_INVALID'); }
    if (claims.iss !== this.#origin + '/auth/v1' || claims.aud !== 'authenticated' || claims.role !== 'authenticated'
      || claims.sub !== this.#binding.userId || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= this.#now()
      || data.user?.id !== this.#binding.userId || typeof data.user?.email !== 'string'
      || data.user.email.toLowerCase() !== this.#binding.email.toLowerCase()) this.#fail('SESSION_IDENTITY_INVALID');
    // JWT decoding is a rejection filter only. Authoritative /user + profile verification follows.
    this.#token?.fill(0); this.#token = Buffer.from(data.access_token); this.#expiry = Math.min(claims.exp * 1000, this.#until);
    this.#verified = false; this.#seen.clear();
    // Refresh token/password/CAPTCHA value are neither kept nor passed to the reader.
    return true;
  }
  async #read(path, category, role = this.#actor, expected = [200]) {
    this.#active();
    if (role !== 'anon' && !this.#token) this.#fail('SESSION_MISSING');
    const key = role + ':' + path;
    if (this.#seen.has(key)) this.#fail('CONTROLLED_READ_REPLAY');
    try { this.#budget.reserve(['allBrowserHttpDispatchesMax', category]); } catch { this.#fail('BUDGET_EXCEEDED'); }
    this.#seen.add(key); this.#dispatches++;
    try {
      const response = await this.#wire({ url: this.#origin + path, method: 'GET',
        headers: { accept: 'application/json', apikey: this.#key, authorization: 'Bearer ' + (role === 'anon' ? this.#key : this.#token.toString('utf8')) },
        body: Buffer.alloc(0) }, { timeoutMs: 15000, maxBytes: 1048576, signal: this.#controller.signal });
      this.#active(); validateResponse({ expected, maxBytes: 1048576 }, response);
      return response;
    } catch { this.#fail('CONTROLLED_READ_FAILED'); }
  }
  async verifyActor() {
    const steps = identitySteps(this.#binding, this.#actor);
    let auth, profile;
    try {
      auth = await this.#read(steps[0].path, 'supabaseAuthDispatchesMax');
      profile = await this.#read(steps[1].path, 'supabaseRestReadDispatchesMax');
      verifyIdentity(auth, profile, this.#binding); this.#verified = true; return true;
    } catch { this.#fail('IDENTITY_OR_ROLE_MISMATCH'); }
    finally { auth?.body.fill(0); profile?.body.fill(0); }
  }
  async catalog(id) {
    this.#active();
    const step = catalogSteps().find(s => s.id === id && (s.actor === this.#actor || s.actor === 'anon' && this.#actor === 'A'));
    if (!step || !this.#verified) this.#fail('RLS_STEP_OR_IDENTITY_INVALID');
    const expected = step.expect === 'public' ? [200] : step.expect === 'empty-or-deny' ? [200, 403] : step.actor === 'anon' ? [401, 403] : [403];
    let response;
    try { response = await this.#read(step.path, 'supabaseRestReadDispatchesMax', step.actor, expected); return verifyGroup1Catalog(step, response); }
    catch { this.#fail('RLS_ASSERTION_FAILED'); }
    finally { response?.body.fill(0); }
  }
  receipt() { return { actor: this.#actor, sessionPresent: !!this.#token, identityVerified: this.#verified, destroyed: this.#closed,
    controlledGetDispatches: this.#dispatches, privateValuesLogged: false, sessionStorage: 'PROCESS_MEMORY_ONLY',
    refreshTokenRetained: false, decodedJwtIsNotAuthority: true, retries: 0 }; }
  dispose() {
    this.#controller.abort(); this.#token?.fill(0); this.#token = null; this.#key = null; this.#context = null;
    this.#binding = null; this.#verified = false; this.#closed = true; this.#seen.clear();
    // Dropping refs/zeroing owned buffers is not guaranteed erasure of JS/OS memory.
  }
}
