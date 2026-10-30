import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const utc = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

// No provider, credential loading, approval or window activation at import time.
// The host must independently validate the signed scope, private ACL and budgets.
// It supplies transport once, not a separate receipt result a caller may ignore.
export function createProductionDispatchGuard({directory, binding, operations, admit, transport,
  validateResponse, now = Date.now, timeoutMs = 10000}) {
  const b = structuredClone(binding), ops = structuredClone(operations);
  const lockTimeout = b?.lockTimeoutAmendmentSha256 !== undefined;
  const lockBase = 'https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/r2/buckets/openglasshub-media';
  const lockPhases = ['LOCK_BEFORE', 'LIFECYCLE_BEFORE', 'LOCK_PUT', 'LOCK_AFTER', 'LIFECYCLE_AFTER'];
  if (!digest(b?.authorizationSha256) || !digest(b.guardSourceSha256)
    || Object.keys(b).some(k => !['authorizationSha256', 'guardSourceSha256', 'sourceCommit', 'nonce', 'notBeforeUtc', 'deadlineUtc', 'lockTimeoutAmendmentSha256'].includes(k))
    || b.guardSourceSha256 !== hash(fs.readFileSync(fileURLToPath(import.meta.url)))
    || !/^[a-f0-9]{40}$/.test(b.sourceCommit) || !/^[a-zA-Z0-9_-]{16,128}$/.test(b.nonce)
    || !utc(b.notBeforeUtc) || !utc(b.deadlineUtc) || Date.parse(b.notBeforeUtc) >= Date.parse(b.deadlineUtc)
    || !Array.isArray(ops) || !ops.length || ops.length > 64
    || ![admit, transport, validateResponse, now].every(f => typeof f === 'function')
    || !Number.isInteger(timeoutMs) || timeoutMs < 1
    || (lockTimeout ? timeoutMs !== 30000 || !digest(b.lockTimeoutAmendmentSha256)
      || b.lockTimeoutAmendmentSha256 === '0'.repeat(64) : timeoutMs > 10000)
    || !path.isAbsolute(directory) || !fs.lstatSync(directory).isDirectory())
    throw Error('PRODUCTION_DISPATCH_BINDING_INVALID');
  const phases = new Set(); let lastLockPhase = -1;
  for (const op of ops) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(op.phase) || phases.has(op.phase)
      || Object.keys(op).some(k => !['phase', 'method', 'target', 'body'].includes(k))
      || !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(op.method)
      || typeof op.target !== 'string' || op.target.length > 4096
      || (op.body !== undefined && (typeof op.body !== 'string' || Buffer.byteLength(op.body) > 262144)))
      throw Error('PRODUCTION_DISPATCH_OPERATION_INVALID');
    const url = new URL(op.target);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.href !== op.target || (['GET', 'HEAD'].includes(op.method) && op.body !== undefined))
      throw Error('PRODUCTION_DISPATCH_OPERATION_INVALID');
    // The host still verifies the real amendment. This opt-in can never extend
    // timeouts for object reads, CORS, D business calls or another account/bucket.
    if (lockTimeout) {
      const index = lockPhases.indexOf(op.phase);
      const kind = op.phase.startsWith('LIFECYCLE_') ? 'lifecycle' : 'lock';
      if (index <= lastLockPhase || op.target !== `${lockBase}/${kind}`
        || op.method !== (op.phase === 'LOCK_PUT' ? 'PUT' : 'GET')
        || op.phase === 'LOCK_PUT' && typeof op.body !== 'string')
        throw Error('PRODUCTION_DISPATCH_LOCK_TIMEOUT_SCOPE_INVALID');
      lastLockPhase = index;
    }
    phases.add(op.phase);
    Object.freeze(op);
  }
  if (lockTimeout && phases.has('LOCK_PUT')
    && ops.slice(ops.findIndex(op => op.phase === 'LOCK_PUT')).map(op => op.phase).join(',')
      !== 'LOCK_PUT,LOCK_AFTER,LIFECYCLE_AFTER')
    throw Error('PRODUCTION_DISPATCH_LOCK_READBACKS_REQUIRED');
  Object.freeze(ops); Object.freeze(b);
  const domain = hash(JSON.stringify({authorizationSha256: b.authorizationSha256, nonce: b.nonce}));
  const operationsSha256 = hash(JSON.stringify(ops));
  // Stable state owned by this module; no cross-cell REPL scalar captures.
  const state = {next: 0, busy: false, stopped: false, controller: null, operationDeadline: null};
  const stop = () => { state.stopped = true; state.controller?.abort(); };
  const check = () => {
    const time = now();
    if (state.stopped || !Number.isFinite(time) || time < Date.parse(b.notBeforeUtc)
      || time >= Date.parse(b.deadlineUtc) || state.controller?.signal.aborted)
      throw Error('PRODUCTION_DISPATCH_STOPPED');
    if (state.operationDeadline !== null && time >= state.operationDeadline)
      throw Error('PRODUCTION_DISPATCH_TIMEOUT');
  };
  const seal = (file, record) => {
    const bytes = Buffer.from(JSON.stringify(record) + '\n');
    const handle = fs.openSync(file, 'wx', 0o600);
    try { fs.writeFileSync(handle, bytes); fs.fsyncSync(handle); }
    finally { fs.closeSync(handle); }
    // A successful write call alone is not durable, validated admission.
    if (!fs.lstatSync(file).isFile() || !fs.readFileSync(file).equals(bytes))
      throw Error('PRODUCTION_DISPATCH_RECEIPT_UNPROVEN');
  };
  // Claim before any asynchronous gate, including a gate that denies admission.
  // Reconstructing this executor cannot clear an in-memory stop or timeout. This
  // local reservation creates no permit and is never a provider-dispatch receipt.
  check();
  seal(path.join(directory, `${domain}.run.reserved.json`), {
    kind: 'LOCAL_EXECUTION_RESERVATION_NOT_PERMISSION', ...b, operationsSha256,
    recordedUtc: new Date(now()).toISOString(), productionPermitCreated: false
  });
  return Object.freeze({stop,
    status: () => Object.freeze({stopped: state.stopped, completed: state.next, exhausted: state.next === ops.length}),
    async dispatch(phase) {
      if (state.busy) { stop(); throw Error('PRODUCTION_DISPATCH_CONCURRENT'); }
      state.busy = true;
      let timer;
      try {
        check();
        const op = ops[state.next];
        if (!op || op.phase !== phase) throw Error('PRODUCTION_DISPATCH_SEQUENCE_INVALID');
        if (lockTimeout && op.method === 'PUT'
          && Date.parse(b.deadlineUtc) - now() < (ops.length - state.next) * timeoutMs + 30000)
          throw Error('PRODUCTION_DISPATCH_INSUFFICIENT_READBACK_TIME');
        state.controller = new AbortController();
        const requestSha256 = hash(JSON.stringify(op));
        const base = {kind: 'PRODUCTION_PRE_DISPATCH_INTENT', ...b, operationsSha256,
          phase: op.phase, method: op.method, requestSha256, ordinal: state.next + 1,
          requestTimeoutMs: timeoutMs};
        const file = path.join(directory, `${domain}.${op.phase}.used.json`);
        const deadline = Math.min(timeoutMs, Date.parse(b.deadlineUtc) - now());
        state.operationDeadline = now() + deadline;
        // Check cancellation again after every asynchronous prerequisite. A late
        // gate result must never dispatch after a timeout or explicit stop.
        const work = (async () => {
          if (await admit(Object.freeze({...base}), state.controller.signal) !== true)
            throw Error('PRODUCTION_DISPATCH_NOT_ADMITTED');
          check();
          seal(file, {...base, recordedUtc: new Date(now()).toISOString()});
          check();
          const response = await transport(op, state.controller.signal);
          check();
          if (!response || response.isError === true || validateResponse(response, op) !== true)
            throw Error('PRODUCTION_DISPATCH_RESPONSE_UNPROVEN');
          check();
          seal(`${file}.result.json`, {kind: 'PRODUCTION_ACKNOWLEDGEMENT', ...base,
            acknowledgedUtc: new Date(now()).toISOString()});
          check();
          state.next++;
          return response;
        })();
        const expired = new Promise((_, reject) => {
          timer = setTimeout(() => { stop(); reject(Error('PRODUCTION_DISPATCH_TIMEOUT')); }, deadline);
        });
        return await Promise.race([work, expired]);
      } catch {
        stop();
        // A .used file, partial write, or unknown provider result is never
        // removed or retried. This error deliberately excludes provider data.
        throw Error('PRODUCTION_DISPATCH_FAIL_CLOSED');
      } finally {
        clearTimeout(timer);
        state.operationDeadline = null;
        state.busy = false;
      }
    }
  });
}
