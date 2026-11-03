// Trusted fixed runner only; no token is returned to caller or written to any file.
export function attachSessionCapture(page, { reader, contextIdentity, actor, expectedOrigin, onStop = () => {} }) {
  let armed = null, stopped = false, inFlight = 0;
  const fail = () => { stopped = true; reader.dispose(); onStop('SESSION_CAPTURE_FAILED'); };
  const receive = async response => {
    let bytes;
    try {
      const u = new URL(response.url());
      if (u.origin !== expectedOrigin || u.pathname !== '/auth/v1/token') return;
      const request = response.request();
      const kind = u.search === '?grant_type=password' ? 'password' : u.search === '?grant_type=refresh_token' ? 'refresh' : null;
      if (stopped || !armed || armed !== kind || request.method() !== 'POST' || request.frame() !== page.mainFrame()
        || page.context() !== contextIdentity || response.status() !== 200) { fail(); return; }
      armed = null; inFlight++;
      const headers = await response.allHeaders();
      const length = headers['content-length'];
      if (!/^application\/json(?:;|$)/i.test(headers['content-type'] || '') || length !== undefined && (!/^\d+$/.test(length) || Number(length) > 1048576)) throw Error();
      let timer;
      try {
        bytes = await Promise.race([response.body(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('CAPTURE_TIMEOUT')), 15000); })]);
      } finally { clearTimeout(timer); }
      if (!Buffer.isBuffer(bytes) || bytes.length > 1048576 || stopped) throw Error();
      const data = JSON.parse(bytes.toString('utf8'));
      reader.capture({ contextIdentity, actor, origin: expectedOrigin, data, refresh: kind === 'refresh' });
    } catch { fail(); }
    finally { bytes?.fill(0); if (inFlight > 0) inFlight--; }
  };
  const listener = response => { void receive(response); };
  page.on('response', listener);
  return Object.freeze({
    arm(kind) {
      if (stopped || armed || inFlight || !['password', 'refresh'].includes(kind)) throw Error('CAPTURE_ARM_INVALID');
      armed = kind;
    },
    receipt: () => ({ actor, stopped, captureArmed: !!armed, inFlight, valuesExported: false, transport: 'LOCAL_PLAYWRIGHT_MEMORY_NOT_FILE_OR_ARG',
      browserDispatchControl: 'MONITOR_ONLY_NOT_A_PRE_DISPATCH_AUTH_GATE' }),
    dispose() { stopped = true; armed = null; page.off('response', listener); reader.dispose(); }
  });
}
