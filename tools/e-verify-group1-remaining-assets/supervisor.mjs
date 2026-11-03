/**
 * Local engineering supervisor; Node 22+, Windows PowerShell / kernel32 Job Objects.
 * await runSupervised({entry, args: [], cwd, deadlineMs: 1800000, graceMs: 10000,
 *   receiptPath, env: {}, onMessage(event, context) {}});
 *
 * cwd/receiptPath must be absolute; entry may be relative to cwd. receiptPath is
 * exclusively created (existing files reject). No environment is inherited;
 * explicit env must be a bounded string map without NODE_OPTIONS/NODE_PATH.
 * deadlineMs is a required safe integer, 1..3600000; graceMs is required,
 * 1..10000 and strictly less than deadlineMs. The absolute deadline starts before
 * spawn, includes broker compilation/assignment and cleanup. Cleanup is reserved
 * inside that bound: overall stop begins at deadlineMs - graceMs. There is NO
 * unchecked grace extension beyond deadlineMs. OS scheduling and synchronous
 * spawn/local receipt I/O are not real-time guarantees.
 *
 * containment defaults to 'required' on Windows, 'none' elsewhere. Required
 * containment fails closed outside Windows. 'none' retains the legacy local
 * taskkill/process-group engineering path, and is NOT Group1 containment PASS.
 * Optional workMs is a positive safe integer <= deadlineMs - graceMs, measured
 * only after start; it can shorten, never extend, the absolute launch deadline.
 * Group1 should use deadlineMs=1800000 and its child work timer=1740000; no workMs
 * is needed when the child owns that timer. The saved maximum remains 3600000.
 *
 * Fixed process.execPath loads this module's trusted bootstrap, which imports no
 * entry code until the broker confirms assignment. The broker receives only our
 * spawned child's PID and bounded reap time over stdin, never a caller PID. It
 * owns an unnamed non-inheritable KILL_ON_JOB_CLOSE job, without breakaway flags.
 * EOF closes/terminates/drains the job on normal root exit, deadline, or parent
 * crash. A broker crash also closes its only job handle. No taskkill is issued
 * against an exited root. A successful final containment.closed receipt requires
 * the broker's active-process-zero observation, CLOSED token, and exit code zero.
 * Initial assignment failure has a fixed stage and actual numeric Win32 error;
 * start is never sent. No machine/user OS settings are changed; PowerShell's
 * execution-policy switch applies only to the broker process.
 *
 * Child contract: install a listener for exact {type:'start'}, send {type:'ready'},
 * await start, then perform work/descendant spawning. The bootstrap consumes a
 * separate private release message, never the entry's start. Alternatively import
 * {waitForStart} from this module and await waitForStart(); it registers the start
 * listener and sends an internal entry-ready token for you. Then send only exact
 * objects, with send callbacks before exit:
 * {type:'ready'}, {type:'phase',phase:'started'|'finished'},
 * {type:'descendant',pid:<positive int32>} (observation ONLY),
 * {type:'receipt',status:'complete'} (marker, never an exit-status assertion).
 * The first receipt starts a graceMs exit timer; repeats cannot extend it.
 * At most 64 accepted/rejected messages are processed; accepted JSON <=256 bytes.
 * onMessage gets frozen reconstructed events and frozen parent-generated context
 * {pid,brokerPid}; throws/rejections are counted, never logged/awaited.
 * Child stdout/stderr are ignored, never captured. Broker stdout is a separate
 * <=256-byte fixed-token control pipe; invalid bytes never escape into receipts.
 *
 * Returns/persists bounded value-blind JSON. exitCode/signal are authentic Node
 * observations, null when unobserved. reaped means root exit (or failed-spawn
 * close), distinct from job drain. Preflight rejects INVALID_OPTIONS or
 * RECEIPT_OPEN_FAILED. Classification priority: SPAWN_ERROR, TIMEOUT,
 * NONEXITING_CHILD, CONTAINMENT_FAILED, REAP_TIMEOUT, EXIT_SIGNAL, EXIT_NONZERO,
 * RECEIPT_MISSING, EXIT_ZERO, EXIT_UNKNOWN. timeoutSource is WORK/OVERALL/null;
 * receiptMissing remains independent of classification. Inspect containment,
 * cleanup, reaped and receiptWritten; EXIT_ZERO alone is not containment proof.
 * Parent death cannot produce a final receipt; the precreated file may be empty
 * or partial. Receipt writes are not atomic/durable crash receipts.
 *
 * Limits: reviewed offline entries only; this is containment, not an I/O sandbox.
 * Native compile time must fit the launch budget (local tests allow 6000ms).
 * Fixed Windows paths assume C:\Windows; unsupported attachment/permissions are
 * explicit blocks, never silently downgraded. Node deserializes IPC before our
 * validation, so a malicious frame can allocate memory. Blocking observers or
 * filesystem/OS stalls can delay timers. POSIX 'none' is not crash containment.
 */
