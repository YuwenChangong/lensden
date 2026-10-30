import {randomBytes, createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {containDProductionActor} from './d-production-bindings.mjs';

export const D_AUTH_ORIGIN = 'https://xcbnxzjlsvtgzixurcof.supabase.co';
export const D_ACTOR_PHASES = Object.freeze({
  CREATE: Object.freeze([['ACTOR_CREATE', 'POST'], ['ACTOR_INITIAL_READ', 'GET']]),
  CONTAIN: Object.freeze([['ACTOR_PREBAN', 'GET'], ['ACTOR_BAN', 'PUT'], ['ACTOR_READBACK', 'GET']])
});
export const D_ACTOR_FRAME_BYTES = 24576;
const sha = v => createHash('sha256').update(v).digest('hex');
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const timestamp = v => typeof v === 'string' && v.length <= 64 && Number.isFinite(Date.parse(v));
const exact = (v, fields) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).every(k => fields.includes(k));
const need = v => {if (!v) throw Error('D_PROTECTED_ACTOR_INVALID');};
const displayFile = fileURLToPath(new URL('./d-private-fixture-display.ps1', import.meta.url));
const bindingFields = ['executionBindingSha256', 'actorId', 'actorEmail', 'namespace', 'createdAt',
  'actorCreationReceiptSha256', 'deadlineUtc'];

export function dActorPayload(action, input) {
  need(exact(input, action === 'CREATE'
    ? ['executionBindingSha256', 'controlledAlias', 'namespace', 'deadlineUtc', 'displaySourceSha256']
    : ['binding', 'actorCreation', 'logoutEvidence']));
  if (action === 'CREATE') {
    need(digest(input.executionBindingSha256) && digest(input.displaySourceSha256)
      && typeof input.controlledAlias === 'string' && input.controlledAlias.length <= 254
      && /^[a-zA-Z0-9._%+-]+\+ogh-d-[a-f0-9]{16}@gmail\.com$/.test(input.controlledAlias)
      && input.controlledAlias === input.controlledAlias.toLowerCase()
      && typeof input.namespace === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(input.namespace)
      && timestamp(input.deadlineUtc) && new Date(input.deadlineUtc).toISOString() === input.deadlineUtc);
    return {...input};
  }
  need(action === 'CONTAIN' && exact(input.binding, bindingFields));
  const b = input.binding;
  need(digest(b.executionBindingSha256) && digest(b.actorCreationReceiptSha256) && uuid(b.actorId)
    && typeof b.actorEmail === 'string' && b.actorEmail.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(b.actorEmail)
    && typeof b.namespace === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(b.namespace)
    && timestamp(b.createdAt) && timestamp(b.deadlineUtc)
    && typeof input.actorCreation === 'string' && Buffer.byteLength(input.actorCreation) <= 4096
    && sha(input.actorCreation) === b.actorCreationReceiptSha256);
  const c = JSON.parse(input.actorCreation);
  need(exact(c, ['executionBindingSha256', 'actorId', 'createdByThisRun', 'createdUtc', 'providerReceiptSha256'])
    && c.executionBindingSha256 === b.executionBindingSha256 && c.actorId === b.actorId
    && c.createdByThisRun === true && c.createdUtc === b.createdAt && digest(c.providerReceiptSha256));
  const l = input.logoutEvidence;
  need(l === null || exact(l, ['actorId', 'binding', 'scope', 'signedOut', 'requestId', 'completedUtc', 'productionAuthority']));
  if (l !== null) need(l.actorId === b.actorId && l.binding === b.executionBindingSha256
    && l.scope === 'global' && typeof l.signedOut === 'boolean'
    && typeof l.requestId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(l.requestId) && timestamp(l.completedUtc)
    && (l.productionAuthority === undefined || l.productionAuthority === false));
  return {binding: {...b}, actorCreation: input.actorCreation, logoutEvidence: l === null ? null : {...l}};
}

