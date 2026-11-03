import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openNativeBrowser } from '../e-verify-group1-manual-auth/browser.mjs';
import { SharedBudget } from '../e-verify-group1-v9-closure/gate.mjs';
const out = new URL('./artifacts/reproduction-' + Date.now() + '/', import.meta.url); fs.mkdirSync(out, { recursive: true });
const appOrigin = 'https://app.example.invalid', supabaseOrigin = 'https://qa.example.invalid';
const budget = new SharedBudget({ allBrowserHttpDispatchesMax: 650, supabaseAuthDispatchesMax: 40, applicationMutationDispatchesMax: 50,
  supabaseRestReadDispatchesMax: 80, turnstileHttpDispatchesMax: 40, ownerSessionRefreshRequestsMax: 6, executionSecondsMax: 3600 });
const proxy = http.createServer((q, r) => { r.writeHead(403); r.end(); });
proxy.on('connect', (q, s) => { s.on('error', () => {}); s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
await new Promise(r => proxy.listen(0, '127.0.0.1', r));
const browsers = [], states = [], evidence = { productionRequests: 0, thirdPartyLiveRequests: 0, testsAreHeaded: true };
const dom = page => page.evaluate(() => ({ blank: document.body.textContent.trim() === '', readyState: document.readyState,
  startExists: !!document.querySelector('#start'), startEnabled: !!document.querySelector('#start') && !document.querySelector('#start').disabled,
  handlerExists: typeof window.emit === 'function' && typeof window.qaEvent === 'function', visible: document.visibilityState, focused: document.hasFocus(),
  bodyTextLength: document.body.textContent.trim().length }));
function foreground(profile) {
  const script = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class F{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}';[uint32]$id=0;[void][F]::GetWindowThreadProcessId([F]::GetForegroundWindow(),[ref]$id);$p='${profile.replaceAll("'", "''")}';$owned=@(Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($p)} | Select-Object -ExpandProperty ProcessId);[pscustomobject]@{foregroundBelongsToProfile=($owned -contains $id);ownedProcesses=$owned.Count}|ConvertTo-Json -Compress`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error('LOCAL_FOREGROUND_PROBE_FAILED'); return JSON.parse(r.stdout);
}
try {
  for (const actor of ['A', 'B', 'ADMIN', 'A', 'A', 'A']) {
    const before = new Set(fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('ogh-native-qa-')));
    const state = { actor };
    const browser = await openNativeBrowser({ actor, binding: { userId: '11111111-1111-4111-8111-111111111111', email: 'local@example.invalid', applicationRole: actor === 'ADMIN' ? 'admin' : 'user' },
      appOrigin, supabaseOrigin, budget, staticPaths: [], headless: false, workMs: 60000,
      transport: async () => { throw Error('OFFLINE_ONLY'); }, fixtureSetup: {
        launchOptions: { proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '127.0.0.1' }, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] },
        async install(s) {
          Object.assign(state, s);
          const newProfiles = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('ogh-native-qa-') && !before.has(n));
          if (newProfiles.length !== 1) throw Error('PROFILE_IDENTITY_UNKNOWN'); state.profile = path.join(fs.realpathSync(os.tmpdir()), newProfiles[0]);
          await s.context.route(u => u.origin === appOrigin, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><p>Offline navigation only</p>' }));
        }, async start(portal) {
          evidence.afterOriginalBringToFront = { portal: await dom(portal), pendingPage: await dom(state.p), foreground: foreground(state.profile) };
          await portal.screenshot({ path: path.join(out.pathname.slice(1), 'original-control.png') });
          await portal.getByRole('button', { name: 'Start', exact: true }).click();
        }
      } });
    browsers.push(browser); states.push(state);
  }
  evidence.afterSixOriginalLaunches = await Promise.all(states.map(async (s, index) => ({ index, actor: s.actor,
    portal: await dom(s.portal), pendingPage: await dom(s.p), foreground: foreground(s.profile) })));
  await states.at(-1).p.screenshot({ path: path.join(out.pathname.slice(1), 'original-selected-blank.png') });
  browsers[0].permitLogin('success'); await browsers[0].navigate('/login/');
  evidence.originalStartDelivered = browsers[0].receipt().started;
} finally {
  await Promise.all(browsers.map(b => b.close())); proxy.closeAllConnections(); await new Promise(r => proxy.close(r));
  evidence.cleanup = browsers.every(b => b.receipt().closed) && states.every(s => !fs.existsSync(s.profile));
  fs.writeFileSync(new URL('REPRODUCTION_SAFE.json', out), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ evidence: new URL('REPRODUCTION_SAFE.json', out).pathname, ...evidence }));
}
