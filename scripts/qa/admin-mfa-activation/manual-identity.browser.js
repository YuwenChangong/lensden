// Reviewed one-shot OWNER operation, not a controller or approval generator.
// Run only AFTER the exact amendment is approved. No Production request on load.
(() => {
  const parent = '4e447058285658339e9e0f13f2450705ce16789b2bad84d4008ec8d235e1a658';
  const nonce = '86ab2edb-0c8b-4597-8d83-d61f1b3ae4f9';
  const end = '2026-10-24T14:10:17.2244604Z';
  const origin = 'https://openglasshub.ogh.workers.dev';
  const project = 'https://xcbnxzjlsvtgzixurcof.supabase.co';
  const guard = `__ogh_manual_identity_${nonce}`;
  if (window.top !== window || location.origin !== origin || location.pathname !== '/admin/reports/'
      || Date.now() >= Date.parse(end) || window[guard]) return;
  Object.defineProperty(window, guard, { value: true, configurable: false });

  const run = async event => {
    if (!event.isTrusted) return;
    event.preventDefault(); event.stopImmediatePropagation();
    window.removeEventListener('click', run, true);
    let directory;
    const result = { parentBinding: parent, nonce, status: 'NOT_VERIFIED', startedUTC: new Date(Date.now()).toISOString(), authDispatches: 0, workerDispatches: 0, retries: 0 };
    const require = (value, code) => { if (!value) throw new Error(code); };
    async function write(name, data) {
      let exists = false;
      try { await directory.getFileHandle(name); exists = true; }
      catch (error) { require(error.name === 'NotFoundError', 'SINK_UNAVAILABLE'); }
      require(!exists, 'EXISTING_EVIDENCE_MUST_NOT_BE_OVERWRITTEN');
      const handle = await directory.getFileHandle(name, { create: true });
      const stream = await handle.createWritable();
      try { await stream.write(JSON.stringify(data, null, 2) + '\n'); } finally { await stream.close(); }
      require(JSON.parse(await (await handle.getFile()).text()).nonce === nonce, 'LOCAL_READBACK_FAILED');
    }
    try {
      // This trusted click supplies the browser-required user activation. Select
      // ONLY the exact already-ACL-protected parent-binding evidence directory.
      directory = await window.showDirectoryPicker({ mode: 'readwrite' });
      require(directory.name === parent, 'WRONG_PRIVATE_DIRECTORY');
      const marker = JSON.parse(await (await (await directory.getFileHandle('MANUAL_IDENTITY_APPROVAL.safe.json')).getFile()).text());
      require(marker.approved === true && marker.parentBinding === parent && marker.nonce === nonce
        && /^[a-f0-9]{64}$/.test(marker.amendmentBinding) && marker.windowEndUTC === end, 'EXACT_APPROVAL_REQUIRED');
      require(Date.now() + 30000 < Date.parse(end), 'ORIGINAL_WINDOW_BUDGET');
      result.amendmentBinding = marker.amendmentBinding;
      let used = false;
      try { await directory.getFileHandle('MANUAL_IDENTITY_DISPATCH.used.json'); used = true; }
      catch (error) { require(error.name === 'NotFoundError', 'SINK_UNAVAILABLE'); }
      if (used) { result.amendmentBinding = undefined; throw new Error('ALREADY_CONSUMED'); }
      await write('MANUAL_IDENTITY_DISPATCH.used.json', { parentBinding: parent, nonce, startedUTC: result.startedUTC });

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
    try {
      require(result.amendmentBinding, 'NO_VERIFIED_PRIVATE_SINK');
      await write('MANUAL_IDENTITY_RESULT.private.json', result);
      alert(`OpenGlass identity: ${result.status}. Private result saved. Do not rerun.`);
    } catch {
      alert('OpenGlass identity NOT_VERIFIED: private result persistence unconfirmed. Stop; do not rerun.');
    }
  };
  window.addEventListener('click', run, { capture: true, once: true });
  alert('After approval only: click once on a blank area of this page, then select the exact private evidence directory. No requests have been sent by loading this snippet.');
})();