export function dActorEvidence(v, phase, method) {
  need(exact(v, ['phase', 'method', 'status', 'complete', 'identityVerified', 'matched', 'startedUtc', 'completedUtc', 'actorCreation'])
    && Object.keys(v).length === (v.actorCreation === undefined ? 8 : 9) && v.phase === phase && v.method === method
    && (v.status === null || Number.isInteger(v.status) && v.status >= 100 && v.status <= 599)
    && typeof v.complete === 'boolean' && typeof v.identityVerified === 'boolean' && v.matched === v.identityVerified
    && timestamp(v.startedUtc) && timestamp(v.completedUtc));
  if (v.actorCreation !== undefined) {
    need(phase === 'ACTOR_CREATE' && typeof v.actorCreation === 'string' && Buffer.byteLength(v.actorCreation) <= 4096);
    const c = JSON.parse(v.actorCreation);
    need(exact(c, ['executionBindingSha256', 'actorId', 'createdByThisRun', 'createdUtc', 'providerReceiptSha256'])
      && Object.keys(c).length === 5 && digest(c.executionBindingSha256) && uuid(c.actorId)
      && c.createdByThisRun === true && timestamp(c.createdUtc) && digest(c.providerReceiptSha256));
  }
  return Object.freeze({...v});
}

function adminCredential(env) {
  need(env.QA_SUPABASE_URL === D_AUTH_ORIGIN);
  const key = env.QA_SUPABASE_SERVICE_ROLE_KEY;
  need(typeof key === 'string' && key.length <= 16384 && key.split('.').length === 3);
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
  // Local claims are a prerequisite, not live permission proof; the parent owns that admission.
  need(claims.ref === 'xcbnxzjlsvtgzixurcof' && claims.role === 'service_role'
    && Number.isFinite(claims.exp) && claims.exp * 1000 > Date.now());
  return key;
}