import { spawn } from 'node:child_process';
import { openSync, writeFileSync, closeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const BOOTSTRAP = path.join(path.dirname(SELF), 'bootstrap.mjs');
const BROKER = path.join(path.dirname(SELF), 'job-broker.ps1');
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const TASKKILL = 'C:\\Windows\\System32\\taskkill.exe';
const OS_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'EAGAIN', 'ENOMEM',
  'ENOTDIR', 'EINVAL', 'EPIPE', 'ESRCH', 'EIO', 'ENOSPC', 'EBADF', 'EEXIST', 'EISDIR']);
const osCode = error => OS_CODES.has(error?.code) ? error.code : 'OS_ERROR';
const fail = code => Object.assign(new Error(code), { code });
const plain = value => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const dataOnly = value => Reflect.ownKeys(value).every(key => typeof key === 'string' &&
  Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
const text = (value, max = 4096) => typeof value === 'string' &&
  !value.includes('\0') && Buffer.byteLength(value, 'utf8') <= max;

function validate(options) {
  const keys = ['entry', 'args', 'cwd', 'deadlineMs', 'graceMs', 'receiptPath', 'env',
    'onMessage', 'containment', 'workMs','reserveMs'];
  if (!plain(options) || !dataOnly(options) || Reflect.ownKeys(options).some(k => !keys.includes(k))) throw fail('INVALID_OPTIONS');
  const { entry, cwd, deadlineMs, graceMs, receiptPath, onMessage, workMs } = options;
  const args = options.args === undefined ? [] : options.args;
  const env = options.env === undefined ? {} : options.env;
  const containment = options.containment ?? (process.platform === 'win32' ? 'required' : 'none');
  const reserveMs=options.reserveMs??graceMs;
  if (!text(entry) || !entry || entry.startsWith('-') ||
      !text(cwd) || !path.isAbsolute(cwd) || !text(receiptPath) || !path.isAbsolute(receiptPath) ||
      !Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > 3600000 ||
      !Number.isSafeInteger(graceMs) || graceMs <= 0 || graceMs > 10000 || graceMs >= deadlineMs ||
      !['required', 'none'].includes(containment) ||
      !Number.isSafeInteger(reserveMs)||reserveMs<graceMs||reserveMs>=deadlineMs||
      (workMs !== undefined && (!Number.isSafeInteger(workMs) || workMs <= 0 || workMs > deadlineMs - graceMs)) ||
      !Array.isArray(args) || !dataOnly(args) || args.length > 64 || [...args].some(arg => !text(arg)) ||
      !plain(env) || !dataOnly(env) || Object.keys(env).length > 64 ||
      (onMessage !== undefined && typeof onMessage !== 'function')) throw fail('INVALID_OPTIONS');
  let bytes = Buffer.byteLength(entry + cwd + receiptPath);
  for (const arg of args) bytes += Buffer.byteLength(arg);
  const names = new Set();
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) || !text(value) || names.has(key.toUpperCase()) ||
        ['NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase())) throw fail('INVALID_OPTIONS');
    names.add(key.toUpperCase());
    bytes += Buffer.byteLength(key) + Buffer.byteLength(value);
  }
  if (bytes > 16384) throw fail('INVALID_OPTIONS');
  return { entry: path.resolve(cwd, entry), args: [...args], cwd, deadlineMs, graceMs,
    receiptPath, env: { ...env }, onMessage, containment, workMs,reserveMs };
}

function safeEvent(message) {
  if (!plain(message)) return null;
  const keys = Object.keys(message);
  let event;
  if (message.type === 'ready' && keys.length === 1) event = { type: 'ready' };
  else if (message.type === 'phase' && keys.length === 2 && Object.hasOwn(message, 'phase') &&
      ['started', 'finished'].includes(message.phase)) event = { type: 'phase', phase: message.phase };
  else if(message.type==='group1-stage'&&keys.length===2&&['LOGIN_A','LOGIN_B','LOGIN_ADMIN','NEGATIVE_CAPTCHA','NEGATIVE_MISSING_CAPTCHA','NEGATIVE_PASSWORD','FINISHED'].includes(message.stage))event={type:'group1-stage',stage:message.stage};
  else if (message.type === 'descendant' && keys.length === 2 && Object.hasOwn(message, 'pid') &&
      Number.isSafeInteger(message.pid) && message.pid > 0 && message.pid <= 2147483647) event = { type: 'descendant', pid: message.pid };
  else if (message.type === 'receipt' && keys.length === 2 && Object.hasOwn(message, 'status') &&
      message.status === 'complete') event = { type: 'receipt', status: 'complete' };
  if (!event || Buffer.byteLength(JSON.stringify(message)) > 256) return null;
  return Object.freeze(event);
}

