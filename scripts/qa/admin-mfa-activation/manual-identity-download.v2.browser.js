// Reviewed owner-operated replacement. RUN ONLY AFTER NEW EXACT V2 APPROVAL.
// Standard browser download; no directory access, controller or credential export.
(async () => {
  const parent = '4e447058285658339e9e0f13f2450705ce16789b2bad84d4008ec8d235e1a658';
  const nonce = '609ead46-02cc-4d56-b892-9591ed242215';
  const end = '2026-10-24T14:10:17.2244604Z';
  const origin = 'https://openglasshub.ogh.workers.dev';
  const project = 'https://xcbnxzjlsvtgzixurcof.supabase.co';
  const guard = `__ogh_manual_identity_download_${nonce}`;
  if (window.top !== window || location.origin !== origin || location.pathname !== '/admin/reports/'
      || Date.now() + 30000 >= Date.parse(end) || window[guard]) return;
  Object.defineProperty(window, guard, { value: true, configurable: false });
  const result = { parentBinding: parent, nonce, method: 'OWNER_SAME_SESSION_DOWNLOAD_V2', status: 'NOT_VERIFIED',
    startedUTC: new Date(Date.now()).toISOString(), authDispatches: 0, workerDispatches: 0, retries: 0 };
  const require = (value, code) => { if (!value) throw new Error(code); };
  try {
    const deadline = Date.now() + 20000;
    const active = () => require(Date.now() < deadline && Date.now() < Date.parse(end), 'READ_DEADLINE');
    const bounded = async promise => {
      let timer;
      try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('READ_DEADLINE')), Math.max(1, deadline - Date.now())); })]); }
      finally { clearTimeout(timer); }
    };
    const module = await bounded(import("/_astro/supabase-browser.CbJzQpCJ.js"));
    active();
    const client = module.n(); // Same deployed singleton, not another account/client.
    require(client?.supabaseUrl?.replace(/\/$/, '') === project, 'FIXED_PROJECT_REQUIRED');
    const saved = await bounded(client.auth.getSession());
    active();
    const session = saved.data?.session;
    require(!saved.error && session?.access_token && session.user?.id && session.expires_at * 1000 > deadline, 'EXISTING_VALID_SESSION_REQUIRED');
    result.authDispatches = 1;
    const auth = await bounded(client.auth.getUser(session.access_token));
    active();
    require(!auth.error && auth.data?.user?.id === session.user.id, 'AUTH_IDENTITY_MISMATCH');
    result.workerDispatches = 1;
    const response = await bounded(fetch(origin + '/api/admin/forum/me', {
      method: 'GET', headers: { authorization: `Bearer ${session.access_token}` },
      credentials: 'omit', cache: 'no-store', redirect: 'manual', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    }));
    active();
    result.workerHttpStatus = response.status;
    require(response.status === 200 && !response.redirected && response.type !== 'opaqueredirect'
      && !response.headers.has('location'), 'WORKER_HTTP_NOT_200_NO_REDIRECT');
    const me = await bounded(response.json());
    active();
    require(me.allowed === true && me.user_id === auth.data.user.id && me.role === 'moderator', 'PROTECTED_IDENTITY_OR_ROLE_MISMATCH');
    result.authUserId = auth.data.user.id;
    result.workerUserId = me.user_id;
    result.protectedRole = me.role;
    result.uuidEquality = true;
    result.roleSource = 'WORKER_GETUSER_AND_PROTECTED_PROFILE_LOOKUP_NOT_USER_METADATA';
    result.status = 'PASS';
  } catch (error) {
    result.failure = /^[A-Z][A-Z0-9_]{1,70}$/.test(error?.message || '') ? error.message : 'MANUAL_IDENTITY_UNCONFIRMED';
  }
  result.finishedUTC = new Date(Date.now()).toISOString();
  // Only this minimized projection enters a local Blob; no full response/secret.
  // A download request is NOT proof of persistence or admission.
  try {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ogh-manual-identity-609ead46-02cc-4d56-b892-9591ed242215.json';
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    alert('OpenGlass identity: download requested, NOT yet verified. Save the exact file to Downloads; do not rerun. Codex must verify private import.');
  } catch {
    alert('OpenGlass identity NOT_VERIFIED: download unconfirmed. Stop; do not rerun.');
  }
})();