function openDisplay(payload, environment) {
  need(process.platform === 'win32' && typeof environment.SystemRoot === 'string');
  const executable = path.join(environment.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => environment[k])
    .map(k => [k, environment[k]]));
  const display = spawn(executable, ['-NoProfile', '-NonInteractive', '-STA', '-File', displayFile],
    {env, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore']});
  const done = new Promise((resolve, reject) => {
    display.once('error', () => reject(Error('D_PRIVATE_DISPLAY_UNKNOWN')));
    display.once('close', code => code === 0 ? resolve() : reject(Error('D_PRIVATE_DISPLAY_UNKNOWN')));
  });
  display.stdin.on('error', () => {});
  display.stdin.end(JSON.stringify(payload));
  return {done, stop: () => display.kill('SIGKILL')};
}

// Production fork always runs this fixed module. Injection is limited to the local
// channel/environment in tests; no IPC frame can supply code, fetch or an endpoint.
export function startDProtectedActorChild(channel = process, environment = process.env) {
  let active = null, stopped = false, display = null, createdOnce = false, containedOnce = false, retainedCreation = null;
  const pending = new Map();
  const send = value => new Promise((resolve, reject) => {
    need(Buffer.byteLength(JSON.stringify(value)) <= D_ACTOR_FRAME_BYTES && channel.connected !== false);
    channel.send(value, error => error ? reject(Error('D_CHILD_IPC_UNKNOWN')) : resolve());
  });
  const stop = () => {
    if (stopped) return;
    stopped = true; display?.stop();
    for (const reject of pending.values()) reject(Error('D_CHILD_STOPPED'));
    pending.clear();
    if (channel.connected !== false) {try {channel.disconnect?.();} catch {}}
  };
  const exchange = async (kind, seq, phase, method, evidence) => {
    need(active && !stopped && Date.now() < active.deadline);
    const a = active, token = `${kind}:${seq}`;
    let timer;
    const acknowledgement = new Promise((resolve, reject) => {
      pending.set(token, Object.assign(error => reject(error), {resolve}));
      timer = setTimeout(() => reject(Error('D_CHILD_ACK_UNKNOWN')),
        Math.max(1, Math.min(10000, a.deadline - Date.now())));
    });
    acknowledgement.catch(() => {});
    try {
      await send({v: 1, nonce: a.nonce, id: a.id, type: kind, seq, phase, method,
        executionBindingSha256: a.executionBindingSha256, ...(evidence ? {evidence} : {})});
      need(await acknowledgement === true && !stopped && active === a && Date.now() < a.deadline);
    } finally {clearTimeout(timer);pending.delete(token);}
  };
  const run = async frame => {
    need(!stopped && active === null && frame.v === 1 && uuid(frame.nonce) && uuid(frame.id)
      && exact(frame, ['v', 'nonce', 'id', 'type', 'action', 'payload']) && frame.type === 'RUN');
    const input = dActorPayload(frame.action, frame.payload);
    need(frame.action === 'CREATE' ? !createdOnce && !containedOnce : !containedOnce);
    if (frame.action === 'CONTAIN' && retainedCreation !== null) need(input.actorCreation === retainedCreation);
    if (frame.action === 'CREATE') createdOnce = true; else containedOnce = true;
    const b = frame.action === 'CREATE' ? input : input.binding;
    need(Date.now() < Date.parse(b.deadlineUtc));
    active = {nonce: frame.nonce, id: frame.id, deadline: Date.parse(b.deadlineUtc),
      executionBindingSha256: b.executionBindingSha256, seq: 0};
    let admin, creation = null, actorBinding = null;
    const before = async phase => {
      const entry = D_ACTOR_PHASES[frame.action][active.seq];
      need(entry?.[0] === phase);
      await exchange('GATE', active.seq + 1, phase, entry[1]);return true;
    };
    const after = async (phase, evidence) => {
      const entry = D_ACTOR_PHASES[frame.action][active.seq];
      need(entry?.[0] === phase);
      await exchange('RESPONSE', active.seq + 1, phase, entry[1],
        dActorEvidence({...evidence, matched: evidence.identityVerified}, phase, entry[1]));
      active.seq++;return true;
    };
    try {
      admin = adminCredential(environment);
      if (frame.action === 'CONTAIN') {
        const result = await containDProductionActor({binding: input.binding,
          actorCreationRaw: Buffer.from(input.actorCreation), logoutEvidence: input.logoutEvidence,
          adminKey: admin, beforeDispatch: before, afterResponse: after});
        await send({v: 1, nonce: frame.nonce, id: frame.id, type: 'RESULT', action: frame.action, result});
      } else {
        need(sha(fs.readFileSync(displayFile)) === input.displaySourceSha256);
        need(process.platform === 'win32' && typeof environment.SystemRoot === 'string'
          && fs.statSync(path.join(environment.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')).isFile());
        let password = randomBytes(36).toString('base64url');
        try {
          const call = async (phase, method, actorId) => {
            await before(phase);
            const startedUtc = new Date().toISOString();let status = null, complete = false, identityVerified = false;
            try {
              const response = await fetch(D_AUTH_ORIGIN + '/auth/v1/admin/users' + (actorId ? '/' + actorId : ''), {
                method, redirect: 'error', cache: 'no-store',
                signal: AbortSignal.timeout(Math.max(1, Math.min(10000, active.deadline - Date.now()))),
                headers: {authorization: 'Bearer ' + admin, apikey: admin, 'content-type': 'application/json'},
                ...(method === 'POST' ? {body: JSON.stringify({email: input.controlledAlias, password,
                  email_confirm: true, app_metadata: {role: 'user'}, user_metadata: {qa_namespace: input.namespace}})} : {})});
              status = response.status;need(status === 200 && !response.redirected);
              const chunks = [];let size = 0;
              for await (const chunk of response.body) {size += chunk.length;need(size <= 131072);chunks.push(chunk);}
              const user = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks)));
              complete = true;
              need(uuid(user.id) && (!actorId || user.id === actorId) && user.email === input.controlledAlias
                && timestamp(user.created_at) && user.role === 'authenticated' && timestamp(user.email_confirmed_at)
                && user.user_metadata?.qa_namespace === input.namespace && user.app_metadata?.role === 'user'
                && (!actorBinding || user.created_at === actorBinding.createdAt) && Date.now() < active.deadline);
              identityVerified = true;
              if (method === 'POST') {
                const projection = {actorId: user.id, actorEmail: user.email, createdAt: user.created_at,
                  namespace: input.namespace, role: 'authenticated', ordinaryRole: 'user', emailConfirmed: true};
                creation = JSON.stringify({executionBindingSha256: input.executionBindingSha256, actorId: user.id,
                  createdByThisRun: true, createdUtc: user.created_at, providerReceiptSha256: sha(JSON.stringify(projection))});
                actorBinding = {executionBindingSha256: input.executionBindingSha256, actorId: user.id,
                  actorEmail: user.email, namespace: input.namespace, createdAt: user.created_at,
                  actorCreationReceiptSha256: sha(creation), deadlineUtc: input.deadlineUtc};
                retainedCreation = creation;
              }
              return user;
            } finally {await after(phase, {phase, method, status, complete, identityVerified,
              startedUtc, completedUtc: new Date().toISOString(),
              ...(method === 'POST' && creation ? {actorCreation: creation} : {})});}
          };
          const user = await call('ACTOR_CREATE', 'POST');
          await call('ACTOR_INITIAL_READ', 'GET', user.id);
          display = openDisplay({schemaVersion: 1, purpose: 'D_FIXTURE_ONLY',
            executionBindingSha256: input.executionBindingSha256, email: input.controlledAlias,
            password, deadlineUtc: input.deadlineUtc}, environment);
          password = null;
          await display.done;display = null;
          need(Date.now() < active.deadline && !stopped);
          await send({v: 1, nonce: frame.nonce, id: frame.id, type: 'RESULT', action: frame.action,
            result: {state: 'CREATED', actorCreation: creation, binding: actorBinding,
              independentReadback: true, credentialDisplay: 'CLOSED_LOGIN_NOT_INFERRED', productionAuthority: false}});
        } finally {password = null;display?.stop();display = null;}
      }
    } catch {
      if (!stopped) await send({v: 1, nonce: frame.nonce, id: frame.id, type: 'RESULT', action: frame.action,
        result: {state: 'UNKNOWN', ...(creation && actorBinding ? {actorCreation: creation, binding: actorBinding} : {})}}).catch(() => {});
    } finally {admin = null;active = null;}
  };
  channel.on('disconnect', stop);
  channel.on('message', frame => {
    try {
      need(frame && Buffer.byteLength(JSON.stringify(frame)) <= D_ACTOR_FRAME_BYTES);
      if (frame.type === 'STOP' && exact(frame, ['v', 'type']) && frame.v === 1) {stop();return;}
      if (frame.type === 'ACK') {
        need(active && exact(frame, ['v', 'nonce', 'id', 'type', 'kind', 'seq', 'approved'])
          && frame.v === 1 && frame.nonce === active.nonce && frame.id === active.id
          && typeof frame.approved === 'boolean');
        const waiter = pending.get(`${frame.kind}:${frame.seq}`);need(waiter);waiter.resolve(frame.approved);return;
      }
      if (frame.type === 'RUN') {void run(frame).catch(stop);return;}
      stop();
    } catch {stop();}
  });
  void send({v: 1, type: 'READY'}).catch(stop);
  return Object.freeze({stop});
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (!process.send || !process.connected || process.argv.length !== 2) process.exitCode = 1;
  else startDProtectedActorChild();
}
