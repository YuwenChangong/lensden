import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export async function openFocus({ profile, title, deadline }) {
  const child = spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./focus.ps1', import.meta.url)), '-Profile', profile, '-Title', title],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
      env: Object.fromEntries(['SystemRoot', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
  let text = '', pending, failed = false, exited = false, tail = Promise.resolve();
  const stopPending = () => { failed = true; pending?.reject(Error('WINDOW_FOCUS_FAILURE')); pending = undefined; };
  child.on('error', stopPending); child.on('exit', () => { exited = true; stopPending(); });
  child.stdin.on('error', stopPending);
  child.stdout.on('data', chunk => {
    text += chunk.toString('ascii'); if (text.length > 128) { stopPending(); child.kill(); return; }
    const at = text.indexOf('\n'); if (at < 0) return;
    const token = text.slice(0, at).trim(); text = text.slice(at + 1);
    if (!['READY', 'FOCUSED', 'UNAVAILABLE', 'INVALID'].includes(token) || !pending) { stopPending(); child.kill(); return; }
    const target = pending; pending = undefined; target.resolve(token);
  });
  const receive = () => new Promise((resolve, reject) => {
    if (failed || pending) { reject(Error('WINDOW_FOCUS_FAILURE')); return; }
    const ms = Math.min(5000, deadline - Date.now()); if (ms <= 0) { reject(Error('WORK_DEADLINE')); return; }
    const timer = setTimeout(() => { pending = undefined; failed = true; reject(Error('WINDOW_FOCUS_FAILURE')); }, ms);
    pending = { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } };
  });
  const close = async () => {
    if (exited) return; child.stdin.end('EXIT\n');
    await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); }, 1000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
  };
  try { if (await receive() !== 'READY') throw Error('WINDOW_FOCUS_FAILURE'); }
  catch (error) { await close(); throw error; }
  return { async focus() {
    const action = tail.then(async () => { const response = receive(); child.stdin.write('FOCUS\n'); if (await response !== 'FOCUSED') throw Error('WINDOW_FOCUS_FAILURE'); });
    tail = action.catch(() => {}); return action;
  }, close };
}
export async function controlReady(portal, expectedUrl, state, deadline) {
  const ms = Math.min(5000, deadline - Date.now()); if (ms <= 0) throw Error('WORK_DEADLINE');
  if (portal.url() !== expectedUrl) throw Error('CONTROL_PAGE_NAVIGATION_FAILED');
  try {
    if (await portal.locator('#start').count() !== 1) throw Error('START_BUTTON_NOT_RENDERED');
    if (await portal.locator('#finish').count() !== 1 || await portal.locator('#stop').count() !== 1) throw Error('CONTROL_PAGE_RENDER_FAILURE');
    try { await portal.waitForFunction(() => document.readyState !== 'loading' && typeof window.emit === 'function' && typeof window.qaEvent === 'function', null, { timeout: ms }); }
    catch { throw Error('CONTROL_START_HANDLER_FAILURE'); }
    const ack = await portal.evaluate(() => window.qaEvent('ready'));
    if (ack?.ready !== true) throw Error('CONTROL_START_HANDLER_FAILURE');
    await portal.locator('#start').waitFor({ state: 'visible', timeout: ms });
    const visible = await portal.locator('#start').evaluate(node => {
      const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.width >= 40 && r.height >= 32 && r.y >= 0 && r.bottom <= innerHeight && (target === node || node.contains(target));
    });
    if (!visible) throw Error('START_BUTTON_NOT_RENDERED'); state.rendered = true; state.handlerReady = true;
  } catch (error) { throw Error(/^(CONTROL_|START_)/.test(error.message) ? error.message : 'CONTROL_PAGE_READINESS_FAILED'); }
}
