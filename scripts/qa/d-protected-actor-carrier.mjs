import {fork, spawn} from 'node:child_process';
import {randomUUID, createHash} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {D_AUTH_ORIGIN, D_ACTOR_PHASES, D_ACTOR_FRAME_BYTES, dActorPayload, dActorEvidence} from './d-protected-actor-child.mjs';

const childFile = fileURLToPath(new URL('./d-protected-actor-child.mjs', import.meta.url));
const systemNames = ['SystemRoot', 'WINDIR', 'TEMP', 'TMP'];
const hash = v => createHash('sha256').update(v).digest('hex');
const exact = (v, fields) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => fields.includes(k));
const need = v => {if (!v) throw Error('D_PROTECTED_ACTOR_CARRIER_INVALID');};
const envFor = names => Object.fromEntries(names.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const bindingFields = ['executionBindingSha256', 'actorId', 'actorEmail', 'namespace', 'createdAt',
  'actorCreationReceiptSha256', 'deadlineUtc'];
const pickBinding = b => Object.fromEntries(bindingFields.map(k => [k, b?.[k]]));

// The default entry is fixed, has no inherited Node flags, and receives only the
// existing exact admin variables. Tests supply their own isolated childFactory.
export function createProtectedActorCarrier({beforeDispatch, afterResponse, childFactory, timeoutMs = 180000} = {}) {
  need(typeof beforeDispatch === 'function' && (afterResponse === undefined || typeof afterResponse === 'function')
    && (childFactory === undefined || typeof childFactory === 'function')
    && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 180000);
  const nonce = randomUUID();
  let child = null, ready = null, closePromise = null, closed = false, stopping = false, current = null;
  let attemptedCreate = false, attemptedContain = false, idleTimer;
  const send = frame => new Promise((resolve, reject) => {
    if (!child?.connected || Buffer.byteLength(JSON.stringify(frame)) > D_ACTOR_FRAME_BYTES) {reject(Error());return;}
    child.send(frame, error => error ? reject(Error()) : resolve());
  });
  const wait = (promise, ms) => new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(() => {clearTimeout(timer);resolve(true);}, () => {clearTimeout(timer);resolve(false);});
  });
  const terminate = async () => {
    clearTimeout(idleTimer);stopping = true;
    if (!child) {if (ready === null) closed = true;return ready === null;}
    if (closed) return true;
    await send({v: 1, type: 'STOP'}).catch(() => {});
    if (!await wait(closePromise, 150)) {
      if (!childFactory && process.platform === 'win32' && Number.isInteger(child.pid)) {
        const killer = spawn(path.join(process.env.SystemRoot, 'System32/taskkill.exe'),
          ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, env: envFor(systemNames), stdio: 'ignore'});
        const killed = new Promise(resolve => {killer.once('close', resolve);killer.once('error', resolve);});
        if (!await wait(killed, 1000)) killer.kill('SIGKILL');
      }
      child.kill('SIGKILL');
    }
    return await wait(closePromise, 2000);
  };
  const fail = () => {stopping = true;current?.finish(null);};
  const actorCreation = (raw, input) => {
    const c = JSON.parse(raw);
    const b = {executionBindingSha256: input.executionBindingSha256, actorId: c.actorId,
      actorEmail: input.controlledAlias, namespace: input.namespace, createdAt: c.createdUtc,
      actorCreationReceiptSha256: hash(raw), deadlineUtc: input.deadlineUtc};
    dActorPayload('CONTAIN', {binding: b, actorCreation: raw, logoutEvidence: null});
    return {binding: b, actorId: b.actorId, email: b.actorEmail, createdAt: b.createdAt, actorCreationRaw: raw};
  };
  const onMessage = async frame => {
    const op = current;
    try {
      need(frame && Buffer.byteLength(JSON.stringify(frame)) <= D_ACTOR_FRAME_BYTES);
      if (frame.type === 'READY') {
        need(exact(frame, ['v', 'type']) && frame.v === 1 && ready && !ready.done);
        ready.done = true;ready.resolve();return;
      }
      need(op && !op.finished && !stopping && frame.v === 1 && frame.nonce === nonce && frame.id === op.id);
      const entry = D_ACTOR_PHASES[op.action][op.next];
      if (frame.type === 'GATE' || frame.type === 'RESPONSE') {
        need(exact(frame, ['v', 'nonce', 'id', 'type', 'seq', 'phase', 'method', 'executionBindingSha256', 'evidence'])
          && entry && frame.seq === op.next + 1 && frame.phase === entry[0] && frame.method === entry[1]
          && frame.executionBindingSha256 === op.bindingHash && op.expect === frame.type);
        op.expect = 'PENDING';
        if (frame.type === 'GATE') {
          need(frame.evidence === undefined);
          op.consumed.push(frame.phase);
          const actorId = op.action === 'CONTAIN' ? op.input.binding.actorId : op.created?.binding.actorId;
          const intent = Object.freeze({phase: frame.phase, method: frame.method,
            endpoint: D_AUTH_ORIGIN + '/auth/v1/admin/users' + (actorId ? '/' + actorId : ''),
            executionBindingSha256: op.bindingHash, ordinal: frame.seq, maxCalls: D_ACTOR_PHASES[op.action].length,
            ...(op.action === 'CREATE' ? {controlledAlias: op.input.controlledAlias, namespace: op.input.namespace,
              emailConfirm: true, ordinaryRole: 'user', displaySourceSha256: op.input.displaySourceSha256} : {})});
          need(await beforeDispatch(frame.phase, intent) === true);
          if (current !== op || op.finished || stopping) return;
          op.expect = 'RESPONSE';
        } else {
          const evidence = dActorEvidence(frame.evidence, frame.phase, frame.method);
          if (evidence.actorCreation !== undefined) op.created = actorCreation(evidence.actorCreation, op.input);
          if (afterResponse !== undefined) need(await afterResponse(frame.phase, evidence) === true);
          if (current !== op || op.finished || stopping) return;
          op.next++;op.expect = 'GATE';
        }
        await send({v: 1, nonce, id: op.id, type: 'ACK', kind: frame.type,
          seq: frame.seq, approved: true});return;
      }
      need(frame.type === 'RESULT' && exact(frame, ['v', 'nonce', 'id', 'type', 'action', 'result'])
        && frame.action === op.action && op.expect === 'GATE');
      const r = frame.result;
      if (op.action === 'CONTAIN') {
        need(exact(r, ['actorId', 'actorCreationReceiptSha256', 'signedOut', 'banned', 'independentReadback',
          'phase', 'productionAuthority', 'logout', 'state']));
        if (r.state === 'UNKNOWN' && Object.keys(r).length === 1) {op.finish(null);return;}
        need(r.actorId === op.input.binding.actorId && r.actorCreationReceiptSha256 === op.input.binding.actorCreationReceiptSha256
          && ['signedOut', 'banned', 'independentReadback'].every(k => typeof r[k] === 'boolean')
          && r.productionAuthority === false && (r.logout === undefined || r.logout === 'UNKNOWN')
          && ['ADMISSION', ...D_ACTOR_PHASES.CONTAIN.map(v => v[0]),
            ...D_ACTOR_PHASES.CONTAIN.map(v => 'STOPPED_' + v[0]), 'STOPPED_ADMISSION'].includes(r.phase));
        need(!(r.banned || r.independentReadback) || op.next === 3);
        op.finish({...r});
      } else {
        need(exact(r, ['state', 'actorCreation', 'binding', 'independentReadback', 'credentialDisplay', 'productionAuthority'])
          && ['CREATED', 'UNKNOWN'].includes(r.state));
        if (r.actorCreation !== undefined) {
          const created = actorCreation(r.actorCreation, op.input);
          need(JSON.stringify(created.binding) === JSON.stringify(r.binding));op.created = created;
        }
        if (r.state === 'CREATED') need(op.next === 2 && op.created && r.independentReadback === true
          && r.credentialDisplay === 'CLOSED_LOGIN_NOT_INFERRED' && r.productionAuthority === false);
        op.finish(r.state === 'CREATED' ? {state: 'CREATED', ...op.created,
          independentReadback: true, credentialDisplay: r.credentialDisplay, productionAuthority: false} : null);
      }
    } catch {fail();}
  };
  const launch = async () => {
    if (child) {await ready.promise;return;}
    let resolve, reject;
    ready = {done: false, promise: new Promise((yes, no) => {resolve = yes;reject = no;}),
      resolve: () => resolve(), reject: () => reject(Error())};
    child = childFactory ? await childFactory() : fork(childFile, [], {execArgv: [], windowsHide: true,
      env: envFor([...systemNames, 'QA_SUPABASE_URL', 'QA_SUPABASE_SERVICE_ROLE_KEY']),
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
    need(child && typeof child.on === 'function' && typeof child.send === 'function' && typeof child.kill === 'function');
    closePromise = new Promise(done => child.once('close', () => {closed = true;ready.reject();fail();done();}));
    child.on('error', () => {ready.reject();fail();});
    child.on('disconnect', () => {if (!closed) {ready.reject();fail();}});
    child.on('message', frame => {void onMessage(frame);});
    if (stopping || !current) {ready.reject();void terminate();}
    await ready.promise;
  };
  const execute = async (action, input, signal) => {
    need(!stopping && !closed && current === null && (!signal || typeof signal.addEventListener === 'function'));
    if (action === 'CREATE') {need(!attemptedCreate && !attemptedContain);attemptedCreate = true;}
    else {need(!attemptedContain);attemptedContain = true;}
    const payload = dActorPayload(action, input), b = action === 'CREATE' ? payload : payload.binding;
    const duration = Math.min(timeoutMs, Date.parse(b.deadlineUtc) - Date.now());
    need(duration > 0 && !signal?.aborted);
    let timer, abort;
    const op = {id: randomUUID(), action, input: payload, bindingHash: b.executionBindingSha256,
      next: 0, expect: 'GATE', consumed: [], created: null, finished: false};
    const outcome = new Promise(resolve => {op.finish = value => {
      if (op.finished) return;op.finished = true;resolve(value);
    };});
    current = op;
    clearTimeout(idleTimer);
    abort = () => {stopping = true;op.finish(null);};
    signal?.addEventListener('abort', abort, {once: true});timer = setTimeout(abort, duration);
    // The launch can itself stall. Its completion is observed, but cannot send
    // after the operation has timed out or been cancelled.
    void launch().then(async () => {
      if (!op.finished && !stopping) await send({v: 1, nonce, id: op.id, type: 'RUN', action, payload});
    }).catch(fail);
    const result = await outcome;
    clearTimeout(timer);signal?.removeEventListener('abort', abort);current = null;
    const completed = action === 'CREATE' ? result?.state === 'CREATED'
      : result?.signedOut && result?.banned && result?.independentReadback;
    const unknown = action === 'CREATE' ? {state: 'UNKNOWN', ...(op.created ?? {}), productionAuthority: false}
      : {state: 'UNKNOWN', actorId: b.actorId, actorCreationReceiptSha256: b.actorCreationReceiptSha256,
        signedOut: false, banned: false, independentReadback: false, phase: 'UNKNOWN', productionAuthority: false};
    let reaped = null;
    if (action === 'CONTAIN' || stopping || !op.created && !completed) reaped = await terminate();
    else idleTimer = setTimeout(() => {void terminate();}, Math.max(1, Date.parse(b.deadlineUtc) - Date.now()));
    return {...(result ?? unknown), ...(!completed ? {state: 'UNKNOWN'} : {}),
      consumedPhases: [...op.consumed], ...(reaped === null ? {} : {childReaped: reaped})};
  };
  return Object.freeze({
    create: async ({signal, privateDirectory, displayReady, displaySourceSha256, ...input} = {}) => {
      need(displayReady === true && path.isAbsolute(privateDirectory ?? '')
        && fs.lstatSync(privateDirectory).isDirectory() && !fs.lstatSync(privateDirectory).isSymbolicLink());
      const pin = displaySourceSha256 ?? hash(fs.readFileSync(new URL('./d-private-fixture-display.ps1', import.meta.url)));
      return execute('CREATE', {...input, displaySourceSha256: pin}, signal);
    },
    contain: async ({binding, actorCreationRaw, logoutEvidence = null, signal, ...extra} = {}) => {
      need(Object.keys(extra).length === 0 && (Buffer.isBuffer(actorCreationRaw) || typeof actorCreationRaw === 'string')
        && Buffer.byteLength(actorCreationRaw) <= 4096);
      return execute('CONTAIN', {binding: pickBinding(binding), actorCreation: actorCreationRaw.toString('utf8'), logoutEvidence}, signal);
    },
    close: () => {fail();return terminate();}
  });
}