let entryStart;
function waitForMessage(type) {
  if (!process.connected) return Promise.reject(fail('START_CHANNEL_REQUIRED'));
  process.channel?.ref();
  return new Promise((resolve, reject) => {
    const disconnect = () => { process.off('message', message); reject(fail('START_CHANNEL_CLOSED')); };
    const message = value => {
      if (!plain(value) || Object.keys(value).length !== 1 || value.type !== type) return;
      process.off('message', message); process.off('disconnect', disconnect);
      resolve();
    };
    process.on('message', message); process.once('disconnect', disconnect);
  });
}
export function waitForStart() {
  if (!entryStart) {
    entryStart = waitForMessage('start');
    if (process.connected) process.send({ type: 'supervisor-entry-ready' }, () => {});
  }
  return entryStart;
}

export async function runSupervised(options) {
  const config = validate(options);
  let receiptFd;
  try { receiptFd = openSync(config.receiptPath, 'wx', 0o600); }
  catch { throw fail('RECEIPT_OPEN_FAILED'); }
  const launched = performance.now();
  const required = config.containment === 'required';
  const state = {
    format: 'offline-supervisor-v2', classification: 'EXIT_UNKNOWN', pid: null,
    exitCode: null, signal: null, spawnError: null, timeout: false, timeoutSource: null,
    receiptMissing: true, reaped: false, elapsedMs: 0, deadlineMs: config.deadlineMs, startedAfterMs: null,
    containment: { required, assigned: false, started: false, closed: false, brokerPid: null,
      exitCode: null, signal: null, error: null, win32Error: null },
    cleanup: { attempted: false, method: null, exitCode: null, signal: null, error: null },
    ipc: { accepted: 0, rejected: 0, capped: false, observerErrors: 0 },
    receiptWritten: true, receiptWriteError: null,
  };
  return new Promise(resolve => {
    let child, broker, killer, workTimer, receiptTimer, reapTimer, reserveTimer, hardTimer;
    let rootExited = false, rootClosed = false, helperDone = true, brokerDone = !required;
    let bootstrapReady = false, bootstrapReleased = false, stopped = false, nonexiting = false, finished = false;
    let brokerBytes = 0, brokerBuffer = '', jobDrained = false;
    const remaining = () => Math.max(0, config.deadlineMs - (performance.now() - launched));
    function disconnect() {
      try { if (child?.connected) child.disconnect(); } catch { /* Already closing. */ }
    }
    function killOwned(handle) {
      try { if (handle && handle.exitCode === null && handle.signalCode === null) handle.kill('SIGKILL'); }
      catch { /* Reap remains explicit if the OS cannot terminate it. */ }
    }
    function finish() {
      if (finished) return;
      finished = true;
      for (const timer of [workTimer, receiptTimer, reapTimer, reserveTimer, hardTimer]) clearTimeout(timer);
      state.reaped = rootExited || (state.spawnError !== null && rootClosed);
      state.elapsedMs = Math.ceil(performance.now() - launched);
      state.classification = state.spawnError ? 'SPAWN_ERROR' : state.timeout ? 'TIMEOUT' :
        nonexiting ? 'NONEXITING_CHILD' : state.containment.error ? 'CONTAINMENT_FAILED' :
          !state.reaped || state.cleanup.error ? 'REAP_TIMEOUT' : state.signal !== null ? 'EXIT_SIGNAL' :
            state.exitCode !== null && state.exitCode !== 0 ? 'EXIT_NONZERO' : state.receiptMissing ?
              'RECEIPT_MISSING' : state.exitCode === 0 ? 'EXIT_ZERO' : 'EXIT_UNKNOWN';
      try { writeFileSync(receiptFd, JSON.stringify(state) + '\n', 'utf8'); }
      catch (error) { state.receiptWritten = false; state.receiptWriteError = osCode(error); }
      finally {
        try { closeSync(receiptFd); } catch (error) { state.receiptWritten = false; state.receiptWriteError ??= osCode(error); }
      }
      for (const section of [state.containment, state.cleanup, state.ipc]) Object.freeze(section);
      resolve(Object.freeze(state));
    }
    function maybeFinish() {
      if (finished) return;
      if ((rootClosed || (rootExited && !child.connected)) && helperDone && brokerDone) finish();
    }
    function expire() {
      if (finished) return;
      state.cleanup.error ??= rootExited ? 'CLEANUP_TIMEOUT' : 'REAP_TIMEOUT';
      killOwned(broker); killOwned(killer);
      if (!state.containment.assigned) killOwned(child);
      disconnect();
      for (const handle of [child, broker, killer]) { handle?.unref(); handle?.channel?.unref(); }
      broker?.stdout?.destroy(); broker?.stdin?.destroy();
      finish();
    }
    function stop(reason) {
      if (finished || stopped) return;
      stopped = true;
      clearTimeout(workTimer); clearTimeout(receiptTimer); clearTimeout(reserveTimer);
      if (reason === 'overall' || reason === 'work') {
        state.timeout = true; state.timeoutSource = reason === 'work' ? 'WORK' : 'OVERALL';
      } else if (reason === 'nonexiting') nonexiting = true;
      if (reason !== 'root-exit') {
        state.cleanup.attempted = true;
        state.cleanup.method = required ? 'JOB_OBJECT' : process.platform === 'win32' ? 'TASKKILL_TREE' : 'PROCESS_GROUP';
      }
      reapTimer = setTimeout(expire, Math.max(1, Math.min(config.graceMs, remaining())));
      if (required) {
        broker?.stdin?.end();
        if (!state.containment.assigned) { killOwned(broker); killOwned(child); }
      } else if (!rootExited && child?.pid) {
        if (process.platform === 'win32') {
          helperDone = false;
          try {
            killer = spawn(TASKKILL, ['/PID', String(child.pid), '/T', '/F'],
              { env: {}, cwd: 'C:\\Windows\\System32', shell: false, windowsHide: true, stdio: 'ignore' });
            killer.on('error', error => { if (!finished) state.cleanup.error = osCode(error); helperDone = true; maybeFinish(); });
            killer.on('exit', (code, signal) => {
              if (finished) return;
              state.cleanup.exitCode = code; state.cleanup.signal = signal;
              if (code !== 0) state.cleanup.error ??= 'TASKKILL_FAILED';
            });
            killer.on('close', () => { helperDone = true; maybeFinish(); });
          } catch (error) { state.cleanup.error = osCode(error); helperDone = true; }
        } else {
          try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { state.cleanup.error = osCode(error); }
        }
      }
      maybeFinish();
    }
    function containmentError(stage, native = null) {
      if (finished) return;
      state.containment.error ??= stage; state.containment.win32Error ??= native;
      stop('containment');
    }
    function releaseBootstrap() {
      if (finished || stopped || !bootstrapReady || bootstrapReleased || (required && !state.containment.assigned)) return;
      if (remaining() <= config.graceMs) { stop('overall'); return; }
      bootstrapReleased = true;
      child.send({ type: 'bootstrap-start' }, error => { if (error) containmentError('START_CHANNEL'); });
    }
    function startEntry() {
      if (finished || stopped || !bootstrapReleased || (required && !state.containment.assigned) || state.containment.started) return;
      if (remaining() <= config.graceMs) { stop('overall'); return; }
      state.containment.started = true; state.startedAfterMs = Math.ceil(performance.now() - launched);
      child.send({ type: 'start' }, error => { if (error) containmentError('START_CHANNEL'); });
      if (config.workMs !== undefined) workTimer = setTimeout(() => stop('work'), config.workMs);
    }
    function brokerLine(line) {
      if (line === 'ASSIGNED' && !state.containment.assigned) {
        state.containment.assigned = true; releaseBootstrap();
      } else if (line === 'CLOSED' && state.containment.assigned && stopped && !jobDrained) jobDrained = true;
      else {
        const error = /^ERROR:(INPUT|CREATE|LIMIT|OPEN|ASSIGN|TERMINATE|QUERY|DRAIN|COMPILE):([0-9]{1,10})$/.exec(line);
        if (error && Number(error[2]) <= 2147483647) containmentError(error[1], Number(error[2]) || null);
        else containmentError('BROKER_PROTOCOL');
      }
    }
    try {
      child = spawn(process.execPath, ['--', BOOTSTRAP, config.entry, ...config.args], {
        cwd: config.cwd, env: config.env, shell: false, windowsHide: true,
        detached: process.platform !== 'win32', serialization: 'json', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
    } catch (error) { state.spawnError = osCode(error); rootClosed = true; finish(); return; }
    state.pid = child.pid ?? null;
    reserveTimer = setTimeout(() => stop('overall'), Math.max(1, config.deadlineMs - config.reserveMs - (performance.now() - launched)));
    hardTimer = setTimeout(expire, Math.max(1, remaining()));
    child.on('error', error => { if (!finished && state.pid === null) state.spawnError = osCode(error); });
    child.on('exit', (code, signal) => {
      if (finished) return;
      rootExited = true; state.exitCode = code; state.signal = signal;
      stop('root-exit'); maybeFinish();
    });
    child.on('close', () => { rootClosed = true; maybeFinish(); });
    child.on('disconnect', maybeFinish);
    child.on('message', message => {
      if (finished) return;
      if (!bootstrapReady && plain(message) && Object.keys(message).length === 1 && message.type === 'supervisor-bootstrap-ready') {
        bootstrapReady = true; releaseBootstrap(); return;
      }
      if (bootstrapReleased && plain(message) && Object.keys(message).length === 1 && message.type === 'supervisor-entry-ready') {
        startEntry(); return;
      }
      if (bootstrapReleased && !state.containment.started && plain(message) &&
          Object.keys(message).length === 1 && message.type === 'ready') startEntry();
      if (state.ipc.capped || !state.containment.started) return;
      const event = safeEvent(message);
      if (!event) state.ipc.rejected++;
      else {
        state.ipc.accepted++;
        if (event.type === 'receipt' && state.receiptMissing) {
          state.receiptMissing = false;
          receiptTimer = setTimeout(() => stop('nonexiting'), Math.max(1, Math.min(config.graceMs, remaining())));
        }
        if (config.onMessage) {
          const observerError = () => { if (!finished) state.ipc.observerErrors = Math.min(64, state.ipc.observerErrors + 1); };
          try {
            Promise.resolve(config.onMessage(event,
              Object.freeze({ pid: state.pid, brokerPid: state.containment.brokerPid }))).catch(observerError);
          } catch { observerError(); }
        }
      }
      if (state.ipc.accepted + state.ipc.rejected >= 64) { state.ipc.capped = true; disconnect(); }
    });
    if (state.pid === null) { brokerDone = true; return; }
    if (!required) return;
    if (process.platform !== 'win32') { brokerDone = true; containmentError('UNSUPPORTED_PLATFORM'); return; }
    try {
      broker = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', BROKER], {
        cwd: path.dirname(SELF), shell: false, windowsHide: true,
        env: { SystemRoot: 'C:\\Windows', TEMP: os.tmpdir(), TMP: os.tmpdir() }, stdio: ['pipe', 'pipe', 'ignore'],
      });
      state.containment.brokerPid = broker.pid ?? null;
      broker.stdin.on('error', () => { if (!stopped) containmentError('BROKER_STDIN'); });
      broker.on('error', error => { brokerDone = true; containmentError(osCode(error)); maybeFinish(); });
      broker.stdout.on('data', bytes => {
        if (finished) return;
        brokerBytes += bytes.length;
        if (brokerBytes > 256 || [...bytes].some(byte => byte > 127)) { containmentError('BROKER_PROTOCOL'); return; }
        brokerBuffer += bytes.toString('ascii');
        let newline;
        while ((newline = brokerBuffer.indexOf('\n')) !== -1) {
          const line = brokerBuffer.slice(0, newline).replace(/\r$/, '');
          brokerBuffer = brokerBuffer.slice(newline + 1); brokerLine(line);
        }
      });
      broker.on('exit', (code, signal) => {
        if (finished) return;
        state.containment.exitCode = code; state.containment.signal = signal;
        if (state.cleanup.attempted) { state.cleanup.exitCode = code; state.cleanup.signal = signal; }
        state.containment.closed = jobDrained && code === 0 && signal === null;
        if (!state.containment.closed && !state.timeout) containmentError('BROKER_EXIT');
      });
      broker.on('close', () => { brokerDone = true; maybeFinish(); });
      broker.stdin.write(`${child.pid} ${config.graceMs}\n`);
    } catch (error) { brokerDone = true; containmentError(osCode(error)); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF && process.argv[2] === '--supervisor-bootstrap') {
  const target = process.argv[3], args = process.argv.slice(4);
  process.on('error', () => {});
  try {
    const start = waitForMessage('bootstrap-start');
    process.send({ type: 'supervisor-bootstrap-ready' }, () => {});
    await start;
    process.argv = [process.execPath, target, ...args];
    await import(pathToFileURL(target).href);
  } catch { process.exitCode = 1; if (process.connected) process.disconnect(); }
}
